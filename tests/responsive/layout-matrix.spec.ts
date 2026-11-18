import fs from 'node:fs/promises'
import path from 'node:path'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { VIEWPORTS, ROUTES, SHOT_ROUTES, type Viewport } from './fixtures/viewports'
import { loginViaApi, seedSession, type Session } from '../e2e/fixtures/auth'
import { waitSettled } from '../e2e/fixtures/artifacts'
import { ARTIFACT_ROOT } from '../e2e/fixtures/env'

/**
 * 只读布局巡检：接口登录一次，每个视口自建 context，逐路由导航并断言。
 * 不点击任何写操作、不创建业务数据、不改权限矩阵、不清库。
 */
let session: Session

test.beforeAll(async () => {
  session = await loginViaApi()
})

async function openPage(browser: Browser, vp: Viewport, withSession = true) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    isMobile: vp.device === 'phone',
    hasTouch: vp.device !== 'desktop',
    ignoreHTTPSErrors: true,
    locale: 'zh-CN'
  })
  if (withSession) await seedSession(context, session)
  const page = await context.newPage()
  return { context, page }
}

type Snapshot = {
  overflow: number
  bodyOverflow: number
  menuBtn: boolean
  sidebarVisible: boolean
  actionBar: boolean
  tableRows: number
  labeledCells: number
  nonEmptyCells: number
  offscreenCells: number
  cards: number
  path: string
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const de = document.documentElement
    const sidebar = document.querySelector('.sidebar') as HTMLElement | null
    const cells = Array.from(document.querySelectorAll('.el-table__body-wrapper tbody tr .cell'))
    return {
      overflow: de.scrollWidth - de.clientWidth,
      bodyOverflow: document.body.scrollWidth - de.clientWidth,
      menuBtn: !!document.querySelector('.mobile-menu-btn'),
      sidebarVisible: !!sidebar && getComputedStyle(sidebar).display !== 'none',
      actionBar: !!document.querySelector('.mobile-action-bar'),
      tableRows: document.querySelectorAll('.el-table__body-wrapper tbody tr').length,
      labeledCells: document.querySelectorAll('td[data-table-label]').length,
      nonEmptyCells: cells.filter(c => (c.textContent || '').trim().length > 0).length,
      // 几何可见性：单元格右边缘超出视口说明值被裁掉了（textContent 仍在，文本断言查不出）
      offscreenCells: cells.filter(c => c.getBoundingClientRect().right > de.clientWidth + 1).length,
      cards: document.querySelectorAll('.mrl__card').length,
      path: location.pathname
    }
  })
}

function assertLayout(vp: Viewport, route: string, s: Snapshot, problems: string[]) {
  const tag = `[${vp.name}] ${route}`
  if (s.overflow > 1) problems.push(`${tag} 文档横向溢出 ${s.overflow}px（当前 ${s.path}）`)
  if (s.bodyOverflow > 1) problems.push(`${tag} body 横向溢出 ${s.bodyOverflow}px`)
  const standalone = route === '/login' || route === '/403'
  // 既有权限守卫初始化竞态可能把目标页重定向到 /403；这类页面按独立页校验（只验无溢出），
  // 由调用方重试一次并把跳过项写入报告，不把业务竞态误算成布局缺陷。
  if (standalone || s.path !== route) return
  if (vp.device === 'phone') {
    if (!s.menuBtn) problems.push(`${tag} 缺少汉堡抽屉入口`)
    if (s.sidebarVisible) problems.push(`${tag} 手机档侧栏未隐藏`)
    if (s.tableRows > 0 && s.labeledCells === 0) problems.push(`${tag} 表格卡片化未注入列名`)
    // 卡片化后单元格内容不能被 CSS 隐藏：有数据行就必须能读到文本
    if (s.tableRows > 0 && s.nonEmptyCells === 0) problems.push(`${tag} 表格卡片化后单元格文本不可见`)
    if (s.offscreenCells > 0) problems.push(`${tag} ${s.offscreenCells} 个卡片单元格越出视口右边界`)
  }
  if (vp.device === 'desktop' && s.menuBtn) problems.push(`${tag} 桌面误渲染移动入口`)
}

