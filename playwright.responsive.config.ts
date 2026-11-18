import path from 'node:path'
import { defineConfig } from '@playwright/test'

/**
 * 响应式布局巡检（独立于 playwright.config.ts，不改 1440x900 的业务 E2E project）。
 * 视口与设备仿真由 tests/responsive/layout-matrix.spec.ts 在用例内自建 context 控制。
 * 只读导航与断言：不清库、不写业务数据、不改权限矩阵。
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost'
const RUN_ID = process.env.E2E_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
process.env.E2E_RUN_ID = RUN_ID

const ARTIFACT_ROOT = path.resolve(__dirname, 'e2e-artifacts', RUN_ID)

export default defineConfig({
  testDir: './tests/responsive',
  timeout: 8 * 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: path.join(ARTIFACT_ROOT, 'raw'),
  use: {
    baseURL: BASE_URL,
    // 本机缓存缺 chromium_headless_shell，沿用业务 E2E 的完整 chromium 通道
    channel: process.env.E2E_CHANNEL ?? 'chromium',
    ignoreHTTPSErrors: true,
    headless: true,
    launchOptions: { args: ['--ignore-certificate-errors'] },
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    screenshot: 'only-on-failure',
    trace: 'off',
    locale: 'zh-CN'
  },
  projects: [{ name: 'responsive', use: {} }]
})
