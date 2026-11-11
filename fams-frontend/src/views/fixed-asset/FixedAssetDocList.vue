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
      <el-table-column label="所属公司" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ orgStore.companyName(row.companyId) || row.companyId || '' }}</template>
      </el-table-column>
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
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canReturnRow(row)" link type="primary" size="small" @click="openReturnDialog(row)">发起归还退库</el-button>
          <el-button link type="primary" size="small" @click="openApproval(row)">审批信息</el-button>
          <el-button v-if="perm && isDocEditable(row)" link type="primary" size="small" @click="openDialog(row)">修改</el-button>
          <el-button v-if="canDeleteRow(row)" link type="danger" size="small" @click="removeRow(row)">删除</el-button>
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
        <el-form-item label="关联资产" required>
          <el-select v-model="form.assetId" placeholder="请选择在册资产（已按业务前置状态过滤）" clearable filterable style="width:100%">
            <el-option v-for="a in assetOptions" :key="a.id" :label="`${a.code} ${a.name}`" :value="a.id" />
          </el-select>
          <!-- 新增资产登记与入库验收是两件事：登记直接入账为「空闲」，WF1 只处理盘盈/账外的待入库资产 -->
          <div v-if="props.docKey === 'inbound' && !assetOptions.length" class="asset-empty-hint">
            暂无「待入库」资产。入库验收只面向盘盈 / 账外资产（由盘点完结自动建账并生成入库单）；通过「新增资产」登记的资产已直接入账为「空闲」并写入库日期，无需再办入库，可直接派发。
          </div>
        </el-form-item>

        <template v-if="props.docKey === 'transfer'">
          <el-alert v-if="transferAssetStatus === 'IDLE'" type="warning" :closable="false" show-icon
            title="空闲资产不能调拨"
            description="空闲资产请先办理「派发」确定使用人，再发起调拨。"
            style="margin-bottom:12px" />
          <el-form-item label="调出前归属">
            <div class="form-hint">
              {{ transferCurrent.dept || '未分配' }} · {{ transferCurrent.user || '无使用人' }} · {{ transferCurrent.location || '未指定' }}
            </div>
            <div class="form-hint">提交时由服务端按台账生成快照，随单据留痕并用于「现任使用人交出确认」。</div>
          </el-form-item>
          <el-form-item label="新使用人" required>
            <el-select v-model="form.toUserId" placeholder="请选择调拨后的使用人" filterable clearable style="width:100%">
              <el-option v-for="u in enabledUsers" :key="u.id" :label="`${u.name}（${orgStore.deptName(u.deptId) || '-'}）`" :value="u.id" />
            </el-select>
            <div class="form-hint">接收人需在审批链中确认接收；请选择在职账号。</div>
          </el-form-item>
          <el-form-item label="调入部门">
            <el-select v-model="form.toDeptId" placeholder="不选则沿用原部门" filterable clearable style="width:100%">
              <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="新存放地点">
            <el-autocomplete v-model="form.toLocation" :fetch-suggestions="queryTransferLocations"
              :trigger-on-focus="true" clearable placeholder="不选则沿用原地点；可输入新地点" style="width:100%" />
          </el-form-item>
        </template>

        <el-form-item v-if="props.docKey === 'alloc'" label="实际领用人" required>
          <el-select v-model="form.receiverId" placeholder="请选择实际领用人（在职账号）" filterable clearable style="width:100%" @change="onReceiverChange">
            <el-option v-for="u in enabledUsers" :key="u.id" :label="`${u.name}（${orgStore.deptName(u.deptId) || '-'}）`" :value="u.id" />
          </el-select>
          <div class="form-hint">审批通过后写入资产台账使用人；选择后自动带出其所属部门。</div>
        </el-form-item>
        <el-form-item v-if="props.docKey === 'alloc'" label="使用部门">
          <el-select v-model="form.deptId" placeholder="请选择使用部门" clearable filterable style="width:100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
          <div class="form-hint">默认带出领用人账号所属部门，可调整；派发审批通过后写入资产台账。</div>
        </el-form-item>

        <template v-if="props.docKey === 'dispose'">
          <el-form-item label="处置方式" required>
            <el-select v-model="form.disposeType" placeholder="请选择处置方式" style="width:100%">
              <el-option v-for="o in disposeTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="受让方">
            <el-input v-model="form.buyer" maxlength="100" placeholder="变卖 / 捐赠 / 转让时填写" />
          </el-form-item>
          <el-form-item label="凭证号">
            <el-input v-model="form.voucherNo" maxlength="100" placeholder="财务凭证或协议编号" />
          </el-form-item>
          <el-form-item label="处置金额">
            <el-input-number v-model="form.disposalAmount" :min="0" :precision="2" style="width:100%" />
          </el-form-item>
          <el-form-item label="出账依据">
            <el-input v-model="form.outLedgerBasis" maxlength="200" placeholder="转让出公司时填写" />
          </el-form-item>
        </template>

        <template v-if="props.docKey === 'borrow'">
          <el-form-item label="借用人" required>
            <el-select v-model="form.borrowerId" placeholder="请选择借用人（在职账号）" filterable clearable style="width:100%" @change="onBorrowerChange">
              <el-option v-for="u in enabledUsers" :key="u.id" :label="`${u.name}（${orgStore.deptName(u.deptId) || '-'}）`" :value="u.id" />
            </el-select>
            <div class="form-hint">借出是临时转移占有，台账使用人仍保持原责任人不变。</div>
          </el-form-item>
          <el-form-item label="借用部门">
            <el-select v-model="form.borrowerDeptId" placeholder="选择借用人后自动带出" clearable filterable style="width:100%">
              <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="借用用途">
            <el-input v-model="form.borrowPurpose" maxlength="100" placeholder="如：项目现场临时测试" />
          </el-form-item>
          <el-form-item label="预计归还日">
            <el-date-picker v-model="form.expectedReturnDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择预计归还日" style="width:100%" />
          </el-form-item>
        </template>
        <el-form-item v-if="props.docKey === 'back' && form.borrowDocId" label="关联借出单">
          <span>归还型退库单（关联 {{ form.borrowDocId }}）</span>
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

    <!-- 归还 = 关联原借出单的退库单（WF3），经仓管验收后闭环 -->
    <el-dialog v-model="returnVisible" title="发起归还退库" width="480px">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="将生成一张关联本借出单的退库单，经部门主管确认与仓管验收后完结；完结时资产回仓库（空闲、清空使用人），归还标记由服务端回写。"
        style="margin-bottom:12px"
      />
      <el-form :model="returnForm" label-width="90px">
        <el-form-item label="借出单编号">
          <span>{{ returnForm.code || '-' }}</span>
        </el-form-item>
        <el-form-item label="关联资产">
          <span>{{ returnForm.assetLabel || '-' }}</span>
        </el-form-item>
        <el-form-item label="归还备注">
          <el-input v-model="returnForm.comment" type="textarea" :rows="3" maxlength="250" show-word-limit placeholder="如：实物已归还、外观完好" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="returnVisible = false">取消</el-button>
        <el-button type="primary" @click="submitReturn">生成退库单</el-button>
      </template>
    </el-dialog>

    <DocApprovalDialog
      v-model="approvalVisible"
      :doc="approvalDoc"
      :doc-key="props.docKey"
      :ctx="approvalCtx"
      :assets="assetStore.assets"
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
import { COLLECTION, dataService } from '../../services'
import { optionsOf, labelOf, DOC_EDITABLE_STATUS } from '../../constants/enums'
import { formatDateTime } from '../../utils/format'
import { statusType } from '../../utils/status'
import { genDocNo } from '../../utils/docNo'
import { useOrgStore } from '../../store/org'
import { useUserStore } from '../../store/user'
import { useApprovalStore } from '../../store/approval'
import { useFixedAssetStore } from '../../store/fixedAsset'
import DocApprovalDialog from './DocApprovalDialog.vue'
import {
  DOC_BIZ_TYPE, getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, runApproval, isCollabAction
} from '../../services/approval'
import { ALLOWED_ASSET_STATUS, DOC_WRITE_CODES, OWNER_INITIATED_DOC_KEYS } from '../../constants/assetActions'

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
const deptOptions = computed(() => orgStore.departments || [])
/** 登录接口返回的 user 不带 deptId，需按 id 从组织用户主数据取「领用人」所属部门 */
const defaultDeptId = computed(() => {
  const me = userStore.user?.id
  if (!me) return ''
  const account = (orgStore.users || []).find(u => u.id === me)
  return account?.deptId || userStore.user?.deptId || ''
})
const disposeTypeOptions = computed(() => optionsOf('DISPOSE_TYPE'))

