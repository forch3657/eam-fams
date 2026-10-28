<template>
  <el-container class="layout-container theme-ent">
    <el-aside :width="appStore.sidebarCollapsed ? '64px' : '200px'" class="sidebar">
      <div class="logo">
        <!-- 固定资产管理系统的标识图标：用 Box（实物资产/物资箱）表达"资产"，
             折叠时只显示图标，展开时图标 + 名称 -->
        <el-icon class="logo-icon"><Box /></el-icon>
        <span v-if="!appStore.sidebarCollapsed" class="logo-text">固定资产管理</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="appStore.sidebarCollapsed" router class="sidebar-menu">
        <el-menu-item v-if="can('wm:view')" index="/workbench">
          <el-icon><HomeFilled /></el-icon>
          <span>工作台</span>
        </el-menu-item>

        <el-sub-menu v-if="groupVisible(['fa:view', 'fa:report'])" index="fixed-asset-group">
          <template #title><el-icon><Monitor /></el-icon><span>固定资产</span></template>
          <el-menu-item v-if="can('fa:view')" index="/fixed-assets"><el-icon><Notebook /></el-icon><span>资产管理</span></el-menu-item>
          <el-menu-item v-if="can('fa:report')" index="/fixed-asset-reports"><el-icon><DataAnalysis /></el-icon><span>资产报表</span></el-menu-item>
          <el-menu-item v-if="can('fa:view')" index="/fixed-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['lv:view', 'lv:report'])" index="low-value-asset-group">
          <template #title><el-icon><Box /></el-icon><span>低值资产</span></template>
          <el-menu-item v-if="can('lv:view')" index="/low-value-assets"><el-icon><Goods /></el-icon><span>资产管理</span></el-menu-item>
          <el-menu-item v-if="can('lv:report')" index="/low-value-asset-reports"><el-icon><Histogram /></el-icon><span>资产报表</span></el-menu-item>
          <el-menu-item v-if="can('lv:view')" index="/low-value-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['org:company', 'org:dept', 'org:user', 'org:role'])" index="org-group">
          <template #title><el-icon><User /></el-icon><span>组织架构</span></template>
          <el-menu-item v-if="can('org:company')" index="/system/company"><el-icon><OfficeBuilding /></el-icon><span>公司管理</span></el-menu-item>
          <el-menu-item v-if="can('org:dept')" index="/system/dept"><el-icon><Connection /></el-icon><span>部门管理</span></el-menu-item>
          <el-menu-item v-if="can('org:user')" index="/system/user"><el-icon><UserFilled /></el-icon><span>用户管理</span></el-menu-item>
          <el-menu-item v-if="can('org:role')" index="/system/role"><el-icon><Avatar /></el-icon><span>角色管理</span></el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['sys:dict', 'sys:log', 'sys:workflow', 'sys:params', 'sys:message', 'sys:template', 'sys:terminal', 'sys:import'])" index="system-group">
          <template #title><el-icon><Setting /></el-icon><span>系统管理</span></template>
          <el-menu-item v-if="can('sys:dict')" index="/system/dict"><el-icon><Collection /></el-icon><span>数据字典</span></el-menu-item>
          <el-menu-item v-if="can('sys:log')" index="/system/log"><el-icon><Document /></el-icon><span>操作日志</span></el-menu-item>
          <el-menu-item v-if="can('sys:workflow')" index="/system/workflow"><el-icon><Share /></el-icon><span>流程配置</span></el-menu-item>
          <el-menu-item v-if="can('sys:params')" index="/system/params"><el-icon><Operation /></el-icon><span>系统参数</span></el-menu-item>
          <el-menu-item v-if="can('sys:message')" index="/system/message-center"><el-icon><ChatDotRound /></el-icon><span>消息中心</span></el-menu-item>
          <el-menu-item v-if="can('sys:template')" index="/system/message-template"><el-icon><Tickets /></el-icon><span>消息模板</span></el-menu-item>
          <el-menu-item v-if="can('sys:terminal')" index="/system/terminal"><el-icon><Cellphone /></el-icon><span>盘点终端</span></el-menu-item>
          <el-menu-item v-if="can('sys:import')" index="/system/data-import"><el-icon><Upload /></el-icon><span>数据导入</span></el-menu-item>
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
          <!-- 当前数据范围标识：由角色配置决定，只读展示（避免看起来像可切换控件） -->
          <el-tooltip :content="scopeTip" placement="bottom">
            <span class="scope-chip">
              <el-icon><OfficeBuilding /></el-icon>
              <span class="scope-name">{{ scopeName }}</span>
            </span>
          </el-tooltip>
        </div>
        <div class="header-right">
          <el-tooltip v-if="can('wm:todo')" :content="pendingTip" placement="bottom">
            <el-badge
              :value="workbench.pendingCount"
              :hidden="!workbench.pendingCount"
              :offset="[10, 6]"
              class="hdr-badge"
              @click="goWorkbench"
            >
              <el-icon class="hdr-icon" :class="{ 'is-empty': !workbench.pendingCount }"><Bell /></el-icon>
            </el-badge>
          </el-tooltip>
          <el-tooltip v-if="can('wm:message')" :content="messageTip" placement="bottom">
            <el-badge
              :value="notifyStore.unreadCount"
              :hidden="!notifyStore.unreadCount"
              :offset="[10, 6]"
              class="hdr-badge"
              @click="goWorkbench"
            >
              <el-icon class="hdr-icon" :class="{ 'is-empty': !notifyStore.unreadCount }"><ChatDotRound /></el-icon>
            </el-badge>
          </el-tooltip>
          <el-tag class="mode-tag" type="info" effect="plain" size="small">{{ modeLabel }}</el-tag>
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
import { labelOf } from '../constants/enums'
import { loadSysParams } from '../services/sysParams'
import { Monitor, Setting, User, Box, Fold, Expand, OfficeBuilding, CaretBottom, HomeFilled, Bell, ChatDotRound,
  Notebook, DataAnalysis, SetUp, Goods, Histogram, Connection, UserFilled, Avatar,
  Collection, Document, Share, Operation, Tickets, Cellphone, Upload } from '@element-plus/icons-vue'

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

