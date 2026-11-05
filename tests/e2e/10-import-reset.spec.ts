import fs from 'node:fs'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { pickOrgUnit, uniqueSuffix } from './fixtures/data'
import { installGuards } from './fixtures/net'
import {
  apiDeleteQuiet,
  apiList,
  apiUpload,
  csvBuffer,
  csvRows,
  readDownloadedCsv,
  toJson,
  withApi,
  type Row
} from './fixtures/p5'

/**
 * P5 导入 / 清空预览（P5-12 ~ P5-17）。
 *
 * 导入文件统一由 csvBuffer 生成（UTF-8 BOM + CRLF），不使用 Excel 另存；
 * 清空只验证预览与确认校验，绝不执行真实清库（由人工在重导窗口操作）。
 */

let admin: Session
let orgUnits: { companyId: string; deptId: string }
let companyName = ''
let deptName = ''

const cleanups: Array<() => Promise<void>> = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  orgUnits = await pickOrgUnit(admin)
  const companies = await apiList(admin, 'org-companies')
  const depts = await apiList(admin, 'org-departments', `companyId=${encodeURIComponent(orgUnits.companyId)}`)
  companyName = String(companies.find(c => c.id === orgUnits.companyId)?.name ?? '')
  deptName = String(depts.find(d => d.id === orgUnits.deptId)?.name ?? '')
})

test.afterAll(async () => {
  for (const fn of cleanups.reverse()) {
    await fn().catch(() => null)
  }
})

// ---------------------------------------------------------------- 工具

const ORG_HEADERS = [
  '公司名称', '公司编码', '部门名称', '上级部门', '姓名', '登录账号',
  '初始口令', '岗位', '手机', '邮箱', '角色', '状态'
]

const LOW_HEADERS = [
  '物品类别', '物品名称', '规格型号', '单位', '物品单价',
  '期初库存', '安全库存', '存放位置', '状态', '物品编码'
]

const ASSET_HEADERS = [
  '资产名称', '资产分类', '资产编号', '品牌', '规格型号', '所属公司', '使用部门',
  '使用人', '存放地点', '购置日期', '购置金额', '资产原值', '净值', '购置方式', '状态', '是否计提折旧'
]

async function openImport(page: Page): Promise<void> {
  await page.goto('/system/data-import')
  await waitSettled(page)
  await expect(page.getByRole('heading', { name: '数据导入' })).toBeVisible()
}

async function switchMode(page: Page, label: string): Promise<void> {
  await page.locator('.mode-card').filter({ hasText: label }).click()
}

/** 模板下载是前端 Blob，偶发首次点击未产生 download 事件，重试一次 */
async function triggerDownload(page: Page, button: Locator) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 10_000 }),
        button.click()
      ])
      return download
    } catch (error) {
      if (attempt === 1) throw error
      await page.waitForTimeout(300)
    }
  }
  throw new Error('模板下载未触发')
}

async function uploadCsv(page: Page, name: string, buffer: Buffer): Promise<void> {
  await page.locator('.el-upload input[type=file]').first().setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer
  })
  await expect(page.locator('.file-name')).toContainText(name)
  await page.getByRole('button', { name: '开始导入' }).click()
}

function resultCard(page: Page) {
  return page.locator('.el-card').filter({ hasText: '导入结果' }).last()
}

async function metric(page: Page, label: string): Promise<string> {
  return (await resultCard(page).locator('.metric').filter({ hasText: label }).locator('.metric-value').first().innerText()).trim()
}

async function expectStatus(page: Page, text: string): Promise<void> {
  await expect(resultCard(page).locator('.result-header .el-tag')).toContainText(text)
}

async function findOne(key: string, keyword: string): Promise<Row | undefined> {
  const rows = await apiList(admin, key, `keyword=${encodeURIComponent(keyword)}`)
  return rows.find(r => Object.values(r).some(v => String(v) === keyword))
}

// ---------------------------------------------------------------- P5-12 模板下载

