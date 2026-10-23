<template>
  <el-container class="layout-container theme-ent">
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '200px'" class="sidebar">
      <div class="logo">
        <span v-if="!appStore.sidebarCollapsed">固定资产管理</span>
        <span v-else>固资</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="appStore.sidebarCollapsed" router class="sidebar-menu">
        <el-menu-item v-if="can('wm:view')" index="/workbench">
          <el-icon><HomeFilled /></el-icon>
          <span>工作台</span>
        </el-menu-item>

        <el-sub-menu v-if="groupVisible(['fa:view', 'fa:report'])" index="fixed-asset-group">
          <template #title><el-icon><Monitor /></el-icon><span>固定资产</span></template>
          <el-menu-item v-if="can('fa:view')" index="/fixed-assets">资产管理</el-menu-item>
          <el-menu-item v-if="can('fa:report')" index="/fixed-asset-reports">资产报表</el-menu-item>
          <el-menu-item v-if="can('fa:view')" index="/fixed-asset-settings">基础设置</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['lv:view', 'lv:report'])" index="low-value-asset-group">
          <template #title><el-icon><Box /></el-icon><span>低值资产</span></template>
          <el-menu-item v-if="can('lv:view')" index="/low-value-assets">资产管理</el-menu-item>
          <el-menu-item v-if="can('lv:report')" index="/low-value-asset-reports">资产报表</el-menu-item>
          <el-menu-item v-if="can('lv:view')" index="/low-value-asset-settings">基础设置</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['org:company', 'org:dept', 'org:user', 'org:role'])" index="org-group">
          <template #title><el-icon><User /></el-icon><span>组织架构</span></template>
          <el-menu-item v-if="can('org:company')" index="/system/company">公司管理</el-menu-item>
          <el-menu-item v-if="can('org:dept')" index="/system/dept">部门管理</el-menu-item>
          <el-menu-item v-if="can('org:user')" index="/system/user">用户管理</el-menu-item>
          <el-menu-item v-if="can('org:role')" index="/system/role">角色管理</el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message', 'sys:template', 'sys:terminal'])" index="system-group">
          <template #title><el-icon><Setting /></el-icon><span>系统管理</span></template>
          <el-menu-item v-if="can('sys:dict')" index="/system/dict">数据字典</el-menu-item>
          <el-menu-item v-if="can('sys:log')" index="/system/log">操作日志</el-menu-item>
          <el-menu-item v-if="can('sys:workflow')" index="/system/workflow">流程配置</el-menu-item>
          <el-menu-item v-if="can('sys:params')" index="/system/params">系统参数</el-menu-item>
          <el-menu-item v-if="can('sys:message')" index="/system/message-center">消息中心</el-menu-item>
          <el-menu-item v-if="can('sys:template')" index="/system/message-template">消息模板</el-menu-item>
          <el-menu-item v-if="can('sys:terminal')" index="/system/terminal">盘点终端</el-menu-item>
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
          <el-tooltip v-if="can('wm:todo')" content="待我审批" placement="bottom">
            <el-badge
              :value="workbench.pendingCount"
              :hidden="!workbench.pendingCount"
              class="hdr-badge"
              @click="goWorkbench"
            >
              <el-icon class="hdr-icon"><Bell /></el-icon>
            </el-badge>
          </el-tooltip>
          <el-tooltip v-if="can('wm:message')" content="我的消息" placement="bottom">
            <el-badge
              :value="notifyStore.unreadCount"
              :hidden="!notifyStore.unreadCount"
              class="hdr-badge"
              @click="goWorkbench"
            >
              <el-icon class="hdr-icon"><ChatDotRound /></el-icon>
            </el-badge>
          </el-tooltip>
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

      <TagsView home="/workbench" />

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
import { useWorkbenchStore } from '../store/workbench'
import TagsView from '../components/TagsView.vue'
import { dataMode } from '../services'
import { loadDictEnums } from '../services/dictEnums'
import { loadSysParams } from '../services/sysParams'
import { Monitor, Setting, User, Box, Fold, Expand, OfficeBuilding, CaretBottom, HomeFilled, Bell, ChatDotRound } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const fixedAssetStore = useFixedAssetStore()
const lowValueAssetStore = useLowValueAssetStore()
const orgStore = useOrgStore()
const notifyStore = useNotifyStore()
const auditStore = useAuditStore()
const workbench = useWorkbenchStore()

const activeMenu = computed(() => route.path)
/** 权限判定（角色在组织架构中维护，登录后按角色解析） */
const can = code => userStore.can(code)
/** 分组内若没有任何可见子项，则整组隐藏，避免出现空菜单组 */
const groupVisible = perms => perms.some(p => can(p))
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
  // 工作台聚合数据（顶栏待办徽标依赖它）
  if (!workbench.loaded) workbench.load()
  // 数据字典是业务枚举的统一维护入口：启动时装载一次，字典改动后字典页会再次装载
  loadDictEnums()
  // 系统参数需被业务真正消费（编号前缀/预警阈值/盘点提醒等）
  loadSysParams()
})

function handleCommand(cmd) {
  if (cmd === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}

/** 顶栏徽标 → 工作台 */
function goWorkbench() {
  router.push('/workbench')
}
</script>
