import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, findRoleIdByCode, pickOrgUnit, type TempUser } from './fixtures/data'
import { installGuards } from './fixtures/net'
import { json, suffix, withApi } from './fixtures/fixedAsset'

/**
 * 真实角色人设旅程：每个角色至少一条「建单 → 提交 → 审批 → 完结」的完整闭环。
 *
 * 与接口用例的区别：这里的每一步都由真实角色在界面上点出来，
 * admin 只负责造初始数据（物品 / 资产）与收尾清理，不参与任何业务动作。
 *
 * 三条旅程：
 * 1. ROLE_USER 领用 → ROLE_LEADER 部门主管审批 → ROLE_WAREHOUSE 出库确认 → 库存扣减；
 * 2. ROLE_LEADER 派发 → 部门主管确认 → ROLE_ASSET 资产管理员登记 → 台账联动；
 * 3. ROLE_WAREHOUSE 入库 → 直接完结 → 库存回补。
 */

type Principal = { code: string; session: Session; user: TempUser }
type DocRef = { collection: string; id: string; docNo: string }

let admin: Session
let units: { companyId: string; deptId: string }
const principals = new Map<string, Principal>()
const users: TempUser[] = []
const items: string[] = []
const docs: DocRef[] = []
const assets: string[] = []

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
    // 先删低值单据（按 领用 → 退库 → 入库 顺序，避免库存先被扣成负数），再删固资单据与资产
    const ordered = [...docs].sort((a, b) => rank(a.collection) - rank(b.collection))
    for (const doc of ordered) {
      await api.delete(`/api/${doc.collection}/${doc.id}`).catch(() => null)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
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

function principalOf(code: string): Principal {
  const principal = principals.get(code)
  if (!principal) throw new Error(`角色 ${code} 未初始化`)
  return principal
}

// ---------------------------------------------------------------- 造数（admin）

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
    safetyStock: 1,
    location: 'E2E_货架',
    status: 'NORMAL'
  }
  const created = await withApi(admin.token, async api =>
    json<{ id: string }>(await api.post('/api/low-value-items', { data: payload }), '创建低值物品')
  )
  items.push(created.id)
  return { id: created.id, name: String(payload.name) }
}

async function createAsset(): Promise<{ id: string; name: string }> {
  const code = `E2E_FA_${suffix()}`
  const payload = {
    code,
    name: `E2E_资产_${code}`,
    category: 'ELECTRONIC',
    companyId: units.companyId,
    deptId: units.deptId,
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
  const created = await withApi(admin.token, async api =>
    json<{ id: string }>(await api.post('/api/fixed-assets', { data: payload }), '创建资产')
  )
  assets.push(created.id)
  return { id: created.id, name: String(payload.name) }
}

// ---------------------------------------------------------------- 读断言（admin）

async function itemStock(id: string): Promise<{ stock: number; reserved: number }> {
  const row = await withApi(admin.token, async api =>
    json<Record<string, unknown>>(await api.get(`/api/low-value-items/${id}`), '读取物品')
  )
  return { stock: Number(row.stock ?? 0), reserved: Number(row.reserved ?? 0) }
}

async function docRow(collection: string, id: string): Promise<Record<string, unknown>> {
  return withApi(admin.token, async api =>
    json<Record<string, unknown>>(await api.get(`/api/${collection}/${id}`), '读取单据')
  )
}

async function trailsOf(docNo: string): Promise<Array<Record<string, unknown>>> {
  return withApi(admin.token, async api =>
    json<Array<Record<string, unknown>>>(
      await api.get(`/api/fixed-asset-doc-approvals?pageSize=200&keyword=${encodeURIComponent(docNo)}`),
      '读取审批轨迹'
    )
  )
}

async function assetRow(id: string): Promise<Record<string, unknown>> {
  return withApi(admin.token, async api =>
    json<Record<string, unknown>>(await api.get(`/api/fixed-assets/${id}`), '读取资产')
  )
}

// ---------------------------------------------------------------- 界面动作

async function openDialog(page: import('@playwright/test').Page, title: string) {
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: title }).last()
  await expect(dialog).toBeVisible()
  return dialog
}

/** 点「审批信息」，再点指定动作按钮，返回审批接口响应 */
/**
 * 按单号过滤列表。
 *
 * 单据表按编号/时间排序且分页，历史数据一多，刚建的单就不在第一页。
 * 真实用户的动作也是先搜单号再操作，所以这里补上「填单号 → 查询」，
 * 而不是靠 data volume 恰好把新单排在首屏。
 */