/** 仅凭「台账使用人本人」授权的用户：下拉只列自己名下资产，避免选到别人资产后保存 403 */
const ownerOnly = computed(() =>
  OWNER_INITIATED_DOC_KEYS.includes(props.docKey) &&
  !userStore.can('fa:add') && !userStore.can('fa:edit') &&
  !(DOC_WRITE_CODES[props.docKey] || []).some(code => userStore.can(code))
)

/** 各单据允许发起的资产前置状态：与台账行级入口共用 constants/assetActions.js */
const assetOptions = computed(() => {
  const allowed = ALLOWED_ASSET_STATUS[props.docKey] || []
  const me = userStore.user?.id || ''
  return assetStore.assets
    .filter(a => allowed.includes(a.status) && (!ownerOnly.value || a.userId === me))
    .map(a => ({ id: a.id, code: a.code, name: a.name, status: a.status }))
})

/** 退库单集合：发起归还退库时生成草稿，并检查同一借出单是否已归还 */
const backCol = useCollection(`${COLLECTION.docListPrefix}-back`, { immediate: false })
const backItems = backCol.items

const filteredRows = computed(() => items.value.filter(d =>
  (!search.docNo || (d.code || '').includes(search.docNo)) &&
  (!search.company || d.companyId === search.company) &&
  (!search.status || d.status === search.status)
))
const total = computed(() => filteredRows.value.length)
const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  // 表格 row 必须是 items 里的原对象：删除按引用定位、审批动作直接改 row.status。
  // 造副本会出现「审批完结了列表还是旧状态 / 删除后行还在」；公司名改由列模板解析。
  return filteredRows.value.slice(start, start + pageSize.value)
})

