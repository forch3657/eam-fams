import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, findRoleIdByCode, pickOrgUnit, type TempUser } from './fixtures/data'
import { installGuards } from './fixtures/net'
import { act, json, suffix, withApi } from './fixtures/fixedAsset'

/**
 * P2 低值资产主流程。
 *
 * 库存语义（契约声明式 stock 配置）：
 * - 入库：DONE 时 stock += quantity（建单即 DONE 时立即回补）；
 * - 领用：DRAFT 不动 → PROCESSING 预占 reserved → DONE 扣 stock 并释放预占；
 *   驳回/撤销释放预占；命中 `stock - reserved < quantity` 报 1001。
 * - 退库：DONE 时 stock += quantity；可退额度 = DONE 领用 − DONE 退库 − PROCESSING 退库，超出报 1006。
 * - 删除：按单据状态反向回退；物品有库存/预占或任何单据引用时禁止删除。
 *
 * 审批流程：领用 REQUISITION / 退库 LV_RETURN 均为 R5 部门主管 → R8 仓管员，
 * 发起角色是 R3 资产使用人（admin 不能提交这两类单据）。
 */
let admin: Session
let user3: { user: TempUser; token: string }
/** 纵向审批：低值单据按 deptId 找部门负责人，临时「部门主管」会被绑定为该部门负责人 */
let lvDeptId = ''

const items: string[] = []
const docs: Array<{ collection: string; id: string; docNo: string }> = []
const users: TempUser[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  // 单据归属部门 = deptId；部门负责人由临时「部门主管」账号担任（fixtures 自动绑定），
  // 因此发起人与单据部门必须与负责人同一个部门，否则提交会被「没有可用的审批人」拦下。
  lvDeptId = (await pickOrgUnit(admin)).deptId
  const roleId = await findRoleIdByCode(admin, 'ROLE_USER')
  const user = await createTempUser(admin, roleId, { deptId: lvDeptId })
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  user3 = { user, token: session.token }
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    // 先删领用/退库（回补/扣回），再删入库，避免库存先被扣成负数
    const ordered = [...docs].sort((a, b) => rank(a.collection) - rank(b.collection))
    for (const doc of ordered) {
      await api.delete(`/api/${doc.collection}/${doc.id}`).catch(() => null)
    }
    for (const doc of ordered) {
      // 低值单据与固资单据共用同一张审批轨迹表
      const res = await api.get(`/api/fixed-asset-doc-approvals?pageSize=500&keyword=${encodeURIComponent(doc.docNo)}`)
      if (!res.ok()) continue
      const rows = ((await res.json()).data ?? []) as Array<Record<string, unknown>>
      for (const row of rows) {
        await api.delete(`/api/fixed-asset-doc-approvals/${row.id}`).catch(() => null)
      }
    }
    for (const id of items) {
      // 用例里故意造了在库/预占数据，直接删会被 1003 拦截；
      // 先把库存与预占清零（仅限自己建的 E2E_ 物品），再删。
      const detail = await api.get(`/api/low-value-items/${id}`)
      if (detail.ok()) {
        const row = ((await detail.json()).data ?? {}) as Record<string, unknown>
        if (Number(row.stock ?? 0) > 0 || Number(row.reserved ?? 0) > 0) {
          await api.put(`/api/low-value-items/${id}`, { data: { ...row, stock: 0, reserved: 0 } }).catch(() => null)
        }
      }
      await api.delete(`/api/low-value-items/${id}`).catch(() => null)
    }
  })
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

/** 清理顺序：领用 → 退库 → 入库 */
function rank(collection: string): number {
  if (collection === 'low-value-requisition') return 0
  if (collection === 'low-value-return') return 1
  return 2
}

async function createItem(overrides: Record<string, unknown> = {}): Promise<{ id: string; code: string; name: string }> {
  const code = String(overrides.code ?? `E2E_LV_${suffix()}`)
  const payload = {
    code,
    name: `E2E_物品_${code}`,
    category: 'OFFICE',
    spec: 'E2E',
    unit: '个',
    price: 10.5,
    stock: 0,
    reserved: 0,
    safetyStock: 1,
    location: 'E2E_货架',
    status: 'NORMAL',
    ...overrides
  }
  const created = await withApi(admin.token, async api => {
    return json<{ id: string }>(await api.post('/api/low-value-items', { data: payload }), '创建物品')
  })
  items.push(created.id)
  return { id: created.id, code, name: String(payload.name) }
}

