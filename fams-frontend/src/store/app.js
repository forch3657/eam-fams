import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const visitedViews = ref([])

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
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

  return { sidebarCollapsed, visitedViews, toggleSidebar, addView, removeView }
})
