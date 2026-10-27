<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据导入</h2>
      <span class="page-subtitle">
        组织架构一张表导完；资产等其它数据按资源导入，校验与界面单条新增完全一致
      </span>
    </div>

    <!-- 1. 模式切换 -->
    <div class="mode-switch">
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'org' }"
        @click="switchMode('org')"
      >
        <div class="mode-title">
          组织架构导入
          <el-tag size="small" type="success" effect="light">推荐</el-tag>
        </div>
        <div class="mode-desc">
          公司 / 部门 / 人员 写在同一张表里，一次上传；无需填写任何内部主键
        </div>
      </button>
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'resource' }"
        @click="switchMode('resource')"
      >
        <div class="mode-title">按资源导入</div>
        <div class="mode-desc">
          资产、低值、字典等数据：按资源字段模板逐类导入（高级模式）
        </div>
      </button>
    </div>

    <!-- 2. 操作区 -->
    <el-card shadow="never" class="panel">
      <el-form v-if="mode === 'org'" label-width="110px" size="small">
        <el-form-item label="导入模板">
          <el-button :loading="tplLoading" @click="downloadOrgTemplate">下载组织架构模板</el-button>
          <span class="hint">一张表覆盖公司 / 部门 / 人员</span>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button>选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>

      <el-form v-else label-width="110px" size="small">
        <el-form-item label="导入资源">
          <el-select
            v-model="key"
            filterable
            placeholder="请选择要导入的数据资源"
            style="width:420px"
            @change="onResourceChange"
          >
            <el-option v-for="r in resources" :key="r.key" :label="`${r.label}（${r.key}）`" :value="r.key" />
          </el-select>
          <el-button :disabled="!key" :loading="tplLoading" style="margin-left:8px" @click="downloadTemplate">
            下载模板
          </el-button>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button :disabled="!key">选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 3. 模板说明 -->
    <el-card v-if="mode === 'org'" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>单表填写说明：一行写到哪一层就建到哪一层</span>
      </template>

      <div class="granularity">
        <div class="gran-item">
          <span class="gran-step">1</span>
          <span class="gran-text">只填<b>公司名称</b> → 只建公司</span>
        </div>
        <div class="gran-item">
          <span class="gran-step">2</span>
          <span class="gran-text">再加<b>部门名称</b> → 建公司 + 部门</span>
        </div>
        <div class="gran-item">
          <span class="gran-step">3</span>
          <span class="gran-text">再加<b>姓名 / 账号 / 口令</b> → 建公司 + 部门 + 人员</span>
        </div>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="模板第 1 行为表头，第 2/3 行为「说明 / 示例」（以 # 开头，导入时自动跳过）；可直接在示例行下方追加数据。同一公司或部门出现多行时只会创建一次。"
        style="margin:12px 0"
      />

      <el-table :data="ORG_COLUMNS" border stripe size="small" max-height="360">
        <el-table-column prop="name" label="列名称" width="130" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="desc" label="说明" min-width="300" show-overflow-tooltip />
        <el-table-column prop="sample" label="示例" width="180" show-overflow-tooltip />
      </el-table>
    </el-card>

    <el-card v-else-if="current" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>字段说明：模板第 1 行为表头，第 2/3 行为「说明 / 示例」（以 # 开头，导入时自动忽略）；可直接在示例行下方追加数据</span>
      </template>
      <el-table :data="current.fields" border stripe size="small" max-height="320">
        <el-table-column prop="name" label="字段名" width="180" />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="唯一" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.unique ? 'warning' : 'info'" size="small">{{ row.unique ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="枚举 / 引用" min-width="260">
          <template #default="{ row }">
            <span v-if="row.enumName">
              枚举：{{ row.enumName }}
              <template v-if="row.enumValues && row.enumValues.length">
                （{{ row.enumValues.join(' / ') }}）
              </template>
            </span>
            <span v-else-if="row.refCollection">引用：{{ row.refCollection }}（填目标记录主键）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 4. 结果 -->
    <el-card v-if="result" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <div class="result-header">
          <span>导入结果</span>
          <el-tag :type="statusTagType" size="small" effect="light">{{ statusText }}</el-tag>
        </div>
      </template>

      <!-- 组织架构：分级统计 -->
      <div v-if="mode === 'org'" class="metric-row">
        <div class="metric">
          <div class="metric-value">{{ result.createdCompanies || 0 }}</div>
          <div class="metric-label">新建公司</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedCompanies || 0 }}</div>
          <div class="metric-label">复用公司</div>
        </div>
        <div class="metric">
          <div class="metric-value">{{ result.createdDepartments || 0 }}</div>
          <div class="metric-label">新建部门</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedDepartments || 0 }}</div>
          <div class="metric-label">复用部门</div>
        </div>
        <div class="metric metric-user">
          <div class="metric-value">{{ result.createdUsers || 0 }}</div>
          <div class="metric-label">新建用户</div>
        </div>
        <div class="metric metric-total">
          <div class="metric-value">{{ result.total || 0 }}</div>
          <div class="metric-label">数据行数</div>
        </div>
      </div>

      <el-descriptions v-else :column="3" size="small" border>
        <el-descriptions-item label="状态">{{ statusText }}</el-descriptions-item>
        <el-descriptions-item label="总行数">{{ result.total }}</el-descriptions-item>
        <el-descriptions-item label="成功">{{ result.success }}</el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="result.status === 'REJECTED_INVALID'"
        type="error"
        :closable="false"
        show-icon
        :title="mode === 'org'
          ? '整批被拒绝：存在不合法的数据行，未写入任何数据。请按下方错误明细修正后重新导入。'
          : '整批被拒绝：存在不合法的数据行，未写入任何数据。请按下方错误明细修正后重新导入。'"
        style="margin-top:12px"
      />

      <el-alert
        v-else-if="mode === 'org' && result.status === 'PARTIAL'"
        type="warning"
        :closable="false"
        show-icon
        title="部分成功：成功的数据已写入，失败行未导入。修正后可只提交失败的行重新导入。"
        style="margin-top:12px"
      />

      <el-table
        v-if="result.failures && result.failures.length"
        :data="result.failures"
        border
        stripe
        size="small"
        max-height="300"
        style="margin-top:12px"
      >
        <el-table-column prop="row" label="行号" width="90" />
        <el-table-column prop="message" label="失败原因" min-width="320" show-overflow-tooltip />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import httpService from '../../services/http'

