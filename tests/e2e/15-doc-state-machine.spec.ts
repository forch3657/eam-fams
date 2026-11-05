import { expect, test } from '@playwright/test'
import { loginViaApi, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, findRoleIdByCode, pickOrgUnit, type TempUser } from './fixtures/data'
import { act, createAsset, createDoc, json, suffix, withApi } from './fixtures/fixedAsset'

/**
 * 单据状态机矩阵与库存不变量。
 *
 * 目的：把「重复提交」「未提交就审批」「撤销后还能审」「已完结还能改」这类
 * 真实用户会踩到的路径全部固定下来。判定口径：
 * - 允许的动作 → 200 + code=0 + 状态迁移到预期值；
 * - 不允许的动作 → 4xx（409/400）+ 状态保持不变；
 * - 库存不变量 → 未完结时 stock 不变、reserved=提交量；完结后 stock 扣减、reserved=0。
 *
 * 覆盖三类单据：低值领用（两级审批 + 预占）、固资派发（两级审批 + 台账联动）、
 * 低值入库（建单即完结 + 库存回补）。
 */

type DocState = 'DRAFT' | 'PROCESSING' | 'REJECTED' | 'DONE' | 'REVOKED'
type Action = 'submit' | 'approve' | 'reject' | 'revoke' | 'delete'
type Expect = 'allow' | 'deny'

const STATES: DocState[] = ['DRAFT', 'PROCESSING', 'REJECTED', 'DONE', 'REVOKED']
const ACTIONS: Action[] = ['submit', 'approve', 'reject', 'revoke', 'delete']

/** 领用/派发共用的状态机：审批流为「部门主管 → 仓管/资产管理员」两级 */
const MATRIX: Record<DocState, Record<Action, Expect>> = {
  DRAFT: { submit: 'allow', approve: 'deny', reject: 'deny', revoke: 'deny', delete: 'allow' },
  PROCESSING: { submit: 'deny', approve: 'allow', reject: 'allow', revoke: 'allow', delete: 'allow' },
  REJECTED: { submit: 'allow', approve: 'deny', reject: 'deny', revoke: 'deny', delete: 'allow' },
  DONE: { submit: 'deny', approve: 'deny', reject: 'deny', revoke: 'deny', delete: 'allow' },
  REVOKED: { submit: 'deny', approve: 'deny', reject: 'deny', revoke: 'deny', delete: 'allow' }
}

/**
 * 固资单据与低值单据的差异：审批中的固资单据禁止直接删除
 * （服务端要求先撤销，避免资产台账与轨迹脱节），低值单据则允许删除并释放预占。
 */
const ALLOC_MATRIX: Record<DocState, Record<Action, Expect>> = {
  ...MATRIX,
  PROCESSING: { ...MATRIX.PROCESSING, delete: 'deny' }
}

let admin: Session
let units: { companyId: string; deptId: string }
const principals = new Map<string, { code: string; session: Session; user: TempUser }>()
const users: TempUser[] = []
const items: string[] = []
const docs: Array<{ collection: string; id: string }> = []
const assets: string[] = []

function principalOf(code: string) {
  const p = principals.get(code)
  if (!p) throw new Error(`角色 ${code} 未初始化`)
  return p
}

