import { expect, test, type APIRequestContext } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempUser,
  findRoleIdByCode,
  pickOrgUnit,
  type TempUser
} from './fixtures/data'
import { ADMIN } from './fixtures/env'
import { deleteDocQuietly } from './fixtures/fixedAsset'
import { installGuards } from './fixtures/net'

/**
 * P1 固定资产主流程（第一批）。
 *
 * 覆盖：资产入账（UI + 接口交叉）、编码/必填校验、删除保护、
 * 单据状态机（草稿 → 提交 → 通过/驳回/撤销、越权与重复提交）、
 * 审批轨迹完整性、折旧试算（只读）、盘点计划 CRUD。
 *
 * 第二批（待补）：单据 UI 审批点击流、调拨/维修/处置的多环节与条件环节、
 * 盘点执行与差异、折旧执行（会重写当期数据，需在清空重导前单独安排）。
 *
 * 数据：资产/单据/盘点计划全部 `E2E_` 前缀，afterAll 先单据、轨迹、计划、资产、用户依次清理。
 */
let admin: Session
let orgUnits: { companyId: string; deptId: string }

const assets: string[] = []
const docs: Array<{ key: string; id: string; code: string }> = []
const plans: string[] = []
const users: TempUser[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  orgUnits = await pickOrgUnit(admin)
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    // 单据必须先删：资产删除保护会因为有单据而拒绝；
    // 审批中的单据先撤销再删，轨迹由后端 afterDelete 级联清理。
    for (const doc of docs) {
      await deleteDocQuietly(api, doc.key, doc.id)
    }
    for (const id of plans) {
      await api.delete(`/api/fixed-asset-inventory-plans/${id}`).catch(() => null)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
  })
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

