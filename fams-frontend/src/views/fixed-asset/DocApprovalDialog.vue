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
        <el-descriptions-item label="单据名称">{{ doc.name || '-' }}</el-descriptions-item>
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
            <span v-if="r.approverRoleName" class="tl-role">{{ r.approverRoleName }}</span>
          </div>
          <div v-if="r.comment" class="tl-comment">审批意见：{{ r.comment }}</div>
        </el-timeline-item>
      </el-timeline>

      <el-alert v-if="hint" type="info" :closable="false" show-icon :title="hint" class="mt12" />

      <el-form v-if="needComment" label-width="80px" class="mt12">
        <el-form-item label="审批意见">
          <el-input v-model="comment" type="textarea" :rows="2" maxlength="200" show-word-limit
            :placeholder="rejectMode ? '驳回必须填写意见' : '可填写审批意见'" />
        </el-form-item>
      </el-form>
    </template>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="showSubmit" type="primary" @click="act('submit')">提交审批</el-button>
      <el-button v-if="showApprove" type="primary" @click="act('approve')">通过</el-button>
      <el-button v-if="showReject" type="danger" @click="act('reject')">驳回</el-button>
      <el-button v-if="showRevoke" type="warning" @click="act('revoke')">撤销</el-button>
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
import { useOrgStore } from '../../store/org'
import { useUserStore } from '../../store/user'
import { useApprovalStore } from '../../store/approval'
import {
  DOC_BIZ_TYPE, getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, stepInfo, stepState, stepApproverAccounts
} from '../../services/approval'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  doc: { type: Object, default: null },
  /** 单据类型：inbound / alloc / back / borrow / transfer / repair / change / dispose / inventory */
  docKey: { type: String, required: true },
  /** 条件上下文：{ amount, hasDiff }，决定哪些环节在本单据上生效 */
  ctx: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:modelValue', 'act'])

const orgStore = useOrgStore()
const userStore = useUserStore()
const approvalStore = useApprovalStore()
const comment = ref('')

onMounted(() => approvalStore.load())

watch(() => props.modelValue, v => { if (v) comment.value = '' })

const bizType = computed(() => DOC_BIZ_TYPE[props.docKey] || props.docKey.toUpperCase())
const flow = computed(() => getFlow(bizType.value, approvalStore.flows))
const steps = computed(() => effectiveSteps(flow.value, props.ctx))
const records = computed(() => props.doc ? approvalsOf(approvalStore.approvals, props.docKey, props.doc.id) : [])
const current = computed(() => currentStep(steps.value, records.value, orgStore))

const timeline = computed(() => [...records.value].sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))))
const activeIndex = computed(() => (current.value ? current.value.index : steps.value.length))

const creatorName = computed(() => {
  const d = props.doc || {}
  if (d.creatorId) {
    const u = orgStore.users.find(x => x.id === d.creatorId)
    if (u) return `${u.name}（${u.username}）`
  }
  return d.applicant || d.creatorName || '-'
})

const stepDesc = step => {
  const info = stepInfo(step)
  return `${info.roleName} · ${info.modeText}${info.conditionText ? ' · ' + info.conditionText : ''}`
}
const stepAccounts = step => stepApproverAccounts(step, orgStore)
/** 环节状态：已通过 / 已驳回 / 待审批 / 未开始 */
const stateOf = step => stepState(step, records.value, orgStore, current.value)
const stateText = state => ({ DONE: '已通过', PENDING: '待审批', REJECTED: '已驳回', WAITING: '未开始' }[state] || '未开始')
const stateType = state => ({ DONE: 'success', PENDING: 'warning', REJECTED: 'danger', WAITING: 'info' }[state] || 'info')
const resultText = result => labelOf('APPROVE_RESULT', result) || result
const timelineType = result => ({ AGREE: 'success', REJECT: 'danger', REVOKE: 'info', SUBMIT: 'primary' }[result] || 'info')
const statusType = status => ({ DONE: 'success', PROCESSING: 'primary', DRAFT: 'warning', REJECTED: 'danger', REVOKED: 'info' }[status] || 'info')

const showSubmit = computed(() => {
  const d = props.doc
  if (!d || !flow.value) return false
  if (d.status !== 'DRAFT' && d.status !== 'REJECTED') return false
  return canSubmit(d, flow.value, userStore.user, orgStore)
})
const showApprove = computed(() => {
  const d = props.doc
  if (!d || d.status !== 'PROCESSING' || !current.value) return false
  return canApprove(current.value.step, userStore.user, orgStore)
})
const showReject = computed(() => showApprove.value)
const showRevoke = computed(() => {
  const d = props.doc
  if (!d || d.status !== 'PROCESSING' || !flow.value) return false
  return canSubmit(d, flow.value, userStore.user, orgStore)
})

const rejectMode = ref(false)
const needComment = computed(() => showApprove.value || showReject.value || showSubmit.value || showRevoke.value)

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
  rejectMode.value = action === 'reject'
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
