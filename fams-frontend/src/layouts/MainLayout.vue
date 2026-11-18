<template>
  <el-container class="layout-container theme-ent">
    <el-aside v-if="!appStore.isPhone" :width="appStore.sidebarCollapsedEffective ? '64px' : '200px'" class="sidebar">
      <div class="logo">
        <!-- 固定资产管理系统的标识图标：用 Box（实物资产/物资箱）表达"资产"，
             折叠时只显示图标，展开时图标 + 名称 -->
        <el-icon class="logo-icon"><Box /></el-icon>
        <span v-if="!appStore.sidebarCollapsedEffective" class="logo-text">固定资产管理</span>
      </div>
      <SidebarMenu :collapse="appStore.sidebarCollapsedEffective" />
    </el-aside>

    <el-container class="main-area">
      <el-header class="layout-header">
        <div class="header-left">
          <button
            v-if="appStore.isPhone"
            ref="menuBtn"
            type="button"
            class="collapse-btn mobile-menu-btn"
            aria-label="打开导航菜单"
            aria-haspopup="dialog"
            :aria-expanded="appStore.navDrawerOpen"
            @click="appStore.openNavDrawer"
          >
            <el-icon><IconMenu /></el-icon>
          </button>
          <button
            v-else
            type="button"
            class="collapse-btn"
            :aria-label="appStore.sidebarCollapsedEffective ? '展开侧边栏' : '收起侧边栏'"
            :aria-expanded="!appStore.sidebarCollapsedEffective"
            @click="onToggleSidebar"
          >
            <el-icon><Fold v-if="!appStore.sidebarCollapsedEffective" /><Expand v-else /></el-icon>
          </button>
          <span v-if="appStore.isPhone" class="mobile-title">{{ route.meta.title || '固定资产管理' }}</span>
          <!-- D2 公司视角切换器：只切换展示/默认值，授权仍由角色的 dataScope 决定。
               手机端收纳进导航抽屉，保证公司视角仍可达 -->
          <el-tooltip v-if="!appStore.isPhone" :content="scopeTip" placement="bottom">
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
          <el-tooltip v-if="!appStore.isPhone" content="使用帮助（按角色与场景）" placement="bottom">
            <button
              type="button"
              class="hdr-badge"
              aria-label="打开使用帮助中心"
              @click="helpVisible = true"
            >
              <el-icon class="hdr-icon"><QuestionFilled /></el-icon>
            </button>
          </el-tooltip>
          <el-tag v-if="dataMode === 'mock' && !appStore.isPhone" class="mode-tag" type="info" effect="plain" size="small">{{ modeLabel }}</el-tag>
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
                <template v-if="myPositions.length > 1">
                  <div class="dropdown-label">切换岗位（当前：{{ currentPositionLabel }}）</div>
                  <el-dropdown-item
                    v-for="p in myPositions"
                    :key="p.id"
                    :command="`position:${p.id}`"
                    :disabled="p.id === userStore.user?.currentPositionId"
                  >
                    {{ positionItemLabel(p) }}
                    <span v-if="p.isPrimary" class="position-badge">主职</span>
                  </el-dropdown-item>
                  <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
                </template>
                <el-dropdown-item v-else command="logout">退出登录</el-dropdown-item>
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
      <HelpCenter v-model="helpVisible" />
      <MobileNavDrawer
        v-model="navDrawerOpen"
        :user-name="userStore.user?.name || ''"
        :companies="companyScope.visibleCompanies"
        :company-view="currentCompanyView"
        :scope-disabled="companyScope.visibleCompanies.length <= 1"
        :scope-tip="scopeTip"
        :positions="myPositions"
        :current-position-id="userStore.user?.currentPositionId"
        :current-position-label="currentPositionLabel"
        @company-change="onCompanyViewChange"
        @switch-position="onSwitchPosition"
        @open-help="helpVisible = true"
        @logout="handleCommand('logout')"
        @closed="focusMenuButton"
      />
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AppBreadcrumb from '../components/AppBreadcrumb.vue'
import SidebarMenu from '../components/SidebarMenu.vue'
import MobileNavDrawer from '../components/MobileNavDrawer.vue'
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
import HelpCenter from '../components/HelpCenter.vue'
import { dataMode } from '../services'
import { loadDictEnums } from '../services/dictEnums'
import { labelOf } from '../constants/enums'
import { loadSysParams } from '../services/sysParams'
import { Box, Fold, Expand, OfficeBuilding, CaretBottom, Bell, ChatDotRound,
  QuestionFilled, Menu as IconMenu } from '@element-plus/icons-vue'

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
const helpVisible = ref(false)
const menuBtn = ref(null)