async function getItem(id: string): Promise<{ stock: number; reserved: number }> {
  return withApi(admin.token, async api => {
    const row = await json<Record<string, unknown>>(await api.get(`/api/low-value-items/${id}`), '读取物品')
    return { stock: Number(row.stock ?? 0), reserved: Number(row.reserved ?? 0) }
  })
}

let docSeq = 0
async function createLvDoc(
  collection: 'low-value-inbound' | 'low-value-requisition' | 'low-value-return',
  item: { id: string; name: string },
  options: { quantity: number; status?: string; creatorId?: string; docNo?: string; price?: number } = { quantity: 1 }
): Promise<{ id: string; docNo: string }> {
  const prefix = collection === 'low-value-inbound' ? 'RK' : collection === 'low-value-requisition' ? 'PY' : 'TK'
  const docNo = options.docNo ?? `E2E_${prefix}_${suffix()}${docSeq++}`
  const payload = {
    docNo,
    itemId: item.id,
    itemName: item.name,
    quantity: options.quantity,
    price: options.price ?? 10.5,
    amount: Number(options.price ?? 10.5) * options.quantity,
    operator: 'E2E',
    remark: 'E2E 自动创建，用后删除',
    deptId: lvDeptId,
    status: options.status ?? 'DRAFT',
    creatorId: options.creatorId ?? admin.user.id,
    submitTime: '',
    settleTime: ''
  }
  const created = await withApi(admin.token, async api => {
    return json<{ id: string }>(await api.post(`/api/${collection}`, { data: payload }), `创建单据(${collection})`)
  })
  docs.push({ collection, id: created.id, docNo })
  return { id: created.id, docNo }
}

async function updateStatus(collection: string, id: string, status: string) {
  return withApi(admin.token, async api => {
    const current = await json<Record<string, unknown>>(await api.get(`/api/${collection}/${id}`), '读取单据')
    const res = await api.put(`/api/${collection}/${id}`, { data: { ...current, status } })
    return { status: res.status(), body: await res.json() }
  })
}

async function docRow(collection: string, id: string): Promise<Record<string, unknown>> {
  return withApi(admin.token, async api =>
    json<Record<string, unknown>>(await api.get(`/api/${collection}/${id}`), '读取单据')
  )
}