const ORG_COLUMNS = [
  { name: '公司名称', required: true, desc: '必填；已存在则自动复用，不会重复创建', sample: '示例科技有限公司' },
  { name: '公司编码', required: false, desc: '选填；留空按 GS-0001 规则自动生成；填写时按编码优先匹配', sample: 'GS-0001' },
  { name: '部门名称', required: false, desc: '选填；留空表示该行只建公司', sample: '研发部' },
  { name: '上级部门', required: false, desc: '选填；留空为一级部门；须在本文件或系统中已存在于同一公司', sample: '（留空）' },
  { name: '姓名', required: false, desc: '选填；留空表示该行只建部门', sample: '张三' },
  { name: '登录账号', required: false, desc: '填写姓名时必填；全局唯一，重复不会覆盖已有账号', sample: 'zhangsan' },
  { name: '初始口令', required: false, desc: '填写姓名时必填；至少 8 位且含字母/数字/符号中两类，落库自动加密', sample: 'Zhang@2026!' },
  { name: '岗位', required: false, desc: '选填', sample: '工程师' },
  { name: '手机', required: false, desc: '选填', sample: '13800138000' },
  { name: '邮箱', required: false, desc: '选填', sample: 'zhangsan@example.com' },
  { name: '角色', required: false, desc: '选填；可填角色编码或名称，多个用 | 分隔', sample: 'ROLE_ADMIN' },
  { name: '状态', required: false, desc: '选填；默认 ENABLED，可选 ENABLED / DISABLED', sample: 'ENABLED' }
]

const STATUS_TEXT = {
  OK: '全部成功',
  REJECTED_INVALID: '整批拒绝（未写入）',
  PARTIAL: '部分成功',
  FAILED: '全部失败'
}