function statusText(status) {
  return labelOf('DOC_STATUS', status)
}
// statusType 统一取自 utils/status.js（P1 一致性收敛）
function resetSearch() {
  Object.assign(search, { docNo: '', company: '', status: '' })
  page.value = 1
}

// ---------------- 新增 / 修改 ----------------
const dialogVisible = ref(false)
const dialogMode = ref('add')
const emptyForm = () => ({
  id: '', name: '', companyId: '', assetId: '', remark: '', deptId: '',
  disposeType: '', buyer: '', voucherNo: '', disposalAmount: null, outLedgerBasis: '',
  changeType: '', beforeSnapshot: '', afterSnapshot: '',
  expectedReturnDate: '', borrowDocId: '',
  toDeptId: '', toUserId: '', toLocation: '',
  receiverId: '', borrowerId: '', borrowerDeptId: '', borrowPurpose: ''
})
const form = reactive(emptyForm())

/** 选实际领用人 / 借用人后自动带出其所属部门，避免部门与实际人不一致 */
function onReceiverChange(id) {
  const u = id ? (orgStore.users || []).find(x => x.id === id) : null
  if (u?.deptId) form.deptId = u.deptId
}
function onBorrowerChange(id) {
  const u = id ? (orgStore.users || []).find(x => x.id === id) : null
  if (u?.deptId) form.borrowerDeptId = u.deptId
}

const enabledUsers = computed(() => (orgStore.users || []).filter(u => u.status === 'ENABLED'))
/** 调拨：选中资产的当前归属（只读展示）；before* 快照由服务端提交时按台账生成 */
const transferAsset = computed(() => assetStore.assets.find(a => a.id === form.assetId))
const transferAssetStatus = computed(() => transferAsset.value?.status || '')
const transferCurrent = computed(() => {
  const a = transferAsset.value
  if (!a) return { dept: '', user: '', location: '' }
  return {
    dept: orgStore.deptName(a.deptId) || '',
    user: (orgStore.users || []).find(u => u.id === a.userId)?.name || '',
    location: a.location || ''
  }
})
/** 新存放地点候选：台账已有位置去重，输入新值即作为自由文本保存 */
function queryTransferLocations(queryString, cb) {
  const q = String(queryString || '').trim().toLowerCase()
  const all = [...new Set(assetStore.assets.map(a => a.location).filter(Boolean))]
    .sort().map(value => ({ value }))
  cb(q ? all.filter(o => o.value.toLowerCase().includes(q)) : all)
}

