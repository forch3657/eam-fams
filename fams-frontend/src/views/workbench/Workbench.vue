<template>
  <div class="page-container workbench-page">
    <div class="page-header">
      <div>
        <h2>工作台</h2>
        <p class="wb-sub">{{ greeting }}，{{ userStore.user?.name }}<span v-if="roleNames">（{{ roleNames }}）</span></p>
      </div>
      <div class="wb-ops">
        <el-button :loading="workbench.loading" @click="refresh">
          <el-icon><Refresh /></el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 指标条：紧凑一行 -->
    <div class="wb-stats">
      <div class="wb-stat" @click="focusTab('pending')">
        <span class="v">{{ workbench.pendingCount }}</span>
        <span class="k">待我审批</span>
      </div>
      <div class="wb-stat" :class="{ danger: workbench.dangerAlertCount > 0 }" @click="focusSide('alert')">
        <span class="v">{{ workbench.alertCount }}</span>
        <span class="k">预警<span v-if="workbench.dangerAlertCount">（严重 {{ workbench.dangerAlertCount }}）</span></span>
      </div>
      <div class="wb-stat">
        <span class="v">{{ workbench.overview.approval.processing }}</span>
        <span class="k">在途单据</span>
      </div>
      <div class="wb-stat">
        <span class="v">{{ mineCount }}</span>
        <span class="k">我在途</span>
      </div>
      <div class="wb-stat">
        <span class="v">{{ workbench.overview.asset.total }}</span>
        <span class="k">资产总数</span>
      </div>
    </div>

    <!-- 主体：左待办 / 右预警与消息（左右等高） -->
    <el-row :gutter="16" class="wb-main">
      <el-col :span="15">
        <el-card v-if="can('wm:todo')" shadow="never" class="wb-panel wb-panel-todo" id="wb-todo-panel">
          <template #header>
            <div class="panel-hd">
              <span>我的待办</span>
              <el-tag v-if="workbench.pendingCount" type="danger" size="small" effect="dark">
                {{ workbench.pendingCount }} 项待我审批
              </el-tag>
            </div>
          </template>
          <TodoPanel ref="todoRef" />
        </el-card>
        <el-card v-else shadow="never" class="wb-panel wb-panel-todo">
          <el-empty description="当前角色未开通「我的待办」权限，可在组织架构 → 角色管理中勾选" :image-size="70" />
        </el-card>
      </el-col>

      <el-col :span="9">
        <el-card id="wb-side-panel" shadow="never" class="wb-panel wb-panel-side">
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

    <OverviewPanel v-if="can('wm:overview')" />
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
 * 布局：指标条一行 → 左「我的待办」/ 右「预警·消息」左右等高 → 底部概览看板。
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
  if (!can('wm:alert') && can('wm:message')) sideTab.value = 'message'
})
</script>

<style scoped>
.workbench-page { display: block; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.wb-sub { margin: 4px 0 0; font-size: 13px; color: var(--t-weak); }

/* 指标条：一行紧凑卡片 */
.wb-stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 12px; }
.wb-stat {
  display: flex; flex-direction: column; justify-content: center;
  padding: 10px 14px; background: var(--bg-card, #fff);
  border: 1px solid var(--bd); border-radius: var(--r-md); cursor: pointer;
}
.wb-stat:hover { border-color: var(--c-primary); }
.wb-stat .v { font-size: 22px; font-weight: 700; line-height: 1.3; color: var(--c-primary); }
.wb-stat .k { font-size: 12px; color: var(--t-weak); }
.wb-stat.danger .v { color: var(--c-danger); }

/* 主体：左右等高 */
.wb-main { align-items: stretch; margin-bottom: 12px; }
.wb-panel { height: 100%; }
.wb-panel-todo :deep(.el-card__body) { padding-top: 8px; }
.wb-panel-side :deep(.el-card__body) { padding-top: 4px; height: 380px; overflow-y: auto; }
.wb-side-tabs :deep(.el-tabs__header) { margin-bottom: 6px; }
.panel-hd { display: flex; justify-content: space-between; align-items: center; }
</style>