async function saveShot(page: Page, vp: Viewport, route: string) {
  const dir = path.join(ARTIFACT_ROOT, 'responsive', vp.name)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${route.replace(/[^\w-]+/g, '_') || 'root'}.png`)
  await page.screenshot({ path: file, animations: 'disabled' })
}

for (const vp of VIEWPORTS) {
  test(`[RESP-${vp.name}] ${vp.label} · 21 路由布局矩阵`, async ({ browser }, testInfo) => {
    const { context, page } = await openPage(browser, vp)
    const problems: string[] = []
    const redirected: string[] = []
    try {
      for (const route of ROUTES) {
        try {
          const standalone = route.path === '/login' || route.path === '/403'
          const settle = async () => {
            await waitSettled(page)
            if (!standalone) {
              await page.waitForSelector('.layout-header', { state: 'attached', timeout: 5_000 }).catch(() => {})
            }
            await page.waitForFunction(() => {
              const rows = document.querySelectorAll('.el-table__body-wrapper tbody tr').length
              return rows === 0 || document.querySelectorAll('td[data-table-label]').length > 0
            }, undefined, { timeout: 3_000 }).catch(() => {})
          }

          await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
          await settle()
          let snap = await snapshot(page)
          if (!standalone && snap.path !== route.path) {
            await page.goto(route.path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
            await settle()
            snap = await snapshot(page)
            if (snap.path !== route.path) redirected.push(`${route.path} -> ${snap.path}`)
          }
          assertLayout(vp, route.path, snap, problems)
          if (SHOT_ROUTES.includes(route.path)) await saveShot(page, vp, route.path)
        } catch (err) {
          problems.push(`[${vp.name}] ${route.path} 导航/断言异常：${(err as Error).message.slice(0, 160)}`)
        }
      }
    } finally {
      await context.close()
    }
    if (redirected.length) {
      await testInfo.attach('redirected-routes', { body: redirected.join('\n'), contentType: 'text/plain' })
    }
    // 防止「全部被重定向」造成假通过：绝大多数目标页必须被真实验证
    expect(redirected.length, `被权限守卫重定向的路由过多：${redirected.join(', ')}`).toBeLessThanOrEqual(4)
    expect(problems, problems.slice(0, 24).join('\n')).toHaveLength(0)
  })
}

test('[RESP-IX-01] 手机抽屉可开合、菜单与公司视角可达', async ({ browser }) => {
  const vp = VIEWPORTS.find(v => v.name === 'phone')!
  const { context, page } = await openPage(browser, vp)
  try {
    await page.goto('/workbench')
    await waitSettled(page)
    const menuBtn = page.locator('.mobile-menu-btn')
    await expect(menuBtn).toBeVisible()
    await menuBtn.click()
    const drawer = page.locator('.mobile-nav-drawer')
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.sidebar-menu')).toBeVisible()
    await expect(drawer.locator('.mnav__select')).toBeVisible()
    await drawer.locator('.mnav__close').click()
    await expect(drawer).toBeHidden({ timeout: 6_000 })
    await expect(menuBtn).toBeFocused()
  } finally {
    await context.close()
  }
})

test('[RESP-IX-02] 手机弹窗按钮可见、筛选折叠与横竖屏输入保留', async ({ browser }) => {
  const vp = VIEWPORTS.find(v => v.name === 'phone')!
  const { context, page } = await openPage(browser, vp)
  try {
    await page.goto('/system/params')
    await waitSettled(page)
    await page.locator('.mobile-action-bar__btn.is-primary').click()
    const dialog = page.locator('.el-dialog:visible').last()
    await expect(dialog).toBeVisible()
    const buttons = dialog.locator('.el-dialog__footer button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox()
      expect(box, '弹窗底部按钮必须有可测尺寸').not.toBeNull()
      expect(box!.y + box!.height, '弹窗底部按钮须在视口内').toBeLessThanOrEqual(vp.height + 1)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden({ timeout: 6_000 })

    await page.locator('.mfp__toggle').click()
    const input = page.locator('.mfp__body input').first()
    await input.fill('E2E_布局检查')
    // 同档内切换（xs 竖屏 -> xs 矮屏）：折叠面板不销毁，DOM 与输入值都保留
    await page.setViewportSize({ width: 360, height: 800 })
    await expect(input).toHaveValue('E2E_布局检查')
    // 跨档到平板横屏（md）：形态按设计切回桌面工具栏，筛选状态仍共享，值不能丢
    await page.setViewportSize({ width: 844, height: 390 })
    await expect(page.locator('.toolbar input').first()).toHaveValue('E2E_布局检查')
    const snap = await snapshot(page)
    expect(snap.overflow, '手机横屏切换后不得横向溢出').toBeLessThanOrEqual(1)
  } finally {
    await context.close()
  }
})

test('[RESP-IX-03] 卡片与表格互斥渲染，桌面零回归', async ({ browser }) => {
  const phone = VIEWPORTS.find(v => v.name === 'phone')!
  const desktop = VIEWPORTS.find(v => v.name === 'pc-1440')!

  const mobile = await openPage(browser, phone)
  try {
    await mobile.page.goto('/system/log')
    await waitSettled(mobile.page)
    expect(await mobile.page.locator('.el-table').count(), '手机档不应渲染桌面表格').toBe(0)
    expect(await mobile.page.locator('.mobile-menu-btn').count()).toBe(1)
  } finally {
    await mobile.context.close()
  }

  const pc = await openPage(browser, desktop)
  try {
    await pc.page.goto('/system/log')
    await waitSettled(pc.page)
    expect(await pc.page.locator('.el-table').count()).toBeGreaterThan(0)
    expect(await pc.page.locator('.mrl__card').count(), '桌面不应渲染卡片列表').toBe(0)
    expect(await pc.page.locator('.mobile-menu-btn').count()).toBe(0)
    await expect(pc.page.locator('.sidebar')).toBeVisible()
  } finally {
    await pc.context.close()
  }
})

test('[RESP-IX-04] 登录页未登录态手机竖屏无溢出且提交按钮可见', async ({ browser }) => {
  const vp = VIEWPORTS.find(v => v.name === 'phone')!
  const { context, page } = await openPage(browser, vp, false)
  try {
    await page.goto('/login')
    await waitSettled(page)
    const snap = await snapshot(page)
    expect(snap.overflow).toBeLessThanOrEqual(1)
    const btn = page.locator('.login-btn')
    await expect(btn).toBeVisible()
    const box = await btn.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1)
    expect(box!.height).toBeGreaterThanOrEqual(44)
  } finally {
    await context.close()
  }
})

test('[RESP-IX-05] 手机筛选控件全宽、卡片字段精简、页签末项可见', async ({ browser }) => {
  const vp = VIEWPORTS.find(v => v.name === 'phone')!
  const routes = ['/fixed-assets', '/low-value-assets', '/system/user']
  const { context, page } = await openPage(browser, vp)
  try {
    for (const route of routes) {
      await page.goto(route)
      await waitSettled(page)
      await page.waitForTimeout(700)
      const toggle = page.locator('.mobile-filter-toggle, .mfp__toggle').first()
      if (await toggle.count() && await toggle.isVisible()) await toggle.click()

      const m = await page.evaluate(() => {
        const sel = '.search-form input, .search-form .el-select, .mfp__body input, .mfp__body .el-select, .toolbar input, .toolbar .el-select'
        const controls = Array.from(document.querySelectorAll(sel))
          .filter(el => el.getBoundingClientRect().width > 0)
          .map(el => Math.round(el.getBoundingClientRect().width))
        const firstCard = document.querySelector('.mrl__card, .el-table__body-wrapper tbody tr')
        const fields = firstCard
          ? (firstCard.matches('.mrl__card')
              ? firstCard.querySelectorAll('.mrl__field').length
              : firstCard.querySelectorAll('td:not([data-mobile-hidden])').length)
          : 0
        const tabs = Array.from(document.querySelectorAll('.el-tabs__item'))
        const last = tabs[tabs.length - 1]?.getBoundingClientRect()
        return { controls, fields, lastTabRight: last ? Math.round(last.right) : null, vw: document.documentElement.clientWidth }
      })

      expect(m.controls.length, `${route} 未找到可见筛选控件`).toBeGreaterThan(0)
      expect(m.controls.every(w => w >= 120), `${route} 筛选控件被压窄: ${m.controls.join(',')}`).toBe(true)
      expect(m.fields, `${route} 卡片字段超过 6 个（实际 ${m.fields}）`).toBeLessThanOrEqual(6)
      if (m.lastTabRight !== null) {
        expect(m.lastTabRight, `${route} 页签末项被裁`).toBeLessThanOrEqual(m.vw + 1)
      }
    }
  } finally {
    await context.close()
  }
})

test('[RESP-IX-06] 工作台概览数字降字号且行动条触控尺寸达标', async ({ browser }) => {
  const vp = VIEWPORTS.find(v => v.name === 'phone')!
  const { context, page } = await openPage(browser, vp)
  try {
    await page.goto('/workbench')
    await waitSettled(page)
    // 权限守卫偶发重定向、概览挂载晚于网络空闲，等它出现再断言
    await page.waitForSelector('.ov-panel', { timeout: 6_000 }).catch(() => {})
    const m = await page.evaluate(() => {
      const nums = Array.from(document.querySelectorAll('.ov-nums .n b'))
      const stats = Array.from(document.querySelectorAll('.wb-stat'))
      return {
        fontSizes: nums.map(el => parseFloat(getComputedStyle(el).fontSize)),
        overlaps: nums.some((a, i) => nums.slice(i + 1).some(b => {
          const ra = a.getBoundingClientRect()
          const rb = b.getBoundingClientRect()
          return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom
        })),
        statHeights: stats.map(el => Math.round(el.getBoundingClientRect().height))
      }
    })
    expect(m.fontSizes.length).toBeGreaterThan(0)
    expect(Math.max(...m.fontSizes), '概览数字字号过大').toBeLessThanOrEqual(18)
    expect(m.overlaps, '概览数字相互重叠').toBe(false)
    expect(m.statHeights.length).toBeGreaterThan(0)
    expect(Math.min(...m.statHeights), '行动条卡片过矮').toBeGreaterThanOrEqual(60)
  } finally {
    await context.close()
  }
})
