import { expect, test } from '@playwright/test'
import { loginViaApi, seedSession } from './fixtures/auth'
import { apiList, withApi } from './fixtures/p5'
import { REAL_ORG_DEPTS } from './fixtures/realOrg'

/**
 * 全角色权限梳理后的接口级 + 界面级回归（2026-11-05）。
 *
 * 背景：资产使用人陈学知登录后能看到固定资产全部 8 个页签，却发起不了借出/报修；
 * 同时部门主管持有台账编辑、派发、盘点执行权，财务/仓管/审计又缺必要权限。
 * RP-01~RP-04 做 HTTP 边界探测，不写业务数据（`PUT /batch` 传空数组，
 * 与 `fixtures/permissionMatrix.ts` 的 probeResource 同口径：只关心是否被 403 拦下）；
 * RP-05~RP-06 用真实账号打开界面，复核页签显隐与「能发起 / 不能发起」的按钮，
 * 只浏览不提交，同样不产生业务数据。
 *
 * 目标矩阵与下列四处保持单一口径，任一处调整都要同步：
 *   fams-backend/sql/04-maintenance/11-role-permissions.sql
 *   fams-backend/src/main/resources/db/seed.sql
 *   fams-backend/sql/02-seed/00-baseline.sql / deploy/sql/mysql/baseline-data.sql
 *   fams-frontend/src/services/mock/seed/org.js
 */

const TARGET_PERMISSIONS: Record<string, string[]> = {
  R1: [
    'fa:view', 'fa:add', 'fa:edit', 'fa:delete', 'fa:export', 'fa:inbound', 'fa:dispatch',
    'fa:borrow', 'fa:change', 'fa:dispose', 'fa:repair', 'fa:inventory', 'fa:depreciation',
    'fa:report', 'fa:settings', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound',
    'lv:requisition', 'lv:return', 'lv:report', 'lv:settings', 'wm:view', 'wm:todo',
    'wm:alert', 'wm:overview', 'wm:message', 'org:company', 'org:dept', 'org:user',
    'org:role', 'sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message',
    'sys:template', 'sys:terminal', 'sys:import'
  ],
  R2: [
    'fa:view', 'fa:add', 'fa:edit', 'fa:export', 'fa:inbound', 'fa:dispatch', 'fa:borrow',
    'fa:change', 'fa:dispose', 'fa:repair', 'fa:inventory', 'fa:depreciation', 'fa:report',
    'fa:settings', 'lv:view', 'lv:edit', 'lv:export', 'lv:inbound', 'lv:requisition',
    'lv:return', 'lv:report', 'lv:settings', 'wm:view', 'wm:todo', 'wm:alert',
    'wm:overview', 'wm:message'
  ],
  R3: [
    'fa:view', 'fa:borrow', 'fa:change', 'fa:repair', 'lv:view', 'lv:inbound',
    'lv:requisition', 'lv:return', 'wm:view', 'wm:todo', 'wm:message'
  ],
  R4: [
    'fa:view', 'fa:export', 'fa:depreciation', 'fa:report', 'lv:view', 'lv:report',
    'sys:log', 'wm:view', 'wm:todo', 'wm:overview', 'wm:message'
  ],
  R5: [
    'fa:view', 'fa:report', 'lv:view', 'lv:requisition', 'lv:report', 'wm:view',
    'wm:todo', 'wm:alert', 'wm:message'
  ],
  R6: [
    'fa:view', 'fa:export', 'fa:report', 'lv:view', 'lv:report', 'sys:log', 'wm:view',
    'wm:todo', 'wm:overview', 'wm:message'
  ],
  R7: [
    'fa:view', 'fa:report', 'lv:view', 'lv:report', 'wm:view', 'wm:todo',
    'wm:overview', 'wm:message'
  ],
  R8: [
    'fa:view', 'fa:inbound', 'fa:report', 'lv:view', 'lv:inbound', 'lv:requisition',
    'lv:return', 'lv:report', 'wm:view', 'wm:todo', 'wm:alert', 'wm:message'
  ]
}

