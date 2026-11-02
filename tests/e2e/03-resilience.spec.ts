import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession } from './fixtures/auth'
import { installGuards, type Guards } from './fixtures/net'

/**
 * L0 稳定性与异常兜底。
 * 只读用例：不新增业务数据，跑在生产库上也安全。
 */
let guards: Guards

test.beforeEach(async ({ context, page }) => {
  guards = installGuards(page)
  const session = await loginViaApi()
  await seedSession(context, session)
})

test('[SMK-09] 未知路由回落到工作台', async ({ page }, testInfo) => {
  await page.goto('/this-route-does-not-exist')
  await page.waitForURL(/workbench/, { timeout: 30_000 })
  await waitSettled(page)
  await expect(page.locator('.el-menu').first()).toBeVisible()
  await shot(page, testInfo, 1, '未知路由回落')
  guards.assertClean()
})

test('[SMK-10] 空数据页面给出明确空态而不是白屏', async ({ page }, testInfo) => {
  // 折旧计划当前为 0 条，空表必须给业务解释（而不是只剩一个表头）
  await page.goto('/fixed-asset-settings?tab=depreciation')
  await waitSettled(page)
  await expect(page.locator('.el-tabs__item', { hasText: '折旧设置' }).first()).toBeVisible()
  await expect(page.locator('body')).toContainText('暂无折旧计划')
  await shot(page, testInfo, 1, '折旧计划空态')
  guards.assertClean()
})

test('[SMK-11] 关键页面连续刷新保持稳定', async ({ page }, testInfo) => {
  const routes = ['/workbench', '/fixed-assets', '/low-value-assets']
  let step = 1
  for (const route of routes) {
    for (let i = 0; i < 2; i++) {
      await page.goto(route)
      await waitSettled(page)
      await expect(page.locator('.el-menu').first()).toBeVisible()
      await shot(page, testInfo, step++, `${route.replace(/\//g, '')}-第${i + 1}次`)
    }
  }
  guards.assertClean()
})

test('[SMK-12] 新增用户必填校验拦截且不发请求', async ({ page }, testInfo) => {
  await page.goto('/system/user')
  await waitSettled(page)
  await page.getByRole('button', { name: /新增用户/ }).first().click()

  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增用户' }).last()
  await expect(dialog).toBeVisible()
  await shot(page, testInfo, 1, '新增用户弹窗')

  await dialog.getByRole('button', { name: '确定' }).click()
  await expect(dialog.locator('.el-form-item__error').first()).toBeVisible()
  await expect(dialog).toContainText('请输入用户名')
  await shot(page, testInfo, 2, '必填校验提示')

  // 校验未通过不应产生创建请求（一旦发出，guards 的 apiErrors 会让用例失败）
  guards.assertClean()
})
