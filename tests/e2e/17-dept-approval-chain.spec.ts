//
import { expect, test } from '@playwright/test'
import { loginViaApi, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempUser,
  findRoleIdByCode,
  pickOrgUnit,
  uniqueSuffix,
  type TempUser
} from './fixtures/data'
import { createDoc, deleteDocQuietly } from './fixtures/fixedAsset'
import { apiList, apiPost, withApi, type Row } from './fixtures/p5'

/**
 * P9 纵向审批（部门维度）：
 *
 * - 部门审批环节（DEPT_LEADER）只能由单据归属部门的负责人通过，
 *   其他部门的主管即使持有 ROLE_LEADER 也应 403；
 * - 分管领导环节（DEPT_VP）只能由该部门分管领导通过；
 * - 部门没配负责人时，提交直接被拦下并点名环节，不允许「卡单」。
 *
 * 走接口层断言：界面只做按钮可见性，权限判定必须由服务端裁决。
 */

let admin: Session
let units: { companyId: string; deptId: string }
let otherDeptId: string

const users: TempUser[] = []
const assets: string[] = []
const docs: Array<{ key: string; id: string; code: string }> = []

/** 建角色账号并登录；ROLE_LEADER/ROLE_VP 自动成为所在部门的负责人/分管领导 */
async function principal(roleCode: string, deptId: string) {
  const roleId = await findRoleIdByCode(admin, roleCode)
  const user = await createTempUser(admin, roleId, { deptId })
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, session }
}

async function act(
  session: Session,
  payload: { docKey: string; docId: string; action: string; ctx?: Record<string, unknown>; comment?: string }
) {
  return withApi(session, async api => {
    const res = await api.post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, ...payload }
    })
    return { status: res.status(), body: await res.json() }
  })
}

/** 建资产（决定单据归属部门） */
async function createAsset(deptId: string, userId: string, amount = 1000) {
  const code = `E2E_FA_P9_${uniqueSuffix()}`
  const created = await apiPost<Row>(admin, 'fixed-assets', {
    code,
    name: `E2E_资产_${code}`,
    category: 'ELECTRONIC',
    brand: 'E2E',
    model: 'P9',
    companyId: units.companyId,
    deptId,
    userId,
    location: `E2E_位置_${code}`,
    purchaseDate: '2026-01-15',
    inboundDate: '2026-01-16',
    amount,
    original: amount,
    net: amount,
    status: 'IDLE',
    depreciate: false,
    purchaseMode: 'PURCHASE'
  })
  assets.push(String(created.id))
  return created
}

/** 读取部门行 */
async function deptRow() {
  return withApi(admin, async api => {
    const res = await api.get(`/api/org-departments/${units.deptId}`)
    const body = await res.json()
    return (body.data ?? {}) as Row
  })
}

/** 更新部门审批人 */
async function setDeptApprover(patch: { leaderId?: string; vpId?: string }) {
  const current = await deptRow()
  await withApi(admin, async api => {
    const res = await api.put(`/api/org-departments/${units.deptId}`, {
      data: { ...current, ...patch }
    })
    expect(res.status(), '更新部门审批人失败').toBe(200)
  })
}

test.beforeAll(async () => {
  admin = await loginViaApi()
  units = await pickOrgUnit(admin)
  const depts = await apiList(admin, 'org-departments', `companyId=${encodeURIComponent(units.companyId)}`)
  const other = depts.find(d => d.id !== units.deptId && d.status === 'ENABLED')
  otherDeptId = other?.id || units.deptId
})

test.afterAll(async () => {
  await withApi(admin, async api => {
    for (const doc of [...docs].reverse()) {
      await deleteDocQuietly(api, doc.key, doc.id)
    }
    for (const id of assets) await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
  })
  for (const user of users) await cleanupTemp(admin, { userId: user.id })
})