/**
 * 生产库存量配置偏差：2026-11-09 DDL 前只读快照核对，R3 比 seed 目标口径多两个
 * 只读报表权限，且在本次固定资产口径落地之前就已存在（update_by=admin）。
 * 用户明确要求不得改写存量数据，故不擅自回收；此处显式登记为待裁决项，
 * 任何「新增」偏差仍会让 RP-01 失败。裁决回收后同步四处基线并删除本常量。
 */
const PRODUCTION_DRIFT: Record<string, string[]> = {
  R3: ['fa:report', 'lv:report']
}

const sorted = (arr: string[]) => [...arr].sort()
const dept = (name: string) => {
  const found = REAL_ORG_DEPTS.find(d => d.deptName === name)
  if (!found) throw new Error(`真实组织矩阵里没有部门 ${name}`)
  return found
}

/** 空批量写只用来判断「是否越过鉴权层」，不会产生任何业务数据 */
async function probeWrite(session: Awaited<ReturnType<typeof loginViaApi>>, keys: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  await withApi(session, async api => {
    for (const key of keys) {
      const res = await api.put(`/api/${key}/batch`, { data: [] })
      result[key] = res.status()
    }
  })
  return result
}

test('[RP-01] 生产库 8 个内置角色权限与梳理口径一致', async () => {
  const roles = await apiList(await loginViaApi(), 'org-roles')
  for (const [id, expected] of Object.entries(TARGET_PERMISSIONS)) {
    const row = roles.find(r => String(r.id) === id)
    expect(row, `角色 ${id} 不存在`).toBeTruthy()
    const actual: string[] = Array.isArray(row!.permissions) ? row!.permissions.map(String) : []
    const drift = sorted(actual.filter(p => !expected.includes(p)))
    expect(drift, `${id} 出现未登记的存量权限偏差（新增权限须先同步目标矩阵）`)
      .toEqual(sorted(PRODUCTION_DRIFT[id] ?? []))
    expect(sorted(actual.filter(p => expected.includes(p))), `${id} 目标口径权限缺失`).toEqual(sorted(expected))
  }
  // 自定义「领导班子」角色与 40 个权限码契约由管理员保留，本轮不改动
  expect(roles.find(r => String(r.id) === 'mvu9z81n35'), '领导班子角色应保留').toBeTruthy()
})

test('[RP-02] 陈学知（R3）：可发起借出/报修/变更，不能处置/调拨/派发/入库/盘点/改台账', async () => {
  const chen = dept('产品研发一部').actors.user
  const session = await loginViaApi({ username: chen.username, password: chen.password })
  const allowed = [
    'fixed-asset-doc-lists-borrow',
    'fixed-asset-doc-lists-repair',
    'fixed-asset-doc-lists-change'
  ]
  const denied = [
    'fixed-asset-doc-lists-dispose',
    'fixed-asset-doc-lists-transfer',
    'fixed-asset-doc-lists-alloc',
    'fixed-asset-doc-lists-inbound',
    'fixed-asset-inventory-docs',
    'fixed-assets'
  ]
  const status = await probeWrite(session, [...allowed, ...denied])
  for (const key of allowed) {
    expect(status[key], `${key} 应越过鉴权层，实得 ${status[key]}`).not.toBe(403)
  }
  for (const key of denied) {
    expect(status[key], `${key} 应被 403 拦下`).toBe(403)
  }
})

test('[RP-03] 职责分离：部门主管不能执行派发/盘点，仓管能办理入库验收', async () => {
  const leader = dept('产品研发一部').actors.deptLeader
  const warehouse = dept('综合管理部（党群工作部）').actors.warehouse

  const leaderStatus = await probeWrite(
    await loginViaApi({ username: leader.username, password: leader.password }),
    ['fixed-asset-doc-lists-alloc', 'fixed-asset-inventory-docs', 'fixed-assets']
  )
  for (const [key, code] of Object.entries(leaderStatus)) {
    expect(code, `部门主管不应能写 ${key}`).toBe(403)
  }

  const warehouseStatus = await probeWrite(
    await loginViaApi({ username: warehouse.username, password: warehouse.password }),
    ['fixed-asset-doc-lists-inbound']
  )
  expect(warehouseStatus['fixed-asset-doc-lists-inbound'], '仓管员应能办理入库验收').not.toBe(403)
})

