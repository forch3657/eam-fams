<template>
  <el-dialog
    :model-value="modelValue"
    title="审批信息"
    width="760px"
    @update:model-value="v => emit('update:modelValue', v)"
  >
    <template v-if="doc">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="单据编号">{{ doc.code || doc.docNo || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单据名称">{{ doc.name || doc.itemName || '-' }}</el-descriptions-item>
        <!-- 固定资产单据的审批对象是具体资产：编号与名称是审批时必须能核对的基础信息。
             低值/盘点单据没有 assetId，不渲染这两项。
             这里不用 <template v-if> 包裹，避免 el-descriptions 收集不到 Fragment 里的 item。 -->
        <el-descriptions-item v-if="assetInfo" label="资产编号">{{ assetInfo.code || '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="assetInfo" label="资产名称">{{ assetInfo.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="单据状态">
          <el-tag :type="statusType(doc.status)" size="small">{{ labelOf('DOC_STATUS', doc.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建人">{{ creatorName }}</el-descriptions-item>
        <el-descriptions-item label="审批流程">{{ flow ? flow.name : '未配置' }}</el-descriptions-item>
        <el-descriptions-item label="当前环节">{{ current ? current.step.name : '-' }}</el-descriptions-item>
      </el-descriptions>

      <!-- 流程环节 -->
      <div class="sec-title">审批环节</div>
      <el-alert v-if="!flow" type="warning" :closable="false" show-icon
        title="该业务类型没有启用的审批流程，请到「系统管理 → 流程配置」中配置并启用" />
      <el-steps v-else :active="activeIndex" finish-status="success" align-center>
        <el-step v-for="s in steps" :key="s.key" :title="s.name" :description="stepDesc(s)" />
      </el-steps>

      <ul v-if="steps.length" class="step-list">
        <li v-for="(s, i) in steps" :key="s.key">
          <span class="idx">{{ i + 1 }}</span>
          <span class="nm">{{ s.name }}</span>
          <el-tag size="small" effect="plain">{{ stepInfo(s).modeText }}</el-tag>
          <el-tag size="small" effect="plain">{{ stepInfo(s).roleName }}</el-tag>
          <span v-if="stepInfo(s).conditionText" class="cond">{{ stepInfo(s).conditionText }}</span>
          <span class="state">
            <el-tag size="small" :type="stateType(stateOf(s))">{{ stateText(stateOf(s)) }}</el-tag>
            <span v-if="stepAccounts(s).length" class="acc">
              审批账号：{{ stepAccounts(s).map(a => a.username + '(' + a.name + ')').join('、') }}
            </span>
          </span>
        </li>
      </ul>

      <!-- 审批轨迹 -->
      <div class="sec-title">审批轨迹</div>
      <el-empty v-if="!timeline.length" description="暂无审批记录" :image-size="60" />
      <el-timeline v-else>
        <el-timeline-item
          v-for="r in timeline"
          :key="r.id"
          :timestamp="formatDateTime(r.time)"
          placement="top"
          :type="timelineType(r.result)"
        >
          <div class="tl-title">
            {{ r.stepName || '提交申请' }} · {{ r.approverName || '-' }}
            <el-tag size="small" :type="timelineType(r.result)">{{ resultText(r.result) }}</el-tag>
            <span v-if="r.targetUserId" class="tl-role">→ {{ userName(r.targetUserId) }}</span>
            <span v-else-if="r.approverRoleName" class="tl-role">{{ r.approverRoleName }}</span>
          </div>
          <div v-if="r.comment" class="tl-comment">审批意见：{{ r.comment }}</div>
        </el-timeline-item>
      </el-timeline>

      <el-alert v-if="hint && !readonly" type="info" :closable="false" show-icon :title="hint" class="mt12" />

      <el-form v-if="needComment && !readonly" label-width="80px" class="mt12">
        <el-form-item label="审批意见">
          <el-input v-model="comment" type="textarea" :rows="2" maxlength="200" show-word-limit
            :placeholder="rejectMode ? '该动作必须填写意见' : '可填写审批意见'" />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <!-- 从资产详情「操作记录」点进来的只读查看：只看结论与轨迹，不在这里执行审批动作 -->
      <template v-if="!readonly">
        <el-button v-if="showApprove" @click="openCollab('addSign')">加签</el-button>
        <el-button v-if="showApprove" @click="openCollab('transfer')">转办</el-button>
        <el-button v-if="showCc" @click="openCollab('cc')">抄送</el-button>
        <el-button v-if="showSubmit" type="primary" @click="act('submit')">提交</el-button>
        <el-button v-if="showWithdraw" @click="act('withdraw')">撤回</el-button>
        <el-button v-if="showVoid" type="warning" @click="act('void')">作废</el-button>
        <el-button v-if="showApprove" type="primary" @click="act('approve')">通过</el-button>
        <el-button v-if="showReject" type="danger" @click="act('reject')">驳回</el-button>
        <el-button v-if="showTerminate" type="danger" @click="act('terminate')">终止</el-button>
      </template>
    </template>
  </el-dialog>

  <!-- 加签 / 转办 / 抄送：选择目标人员后通过 act 事件交给父组件落库 -->
  <el-dialog
    v-model="collabVisible"
    :title="collabTitle"
    width="460px"
    append-to-body
    :close-on-click-modal="false"
  >
    <el-form label-width="90px">
      <el-form-item label="目标人员" required>
        <el-select v-model="collabTarget" filterable clearable placeholder="请选择人员" style="width: 100%">
          <el-option
            v-for="u in collabCandidates"
            :key="u.id"
            :label="`${u.name}（${u.username}）`"
            :value="u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="说明">
        <el-input v-model="collabComment" type="textarea" :rows="2" maxlength="200" show-word-limit
          placeholder="可填写说明（选填）" />
      </el-form-item>
      <el-alert v-if="!collabCandidates.length" type="warning" :closable="false" show-icon
        title="暂无可选人员：当前环节的审批人不能作为目标人员" />
    </el-form>

    <template #footer>
      <el-button @click="collabVisible = false">取消</el-button>
      <el-button type="primary" :disabled="!collabTarget" @click="confirmCollab">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 审批信息弹窗（通用）
 *
 * 完全由「系统管理 → 流程配置」驱动：
 * - 展示当前单据命中的流程、生效环节（按触发条件过滤）、每个环节的审批角色与可用账号；
 * - 展示真实审批轨迹（提交/通过/驳回/撤销）；
 * - 按当前登录人的角色决定可执行的提交/通过/驳回/撤销动作，动作交由父组件落库。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { labelOf } from '../../constants/enums'
import { formatDateTime } from '../../utils/format'
import { statusType, approveResultType as timelineType } from '../../utils/status'
import { useOrgStore } from '../../store/org'
import { useUserStore } from '../../store/user'
import { useApprovalStore } from '../../store/approval'
import { useFixedAssetStore } from '../../store/fixedAsset'
import {
  DOC_BIZ_TYPE, getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, stepInfo, stepState, stepApproverAccounts
} from '../../services/approval'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doc: { type: Object, default: null },
  /** 单据类型：inbound / alloc / back / borrow / transfer / repair / change / dispose / inventory */
  docKey: { type: String, required: true },
  /** 业务类型：默认按 docKey 映射；同名但业务不同的单据（如低值退库）显式指定 */
  bizType: { type: String, default: '' },
  /** 条件上下文：{ amount, hasDiff }，决定哪些环节在本单据上生效 */
  ctx: { type: Object, default: () => ({}) },
  /** 资产台账：固资单据没有 dept_id，需要按 assetId 找资产所属部门来定位审批人 */
  assets: { type: Array, default: () => [] },
  /** 只读查看（资产详情「操作记录」入口）：不显示意见框与审批动作 */
  readonly: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'act'])

const orgStore = useOrgStore()
const userStore = useUserStore()
const approvalStore = useApprovalStore()
const fixedAssetStore = useFixedAssetStore()
const comment = ref('')

// 看流程需要 wm:todo；只读账号打开「审批信息」时跳过，避免 403
onMounted(() => { if (userStore.can('wm:todo')) approvalStore.load() })

/**
 * 资产台账池：父组件没传时回退到全局固资 store。
 *
 * 不只是展示资产编号要用：纵向审批的「部门负责人 / 分管领导」按资产归属部门解析审批人，
 * 空台账会让 docDeptId 退回创建人部门，出现「待办里看得到、点开却没有通过按钮」。
 */
const assetPool = computed(() => props.assets?.length ? props.assets : (fixedAssetStore.assets || []))

/** 审批对象：固资单据按 assetId 解析出资产编号与名称 */
const assetInfo = computed(() => {
  const d = props.doc || {}
  if (!d.assetId) return null
  const a = assetPool.value.find(x => x.id === d.assetId)
  return a || { code: d.assetCode || d.assetNo || '', name: d.assetName || '' }
})

const bizType = computed(() => props.bizType || DOC_BIZ_TYPE[props.docKey] || props.docKey.toUpperCase())
const flow = computed(() => getFlow(bizType.value, approvalStore.flows))
const steps = computed(() => effectiveSteps(flow.value, props.ctx))
const records = computed(() => props.doc ? approvalsOf(approvalStore.approvals, props.docKey, props.doc.id) : [])
const current = computed(() => currentStep(steps.value, records.value, orgStore, props.doc, assetPool.value))

const timeline = computed(() => [...records.value].sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))))
const activeIndex = computed(() => (current.value ? current.value.index : steps.value.length))

const creatorName = computed(() => {
  const d = props.doc || {}
  if (d.creatorId) {
    const u = orgStore.users.find(x => x.id === d.creatorId)
    if (u) return `${u.name}（${u.username}）`
  }
  return d.applicant || d.creatorName || d.receiver || d.returner || '-'
})

const stepDesc = step => {
  const info = stepInfo(step)
  return `${info.roleName} · ${info.modeText}${info.conditionText ? ' · ' + info.conditionText : ''}`
}
const stepAccounts = step => stepApproverAccounts(step, orgStore, records.value, props.doc, assetPool.value)
/** 环节状态：已通过 / 已驳回 / 待审批 / 未开始 */
const stateOf = step => stepState(step, records.value, orgStore, current.value)
const stateText = state => ({ DONE: '已通过', PENDING: '待审批', REJECTED: '已驳回', WAITING: '未开始' }[state] || '未开始')
const stateType = state => ({ DONE: 'success', PENDING: 'warning', REJECTED: 'danger', WAITING: 'info' }[state] || 'info')
const resultText = result => labelOf('APPROVE_RESULT', result) || result
const userName = id => {
  const u = orgStore.users.find(x => x.id === id)
  return u ? `${u.name}（${u.username}）` : id
}
// timelineType / statusType 统一取自 utils/status.js（P1 一致性收敛）

const showSubmit = computed(() => {
  const d = props.doc
  if (!d || !flow.value) return false
  if (d.status !== 'DRAFT' && d.status !== 'REJECTED') return false
  return canSubmit(d, flow.value, userStore.user, orgStore)
})
const showApprove = computed(() => {
  const d = props.doc
  if (!d || d.status !== 'PROCESSING' || !current.value) return false
  return canApprove(current.value.step, userStore.user, orgStore, records.value, props.doc, assetPool.value)
})
const showReject = computed(() => showApprove.value)
/** 发起人三动作与审批人三动作：与业务列表、工作台保持同一套判定 */
const isInitiator = computed(() => {
  const d = props.doc
  return !!d && !!flow.value && canSubmit(d, flow.value, userStore.user, orgStore)
})
const showWithdraw = computed(() => props.doc?.status === 'PROCESSING' && isInitiator.value)
const showVoid = computed(() =>
  ['DRAFT', 'PROCESSING', 'REJECTED'].includes(props.doc?.status) && isInitiator.value)
const showTerminate = computed(() => showApprove.value)

const rejectMode = ref(false)
const needComment = computed(() =>
  showApprove.value || showReject.value || showSubmit.value ||
  showWithdraw.value || showVoid.value || showTerminate.value)

// ---------------------------------------------------------------- 加签 / 转办 / 抄送
const COLLAB_TITLES = { addSign: '加签', transfer: '转办', cc: '抄送' }
const collabVisible = ref(false)
const collabAction = ref('addSign')
const collabTarget = ref('')
const collabComment = ref('')
const collabTitle = computed(() => COLLAB_TITLES[collabAction.value] || '协作')

const isCreator = computed(() => {
  const d = props.doc
  return !!d && !!d.creatorId && d.creatorId === userStore.user?.id
})
/** 抄送：审批中的单据，当前审批人或单据创建人都可以发起 */
const showCc = computed(() => {
  const d = props.doc
  if (!d || d.status !== 'PROCESSING') return false
  return showApprove.value || isCreator.value
})
/** 候选人：启用账号，排除自己；加签/转办还要排除已在该环节的审批人 */
const collabCandidates = computed(() => {
  const me = userStore.user
  if (!me) return []
  const step = current.value?.step
  return (orgStore.users || [])
    .filter(u => u.status === 'ENABLED' && u.id !== me.id)
    .filter(u => collabAction.value === 'cc' || !canApprove(step, u, orgStore, records.value, props.doc, props.assets))
    .map(u => ({ id: u.id, name: u.name || u.username, username: u.username }))
})

function openCollab(action) {
  collabAction.value = action
  collabTarget.value = ''
  collabComment.value = ''
  collabVisible.value = true
}
function confirmCollab() {
  if (!collabTarget.value) return
  const action = collabAction.value
  collabVisible.value = false
  emit('act', {
    action,
    comment: collabComment.value,
    targetUserId: collabTarget.value,
    doc: props.doc,
    bizType: bizType.value
  })
}

// 弹窗关闭时收起协作子弹窗；重新打开时清空审批意见
watch(() => props.modelValue, async v => {
  if (v) {
    comment.value = ''
    // 工作台待办等入口没有预载固资台账：按需补一次，避免资产编号/名称显示成空值
    if (props.doc?.assetId && !assetInfo.value?.code && !fixedAssetStore.loaded) {
      await fixedAssetStore.loadAll().catch(() => {})
    }
  } else {
    collabVisible.value = false
  }
})

/** 提示：当前登录人为什么不能审（便于换账号测试） */
const hint = computed(() => {
  const d = props.doc
  if (!d || d.status !== 'PROCESSING' || !current.value) return ''
  if (showApprove.value) return ''
  const info = stepInfo(current.value.step)
  const accounts = stepAccounts(current.value.step)
  const accText = accounts.length
    ? accounts.map(a => `${a.username}(${a.name})`).join('、')
    : '（该角色暂无启用账号）'
  return `当前环节「${current.value.step.name}」需由【${info.roleName}】审批，可用账号：${accText}`
})

function act(action) {
  rejectMode.value = ['reject', 'withdraw', 'void', 'terminate'].includes(action)
  emit('act', { action, comment: comment.value, doc: props.doc, bizType: bizType.value })
}
</script>

<style scoped>
.sec-title { font-size: 14px; font-weight: 600; margin: 18px 0 12px; }
.step-list { list-style: none; padding: 0; margin: 12px 0 0; }
.step-list li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--r-md); margin-bottom: 8px; flex-wrap: wrap; }
.step-list .idx { width: 22px; height: 22px; border-radius: 50%; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; flex-shrink: 0; }
.step-list .nm { font-weight: 600; }
.step-list .cond { font-size: 12px; color: var(--c-warning); }
.step-list .state { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--t-weak); }
.tl-title { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.tl-role { color: var(--t-weak); font-size: 12px; }
.tl-comment { font-size: 12px; color: var(--t-weak); margin-top: 4px; }
.mt12 { margin-top: 12px; }
</style>