const mode = ref('org')
const resources = ref([])
const key = ref('')
const file = ref(null)
const abortOnError = ref(true)
const uploading = ref(false)
const tplLoading = ref(false)
const result = ref(null)

const current = computed(() => resources.value.find(r => r.key === key.value) || null)
const canSubmit = computed(() => {
  if (!file.value || uploading.value) return false
  return mode.value === 'org' ? true : !!key.value
})
const statusText = computed(() => STATUS_TEXT[result.value?.status] || result.value?.status || '')
const statusTagType = computed(() => {
  const s = result.value?.status
  if (s === 'OK') return 'success'
  if (s === 'PARTIAL') return 'warning'
  if (s === 'REJECTED_INVALID' || s === 'FAILED') return 'danger'
  return 'info'
})

async function loadResources() {
  try {
    resources.value = await httpService.importResources()
  } catch (e) {
    ElMessage.error(e?.message || '加载可导入资源失败')
  }
}

function switchMode(next) {
  if (mode.value === next) return
  mode.value = next
  file.value = null
  result.value = null
}

function onResourceChange() {
  file.value = null
  result.value = null
}

function handleFile(uploadFile) {
  file.value = uploadFile?.raw || null
  result.value = null
}

async function downloadOrgTemplate() {
  tplLoading.value = true
  try {
    await httpService.importOrgTemplate()
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

async function downloadTemplate() {
  tplLoading.value = true
  try {
    await httpService.importTemplate(key.value)
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

function notifyResult(res) {
  if (res.status === 'OK') {
    if (mode.value === 'org') {
      ElMessage.success(
        `导入成功：新建 ${res.createdCompanies} 家公司、${res.createdDepartments} 个部门、${res.createdUsers} 个用户`
      )
    } else {
      ElMessage.success(`导入成功：${res.success} 行`)
    }
  } else if (res.status === 'PARTIAL') {
    ElMessage.warning(`部分成功：失败 ${res.failures?.length || 0} 行，请查看失败明细`)
  } else {
    ElMessage.error(statusText.value)
  }
}

async function submit() {
  if (!canSubmit.value) return
  uploading.value = true
  try {
    result.value = mode.value === 'org'
      ? await httpService.importOrgUpload(file.value, abortOnError.value)
      : await httpService.importUpload(key.value, file.value, abortOnError.value)
    notifyResult(result.value)
  } catch (e) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    uploading.value = false
  }
}

onMounted(loadResources)
</script>

<style scoped>
.panel {
  margin-bottom: 0;
}

.hint {
  margin-left: 10px;
  color: var(--t-sub);
  font-size: 12px;
}

.file-name {
  max-width: 260px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* 模式切换 */
.mode-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.mode-card {
  text-align: left;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
}

.mode-card:hover {
  box-shadow: var(--shadow);
  border-color: var(--c-primary);
}

.mode-card.active {
  border-color: var(--c-primary);
  background: linear-gradient(135deg, rgba(31, 111, 235, 0.08), rgba(31, 111, 235, 0.02));
  box-shadow: 0 0 0 1px var(--c-primary) inset;
}

.mode-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--t-main);
}

.mode-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--t-sub);
}

/* 粒度说明 */
.granularity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.gran-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-th);
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--t-main);
}

.gran-step {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.gran-text b {
  color: var(--c-primary);
  font-weight: 600;
}

/* 分级结果指标 */
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.metric {
  padding: 12px 10px;
  text-align: center;
  background: var(--bg-th);
  border-radius: var(--r-sm);
  border-top: 2px solid var(--c-primary);
}

.metric-muted {
  border-top-color: var(--c-info, #5A9BE0);
}

.metric-user {
  border-top-color: var(--c-success);
}

.metric-total {
  border-top-color: var(--bd);
}

.metric-value {
  font-family: var(--font-num, inherit);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--c-primary);
}

.metric-muted .metric-value {
  color: var(--c-info, #5A9BE0);
}

.metric-user .metric-value {
  color: var(--c-success);
}

.metric-total .metric-value {
  color: var(--t-sub);
}

.metric-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--t-weak);
}

@media (max-width: 1100px) {
  .metric-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
