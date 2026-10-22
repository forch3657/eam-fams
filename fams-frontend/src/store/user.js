import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'fams-user'

// 固定资产管理系统的本地账号（前端演示用，接入后端后改为调用登录接口）
const accounts = [
  { username: 'admin', password: '123456', name: '系统管理员', role: '超级管理员', org: '固定资产管理中心' },
  { username: 'asset', password: '123456', name: '资产管理员', role: '资产管理岗', org: '固定资产管理中心' }
]

export const useUserStore = defineStore('user', () => {
  const user = ref(null)

  const isLoggedIn = computed(() => !!user.value)

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

  return { user, accounts, isLoggedIn, login, logout, restore }
})
