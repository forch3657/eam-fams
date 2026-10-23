<template>
  <div class="page-container">
    <div class="page-header">
      <h2>消息模板</h2>
      <div class="header-tip">
        与「消息中心」共用同一份 store：模板被停用即 <code>sendByTemplate</code> 静默不发；{var} 占位由业务在触发时传入。
      </div>
    </div>

    <el-card shadow="never" class="fill">
      <div class="toolbar">
        <el-input v-model="filter.keyword" placeholder="模板键 / 场景 / 标题" clearable style="width:220px" />
        <el-select v-model="filter.channel" placeholder="通道" clearable style="width:150px">
          <el-option v-for="c in channelOptions" :key="c" :label="c" :value="c" />
        </el-select>
        <el-select v-model="filter.enabled" placeholder="启用状态" clearable style="width:130px">
          <el-option label="已启用" value="1" />
          <el-option label="已停用" value="0" />
        </el-select>
        <el-button @click="resetFilter">重置</el-button>
        <div class="grow"></div>
        <span class="muted">共 {{ filtered.length }} / {{ templates.length }} 条模板</span>
        <el-button type="primary" :icon="Plus" @click="openAdd">新增模板</el-button>
      </div>

      <el-table :data="pagedRows" border stripe row-key="key">
        <el-table-column prop="scene" label="触发场景" min-width="140" show-overflow-tooltip />
        <el-table-column prop="channel" label="通道" width="130">
          <template #default="{ row }">
            <el-tag size="small" :type="channelTag(row.channel)" effect="plain">{{ row.channel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题模板" min-width="200" show-overflow-tooltip />
        <el-table-column prop="content" label="内容模板" min-width="280" show-overflow-tooltip />
        <el-table-column label="启用" width="80">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              @change="onToggle(row)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="key" label="模板键" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <code>{{ row.key }}</code>
            <el-tag v-if="isDefaultKey(row.key)" size="small" type="info" effect="plain" class="inline-tag">内置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <el-button type="info" link size="small" @click="openPreview(row)">预览</el-button>
            <el-button type="danger" link size="small" :disabled="isDefaultKey(row.key)" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          :page-sizes="[10, 15, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
        />
      </div>
    </el-card>

    <!-- 编辑 / 新增对话框 -->
    <el-dialog v-model="showEdit" :title="editing ? '编辑模板' : '新增模板'" width="640px" :close-on-click-modal="false">
      <el-form :model="form" label-width="100px">
        <el-form-item label="模板键" required>
          <el-input v-model="form.key" :disabled="!!editing" placeholder="英文标识，如 my_notify" />
        </el-form-item>
        <el-form-item label="触发场景" required>
          <el-input v-model="form.scene" placeholder="中文说明，如：欠费预警触发" />
        </el-form-item>
        <el-form-item label="通道" required>
          <el-select v-model="form.channel" style="width:100%">
            <el-option v-for="c in channelOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题模板" required>
          <el-input v-model="form.title" placeholder="支持 {var} 占位" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="内容模板" required>
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="支持 {var} 占位，例如：合同 {contractNo} 已生效" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="插入变量">
          <div class="var-chips grid-auto">
            <span v-for="v in commonVars" :key="v" class="chip" @click="insertVar(v)">{{ '{' + v + '}' }}</span>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 预览对话框：填占位示例并即时渲染 -->
    <el-dialog v-model="showPreview" title="模板预览" width="640px">
      <div v-if="previewRow">
        <div class="preview-meta">
          <code>{{ previewRow.key }}</code>
          <el-tag size="small" effect="plain" :type="channelTag(previewRow.channel)">{{ previewRow.channel }}</el-tag>
          <span class="muted">{{ previewRow.scene }}</span>
        </div>
        <el-form v-if="previewVars.length" label-width="140px">
          <el-form-item v-for="k in previewVars" :key="k" :label="k">
            <el-input v-model="sampleValues[k]" :placeholder="`输入 ${k} 示例值`" size="small" />
          </el-form-item>
        </el-form>
        <el-alert v-else type="info" :closable="false" show-icon title="模板未使用 {var} 占位，直接展示原文" />
        <el-divider />
        <div class="preview-box">
          <div class="preview-title">{{ renderedTitle }}</div>
          <div class="preview-content">{{ renderedContent }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPreview = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useNotifyStore } from '../../store/notify'

const store = useNotifyStore()
const { templates } = storeToRefs(store)

// 与 notify.js DEFAULT_TEMPLATES 保持一致的内置键，禁止删除
const DEFAULT_KEYS = new Set([
  'inbound_new', 'inbound_pass', 'inbound_reject', 'dispatch_new', 'dispatch_done',
  'borrow_due', 'borrow_overdue', 'change_submit', 'change_pass', 'dispose_submit',
  'dispose_pass', 'inventory_diff', 'inventory_overdue', 'depreciation_done',
  'warning_idle', 'warning_unregistered', 'asset_return'
])
const isDefaultKey = k => DEFAULT_KEYS.has(k)

const channelOptions = ['站内信', '短信', '站内信+短信', '邮件', '微信推送']
/** 模板可用变量（资产/低值业务域） */
const commonVars = [
  'asset', 'assetNo', 'billNo', 'company', 'dept', 'user', 'date', 'days',
  'amount', 'count', 'period', 'reason', 'task', 'gain', 'loss',
  'changeType', 'disposeType'
]

const filter = reactive({ keyword: '', channel: '', enabled: '' })
const page = ref(1)
const pageSize = ref(15)

const filtered = computed(() => {
  const kw = filter.keyword.trim()
  return templates.value.filter(t => {
    if (kw) {
      const hay = `${t.key} ${t.scene} ${t.title}`
      if (!hay.includes(kw)) return false
    }
    if (filter.channel && t.channel !== filter.channel) return false
    if (filter.enabled !== '') {
      const v = t.enabled ? '1' : '0'
      if (v !== filter.enabled) return false
    }
    return true
  })
})
const pagedRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

function resetFilter() {
  filter.keyword = ''
  filter.channel = ''
  filter.enabled = ''
  page.value = 1
}

function channelTag(c) {
  return { '站内信': 'success', '短信': 'primary', '站内信+短信': 'warning', '邮件': 'info', '微信推送': 'info' }[c] || ''
}

// ===== 编辑 / 新增 =====
const showEdit = ref(false)
const editing = ref(null)
const form = reactive({ key: '', scene: '', channel: '站内信', title: '', content: '', enabled: true })

function openEdit(row) {
  editing.value = row
  Object.assign(form, {
    key: row.key, scene: row.scene, channel: row.channel,
    title: row.title, content: row.content, enabled: row.enabled
  })
  showEdit.value = true
}
function openAdd() {
  editing.value = null
  Object.assign(form, { key: '', scene: '', channel: '站内信', title: '', content: '', enabled: true })
  showEdit.value = true
}
function insertVar(v) { form.content += `{${v}}` }

function saveTemplate() {
  const key = form.key.trim()
  const scene = form.scene.trim()
  const title = form.title.trim()
  const content = form.content.trim()
  if (!key || !scene || !title || !content) {
    ElMessage.warning('请完善模板键、场景、标题与内容')
    return
  }
  if (editing.value) {
    store.updateTemplate(editing.value.key, {
      scene, channel: form.channel, title, content, enabled: form.enabled
    })
    ElMessage.success('模板已保存')
  } else {
    const ok = store.addTemplate({
      key, scene, channel: form.channel, title, content, enabled: form.enabled
    })
    if (!ok) { ElMessage.error(`模板键「${key}」已存在`); return }
    ElMessage.success('模板已新增')
  }
  showEdit.value = false
}

// el-switch v-model 已经改到 row.enabled；这里再显式走一遍 store 保证源真
function onToggle(row) {
  store.updateTemplate(row.key, { enabled: row.enabled })
  ElMessage.success(row.enabled ? '已启用' : '已停用')
}

function handleDelete(row) {
  ElMessageBox.confirm(
    `确认删除模板「${row.key}」？该模板绑定的业务通知将同步失效。`,
    '删除确认',
    { type: 'warning' }
  ).then(() => {
    const ok = store.removeTemplate(row.key)
    if (!ok) ElMessage.warning('默认模板不可删除')
    else ElMessage.success('模板已删除')
  }).catch(() => {})
}

// ===== 预览：从 title + content 提取 {var} 并渲染 =====
const showPreview = ref(false)
const previewRow = ref(null)
const sampleValues = reactive({})

const previewVars = computed(() => {
  if (!previewRow.value) return []
  const src = `${previewRow.value.title} ${previewRow.value.content}`
  const set = new Set()
  const re = /\{(\w+)\}/g
  let m
  while ((m = re.exec(src)) !== null) set.add(m[1])
  return [...set]
})

function openPreview(row) {
  previewRow.value = row
  Object.keys(sampleValues).forEach(k => delete sampleValues[k])
  // 提前铺好占位，方便用户输入示例
  const src = `${row.title} ${row.content}`
  const re = /\{(\w+)\}/g
  let m
  while ((m = re.exec(src)) !== null) sampleValues[m[1]] = ''
  showPreview.value = true
}

const render = str => String(str || '').replace(/\{(\w+)\}/g, (_, k) => sampleValues[k] ?? '')
const renderedTitle = computed(() => previewRow.value ? render(previewRow.value.title) : '')
const renderedContent = computed(() => previewRow.value ? render(previewRow.value.content) : '')
</script>

<style scoped>
.header-tip { font-size: 12px; color: var(--t-weak); }
.header-tip code { background: var(--bg-th); padding: 1px 4px; border-radius: var(--r-sm); }

.toolbar { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
.grow { flex: 1; }
.muted { color: var(--t-weak); font-size: 12px; }
code { background: var(--bg-th); color: var(--t-sub); padding: 1px 4px; border-radius: var(--r-sm); font-family: var(--font-mono); font-size: 12px; }
.inline-tag { margin-left: 4px; }

/* 变量 chip 用等宽网格排，消掉 flex-wrap 的尾部参差 */
.var-chips { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; width: 100%; }
.chip { display: block; padding: 2px 8px; background: var(--c-primary-light); color: var(--c-primary); border-radius: var(--r-md); font-size: 12px; cursor: pointer; text-align: center; }
.chip:hover { background: var(--c-primary); color: #fff; }

.preview-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.preview-box { background: var(--bg-th); border: 1px solid var(--bd); border-radius: var(--r-sm); padding: 16px; line-height: 1.8; }
.preview-title { font-size: 14px; font-weight: 600; color: var(--t-main); margin-bottom: 4px; }
.preview-content { font-size: 13px; color: var(--t-sub); white-space: pre-wrap; }
</style>
