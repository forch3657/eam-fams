import fs from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempRole,
  createTempUser,
  findRoleIdByCode,
  pickOrgUnit,
  uniqueSuffix,
  type TempUser
} from './fixtures/data'
import { deleteDocQuietly } from './fixtures/fixedAsset'
import { installGuards } from './fixtures/net'
import {
  apiDeleteQuiet,
  apiList,
  apiPost,
  csvRows,
  fmtMoney,
  readDownloadedCsv,
  toJson,
  withApi,
  type Row
} from './fixtures/p5'

/**
 * P5 工作台 / 报表 / 消息（P5-01 ~ P5-11、P5-18 ~ P5-20）。
 *
 * 所有 E2E_ 单据/资产/物品/消息在 afterAll 清理；报表断言用「接口聚合 ↔ 界面数字」交叉校验。
 */

let admin: Session
let orgUnits: { companyId: string; deptId: string }
let leaderRoleId: string

const assets: string[] = []
const lowItems: string[] = []
const lowDocs: Array<{ key: string; id: string }> = []
const docs: Array<{ id: string; code: string }> = []
const users: TempUser[] = []
const roles: string[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  orgUnits = await pickOrgUnit(admin)
  leaderRoleId = await findRoleIdByCode(admin, 'ROLE_LEADER')
})

test.afterAll(async () => {
  await withApi(admin, async api => {
    // 审批中的单据先撤销再删（P1-D1 守卫），轨迹由后端 afterDelete 级联清理
    for (const doc of docs) {
      await deleteDocQuietly(api, 'alloc', doc.id)
    }
    // 审批轨迹按 docId 清理（低值领用/入库也会写轨迹，不能只按固资单号查）
    const docIds = new Set([...docs.map(d => String(d.id)), ...lowDocs.map(d => String(d.id))])
    const trailRes = await api.get('/api/fixed-asset-doc-approvals?pageSize=2000')
    if (trailRes.ok()) {
      const rows = ((await trailRes.json()).data ?? []) as Row[]
      for (const row of rows.filter(r =>
        docIds.has(String(r.docId)) || String(r.docCode || '').startsWith('E2E_')
      )) {
        await api.delete(`/api/fixed-asset-doc-approvals/${row.id}`).catch(() => null)
      }
    }
    for (const doc of lowDocs) {
      await api.delete(`/api/${doc.key}/${doc.id}`).catch(() => null)
    }
    for (const id of assets) {
      await api.delete(`/api/fixed-assets/${id}`).catch(() => null)
    }
    for (const id of lowItems) {
      // 低值物品有库存/预占保护：先清零再删，否则删不掉（见 P2 清理口径）
      const res = await api.get(`/api/low-value-items/${id}`)
      if (res.ok()) {
        const row = (await res.json()).data
        if (row) {
          await api
            .put(`/api/low-value-items/${id}`, { data: { ...row, stock: 0, reserved: 0 } })
            .catch(() => null)
        }
      }
      await api.delete(`/api/low-value-items/${id}`).catch(() => null)
    }
    // 本轮产生的站内信（标题含 E2E 单据编号）
    const msgs = await api.get('/api/notify-messages?pageSize=2000')
    if (msgs.ok()) {
      const rows = ((await msgs.json()).data ?? []) as Row[]
      for (const row of rows.filter(r => String(r.title || '').includes('E2E_DOC_P5_'))) {
        await api.delete(`/api/notify-messages/${row.id}`).catch(() => null)
      }
    }
    // 本轮新建的消息模板
    const tpls = await api.get('/api/notify-templates?pageSize=500')
    if (tpls.ok()) {
      const rows = ((await tpls.json()).data ?? []) as Row[]
      for (const row of rows.filter(r => String(r.key || '').startsWith('e2e_'))) {
        await api.delete(`/api/notify-templates/${row.key}`).catch(() => null)
      }
    }
  })
  for (const user of users) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
  for (const roleId of roles) {
    await cleanupTemp(admin, { roleId }).catch(() => null)
  }
})

// ---------------------------------------------------------------- 造数

