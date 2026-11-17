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

        <el-sub-menu v-if="groupVisible(['fa:view', 'fa:report', 'fa:settings'])" index="fixed-asset-group">
          <template #title><el-icon><Monitor /></el-icon><span>固定资产</span></template>
          <el-menu-item v-if="can('fa:view')" index="/fixed-assets"><el-icon><Notebook /></el-icon><span>资产管理</span></el-menu-item>
          <el-menu-item v-if="can('fa:report')" index="/fixed-asset-reports"><el-icon><DataAnalysis /></el-icon><span>资产报表</span></el-menu-item>
          <el-menu-item v-if="can('fa:settings')" index="/fixed-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
        </el-sub-menu>

        <el-sub-menu v-if="groupVisible(['lv:view', 'lv:report', 'lv:settings'])" index="low-value-asset-group">
          <template #title><el-icon><Box /></el-icon><span>低值资产</span></template>
          <el-menu-item v-if="can('lv:view')" index="/low-value-assets"><el-icon><Goods /></el-icon><span>资产管理</span></el-menu-item>
          <el-menu-item v-if="can('lv:report')" index="/low-value-asset-reports"><el-icon><Histogram /></el-icon><span>资产报表</span></el-menu-item>
          <el-menu-item v-if="can('lv:settings')" index="/low-value-asset-settings"><el-icon><SetUp /></el-icon><span>基础设置</span></el-menu-item>
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
          <button
            type="button"
            class="collapse-btn"
            :aria-label="appStore.sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            :aria-expanded="!appStore.sidebarCollapsed"
            @click="appStore.toggleSidebar"
          >
            <el-icon><Fold v-if="!appStore.sidebarCollapsed" /><Expand v-else /></el-icon>
          </button>
          <!-- D2 公司视角切换器：只切换展示/默认值，授权仍由角色的 dataScope 决定 -->
          <el-tooltip :content="scopeTip" placement="bottom">
            <el-select
              v-model="currentCompanyView"
              class="scope-select"
              size="small"
              :disabled="companyScope.visibleCompanies.length <= 1"
              @change="onCompanyViewChange"
            >
              <template #prefix><el-icon><OfficeBuilding /></el-icon></template>
              <el-option
                v-for="c in companyScope.visibleCompanies"
                :key="c.id"
                :label="c.name"
                :value="c.id"
              />
            </el-select>
          </el-tooltip>
        </div>
        <div class="header-right">
          <el-tooltip v-if="can('wm:todo')" :content="pendingTip" placement="bottom">
            <button
              type="button"
              class="hdr-badge"
              :aria-label="`待我审批 ${workbench.pendingCount} 条，前往工作台`"
              @click="goWorkbench"
            >
              <el-badge :value="workbench.pendingCount" :hidden="!workbench.pendingCount" :offset="[10, 6]">
                <el-icon class="hdr-icon" :class="{ 'is-empty': !workbench.pendingCount }"><Bell /></el-icon>
              </el-badge>
            </button>
          </el-tooltip>
          <el-tooltip v-if="can('wm:message')" :content="messageTip" placement="bottom">
            <button
              type="button"
              class="hdr-badge"
              :aria-label="`未读消息 ${notifyStore.unreadCount} 条，前往消息中心`"
              @click="goWorkbench"
            >
              <el-badge :value="notifyStore.unreadCount" :hidden="!notifyStore.unreadCount" :offset="[10, 6]">
                <el-icon class="hdr-icon" :class="{ 'is-empty': !notifyStore.unreadCount }"><ChatDotRound /></el-icon>
              </el-badge>
            </button>
          </el-tooltip>
          <el-tag v-if="dataMode === 'mock'" class="mode-tag" type="info" effect="plain" size="small">{{ modeLabel }}</el-tag>
          <el-dropdown trigger="click" @command="handleCommand">
            <span
              class="user-info"
              role="button"
              tabindex="0"
              :aria-label="`当前用户 ${userStore.user?.name || ''}，打开账户菜单`"
              @keydown.enter.prevent="$event.target.click()"
              @keydown.space.prevent="$event.target.click()"
            >
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
        <AppBreadcrumb />
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import AppBreadcrumb from '../components/AppBreadcrumb.vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '../store/app'
import { useUserStore } from '../store/user'
import { useFixedAssetStore } from '../store/fixedAsset'
import { useLowValueAssetStore } from '../store/lowValueAsset'
import { useOrgStore } from '../store/org'
import { useNotifyStore } from '../store/notify'
import { useAuditStore } from '../store/audit'
import { useWorkbenchStore } from '../store/workbench'
import { useCompanyScopeStore } from '../store/companyScope'
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
const companyScope = useCompanyScopeStore()