async function withApi<T>(token: string, fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await apiAs(token)
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

async function json<T = any>(res: any, action: string): Promise<T> {
  const body = await res.json()
  if (!res.ok() || body.code !== 0) {
    throw new Error(`${action} 失败 HTTP ${res.status()} code=${body.code} ${body.message ?? ''}`)
  }
  return body.data as T
}

function suffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`
}

/** 直接建一条资产（入账字段取最小值，便于把断言聚焦在状态机上） */
async function createAsset(code = `E2E_FA_${suffix()}`): Promise<{ id: string; code: string }> {
  const created = await withApi(admin.token, async api => {
    const res = await api.post('/api/fixed-assets', {
      data: {
        code,
        name: `E2E_资产_${code}`,
        category: 'ELECTRONIC',
        companyId: orgUnits.companyId,
        deptId: orgUnits.deptId || undefined,
        userId: admin.user.id,
        location: 'E2E_位置',
        purchaseDate: '2026-01-15',
        inboundDate: '2026-01-16',
        amount: 1000,
        original: 1000,
        net: 1000,
        status: 'IDLE',
        depreciate: false,
        purchaseMode: 'PURCHASE'
      }
    })
    return json<{ id: string }>(res, '创建资产')
  })
  assets.push(created.id)
  return { id: created.id, code }
}

/** 建一张草稿单据；bizKey 与集合后缀一致（inbound/alloc/back/...） */
async function createDoc(
  bizKey: string,
  options: { assetId: string; creatorId?: string; code?: string }
): Promise<{ id: string; code: string }> {
  const code = options.code ?? `E2E_DOC_${suffix()}`
  const created = await withApi(admin.token, async api => {
    const res = await api.post(`/api/fixed-asset-doc-lists-${bizKey}`, {
      data: {
        code,
        name: `E2E_单据_${code}`,
        companyId: orgUnits.companyId,
        assetId: options.assetId,
        creatorId: options.creatorId ?? admin.user.id,
        createTime: new Date().toISOString(),
        finishTime: '',
        remark: 'E2E 自动创建，用后删除',
        status: 'DRAFT'
      }
    })
    return json<{ id: string }>(res, '创建单据')
  })
  docs.push({ key: bizKey, id: created.id, code })
  return { id: created.id, code }
}

async function docStatus(bizKey: string, id: string): Promise<string> {
  return withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(await api.get(`/api/fixed-asset-doc-lists-${bizKey}/${id}`), '读取单据')
    return String(row.status)
  })
}

/**
 * 审批动作；在上下文销毁前读完响应体，返回 { status, body }。
 * 直接返回 Response 会因 api.dispose() 变成 "Response has been disposed"。
 */
async function act(
  token: string,
  payload: { docKey: string; docId: string; action: string; comment?: string; ctx?: Record<string, unknown> }
) {
  return withApi(token, async api => {
    const res = await api.post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, ...payload }
    })
    return { status: res.status(), body: await res.json() }
  })
}

/** 取部门主管（R5）账号：DISPATCH 第一环节要求该角色 */
async function createLeaderUser(): Promise<{ user: TempUser; token: string }> {
  const roleId = await findRoleIdByCode(admin, 'ROLE_LEADER')
  const user = await createTempUser(admin, roleId)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, token: session.token }
}

// ---------------------------------------------------------------- 资产台账

test('[P1-01] 页面新增资产后接口与台账一致', async ({ context, page }, testInfo) => {
  const code = `E2E_FA_UI_${suffix()}`
  const name = `E2E_界面资产_${code}`
  const guards = installGuards(page)
  await seedSession(context, await loginViaApi({ username: ADMIN.username, password: ADMIN.password }))

  await page.goto('/fixed-assets')
  await waitSettled(page)
  await page.getByRole('button', { name: /新增资产/ }).first().click()

  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增资产' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-form-item').filter({ hasText: '资产名称' }).locator('input').first().fill(name)
  await dialog.locator('.el-form-item').filter({ hasText: '资产类型' }).locator('.el-select').first().click()
  await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().click()
  await dialog.locator('.el-form-item').filter({ hasText: '资产编号' }).locator('input').first().fill(code)
  const amountInput = dialog.locator('.el-form-item').filter({ hasText: '购置金额' }).locator('input').first()
  await amountInput.fill('1234.56')
  await amountInput.press('Tab')
  const originalInput = dialog.locator('.el-form-item').filter({ hasText: '原值' }).locator('input').first()
  await originalInput.fill('1234.56')
  await originalInput.press('Tab')
  await shot(page, testInfo, 1, '新增资产表单')

  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(page.locator('.el-message')).toContainText(/已新增/)
  await waitSettled(page)
  await expect(page.locator('.el-table').first()).toContainText(code)
  await shot(page, testInfo, 2, '新增后出现在台账')

  const row = await withApi(admin.token, async api => {
    const rows = await json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-assets?pageSize=20&keyword=${encodeURIComponent(code)}`),
      '回查资产'
    )
    return rows.find(r => r.code === code)
  })
  expect(row, '接口应能查到新增资产').toBeTruthy()
  expect(row?.status).toBe('IDLE')
  expect(Number(row?.original)).toBe(1234.56)
  expect(Number(row?.net)).toBe(1234.56)
  if (row?.id) assets.push(String(row.id))
  guards.assertClean()
})

test('[P1-02] 资产编码重复被拒绝', async () => {
  const asset = await createAsset()
  await withApi(admin.token, async api => {
    const res = await api.post('/api/fixed-assets', {
      data: { code: asset.code, name: 'E2E_重复编码', category: 'ELECTRONIC', status: 'IDLE' }
    })
    expect(res.status()).toBe(409)
    const body = await res.json()
    expect(body.code).toBe(409)
    expect(body.message).toMatch(/重复|已存在/)
  })
})

test('[P1-03] 资产必填字段缺失被拒绝', async () => {
  await withApi(admin.token, async api => {
    const res = await api.post('/api/fixed-assets', { data: {} })
    expect(res.status()).toBe(422)
    expect((await res.json()).code).toBe(422)
  })
})

