<template>
  <div class="page-container">
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
      <h2>数据导入</h2>
      <span style="color:var(--t-sub);font-size:13px">
        按资源批量导入 CSV / Excel，校验与业务规则与界面单条新增完全一致
      </span>
    </div>

    <el-card shadow="never" class="panel">
      <el-form label-width="110px" size="small">
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
          <span v-if="file" style="margin-left:8px;color:var(--t-sub)">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="current" shadow="never" class="panel" style="margin-top:12px">
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

    <el-card v-if="result" shadow="never" class="panel" style="margin-top:12px">
      <template #header><span>导入结果</span></template>
      <el-descriptions :column="3" size="small" border>
        <el-descriptions-item label="状态">{{ statusText }}</el-descriptions-item>
        <el-descriptions-item label="总行数">{{ result.total }}</el-descriptions-item>
        <el-descriptions-item label="成功">{{ result.success }}</el-descriptions-item>
      </el-descriptions>
      <el-alert
        v-if="result.status === 'REJECTED_INVALID'"
        type="error"
        :closable="false"
        show-icon
        title="整批被拒绝：存在不合法的数据行，未写入任何数据。请按下方错误明细修正后重新导入。"
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

const resources = ref([])
const key = ref('')
const file = ref(null)
const abortOnError = ref(true)
const uploading = ref(false)
const tplLoading = ref(false)
const result = ref(null)

const STATUS_TEXT = {
  OK: '全部成功',
  REJECTED_INVALID: '整批拒绝（未写入）',
  PARTIAL: '部分成功',
  FAILED: '全部失败'
}

const current = computed(() => resources.value.find(r => r.key === key.value) || null)
const canSubmit = computed(() => !!key.value && !!file.value && !uploading.value)
const statusText = computed(() => STATUS_TEXT[result.value?.status] || result.value?.status || '')

async function loadResources() {
  try {
    resources.value = await httpService.importResources()
  } catch (e) {
    ElMessage.error(e?.message || '加载可导入资源失败')
  }
}

function onResourceChange() {
  file.value = null
  result.value = null
}

function handleFile(uploadFile) {
  file.value = uploadFile?.raw || null
  result.value = null
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

async function submit() {
  if (!key.value || !file.value) return
  uploading.value = true
  try {
    result.value = await httpService.importUpload(key.value, file.value, abortOnError.value)
    if (result.value.status === 'OK') {
      ElMessage.success(`导入成功：${result.value.success} 行`)
    } else if (result.value.status === 'PARTIAL') {
      ElMessage.warning(`部分成功：成功 ${result.value.success} 行，失败 ${result.value.failures.length} 行`)
    } else {
      ElMessage.error(statusText.value)
    }
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
</style>
