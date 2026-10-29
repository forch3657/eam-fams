<template>
  <div class="page-container workbench-page">
    <div class="page-header wb-header">
      <div class="wb-head-left">
        <h2>工作台</h2>
        <span class="wb-greet">{{ greeting }}，{{ userStore.user?.name }}</span>
        <el-tag v-if="roleNames && roleNames !== userStore.user?.name" size="small" effect="plain" type="primary" class="wb-role">{{ roleNames }}</el-tag>
      </div>
      <div class="wb-ops">
        <span class="wb-updated">数据更新于 {{ updatedAt }}</span>
        <el-tooltip content="刷新数据" placement="bottom">
          <el-button :loading="workbench.loading" :icon="Refresh" circle text @click="refresh" />
        </el-tooltip>
      </div>
    </div>

    <!-- 概览带：领导视角的全局家底（资产 / 低值 / 审批时效）。
         没有 wm:overview 权限的角色（纯审批人）不渲染，页面直接从行动条开始，
         待办区因此整体上移，减少无关数字对审批动作的干扰。 -->
    <OverviewPanel v-if="can('wm:overview')" />

    <!-- 行动条：只保留"要我处理 / 要我关注"的三项。
         资产总数、在途单据已由概览带承载，此处不再重复计数。 -->
    <div class="wb-stats">
      <div v-if="can('wm:todo')" class="wb-stat clickable" :class="{ primary: workbench.pendingCount > 0 }" @click="focusTab('pending')">
        <span class="v">{{ workbench.pendingCount }}</span>
        <span class="k">待我审批</span>
      </div>
      <div v-if="can('wm:alert')" class="wb-stat clickable" :class="{ danger: workbench.dangerAlertCount > 0 }" @click="focusSide('alert')">
        <span class="v">{{ workbench.alertCount }}</span>
        <span class="k">
          预警
          <span v-if="workbench.dangerAlertCount" class="k-risk">（严重 {{ workbench.dangerAlertCount }}）</span>
          <span v-else-if="!workbench.alertCount" class="k-ok">正常</span>
        </span>
      </div>
      <div class="wb-stat">
        <span class="v">{{ mineCount }}</span>
        <span class="k">我在途</span>
      </div>
    </div>

    <!-- 主体：左待办 / 右预警与消息（左右等高） -->
    <el-row :gutter="16" class="wb-main">
      <el-col :span="15">
        <el-card v-if="can('wm:todo')" shadow="never" class="wb-panel wb-panel-todo" id="wb-todo-panel">
          <template #header>
            <div class="panel-hd">
              <span>我的单据</span>
              <el-tag v-if="workbench.pendingCount" type="danger" size="small" effect="dark">
                {{ workbench.pendingCount }} 项待我审批
              </el-tag>
            </div>
          </template>
          <TodoPanel ref="todoRef" />
        </el-card>
        <el-card v-else shadow="never" class="wb-panel wb-panel-todo">
          <template #header>
            <div class="panel-hd"><span>我的单据</span></div>
          </template>
          <el-empty description="当前角色未开通「我的待办」权限，可在组织架构 → 角色管理中勾选" :image-size="70" />
        </el-card>
      </el-col>

      <el-col :span="9">
        <el-card id="wb-side-panel" shadow="never" class="wb-panel wb-panel-side">
          <template #header>
            <div class="panel-hd">
              <span>预警与消息</span>
              <span class="panel-sub">{{ workbench.alertCount }} 条预警</span>
            </div>
          </template>
          <el-tabs v-model="sideTab" class="wb-side-tabs">
            <el-tab-pane v-if="can('wm:alert')" name="alert">
              <template #label>
                预警中心
                <el-badge v-if="workbench.alertCount" :value="workbench.alertCount" type="danger" class="tab-badge" />
              </template>
              <AlertPanel />
            </el-tab-pane>
            <el-tab-pane v-if="can('wm:message')" name="message">
              <template #label>
                我的消息
                <el-badge v-if="notifyStore.unreadCount" :value="notifyStore.unreadCount" type="danger" class="tab-badge" />
              </template>
              <MessagePanel />
            </el-tab-pane>
            <el-tab-pane v-if="!can('wm:alert') && !can('wm:message')" name="none">
              <el-empty description="当前角色未开通预警与消息权限" :image-size="70" />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