test.beforeAll(async () => {
  admin = await loginViaApi()
  units = await pickOrgUnit(admin)
  for (const code of ['ROLE_USER', 'ROLE_LEADER', 'ROLE_WAREHOUSE', 'ROLE_ASSET']) {
    const roleId = await findRoleIdByCode(admin, code)
    const user = await createTempUser(admin, roleId)
    users.push(user)
    const session = await loginViaApi({ username: user.username, password: user.password })
    principals.set(code, { code, session, user })
  }
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    for (const doc of [...docs].reverse()) {
      const collection = doc.collection
      const direct = await api.delete(`/api/${collection}/${doc.id}`)
      if (!direct.ok()) {
        await api
          .post('/api/approvals/action', {
            data: { ctx: { amount: 0, hasDiff: false }, docKey: docKeyOf(collection), docId: doc.id, action: 'revoke' }
          })
          .catch(() => null)
        await api.delete(`/api/${collection}/${doc.id}`).catch(() => null)
      }
    }
    for (const id of assets) await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    for (const id of items) {
      const detail = await api.get(`/api/low-value-items/${id}`)
      if (detail.ok()) {
        const row = ((await detail.json()).data ?? {}) as Record<string, unknown>
        if (Number(row.stock ?? 0) !== 0 || Number(row.reserved ?? 0) !== 0) {
          await api.put(`/api/low-value-items/${id}`, { data: { ...row, stock: 0, reserved: 0 } }).catch(() => null)
        }
      }
      await api.delete(`/api/low-value-items/${id}`).catch(() => null)
    }
  })
  for (const user of users) await cleanupTemp(admin, { userId: user.id }).catch(() => null)
})

function docKeyOf(collection: string): string {
  if (collection.includes('requisition')) return 'requisition'
  if (collection.includes('inbound')) return 'inbound'
  return 'alloc'
}

// ---------------------------------------------------------------- 造数

async function createItem(stock: number): Promise<{ id: string; name: string }> {
  const code = `E2E_LV_${suffix()}`
  const payload = {
    code,
    name: `E2E_物品_${code}`,
    category: 'OFFICE',
    spec: 'E2E',
    unit: '个',
    price: 10,
    stock,
    reserved: 0,
    safetyStock: 0,
    location: 'E2E',
    status: 'NORMAL'
  }
  const created = await withApi(admin.token, async api =>
    json<{ id: string }>(await api.post('/api/low-value-items', { data: payload }), '创建物品')
  )
  items.push(created.id)
  return { id: created.id, name: String(payload.name) }
}

async function stockOf(id: string): Promise<{ stock: number; reserved: number }> {
  return withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(await api.get(`/api/low-value-items/${id}`), '读取物品')
    return { stock: Number(row.stock ?? 0), reserved: Number(row.reserved ?? 0) }
  })
}

async function createRequisition(
  item: { id: string; name: string },
  quantity: number
): Promise<{ id: string; docNo: string }> {
  const user = principalOf('ROLE_USER')
  const docNo = `E2E_PY_${suffix()}`
  const created = await withApi(user.session.token, async api =>
    json<{ id: string }>(
      await api.post('/api/low-value-requisition', {
        data: {
          docNo,
          itemId: item.id,
          itemName: item.name,
          quantity,
          price: 10,
          amount: quantity * 10,
          receiver: user.user.name,
          deptId: units.deptId,
          requisitionDate: '2026-11-02',
          operator: 'E2E',
          remark: 'E2E 状态机',
          status: 'DRAFT',
          creatorId: user.user.id
        }
      }),
      '创建领用单'
    )
  )
  docs.push({ collection: 'low-value-requisition', id: created.id })
  return { id: created.id, docNo }
}

async function statusOf(collection: string, id: string): Promise<string> {
  return withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(await api.get(`/api/${collection}/${id}`), '读取单据')
    return String(row.status)
  })
}

