import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  const sidebarCollapsed = ref(false)
  const visitedViews = ref([])

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  function addView(view) {
    if (!visitedViews.value.some(v => v.path === view.path)) {
      visitedViews.value.push(view)
    }
  }

  function removeView(path) {
    visitedViews.value = visitedViews.value.filter(v => v.path !== path)
  }

  return { sidebarCollapsed, visitedViews, toggleSidebar, addView, removeView }
})
