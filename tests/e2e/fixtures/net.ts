import { expect, type Page } from '@playwright/test'

/**
 * 精确到「方法 + URL + 状态码」的单请求豁免。
 *
 * 为什么不用整页 `allowStatus: [403]`：那等于把权限错误整体静音，
 * 2026-11-02「新增领用 403」就是这样从全绿套件里逃逸到用户手上的。
 */
export type AllowedRequest = {
  /** HTTP 方法，缺省表示任意方法 */
  method?: string | string[]
  url: RegExp
  /** 允许的状态码，缺省表示任意 4xx/5xx */
  status?: number[]
  /** 必填：为什么这条失败是预期的，评审时只看这一行 */
  reason: string
}

export type Guards = {
  consoleErrors: string[]
  pageErrors: string[]
  apiErrors: string[]
  /** 运行中追加豁免（用于令牌失效等整段失败场景，必须带 reason） */
  allowRequest: (entry: AllowedRequest) => void
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
 * @param options.allowRequests 预期的失败请求，必须精确到 URL 并写明原因
 * @param options.allowConsole  允许的控制台错误（如资源 404 噪声）
 */
export function installGuards(
  page: Page,
  options: {
    allowRequests?: AllowedRequest[]
    allowConsole?: RegExp[]
    allowPageError?: RegExp[]
  } = {}
): Guards {
  const allowedRequests = [...(options.allowRequests ?? [])]
  const allowPageErrorPatterns = [...(options.allowPageError ?? [])]
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const apiErrors: string[] = []
  const allowConsolePatterns = [...(options.allowConsole ?? [])]

  allowedRequests.forEach(assertReason)

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
    const status = res.status()
    if (status < 400) return
    const method = res.request().method()
    if (allowedRequests.some(entry => matches(entry, method, url, status))) return
    const parsed = new URL(url)
    apiErrors.push(`${status} ${method} ${parsed.pathname}${parsed.search}`)
  })

  return {
    consoleErrors,
    pageErrors,
    apiErrors,
    allowRequest: entry => {
      assertReason(entry)
      allowedRequests.push(entry)
    },
    allowConsole: pattern => allowConsolePatterns.push(pattern),
    assertClean: () => {
      expect(
        apiErrors,
        '接口出现未预期的 4xx/5xx（确属预期的请用 allowRequests 精确豁免并写明 reason）'
      ).toEqual([])
      expect(pageErrors, '不应出现未捕获的 JS 异常').toEqual([])
      expect(consoleErrors, '控制台不应有错误输出').toEqual([])
    }
  }
}

function assertReason(entry: AllowedRequest) {
  if (!entry.reason || !entry.reason.trim()) {
    throw new Error(`allowRequests 必须写明 reason：${entry.url}`)
  }
}

function matches(entry: AllowedRequest, method: string, url: string, status: number): boolean {
  if (!entry.url.test(url)) return false
  if (entry.status && !entry.status.includes(status)) return false
  if (entry.method) {
    const methods = Array.isArray(entry.method) ? entry.method : [entry.method]
    if (!methods.includes(method)) return false
  }
  return true
}