/** 权限判定（角色在组织架构中维护，登录后按角色解析） */
const can = code => userStore.can(code)
const modeLabel = computed(() => (dataMode === 'mock' ? '演示数据' : '后端接口'))

/** 抽屉开合态绑定到 store，路由切换时自动收起 */
const navDrawerOpen = computed({
  get: () => appStore.navDrawerOpen,
  set: value => (value ? appStore.openNavDrawer() : appStore.closeNavDrawer())
})

/** 桌面沿用原折叠语义；平板用 override 临时展开；手机打开抽屉 */
function onToggleSidebar() {
  if (appStore.isPhone) {
    appStore.openNavDrawer()
  } else if (appStore.isDesktop) {
    appStore.toggleSidebar()
  } else {
    appStore.sidebarOverride = !appStore.sidebarCollapsedEffective
  }
}

/** 抽屉关闭动画结束后把焦点还给汉堡按钮，保持键盘可达性基线 */
function focusMenuButton() {
  menuBtn.value?.focus?.()
}

/** D2 公司视角名（随视角切换；组织主数据现查，改名后立即可见） */
const scopeName = computed(() => companyScope.viewName)
/** 下拉框绑定值：空视角时回落到用户所属公司，确保单公司用户也显示公司名而非「请选择」 */
const currentCompanyView = computed({
  get: () => companyScope.effectiveCompanyId,
  set: id => companyScope.setView(id)
})
/** 重新装载各业务视图（公司视角 / 当前岗位变化后都要调用） */
function reloadBusinessViews() {
  const jobs = []
  if (can('fa:view')) jobs.push(fixedAssetStore.loadAll())
  if (can('lv:view')) jobs.push(lowValueAssetStore.loadAll())
  if (can('wm:todo')) jobs.push(workbench.load(true))
  if (can('sys:log')) jobs.push(auditStore.loadAll())
  // 组织数据也随视角收窄（部门树、人员列表）；force 绕过已加载缓存
  jobs.push(orgStore.loadAll({ withUsers: can('org:user'), force: true }))
  Promise.allSettled(jobs).catch(() => {})
}

/** 切换公司视角：只改展示与新建默认值；重新装载各业务视图以按新视角收窄 */
function onCompanyViewChange(id) {
  if (!companyScope.setView(id)) return
  reloadBusinessViews()
}

// ------------------------------------------------------------------ 一人多岗
/** 当前用户的岗位列表（含主职）；单人单岗时为空，切换器隐藏 */
const myPositions = computed(() => userStore.user?.positions || [])
const currentPositionLabel = computed(() => {
  const cur = myPositions.value.find(p => p.id === userStore.user?.currentPositionId)
  return cur ? positionItemLabel(cur) : (userStore.user?.position || '主职')
})
function positionItemLabel(p) {
  const parts = [p.companyName, p.deptName, p.position].filter(Boolean)
  return parts.join(' / ') || '未命名岗位'
}

/** 切换当前岗位：重签 token → 更新用户快照 → 清空公司视角 → 重新加载全部业务视图 */
async function onSwitchPosition(positionId) {
  try {
    const ok = await userStore.switchPosition(positionId)
    if (!ok) return
    companyScope.clear()
    companyScope.init()
    reloadBusinessViews()
    ElMessage?.success?.('已切换岗位')
  } catch (e) {
    ElMessage?.error?.(e?.message || '切换岗位失败')
  }
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
    appStore.closeNavDrawer()
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
  } else if (typeof cmd === 'string' && cmd.startsWith('position:')) {
    await onSwitchPosition(cmd.slice('position:'.length))
  }
}

/** 顶栏徽标 → 工作台 */
function goWorkbench() {
  router.push('/workbench')
}
</script>