<script setup>
/**
 * 工作台（登录默认首页）
 *
 * 内容按权限拼装，开放范围由「组织架构 → 角色管理」勾选的 wm:* 权限码决定：
 * - wm:todo     我的待办（待我审批 / 我发起的 / 我已处理）
 * - wm:alert    预警中心
 * - wm:overview 概览看板
 * - wm:message  我的消息
 *
 * 布局：概览带（领导视角，受 wm:overview 控制）→ 行动条（待我审批 / 预警 / 我在途）
 *      → 左「我的待办」/ 右「预警·消息」左右等高。
 * 阅读顺序为「家底 → 要我关注什么 → 我要做什么」，且概览与行动条不再重复计数。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh } from '@element-plus/icons-vue'
import { useUserStore } from '../../store/user'
import { useOrgStore } from '../../store/org'
import { useWorkbenchStore } from '../../store/workbench'
import { useApprovalStore } from '../../store/approval'
import { useNotifyStore } from '../../store/notify'
import TodoPanel from './components/TodoPanel.vue'
import AlertPanel from './components/AlertPanel.vue'
import MessagePanel from './components/MessagePanel.vue'
import OverviewPanel from './components/OverviewPanel.vue'

const router = useRouter()
const userStore = useUserStore()
const orgStore = useOrgStore()
const workbench = useWorkbenchStore()
const approvalStore = useApprovalStore()
const notifyStore = useNotifyStore()

const can = code => userStore.can(code)
const sideTab = ref(can('wm:alert') ? 'alert' : 'message')
const todoRef = ref(null)

const mineCount = computed(() => workbench.todos.mine.filter(m => m.status !== 'DONE').length)

/** 数据更新时间（供页头展示，避免"刷新"按钮成为页头唯一信息） */
const updatedAt = ref('')
function stampUpdated() {
  const d = new Date()
  updatedAt.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})
const roleNames = computed(() => {
  const ids = userStore.user?.roleIds || []
  return ids.map(id => (orgStore.roles.find(r => r.id === id) || {}).name || '').filter(Boolean).join('、')
})

async function refresh() {
  await Promise.all([workbench.load(true), approvalStore.load(true)])
  stampUpdated()
}

/** 指标卡 → 定位到待办面板的对应页签 */
function focusTab(name) {
  if (todoRef.value?.setTab) todoRef.value.setTab(name)
  scrollTo('wb-todo-panel')
}
/** 指标卡 → 定位到右侧预警/消息 */
function focusSide(name) {
  sideTab.value = name
  scrollTo('wb-side-panel')
}
function scrollTo(id) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(async () => {
  await Promise.all([workbench.load(), approvalStore.load(), orgStore.loadAll()])
  stampUpdated()
  if (!can('wm:alert') && can('wm:message')) sideTab.value = 'message'
})
</script>

<style scoped>
/**
 * 一屏布局：整页锁定为内容区高度，不再产生整页纵向滚动。
 * 纵向分配固定（页头 / 指标条 / 概览）+ 弹性（主体），
 * 主体内部各自滚动，因此概览看板始终可见，无需下拉。
 */
.workbench-page {
  height: 100%;
  min-height: 0 !important; /* 覆盖 .page-container 的 min-height:100%，否则内容会被撑高 */
  gap: 12px;                /* 原 16px，收紧以给主体留出高度 */
  overflow: hidden;
}