async function createAsset(options: {
  amount?: number
  location?: string
  name?: string
  code?: string
} = {}): Promise<Row> {
  const code = options.code ?? `E2E_FA_P5_${uniqueSuffix()}`
  const created = await apiPost<Row>(admin, 'fixed-assets', {
    code,
    name: options.name ?? `E2E_资产_${code}`,
    category: 'ELECTRONIC',
    brand: 'E2E',
    model: 'P5',
    companyId: orgUnits.companyId,
    deptId: orgUnits.deptId,
    userId: admin.user.id,
    location: options.location ?? `E2E_位置_${code}`,
    purchaseDate: '2026-01-15',
    inboundDate: '2026-01-16',
    amount: options.amount ?? 1000,
    original: options.amount ?? 1000,
    net: options.amount ?? 1000,
    status: 'IDLE',
    depreciate: false,
    purchaseMode: 'PURCHASE'
  })
  assets.push(String(created.id))
  return created
}

async function createLowItem(options: {
  stock?: number
  safetyStock?: number
  reserved?: number
  price?: number
  name?: string
} = {}): Promise<Row> {
  const code = `E2E_LV_P5_${uniqueSuffix()}`
  const created = await apiPost<Row>(admin, 'low-value-items', {
    code,
    category: 'OFFICE',
    name: options.name ?? `E2E_物品_${code}`,
    spec: 'P5',
    unit: '个',
    price: options.price ?? 10,
    stock: options.stock ?? 0,
    reserved: options.reserved ?? 0,
    safetyStock: options.safetyStock ?? 0,
    location: `E2E_库位_${code}`,
    status: 'NORMAL'
  })
  lowItems.push(String(created.id))
  return created
}

async function createLeader(): Promise<{ user: TempUser; session: Session }> {
  const user = await createTempUser(admin, leaderRoleId)
  users.push(user)
  return { user, session: await loginViaApi({ username: user.username, password: user.password }) }
}

async function act(session: Session, payload: Row) {
  return withApi(session, async api => {
    const res = await api.post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, ...payload }
    })
    return { status: res.status(), body: await res.json() }
  })
}

async function createAllocDoc(assetId: string): Promise<{ id: string; code: string }> {
  const code = `E2E_DOC_P5_${uniqueSuffix()}`
  const created = await apiPost<Row>(admin, 'fixed-asset-doc-lists-alloc', {
    code,
    name: `E2E_单据_${code}`,
    companyId: orgUnits.companyId,
    assetId,
    creatorId: admin.user.id,
    createTime: new Date().toISOString(),
    finishTime: '',
    remark: 'E2E P5 自动创建，用后删除',
    status: 'DRAFT'
  })
  docs.push({ id: String(created.id), code })
  return { id: String(created.id), code }
}

async function readDoc(id: string): Promise<Row> {
  return withApi(admin, async api =>
    toJson<Row>(await api.get(`/api/fixed-asset-doc-lists-alloc/${id}`), '读取单据')
  )
}

async function updateDoc(id: string, patch: Row): Promise<void> {
  await withApi(admin, async api => {
    const current = await readDoc(id)
    await toJson(await api.put(`/api/fixed-asset-doc-lists-alloc/${id}`, { data: { ...current, ...patch } }), '更新单据')
  })
}

async function docAtAdminStep() {
  const asset = await createAsset()
  const doc = await createAllocDoc(String(asset.id))
  const leader = await createLeader()
  expect((await act(admin, { docKey: 'alloc', docId: doc.id, action: 'submit' })).status).toBe(200)
  expect((await act(leader.session, {
    docKey: 'alloc',
    docId: doc.id,
    action: 'approve',
    comment: 'E2E 部门确认'
  })).status).toBe(200)
  return { asset, doc, leader }
}

// ---------------------------------------------------------------- 页面工具

async function openWorkbench(page: Page): Promise<void> {
  await page.goto('/workbench')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible()
  await expect(page.locator('.wb-todo .el-table, .wb-todo .wb-todo-empty').first()).toBeVisible()
}

function activePane(page: Page) {
  return page.locator('.wb-todo .el-tab-pane:visible')
}

