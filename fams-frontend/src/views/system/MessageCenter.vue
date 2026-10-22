<template>
  <div class="page-container">
    <div class="page-header">
      <h2>消息中心</h2>
      <div class="header-tip">
        入库验收、借出到期、盘点差异、处置审批等业务动作产生的通知都会推送到这里。
      </div>
    </div>

    <!-- KPI -->
    <div class="grid-3">
      <div class="kpi-card">
        <div class="kpi-label">未读消息</div>
        <div class="kpi-value" :style="{ color: unreadCount ? 'var(--c-danger)' : 'var(--t-weak)' }">{{ unreadCount }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">收件箱总数</div>
        <div class="kpi-value">{{ inbox.length }}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">今日新增</div>
        <div class="kpi-value" style="color:var(--c-primary)">{{ todayCount }}</div>
      </div>
    </div>

    <el-card shadow="never" class="fill">
      <div class="toolbar">
        <el-select v-model="filter.level" placeholder="级别" clearable style="width:120px">
          <el-option v-for="l in levels" :key="l" :label="l" :value="l" />
        </el-select>
        <el-select v-model="filter.type" placeholder="类型" clearable style="width:170px">
          <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
        </el-select>
        <div class="mini-switch">
          <span class="muted">仅看未读</span>
          <el-switch v-model="filter.unreadOnly" />
        </div>
        <el-button link @click="resetFilter">重置</el-button>
        <div class="grow"></div>
        <el-button :disabled="!unreadCount" @click="handleMarkAll">全部已读</el-button>
        <el-button type="danger" plain :disabled="!inbox.length" @click="handleClearAll">清空全部</el-button>
      </div>

      <el-table
        :data="filtered"
        border
        stripe
        row-key="id"
        @row-click="onRowClick"
        :row-class-name="rowClass"
        style="cursor: pointer"
      >
        <template #empty>
          <el-empty description="暂无消息，去业务页面触发消息吧" :image-size="60" />
        </template>
        <el-table-column label="" width="50">
          <template #default="{ row }">
            <el-icon v-if="!row.read" color="var(--c-danger)" :size="16"><BellFilled /></el-icon>
            <el-icon v-else color="var(--t-weak)" :size="16"><ChatLineSquare /></el-icon>
          </template>
        </el-table-column>
        <el-table-column prop="time" label="时间" width="180" class-name="num" />
        <el-table-column prop="type" label="类型" width="150">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="levelTag(row.level)">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'unread-title': !row.read }">{{ row.title }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容预览" min-width="320" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.read ? 'info' : 'danger'" effect="plain">{{ row.read ? '已读' : '未读' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="!row.read" link type="primary" size="small" @click.stop="handleRead(row)">标记已读</el-button>
            <el-button v-if="row.route" link type="success" size="small" @click.stop="handleJump(row)">查看业务</el-button>
            <el-button link type="danger" size="small" @click.stop="handleRemove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="foot-hint muted" v-if="inbox.length">
        点击整行：自动标记为已读，若消息关联业务页面则同步跳转。
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BellFilled, ChatLineSquare } from '@element-plus/icons-vue'
import { useNotifyStore } from '../../store/notify'

const store = useNotifyStore()
const { inbox, unreadCount } = storeToRefs(store)
const router = useRouter()

const levels = ['普通', '重要', '紧急']
const filter = reactive({ level: '', type: '', unreadOnly: false })

const typeOptions = computed(() => [...new Set(inbox.value.map(m => m.type).filter(Boolean))])

const todayCount = computed(() => {
  const today = new Date()
  const p = n => String(n).padStart(2, '0')
  const stamp = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  return inbox.value.filter(m => (m.time || '').slice(0, 10) === stamp).length
})

const filtered = computed(() => inbox.value.filter(m =>
  (!filter.level || m.level === filter.level) &&
  (!filter.type || m.type === filter.type) &&
  (!filter.unreadOnly || !m.read)
))

function levelTag(l) {
  return { '紧急': 'danger', '重要': 'warning', '普通': 'info' }[l] || 'info'
}
function rowClass({ row }) {
  return row.read ? '' : 'unread-row'
}

function resetFilter() {
  filter.level = ''
  filter.type = ''
  filter.unreadOnly = false
}

function handleRead(row) {
  store.markRead(row.id)
}

function handleJump(row) {
  store.markRead(row.id)
  if (row.route) {
    router.push(row.route).catch(() => {
      ElMessage.error(`无法跳转：${row.route}`)
    })
  }
}

function onRowClick(row) {
  if (!row.read) store.markRead(row.id)
  if (row.route) {
    router.push(row.route).catch(() => {})
  }
}

function handleRemove(row) {
  ElMessageBox.confirm(`删除该条消息「${row.title}」？`, '删除确认', { type: 'warning' })
    .then(() => {
      store.removeMessage(row.id)
      ElMessage.success('已删除')
    })
    .catch(() => {})
}

function handleMarkAll() {
  ElMessageBox.confirm('将当前所有可见消息标为已读，确认？', '全部已读', { type: 'warning' })
    .then(() => {
      store.markAllRead()
      ElMessage.success('已全部标为已读')
    })
    .catch(() => {})
}

function handleClearAll() {
  ElMessageBox.confirm('清空全部消息后不再可恢复，确认？', '清空全部', { type: 'warning' })
    .then(() => {
      store.clearAll()
      ElMessage.success('已清空全部消息')
    })
    .catch(() => {})
}
</script>

<style scoped>
.header-tip { font-size: 12px; color: var(--t-weak); }
.header-tip code { background: var(--bg-th); padding: 1px 4px; border-radius: var(--r-sm); }

.kpi-card { background: var(--bg-th); border: 1px solid var(--bd); border-radius: var(--r-md); padding: 12px 16px; }
.kpi-label { font-size: 12px; color: var(--t-weak); margin: 0 0 4px; }
.kpi-value { font-size: 22px; font-weight: 600; color: var(--t-main); }

.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.grow { flex: 1; }
.mini-switch { display: flex; align-items: center; gap: 8px; padding: 0 8px; }
.muted { color: var(--t-weak); font-size: 12px; }
.unread-title { font-weight: 600; color: var(--t-main); }
.foot-hint { margin-top: 12px; }

:deep(.unread-row) { background: #fef6f6 !important; }
:deep(.el-table__row:hover) { cursor: pointer; }
</style>
