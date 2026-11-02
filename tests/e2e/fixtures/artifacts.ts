import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { ARTIFACT_ROOT } from './env'

function sanitize(text: string): string {
  return text
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
}

/** 用例编号写在标题里，形如 [SMK-01]，截图目录直接用它 */
export function caseIdOf(testInfo: TestInfo): string {
  const matched = testInfo.title.match(/\[([A-Za-z0-9_-]+)\]/)
  return matched ? matched[1] : sanitize(testInfo.title) || 'case'
}

export function caseDir(testInfo: TestInfo): string {
  return path.join(ARTIFACT_ROOT, caseIdOf(testInfo))
}

/**
 * 逐步截图：每一步操作后调用，落到 e2e-artifacts/<runId>/<caseId>/NN-label.png，
 * 同时 attach 到 HTML 报告，报告里点某一步就能看到当时的界面。
 */
export async function shot(
  page: Page,
  testInfo: TestInfo,
  step: number,
  label: string
): Promise<string> {
  const dir = caseDir(testInfo)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${String(step).padStart(2, '0')}-${sanitize(label)}.png`)
  // 等 el-dialog / el-select 的收放动画结束，避免截到半透明过渡帧
  await page.waitForTimeout(180)
  const buffer = await page.screenshot({ path: file, animations: 'disabled' })
  await testInfo.attach(`${String(step).padStart(2, '0')} ${label}`, {
    body: buffer,
    contentType: 'image/png'
  })
  return file
}

/** 等页面进入可断言状态：DOM 就绪 + 没有全屏 loading 遮罩 */
export async function waitSettled(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await page
    .waitForFunction(
      () => !document.querySelector('.el-loading-mask:not([style*="display: none"])'),
      undefined,
      { timeout: 15_000 }
    )
    .catch(() => {
      // 页面没有 loading 遮罩或数据较慢：交给后续断言超时兜底
    })
}
