<template>
  <el-container class="layout-container theme-ent">
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '200px'" class="sidebar">
      <div class="logo">
        <span v-if="!appStore.sidebarCollapsed">固定资产管理</span>
        <span v-else>固资</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="appStore.sidebarCollapsed" router class="sidebar-menu">
        <el-sub-menu index="fixed-asset-group">
          <template #title><el-icon><Monitor /></el-icon><span>固定资产</span></template>
          <el-menu-item index="/fixed-assets">资产管理</el-menu-item>
          <el-menu-item index="/fixed-asset-reports">资产报表</el-menu-item>
          <el-menu-item index="/fixed-asset-settings">基础设置</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="low-value-asset-group">
          <template #title><el-icon><Box /></el-icon><span>低值资产</span></template>
          <el-menu-item index="/low-value-assets">资产管理</el-menu-item>
          <el-menu-item index="/low-value-asset-reports">资产报表</el-menu-item>
          <el-menu-item index="/low-value-asset-settings">基础设置</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="org-group">
          <template #title><el-icon><User /></el-icon><span>组织架构</span></template>
          <el-menu-item index="/system/company">公司管理</el-menu-item>
          <el-menu-item index="/system/dept">部门管理</el-menu-item>
          <el-menu-item index="/system/user">用户管理</el-menu-item>
          <el-menu-item index="/system/role">角色管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu index="system-group">
          <template #title><el-icon><Setting /></el-icon><span>系统管理</span></template>
          <el-menu-item index="/system/dict">数据字典</el-menu-item>
          <el-menu-item index="/system/log">操作日志</el-menu-item>
          <el-menu-item index="/system/workflow">流程配置</el-menu-item>
          <el-menu-item index="/system/params">系统参数</el-menu-item>
          <el-menu-item index="/system/message-center">消息中心</el-menu-item>
          <el-menu-item index="/system/message-template">消息模板</el-menu-item>
          <el-menu-item index="/system/terminal">终端管理</el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container class="main-area">
      <el-header class="layout-header">
        <div class="header-left">
          <el-icon class="collapse-btn" @click="appStore.toggleSidebar">
            <Fold v-if="!appStore.sidebarCollapsed" />
            <Expand v-else />
          </el-icon>
          <span class="scope-trigger">
            <el-icon><OfficeBuilding /></el-icon>
            {{ userStore.user?.org || '固定资产管理中心' }}
          </span>
        </div>
        <div class="header-right">
          <el-tag class="role-tag" type="primary" effect="dark" size="small">{{ modeLabel }}</el-tag>
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <span class="avatar">{{ (userStore.user?.name || '管').charAt(0) }}</span>
              {{ userStore.user?.name }}
              <el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <TagsView home="/fixed-assets" />

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import { useUserStore } from '../store/user'
import { useFixedAssetStore } from '../store/fixedAsset'
import { useLowValueAssetStore } from '../store/lowValueAsset'
import { useOrgStore } from '../store/org'
import { useNotifyStore } from '../store/notify'
import { useAuditStore } from '../store/audit'
import TagsView from '../components/TagsView.vue'
import { dataMode } from '../services'
import { Monitor, Setting, User, Box, Fold, Expand, OfficeBuilding, CaretBottom } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const fixedAssetStore = useFixedAssetStore()
const lowValueAssetStore = useLowValueAssetStore()
const orgStore = useOrgStore()
const notifyStore = useNotifyStore()
const auditStore = useAuditStore()

const activeMenu = computed(() => route.path)
const modeLabel = computed(() => (dataMode === 'mock' ? '演示数据' : '后端接口'))

watch(
  () => route.path,
  () => {
    appStore.addView({ path: route.path, title: route.meta.title || '首页' })
  },
  { immediate: true }
)

onMounted(() => {
  if (!fixedAssetStore.loaded) fixedAssetStore.loadAll()
  if (!lowValueAssetStore.loaded) lowValueAssetStore.loadAll()
  if (!orgStore.loaded) orgStore.loadAll()
  if (!notifyStore.loaded) notifyStore.loadAll()
  if (!auditStore.loaded) auditStore.loadAll()
})

function handleCommand(cmd) {
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}
</script>
