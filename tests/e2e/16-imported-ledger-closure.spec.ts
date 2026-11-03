import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { pickOrgUnit } from './fixtures/data'
import { createDoc } from './fixtures/fixedAsset'
import { installGuards } from './fixtures/net'
import { apiDeleteQuiet, apiList, apiUpload, withApi, type Row } from './fixtures/p5'

/**
 * 期初台账数据形态闭环（P2-1 / P2-2）。
 *
 * 真实上线的第一步是导入存量台账：资产有「使用中 / 借出中 / 维修中」状态，
 * 但历史单据并没有进系统。这类数据必须满足：
 * - 状态与使用人正确落库；
 * - 资产详情不伪造单据（BUG-004：曾经任何资产都显示同一批演示单号）；
 * - 建了真实单据后，详情能立刻查到该单号。
 *
 * 夹具是固定文件（UTF-8 BOM），不用 Excel 另存，避免被转成 GBK 丢列。
 */

const FIXTURE = path.resolve(process.cwd(), 'tests/e2e/fixtures/seed-ledger.csv')
const LOCATION = 'E2E_期初机房'
/** 演示数据的单号特征：详情里出现任意一个都说明还在用硬编码假记录 */
const DEMO_DOC_RE = /(PD|FP|JC|WX|DB|BG|CZ)2026/

let admin: Session
let units: { companyId: string; deptId: string }
/** 夹具里的占位符要替换成运行库真实主数据：不同环境公司/部门/人员名称并不相同 */
let placeholders: { company: string; dept: string; users: string[] } = { company: '', dept: '', users: [] }
/** 首批导入结果：用例之间不依赖执行顺序，beforeAll 先保证台账存在 */
let initialImport: Awaited<ReturnType<typeof importFixture>>
const cleanups: Array<() => Promise<void>> = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  units = await pickOrgUnit(admin)

  const companies = await apiList(admin, 'org-companies')
  const depts = await apiList(admin, 'org-departments', `companyId=${encodeURIComponent(units.companyId)}`)
  const users = await apiList(admin, 'org-users')

  const company = companies.find(c => String(c.id) === units.companyId)
  const dept = depts.find(d => String(d.id) === units.deptId)
  // 使用人用登录账号（唯一），避免同名人员导致「存在多个同名人员」
  const accountOf = row => String(row.username ?? row.id)
  placeholders = {
    company: String(company?.name ?? ''),
    dept: String(dept?.name ?? ''),
    users: users.slice(0, 3).map(accountOf)
  }
  expect(placeholders.company, '运行库缺少公司主数据').not.toBe('')
  expect(placeholders.dept, '运行库缺少部门主数据').not.toBe('')
  expect(placeholders.users.length, '运行库缺少用户主数据').toBeGreaterThan(0)

  initialImport = await importFixture()
})

test.afterAll(async () => {
  for (const fn of cleanups.reverse()) await fn().catch(() => null)
})

function fixtureBuffer(): Buffer {
  const raw = fs.readFileSync(FIXTURE)
  // BOM 必须存在：Excel 另存成 GBK 后首列表头会变成乱码，后端直接报缺列
  expect(raw.subarray(0, 3), '夹具必须是 UTF-8 BOM').toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  // 编辑器保存时可能追加第二个 BOM，这里一次性清理掉
  const text = raw.toString('utf8').replace(/^\uFEFF+/, '')
  const header = text.split(/\r?\n/)[0]
  expect(header).toBe(
    '资产名称,资产分类,资产编号,品牌,规格型号,所属公司,使用部门,使用人,存放地点,购置日期,购置金额,资产原值,净值,购置方式,状态,是否计提折旧'
  )

  // 占位符换成运行库里的真实名称/账号，保证同一份夹具在任何环境都能重复导入
  const users = placeholders.users
  const filled = text
    .replace(/__COMPANY__/g, placeholders.company)
    .replace(/__DEPT__/g, placeholders.dept)
    .replace(/__USER1__/g, users[0] ?? '')
    .replace(/__USER2__/g, users[1] ?? users[0] ?? '')
    .replace(/__USER3__/g, users[2] ?? users[0] ?? '')

  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(filled, 'utf8')])
}