function statValue(page: Page, index: number) {
  return page.locator('.wb-stat').nth(index).locator('.v')
}

async function openReports(page: Page): Promise<void> {
  await page.goto('/fixed-asset-reports')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '固定资产报表' })).toBeVisible()
}

// ---------------------------------------------------------------- P5-01 ~ P5-05 工作台

test('[P5-01] 概览卡片口径与资产/低值接口一致', async ({ context, page }, testInfo) => {
  const [allAssets, allItems] = await Promise.all([
    apiList(admin, 'fixed-assets'),
    apiList(admin, 'low-value-items')
  ])
  const original = allAssets.reduce((s, a) => s + Number(a.original || 0), 0)
  const net = allAssets.reduce((s, a) => s + Number(a.net || 0), 0)
  const stockAmount = allItems.reduce((s, i) => s + Number(i.stock || 0) * Number(i.price || 0), 0)
  const reserved = allItems.reduce((s, i) => s + Number(i.reserved || 0), 0)

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  const panel = page.locator('.ov-panel')
  await expect(panel).toBeVisible()
  const assetCell = panel.locator('.ov-cell').nth(0)
  await expect(assetCell.locator('.metric-num').nth(0)).toHaveText(String(allAssets.length))
  expect(await assetCell.locator('.metric-num').nth(1).innerText()).toContain(fmtMoney(original))
  expect(await assetCell.locator('.metric-num').nth(2).innerText()).toContain(fmtMoney(net))

  const lowCell = panel.locator('.ov-cell').nth(1)
  await expect(lowCell.locator('.metric-num').nth(0)).toHaveText(String(allItems.length))
  expect(await lowCell.locator('.metric-num').nth(1).innerText()).toContain(fmtMoney(stockAmount))
  await expect(lowCell.locator('.metric-num').nth(2)).toHaveText(String(reserved))

  await shot(page, testInfo, 1, '概览卡片与接口一致')
  guards.assertClean()
})

test('[P5-02] 行动条计数与待办列表一致且可下钻', async ({ context, page }, testInfo) => {
  const { doc } = await docAtAdminStep()
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  const row = activePane(page).locator('.el-table__row').filter({ hasText: doc.code }).first()
  await expect(row).toBeVisible()
  const pending = Number(await statValue(page, 0).innerText())
  const rowCount = await activePane(page).locator('.el-table__row').count()
  expect(pending).toBe(rowCount)
  expect(Number(await statValue(page, 2).innerText())).toBeGreaterThanOrEqual(1)

  // 点「预警」行动条 → 右侧切到预警中心
  await page.locator('.wb-stat').nth(1).click()
  await expect(page.locator('.wb-side-tabs .el-tabs__item.is-active')).toContainText('预警中心')
  await shot(page, testInfo, 1, '行动条计数与待办一致')
  guards.assertClean()
})

test('[P5-03] 低值库存与占用预警口径', async ({ context, page }, testInfo) => {
  const danger = await createLowItem({ stock: 1, safetyStock: 10 })
  const warning = await createLowItem({ stock: 8, safetyStock: 10 })
  const reserved = await createLowItem({ stock: 20, reserved: 2 })
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  const alerts = page.locator('.wb-alert')
  await expect(alerts).toContainText('库存严重不足')
  await expect(alerts).toContainText('库存低于安全库存')
  await expect(alerts).toContainText('库存占用')
  await expect(alerts).toContainText(String(danger.name))
  await expect(alerts).toContainText(String(warning.name))
  await expect(alerts).toContainText(String(reserved.name))
  await expect(page.locator('.wb-stat').nth(1)).toContainText('严重')

  // 点预警项跳低值台账物品页签
  await page.locator('.wb-alert-list li').filter({ hasText: String(danger.name) }).first().click()
  await expect(page).toHaveURL(/\/low-value-assets\?tab=item/)
  await shot(page, testInfo, 1, '低值预警三条口径')
  guards.assertClean()
})

