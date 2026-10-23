import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useOrgStore } from './org'
import { authService, issueToken, setToken } from '../services/auth'
import { useMock } from '../services'
import { USER_STORAGE_KEY as STORAGE_KEY } from '../services/keys'

/**
 * 登录与权限
 *
 * 账号来源：系统管理 → 用户管理（组织架构用户），不再在代码里硬编码账号。
 * 权限来源：用户所挂角色的权限集合（组织架构 → 角色管理维护）。
 * 路由守卫、菜单、按钮统一走 can() 判定。
 */
export const useUserStore = defineStore('user', () => {
  const user = ref(null)

  const isLoggedIn = computed(() => !!user.value)

  /** 当前用户拥有的权限编码集合（来自组织架构中该用户所角色的权限） */
  const permissions = computed(() => {
    if (!user.value) return []
    const org = useOrgStore()
    // 组织主数据未加载完成时不做任何放行：宁可暂时无权限，也不给"全权限窗口"
    if (!org.loaded) return []
    const roleIds = user.value.roleIds || []
    const set = new Set()
    roleIds.forEach(rid => {
      const role = org.roles.find(r => r.id === rid)
      ;(role?.permissions || []).forEach(p => set.add(p))
    })
    return [...set]
  })

  /** 是否拥有某项权限；不传编码时视为放行 */
  function can(code) {
    if (!code) return true
    if (!user.value) return false
    return permissions.value.includes(code)
  }

  /**
   * 登录
   *
   * api 模式：凭证校验完全交给后端（前端不接触密码比对），后端返回 { token, user }
   * mock 模式：在本地用户表校验（账号来自组织架构 → 用户管理），同样签发 token
   *
   * @returns {Promise<{ok: boolean, reason?: string, message?: string}>}
   *   reason: NOT_FOUND 账号不存在 / DISABLED 账号已停用 / PASSWORD 密码错误 / SERVER 服务异常
   */
  async function login(username, password) {
    const org = useOrgStore()
    if (!org.loaded) await org.loadAll()

    // ---- api 模式：凭证校验由后端完成 ----
    if (!useMock) {
      let res = null
      try {
        res = await authService.login(username, password)
      } catch (e) {
        return { ok: false, reason: e?.code === 401 ? 'PASSWORD' : 'SERVER', message: e?.message }
      }
      const issued = res?.token || ''
      if (!issued) return { ok: false, reason: 'SERVER', message: '登录接口未返回 token' }
      const account = res?.user || {}
      user.value = {
        ...account,
        role: (account.roleIds || []).map(rid => org.roles.find(r => r.id === rid)?.name).filter(Boolean).join('、'),
        org: org.companyName(account.companyId) || '固定资产管理中心'
      }
      issueToken(user.value, issued)
      persist()
      return { ok: true }
    }

    // ---- mock 模式：本地校验 ----
    const account = org.users.find(u => u.username === username)
    if (!account) return { ok: false, reason: 'NOT_FOUND' }
    if (account.status !== 'ENABLED') return { ok: false, reason: 'DISABLED' }
    if ((account.password || '') !== password) return { ok: false, reason: 'PASSWORD' }

    const roleIds = [...(account.roleIds || [])]
    user.value = {
      id: account.id,
      username: account.username,
      name: account.name,
      roleIds,
      role: roleIds.map(rid => org.roles.find(r => r.id === rid)?.name).filter(Boolean).join('、'),
      companyId: account.companyId,
      deptId: account.deptId,
      position: account.position,
      org: org.companyName(account.companyId) || '固定资产管理中心'
    }
    // 签发并保存 token（mock 模式也签发，保证链路一致）
    issueToken(user.value)
    persist()

    // 记录最后登录时间
    try { await org.updateUser(account.id, { lastLoginAt: new Date().toISOString() }) } catch (e) { console.error(e) }
    return { ok: true }
  }

  /** 会话落盘（仅用户快照；token 由 authService 单独管理） */
  function persist() {
    try {
      if (user.value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user.value))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch (e) { console.error(e) }
  }

  /** 主动登出：先清本地，再通知后端 */
  async function logout() {
    clearSession()
    await authService.logout()
  }

  /**
   * 被动登出（401 / token 失效）：只清本地，不再发请求，
   * 避免"用失效 token 去调登出接口又吃一个 401"的死循环。
   */
  function clearSession() {
    user.value = null
    setToken('')
    try { sessionStorage.removeItem(STORAGE_KEY) } catch (e) { console.error(e) }
  }

  function restore() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY)
      if (saved) user.value = JSON.parse(saved)
    } catch (e) {
      console.error(e)
    }
  }

  return { user, isLoggedIn, permissions, can, login, logout, clearSession, restore }
})
