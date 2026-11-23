<template>
  <div class="oauth-pending">
    <div class="oauth-card">
      <div class="oauth-spinner" />
      <h2>正在跳转柳讯登录</h2>
      <p v-if="message">{{ message }}</p>
      <p v-else>请稍候，即将进入统一身份认证…</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { getToken } from '../services/auth'
import { liuxunConfig } from '../services/liuxun'

const route = useRoute()
const router = useRouter()
const message = ref('')

onMounted(async () => {
  // 已有会话：直接回目标页，不再跳授权（避免重复建号）
  if (getToken()) {
    const target = safeTarget(route.query.target)
    router.replace(target)
    return
  }

  const config = await liuxunConfig(true)
  const target = safeTarget(route.query.target)

  if (config.mock) {
    // mock 模式：不访问柳讯，直接走本地回调链路（后端用假 account_info）
    message.value = 'mock 模式：正在模拟柳讯授权…'
    router.replace({
      path: '/oauth/callback',
      query: { code: 'mock-code', target }
    })
    return
  }

  // 真实模式：跳柳讯授权页；redirect_uri 由后端配置，回调回到本系统
  const authorizeUrl = config.authorizeUrl || ''
  if (!authorizeUrl) {
    ElMessage.error('柳讯授权地址未配置')
    router.replace('/login')
    return
  }
  const url = new URL(authorizeUrl, window.location.origin)
  // 目标页编码进 state（柳讯支持透传时回调带回）；不支持时回调页用 target 参数兜底
  url.searchParams.set('state', encodeURIComponent(JSON.stringify({ target })))
  window.location.href = url.toString()
})

/** 只允许站内路径，防开放重定向 */
function safeTarget(value) {
  const target = String(value || '').trim()
  return target.startsWith('/') && !target.startsWith('//') ? target : '/workbench'
}
</script>

<style scoped>
.oauth-pending { display:flex; align-items:center; justify-content:center; height:100vh; background:#f0f2f5; }
.oauth-card { text-align:center; padding:40px 48px; background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.08); }
.oauth-card h2 { font-size:18px; margin:18px 0 8px; color:#303133; }
.oauth-card p { font-size:13px; color:#909399; margin:0; }
.oauth-spinner { width:36px; height:36px; margin:0 auto; border:3px solid #e4e7ed; border-top-color:#409eff; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style>