test('[P5-12] 三类导入模板：表头、# 说明行与 UTF-8 BOM', async ({ context, page }, testInfo) => {
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)

  const cases = [
    { mode: '组织架构导入', button: '下载组织架构模板', name: /org-structure-template\.csv$/, header: '公司名称' },
    { mode: '低值资产导入', button: '下载低值资产模板', name: /low-value-items-template\.csv$/, header: '期初库存' },
    { mode: '固定资产导入', button: '下载固定资产模板', name: /fixed-assets-template\.csv$/, header: '资产分类' }
  ]

  for (const item of cases) {
    await switchMode(page, item.mode)
    const download = await triggerDownload(page, page.getByRole('button', { name: item.button }))
    expect(download.suggestedFilename()).toMatch(item.name)
    const path = await download.path()
    const bytes = fs.readFileSync(path as string)
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
    const rows = csvRows(readDownloadedCsv(path as string))
    expect(rows[0]).toContain(item.header)
    expect(rows[1][0].startsWith('#')).toBe(true)
    expect(rows[2][0].startsWith('#')).toBe(true)
  }

  await shot(page, testInfo, 1, '三类模板均带 BOM 与说明行')
  guards.assertClean()
})

// ---------------------------------------------------------------- P5-13 组织架构导入

test('[P5-13] 组织架构单表导入：公司/部门/人员去重创建', async ({ context, page }, testInfo) => {
  const suffix = uniqueSuffix()
  const company = `E2E_公司_${suffix}`
  const dept = `E2E_部门_${suffix}`
  const name = `E2E_人员_${suffix}`
  const username = `e2e_imp_${suffix}`
  const password = 'E2e@2026test'
  const buffer = csvBuffer(ORG_HEADERS, [
    [company, '', '', '', '', '', '', '', '', '', '', ''],
    [company, '', dept, '', '', '', '', '', '', '', '', ''],
    [company, '', dept, '', name, username, password, 'E2E', '', '', 'ROLE_USER', 'ENABLED']
  ], ['# 说明行：公司名称必填，可只填公司', '# 示例行：同一公司多行只创建一次'])

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)
  await switchMode(page, '组织架构导入')
  await uploadCsv(page, 'org-e2e.csv', buffer)

  await expectStatus(page, '全部成功')
  expect(await metric(page, '新建公司')).toBe('1')
  expect(await metric(page, '新建部门')).toBe('1')
  expect(await metric(page, '新建用户')).toBe('1')

  const user = await findOne('org-users', username)
  expect(user, '导入的用户应落库').toBeTruthy()
  const importedCompany = await findOne('org-companies', company)
  const importedDept = await findOne('org-departments', dept)
  expect(importedCompany).toBeTruthy()
  expect(importedDept).toBeTruthy()

  cleanups.push(async () => {
    await apiDeleteQuiet(admin, `/api/org-users/${user!.id}`)
    await apiDeleteQuiet(admin, `/api/org-departments/${importedDept!.id}`)
    await apiDeleteQuiet(admin, `/api/org-companies/${importedCompany!.id}`)
  })

  // 初始口令可用，且角色按编码映射
  const login = await loginViaApi({ username, password })
  expect(login.user.name).toBe(name)
  expect(login.user.roleIds.length).toBeGreaterThanOrEqual(1)

  await shot(page, testInfo, 1, '组织架构单表导入结果')
  guards.assertClean()
})

// ---------------------------------------------------------------- P5-14 低值导入

test('[P5-14] 低值资产导入：期初库存不生成入库单且重复导入不累加', async ({ context, page }, testInfo) => {
  const suffix = uniqueSuffix()
  const itemName = `E2E_导入物品_${suffix}`
  const location = `E2E_导入库位_${suffix}`
  const buffer = csvBuffer(LOW_HEADERS, [
    ['办公用品', itemName, 'A4', '包', '12.5', '7', '3', location, '正常', '']
  ])

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)
  await switchMode(page, '低值资产导入')
  await uploadCsv(page, 'low-e2e.csv', buffer)

  await expectStatus(page, '全部成功')
  expect(await metric(page, '新建物品')).toBe('1')
  expect(await metric(page, '新建存放位置')).toBe('1')

  let item = await findOne('low-value-items', itemName)
  expect(item?.stock).toBe(7)
  expect(Number(item?.price)).toBe(12.5)
  const locationRow = await findOne('low-value-settings-locations', location)
  expect(locationRow, '存放位置应自动建档').toBeTruthy()

  cleanups.push(async () => {
    // 库存未清零时物品受保护，先清零再删；存放位置主键是 code 而非 id
    await withApi(admin, async api => {
      const current = await api.get(`/api/low-value-items/${item!.id}`)
      if (current.ok()) {
        const row = (await current.json()).data
        if (row) {
          await api
            .put(`/api/low-value-items/${item!.id}`, { data: { ...row, stock: 0, reserved: 0 } })
            .catch(() => null)
        }
      }
    })
    await apiDeleteQuiet(admin, `/api/low-value-items/${item!.id}`)
    // 低值位置主键是 id（code 是业务编码），固资位置主键是 code
    await apiDeleteQuiet(admin, `/api/low-value-settings-locations/${locationRow!.id ?? locationRow!.code}`)
  })

  // 重复导入：复用物品，库存不累加
  await uploadCsv(page, 'low-e2e.csv', buffer)
  await expectStatus(page, '全部成功')
  expect(await metric(page, '复用物品')).toBe('1')
  item = await findOne('low-value-items', itemName)
  expect(item?.stock).toBe(7)

  // 期初库存不产生入库单
  const inbound = await apiList(admin, 'low-value-inbound', `keyword=${encodeURIComponent(itemName)}`)
  expect(inbound.filter(d => String(d.itemName) === itemName)).toHaveLength(0)

  await shot(page, testInfo, 1, '低值导入与重复导入不累加')
  guards.assertClean()
})