test('[P5-04] 审批滞留预警按超时天数触发', async ({ context, page }, testInfo) => {
  // 固资派发单契约没有 submitTime，改用低值领用单（可回填提交时间）验证滞留口径
  const item = await createLowItem({ stock: 10, price: 10 })
  const docNo = `E2E_REQ_P5_${uniqueSuffix()}`
  const doc = await apiPost<Row>(admin, 'low-value-requisition', {
    docNo,
    itemId: item.id,
    category: 'OFFICE',
    itemName: item.name,
    categoryName: '办公用品',
    spec: item.spec,
    unit: '个',
    quantity: 1,
    price: 10,
    amount: 10,
    deptId: orgUnits.deptId,
    receiver: admin.user.name,
    requisitionDate: new Date().toISOString().slice(0, 10),
    purpose: 'E2E 滞留预警',
    status: 'DRAFT',
    creatorId: admin.user.id
  })
  lowDocs.push({ key: 'low-value-requisition', id: String(doc.id) })

  expect((await act(admin, { docKey: 'requisition', docId: doc.id, action: 'submit' })).status).toBe(200)
  const stale = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  await withApi(admin, async api => {
    const current = await toJson<Row>(await api.get(`/api/low-value-requisition/${doc.id}`), '读取领用单')
    expect(current.status).toBe('PROCESSING')
    await toJson(
      await api.put(`/api/low-value-requisition/${doc.id}`, { data: { ...current, submitTime: stale } }),
      '回填提交时间'
    )
  })

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  await expect(page.locator('.wb-alert')).toContainText('审批滞留')
  await expect(page.locator('.wb-alert')).toContainText(docNo)
  await expect(page.locator('.wb-alert')).toContainText('已超过')
  await shot(page, testInfo, 1, '提交时间超 5 天触发滞留预警')
  guards.assertClean()
})

test('[P5-05] 无 wm:overview / wm:alert / wm:message 时工作台裁剪', async ({ context, page }, testInfo) => {
  const role = await createTempRole(admin, { permissions: ['wm:view', 'wm:todo'] })
  roles.push(role.id)
  const user = await createTempUser(admin, role.id)
  users.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })

  // 2026-11-02 起预取按权限懒加载，工作台不再产生 403
  const guards = installGuards(page)
  await seedSession(context, session)
  await openWorkbench(page)

  await expect(page.locator('.ov-panel')).toHaveCount(0)
  await expect(page.getByText('我的单据', { exact: true })).toBeVisible()
  // 右侧只渲染「未开通」占位页签；sideTab 默认 alert 时该面板为隐藏态
  await expect(page.getByText('当前角色未开通预警与消息权限')).toBeAttached()
  await expect(page.getByText('预警中心', { exact: false })).toHaveCount(0)
  await expect(page.getByText('我的消息', { exact: false })).toHaveCount(0)
  // 只剩「待我审批 + 我在途」两格，没有预警格
  await expect(page.locator('.wb-stat')).toHaveCount(2)
  await expect(page.locator('.wb-stat').nth(1)).toContainText('我在途')
  await shot(page, testInfo, 1, '仅保留待办时的工作台')
})

// ---------------------------------------------------------------- P5-06 ~ P5-11 报表

test('[P5-06] 分类统计数量合计等于资产总数', async ({ context, page }, testInfo) => {
  const allAssets = await apiList(admin, 'fixed-assets')
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openReports(page)

  const cards = page.locator('.el-tab-pane:visible .stat-card')
  const cardCount = await cards.count()
  expect(cardCount).toBeGreaterThan(0)
  let sum = 0
  for (let i = 0; i < cardCount; i += 1) {
    sum += Number((await cards.nth(i).locator('.stat-value .num').innerText()).trim())
  }
  expect(sum).toBe(allAssets.length)

  const tableRows = page.locator('.el-tab-pane:visible .el-table__row')
  expect(await tableRows.count()).toBe(Math.min(cardCount, 15))
  await shot(page, testInfo, 1, '分类统计合计与资产总数一致')
  guards.assertClean()
})

