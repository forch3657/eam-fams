<template>
  <div class="doc-list">
    <el-form :inline="true" class="search-form">
      <el-form-item label="单据编号">
        <el-input v-model="search.docNo" placeholder="请输入单据编号" clearable style="width: 160px" />
      </el-form-item>
      <el-form-item label="公司">
        <el-select v-model="search.company" placeholder="请选择公司" clearable style="width: 200px">
          <el-option v-for="c in companyOptions" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="单据状态">
        <el-select v-model="search.status" placeholder="请选择状态" clearable style="width: 130px">
          <el-option v-for="s in statusOptions" :key="s.value" :label="s.label" :value="s.value" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="page = 1">
          <el-icon><Search /></el-icon>
          查询
        </el-button>
        <el-button @click="resetSearch">重置</el-button>
        <el-button type="primary" @click="openDialog()" v-if="perm">
          <el-icon><Plus /></el-icon>
          新增单据
        </el-button>
      </el-form-item>
    </el-form>

    <el-table :data="pagedRows" style="width: 100%">
      <el-table-column prop="code" label="单据编号" width="130">
        <template #default="{ row }">
          <el-link type="primary" :underline="false" @click="$emit('view-approval', row)">{{ row.code }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="单据名称" min-width="200" show-overflow-tooltip />
      <el-table-column prop="companyName" label="所属公司" min-width="180" show-overflow-tooltip />
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="完结时间" width="160">
        <template #default="{ row }">{{ row.finishTime ? formatDateTime(row.finishTime) : '-' }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="单据状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="$emit('view-approval', row)">审批信息</el-button>
          <el-button link type="primary" size="small" @click="openDialog(row)">修改</el-button>
          <el-button link type="danger" size="small" @click="removeRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'edit' ? '修改单据' : '新增单据'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="单据名称" required>
          <el-input v-model="form.name" maxlength="50" show-word-limit placeholder="请输入单据名称" />
        </el-form-item>
        <el-form-item label="所属公司" required>
          <el-select v-model="form.companyId" placeholder="请选择公司" style="width:100%">
            <el-option v-for="c in companyOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联资产">
          <el-select v-model="form.assetId" placeholder="可选，关联在册资产" clearable filterable style="width:100%">
            <el-option v-for="a in assetOptions" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" maxlength="250" show-word-limit placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * 固定资产单据列表（统一单据面板）
 *
 * 方向：五类单据（入库/派发/退库/借出/调拨/维修/变更/处置）共用这一套面板，
 * 数据统一落在 doc-lists-* 集合，状态存 DOC_STATUS 编码，单号字段为 code。
 */
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'
import { optionsOf, labelOf } from '../../constants/enums'
import { formatDateTime } from '../../utils/format'
import { genDocNo } from '../../utils/docNo'
import { useOrgStore } from '../../store/org'
import { useFixedAssetStore } from '../../store/fixedAsset'

const props = defineProps({
  /** 单据类型：inbound / alloc / back / borrow / transfer / repair / change / dispose */
  docKey: { type: String, required: true },
  /** 单号前缀 */
  prefix: { type: String, default: 'RK' },
  /** 是否允许新增（按钮级权限） */
  perm: { type: Boolean, default: true }
})
defineEmits(['view-approval'])

const orgStore = useOrgStore()
const assetStore = useFixedAssetStore()
const col = useCollection(`${COLLECTION.docLists}-${props.docKey}`)
const items = col.items

const search = reactive({ docNo: '', company: '', status: '' })
const page = ref(1)
const pageSize = ref(15)
watch(search, () => { page.value = 1 }, { deep: true })

const statusOptions = computed(() => optionsOf('DOC_STATUS'))
const companyOptions = computed(() => orgStore.companies)
const assetOptions = computed(() => assetStore.assets.map(a => ({ id: a.id, code: a.code, name: a.name })))

const filteredRows = computed(() => items.value.filter(d =>
  (!search.docNo || (d.code || '').includes(search.docNo)) &&
  (!search.company || d.companyId === search.company) &&
  (!search.status || d.status === search.status)
))
const total = computed(() => filteredRows.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredRows.value.slice(start, start + pageSize.value).map(r => ({
    ...r,
    companyName: r.companyId ? (orgStore.companyName(r.companyId) || r.companyId) : ''
  }))
})

function statusText(status) {
  return labelOf('DOC_STATUS', status)
}
function statusType(status) {
  return { DONE: 'success', PROCESSING: 'primary', DRAFT: 'warning', REJECTED: 'danger', REVOKED: 'info' }[status] || 'info'
}
function resetSearch() {
  Object.assign(search, { docNo: '', company: '', status: '' })
  page.value = 1
}

// ---------------- 新增 / 修改 ----------------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const form = reactive({ id: '', name: '', companyId: '', assetId: '', remark: '' })

function openDialog(row) {
  dialogMode.value = row ? 'edit' : 'add'
  Object.assign(form, row
    ? { id: row.id, name: row.name || '', companyId: row.companyId || '', assetId: row.assetId || '', remark: row.remark || '' }
    : { id: '', name: '', companyId: orgStore.companies[0]?.id || '', assetId: '', remark: '' })
  dialogVisible.value = true
}

/** 单号：前缀 + 年份 + 序号（种子占用 100~900 段，新增从 1000 起，避免撞号） */
function nextCode() {
  return genDocNo(props.prefix, items.value.map(d => d.code))
}

async function submit() {
  if (!form.name) { ElMessage.warning('请填写单据名称'); return }
  if (!form.companyId) { ElMessage.warning('请选择所属公司'); return }
  try {
    if (dialogMode.value === 'edit') {
      const target = items.value.find(d => d.id === form.id)
      if (target) {
        Object.assign(target, { name: form.name, companyId: form.companyId, assetId: form.assetId, remark: form.remark })
        await col.update(target)
      }
      ElMessage.success('单据已保存')
    } else {
      await col.add({
        name: form.name,
        companyId: form.companyId,
        assetId: form.assetId,
        code: nextCode(),
        createTime: new Date().toISOString(),
        finishTime: '',
        remark: form.remark,
        status: 'DRAFT'
      })
      page.value = 1
      ElMessage.success('单据已创建')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  }
}

async function removeRow(row) {
  try {
    await ElMessageBox.confirm(`确认删除单据"${row.code}"？`, '删除确认', { type: 'warning' })
  } catch (e) {
    return
  }
  try {
    await col.remove(row)
    ElMessage.success('单据已删除')
  } catch (e) {
    ElMessage.error(e?.message || '删除失败')
  }
}

// 其他入口（如盘点审批转处置）新增单据后，通知本面板刷新
function onDocsChanged(e) {
  if (e?.detail === props.docKey) col.load()
}
onMounted(() => window.addEventListener('fams:doc-lists-changed', onDocsChanged))
onUnmounted(() => window.removeEventListener('fams:doc-lists-changed', onDocsChanged))
</script>

<style scoped>
.doc-list { display: block; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
