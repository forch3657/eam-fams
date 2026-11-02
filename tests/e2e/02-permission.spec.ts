import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempRole, createTempUser, setRoleStatus, type TempRole, type TempUser } from './fixtures/data'
import { installGuards } from './fixtures/net'

/**
 * L0 权限与角色状态用例。
 *
 * 用临时角色 + 临时用户验证两件事：
 * 1. 只有 wm:view 的用户进不了固定资产/系统管理，直链会兜底回工作台；
 * 2. 角色被停用后立即失效（这条对应「禁用分管副总却仍有权限」的缺陷）。
 *
 * 数据全部 E2E_ 前缀，afterAll 逆序删除（先用户后角色）。
 */
let admin: Session
let role: TempRole
let user: TempUser

test.beforeAll(async () => {
  admin = await loginViaApi()
  role = await createTempRole(admin, ['wm:view'])
  user = await createTempUser(admin, role.id)
})

test.afterAll(async () => {
  await cleanupTemp(admin, { userId: user?.id, roleId: role?.id })
})

test('[SMK-07] 受限角色看不到无权菜单，直链兜底回工作台', async ({ context, page }, testInfo) => {
  // 受限用户访问工作台时，后端会对无权资源返回 403（预期行为）；
  // 部分 store 直接 Promise.all 未做降级，会冒未捕获的 ApiError，这里按预期放行并记录为待修问题
  const guards = installGuards(page, {
    allowStatus: [403],
    allowPageError: [/无权限访问该数据/],
    allowConsole: [/无权限访问该数据/]
  })
  const session = await loginViaApi({ username: user.username, password: user.password })
  await seedSession(context, session)

  await page.goto('/workbench')
  await waitSettled(page)
  await expect(page.locator('.el-menu').first()).toBeVisible()
  await shot(page, testInfo, 1, '受限角色工作台')

  // 侧边菜单不应出现无权模块
  await expect(page.locator('.el-menu'), '不应出现固定资产菜单').not.toContainText('固定资产')
  await expect(page.locator('.el-menu'), '不应出现系统管理菜单').not.toContainText('系统管理')

  // 直链访问无权页面 → 兜底到工作台
  await page.goto('/fixed-assets')
  await page.waitForURL(/workbench/, { timeout: 30_000 })
  await shot(page, testInfo, 2, '直链被兜底回工作台')

  // 系统管理同理
  await page.goto('/system/role')
  await page.waitForURL(/workbench/, { timeout: 30_000 })
  await shot(page, testInfo, 3, '系统管理直链被兜底')

  guards.assertClean()
})

test('[SMK-08] 角色停用后权限立即失效', async ({ context, page }, testInfo) => {
  const guards = installGuards(page, {
    allowStatus: [403],
    allowPageError: [/无权限访问该数据/],
    allowConsole: [/无权限访问该数据/]
  })

  // 停用前：能进工作台
  const before = await loginViaApi({ username: user.username, password: user.password })
  await seedSession(context, before)
  await page.goto('/workbench')
  await waitSettled(page)
  await expect(page).toHaveURL(/workbench/)
  await shot(page, testInfo, 1, '停用前可进工作台')

  // 停用角色
  await setRoleStatus(admin, role.id, 'DISABLED')

  // 停用后：新会话无任何权限 → 落到 403
  const after = await loginViaApi({ username: user.username, password: user.password })
  await seedSession(context, after)
  await page.goto('/workbench')
  await page.waitForURL(/\/403/, { timeout: 30_000 })
  await shot(page, testInfo, 2, '停用后落到 403')

  await expect(page.locator('body')).toContainText(/无访问权限|无权限/)

  guards.assertClean()
})