async function importFixture() {
  const res = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'seed-ledger.csv',
    buffer: fixtureBuffer()
  })
  expect(res.status, `导入失败 HTTP ${res.status}`).toBe(200)
  expect(res.body.code, JSON.stringify(res.body)).toBe(0)
  return res.body.data as {
    total: number
    createdAssets: number
    reusedAssets: number
    createdLocations: number
    status: string
    failures?: unknown[]
  }
}

async function findAsset(code: string): Promise<Row | undefined> {
  const rows = await apiList(admin, 'fixed-assets', `keyword=${encodeURIComponent(code)}`)
  return rows.find(r => String(r.code) === code)
}

test('[P8-01] 期初台账导入：三种状态与使用人正确落库，且幂等', async () => {
  const first = initialImport
  expect(['SUCCESS', 'OK'], `导入被拒绝：${JSON.stringify(first.failures ?? [])}`).toContain(first.status)
  expect(first.total).toBe(3)
  // 首次为新增 3 条；重复执行时全部命中「已存在则复用」，createdAssets=0 也算通过
  expect(first.createdAssets + first.reusedAssets).toBeGreaterThanOrEqual(3)

  for (const [code, status] of [
    ['E2E_LEDGER_USE_001', 'IN_USE'],
    ['E2E_LEDGER_BORROW_001', 'BORROWED'],
    ['E2E_LEDGER_REPAIR_001', 'REPAIRING']
  ] as const) {
    const asset = await findAsset(code)
    expect(asset, `${code} 应落库`).toBeTruthy()
    expect(String(asset?.status), `${code} 状态`).toBe(status)
    // 使用人按账号/姓名匹配落成 userId，导入后必须能带出使用人
    expect(String(asset?.userId ?? ''), `${code} 使用人应落库`).not.toBe('')
    cleanups.push(() => apiDeleteQuiet(admin, `/api/fixed-assets/${asset?.id}`))
  }

  // 再导一次：已存在的编号只复用，不新增、不覆盖
  const second = await importFixture()
  expect(second.createdAssets).toBe(0)
  expect(second.reusedAssets).toBe(3)
  const again = await findAsset('E2E_LEDGER_USE_001')
  expect(String(again?.status)).toBe('IN_USE')

  const locations = await apiList(admin, 'fixed-asset-settings-locations', `keyword=${encodeURIComponent(LOCATION)}`)
  for (const loc of locations.filter(l => String(l.name) === LOCATION)) {
    cleanups.push(() => apiDeleteQuiet(admin, `/api/fixed-asset-settings-locations/${loc.id ?? loc.code}`))
  }
})

test('[P8-02] 期初资产详情不伪造单据：显示空态而非演示单号', async ({ context, page }, testInfo) => {
  const asset = await findAsset('E2E_LEDGER_USE_001')
  expect(asset, '需先执行 P8-01 导入夹具').toBeTruthy()

  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/fixed-assets?tab=asset')
  await waitSettled(page)

  await page.getByPlaceholder('资产编号/资产名称').fill('E2E_LEDGER_USE_001')
  await page.getByRole('button', { name: '查询' }).click()
  await waitSettled(page)

  // 编号列宽固定，超长会省略显示，按行定位再点第一个链接更稳
  await page.locator('.el-table__body .el-table__row').first().locator('.el-link').first().click()
  const drawer = page.locator('.el-drawer:visible').first()
  await expect(drawer).toBeVisible()

  await expect(drawer.locator('.record-empty')).toContainText('期初导入，暂无关联单据')
  const text = (await drawer.innerText()).replace(/\s+/g, ' ')
  expect(text, `资产详情出现演示单号：${text.match(DEMO_DOC_RE)?.[0] ?? ''}`).not.toMatch(DEMO_DOC_RE)

  await shot(page, testInfo, 1, '期初资产详情为空态')
  guards.assertClean()
})

