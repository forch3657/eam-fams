import { expect, test } from '@playwright/test'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, findRoleIdByCode, pickOrgUnit, type TempUser } from './fixtures/data'
import {
  act,
  createAsset,
  createDoc,
  createInventoryDoc,
  deleteDocQuietly,
  docStatus,
  json,
  withApi,
  type OrgUnits
} from './fixtures/fixedAsset'

/**
 * P1 固定资产第二批：其余单据类型与条件环节、盘点执行、折旧执行。
 *
 * 流程来自生产配置（固定资产目标口径 2026-11-09）：
 * - 借出 BORROW / 变更 CHANGE：R5 部门主管 → R2 资产管理员
 * - 退库 RETURN：R5 → R8 仓管，完结后资产回空闲并清空使用人
 * - 维修 REPAIR：提交即 REPAIRING；R5 → R2，金额 > 5 万加 R7，末环节「修毕验收」回 IN_USE
 * - 处置 DISPOSE：R5；报废按金额加 R4/R7/R6，变卖/捐赠/转让强制 R4 + R6
 * - 盘点 INVENTORY：R2 确认，有差异加 R2 复核 + R6 审计
 * - 折旧 run：同 period 先清后写（幂等）
 *
 * 固定资产单据提交时服务端会校验资产状态前置，相关用例显式建「使用中」资产。
 */
let admin: Session
let units: OrgUnits

const assets: string[] = []
const docs: Array<{ key: string; id: string; code: string }> = []
const inventoryDocs: Array<{ id: string; docNo: string }> = []
const users: TempUser[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  units = await pickOrgUnit(admin)
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    for (const doc of docs) {
      await deleteDocQuietly(api, doc.key, doc.id)
    }
    for (const doc of inventoryDocs) {
      await api.delete(`/api/fixed-asset-inventory-docs/${doc.id}`).catch(() => null)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
  })
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

async function userWithRole(roleCode: string): Promise<{ user: TempUser; token: string }> {
  const roleId = await findRoleIdByCode(admin, roleCode)
  const user = await createTempUser(admin, roleId)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, token: session.token }
}

async function trackAsset(overrides: Record<string, unknown> = {}) {
  const asset = await createAsset(admin, units, overrides)
  assets.push(asset.id)
  return asset
}

async function trackDoc(bizKey: string, assetId: string, options: Record<string, unknown> = {}) {
  const doc = await createDoc(admin, units, bizKey, { assetId, ...options })
  docs.push({ key: bizKey, id: doc.id, code: doc.code })
  return doc
}