test('[P5-07] 位置/部门/使用人统计可筛选', async ({ context, page }, testInfo) => {
  const suffix = uniqueSuffix()
  const location = `E2E_位置_统计_${suffix}`
  // 金额取全库最大量级，保证位置/部门统计按金额倒序时排到第一页
  const asset = await createAsset({ amount: 999_999_999, location, name: `E2E_统计资产_${suffix}` })
  const depts = await apiList(admin, 'org-departments', `companyId=${encodeURIComponent(orgUnits.companyId)}`)
  const deptName = String(depts.find(d => d.id === String(asset.deptId))?.name ?? '')

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openReports(page)

  await page.locator('.el-tabs__item').filter({ hasText: '位置统计' }).click()
  await expect(page.locator('.el-tab-pane:visible .el-table__row').first()).toContainText(location)

  await page.locator('.el-tabs__item').filter({ hasText: '部门统计' }).click()
  const deptRow = page.locator('.el-tab-pane:visible .el-table__row').filter({ hasText: deptName }).first()
  await expect(deptRow).toBeVisible()
  // 部门统计下钻：弹窗明细应包含本用例新建的 E2E_ 资产
  await deptRow.getByRole('button', { name: '查看明细' }).click()
  const deptDialog = page.getByRole('dialog')
  await expect(deptDialog).toBeVisible()
  await expect(deptDialog.locator('.el-table__row').filter({ hasText: `E2E_统计资产_${suffix}` })).toBeVisible()
  await deptDialog.getByRole('button', { name: '关闭', exact: true }).click()

  await page.locator('.el-tabs__item').filter({ hasText: '使用人统计' }).click()
  const userTab = page.locator('.el-tab-pane:visible')
  await userTab.getByPlaceholder('请输入').first().fill(String(admin.user.name))
  await userTab.getByRole('button', { name: '查询' }).click()
  const userRow = userTab.locator('.el-table__row').filter({ hasText: `E2E_统计资产_${suffix}` }).first()
  await expect(userRow).toBeVisible()
  // 使用人统计下钻：弹窗同样取同一份资产台账
  await userRow.getByRole('button', { name: '查看明细' }).click()
  const userDialog = page.getByRole('dialog')
  await expect(userDialog).toBeVisible()
  await expect(userDialog.locator('.el-table__row').filter({ hasText: `E2E_统计资产_${suffix}` })).toBeVisible()
  await userDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await userTab.getByRole('button', { name: '重置' }).click()
  await expect(userTab.getByPlaceholder('请输入').first()).toHaveValue('')
  await shot(page, testInfo, 1, '三个统计页签与使用人筛选')
  guards.assertClean()
})

test('[P5-08] 折旧明细月份筛选与重置', async ({ context, page }, testInfo) => {
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openReports(page)
  await page.locator('.el-tabs__item').filter({ hasText: '资产折旧明细' }).click()

  const pane = page.locator('.el-tab-pane:visible')
  const monthInput = pane.locator('.el-form-item').filter({ hasText: '折旧月份' }).locator('input').first()
  await expect(monthInput).toHaveValue(/\d{4}-\d{2}/)

  // 折旧页签里有两组筛选（明细 + 进度），只操作第一组
  const detailForm = pane.locator('.search-form').first()
  const nameInput = detailForm.locator('.el-form-item').filter({ hasText: '关键字' }).locator('input').first()
  await nameInput.fill(`E2E_不存在的资产_${uniqueSuffix()}`)
  await detailForm.getByRole('button', { name: '搜索' }).click()
  await expect(pane.locator('.el-table__empty-text').first()).toContainText('暂无数据')

  await detailForm.getByRole('button', { name: '重置' }).click()
  await expect(nameInput).toHaveValue('')
  await expect(pane.locator('.el-table__header').first()).toContainText('本期折旧额')
  await shot(page, testInfo, 1, '折旧月份与空态')
  guards.assertClean()
})

