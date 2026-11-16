import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useUserStore } from './user'
import { useOrgStore } from './org'
import { COMPANY_VIEW_STORAGE_KEY } from '../services/keys'

/**
 * D2 公司视角（仅默认值与展示，不参与授权）。
 *
 * 服务端始终按主体的授权集合（本人公司 + 下级 + 显式授权公司）判定数据范围；
 * 这里选的「视角」只决定：
 *  1) 顶栏展示的公司名；
 *  2) 新建业务记录时 companyId 的默认值；
 *  3) 前端列表主动收窄的过滤条件（X-Company-View 头，仅供前端聚合/展示参考）。
 * 切换账号 / 登出必须清空，避免把上一位用户的视角带入新会话。
 */
export const useCompanyScopeStore = defineStore('companyScope', () => {
  const userStore = useUserStore()
  const orgStore = useOrgStore()

  /** 当前选中的公司视角 id；空 = 跟随用户自身公司 */
  const viewCompanyId = ref('')

  /** 用户的 dataScope：从启用角色归并（与后端 dataScopeOf 同口径，取最宽松） */
  const dataScope = computed(() => {
    const ids = userStore.user?.roleIds || []
    const rank = { ALL: 5, COMPANY: 4, DEPT: 3, DEPT_ONLY: 2, SELF: 1 }
    let best = ''
    let bestRank = -1
    ids.forEach(id => {
      const role = orgStore.roles.find(r => r.id === id && r.status === 'ENABLED')
      const scope = role?.dataScope || ''
      const r = rank[scope] || 0
      if (r > bestRank) { bestRank = r; best = scope }
    })
    return best || 'ALL'
  })

  /** 该公司及其全部下级（按 parentId 递归展开，防环） */
  function withDescendants(seedIds) {
    const result = new Set(seedIds.filter(Boolean))
    const childrenOf = parent => orgStore.companies.filter(c => (c.parentId || null) === parent)
    const queue = [...result]
    const seen = new Set()
    while (queue.length) {
      const id = queue.shift()
      if (seen.has(id)) continue
      seen.add(id)
      childrenOf(id).forEach(c => {
        if (!result.has(c.id)) { result.add(c.id); queue.push(c.id) }
      })
    }
    return result
  }

  /** 当前用户可切换的公司视角（授权集合，与后端 CompanyScopeResolver 同口径） */
  const visibleCompanies = computed(() => {
    if (!userStore.user) return []
    if (dataScope.value === 'ALL') {
      return orgStore.companies.filter(c => c.status === 'ENABLED')
    }
    const seeds = [userStore.user.companyId, ...(userStore.user.scopeCompanyIds || [])].filter(Boolean)
    const ids = withDescendants(seeds)
    return orgStore.companies.filter(c => ids.has(c.id) && c.status === 'ENABLED')
  })

  /** 当前视角公司 id：未选或失效时回落到用户自身公司 */
  const effectiveCompanyId = computed(() => {
    if (viewCompanyId.value && visibleCompanies.value.some(c => c.id === viewCompanyId.value)) {
      return viewCompanyId.value
    }
    return userStore.user?.companyId || ''
  })

  /** 当前视角公司名 */
  const viewName = computed(() => {
    const id = effectiveCompanyId.value
    return (id && orgStore.companyName(id)) || userStore.user?.org || '固定资产管理中心'
  })

  /** 新建业务记录的默认归属公司 */
  const defaultCompanyId = computed(() => effectiveCompanyId.value)

  function persist() {
    try {
      if (viewCompanyId.value) sessionStorage.setItem(COMPANY_VIEW_STORAGE_KEY, viewCompanyId.value)
      else sessionStorage.removeItem(COMPANY_VIEW_STORAGE_KEY)
    } catch (e) { console.error(e) }
  }

  /** 初始化：恢复会话里保存的视角（若对当前用户仍有效） */
  function init() {
    try {
      const saved = sessionStorage.getItem(COMPANY_VIEW_STORAGE_KEY) || ''
      viewCompanyId.value = saved && visibleCompanies.value.some(c => c.id === saved) ? saved : ''
    } catch (e) { console.error(e) }
  }

  /** 切换视角：只允许切到授权集合内的公司 */
  function setView(id) {
    if (!id || !visibleCompanies.value.some(c => c.id === id)) return false
    viewCompanyId.value = id
    persist()
    return true
  }

  /** 退出 / 换账号 / 被动登出：清空视角现场 */
  function clear() {
    viewCompanyId.value = ''
    try { sessionStorage.removeItem(COMPANY_VIEW_STORAGE_KEY) } catch (e) { console.error(e) }
  }

  return {
    viewCompanyId,
    visibleCompanies,
    effectiveCompanyId,
    viewName,
    defaultCompanyId,
    dataScope,
    init,
    setView,
    clear
  }
})
