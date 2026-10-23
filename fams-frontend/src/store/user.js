import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useOrgStore } from './org'
import { ALL_PERMISSIONS } from '../config/permissions'

const STORAGE_KEY = 'fams-user'

// 固定资产管理系统的本地账号（前端演示用，接入后端后改为调用登录接口）
// roleId 关联组织架构中的角色，登录后据此解析权限
const accounts = [
  { username: 'admin', password: '123456', name: '系统管理员', role: '超级管理员', roleId: 'R1', org: '固定资产管理中心' },
  { username: 'asset', password: '123456', name: '资产管理员', role: '资产管理岗', roleId: 'R2', org: '固定资产管理中心' }
]

export const useUserStore = defineStore('user', () => {
  const user = ref(null)

  const isLoggedIn = computed(() => !!user.value)

  /** 当前用户拥有的权限编码集合（来自组织架构中的角色） */
  const permissions = computed(() => {
    if (!user.value) return []
    const org = useOrgStore()
    // 组织主数据尚未加载完成时先按全部放行，加载完成后自动收敛
    if (!org.loaded) return [...ALL_PERMISSIONS]
    const roleIds = user.value.roleIds || (user.value.roleId ? [user.value.roleId] : [])
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

  function login(username, password) {
    const account = accounts.find(a => a.username === username && a.password === password)
    if (!account) return false
    user.value = { ...account }
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user.value)) } catch (e) { console.error(e) }
    return true
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

  return { user, accounts, isLoggedIn, permissions, can, canAny, login, logout, restore }
})