test('[P5-09] 固资报表导出列头、行数与 UTF-8 BOM', async ({ context, page }, testInfo) => {
  const allAssets = await apiList(admin, 'fixed-assets')
  const categoryCount = new Set(allAssets.map(a => String(a.category || '其他'))).size
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openReports(page)

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出报表' }).click()
  ])
  expect(download.suggestedFilename()).toMatch(/^导出_分类统计_\d{4}-\d{2}-\d{2}\.csv$/)
  const path = await download.path()
  expect(path).toBeTruthy()
  const bytes = fs.readFileSync(path as string)
  expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])

  const rows = csvRows(readDownloadedCsv(path as string))
  expect(rows[0]).toEqual(['资产分类', '数量', '总金额', '占比(%)'])
  expect(rows.length - 1).toBe(categoryCount)
  await expect(await page.locator('.el-message').last()).toContainText(/导出分类统计报表成功/)
  await shot(page, testInfo, 1, '导出 CSV 列头与 BOM')
  guards.assertClean()
})

test('[P5-10] 低值出入库汇总：入库 - 领用 + 退库 = 当前库存', async ({ context, page }, testInfo) => {
  const item = await createLowItem({ stock: 0, price: 12.5 })
  const docNo = `E2E_IN_P5_${uniqueSuffix()}`
  const inbound = await apiPost<Row>(admin, 'low-value-inbound', {
    docNo,
    itemId: item.id,
    category: 'OFFICE',
    itemName: item.name,
    categoryName: '办公用品',
    spec: item.spec,
    unit: '个',
    quantity: 5,
    price: 12.5,
    amount: 62.5,
    deptId: orgUnits.deptId,
    operator: admin.user.name,
    status: 'DONE',
    creatorId: admin.user.id,
    submitTime: new Date().toISOString(),
    settleTime: new Date().toISOString()
  })
  lowDocs.push({ key: 'low-value-inbound', id: String(inbound.id) })

  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/low-value-asset-reports')
  await waitSettled(page)
  await page.locator('.el-tabs__item').filter({ hasText: '出入库汇总' }).click()

  const pane = page.locator('.el-tab-pane:visible')
  await pane.getByPlaceholder('物品名称').fill(String(item.name))
  await page.waitForTimeout(200)
  const row = pane.locator('.el-table__row').first()
  await expect(row).toContainText(String(item.name))
  const cells = row.locator('td')
  await expect(cells.nth(4)).toHaveText('5') // 入库数量
  await expect(cells.nth(5)).toHaveText('0') // 领用数量
  await expect(cells.nth(6)).toHaveText('0') // 退库数量
  await expect(cells.nth(7)).toHaveText('5') // 当前库存
  await shot(page, testInfo, 1, '出入库汇总余额关系')
  guards.assertClean()
})

test('[P5-21] 低值报表使用人领用统计与明细下钻', async ({ context, page }, testInfo) => {
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/low-value-asset-reports')
  await waitSettled(page)
  await page.locator('.el-tabs__item').filter({ hasText: '使用人领用统计' }).click()

  const pane = page.locator('.el-tab-pane:visible')
  await expect(pane.locator('.el-table__header')).toContainText('领用人')
  // 有已生效领用单时才下钻；无数据的空态由 P5-20 覆盖
  const row = pane.locator('.el-table__row').first()
  if (await row.count()) {
    await row.getByRole('button', { name: '查看明细' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.el-table__header')).toContainText('单据编号')
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  }
  await shot(page, testInfo, 1, '使用人领用统计与下钻')
  guards.assertClean()
})

test('[P5-11] 低值导出与 lv:export 权限裁剪', async ({ context, page }, testInfo) => {
  const item = await createLowItem({ stock: 0, price: 5 })
  // 出入库汇总只列有单据活动的物品，先补一张已生效入库单
  const inbound = await apiPost<Row>(admin, 'low-value-inbound', {
    docNo: `E2E_IN_P5_${uniqueSuffix()}`,
    itemId: item.id,
    category: 'OFFICE',
    itemName: item.name,
    categoryName: '办公用品',
    spec: item.spec,
    unit: '个',
    quantity: 3,
    price: 5,
    amount: 15,
    deptId: orgUnits.deptId,
    operator: admin.user.name,
    status: 'DONE',
    creatorId: admin.user.id,
    submitTime: new Date().toISOString(),
    settleTime: new Date().toISOString()
  })
  lowDocs.push({ key: 'low-value-inbound', id: String(inbound.id) })

  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/low-value-asset-reports')
  await waitSettled(page)
  await page.locator('.el-tabs__item').filter({ hasText: '出入库汇总' }).click()

  const pane = page.locator('.el-tab-pane:visible')
  await pane.getByPlaceholder('物品名称').fill(String(item.name))
  await expect(pane.locator('.el-table__row').filter({ hasText: String(item.name) }).first()).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '导出报表' }).click()
  ])
  expect(download.suggestedFilename()).toMatch(/^导出_出入库汇总_\d{4}-\d{2}-\d{2}\.csv$/)
  const rows = csvRows(readDownloadedCsv((await download.path()) as string))
  expect(rows[0]).toEqual(['物品名称', '物品类别', '规格型号', '单位', '入库数量', '领用数量', '退库数量', '当前库存'])
  expect(rows.some(r => r[0] === item.name)).toBeTruthy()
  await shot(page, testInfo, 1, '低值导出仅含筛选结果')
  guards.assertClean()

  // 能进报表但没有 lv:export 的角色看不到导出按钮
  const role = await createTempRole(admin, { permissions: ['wm:view', 'lv:view', 'lv:report'] })
  roles.push(role.id)
  const user = await createTempUser(admin, role.id)
  users.push(user)
  const viewer = await loginViaApi({ username: user.username, password: user.password })
  const viewerGuards = installGuards(page)
  await seedSession(context, viewer)
  await page.goto('/low-value-asset-reports')
  await waitSettled(page)
  await expect(page.getByRole('button', { name: '导出报表' })).toHaveCount(0)
  await shot(page, testInfo, 2, '无 lv:export 不渲染导出按钮')
  viewerGuards.assertClean()
})

