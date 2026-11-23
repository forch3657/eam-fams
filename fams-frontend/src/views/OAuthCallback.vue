<template>
  <div class="oauth-pending">
    <div class="oauth-card">
      <div class="oauth-spinner" v-if="!failed" />
      <h2>{{ failed ? '柳讯登录失败' : '正在完成登录' }}</h2>
      <p>{{ message }}</p>
      <el-button v-if="failed" type="primary" size="small" @click="backToLogin">返回登录页</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { exchangeCode, applySession, liuxunConfig } from '../services/liuxun'
import { useOrgStore } from '../store/org'
import { useAppStore } from '../store/app'
import { useUserStore } from '../store/user'

const route = useRoute()
const router = useRouter()
const message = ref('正在校验授权码并签发会话…')
const failed = ref(false)

onMounted(async () => {
  try {
    const code = String(route.query.code || '').trim()
    if (!code) throw new Error('回调缺少授权码 code')

    const res = await exchangeCode(code)
    const account = applySession(res)

    // 与 store/user.js 登录成功路径一致：先清组织缓存，再加载主数据。
    const org = useOrgStore()
    org.reset()
    try { await org.loadAll({ withUsers: false }) } catch (e) { console.error('[oauth] 组织主数据加载失败', e) }

    const userStore = useUserStore()
    const snapshot = {
      ...account,
      role: (account.roleIds || []).join('、'),
      org: org.companyName?.(account.companyId) || '固定资产管理中心'
    }
    userStore.user = snapshot
    // store 的 persist() 未导出，按相同键直接落盘，保证刷新后 restore() 能恢复
    try { sessionStorage.setItem('fams-user', JSON.stringify(snapshot)) } catch (e) { console.error(e) }
    try { useAppStore().resetViews() } catch (e) { console.error(e) }

    // 目标优先级：query.target（entry 传入） > state.target（柳讯透传） > redirect > /workbench
    const target = safeTarget(route.query.target || stateTarget(route.query.state) || route.query.redirect)
    message.value = '登录成功，正在跳转…'
    router.replace(target)
  } catch (e) {
    failed.value = true
    message.value = e?.message || '柳讯登录失败，请稍后重试'
    console.error('[oauth] 回调失败', e)
  }
})

function stateTarget(state) {
  try {
    const parsed = JSON.parse(String(state || ''))
    return parsed?.target || ''
  } catch (e) {
    return ''
  }
}

function safeTarget(value) {
  const target = String(value || '').trim()
  return target.startsWith('/') && !target.startsWith('//') ? target : '/workbench'
}

function backToLogin() {
  router.replace('/login')
}
</script>

<style scoped>
.oauth-pending { display:flex; align-items:center; justify-content:center; height:100vh; background:#f0f2f5; }
.oauth-card { text-align:center; padding:40px 48px; background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.08); }
.oauth-card h2 { font-size:18px; margin:18px 0 8px; color:#303133; }
.oauth-card p { font-size:13px; color:#909399; margin:0 0 16px; max-width:420px; word-break:break-all; }
.oauth-spinner { width:36px; height:36px; margin:0 auto; border:3px solid #e4e7ed; border-top-color:#409eff; border-radius:50%; animation:spin .8s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style>
