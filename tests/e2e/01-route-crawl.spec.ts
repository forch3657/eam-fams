import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { loginViaApi, seedSession } from './fixtures/auth'
import { installGuards, type Guards } from './fixtures/net'

/**
 * L0 全页面巡检。
 *
 * 覆盖口径：路由清单（与 router/index.js 对齐）逐条直达 + 页面内所有可见页签逐个点击。
 * 判定标准：不白屏、不误跳登录/403、控制台无 error、/api/ 无 4xx/5xx。
 *
 * 新增页面时只要在 ROUTES 里补一行，用例无需改动。
 * 所有截图落在 e2e-artifacts/<runId>/CRAWL-xx/，报告中可直接回看。
 */
// 巡检是「快照式」检查：后端偶发网关超时（2026-10-30 实测一次
// GET /api/system-dict-types-device_status-items 504）不能掩盖真实错误，
// 所以保留严格断言，只允许整条用例重试一次；重试通过会在报告里标为 flaky。
test.describe.configure({ retries: 1 })

const ROUTES = [
  { path: '/workbench', title: '工作台', id: 'CRAWL-01' },
  { path: '/fixed-assets', title: '资产管理', id: 'CRAWL-02' },
  { path: '/fixed-asset-reports', title: '资产报表', id: 'CRAWL-03' },
  { path: '/fixed-asset-settings', title: '基础设置', id: 'CRAWL-04' },
  { path: '/low-value-assets', title: '低值资产管理', id: 'CRAWL-05' },
  { path: '/low-value-asset-reports', title: '低值资产报表', id: 'CRAWL-06' },
  { path: '/low-value-asset-settings', title: '低值资产基础设置', id: 'CRAWL-07' },
  { path: '/system/company', title: '公司管理', id: 'CRAWL-08' },
  { path: '/system/dept', title: '部门管理', id: 'CRAWL-09' },
  { path: '/system/user', title: '用户管理', id: 'CRAWL-10' },
  { path: '/system/role', title: '角色管理', id: 'CRAWL-11' },
  { path: '/system/dict', title: '数据字典', id: 'CRAWL-12' },
  { path: '/system/log', title: '操作日志', id: 'CRAWL-13' },
  { path: '/system/workflow', title: '流程配置', id: 'CRAWL-14' },
  { path: '/system/params', title: '系统参数', id: 'CRAWL-15' },
  { path: '/system/message-center', title: '消息中心', id: 'CRAWL-16' },
  { path: '/system/message-template', title: '消息模板', id: 'CRAWL-17' },
  { path: '/system/terminal', title: '盘点终端', id: 'CRAWL-18' },
  { path: '/system/data-import', title: '数据导入', id: 'CRAWL-19' }
]

let guards: Guards

test.beforeEach(async ({ context, page }) => {
  guards = installGuards(page)
  const session = await loginViaApi()
  await seedSession(context, session)
})

for (const route of ROUTES) {
  test(`[${route.id}] ${route.title} 页面与页签巡检`, async ({ page }, testInfo) => {
    await page.goto(route.path)
    await waitSettled(page)
    await page.waitForTimeout(300)

    // 不误跳登录/无权限页
    await expect(page, '不应被路由守卫弹回登录页').not.toHaveURL(/\/login/)
    await expect(page, '不应落到 403').not.toHaveURL(/\/403/)
    await expect(page.locator('.el-menu').first(), '主菜单应渲染').toBeVisible()
    await expect(page.locator('body')).toContainText(route.title)

    await shot(page, testInfo, 1, '首屏')

    // 逐个点击页面内可见页签（弹窗里的页签不可见，不会被选中）
    const tabs = page.locator('.el-tabs__item:visible')
    const count = await tabs.count()
    for (let i = 0; i < count; i++) {
      const tab = page.locator('.el-tabs__item:visible').nth(i)
      const label = (await tab.innerText().catch(() => '')).trim() || `tab-${i + 1}`
      await tab.click({ timeout: 10_000 }).catch(() => null)
      await waitSettled(page)
      await page.waitForTimeout(250)
      await shot(page, testInfo, i + 2, `页签-${label}`)
    }

    // 页签点完后页面仍应有内容（防空壳）
    await expect(page.locator('#app')).not.toBeEmpty()
    guards.assertClean()
  })
}