async function filterByDocNo(page: import('@playwright/test').Page, docNo: string) {
  // 页面被 keep-alive 缓存后，DOM 里可能同时存在隐藏的旧表单，必须只取可见的那个
  const input = page.locator('input[placeholder="请输入单据编号"]:visible').first()
  if ((await input.count()) === 0) return
  await input.fill(docNo)
  await page.getByRole('button', { name: /查\s*询/ }).first().click()
  await waitSettled(page)
}

async function actFromRow(
  page: import('@playwright/test').Page,
  docNo: string,
  action: '提交审批' | '通过'
) {
  await filterByDocNo(page, docNo)
  const row = page.locator('.el-table__row').filter({ hasText: docNo }).first()
  await expect(row, `列表中应出现单据 ${docNo}`).toBeVisible()
  await row.getByRole('button', { name: '审批信息' }).click()
  const dialog = await openDialog(page, '审批信息')

  const responsePromise = page.waitForResponse(
    r => r.url().includes('/api/approvals/action') && r.request().method() === 'POST'
  )
  await dialog.getByRole('button', { name: action }).click()
  const response = await responsePromise
  const body = await response.json()
  expect(response.status(), `${action} 失败：${JSON.stringify(body)}`).toBe(200)
  expect(body.code).toBe(0)
  await expect(dialog).toBeHidden()
  return body.data as { status: string }
}

/** 在低值资产管理页选择物品（下拉项按名称匹配） */
async function pickItem(page: import('@playwright/test').Page, dialog: import('@playwright/test').Locator, itemName: string) {
  await dialog.locator('.el-form-item').filter({ hasText: '物品' }).first().locator('.el-select').click()
  const option = page.locator('.el-select-dropdown:visible .el-select-dropdown__item').filter({ hasText: itemName }).first()
  await expect(option).toBeVisible()
  await option.click()
}

// ---------------------------------------------------------------- 旅程一：领用

test('[P5-01] 资产使用人领用：建单 → 主管审批 → 仓管出库 → 完结', async ({ context, page }, testInfo) => {
  const item = await createItem(10)
  const user = principalOf('ROLE_USER')
  const leader = principalOf('ROLE_LEADER')
  const warehouse = principalOf('ROLE_WAREHOUSE')
  const guards = installGuards(page)

  // 1) 资产使用人建领用单（界面自动提交审批）
  await seedSession(context, user.session)
  await page.goto('/low-value-assets?tab=requisition')
  await waitSettled(page)
  await page.getByRole('button', { name: '新增领用' }).click()
  const form = await openDialog(page, '新增领用')
  await pickItem(page, form, item.name)
  const qty = form.locator('.el-input-number input').first()
  await qty.fill('2')
  await qty.blur()

  const createPromise = page.waitForResponse(
    r => r.url().match(/\/api\/low-value-requisition$/) && r.request().method() === 'POST'
  )
  await form.getByRole('button', { name: '确定' }).click()
  const created = await createPromise
  const createdBody = await created.json()
  expect(created.status(), `建领用单失败：${JSON.stringify(createdBody)}`).toBe(200)
  const docId = String(createdBody.data.id)
  const docNo = String(createdBody.data.docNo)
  docs.push({ collection: 'low-value-requisition', id: docId, docNo })

  await expect(page.locator('.el-message').last()).toContainText('领用单已提交审批')
  await shot(page, testInfo, 1, '资产使用人已提交领用')

  // 提交后：状态审批中、库存未扣但已被预占
  expect((await docRow('low-value-requisition', docId)).status).toBe('PROCESSING')
  let stock = await itemStock(item.id)
  expect(stock, '提交后应预占 2，库存暂不扣减').toEqual({ stock: 10, reserved: 2 })

  // 2) 部门主管审批（第一环节）
  await seedSession(context, leader.session)
  await page.goto('/low-value-assets?tab=requisition')
  await waitSettled(page)
  const first = await actFromRow(page, docNo, '通过')
  expect(first.status).toBe('PROCESSING')
  await shot(page, testInfo, 2, '部门主管审批通过')

  // 3) 仓管员出库确认（第二环节，末环节 → 完结）
  await seedSession(context, warehouse.session)
  await page.goto('/low-value-assets?tab=requisition')
  await waitSettled(page)
  const second = await actFromRow(page, docNo, '通过')
  expect(second.status).toBe('DONE')
  await shot(page, testInfo, 3, '仓管员确认出库')

  // 4) 完结后：库存扣减、预占释放、轨迹闭环
  expect((await docRow('low-value-requisition', docId)).status).toBe('DONE')
  stock = await itemStock(item.id)
  expect(stock, '完结后应扣减 2 并释放预占').toEqual({ stock: 8, reserved: 0 })

  const trails = await trailsOf(docNo)
  expect(trails.filter(t => t.result === 'SUBMIT')).toHaveLength(1)
  expect(trails.filter(t => t.result === 'AGREE')).toHaveLength(2)

  guards.assertClean()
})