/** 只有草稿 / 已驳回可改；与后端 GenericService.assertDocMutable 同源，无状态的历史数据按草稿处理 */
const isDocEditable = row => !row?.status || DOC_EDITABLE_STATUS.includes(row.status)

function openDialog(row) {
  if (row && !isDocEditable(row)) { ElMessage.warning('单据审批中或已完结，不可修改'); return }
  dialogMode.value = row ? 'edit' : 'add'
  Object.assign(form, emptyForm(), row
    ? {
        id: row.id, name: row.name || '', companyId: row.companyId || '',
        assetId: row.assetId || '', remark: row.remark || '', deptId: row.deptId || '',
        disposeType: row.disposeType || '', buyer: row.buyer || '',
        voucherNo: row.voucherNo || '', disposalAmount: row.disposalAmount ?? null,
        outLedgerBasis: row.outLedgerBasis || '', changeType: row.changeType || '',
        beforeSnapshot: row.beforeSnapshot || '', afterSnapshot: row.afterSnapshot || '',
        expectedReturnDate: row.expectedReturnDate || '', borrowDocId: row.borrowDocId || '',
        toDeptId: row.toDeptId || '', toUserId: row.toUserId || '', toLocation: row.toLocation || '',
        receiverId: row.receiverId || '', borrowerId: row.borrowerId || '',
        borrowerDeptId: row.borrowerDeptId || '', borrowPurpose: row.borrowPurpose || ''
      }
    // 派发单的实际领用人按既有口径沿用单据创建人，默认带出其账号所属部门
    : { companyId: orgStore.companies[0]?.id || '', deptId: defaultDeptId.value })
  dialogVisible.value = true
}

/**
 * 从资产台账 / 详情的行级入口直接发起业务：预选资产并打开新增弹窗。
 * 期初导入且无前置单据的资产同样走这里，不做来源标记判断。
 */
function openCreateWithAsset(assetId, companyId) {
  if (!props.perm) return false
  openDialog(null)
  form.assetId = assetId || ''
  if (companyId) form.companyId = companyId
  return true
}
defineExpose({ openCreateWithAsset })

/** 只把本单据类型在契约里声明的扩展字段带给后端 */
function extraFields() {
  const extra = {}
  if (props.docKey === 'dispose') {
    Object.assign(extra, {
      disposeType: form.disposeType, buyer: form.buyer, voucherNo: form.voucherNo,
      disposalAmount: form.disposalAmount, outLedgerBasis: form.outLedgerBasis
    })
  }
  if (props.docKey === 'change') {
    Object.assign(extra, {
      changeType: form.changeType, beforeSnapshot: form.beforeSnapshot,
      afterSnapshot: form.afterSnapshot
    })
  }
  if (props.docKey === 'borrow') {
    extra.expectedReturnDate = form.expectedReturnDate
  }
  if (props.docKey === 'alloc') {
    Object.assign(extra, { deptId: form.deptId, receiverId: form.receiverId })
  }
  if (props.docKey === 'borrow') {
    Object.assign(extra, {
      borrowerId: form.borrowerId,
      borrowerDeptId: form.borrowerDeptId,
      borrowPurpose: form.borrowPurpose
    })
  }
  if (props.docKey === 'transfer') {
    // 快照 before* 由服务端 submit 时按台账生成，客户端不传，避免伪造现任使用人
    Object.assign(extra, {
      toDeptId: form.toDeptId, toUserId: form.toUserId, toLocation: form.toLocation
    })
  }
  if (form.borrowDocId) {
    extra.borrowDocId = form.borrowDocId
  }
  return extra
}

/** 单号：前缀 + 年份 + 序号（种子占用 100~900 段，新增从 1000 起，避免撞号） */
function nextCode() {
  return genDocNo(props.prefix, items.value.map(d => d.code))
}

