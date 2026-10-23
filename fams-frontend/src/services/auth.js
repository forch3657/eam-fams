/**
 * 认证服务：登录 / 登出 / 拉取当前用户
 *
 * 与后端约定（见 docs/API_CONTRACT.md「认证」章节）：
 * - POST /auth/login   body { username, password } → data { token, user }
 * - POST /auth/logout  → data true
 * - GET  /auth/profile → data user
 *
 * token 统一存 sessionStorage（键见 keys.js），由 http.js 每次请求带上。
 *
 * mock 模式下不走网络，但**同样签发 token** —— 目的是让「登出、401 拦截、
 * 审计留痕」这条链路在切到真实后端之前就跑通，避免切换时才发现
 * Authorization 头从未真正发出过。
 */
import { request } from './http'
import { useMock } from './index'
import { TOKEN_STORAGE_KEY } from './keys'

export function getToken() {
  try { return sessionStorage.getItem(TOKEN_STORAGE_KEY) || '' } catch (e) { return '' }
}

export function setToken(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_STORAGE_KEY, value)
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch (e) {
    console.error('[auth] token 写入失败', e)
  }
}

/** mock 模式签发本地 token：仅用于打通链路，不具备任何安全性 */
function issueMockToken(username) {
  return `mock.${username || 'anonymous'}.${Date.now().toString(36)}`
}

export const authService = {
  /**
   * 登录
   * - mock 模式：返回 null，由 store/user.js 在本地用户表校验后调 issueToken()
   * - api  模式：调后端，返回 { token, user }
   */
  async login(username, password) {
    if (useMock) return null
    return request('/auth/login', { method: 'POST', data: { username, password } })
  },

  /** 登出：本地 token 无条件清除，后端通知失败不影响本地已登出 */
  async logout() {
    const had = getToken()
    setToken('')
    if (!useMock && had) {
      try {
        await request('/auth/logout', { method: 'POST' })
      } catch (e) {
        console.error('[auth] 登出通知失败（本地已登出）', e)
      }
    }
    return true
  },

  /** 用 token 换当前用户信息，供刷新页面后恢复会话 */
  async profile() {
    if (useMock || !getToken()) return null
    return request('/auth/profile')
  }
}

/**
 * 登录成功后签发并保存 token
 * @param {object} user 登录用户
 * @param {string} [issued] api 模式下后端签发的 token；缺省时生成本地 token
 */
export function issueToken(user, issued) {
  setToken(issued || issueMockToken(user?.username))
  return getToken()
}

export default authService