/**
 * 当前数据范围（公司）
 *
 * 按用户的 companyId 从组织主数据现查，而不是直接用登录时的快照 user.org：
 * 组织架构被清空/公司改名后，顶栏能立即反映，不必重新登录。
 */
const scopeName = computed(() => {
  const u = userStore.user
  if (!u) return '固定资产管理中心'
  if (u.companyId) {
    const live = orgStore.companyName(u.companyId)
    if (live) return live
    // 主数据已加载但查不到该公司（例如刚清空组织架构）：不要回落到过期快照
    if (orgStore.loaded) return '固定资产管理中心'
  }
  return u.org || '固定资产管理中心'
})
/** 数据范围说明：口径来自角色的 dataScope，不是可随意切换的控件 */
const scopeTip = computed(() => {
  const roleId = (userStore.user?.roleIds || [])[0]
  const role = orgStore.roles.find(r => r.id === roleId)
  const scope = role?.dataScope ? labelOf('DATA_SCOPE', role.dataScope) : ''
  return scope ? `数据范围：${scope}（由角色配置决定）` : '数据范围由角色配置决定'
})
/** 徽标提示：数量为 0 时明确说明"暂无"，避免与旁边的消息徽标混淆 */
const pendingTip = computed(() => (workbench.pendingCount ? `待我审批 ${workbench.pendingCount} 项` : '暂无待我审批'))
const messageTip = computed(() => (notifyStore.unreadCount ? `我的消息 ${notifyStore.unreadCount} 条未读` : '暂无未读消息'))

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

async function handleCommand(cmd) {
  if (cmd === 'logout') {
    // logout 会通知后端登出，需等其完成再跳，避免跳转打断请求
    await userStore.logout()
    router.push('/login')
  }
}

/** 顶栏徽标 → 工作台 */
function goWorkbench() {
  router.push('/workbench')
}
</script>
