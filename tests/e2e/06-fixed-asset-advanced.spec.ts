import { expect, test } from '@playwright/test'
import { loginViaApi, type Session } from './fixtures/auth'
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
 * 流程来自生产配置：
 * - 借出 BORROW / 变更 CHANGE：R5 部门主管 → R2 资产管理员
 * - 退库 RETURN：R5 → R8 仓管（另见 P1-D2 联动缺口）
 * - 维修 REPAIR：R5 → R2，金额 > 5 万加 R7 分管副总
 * - 处置 DISPOSE：R5，金额 > 5 万加 R4 财务，> 20 万再加 R7/R6
 * - 盘点 INVENTORY：R2 确认，有差异加 R2 复核 + R6 审计
 * - 折旧 run：同 period 先清后写（幂等）
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
  const asset = await trackAsset()
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
  const asset = await trackAsset()
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

test('[P1-25] 维修金额未超阈值只走两环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset()
  const doc = await trackDoc('repair', asset.id)
  const ctx = { amount: 0 }

  await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'submit', ctx })
  await act(leader.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  const done = await act(admin.token, { docKey: 'repair', docId: doc.id, action: 'approve', ctx })
  expect(done.body.data.status).toBe('DONE')
})

test('[P1-26] 维修金额超 5 万触发分管副总环节', async () => {
  const leader = await userWithRole('ROLE_LEADER')
  const asset = await trackAsset()
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
  const doc = await createInventoryDoc(admin, units)
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