// ---------------------------------------------------------------- 旅程二：派发

test('[P5-02] 部门主管派发：建单 → 确认 → 资产管理员登记 → 台账联动', async ({ context, page }, testInfo) => {
  const asset = await createAsset()
  const leader = principalOf('ROLE_LEADER')
  const assetAdmin = principalOf('ROLE_ASSET')
  expect((await assetRow(asset.id)).status).toBe('IDLE')
  const guards = installGuards(page)

  // 1) 部门主管建派发单
  await seedSession(context, leader.session)
  await page.goto('/fixed-assets?tab=dispatch&sub=alloc')
  await waitSettled(page)

  await page.getByRole('button', { name: '新增单据' }).first().click()
  const form = await openDialog(page, '新增单据')
  await form.locator('.el-form-item').filter({ hasText: '单据名称' }).locator('input').fill(`E2E_派发_${suffix()}`)
  await form.locator('.el-form-item').filter({ hasText: '关联资产' }).locator('.el-select').click()
  const assetOption = page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: asset.name })
    .first()
  await expect(assetOption).toBeVisible()
  await assetOption.click()

  const createPromise = page.waitForResponse(
    r => r.url().includes('/api/fixed-asset-doc-lists-alloc') && r.request().method() === 'POST'
  )
  await form.getByRole('button', { name: '确定' }).click()
  const created = await createPromise
  const createdBody = await created.json()
  expect(created.status(), `建派发单失败：${JSON.stringify(createdBody)}`).toBe(200)
  const docId = String(createdBody.data.id)
  const docNo = String(createdBody.data.code)
  docs.push({ collection: 'fixed-asset-doc-lists-alloc', id: docId, docNo })
  await shot(page, testInfo, 1, '部门主管已建派发单')

  // 2) 提交 → 部门主管确认（s1）
  const submitted = await actFromRow(page, docNo, '提交审批')
  expect(submitted.status).toBe('PROCESSING')
  const confirmed = await actFromRow(page, docNo, '通过')
  expect(confirmed.status).toBe('PROCESSING')
  await shot(page, testInfo, 2, '部门主管确认完成')

  // 3) 资产管理员登记（s2，末环节 → 完结）
  await seedSession(context, assetAdmin.session)
  await page.goto('/fixed-assets?tab=dispatch&sub=alloc')
  await waitSettled(page)
  const registered = await actFromRow(page, docNo, '通过')
  expect(registered.status).toBe('DONE')
  await shot(page, testInfo, 3, '资产管理员登记完成')

  // 4) 台账联动：使用人 = 单据创建人（部门主管），状态使用中
  const row = await assetRow(asset.id)
  expect(row.status).toBe('IN_USE')
  expect(row.userId).toBe(leader.user.id)

  guards.assertClean()
})

// ---------------------------------------------------------------- 旅程三：入库

test('[P5-03] 仓管员入库：建单即完结 → 库存回补', async ({ context, page }, testInfo) => {
  const item = await createItem(0)
  const warehouse = principalOf('ROLE_WAREHOUSE')
  const guards = installGuards(page)

  await seedSession(context, warehouse.session)
  await page.goto('/low-value-assets?tab=inbound')
  await waitSettled(page)

  await page.getByRole('button', { name: '新增入库' }).click()
  const form = await openDialog(page, '新增入库')
  await pickItem(page, form, item.name)
  const qty = form.locator('.el-input-number input').first()
  await qty.fill('5')
  await qty.blur()

  const createPromise = page.waitForResponse(
    r => r.url().match(/\/api\/low-value-inbound$/) && r.request().method() === 'POST'
  )
  await form.getByRole('button', { name: '确定' }).click()
  const created = await createPromise
  const createdBody = await created.json()
  expect(created.status(), `入库失败：${JSON.stringify(createdBody)}`).toBe(200)
  docs.push({
    collection: 'low-value-inbound',
    id: String(createdBody.data.id),
    docNo: String(createdBody.data.docNo)
  })

  await expect(page.locator('.el-message').last()).toContainText('入库成功')
  expect((await itemStock(item.id)).stock).toBe(5)
  await shot(page, testInfo, 1, '入库完成，库存已回补')

  guards.assertClean()
})