test('[P1-04] 资产列表支持关键字筛选', async () => {
  const asset = await createAsset()
  await withApi(admin.token, async api => {
    const rows = await json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-assets?pageSize=20&keyword=${encodeURIComponent(asset.code)}`),
      '筛选资产'
    )
    expect(rows.length).toBe(1)
    expect(rows[0].code).toBe(asset.code)
  })
})

test('[P1-05] 资产被单据引用时禁止删除', async () => {
  const asset = await createAsset()
  await createDoc('alloc', { assetId: asset.id })
  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/fixed-assets/${asset.id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(1003)
    expect(body.message).toContain('单据')
  })
})

test('[P1-06] 无单据引用的资产可以删除', async () => {
  const asset = await createAsset()
  await withApi(admin.token, async api => {
    const del = await api.delete(`/api/fixed-assets/${asset.id}`)
    expect(del.status()).toBe(200)
    expect((await del.json()).code).toBe(0)
    const detail = await api.get(`/api/fixed-assets/${asset.id}`)
    expect(detail.status()).toBe(404)
  })
})

// ---------------------------------------------------------------- 单据状态机

test('[P1-07] 新建单据默认草稿并在单据面板可见', async ({ context, page }, testInfo) => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const guards = installGuards(page)
  await seedSession(context, admin)
  // dispatch 是外层页签，sub=alloc 定位到「分配」子页签
  await page.goto('/fixed-assets?tab=dispatch&sub=alloc')
  await waitSettled(page)

  // 分配/退库两个列表都渲染在页签里，只操作当前可见的那个
  const docList = page.locator('.doc-list:visible').first()
  await expect(docList).toBeVisible()
  await docList.getByPlaceholder('请输入单据编号').fill(doc.code)
  await docList.getByRole('button', { name: '查询' }).click()
  await waitSettled(page)
  const row = page.locator('.el-table__row').filter({ hasText: doc.code }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('待提交')
  await shot(page, testInfo, 1, '草稿单据在列表可见')
  guards.assertClean()
})

test('[P1-08] 提交后单据进入审批中', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const res = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(res.status).toBe(200)
  expect(res.body.code).toBe(0)
  expect(res.body.data.status).toBe('PROCESSING')
  expect(await docStatus('alloc', doc.id)).toBe('PROCESSING')
})

test('[P1-09] 审批中的单据不能重复提交', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const res = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(res.status).toBe(409)
  expect(res.body.message).toContain('草稿或已驳回')
})

test('[P1-10] 驳回必须填写意见', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const res = await act(leader.token, { docKey: 'alloc', docId: doc.id, action: 'reject' })
  expect(res.status).toBe(422)
  expect(res.body.message).toContain('意见')
})

test('[P1-11] 驳回后状态回退且可再次提交', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const rejected = await act(leader.token, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'reject',
    comment: 'E2E 测试驳回'
  })
  expect(rejected.status).toBe(200)
  expect(rejected.body.data.status).toBe('REJECTED')

  const again = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(again.status).toBe(200)
  expect(again.body.data.status).toBe('PROCESSING')
})

test('[P1-12] 撤销后单据不可再审批', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const revoked = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'revoke' })
  expect(revoked.status).toBe(200)
  expect(revoked.body.data.status).toBe('REVOKED')

  const approve = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(approve.status).toBe(409)
  expect(approve.body.message).toContain('审批中')
})

test('[P1-13] 非创建人且非发起角色不能提交单据', async () => {
  const asset = await createAsset()
  const leader = await createLeaderUser()
  // 创建人是 admin；派发流程的发起角色是资产管理员（R2），部门主管两者都不满足
  const doc = await createDoc('alloc', { assetId: asset.id, creatorId: admin.user.id })

  const res = await act(leader.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(res.status).toBe(403)
  expect(res.body.message).toContain('创建人')
})

test('[P1-14] 非当前环节审批角色不能审批', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  // 第一步要求部门主管（R5），admin 只有系统管理员 / 资产管理员角色
  const res = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(res.status).toBe(403)
  expect(res.body.message).toContain('使用部门确认')
})

test('[P1-15] 全流程通过后单据完结且审批轨迹完整', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  const leader = await createLeaderUser()

  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  const first = await act(leader.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(first.body.data.status).toBe('PROCESSING')

  const second = await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  const body = second.body
  expect(body.data.status).toBe('DONE')
  expect(await docStatus('alloc', doc.id)).toBe('DONE')

  await withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(
      await api.get(`/api/fixed-asset-doc-lists-alloc/${doc.id}`),
      '读取完结单据'
    )
    expect(String(row.finishTime ?? '')).not.toBe('')

    const trails = await json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-asset-doc-approvals?pageSize=100&keyword=${encodeURIComponent(doc.code)}`),
      '读取审批轨迹'
    )
    const mine = trails.filter(t => t.docId === doc.id)
    expect(mine.length, '提交 + 两个环节各一条轨迹').toBeGreaterThanOrEqual(3)
    expect(mine.map(t => t.result)).toEqual(expect.arrayContaining(['SUBMIT', 'AGREE']))
    expect(mine.map(t => t.stepName)).toEqual(expect.arrayContaining(['使用部门确认', '资产管理员登记']))
  })
})