// ---------------------------------------------------------------- P5-15 固资导入

test('[P5-15] 固定资产导入：名称匹配组织、地点自动建档', async ({ context, page }, testInfo) => {
  const suffix = uniqueSuffix()
  const assetName = `E2E_导入资产_${suffix}`
  const location = `E2E_导入地点_${suffix}`
  const buffer = csvBuffer(ASSET_HEADERS, [
    [assetName, '电子设备', '', 'E2E', 'P5', companyName, deptName, String(admin.user.name),
      location, '2026-03-12', '8500', '8500', '7650', '购买', '空闲', '是']
  ])

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)
  await switchMode(page, '固定资产导入')
  await uploadCsv(page, 'asset-e2e.csv', buffer)

  await expectStatus(page, '全部成功')
  expect(await metric(page, '新建资产')).toBe('1')
  expect(await metric(page, '新建存放地点')).toBe('1')

  const asset = await findOne('fixed-assets', assetName)
  expect(asset, '资产应落库').toBeTruthy()
  expect(asset?.location).toBe(location)
  expect(String(asset?.companyId)).toBe(orgUnits.companyId)
  expect(String(asset?.deptId)).toBe(orgUnits.deptId)
  expect(String(asset?.userId)).toBe(String(admin.user.id))

  const locationRow = await findOne('fixed-asset-settings-locations', location)
  expect(locationRow, '存放地点应自动建档').toBeTruthy()

  cleanups.push(async () => {
    await apiDeleteQuiet(admin, `/api/fixed-assets/${asset!.id}`)
    await apiDeleteQuiet(admin, `/api/fixed-asset-settings-locations/${locationRow!.id ?? locationRow!.code}`)
  })

  await shot(page, testInfo, 1, '固资导入匹配组织与地点')
  guards.assertClean()
})

// ---------------------------------------------------------------- P5-16 行级错误

test('[P5-16] 整批校验拒绝 / 跳过错误行部分成功 / 缺列提示', async () => {
  const suffix = uniqueSuffix()
  const goodName = `E2E_错误行资产_${suffix}`
  const buffer = csvBuffer(ASSET_HEADERS, [
    [goodName, '电子设备', '', '', '', '', '', '', '', '', '1000', '1000', '1000', '', '', ''],
    [`E2E_坏行_${suffix}`, '不存在的分类', '', '', '', '', '', '', '', '', '1000', '1000', '1000', '', '', '']
  ])

  // 整批模式：任一行不合法 → 整批拒绝、零落库
  const strict = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'strict.csv',
    buffer
  })
  expect(strict.body.code).toBe(0)
  expect(strict.body.data.status).toBe('REJECTED_INVALID')
  expect(strict.body.data.failures.length).toBeGreaterThanOrEqual(1)
  expect(String(strict.body.data.failures[0].message)).toContain('分类')
  expect(strict.body.data.createdAssets || 0).toBe(0)
  expect(await findOne('fixed-assets', goodName)).toBeFalsy()

  // 跳过模式：好行落库、坏行返回明细
  const skip = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=false', {
    name: 'skip.csv',
    buffer
  })
  expect(skip.body.data.status).toBe('PARTIAL')
  expect(skip.body.data.createdAssets).toBe(1)
  expect(skip.body.data.failures.length).toBeGreaterThanOrEqual(1)
  expect(Number(skip.body.data.failures[0].row)).toBe(3)

  const good = await findOne('fixed-assets', goodName)
  expect(good, '跳过模式下合法行应写入').toBeTruthy()
  cleanups.push(async () => {
    await apiDeleteQuiet(admin, `/api/fixed-assets/${good!.id}`)
  })

  // 缺列：表头不含必填列
  const missing = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'missing-column.csv',
    buffer: csvBuffer(['资产名称', '资产编号'], [[`E2E_缺列_${suffix}`, '']])
  })
  expect(missing.body.data.status).toBe('REJECTED_INVALID')
  expect(String(missing.body.data.failures[0].message)).toContain('缺少列')
})