test('[P9-01] 部门审批只能由单据归属部门的负责人通过，其他部门主管 403', async () => {
  const creator = await principal('ROLE_USER', units.deptId)
  const leader = await principal('ROLE_LEADER', units.deptId)
  const otherLeader = await principal('ROLE_LEADER', otherDeptId)
  const asset = await createAsset(units.deptId, creator.user.id)
  const doc = await createDoc(admin, units, 'alloc', {
    assetId: String(asset.id),
    creatorId: creator.user.id
  })
  docs.push({ key: 'alloc', id: doc.id, code: doc.code })

  const submitted = await act(creator.session, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
  expect(submitted.body.data.status).toBe('PROCESSING')

  // 其他部门的主管：不是本单据的审批人
  const blocked = await act(otherLeader.session, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(blocked.status).toBe(403)
  expect(blocked.body.message).toContain(leader.user.name)

  // 本部门负责人：可以批
  const ok = await act(leader.session, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  expect(ok.body.data.status).toBe('PROCESSING')
})

test('[P9-02] 大额处置的分管领导环节只能由本部门分管领导通过', async () => {
  const creator = await principal('ROLE_USER', units.deptId)
  const leader = await principal('ROLE_LEADER', units.deptId)
  const vp = await principal('ROLE_VP', units.deptId)
  const otherVp = await principal('ROLE_VP', otherDeptId)
  const finance = await principal('ROLE_FINANCE', units.deptId)
  const auditor = await principal('ROLE_AUDITOR', units.deptId)
  const asset = await createAsset(units.deptId, creator.user.id, 250000)
  const doc = await createDoc(admin, units, 'dispose', {
    assetId: String(asset.id),
    creatorId: creator.user.id
  })
  docs.push({ key: 'dispose', id: doc.id, code: doc.code })
  const ctx = { amount: 250000 }

  const submitted = await act(creator.session, { docKey: 'dispose', docId: doc.id, action: 'submit', ctx })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)

  const byLeader = await act(leader.session, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(byLeader.status, JSON.stringify(byLeader.body)).toBe(200)

  const byFinance = await act(finance.session, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(byFinance.status, JSON.stringify(byFinance.body)).toBe(200)

  // 其他部门的分管领导：不是本单据的审批人
  const blocked = await act(otherVp.session, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(blocked.status).toBe(403)
  expect(blocked.body.message).toContain(vp.user.name)

  const byVp = await act(vp.session, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(byVp.status, JSON.stringify(byVp.body)).toBe(200)

  const done = await act(auditor.session, { docKey: 'dispose', docId: doc.id, action: 'approve', ctx })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
  expect(done.body.data.status).toBe('DONE')
})

test('[P9-03] 部门未配置负责人时提交被拦下并点名环节', async () => {
  const creator = await principal('ROLE_USER', units.deptId)
  const leader = await principal('ROLE_LEADER', units.deptId)
  const asset = await createAsset(units.deptId, creator.user.id)
  const doc = await createDoc(admin, units, 'alloc', {
    assetId: String(asset.id),
    creatorId: creator.user.id
  })
  docs.push({ key: 'alloc', id: doc.id, code: doc.code })

  const before = await deptRow()
  await setDeptApprover({ leaderId: '' })
  try {
    const res = await act(creator.session, { docKey: 'alloc', docId: doc.id, action: 'submit' })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('部门负责人')
  } finally {
    await setDeptApprover({ leaderId: String(before.leaderId || leader.user.id) })
  }

  // 配回负责人后即可提交
  const ok = await act(creator.session, { docKey: 'alloc', docId: doc.id, action: 'submit' })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  expect(ok.body.data.status).toBe('PROCESSING')
})

test('[P9-04] 同部门其他主管也不是审批人（只有负责人本人）', async () => {
  const creator = await principal('ROLE_USER', units.deptId)
  const leader = await principal('ROLE_LEADER', units.deptId)
  const otherSameDept = await principal('ROLE_LEADER', units.deptId)
  // 第二个主管创建时会覆盖部门负责人，这里改回真正的负责人
  await setDeptApprover({ leaderId: leader.user.id })

  const asset = await createAsset(units.deptId, creator.user.id)
  const doc = await createDoc(admin, units, 'alloc', {
    assetId: String(asset.id),
    creatorId: creator.user.id
  })
  docs.push({ key: 'alloc', id: doc.id, code: doc.code })

  await act(creator.session, { docKey: 'alloc', docId: doc.id, action: 'submit' })

  const blocked = await act(otherSameDept.session, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(blocked.status).toBe(403)
  expect(blocked.body.message).toContain(leader.user.name)

  const ok = await act(leader.session, { docKey: 'alloc', docId: doc.id, action: 'approve' })
  expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  expect(ok.body.data.status).toBe('PROCESSING')
})

test('[P9-05] 借出归还：台账状态回写、留痕与越权防护', async () => {
  const creator = await principal('ROLE_USER', units.deptId)
  const asset = await createAsset(units.deptId, creator.user.id)
  // 直接造一张已完结的借出单，只验证归还动作本身（审批链由其它用例覆盖）
  const doc = await createDoc(admin, units, 'borrow', {
    assetId: String(asset.id),
    status: 'DONE'
  })
  docs.push({ key: 'borrow', id: doc.id, code: doc.code })

  // 模拟借出审批完结后的台账状态
  await withApi(admin, async api => {
    const current = await api.get(`/api/fixed-assets/${asset.id}`)
    const row = ((await current.json()).data ?? {}) as Row
    const res = await api.put(`/api/fixed-assets/${asset.id}`, { data: { ...row, status: 'BORROWED' } })
    expect(res.status(), '把资产置为借出中失败').toBe(200)
  })

  const readDoc = async () => withApi(admin, async api => {
    const res = await api.get(`/api/fixed-asset-doc-lists-borrow/${doc.id}`)
    return ((await res.json()).data ?? {}) as Row
  })
  const readAsset = async () => withApi(admin, async api => {
    const res = await api.get(`/api/fixed-assets/${asset.id}`)
    return ((await res.json()).data ?? {}) as Row
  })

  // 普通使用人既不是创建人，也不是资产管理员 / 仓管员
  const blocked = await act(creator.session, { docKey: 'borrow', docId: doc.id, action: 'return' })
  expect(blocked.status, JSON.stringify(blocked.body)).toBe(403)

  // 创建人（admin）登记归还：单据保持已完结，台账恢复使用中
  const returned = await act(admin, {
    docKey: 'borrow', docId: doc.id, action: 'return', comment: 'E2E 实物已归还，外观完好'
  })
  expect(returned.status, JSON.stringify(returned.body)).toBe(200)
  expect(returned.body.data.status).toBe('DONE')

  const saved = await readDoc()
  expect(['true', '1']).toContain(String(saved.returned))
  expect(String(saved.returnBy)).toBe(String(admin.user.id))
  expect(String(saved.returnRemark)).toContain('实物已归还')
  expect(String(saved.status), '归还不应推进审批状态').toBe('DONE')
  expect(String((await readAsset()).status)).toBe('IN_USE')

  // 同一张借出单不能重复归还
  const again = await act(admin, { docKey: 'borrow', docId: doc.id, action: 'return' })
  expect(again.status).toBe(409)
})