async function trailsOf(docNo: string) {
  return withApi(admin.token, async api =>
    json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-asset-doc-approvals?pageSize=200&keyword=${encodeURIComponent(docNo)}`),
      '读取审批轨迹'
    )
  )
}

async function createLeader(): Promise<{ user: TempUser; token: string; session: Session }> {
  const roleId = await findRoleIdByCode(admin, 'ROLE_LEADER')
  const user = await createTempUser(admin, roleId, { deptId: lvDeptId })
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, token: session.token, session }
}

async function createWarehouse(): Promise<{ user: TempUser; token: string }> {
  const roleId = await findRoleIdByCode(admin, 'ROLE_WAREHOUSE')
  const user = await createTempUser(admin, roleId, { deptId: lvDeptId })
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { user, token: session.token }
}

// ---------------------------------------------------------------- 物品主数据

test('[P2-01] 新建物品出现在库存台账', async ({ context, page }, testInfo) => {
  const item = await createItem({ stock: 7 })
  const guards = installGuards(page)
  await seedSession(context, admin)

  await page.goto('/low-value-assets')
  await waitSettled(page)
  await page.getByPlaceholder('物品名称/规格型号').first().fill(item.name)
  await page.getByRole('button', { name: /搜\s*索/ }).first().click()
  await waitSettled(page)

  const row = page.locator('.el-table__row').filter({ hasText: item.code }).first()
  await expect(row).toBeVisible()
  await expect(row).toContainText(item.name)
  await shot(page, testInfo, 1, '物品台账展示新物品')
  guards.assertClean()

  expect((await getItem(item.id)).stock).toBe(7)
})

test('[P2-02] 物品编码重复被拒绝', async () => {
  const item = await createItem()
  await withApi(admin.token, async api => {
    const res = await api.post('/api/low-value-items', {
      data: { code: item.code, name: 'E2E_重复物品', category: 'OFFICE', status: 'NORMAL' }
    })
    expect(res.status()).toBe(409)
    expect((await res.json()).message).toMatch(/重复|已存在/)
  })
})

test('[P2-03] 物品必填缺失被拒绝', async () => {
  await withApi(admin.token, async api => {
    const res = await api.post('/api/low-value-items', { data: {} })
    expect(res.status()).toBe(422)
    expect((await res.json()).code).toBe(422)
  })
})

// ---------------------------------------------------------------- 入库

test('[P2-04] 入库单已完结时立即回补库存', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  expect((await getItem(item.id)).stock).toBe(10)
})

test('[P2-05] 入库草稿不动库存，改为完结后回补', async () => {
  const item = await createItem()
  const doc = await createLvDoc('low-value-inbound', item, { quantity: 5 })
  expect((await getItem(item.id)).stock).toBe(0)

  const moved = await updateStatus('low-value-inbound', doc.id, 'DONE')
  expect(moved.status).toBe(200)
  expect((await getItem(item.id)).stock).toBe(5)
})

test('[P2-06] 入库缺少数量被拒绝', async () => {
  const item = await createItem()
  await withApi(admin.token, async api => {
    const res = await api.post('/api/low-value-inbound', {
      data: { docNo: `E2E_RK_${suffix()}`, itemId: item.id, status: 'DRAFT' }
    })
    expect(res.status()).toBe(422)
  })
})

// ---------------------------------------------------------------- 领用

test('[P2-07] 领用草稿不动库存也不预占', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 3 })

  const stock = await getItem(item.id)
  expect(stock.stock).toBe(10)
  expect(stock.reserved).toBe(0)
})

test('[P2-08] 领用提交审批时预占可用量', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 3 })

  const res = await act(user3.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  expect(res.status).toBe(200)
  expect(res.body.data.status).toBe('PROCESSING')

  const stock = await getItem(item.id)
  expect(stock.stock).toBe(10)
  expect(stock.reserved).toBe(3)
})

test('[P2-09] 领用审批通过后扣减库存并释放预占', async () => {
  const leader = await createLeader()
  const warehouse = await createWarehouse()
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 4 })

  await act(user3.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  await act(leader.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  const done = await act(warehouse.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  expect(done.body.data.status).toBe('DONE')

  const stock = await getItem(item.id)
  expect(stock.stock).toBe(6)
  expect(stock.reserved).toBe(0)
  // P2-D2（2026-11-02 修复）：审批完结时同时写入低值单据的 settleTime
  const settled = await docRow('low-value-requisition', doc.id)
  expect(String(settled.status)).toBe('DONE')
  expect(settled.settleTime).toBeTruthy()
})

test('[P2-10] 领用驳回释放预占且库存不变', async () => {
  const leader = await createLeader()
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 2 })

  await act(user3.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  expect((await getItem(item.id)).reserved).toBe(2)

  const rejected = await act(leader.token, {
    docKey: 'requisition',
    docId: doc.id,
    action: 'reject',
    comment: 'E2E 驳回'
  })
  expect(rejected.body.data.status).toBe('REJECTED')

  const stock = await getItem(item.id)
  expect(stock.stock).toBe(10)
  expect(stock.reserved).toBe(0)
})

test('[P2-11] 可用库存不足时提交被拒绝', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 2, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 5 })

  const res = await act(user3.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  expect(res.status).toBe(200)
  expect(res.body.code).toBe(1001)
  expect(res.body.message).toContain('可用库存不足')

  const stock = await getItem(item.id)
  expect(stock.stock).toBe(2)
  expect(stock.reserved).toBe(0)
  expect(String((await docRow('low-value-requisition', doc.id)).status)).toBe('DRAFT')
})

test('[P2-12] 已完结领用单改状态同时改数量被拒绝', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 3, status: 'DONE' })

  // 状态发生变化时才走数量守卫：DONE → DRAFT 且改数量应被拒
  const res = await withApi(admin.token, async api => {
    const current = await json<Record<string, unknown>>(await api.get(`/api/low-value-requisition/${doc.id}`), '读取领用单')
    const r = await api.put(`/api/low-value-requisition/${doc.id}`, {
      data: { ...current, status: 'DRAFT', quantity: 99 }
    })
    return { status: r.status(), body: await r.json() }
  })
  expect(res.status).toBe(409)
  expect(res.body.message).toContain('已生效')
  expect((await getItem(item.id)).stock).toBe(7)
})

/**
 * P2-D1（2026-11-02 修复）：`applyStockOnStatusChange` 先校验结算状态下的数量变更，
 * 再处理状态是否变化，同状态 PUT 改数量不再能绕过「已生效不能修改数量」守卫。
 */
test('[P2-22] 已完结领用单同状态改数量也应被拒绝', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 3, status: 'DONE' })

  const res = await withApi(admin.token, async api => {
    const current = await json<Record<string, unknown>>(await api.get(`/api/low-value-requisition/${doc.id}`), '读取领用单')
    return api.put(`/api/low-value-requisition/${doc.id}`, { data: { ...current, quantity: 99 } })
  })
  expect(res.status()).toBe(409)
  expect((await getItem(item.id)).stock).toBe(7)
})

test('[P2-13] 删除已完结领用单回补库存', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 4, status: 'DONE' })
  expect((await getItem(item.id)).stock).toBe(6)

  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/low-value-requisition/${doc.id}`)
    expect(res.status()).toBe(200)
    expect((await res.json()).code).toBe(0)
  })
  expect((await getItem(item.id)).stock).toBe(10)
})

