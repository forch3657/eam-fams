import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 配置：针对本机生产形态（nginx HTTPS + 后端 jar + 前端 dist）验证关键点击流。
 *
 * 说明：
 * - 证书是自签证书，因此 ignoreHTTPSErrors 与 --ignore-certificate-errors 都必须开启；
 * - 用例会真实开关折旧方案并还原（写操作），所以 workers=1 且串行，避免并发互相干扰；
 * - 登录态由 setup 项目统一生成并保存，避免每个用例重复登录。
 */
const BASE_URL = process.env.E2E_BASE_URL ?? 'https://localhost';

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
    ['html', { open: 'never' }],
    ...(process.env.CI ? [['junit', { outputFile: 'playwright-report/junit.xml' }] as const] : []),
  ],
  use: {
    baseURL: BASE_URL,
    // 默认使用 Playwright 自带的 chromium；本机若未下载浏览器，可用
    // E2E_CHANNEL=msedge / chrome 复用系统已装浏览器（CI 不要设，统一用自带浏览器）。
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
    ignoreHTTPSErrors: true,
    launchOptions: { args: ['--ignore-certificate-errors'] },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // 不开启 video：避免依赖 ffmpeg 二进制（trace 已包含操作回放所需信息）
    video: 'off',
    locale: 'zh-CN',
  },
  // 不使用 storageState 复用登录态：本应用把 token 存在 sessionStorage，
  // 而 storageState 只持久化 cookie/localStorage，还原后仍是未登录态。
  // 因此每个用例都在 beforeEach 里做一次真实 UI 登录（用例保持相互独立）。
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