// ---------------------------------------------------------------- P5-18 ~ P5-20 消息

test('[P5-18] 审批结果站内信、未读数与已读跳转', async ({ context, page }, testInfo) => {
  const { doc } = await docAtAdminStep()
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openWorkbench(page)

  // 工作台通过最后一步 → 触发 notifyResult（approval_result 模板）
  const row = page.locator('.wb-todo .el-tab-pane:visible .el-table__row').filter({ hasText: doc.code }).first()
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '通过' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '审批信息' }).last()
  await dialog.locator('textarea').fill('E2E P5 通过')
  await dialog.getByRole('button', { name: '通过' }).click()
  await expect(await page.locator('.el-message').last()).toContainText(/审批已全部通过/)

  // 等消息落库
  let messageId = ''
  await expect.poll(async () => {
    const msgs = await apiList(admin, 'notify-messages')
    const found = msgs.find(m => String(m.title || '').includes(doc.code))
    messageId = found ? String(found.id) : ''
    return !!found
  }, { timeout: 15_000 }).toBe(true)

  await page.goto('/system/message-center')
  await waitSettled(page)
  // 收件箱由 notify store 异步加载，历史消息多时首帧可能还是 0，必须等到真实值
  await expect
    .poll(async () => Number(await page.locator('.kpi-value').first().innerText()), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1)
  const unreadBefore = Number(await page.locator('.kpi-value').first().innerText())

  const msgRow = page.locator('.el-table__row').filter({ hasText: doc.code }).first()
  await expect(msgRow).toContainText('未读')
  await expect(msgRow).toContainText('审批结果通知')
  await msgRow.getByRole('button', { name: '标记已读' }).click()
  await expect(msgRow).toContainText('已读')
  await expect.poll(async () => {
    const msgs = await apiList(admin, 'notify-messages')
    return msgs.find(m => m.id === messageId)?.read
  }).toBe(true)

  await page.goto('/system/message-center')
  await waitSettled(page)
  await expect
    .poll(async () => Number(await page.locator('.kpi-value').first().innerText()), { timeout: 15_000 })
    .toBe(unreadBefore - 1)
  await shot(page, testInfo, 1, '审批结果消息已读')
  guards.assertClean()
})

