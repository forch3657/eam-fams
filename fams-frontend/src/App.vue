<template>
  <!-- 客户端版本落后于服务端时提示强刷：否则用户会一直跑旧包，把已修的缺陷当成没修 -->
  <div v-if="versionIssues.length" class="app-version-banner" role="alert">
    <span class="app-version-text">
      系统已更新，请刷新页面以使用最新版本
      <em v-if="versionDetail">（{{ versionDetail }}）</em>
    </span>
    <el-button type="primary" link size="small" @click="reloadPage">立即刷新</el-button>
  </div>
  <router-view />
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { checkClientVersion } from './services/versionCheck'

const versionIssues = ref([])
const versionDetail = computed(() => versionIssues.value.join('；'))

function reloadPage() {
  window.location.reload()
}

onMounted(async () => {
  const issues = await checkClientVersion()
  if (issues?.length) versionIssues.value = issues
})
</script>

<style scoped>
.app-version-banner {
  position: sticky;
  top: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 16px;
  font-size: 13px;
  color: #7a4a00;
  background: #fdf6ec;
  border-bottom: 1px solid #f5dab1;
}

.app-version-text em {
  font-style: normal;
  color: #a06000;
}
</style>