const activeMenu = computed(() => route.path)
/** 权限判定（角色在组织架构中维护，登录后按角色解析） */
const can = code => userStore.can(code)
/** 分组内若没有任何可见子项，则整组隐藏，避免出现空菜单组 */
const groupVisible = perms => perms.some(p => can(p))
const modeLabel = computed(() => (dataMode === 'mock' ? '演示数据' : '后端接口'))

/** D2 公司视角名（随视角切换；组织主数据现查，改名后立即可见） */
const scopeName = computed(() => companyScope.viewName)
/** 下拉框绑定值：空视角时回落到用户所属公司，确保单公司用户也显示公司名而非「请选择」 */
const currentCompanyView = computed({
  get: () => companyScope.effectiveCompanyId,
  set: id => companyScope.setView(id)
})
/** 切换公司视角：只改展示与新建默认值；重新装载各业务视图以按新视角收窄 */
function onCompanyViewChange(id) {
  if (!companyScope.setView(id)) return
  // 视角变化后重新拉取各业务视图；服务端按主体授权集合返回，前端再按所选公司收窄展示
  try {
    if (can('fa:view')) fixedAssetStore.loadAll()
    if (can('lv:view')) lowValueAssetStore.loadAll()
    if (can('wm:todo')) workbench.load(true)
    if (can('sys:log')) auditStore.loadAll()
  } catch (e) { console.error(e) }
}
/** 数据范围说明：口径来自角色的 dataScope，视角切换不改变授权 */
const scopeTip = computed(() => {
  // 取第一个启用角色：停用角色不再代表当前数据范围
  const ids = userStore.user?.roleIds || []
  const role = ids
    .map(id => orgStore.roles.find(r => r.id === id))
    .find(r => r && r.status === 'ENABLED')
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

onMounted(async () => {
  // 预取一律按权限判定：业务角色没有对应权限时不发请求，
  // 否则登录首屏就会冒出「无权限访问该数据」的 403（2026-11-02 收紧）。
  // 不判断 loaded：换账号后 store 可能残留上一位用户的数据（权限集合相同则不会重载），
  // MainLayout 只在登录后挂载一次，这里强制按当前账号重新拉取，避免越权展示旧数据。
  if (can('fa:view')) fixedAssetStore.loadAll()
  if (can('lv:view')) lowValueAssetStore.loadAll()
  // 守卫只加载了基础三张表；这里按权限补用户表（无权角色直接跳过，不产生 403）
  if (can('org:user') || can('wm:todo')) await orgStore.loadAll({ withUsers: true })
  // D2 公司视角：组织主数据就绪后初始化（恢复会话视角或回落到用户自身公司）
  companyScope.init()
  if (can('wm:message')) notifyStore.loadAll()
  if (can('sys:log')) auditStore.loadAll()
  // 工作台聚合数据（顶栏待办徽标依赖它）
  // 不在这里判断 loaded：load 内部按权限快照判定，换账号后权限变化会自动重新装载
  if (can('wm:todo')) workbench.load()
  // 数据字典是业务枚举的统一维护入口：无 sys:dict 时退回内置枚举
  if (can('sys:dict')) loadDictEnums()
  // 系统参数需被业务真正消费（编号前缀/预警阈值/盘点提醒等）
  if (can('sys:params') || can('wm:view')) loadSysParams()
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