test('[P2-14] 退库超出可退额度被拒绝', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 5, status: 'DONE' })

  await withApi(admin.token, async api => {
    const res = await api.post('/api/low-value-return', {
      data: {
        docNo: `E2E_TK_${suffix()}`,
        itemId: item.id,
        itemName: item.name,
        quantity: 6,
        price: 10.5,
        status: 'DONE',
        creatorId: admin.user.id
      }
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(1006)
    expect(body.message).toContain('可退')
  })
  expect((await getItem(item.id)).stock).toBe(5)
})

test('[P2-15] 退库审批通过后回补库存', async () => {
  const leader = await createLeader()
  const warehouse = await createWarehouse()
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 5, status: 'DONE' })
  const doc = await createLvDoc('low-value-return', item, { quantity: 3 })

  await act(user3.token, { docKey: 'return', docId: doc.id, action: 'submit' })
  await act(leader.token, { docKey: 'return', docId: doc.id, action: 'approve' })
  const done = await act(warehouse.token, { docKey: 'return', docId: doc.id, action: 'approve' })
  expect(done.body.data.status).toBe('DONE')

  expect((await getItem(item.id)).stock).toBe(8)
})

test('[P2-16] 退库驳回不回补库存', async () => {
  const leader = await createLeader()
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 4, status: 'DONE' })
  const doc = await createLvDoc('low-value-return', item, { quantity: 2 })

  await act(user3.token, { docKey: 'return', docId: doc.id, action: 'submit' })
  const rejected = await act(leader.token, {
    docKey: 'return',
    docId: doc.id,
    action: 'reject',
    comment: 'E2E 退库驳回'
  })
  expect(rejected.body.data.status).toBe('REJECTED')
  expect((await getItem(item.id)).stock).toBe(6)
})

test('[P2-17] 物品仍有库存时不能删除', async () => {
  const item = await createItem({ stock: 5 })
  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/low-value-items/${item.id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(1003)
    expect(body.message).toContain('库存')
  })
})

test('[P2-18] 物品被单据引用时不能删除', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 5, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 5, status: 'DONE' })
  expect((await getItem(item.id)).stock).toBe(0)

  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/low-value-items/${item.id}`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(1003)
    expect(body.message).toContain('单据')
  })
})

test('[P2-19] 领用审批轨迹完整', async () => {
  const leader = await createLeader()
  const warehouse = await createWarehouse()
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 2 })

  await act(user3.token, { docKey: 'requisition', docId: doc.id, action: 'submit' })
  await act(leader.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })
  await act(warehouse.token, { docKey: 'requisition', docId: doc.id, action: 'approve' })

  const trails = (await trailsOf(doc.docNo)).filter(t => t.docId === doc.id)
  expect(trails.filter(t => t.result === 'SUBMIT')).toHaveLength(1)
  expect(trails.filter(t => t.result === 'AGREE')).toHaveLength(2)
  expect(trails.map(t => t.stepName)).toEqual(
    expect.arrayContaining(['部门主管审批', '仓管员出库确认'])
  )
})

test('[P2-20] 删除审批中的领用单释放预占', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const doc = await createLvDoc('low-value-requisition', item, { quantity: 3, status: 'PROCESSING' })
  expect((await getItem(item.id)).reserved).toBe(3)

  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/low-value-requisition/${doc.id}`)
    expect(res.status()).toBe(200)
    expect((await res.json()).code).toBe(0)
  })
  const stock = await getItem(item.id)
  expect(stock.stock).toBe(10)
  expect(stock.reserved).toBe(0)
})

test('[P2-21] 入库-领用-退库后库存数量一致', async () => {
  const item = await createItem()
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  await createLvDoc('low-value-requisition', item, { quantity: 4, status: 'DONE' })
  await createLvDoc('low-value-return', item, { quantity: 1, status: 'DONE' })
  expect((await getItem(item.id)).stock).toBe(7)
})

