<template>
  <div class="tags-view">
    <div class="tags-list">
      <span
        v-for="v in appStore.visitedViews"
        :key="v.path"
        class="tag-item"
        :class="{ active: v.path === route.path }"
        @click="go(v.path)"
      >
        {{ v.title }}
        <el-icon v-if="v.path !== home" class="tag-close" @click.stop="close(v)">
          <Close />
        </el-icon>
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