// ---------------------------------------------------------------- P5-17 清空预览

test('[P5-17] 清空预览条数准确且必须输入「清空」确认', async ({ context, page }, testInfo) => {
  const before = await apiList(admin, 'fixed-assets')
  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)

  await page.getByRole('button', { name: '清空固定资产' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '清空固定资产数据' }).last()
  await expect(dialog).toBeVisible()
  const previewRows = dialog.locator('.el-table__row')
  await expect(previewRows.first()).toBeVisible()

  // 合计 = 明细逐行之和
  let sum = 0
  const rowCount = await previewRows.count()
  for (let i = 0; i < rowCount; i += 1) {
    sum += Number((await previewRows.nth(i).locator('td').nth(1).innerText()).trim())
  }
  const total = Number((await dialog.locator('.reset-total b').innerText()).trim())
  expect(total).toBe(sum)
  expect(total).toBeGreaterThan(0)

  const confirmBtn = dialog.getByRole('button', { name: '确认清空' })
  await expect(confirmBtn).toBeDisabled()
  const confirmInput = dialog.getByPlaceholder('清空')
  await confirmInput.fill('清空')
  await expect(confirmBtn).toBeEnabled()
  await shot(page, testInfo, 1, '清空预览与二次确认')

  // 取消，不执行清空；数据条数不变
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toHaveCount(0)
  expect((await apiList(admin, 'fixed-assets')).length).toBe(before.length)

  // 接口层：confirm 不匹配必须拒绝
  const rejected = await withApi(admin, async api => {
    const res = await api.post('/api/data-import/reset?scope=fixed-asset&confirm=nope')
    return { status: res.status(), body: await res.json() }
  })
  expect(rejected.body.code === 0).toBe(false)
  expect((await apiList(admin, 'fixed-assets')).length).toBe(before.length)

  guards.assertClean()
})

// ---------------------------------------------------------------- P5-18 期初状态告警

test('[P5-18] 期初「借出中」告警但放行：结果区显示告警明细，资产标注来源', async ({ context, page }, testInfo) => {
  const suffix = uniqueSuffix()
  const assetName = `E2E_期初借出_${suffix}`
  const code = `E2E_BR_${suffix}`
  const buffer = csvBuffer(ASSET_HEADERS, [
    [assetName, '电子设备', code, '', '', companyName, deptName, '', '',
      '2026-03-12', '8500', '8500', '7650', '购买', '借出中', '是']
  ])

  const guards = installGuards(page)
  await seedSession(context, admin)
  await openImport(page)
  await switchMode(page, '固定资产导入')
  await uploadCsv(page, 'asset-legacy-state.csv', buffer)

  // 告警不阻断导入：状态仍是「全部成功」，但结果区单独给一张告警表
  await expectStatus(page, '全部成功')
  expect(await metric(page, '新建资产')).toBe('1')
  await expect(resultCard(page).getByText('需补录业务单据', { exact: false })).toBeVisible()
  await expect(resultCard(page).getByRole('cell', { name: /期初导入/ })).toBeVisible()
  await expect(resultCard(page).getByText('失败原因')).toHaveCount(0)

  const asset = await findOne('fixed-assets', assetName)
  expect(asset, '告警行应已落库').toBeTruthy()
  expect(String(asset?.status)).toBe('BORROWED')
  expect(String(asset?.sourceTag)).toBe('期初导入')
  cleanups.push(async () => {
    await apiDeleteQuiet(admin, `/api/fixed-assets/${asset!.id}`)
  })

  await shot(page, testInfo, 1, '期初状态导入告警与来源标注')
  guards.assertClean()
})