/**
 * P1-D1（2026-11-02 修复）：GenericService 对 fixed-asset-doc-lists-* 增加状态守卫，
 * 审批中（PROCESSING）的 PUT/DELETE 一律 409；审批动作走 updateQuietly 不受影响。
 */
test('[P1-16] 审批中的单据应禁止修改与删除', async () => {
  const asset = await createAsset()
  const doc = await createDoc('alloc', { assetId: asset.id })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  await withApi(admin.token, async api => {
    const put = await api.put(`/api/fixed-asset-doc-lists-alloc/${doc.id}`, {
      data: { id: doc.id, status: 'REVOKED' }
    })
    expect(put.status()).toBe(409)

    const del = await api.delete(`/api/fixed-asset-doc-lists-alloc/${doc.id}`)
    expect(del.status()).toBe(409)
  })
})

// ---------------------------------------------------------------- 折旧与盘点

test('[P1-17] 折旧试算只读且两次结果一致', async () => {
  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  await withApi(admin.token, async api => {
    const first = await json<Record<string, unknown>>(
      await api.post('/api/depreciation/preview', { data: { period } }),
      '折旧试算'
    )
    // 试算落库与否用「再算一次结果相同」间接验证：若第一次写了库，第二次会读到被改写的输入
    const second = await json<Record<string, unknown>>(
      await api.post('/api/depreciation/preview', { data: { period } }),
      '折旧试算复算'
    )
    expect(second.periodDepreciation).toBe(first.periodDepreciation)
    expect(Number(first.periodDepreciation)).toBeGreaterThan(0)
  })
})

test('[P1-18] 无折旧权限不能试算', async () => {
  const roleId = await findRoleIdByCode(admin, 'ROLE_USER')
  const user = await createTempUser(admin, roleId)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })

  const res = await withApi(session.token, async api => {
    const r = await api.post('/api/depreciation/preview', { data: { period: '2026-10' } })
    return { status: r.status(), body: await r.json() }
  })
  expect(res.status).toBe(403)
  expect(res.body.code).toBe(403)
})

test('[P1-19] 盘点计划可创建并可删除', async () => {
  const planNo = `E2E_PD_${suffix()}`
  await withApi(admin.token, async api => {
    const created = await json<{ id: string }>(
      await api.post('/api/fixed-asset-inventory-plans', {
        data: {
          planNo,
          planName: `E2E_盘点计划_${planNo}`,
          scope: '全部资产',
          counter: 'E2E',
          planDate: '2026-10-30',
          status: 'DRAFT',
          items: []
        }
      }),
      '创建盘点计划'
    )
    plans.push(created.id)

    const del = await api.delete(`/api/fixed-asset-inventory-plans/${created.id}`)
    expect(del.status()).toBe(200)
    expect((await del.json()).code).toBe(0)
    plans.pop()
  })
})
