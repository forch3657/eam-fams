import { expect, type Page } from '@playwright/test'

export type Guards = {
  consoleErrors: string[]
  pageErrors: string[]
  apiErrors: string[]
  allowApi: (pattern: RegExp) => void
  allowConsole: (pattern: RegExp) => void
  /** 统一断言：三类错误都必须为空 */
  assertClean: () => void
}

/**
 * 安装网络与控制台守卫。
 *
 * 关键价值：接口级 4xx/5xx 一律判红。之前的「新增角色提交中文枚举 → 422」
 * 在界面上只弹了一句提示，console 也不报错，只有盯着 /api/ 响应才能发现。
 *
 * @param options.allowApi     允许失败的接口（如登录失败用例放行 /auth/login 401）
 * @param options.allowConsole 允许的控制台错误（如资源 404 噪声）
 */
export function installGuards(
  page: Page,
  options: {
    allowApi?: RegExp[]
    allowConsole?: RegExp[]
    allowStatus?: number[]
    allowPageError?: RegExp[]
  } = {}
): Guards {
  const allowedStatuses = new Set(options.allowStatus ?? [])
  const allowPageErrorPatterns = [...(options.allowPageError ?? [])]
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const apiErrors: string[] = []
  const allowApiPatterns = [...(options.allowApi ?? [])]
  const allowConsolePatterns = [...(options.allowConsole ?? [])]

  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (allowConsolePatterns.some(p => p.test(text))) return
    // favicon 之类的静态资源 404 属于浏览器噪声；/api/ 的失败必须保留
    if (/Failed to load resource/i.test(text) && !text.includes('/api/')) return
    consoleErrors.push(text)
  })

  page.on('pageerror', err => {
    const text = err.stack || err.message
    if (allowPageErrorPatterns.some(p => p.test(text))) return
    pageErrors.push(text)
  })

  page.on('response', res => {
    const url = res.url()
    if (!url.includes('/api/')) return
    if (allowApiPatterns.some(p => p.test(url))) return
    if (allowedStatuses.has(res.status())) return
    if (res.status() >= 400) {
      apiErrors.push(`${res.status()} ${res.request().method()} ${url}`)
    }
  })

  return {
    consoleErrors,
    pageErrors,
    apiErrors,
    allowApi: pattern => allowApiPatterns.push(pattern),
    allowConsole: pattern => allowConsolePatterns.push(pattern),
    assertClean: () => {
      expect(apiErrors, '接口不应返回 4xx/5xx').toEqual([])
      expect(pageErrors, '不应出现未捕获的 JS 异常').toEqual([])
      expect(consoleErrors, '控制台不应有错误输出').toEqual([])
    }
  }
}
