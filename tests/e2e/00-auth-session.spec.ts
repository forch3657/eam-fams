import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession, type Session } from './fixtures/auth'
import { ADMIN, ARTIFACT_ROOT } from './fixtures/env'
import { installGuards, type Guards } from './fixtures/net'

/**
 * L0 会话与部署态用例。
 *
 * 会话注入：token 存在 sessionStorage，storageState 无法还原，
 * 因此用 addInitScript 在页面脚本执行前写入，避免每条用例重复 UI 登录。
 * 真实 UI 登录由 smoke.spec.ts 覆盖。
 */

let session: Session
let guards: Guards

test.describe('已登录会话', () => {
  test.beforeEach(async ({ context, page }) => {
    guards = installGuards(page)
    session = await loginViaApi()
    await seedSession(context, session)
  })

  test('[SMK-01] 登录后进入工作台并渲染主框架', async ({ page }, testInfo) => {
    await page.goto('/')
    await page.waitForURL(/workbench/, { timeout: 30_000 })
    await waitSettled(page)
    await shot(page, testInfo, 1, '工作台')

    await expect(page.locator('.el-menu').first()).toBeVisible()
    await expect(page.locator('.tags-view .tag-item')).toHaveCount(1)
    await expect(page.locator('body')).toContainText('工作台')
    await shot(page, testInfo, 2, '主框架与标签栏')
    guards.assertClean()
  })

  test('[SMK-03] 令牌失效后自动跳转登录页', async ({ page, context }, testInfo) => {
    guards.allowApi(/\/api\//)
    await page.goto('/workbench')
    await expect(page.locator('.el-menu').first()).toBeVisible()

    // 模拟 token 过期：追加一段 init script，在每次导航后清掉令牌。
    // 不能只在当前页面 removeItem —— 会话注入脚本会在下次导航时把 token 写回来。
    await context.addInitScript(() => sessionStorage.removeItem('token'))
    await page.goto('/fixed-assets')
    await page.waitForURL(/\/login/, { timeout: 30_000 })
    await shot(page, testInfo, 1, '令牌失效跳登录')

    await expect(page.locator('input[type=password]')).toBeVisible()
  })

  test('[SMK-04] 切换账号后上一位用户的标签页被清空', async ({ page }, testInfo) => {
    // 标签栏是内存态，page.goto 会整页重载把它清掉，必须用菜单做 SPA 跳转
    const openViaMenu = async (group: string, item: string) => {
      const sub = page.locator('.el-sub-menu').filter({ hasText: group }).first()
      await sub.locator('.el-sub-menu__title').click()
      await sub.locator('.el-menu-item').filter({ hasText: item }).first().click()
      await waitSettled(page)
    }

    await page.goto('/workbench')
    await expect(page.locator('.el-menu').first()).toBeVisible()
    await openViaMenu('固定资产', '资产管理')
    await openViaMenu('低值资产', '资产管理')

    await expect(page.locator('.tags-view .tag-item').first()).toBeVisible()
    const before = await page.locator('.tags-view .tag-item').count()
    expect(before, '应累积多个标签页').toBeGreaterThan(1)
    await shot(page, testInfo, 1, '切换前标签栏')

    // 退出登录（el-dropdown 默认 hover 触发）
    await page.locator('.user-info').hover()
    await page.locator('.el-dropdown-menu__item', { hasText: '退出登录' }).click()
    await page.waitForURL(/\/login/, { timeout: 30_000 })
    await shot(page, testInfo, 2, '已退出登录')

    // 重新登录
    await page.locator('.login-form input').first().fill(ADMIN.username)
    await page.locator('input[type=password]').first().fill(ADMIN.password)
    await page.locator('button').filter({ hasText: /登\s*录/ }).first().click()
    await page.waitForURL(/workbench/, { timeout: 30_000 })
    await waitSettled(page)

    await expect(page.locator('.tags-view .tag-item'), '新会话只应有当前页签').toHaveCount(1)
    await shot(page, testInfo, 3, '重新登录后的标签栏')
  })

  test('[SMK-05] 部署版本与本地构建一致', async ({ page, request }, testInfo) => {
    await page.goto('/workbench')
    const remote = await request.get('/version.txt')
    expect(remote.ok(), '服务端应能返回 /version.txt（需重新构建前端）').toBeTruthy()
    const remoteVersion = (await remote.text()).trim()

    const localFile = path.resolve(process.cwd(), 'fams-frontend/dist/version.txt')
    expect(fs.existsSync(localFile), `本地构建产物缺少 ${localFile}`).toBeTruthy()
    const localVersion = fs.readFileSync(localFile, 'utf8').trim()

    expect(remoteVersion, '线上运行的不是本地最新构建').toBe(localVersion)
    await expect(page.locator('meta[name=app-version]')).toHaveAttribute('content', localVersion)
    await shot(page, testInfo, 1, '版本标记一致')
  })

  test('[SMK-06] 深链刷新后登录态与页签保持', async ({ page }, testInfo) => {
    await page.goto('/fixed-asset-settings?tab=depreciation')
    await waitSettled(page)
    await expect(page.locator('.el-tabs__item', { hasText: '折旧设置' }).first()).toBeVisible()

    await page.reload()
    await waitSettled(page)
    await expect(page).toHaveURL(/fixed-asset-settings/)
    await expect(page.locator('.el-tabs__item', { hasText: '折旧设置' }).first()).toBeVisible()
    await shot(page, testInfo, 1, '刷新后仍在折旧设置')
    guards.assertClean()
  })

  test.afterAll(async () => {
    // 产物目录留痕，便于人工核对本轮截图位置
    console.log(`[e2e] artifacts: ${ARTIFACT_ROOT}`)
  })
})

test('[SMK-02] 错误密码登录被拒绝', async ({ page }, testInfo) => {
  const guards = installGuards(page, { allowApi: [/\/api\/auth\/login$/] })
  await page.goto('/login')
  await page.locator('.login-form input').first().fill(ADMIN.username)
  await page.locator('input[type=password]').first().fill('WrongPass@2026')
  await page.locator('button').filter({ hasText: /登\s*录/ }).first().click()

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
  await expect(page.locator('body')).toContainText(/用户名或密码错误|密码错误/)
  await shot(page, testInfo, 1, '登录失败提示')
  guards.assertClean()
})
