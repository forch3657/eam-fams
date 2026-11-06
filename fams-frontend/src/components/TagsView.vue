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
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import { Close } from '@element-plus/icons-vue'

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
</script>
