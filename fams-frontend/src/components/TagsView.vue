<template>
  <div class="tags-view">
    <div class="tags-list">
      <span
        v-for="v in appStore.visitedViews"
        :key="v.path"
        class="tag-item"
        :class="{ active: v.path === route.path }"
        role="link"
        tabindex="0"
        :aria-label="`切换到页签 ${v.title}`"
        :aria-current="v.path === route.path ? 'page' : undefined"
        @click="go(v.path)"
        @keydown.enter="go(v.path)"
        @keydown.space.prevent="go(v.path)"
      >
        {{ v.title }}
        <button
          v-if="v.path !== home"
          type="button"
          class="tag-close"
          :aria-label="`关闭页签 ${v.title}`"
          @click.stop="close(v)"
        >
          <el-icon><Close /></el-icon>
        </button>
      </span>
    </div>
    <button
      type="button"
      class="tags-clear"
      :disabled="!closableCount"
      title="关闭全部已打开的页签，返回工作台"
      aria-label="关闭全部页签"
      @click="closeAll"
    >
      <el-icon><Delete /></el-icon>
      <span>关闭全部</span>
    </button>
  </div>
</template>

<script setup>
import { computed, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import { Close, Delete } from '@element-plus/icons-vue'

const props = defineProps({ home: { type: String, default: '/fixed-assets' } })
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

function go(path) {
  if (path !== route.path) router.push(path)
}

function close(v) {
  const wasActive = v.path === route.path
  appStore.removeView(v.path)
  if (wasActive) {
    const rest = appStore.visitedViews
    router.push(rest.length ? rest[rest.length - 1].path : props.home)
  }
}

const closableCount = computed(() =>
  appStore.visitedViews.filter(v => v.path !== props.home).length
)

/** 清空标签栏并返回工作台；导航未发生或被守卫改写时，补回当前页标签 */
async function closeAll() {
  if (!closableCount.value) return
  appStore.resetViews()
  try { await router.push(props.home) } catch { /* 重复导航或守卫拒绝：忽略 */ }
  await nextTick()
  if (!appStore.visitedViews.length) {
    appStore.addView({ path: route.path, title: route.meta.title || '首页' })
  }
}
</script>