/* 页头：去掉独立卡片底，标题行直接坐在页面背景上，避免与下方指标条连成一片白块 */
.wb-header {
  height: 30px;
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: 0;
}
.wb-head-left { display: flex; align-items: center; gap: 12px; }
.wb-greet { font-size: 13px; color: var(--t-weak); }
.wb-role { font-weight: 500; }
.wb-ops { display: flex; align-items: center; gap: 12px; }
.wb-updated { font-size: 12px; color: var(--t-weak); }

/* 行动条：列数随可见项自动增减（角色缺 wm:todo / wm:alert 时不留空位） */
.wb-stats {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  gap: 12px;
  flex-shrink: 0;
}
.wb-stat {
  display: flex; flex-direction: column; justify-content: center;
  padding: 7px var(--content-px); background: var(--bg-card);
  border: 1px solid var(--bd); border-radius: var(--r-md);
}
/* 待我审批：工作台第一优先项，用主色底把它从"统计"里挑出来 */
.wb-stat.primary { background: var(--c-primary-light); border-color: var(--c-primary); }
.wb-stat.clickable, .wb-stat.primary { cursor: pointer; }
.wb-stat:hover { border-color: var(--c-primary); }
.wb-stat .v {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--c-action);
}
.wb-stat .k { font-size: var(--fs-xs); color: var(--t-weak); line-height: 1.4; }
.wb-stat.primary .k { color: var(--c-primary); }
.wb-stat.danger .v { color: var(--c-danger); }
.k-risk { color: var(--c-risk); }
/* 无预警时给明确的健康态，而不是继续显示一个灰色的 0 */
.k-ok { color: var(--c-health); }
.k-ok::before {
  content: '';
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 4px;
  border-radius: 50%;
  background: var(--c-health);
  vertical-align: 1px;
}

/* 主体：吃掉剩余高度，卡片撑满，内容超高时卡片内部滚动 */
.wb-main {
  flex: 1;
  min-height: 0;
  align-items: stretch;
  /* 关键：el-row 默认 flex-wrap:wrap，固定高度容器里「行高由内容决定」，
     会让左右两列撑到内容高度并溢出到概览看板上方。必须禁止换行。 */
  flex-wrap: nowrap;
}
.wb-main :deep(.el-col) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden; /* 双保险：列高被父级约束后，超出部分不得溢出 */
}
.wb-panel { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
/* 卡片头统一高度与 16px 缩进，左右两侧页签因此从同一基线开始 */
.wb-panel :deep(.el-card__header) {
  height: var(--card-hd-h);
  padding: 0 var(--content-px);
  display: flex;
  align-items: center;
}
.wb-panel :deep(.el-card__header) > * { width: 100%; }
.wb-panel :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  padding: var(--sp-1) var(--content-px) var(--sp-3);
}
/* 窗口偏矮时滚动卡片内部而非整页，保证概览看板始终在视野内 */
.wb-panel-todo :deep(.el-card__body) { overflow-y: auto; }
.wb-panel-side :deep(.el-card__body) { overflow-y: auto; }
/* 左右页签统一基线间距 */
.wb-panel :deep(.el-tabs__header) { margin-bottom: 8px; flex-shrink: 0; }
.wb-side-tabs { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.wb-side-tabs :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow-y: auto; }
.panel-hd { display: flex; justify-content: space-between; align-items: center; }
.panel-sub { font-size: var(--fs-xs); font-weight: 400; color: var(--t-weak); }

/* 矮屏：优先保证概览与待办可见，隐藏插画、压紧纵向节奏，仍不产生整页滚动 */
@media (max-height: 720px) {
  .workbench-page { gap: var(--sp-2); }
  .wb-header { height: 24px; }
  .wb-stat { padding: 5px var(--content-px); }
  .wb-stat .v { font-size: 16px; }
  .wb-panel :deep(.el-card__header) { height: 36px; }
  .wb-panel :deep(.el-card__body) { padding-top: 0; }
  .wb-panel :deep(.el-empty__image) { display: none; }
  .wb-panel :deep(.el-empty) { padding: var(--sp-1) 0; }
}
</style>
