import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 配置。
 *
 * 目标环境由 E2E_BASE_URL 决定：
 * - 独立测试栈：E2E_BASE_URL=http://127.0.0.1:4173（scripts/e2e/start-e2e.ps1 启动，库为 fams_e2e）
 * - 生产形态：  E2E_BASE_URL=http://localhost        （nginx + 8080 + 生产库，只跑只读用例）
 *
 * 产物：每轮一个 runId 目录，逐步截图由 fixtures/artifacts.ts 写入，
 * trace / video 由 Playwright 写入同目录的 raw/ 下。
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost'
const RUN_ID = process.env.E2E_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
process.env.E2E_RUN_ID = RUN_ID

/**
 * 观察模式：headed 时自动慢放，便于看清每一步真实点击。
 * - `npm run e2e:headed`（即 --headed）或 E2E_HEADED=1 开启有头；
 * - 慢放时长用 E2E_SLOWMO 覆盖，默认 400ms；
 * - 无头全量与 CI 不受影响（SLOW_MO=0）。
 */
const HEADED = process.argv.includes('--headed') || process.env.E2E_HEADED === '1'
const SLOW_MO = Number(process.env.E2E_SLOWMO ?? (HEADED ? 400 : 0))

const ARTIFACT_ROOT = path.resolve(__dirname, 'e2e-artifacts', RUN_ID)

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ...(process.env.CI ? [['junit', { outputFile: 'playwright-report/junit.xml' }] as const] : [])
  ],
  outputDir: path.join(ARTIFACT_ROOT, 'raw'),
  use: {
    baseURL: BASE_URL,
    // 自签证书（https://localhost）与 headed 渠道都要兼容
    // 本机缓存里缺 chromium_headless_shell-1248，但完整 chromium-1248 已安装。
    // 指定 channel=chromium 直接用完整包的无头模式；CI 可用 E2E_CHANNEL 覆盖。
    channel: process.env.E2E_CHANNEL ?? 'chromium',
    ignoreHTTPSErrors: true,
    // E2E_HEADED=1 也能开有头；--headed 由 CLI 自身处理
    headless: !HEADED,
    launchOptions: { args: ['--ignore-certificate-errors'], slowMo: SLOW_MO },
    viewport: { width: 1440, height: 900 },
    actionTimeout: 20_000,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'zh-CN'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    }
  ]
})
