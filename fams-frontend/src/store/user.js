import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useOrgStore } from './org'

const STORAGE_KEY = 'fams-user'

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

  /** 是否拥有其中任意一项权限 */
  function canAny(codes = []) {
    if (!codes || !codes.length) return true
    return codes.some(c => can(c))
  }

  /**
   * 登录
   * @returns {Promise<{ok: boolean, reason?: string}>}
   *   reason: NOT_FOUND 账号不存在 / DISABLED 账号已停用 / PASSWORD 密码错误
   */
  async function login(username, password) {
    const org = useOrgStore()
    if (!org.loaded) await org.loadAll()

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
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user.value)) } catch (e) { console.error(e) }

    // 记录最后登录时间
    try { await org.updateUser(account.id, { lastLoginAt: new Date().toISOString() }) } catch (e) { console.error(e) }
    return { ok: true }
  }

  function logout() {
    user.value = null
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

  return { user, isLoggedIn, permissions, can, canAny, login, logout, restore }
})