test('[RP-04] fa:repair 不泄露处置权：R3 无 fa:dispose、R2 有完整处置权', async () => {
  const roles = await apiList(await loginViaApi(), 'org-roles')
  const r3 = roles.find(r => String(r.id) === 'R3')!
  const r2 = roles.find(r => String(r.id) === 'R2')!
  const permsOf = (row: typeof r3) => (Array.isArray(row.permissions) ? row.permissions.map(String) : [])
  expect(permsOf(r3)).toContain('fa:repair')
  expect(permsOf(r3)).not.toContain('fa:dispose')
  expect(permsOf(r2)).toContain('fa:dispose')
  expect(permsOf(r2)).toContain('fa:repair')
})

// ---------------------------------------------------------------- 界面级复核

const MAIN_TABS = [
  '固定资产', '入库/验收', '派发/退库', '借出使用',
  '资产变更', '资产处置', '资产盘点', '折旧管理'
]

test('[RP-05] 陈学知（R3）只读浏览页签，按权限发起借出/变更/报修', async ({ context, page }) => {
  const chen = dept('产品研发一部').actors.user
  await seedSession(context, await loginViaApi({ username: chen.username, password: chen.password }))
  await page.goto('/fixed-assets?tab=asset')

  const tab = (label: string) => page.getByRole('tab', { name: label, exact: true })
  // R3 存量配置持有 fa:report，按 canBrowseAll 语义可只读浏览全部 8 个页签（见 PRODUCTION_DRIFT）
  for (const label of MAIN_TABS) {
    await expect(tab(label).first(), `应可只读浏览页签「${label}」`).toBeVisible()
  }
  await expect(page.getByRole('button', { name: '新增资产' }), '不得改台账').toHaveCount(0)
  await expect(page.getByRole('button', { name: '生成盘点计划' }), '不得发起盘点').toHaveCount(0)

  // 资产变更页签收纳调拨 / 维修两类；信息更正已下架（台账字段直接在列表「修改」里改）
  await tab('资产变更').first().click()
  await expect(tab('维修'), '维修已迁入资产变更页签').toBeVisible()
  await expect(tab('信息更正'), '信息更正不应再出现在界面').toHaveCount(0)
  const addDoc = page.locator('.el-button:visible').filter({ hasText: '新增单据' }).first()
  await expect(addDoc, '应能发起维修报修').toBeVisible()

  // 资产处置页签可浏览，但 R3 无 fa:dispose，不得出现处置单新增入口
  await tab('资产处置').first().click()
  await expect(page.locator('.el-button:visible').filter({ hasText: '新增单据' }), '不得发起处置').toHaveCount(0)

  for (const label of ['借出使用', '资产变更']) {
    await tab(label).first().click()
    await expect(addDoc, `应能发起「${label}」`).toBeVisible()
  }
})

// 注：2026-11-10 起「台账使用人本人」可对自己名下资产发起退库/借出/维修（信息更正入口已下架）
// （AssetOwnerPolicy）。该授权体现在台账行级「发起业务」入口，以及切到对应单据页签后的
// 「新增单据」按钮；本用例停留在固定资产台账页签，只核对纯只读浏览不带出写入口。
test('[RP-06] 部门主管（R5）只读浏览全部页签，但没有任何新增入口', async ({ context, page }) => {
  const leader = dept('产品研发一部').actors.deptLeader
  await seedSession(context, await loginViaApi({ username: leader.username, password: leader.password }))
  await page.goto('/fixed-assets?tab=asset')

  for (const label of MAIN_TABS) {
    await expect(page.getByRole('tab', { name: label, exact: true }).first(),
      `审批人应能只读浏览页签「${label}」`).toBeVisible()
  }
  await expect(page.getByRole('button', { name: '新增资产' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '生成盘点计划' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新增单据' }),
    '只读浏览不应带出任何单据新增按钮').toHaveCount(0)
})