/** 把领用单推进到指定状态 */
async function seedState(state: DocState, item: { id: string; name: string }): Promise<{ id: string; docNo: string }> {
  const doc = await createRequisition(item, 2)
  const user = principalOf('ROLE_USER')
  const leader = principalOf('ROLE_LEADER')
  const warehouse = principalOf('ROLE_WAREHOUSE')

  if (state === 'DRAFT') return doc

  await act(user.session.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  if (state === 'PROCESSING') return doc
  if (state === 'REJECTED') {
    await act(leader.session.token, { docKey: 'requisition', docId: doc.id, action: 'reject', comment: 'E2E 驳回' })
    return doc
  }
  if (state === 'REVOKED') {
    await act(user.session.token, { docKey: 'requisition', docId: doc.id, action: 'revoke' })
    return doc
  }
  await act(leader.session.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  await act(warehouse.session.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  return doc
}

async function runAction(
  action: Action,
  collection: string,
  doc: { id: string; docNo: string },
  creatorToken: string
) {
  if (action === 'delete') {
    return withApi(admin.token, async api => {
      const res = await api.delete(`/api/${collection}/${doc.id}`)
      return { status: res.status(), body: await res.json() }
    })
  }
  // 审批类动作：提交/撤销必须是单据创建人，通过/驳回用第一环节审批人
  const token = action === 'submit' || action === 'revoke'
    ? creatorToken
    : principalOf('ROLE_LEADER').session.token
  return act(token, { docKey: docKeyOf(collection), docId: doc.id, action, comment: 'E2E 状态机' })
}

// ---------------------------------------------------------------- 领用矩阵

test('[P7-01] 低值领用状态机矩阵：非法迁移一律拒绝且状态不变', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const item = await createItem(1000)
  const violations: string[] = []

  for (const state of STATES) {
    for (const action of ACTIONS) {
      const doc = await seedState(state, item)
      const before = await statusOf('low-value-requisition', doc.id)
      const result = await runAction(
        action,
        'low-value-requisition',
        doc,
        principalOf('ROLE_USER').session.token
      )
      const after = await statusOf('low-value-requisition', doc.id).catch(() => 'DELETED')
      const expected = MATRIX[state][action]
      const ok = result.status === 200 && result.body.code === 0

      if (expected === 'allow' && !ok) {
        violations.push(`${state} + ${action}：应允许，实际 HTTP ${result.status} code=${result.body.code} ${result.body.message ?? ''}`)
      }
      if (expected === 'deny' && ok) {
        violations.push(`${state} + ${action}：应拒绝，实际成功（${before} → ${after}）`)
      }
      if (expected === 'deny' && !ok && after !== before) {
        violations.push(`${state} + ${action}：被拒但状态被改动（${before} → ${after}）`)
      }
    }
  }

  await testInfo.attach('state-matrix', {
    body: JSON.stringify({ matrix: MATRIX, violations }, null, 2),
    contentType: 'application/json'
  })
  expect(violations, `领用状态机偏差：\n${violations.join('\n')}`).toEqual([])
})

test('[P7-02] 领用全生命周期库存不变量：提交预占、完结扣减、删除回补', async () => {
  const item = await createItem(10)
  const user = principalOf('ROLE_USER')
  const leader = principalOf('ROLE_LEADER')
  const warehouse = principalOf('ROLE_WAREHOUSE')

  const doc = await createRequisition(item, 3)
  expect(await stockOf(item.id)).toEqual({ stock: 10, reserved: 0 })

  await act(user.session.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  expect(await stockOf(item.id), '提交后只预占，不扣库存').toEqual({ stock: 10, reserved: 3 })

  await act(leader.session.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  expect(await stockOf(item.id), '中间环节不应重复预占').toEqual({ stock: 10, reserved: 3 })

  await act(warehouse.session.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  expect(await statusOf('low-value-requisition', doc.id)).toBe('DONE')
  expect(await stockOf(item.id), '完结后扣减并释放预占').toEqual({ stock: 7, reserved: 0 })

  await withApi(admin.token, async api => {
    expect((await api.delete(`/api/low-value-requisition/${doc.id}`)).status()).toBe(200)
  })
  expect(await stockOf(item.id), '删除已完结单据应回补库存').toEqual({ stock: 10, reserved: 0 })
})

// ---------------------------------------------------------------- 固资派发矩阵

test('[P7-03] 固资派发状态机矩阵：未提交不可审批，完结后不可再流转', async ({}, testInfo) => {
  test.setTimeout(180_000)
  const leader = principalOf('ROLE_LEADER')
  const assetAdmin = principalOf('ROLE_ASSET')
  const violations: string[] = []

  for (const state of STATES) {
    for (const action of ACTIONS) {
      const asset = await createAsset(admin, units, { name: `E2E_派发资产_${suffix()}` })
      assets.push(asset.id)
      const doc = await createDoc(leader.session, units, 'alloc', { assetId: asset.id })
      // 矩阵里的每张单据都要登记到清理数组：否则 afterAll 删不到单据，
      // 资产又因「被单据引用」删不掉，每跑一次全量就留一批 E2E_ 资产
      docs.push({ collection: 'fixed-asset-doc-lists-alloc', id: doc.id })

      if (state !== 'DRAFT') {
        await act(leader.session.token, { docKey: 'alloc', docId: doc.id, action: 'submit' })
      }
      if (state === 'REJECTED') {
        await act(leader.session.token, { docKey: 'alloc', docId: doc.id, action: 'reject', comment: 'E2E 驳回' })
      }
      if (state === 'REVOKED') {
        await act(leader.session.token, { docKey: 'alloc', docId: doc.id, action: 'revoke' })
      }
      if (state === 'DONE') {
        await act(leader.session.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
        await act(assetAdmin.session.token, { docKey: 'alloc', docId: doc.id, action: 'approve' })
      }

      const before = await statusOf('fixed-asset-doc-lists-alloc', doc.id)
      const result = await runAction(
        action,
        'fixed-asset-doc-lists-alloc',
        { id: doc.id, docNo: doc.code },
        leader.session.token
      )
      const after = await statusOf('fixed-asset-doc-lists-alloc', doc.id).catch(() => 'DELETED')
      const expected = ALLOC_MATRIX[state][action]
      const ok = result.status === 200 && result.body.code === 0

      if (expected === 'allow' && !ok) {
        violations.push(`${state} + ${action}：应允许，实际 HTTP ${result.status} code=${result.body.code} ${result.body.message ?? ''}`)
      }
      if (expected === 'deny' && ok) {
        violations.push(`${state} + ${action}：应拒绝，实际成功（${before} → ${after}）`)
      }
      if (expected === 'deny' && !ok && after !== before) {
        violations.push(`${state} + ${action}：被拒但状态被改动（${before} → ${after}）`)
      }
    }
  }

  await testInfo.attach('alloc-state-matrix', {
    body: JSON.stringify({ matrix: ALLOC_MATRIX, violations }, null, 2),
    contentType: 'application/json'
  })
  expect(violations, `派发状态机偏差：\n${violations.join('\n')}`).toEqual([])
})

// ---------------------------------------------------------------- 入库（无审批流）

test('[P7-04] 入库单建单即完结，审批动作不可用，删除回补库存', async () => {
  const item = await createItem(0)
  const warehouse = principalOf('ROLE_WAREHOUSE')
  const docNo = `E2E_RK_${suffix()}`

  const created = await withApi(warehouse.session.token, async api =>
    json<{ id: string }>(
      await api.post('/api/low-value-inbound', {
        data: {
          docNo,
          itemId: item.id,
          itemName: item.name,
          quantity: 5,
          price: 10,
          amount: 50,
          operator: 'E2E',
          warehouse: 'E2E',
          inboundDate: '2026-11-02',
          status: 'DONE',
          creatorId: warehouse.user.id,
          settleTime: new Date().toISOString()
        }
      }),
      '创建入库单'
    )
  )
  docs.push({ collection: 'low-value-inbound', id: created.id })

  expect(await statusOf('low-value-inbound', created.id)).toBe('DONE')
  expect(await stockOf(item.id)).toEqual({ stock: 5, reserved: 0 })

  // 入库单没有审批流：提交/通过都必须被拒绝
  const submit = await act(warehouse.session.token, { docKey: 'inbound', docId: created.id, action: 'submit' })
  expect(submit.status, '入库单不应能提交审批').toBeGreaterThanOrEqual(400)
  const approve = await act(warehouse.session.token, { docKey: 'inbound', docId: created.id, action: 'approve' })
  expect(approve.status, '入库单不应能审批').toBeGreaterThanOrEqual(400)

  await withApi(admin.token, async api => {
    expect((await api.delete(`/api/low-value-inbound/${created.id}`)).status()).toBe(200)
  })
  expect(await stockOf(item.id), '删除入库单应回补库存').toEqual({ stock: 0, reserved: 0 })
})
