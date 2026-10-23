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
          <el-link type="primary" :underline="false" @click="openApproval(row)">{{ row.code }}</el-link>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="单据名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="companyName" label="所属公司" min-width="160" show-overflow-tooltip />
      <el-table-column label="审批流程" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="flowOf(row)">{{ flowOf(row).name }}</span>
          <el-tag v-else size="small" type="warning" effect="plain">未配置流程</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="当前环节" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          <span v-if="row.status === 'PROCESSING' && currentOf(row)">{{ currentOf(row).step.name }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="150">
        <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
      </el-table-column>
      <el-table-column label="完结时间" width="150">
        <template #default="{ row }">{{ row.finishTime ? formatDateTime(row.finishTime) : '-' }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" label="单据状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="审批操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canSubmitRow(row)" link type="primary" size="small" @click="submitRow(row)">提交</el-button>
          <el-button v-if="canApproveRow(row)" link type="success" size="small" @click="approveRow(row)">通过</el-button>
          <el-button v-if="canApproveRow(row)" link type="danger" size="small" @click="rejectRow(row)">驳回</el-button>
          <el-button v-if="canRevokeRow(row)" link type="warning" size="small" @click="revokeRow(row)">撤销</el-button>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="170" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openApproval(row)">审批信息</el-button>
          <el-button link type="primary" size="small" :disabled="row.status === 'PROCESSING'" @click="openDialog(row)">修改</el-button>
          <el-button link type="danger" size="small" :disabled="row.status === 'PROCESSING'" @click="removeRow(row)">删除</el-button>
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

    <DocApprovalDialog
      v-model="approvalVisible"
      :doc="approvalDoc"
      :doc-key="props.docKey"
      :ctx="approvalCtx"
      @act="onApprovalAct"
    />
  </div>
</template>

<script setup>
/**
 * 固定资产单据列表（统一单据面板）
 *
 * 方向：八类单据（入库/派发/退库/借出/调拨/维修/变更/处置）共用这一套面板，
 * 数据统一落在 doc-lists-* 集合，状态存 DOC_STATUS 编码，单号字段为 code。
 *
 * 审批：完全按「系统管理 → 流程配置」执行——流程按业务类型匹配，
 * 环节审批人引用系统角色（持有该角色的启用用户才能审），环节可带触发条件。
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
import { useUserStore } from '../../store/user'
import { useApprovalStore } from '../../store/approval'
import { useFixedAssetStore } from '../../store/fixedAsset'
import DocApprovalDialog from './DocApprovalDialog.vue'
import {
  DOC_BIZ_TYPE, getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, runApproval
} from '../../services/approval'

const props = defineProps({
  /** 单据类型：inbound / alloc / back / borrow / transfer / repair / change / dispose */
  docKey: { type: String, required: true },
  /** 单号前缀 */
  prefix: { type: String, default: 'RK' },
  /** 是否允许新增（按钮级权限） */
  perm: { type: Boolean, default: true }
})

const orgStore = useOrgStore()
const userStore = useUserStore()
const approvalStore = useApprovalStore()
const assetStore = useFixedAssetStore()
const col = useCollection(`${COLLECTION.docListPrefix}-${props.docKey}`)
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
  if (row && row.status === 'PROCESSING') { ElMessage.warning('单据审批中，不可修改'); return }
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
        creatorId: userStore.user?.id || '',
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
  if (row.status === 'PROCESSING') { ElMessage.warning('单据审批中，不可删除'); return }
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

// ---------------- 审批 ----------------
const bizType = computed(() => DOC_BIZ_TYPE[props.docKey] || props.docKey.toUpperCase())

/** 条件上下文：金额取关联资产原值（金额门槛环节据此生效） */
function ctxOf(doc) {
  const asset = assetStore.assets.find(a => a.id === doc?.assetId)
  return { amount: Number(asset?.original || doc?.amount || 0), hasDiff: false }
}

function flowOf(doc) {
  return getFlow(bizType.value, approvalStore.flows)
}
function currentOf(doc) {
  const flow = flowOf(doc)
  if (!flow) return null
  const steps = effectiveSteps(flow, ctxOf(doc))
  const records = approvalsOf(approvalStore.approvals, props.docKey, doc?.id)
  return currentStep(steps, records, orgStore)
}

function canSubmitRow(doc) {
  const flow = flowOf(doc)
  if (!flow) return false
  if (doc.status !== 'DRAFT' && doc.status !== 'REJECTED') return false
  return canSubmit(doc, flow, userStore.user, orgStore)
}
function canApproveRow(doc) {
  if (doc.status !== 'PROCESSING') return false
  const cur = currentOf(doc)
  if (!cur) return false
  return canApprove(cur.step, userStore.user, orgStore)
}
function canRevokeRow(doc) {
  const flow = flowOf(doc)
  if (!flow || doc.status !== 'PROCESSING') return false
  return canSubmit(doc, flow, userStore.user, orgStore)
}

/** 执行审批动作 */
async function doApproval(doc, action, comment = '') {
  if (!approvalStore.loaded) await approvalStore.load()
  const flow = flowOf(doc)
  const res = await runApproval({
    doc,
    docKey: props.docKey,
    bizType: bizType.value,
    action,
    comment,
    ctx: ctxOf(doc),
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    saveDoc: async next => {
      const target = items.value.find(d => d.id === doc.id)
      if (target) {
        Object.assign(target, next)
        await col.update(target)
      }
    },
    saveApproval: row => approvalStore.addApproval(row)
  })
  if (res.ok) ElMessage.success(res.message)
  else ElMessage.error(res.message)
  return res
}

async function submitRow(doc) {
  await doApproval(doc, 'submit', '提交审批申请')
}
async function approveRow(doc) {
  await doApproval(doc, 'approve', '同意')
}
async function rejectRow(doc) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回意见', '驳回审批', {
      inputValidator: v => (v && v.trim() ? true : '驳回必须填写意见')
    })
    await doApproval(doc, 'reject', value.trim())
  } catch (e) {
    // 取消
  }
}
async function revokeRow(doc) {
  try {
    await ElMessageBox.confirm('确认撤销该单据的审批申请？', '撤销审批', { type: 'warning' })
  } catch (e) {
    return
  }
  await doApproval(doc, 'revoke', '发起人撤销')
}

const approvalVisible = ref(false)
const approvalDoc = ref(null)
const approvalCtx = ref({ amount: 0, hasDiff: false })

function openApproval(row) {
  approvalDoc.value = row
  approvalCtx.value = ctxOf(row)
  approvalVisible.value = true
}

async function onApprovalAct({ action, comment }) {
  const res = await doApproval(approvalDoc.value, action, comment)
  if (res.ok) approvalVisible.value = false
}

// 其他入口（如盘点审批转处置）新增单据后，通知本面板刷新
function onDocsChanged(e) {
  if (e?.detail === props.docKey) col.load()
}
onMounted(() => {
  window.addEventListener('fams:doc-lists-changed', onDocsChanged)
  approvalStore.load()
})
onUnmounted(() => window.removeEventListener('fams:doc-lists-changed', onDocsChanged))
</script>

<style scoped>
.doc-list { display: block; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
</style>