/**
 * 回归：前端「新增领用」按 lv:requisition 显示，后端曾统一要求 lv:edit。
 * 部门主管（ROLE_LEADER）只有 lv:requisition，点确定会收到「无权限访问该数据：low-value-requisition」。
 * 这条用例必须用真实业务角色从界面建单，不能用 admin（admin 有 lv:edit，会把问题盖住）。
 */
test('[P2-24] 已有草稿可从审批弹窗提交', async ({ context, page }, testInfo) => {
  const item = await createItem({ stock: 0 })
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const leader = await createLeader()
  const org = await pickOrgUnit(admin)

  // 先落一张草稿（模拟「之前建了单但没提交」），再由界面的审批弹窗提交
  const docNo = `E2E_PY_${suffix()}`
  const draft = await withApi(leader.token, async api => {
    const res = await api.post('/api/low-value-requisition', {
      data: {
        docNo, itemId: item.id, itemName: item.name, quantity: 2, price: 10.5, amount: 21,
        receiver: leader.user.name, deptId: org.deptId, requisitionDate: '2026-11-02',
        operator: 'E2E', remark: 'E2E 草稿', status: 'DRAFT', creatorId: leader.user.id,
        submitTime: '', settleTime: ''
      }
    })
    expect(res.status()).toBe(200)
    return json<{ id: string }>(res, '创建草稿')
  })
  docs.push({ collection: 'low-value-requisition', id: draft.id, docNo })

  const guards = installGuards(page)
  await seedSession(context, leader.session)
  await page.goto('/low-value-assets?tab=requisition')
  await waitSettled(page)

  const row = page.locator('.el-table__row').filter({ hasText: docNo }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '审批信息' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
  await expect(dialog).toBeVisible()
  await dialog.locator('textarea').fill('E2E 提交说明')

  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/approvals/action') && r.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: '提交', exact: true }).click()
  const response = await responsePromise
  const body = await response.json()
  expect(response.status(), JSON.stringify(body)).toBe(200)
  expect(body.data.status).toBe('PROCESSING')
  await expect(dialog).toBeHidden()
  await shot(page, testInfo, 1, '草稿已提交审批')

  const detail = await docRow('low-value-requisition', draft.id)
  expect(detail.status).toBe('PROCESSING')
  const trails = await trailsOf(docNo)
  expect(trails.some(t => t.result === 'SUBMIT' && String(t.comment).includes('E2E 提交说明'))).toBeTruthy()
  guards.assertClean()
})

test('[P2-23] 部门主管从界面新增领用不被权限拦截', async ({ context, page }, testInfo) => {
  const item = await createItem({ stock: 0 })
  await createLvDoc('low-value-inbound', item, { quantity: 10, status: 'DONE' })
  const leader = await createLeader()

  const guards = installGuards(page)
  await seedSession(context, leader.session)
  await page.goto('/low-value-assets?tab=requisition')
  await waitSettled(page)

  await page.getByRole('button', { name: '新增领用' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增领用' }).last()
  await expect(dialog).toBeVisible()

  await dialog.locator('.el-form-item').filter({ hasText: '领用物品' }).locator('.el-select').click()
  const option = page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: item.name }).first()
  await expect(option).toBeVisible()
  await option.click()

  const qty = dialog.locator('.el-input-number input').first()
  await qty.fill('2')
  await qty.blur()
  await shot(page, testInfo, 1, '部门主管填写领用单')

  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/low-value-requisition') && r.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: '确定' }).click()
  const response = await responsePromise
  const body = await response.json()
  expect(response.status(), `新增领用应放行，实际 ${response.status()} ${body.message || ''}`).toBe(200)
  expect(body.code).toBe(0)
  docs.push({ collection: 'low-value-requisition', id: body.data.id, docNo: body.data.docNo })

  await expect(page.locator('.el-message').last()).toContainText('领用单已提交审批')
  // 不再出现用户截图里的那条权限错误
  await expect(page.locator('.el-message--error').filter({ hasText: 'low-value-requisition' })).toHaveCount(0)
  await shot(page, testInfo, 2, '领用单创建并提交审批')

  const trails = await trailsOf(body.data.docNo)
  expect(trails.some(t => t.result === 'SUBMIT')).toBeTruthy()
  expect((await getItem(item.id)).stock).toBe(10)
  guards.assertClean()
})
