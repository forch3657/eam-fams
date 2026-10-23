<template>
  <div class="no-permission">
    <div class="code">403</div>
    <div class="title">无访问权限</div>
    <div class="desc">当前账号未被授予该页面的访问权限。如确需使用，请联系系统管理员在「角色管理」中调整权限后重试。</div>
    <div class="actions">
      <el-button type="primary" @click="goHome">返回可访问页面</el-button>
      <el-button @click="logout">切换账号</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router"
import { useUserStore } from "../../store/user"
import { useOrgStore } from "../../store/org"

const router = useRouter()
const userStore = useUserStore()
const orgStore = useOrgStore()

/** 可访问的落地页候选（与路由守卫保持一致） */
const FALLBACK = [
  { path: "/fixed-assets", permission: "fa:view" },
  { path: "/low-value-assets", permission: "lv:view" },
  { path: "/fixed-asset-reports", permission: "fa:report" },
  { path: "/system/log", permission: "sys:log" }
]

async function goHome() {
  if (!orgStore.loaded) await orgStore.loadAll()
  const target = FALLBACK.find(r => userStore.can(r.permission))
  router.replace(target ? target.path : "/login")
}

function logout() {
  userStore.logout()
  router.replace("/login")
}
</script>

<style scoped>
.no-permission { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; gap: 12px; text-align: center; }
.code { font-size: 72px; font-weight: 700; color: var(--t-primary, #409eff); line-height: 1; }
.title { font-size: 20px; font-weight: 600; }
.desc { color: var(--t-weak, #909399); font-size: 13px; max-width: 440px; line-height: 1.6; }
.actions { margin-top: 8px; display: flex; gap: 12px; }
</style>