async function submit() {
  if (!form.name) { ElMessage.warning('请填写单据名称'); return }
  if (!form.companyId) { ElMessage.warning('请选择所属公司'); return }
  if (!form.assetId) { ElMessage.warning('请选择关联资产'); return }
  if (props.docKey === 'dispose' && !form.disposeType) { ElMessage.warning('请选择处置方式'); return }
  if (props.docKey === 'change' && !form.changeType) { ElMessage.warning('请选择变更类型'); return }
  if (props.docKey === 'alloc') {
    if (!form.receiverId) { ElMessage.warning('请选择实际领用人（派发必填）'); return }
    if (!enabledUsers.value.some(u => u.id === form.receiverId)) {
      ElMessage.warning('实际领用人不是有效的在职账号，请重新选择'); return
    }
  }
  if (props.docKey === 'borrow') {
    if (!form.borrowerId) { ElMessage.warning('请选择借用人（借出必填）'); return }
    if (!enabledUsers.value.some(u => u.id === form.borrowerId)) {
      ElMessage.warning('借用人不是有效的在职账号，请重新选择'); return
    }
  }
  if (props.docKey === 'transfer') {
    // 用户裁决：空闲资产可以派发、不能调拨，选了就明确提示
    if (transferAssetStatus.value === 'IDLE') {
      ElMessage.warning('空闲资产不能调拨，请先办理「派发」确定使用人')
      return
    }
    if (!form.toUserId) { ElMessage.warning('请选择新使用人（调拨必填）'); return }
    if (!enabledUsers.value.some(u => u.id === form.toUserId)) {
      ElMessage.warning('新使用人不是有效的在职账号，请重新选择')
      return
    }
  }
  const extra = extraFields()
  try {
    if (dialogMode.value === 'edit') {
      const target = items.value.find(d => d.id === form.id)
      // 弹窗打开期间单据可能已被审批推到终态，保存前按最新状态再挡一次
      if (target && !isDocEditable(target)) { ElMessage.warning('单据已审批或完结，不可修改'); return }
      if (target) {
        Object.assign(target, { name: form.name, companyId: form.companyId, assetId: form.assetId, remark: form.remark }, extra)
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
        status: 'DRAFT',
        ...extra
      })
      page.value = 1
      ElMessage.success('单据已创建')
    }
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  }
}

/**
 * 删除入口与后端 GenericService.assertDocMutable 同源：
 * 审批中不可删；已完结 / 已作废是审计凭证，只有系统管理员（R1）能删。
 * 资产管理员看得到单、办得了审批，但不应在完结单上看到一个点了必失败的「删除」。
 */
function canDeleteRow(row) {
  if (!props.perm) return false
  if (row.status === 'PROCESSING') return false
  if (['DONE', 'REVOKED'].includes(row.status)) return (userStore.user?.roleIds || []).includes('R1')
  return true
}

