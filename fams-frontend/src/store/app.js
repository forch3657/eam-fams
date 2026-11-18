import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useBreakpoint } from '../composables/useBreakpoint'

// 设备态是模块级单例，store 复用同一组监听与 computed，避免每个组件各注册一次 resize
const bp = useBreakpoint()

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const visitedViews = ref([])

  // 手机端导航抽屉开合态
  const navDrawerOpen = ref(false)
  // 平板端可临时展开侧栏；null 表示跟随自动折叠
  const sidebarOverride = ref(null)

  /** 桌面沿用用户手动态；非桌面默认折叠为 64px 图标栏（手机 aside 整体隐藏） */
  const sidebarCollapsedEffective = computed(() => {
    if (bp.isDesktop.value) return sidebarCollapsed.value
    if (sidebarOverride.value !== null) return sidebarOverride.value
    return true
  })

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function setSidebarCollapsed(value) {
    sidebarCollapsed.value = !!value
  }

  function openNavDrawer() {
    navDrawerOpen.value = true
  }

  function closeNavDrawer() {
    navDrawerOpen.value = false
  }

  function toggleNavDrawer() {
    navDrawerOpen.value = !navDrawerOpen.value
  }

  function addView(view) {
    const hit = visitedViews.value.find(v => v.path === view.path)
    if (hit) {
      // 标题以路由 meta 为准：避免标签残留旧标题（菜单改名后仍显示历史文案）
      hit.title = view.title
      return
    }
    visitedViews.value.push(view)
  }

  function removeView(path) {
    visitedViews.value = visitedViews.value.filter(v => v.path !== path)
  }

  /** 清空标签栏：切换账号/退出登录时调用，避免看到上一位用户打开过的页面 */
  function resetViews() {
    visitedViews.value = []
  }

  return {
    sidebarCollapsed,
    visitedViews,
    sidebarCollapsedEffective,
    navDrawerOpen,
    sidebarOverride,
    tier: bp.tier,
    device: bp.device,
    isPhone: bp.isPhone,
    isTablet: bp.isTablet,
    isDesktop: bp.isDesktop,
    isMobile: bp.isMobile,
    isLandscape: bp.isLandscape,
    isShort: bp.isShort,
    isVeryShort: bp.isVeryShort,
    orientation: bp.orientation,
    viewportWidth: bp.width,
    viewportHeight: bp.height,
    toggleSidebar,
    setSidebarCollapsed,
    openNavDrawer,
    closeNavDrawer,
    toggleNavDrawer,
    addView,
    removeView,
    resetViews
  }
})