async function trailsOf(docCode: string) {
  return withApi(admin.token, async api =>
    json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-asset-doc-approvals?pageSize=200&keyword=${encodeURIComponent(docCode)}`),
      '读取审批轨迹'
    )
  )
}

// ---------------------------------------------------------------- 单据联动（已知缺口）

/**
 * P1-D2（2026-11-02 修复）：派发审批通过后回写台账。
 * 派发单契约暂无独立使用人字段，使用人按单据创建人（申请人）落账。
 */
test('[P1-20] 派发通过后资产使用人随单据更新', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset()
  const doc = await trackDoc('alloc', asset.id)
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  await act(leader.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  await act(admin.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })

  await withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(await api.get(`/api/fixed-assets/${asset.id}`), '读取资产')
    // 派发单当前无独立使用人字段，按创建人（admin）落账
    expect(row.userId).toBe(admin.user.id)
    expect(row.status).toBe('IN_USE')
  })
})

// ---------------------------------------------------------------- 借出 / 变更 / 退库

test('[P1-21] 借出单走完部门主管与资产管理员两环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset({ status: 'IN_USE' })
  const doc = await trackDoc('borrow', asset.id)

  await act(admin.token, { docKey: 'borrow', docId: doc.id, action: 'submit' })
  const first = await act(leader.token, { docKey: 'borrow', docId: doc.id, action: 'approve' })
  expect(first.body.data.status).toBe('PROCESSING')
  const second = await act(admin.token, { docKey: 'borrow', docId: doc.id, action: 'approve' })
  expect(second.body.data.status).toBe('DONE')
  expect(await docStatus(admin, 'borrow', doc.id)).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.map(t => t.stepName)).toEqual(expect.arrayContaining(['部门主管审批', '资产管理员审核']))
})

test('[P1-22] 变更单留痕：两环节轨迹完整', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset()
  const doc = await trackDoc('change', asset.id, { remark: 'E2E 部门/位置变更' })

  await act(admin.token, { docKey: 'change', docId: doc.id, action: 'submit' })
  await act(leader.token, { docKey: 'change', docId: doc.id, action: 'approve' })
  const done = await act(admin.token, { docKey: 'change', docId: doc.id, action: 'approve' })
  expect(done.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.length).toBeGreaterThanOrEqual(3)
  // 提交轨迹只记 result=SUBMIT，不带环节名；环节名只出现在审批记录上
  expect(trails.filter(t => t.result === 'SUBMIT')).toHaveLength(1)
  expect(trails.map(t => t.stepName)).toEqual(
    expect.arrayContaining(['调出部门主管审批', '资产管理员确认'])
  )
  expect(trails.filter(t => t.result === 'AGREE')).toHaveLength(2)
})

test('[P1-23] 退库单走完部门主管与仓管两环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const warehouse = await userWithRole('ROLE_WAREHOUSE')
  const asset = await trackAsset({ status: 'IN_USE' })
  const doc = await trackDoc('back', asset.id)

  await act(admin.token, { docKey: 'back', docId: doc.id, action: 'submit' })
  const first = await act(leader.token, { docKey: 'back', docId: doc.id, action: 'approve' })
  expect(first.body.data.status).toBe('PROCESSING')
  const second = await act(warehouse.token, { docKey: 'back', docId: doc.id, action: 'approve' })
  expect(second.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.map(t => t.stepName)).toEqual(
    expect.arrayContaining(['部门主管确认', '仓管员验收入库'])
  )
})

// ---------------------------------------------------------------- 并发版本

test('[P1-24] 并发修改资产返回 409 版本冲突', async () => {
  const asset = await trackAsset({ name: 'E2E_并发版本' })
  await withApi(admin.token, async api => {
    const current = await json<Record<string, unknown>>(await api.get(`/api/fixed-assets/${asset.id}`), '读取资产')
    const baseVersion = Number(current.version ?? 0)

    const stale = await api.put(`/api/fixed-assets/${asset.id}`, {
      data: { ...current, name: 'E2E_过期版本改名', version: baseVersion - 1 }
    })
    expect(stale.status()).toBe(409)
    expect((await stale.json()).message).toContain('已被他人修改')

    const ok = await api.put(`/api/fixed-assets/${asset.id}`, {
      data: { ...current, name: 'E2E_正常改名', version: baseVersion }
    })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).code).toBe(0)
  })
})

// ---------------------------------------------------------------- 条件环节

test('[P1-25] 维修金额未超阈值走主管、资产管理员与修毕验收三环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset({ status: 'IN_USE' })
  const doc = await trackDoc('repair', asset.id)
  const ctx = { amount: 0 }

  await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'submit', ctx })
  const s1 = await act(leader.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  expect(s1.body.data.status).toBe('PROCESSING')
  const s2 = await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  expect(s2.body.data.status, '大额环节未触发，但修毕验收仍须执行').toBe('PROCESSING')
  const done = await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  expect(done.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.map(t => t.stepName)).toContain('修毕验收')
})

test('[P1-26] 维修金额超 5 万触发分管副总环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset({ status: 'IN_USE' })
  const doc = await trackDoc('repair', asset.id)
  const ctx = { amount: 60000 }

  await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'submit', ctx })
  await act(leader.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  const second = await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  // 前两环节过后仍在审批中，第三环节要求分管副总（R7）
  expect(second.body.data.status).toBe('PROCESSING')

  const third = await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  expect(third.status).toBe(403)
  expect(third.body.message).toContain('分管副总')
  expect(await docStatus(admin, 'repair', doc.id)).toBe('PROCESSING')
})

test('[P1-27] 处置金额未超阈值只走部门主管', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset()
  const doc = await trackDoc('dispose', asset.id)
  const ctx = { amount: 0 }

  await act(admin.token, { docKey: 'dispose', docId: doc.id, action: 'submit', ctx })
  const done = await act(leader.token, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(done.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.filter(t => t.result === 'AGREE')).toHaveLength(1)
})

test('[P1-28] 处置金额超 5 万触发财务复核环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const finance = await userWithRole('ROLE_FINANCE')
  const asset = await trackAsset()
  const doc = await trackDoc('dispose', asset.id)
  const ctx = { amount: 60000 }

  await act(admin.token, { docKey: 'dispose', docId: doc.id, action: 'submit', ctx })
  const first = await act(leader.token, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(first.body.data.status).toBe('PROCESSING')

  const blocked = await act(admin.token, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(blocked.status).toBe(403)
  expect(blocked.body.message).toContain('财务管理员复核')

  const done = await act(finance.token, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(done.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.code)).filter(t => t.docId === doc.id)
  expect(trails.map(t => t.stepName)).toEqual(
    expect.arrayContaining(['部门主管审批', '财务管理员复核'])
  )
})

// ---------------------------------------------------------------- 盘点执行

test('[P1-29] 盘点无差异只需资产管理员确认', async () => {
  const doc = await createInventoryDoc(admin, units)
  inventoryDocs.push(doc)

  await act(admin.token, { docKey: 'inventory', docId: doc.id, action: 'submit', ctx: { hasDiff: false } })
  const done = await act(admin.token, {
    docKey: 'inventory',
    docId: doc.id,
    action: 'approve',
    ctx: { hasDiff: false }
  })
  expect(done.body.data.status).toBe('DONE')

  await withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(
      await api.get(`/api/fixed-asset-inventory-docs/${doc.id}`),
      '读取盘点单'
    )
    expect(String(row.status)).toBe('DONE')
    expect(String(row.finishTime ?? '')).not.toBe('')
  })
})

test('[P1-30] 盘点有差异追加复核与审计环节', async () => {
  const auditor = await userWithRole('ROLE_AUDITOR')
  // 差异由服务端按盘点明细重算（P10-D4），客户端 ctx.hasDiff 已不再生效：
  // 必须登记一条真实差异明细才能触发「差异复核 / 审计抽查」条件环节。
  // 异常明细还必须选去向（P10-D14）；这里用「已说明」，只触发条件环节、
  // 不派生维修/变更单、不改台账，本用例聚焦审批链而非结论落地。
  const doc = await createInventoryDoc(admin, units, {
    items: [{
      assetId: '',
      assetNo: 'E2E_P1_30',
      assetName: 'E2E 盘点差异明细',
      itemStatus: 'ABNORMAL',
      result: 'ABNORMAL',
      disposal: 'EXPLAINED',
      remark: 'E2E 盘点差异（已说明，不派生单据）'
    }]
  })
  inventoryDocs.push(doc)
  const ctx = { hasDiff: true }

  await act(admin.token, { docKey: 'inventory', docId: doc.id, action: 'submit', ctx })
  const s1 = await act(admin.token, { docKey: 'inventory', docId: doc.id, action: 'approve', ctx })
  expect(s1.body.data.status).toBe('PROCESSING')

  const s2 = await act(admin.token, { docKey: 'inventory', docId: doc.id, action: 'approve', ctx })
  expect(s2.body.data.status).toBe('PROCESSING')

  const blocked = await act(admin.token, { docKey: 'inventory', docId: doc.id, action: 'approve', ctx })
  expect(blocked.status).toBe(403)
  expect(blocked.body.message).toContain('审计')

  const done = await act(auditor.token, { docKey: 'inventory', docId: doc.id, action: 'approve', ctx })
  expect(done.body.data.status).toBe('DONE')

  const trails = (await trailsOf(doc.docNo)).filter(t => t.docId === doc.id)
  expect(trails.map(t => t.stepName)).toEqual(
    expect.arrayContaining(['盘点结果确认', '盘点差异复核', '审计抽查确认'])
  )
})

// ---------------------------------------------------------------- 折旧执行

test('[P1-31] 折旧执行同期间幂等，且与试算/台账一致', async () => {
  const now = new Date()
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  await withApi(admin.token, async api => {
    const preview = await json<Record<string, unknown>>(
      await api.post('/api/depreciation/preview', { data: { period } }),
      '折旧试算'
    )
    const run1 = await json<Record<string, unknown>>(
      await api.post('/api/depreciation/run', { data: { period } }),
      '首次计提'
    )
    const run2 = await json<Record<string, unknown>>(
      await api.post('/api/depreciation/run', { data: { period } }),
      '重复计提'
    )

    expect(Number(run1.periodDepreciation)).toBe(Number(preview.periodDepreciation))
    expect(Number(run2.periodDepreciation)).toBe(Number(run1.periodDepreciation))
    expect(Number(run1.periodDepreciation)).toBeGreaterThan(0)
    expect(Number(run1.assetCount)).toBeGreaterThan(0)

    const plan = await json<Record<string, unknown>>(
      await api.get(`/api/depreciation/plan?month=${period}`),
      '读取折旧台账'
    )
    expect(Number(plan.periodDepreciation)).toBe(Number(run1.periodDepreciation))
    expect(Array.isArray(plan.rows)).toBe(true)
  })
})

/**
 * 期初导入的存量资产：状态 IN_USE、无 sourceTag、无入库/派发/借出等前置单据。
 * 服务端只校验资产状态与审批互斥，不得因「没有历史单据」把台账挡在业务之外。
 */
test('[P1-33] 期初形态资产（无前置单据、无来源标记）可提交退库单与维修单', async () => {
  const backAsset = await trackAsset({ status: 'IN_USE' })
  const repairAsset = await trackAsset({ status: 'IN_USE' })

  // 普通退库单：不带 borrowDocId，不应要求先有历史借出单
  const back = await trackDoc('back', backAsset.id)
  const backRes = await act(admin.token, { docKey: 'back', docId: back.id, action: 'submit' })
  expect(backRes.status, JSON.stringify(backRes.body)).toBe(200)

  // 维修单：提交后资产进入维修中，修毕验收后回使用中
  const repair = await trackDoc('repair', repairAsset.id)
  const repairRes = await act(admin.token, { docKey: 'repair', docId: repair.id, action: 'submit' })
  expect(repairRes.status, JSON.stringify(repairRes.body)).toBe(200)

  const after = await withApi(admin.token, async api => {
    const res = await api.get(`/api/fixed-assets/${repairAsset.id}`)
    return (await res.json()).data as Record<string, unknown>
  })
  expect(String(after.status)).toBe('REPAIRING')
})

/**
 * 台账行级入口：从资产直接发起退库，验证两件事——
 * 1) 期初形态资产有可见入口且新增弹窗预选资产；
 * 2) 子签切换后单据落在 back 集合（旧实现复用组件导致写进 alloc 集合）。
 */
test('[P1-34] 资产台账行级入口：期初资产可直接发起退库且单据落在退库集合', async ({ context, page }) => {
  await seedSession(context, await loginViaApi())
  const asset = await trackAsset({ status: 'IN_USE' })
  await page.goto('/fixed-assets?tab=asset')
  await page.getByPlaceholder('资产编号/资产名称').fill(asset.code)
  await page.getByRole('button', { name: '查询' }).click()

  const row = page.locator('tr').filter({ hasText: asset.code }).last()
  await row.getByRole('button', { name: /发起业务/ }).click()
  await page.locator('.el-dropdown-menu__item').filter({ hasText: '退库' }).first().click()

  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(new RegExp(asset.code))).toBeVisible()

  const docName = `E2E_台账发起退库_${asset.code}`
  await dialog.getByPlaceholder('请输入单据名称').fill(docName)
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(dialog).toBeHidden()

  const created = await withApi(admin.token, async api => {
    const res = await api.get('/api/fixed-asset-doc-lists-back')
    const body = await res.json()
    return (body.data || []).find(d => d.name === docName) as Record<string, unknown> | undefined
  })
  expect(created, '退库单必须落在 back 集合，不能被复用的 alloc 集合吞掉').toBeTruthy()
  expect(String(created!.assetId)).toBe(asset.id)
  docs.push({ key: 'back', id: String(created!.id), code: String(created!.code) })

  const leakedToAlloc = await withApi(admin.token, async api => {
    const res = await api.get('/api/fixed-asset-doc-lists-alloc')
    const body = await res.json()
    return (body.data || []).some(d => d.name === docName)
  })
  expect(leakedToAlloc, '子签切换不应把退库单写进派发单集合').toBe(false)
})

/** 构造一张 DRAFT 固资单据；creatorId 故意可传他人，用于验证服务端强制改写 */
async function postDocAs(token: string, bizKey: string, assetId: string, code: string, creatorId: string) {
  return withApi(token, async api => {
    const res = await api.post(`/api/fixed-asset-doc-lists-${bizKey}`, {
      data: {
        code, name: `E2E_${code}`, companyId: units.companyId,
        assetId, creatorId, createTime: new Date().toISOString(),
        finishTime: '', remark: 'E2E 台账使用人本人授权', status: 'DRAFT'
      }
    })
    return { status: res.status(), body: await res.json() }
  })
}

/**
 * 用户裁决：台账登记的资产使用人本来就该发起相关流程，与角色是否持有 fa:* 权限码无关。
 * R5 部门主管没有任何固资发起权限码，但只要资产 userId 指向本人即可发起 WF3/4/6/7 四类单据。
 */
test('[P1-35] 台账使用人本人授权：无固资权限码也能发起自己名下资产的业务', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const tag = Date.now().toString(36)
  const mine = await trackAsset({ status: 'IN_USE', userId: leader.user.id })
  const others = await trackAsset({ status: 'IN_USE', userId: admin.user.id })

  // 四类由资产使用人发起的单据：放行；且服务端把伪造的 creatorId 改写为登录人
  for (const key of ['back', 'borrow', 'repair', 'change']) {
    const res = await postDocAs(leader.token, key, mine.id, `E2E_OWNER_${key}_${tag}`, admin.user.id)
    expect(res.status, `${key} 应放行：${JSON.stringify(res.body)}`).toBe(200)
    expect(String(res.body.data.creatorId), 'creatorId 必须以登录人为准').toBe(leader.user.id)
    docs.push({ key, id: String(res.body.data.id), code: String(res.body.data.code) })
  }

  // 别人名下资产不放行
  const foreign = await postDocAs(leader.token, 'back', others.id, `E2E_FOREIGN_${tag}`, leader.user.id)
  expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)

  // 入库 / 派发 / 调拨 / 处置由资产管理员发起，使用人不能越权
  for (const key of ['inbound', 'alloc', 'transfer', 'dispose']) {
    const res = await postDocAs(leader.token, key, mine.id, `E2E_DENY_${key}_${tag}`, leader.user.id)
    expect(res.status, `${key} 不应放行`).toBe(403)
  }
})

test('[P1-36] 台账使用人本人授权边界：只维护本人单据，可正常提交审批', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const tag = Date.now().toString(36)
  const mine = await trackAsset({ status: 'IN_USE', userId: leader.user.id })

  const own = await postDocAs(leader.token, 'back', mine.id, `E2E_OWN_SUBMIT_${tag}`, leader.user.id)
  expect(own.status, JSON.stringify(own.body)).toBe(200)
  const ownId = String(own.body.data.id)
  docs.push({ key: 'back', id: ownId, code: String(own.body.data.code) })

  // 资产挂在本人名下、但单据由管理员创建：使用人不得改删
  const adminDoc = await createDoc(admin, units, 'back', { assetId: mine.id })
  docs.push({ key: 'back', id: adminDoc.id, code: adminDoc.code })
  const putOther = await withApi(leader.token, async api => {
    const res = await api.put(`/api/fixed-asset-doc-lists-back/${adminDoc.id}`, {
      data: { ...(await (await api.get(`/api/fixed-asset-doc-lists-back/${adminDoc.id}`)).json()).data, remark: '越权修改' }
    })
    return res.status()
  })
  expect(putOther).toBe(403)
  const delOther = await withApi(leader.token, async api =>
    (await api.delete(`/api/fixed-asset-doc-lists-back/${adminDoc.id}`)).status())
  expect(delOther).toBe(403)

  // 本人单据可提交审批，且审批链能正常解析
  const submitted = await act(leader.token, { docKey: 'back', docId: ownId, action: 'submit' })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)

  // 撤回成可删除状态，避免把 PROCESSING 单据留给 afterAll（审批中单据禁止删除，会连带残留资产与账号）
  const revoked = await act(leader.token, { docKey: 'back', docId: ownId, action: 'revoke' })
  expect(revoked.status, JSON.stringify(revoked.body)).toBe(200)
})

test('[P1-37] 台账使用人本人：页面有行级入口，资产下拉只列自己名下资产', async ({ context, page }) => {
  const leader = await userWithRole('ROLE_LEADER')
  const mine = await trackAsset({ status: 'IN_USE', userId: leader.user.id })
  const others = await trackAsset({ status: 'IN_USE', userId: admin.user.id })
  const session = await loginViaApi({ username: leader.user.username, password: leader.user.password })
  await seedSession(context, session)

  await page.goto('/fixed-assets?tab=asset')
  await page.getByPlaceholder('资产编号/资产名称').fill(mine.code)
  await page.getByRole('button', { name: '查询' }).click()
  const row = page.locator('tr').filter({ hasText: mine.code }).last()
  await expect(row.getByRole('button', { name: /发起业务/ }), '本人名下资产应有业务入口').toBeVisible()
  await row.getByRole('button', { name: /发起业务/ }).click()
  await page.locator('.el-dropdown-menu__item').filter({ hasText: '退库' }).first().click()

  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(new RegExp(mine.code))).toBeVisible()
  // 资产已预选，placeholder 不再显示；从「关联资产」表单项点开下拉
  await dialog.locator('.el-form-item').filter({ hasText: '关联资产' }).locator('.el-select').click()
  await expect(page.locator('.el-select-dropdown__item').filter({ hasText: others.code }),
    '不能选到别人名下资产').toHaveCount(0)
})