test('[P5-19] 消息模板新增、重复键与启停', async ({ context, page }, testInfo) => {
  const key = `e2e_tpl_${uniqueSuffix()}`
  const title = `E2E_模板标题_${uniqueSuffix()}`
  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/system/message-template')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '消息模板' })).toBeVisible()

  // 新增
  await page.getByRole('button', { name: '新增模板' }).click()
  let dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增模板' }).last()
  await dialog.locator('.el-form-item').filter({ hasText: '模板键' }).locator('input').first().fill(key)
  await dialog.locator('.el-form-item').filter({ hasText: '触发场景' }).locator('input').first().fill('E2E 场景')
  await dialog.locator('.el-form-item').filter({ hasText: '标题模板' }).locator('input').first().fill(title)
  await dialog.locator('.el-form-item').filter({ hasText: '内容模板' }).locator('textarea').fill('单据 {billNo} 结果 {result}')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(await page.locator('.el-message').last()).toContainText(/模板已新增/)

  // 重复键
  await page.getByRole('button', { name: '新增模板' }).click()
  dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增模板' }).last()
  await dialog.locator('.el-form-item').filter({ hasText: '模板键' }).locator('input').first().fill(key)
  await dialog.locator('.el-form-item').filter({ hasText: '触发场景' }).locator('input').first().fill('E2E 重复')
  await dialog.locator('.el-form-item').filter({ hasText: '标题模板' }).locator('input').first().fill('dup')
  await dialog.locator('.el-form-item').filter({ hasText: '内容模板' }).locator('textarea').fill('dup')
  await dialog.getByRole('button', { name: '保存' }).click()
  await expect(page.locator('.el-message--error').last()).toContainText(/已存在/)
  await dialog.getByRole('button', { name: '取消' }).click()

  // 关键字筛选定位到新模板（列表按 15 条分页，新模板可能落在第二页）
  await page.getByPlaceholder('模板键 / 场景 / 标题').fill(key)
  await page.waitForTimeout(200)

  // 模板预览渲染占位
  const tplRow = page.locator('.el-table__row').filter({ hasText: key }).first()
  await expect(tplRow).toContainText(title)
  await tplRow.getByRole('button', { name: '预览' }).click()
  const preview = page.locator('.el-dialog:visible').filter({ hasText: '模板预览' }).last()
  await preview.locator('.el-form-item').filter({ hasText: 'billNo' }).locator('input').fill('E2E-001')
  await preview.locator('.el-form-item').filter({ hasText: 'result' }).locator('input').fill('通过')
  await expect(preview.locator('.preview-content')).toContainText('单据 E2E-001 结果 通过')
  await preview.getByRole('button', { name: '关闭', exact: true }).click()

  // 停用
  const toggle = tplRow.locator('.el-switch')
  await toggle.click()
  await expect(await page.locator('.el-message').last()).toContainText(/已停用/)
  await expect.poll(async () => {
    const rows = await apiList(admin, 'notify-templates')
    return rows.find(r => r.key === key)?.enabled
  }).toBe(false)

  await shot(page, testInfo, 1, '模板新增/重复/预览/停用')
  guards.assertClean()

  await apiDeleteQuiet(admin, `/api/notify-templates/${key}`)
})

test('[P5-20] 报表空态不白屏', async ({ context, page }, testInfo) => {
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openReports(page)
  await page.locator('.el-tabs__item').filter({ hasText: '使用人统计' }).click()
  const pane = page.locator('.el-tab-pane:visible')
  await pane.getByPlaceholder('请输入').first().fill(`E2E_无人_${uniqueSuffix()}`)
  await pane.getByRole('button', { name: '查询' }).click()
  await expect(pane.locator('.el-table__empty-text').first()).toContainText('暂无数据')
  await expect(page.getByRole('heading', { name: '固定资产报表' })).toBeVisible()

  await page.goto('/low-value-asset-reports')
  await waitSettled(page)
  await page.locator('.el-tabs__item').filter({ hasText: '出入库汇总' }).click()
  const lowPane = page.locator('.el-tab-pane:visible')
  await lowPane.getByPlaceholder('物品名称').fill(`E2E_无人_${uniqueSuffix()}`)
  await page.waitForTimeout(200)
  await expect(lowPane.locator('.el-table__empty-text').first()).toContainText('暂无数据')
  await shot(page, testInfo, 1, '筛选无结果时为空态')
  guards.assertClean()
})