test('[P8-03] 新建派发单后资产详情立即出现真实单号', async ({ context, page }, testInfo) => {
  const asset = await findAsset('E2E_LEDGER_BORROW_001')
  expect(asset, '需先执行 P8-01 导入夹具').toBeTruthy()

  const doc = await createDoc(admin, units, 'alloc', { assetId: String(asset?.id) })
  cleanups.push(() => apiDeleteQuiet(admin, `/api/fixed-asset-doc-lists-alloc/${doc.id}`))

  const guards = installGuards(page)
  await seedSession(context, admin)
  await page.goto('/fixed-assets?tab=asset')
  await waitSettled(page)

  await page.getByPlaceholder('资产编号/资产名称').fill('E2E_LEDGER_BORROW_001')
  await page.getByRole('button', { name: '查询' }).click()
  await waitSettled(page)
  await page.locator('.el-table__body .el-table__row').first().locator('.el-link').first().click()

  const drawer = page.locator('.el-drawer:visible').first()
  await expect(drawer).toBeVisible()
  // 派发/退库页签里应出现刚建的真实单号，且空态消失
  await drawer.locator('.el-tabs__item', { hasText: '派发退库' }).click()
  await expect(drawer).toContainText(doc.code)
  await expect(drawer.locator('.record-empty')).toHaveCount(0)

  await shot(page, testInfo, 1, '资产详情显示真实派发单')
  guards.assertClean()
})

test('[P8-04] 夹具缺 BOM、缺列或列名错位时必须给出明确失败提示', async () => {
  const text = fixtureBuffer().toString('utf8').replace(/^\uFEFF+/, '')

  // 情况一：去掉 BOM。UTF-8 本身不依赖 BOM，允许成功，但必须落库正确，不能静默写入错位数据
  const noBom = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'no-bom.csv',
    buffer: Buffer.from(text, 'utf8')
  })
  expect(noBom.body.code, JSON.stringify(noBom.body)).toBe(0)
  expect(['SUCCESS', 'OK', 'REJECTED_INVALID']).toContain(String(noBom.body.data.status))
  if (['SUCCESS', 'OK'].includes(String(noBom.body.data.status))) {
    const still = await findAsset('E2E_LEDGER_USE_001')
    expect(String(still?.status), '无 BOM 导入不应打乱状态列').toBe('IN_USE')
    expect(String(still?.userId ?? ''), '无 BOM 导入不应打乱使用人列').not.toBe('')
  }

  // 情况二：删掉必填列「资产分类」，必须整批拒绝并明确指出缺哪一列
  const lines = text.split(/\r?\n/)
  const dropIndex = lines[0].split(',').indexOf('资产分类')
  const dropColumn = (line: string) => line.split(',').filter((_, i) => i !== dropIndex).join(',')
  const missingCol = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'missing-column.csv',
    buffer: Buffer.from(lines.map(dropColumn).join('\r\n'), 'utf8')
  })
  expect(missingCol.body.code).toBe(0)
  expect(String(missingCol.body.data.status), '缺列应被整批拒绝').toBe('REJECTED_INVALID')
  expect(JSON.stringify(missingCol.body.data.failures ?? [])).toMatch(/缺少列|表头/)
  expect(JSON.stringify(missingCol.body.data.failures ?? []), '提示里要点名缺失的列').toContain('资产分类')

  // 情况三：列名顺序调换（导入按表头名匹配，值会整体错位），必须被行校验拦截而不是静默入库
  const swapped = text.split(/\r?\n/)
  swapped[0] = '资产编号,资产名称,资产分类,品牌,规格型号,所属公司,使用部门,使用人,存放地点,购置日期,购置金额,资产原值,净值,购置方式,状态,是否计提折旧'
  const misaligned = await apiUpload(admin, '/api/data-import/fixed-asset-upload?abortOnError=true', {
    name: 'bad-header.csv',
    buffer: Buffer.from(swapped.join('\r\n'), 'utf8')
  })
  expect(misaligned.body.code).toBe(0)
  expect(String(misaligned.body.data.status), '列值错位应被拒绝').toBe('REJECTED_INVALID')
  expect(JSON.stringify(misaligned.body.data.failures ?? [])).toMatch(/不合法|缺少列|表头/)
})