async function removeRow(row) {
  if (!canDeleteRow(row)) {
    ElMessage.warning('审批中的单据不可删除；已完结或已作废的单据仅系统管理员可删')
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除单据"${row.code}"？`, '删除确认', { type: 'warning' })
  } catch (e) {
    return
  }
  try {
    await col.remove(row)
    // remove 先本地移除再调后端，无论成败都重拉，避免「提示已删除但行还在」
    await col.load()
    ElMessage.success('单据已删除')
  } catch (e) {
    await col.load()
    ElMessage.error(e?.message || '删除失败')
  }
}

// ---------------- 借出归还 = 关联原借出单的退库单（WF3） ----------------
const returnVisible = ref(false)
const returnForm = reactive({ docId: '', code: '', comment: '', assetLabel: '' })

/** 已完结、未归还，且尚未生成归还型退库单的借出单才能发起 */
function canReturnRow(doc) {
  if (props.docKey !== 'borrow' || doc.status !== 'DONE' || doc.returned) return false
  return !backItems.value.some(b => b.borrowDocId === doc.id
    && !['REVOKED', 'REJECTED'].includes(b.status))
}

async function openReturnDialog(row) {
  await backCol.load().catch(() => null)
  const asset = assetStore.assets.find(a => a.id === row.assetId)
  Object.assign(returnForm, {
    docId: row.id, code: row.code || '', comment: '',
    assetLabel: asset ? `${asset.code} ${asset.name}` : (row.assetId || '')
  })
  returnVisible.value = true
}

async function submitReturn() {
  const target = items.value.find(d => d.id === returnForm.docId)
  if (!target) { ElMessage.warning('单据不存在，请刷新后重试'); return }
  if (!target.assetId) { ElMessage.warning('借出单缺少关联资产，无法发起归还退库'); return }
  try {
    await backCol.load().catch(() => null)
    await dataService.create(`${COLLECTION.docListPrefix}-back`, {
      name: `归还退库-${target.code || ''}`,
      code: genDocNo('TK', backItems.value.map(d => d.code)),
      companyId: target.companyId || '',
      assetId: target.assetId,
      borrowDocId: target.id,
      creatorId: userStore.user?.id || '',
      createTime: new Date().toISOString(),
      finishTime: '',
      remark: returnForm.comment.trim() || `归还借出单 ${target.code || ''}`,
      status: 'DRAFT'
    })
    ElMessage.success('归还退库单已生成，请在「资产退库」页签提交审批')
    returnVisible.value = false
    await backCol.load().catch(() => null)
  } catch (e) {
    ElMessage.error(e?.message || '发起归还退库失败')
  }
}

// ---------------- 审批 ----------------
const bizType = computed(() => DOC_BIZ_TYPE[props.docKey] || props.docKey.toUpperCase())

/** 条件上下文：金额取关联资产原值（金额门槛环节据此生效） */
function ctxOf(doc) {
  const asset = assetStore.assets.find(a => a.id === doc?.assetId)
  return {
    amount: Number(doc?.disposalAmount || asset?.original || doc?.amount || 0),
    hasDiff: false,
    // 与服务端 effectiveCtx 一致：处置方式取单据字段，不能由客户端 ctx 谎报
    disposeType: doc?.disposeType || '',
    // 调拨「现任使用人交出确认」环节按是否有使用人决定生效
    hasAssetUser: !!doc?.beforeUserId || !!asset?.userId,
    // 借出「借用人确认接收」：历史单据没有借用人时不生效
    hasBorrower: !!doc?.borrowerId
  }
}

function flowOf(doc) {
  return getFlow(bizType.value, approvalStore.flows)
}
function currentOf(doc) {
  const flow = flowOf(doc)
  if (!flow) return null
  const steps = effectiveSteps(flow, ctxOf(doc))
  const records = approvalsOf(approvalStore.approvals, props.docKey, doc?.id)
  return currentStep(steps, records, orgStore, doc, assetStore.assets)
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
  return canApprove(cur.step, userStore.user, orgStore, cur.records, doc, assetStore.assets)
}
function canRevokeRow(doc) {
  const flow = flowOf(doc)
  if (!flow || doc.status !== 'PROCESSING') return false
  return canSubmit(doc, flow, userStore.user, orgStore)
}

/** 执行审批动作 */
async function doApproval(doc, action, comment = '', targetUserId = '') {
  if (!approvalStore.loaded) await approvalStore.load()
  const res = await runApproval({
    doc,
    docKey: props.docKey,
    bizType: bizType.value,
    action,
    comment,
    targetUserId,
    ctx: ctxOf(doc),
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    assets: assetStore.assets,
    saveDoc: async next => {
      const target = items.value.find(d => d.id === doc.id)
      if (target) {
        Object.assign(target, next)
        await col.update(target)
      }
    },
    saveApproval: row => approvalStore.addApproval(row)
  })
  if (res.ok) {
    ElMessage.success(res.message)
    // 服务端完结会回写台账（入库 PENDING_INBOUND→IDLE、派发→IN_USE、维修→IN_USE 等），
    // 撤回 / 作废也会恢复资产状态；本地 store 不重拉就一直是旧值，必须刷新网页才看得到。
    // 台账由 runApproval 在通用层统一重拉，这里只刷本单据列表
    await col.load()
  } else ElMessage.error(res.message)
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

async function onApprovalAct({ action, comment, targetUserId }) {
  const res = await doApproval(approvalDoc.value, action, comment, targetUserId)
  // 加签/转办/抄送不推进单据，保持弹窗打开以便看到新的审批人与轨迹
  if (res.ok && !isCollabAction(action)) approvalVisible.value = false
}

// 其他入口（如盘点审批转处置）新增单据后，通知本面板刷新
function onDocsChanged(e) {
  if (e?.detail === props.docKey) col.load()
}
onMounted(() => {
  window.addEventListener('fams:doc-lists-changed', onDocsChanged)
  // 流程配置的读权限含 wm:todo；只读账号不需要也不应发这个请求
  if (userStore.can('wm:todo')) approvalStore.load()
})
onUnmounted(() => window.removeEventListener('fams:doc-lists-changed', onDocsChanged))
</script>

<style scoped>
.doc-list { display: block; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.asset-empty-hint {
  margin-top: 6px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--t-weak);
  background: #f7f9fc;
  border: 1px dashed #dcdfe6;
  border-radius: var(--r-md);
}
.form-hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--t-weak);
}
</style>
