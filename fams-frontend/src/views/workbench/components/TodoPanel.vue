<template>
  <div class="wb-todo">
    <el-tabs v-model="tab" class="wb-tabs">
      <!-- 待我审批 -->
      <el-tab-pane name="pending">
        <template #label>待我审批<el-badge v-if="pending.length" :value="pending.length" class="tab-badge" /></template>
        <div v-if="!pending.length" class="wb-todo-empty">
          <el-empty description="当前没有需要你审批的单据" :image-size="60" />
          <p class="wb-todo-tip">
            待审批单据按「系统管理 → 流程配置」的环节角色派发；
            如需由你审批，请确认该环节的审批角色已分配给你所在角色。
          </p>
          <!-- 无个人待办时（如系统管理员）展示全局在途环节，避免页面空荡 -->
          <div v-if="globalSteps.length" class="wb-global">
            <div class="wb-global-title">当前在途单据的待办环节</div>
            <div class="wb-global-list">
              <div v-for="s in globalSteps" :key="s.roleName + s.stepName" class="wb-global-item">
                <span class="n">{{ s.count }}</span>
                <div class="txt">
                  <div class="t">{{ s.stepName }}</div>
                  <div class="r">{{ s.roleName }} · {{ s.bizName }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <el-table v-else :data="pending" size="small" max-height="336">
          <el-table-column prop="code" label="单据号" width="125" />
          <el-table-column prop="bizName" label="类型" width="88" />
          <el-table-column prop="title" label="单据" min-width="130" show-overflow-tooltip />
          <el-table-column prop="stepName" label="当前环节" width="126" show-overflow-tooltip />
          <el-table-column label="金额/数量" width="104" align="right">
            <template #default="{ row }">
              <span v-if="row.amount">¥{{ row.amount.toLocaleString() }}</span>
              <span v-else>{{ row.quantity || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="creatorName" label="提交人" width="82" />
          <el-table-column label="停留" width="66" align="right">
            <template #default="{ row }">
              <span :class="{ 'wb-overdue': row.overdue }">{{ row.stayDays }}天</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="126" fixed="right">
            <template #default="{ row }">
              <el-button link type="success" size="small" @click="openApproval(row)">通过</el-button>
              <el-button link type="danger" size="small" @click="reject(row)">驳回</el-button>
              <el-button link type="primary" size="small" @click="goProcess(row)">去处理</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
      <!-- 我发起的 -->
      <el-tab-pane name="mine">
        <template #label>我发起的<el-badge v-if="mineRejected.length" :value="mineRejected.length" type="warning" class="tab-badge" /></template>
        <el-table :data="mine" size="small" max-height="336" empty-text="我还没有提交过单据">
          <el-table-column prop="code" label="单据号" width="125" />
          <el-table-column prop="bizName" label="类型" width="88" />
          <el-table-column prop="title" label="单据" min-width="140" show-overflow-tooltip />
          <el-table-column label="状态" width="92">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ labelOf('DOC_STATUS', row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="stepName" label="当前环节" min-width="120" show-overflow-tooltip />
          <el-table-column label="提交时间" width="146">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="126" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status === 'DRAFT'" link type="primary" size="small" @click="submitDoc(row)">提交</el-button>
              <el-button v-if="row.status === 'REJECTED'" link type="warning" size="small" @click="goProcess(row)">重新提交</el-button>
              <el-button link type="primary" size="small" @click="goProcess(row)">去处理</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 我已处理 -->
      <el-tab-pane name="done">
        <template #label>我已处理</template>
        <el-table :data="done" size="small" max-height="336" empty-text="近 30 天没有我处理过的单据">
          <el-table-column prop="code" label="单据号" width="125" />
          <el-table-column prop="bizName" label="类型" width="88" />
          <el-table-column prop="stepName" label="处理环节" min-width="140" show-overflow-tooltip />
          <el-table-column label="结果" width="84">
            <template #default="{ row }">
              <el-tag :type="row.result === 'AGREE' ? 'success' : 'danger'" size="small">
                {{ labelOf('APPROVE_RESULT', row.result) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="comment" label="意见" min-width="130" show-overflow-tooltip />
          <el-table-column label="处理时间" width="146">
            <template #default="{ row }">{{ formatDateTime(row.time) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <DocApprovalDialog
      v-model="dlgVisible"
      :doc="current.doc"
      :doc-key="current.docKey || ''"
      :biz-type="current.bizType || ''"
      :ctx="currentCtx"
      @act="onAct"
    />
  </div>
</template>

<script setup>
/**
 * 待办面板：待我审批 / 我发起的 / 我已处理（外层卡片由工作台承载）
 *
 * 审批动作直接复用 services/approval.js 的 runApproval 与 DocApprovalDialog，
 * 与业务页面的审批口径完全一致（同一套流程配置、同一套判定）。
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkbenchStore } from '../../../store/workbench'
import { useApprovalStore } from '../../../store/approval'
import { useLowValueAssetStore } from '../../../store/lowValueAsset'
import { useOrgStore } from '../../../store/org'
import { useNotifyStore } from '../../../store/notify'
import { dataService } from '../../../services'
import { BIZ_DOC_REGISTRY, runApproval } from '../../../services/approval'
import { docCtx } from '../../../services/workbench'
import { labelOf } from '../../../constants/enums'
import { formatDateTime } from '../../../utils/format'
import DocApprovalDialog from '../../fixed-asset/DocApprovalDialog.vue'

const router = useRouter()
const workbench = useWorkbenchStore()
const approvalStore = useApprovalStore()
const lowValueStore = useLowValueAssetStore()
const orgStore = useOrgStore()
const notifyStore = useNotifyStore()

const tab = ref('pending')
const pending = computed(() => workbench.todos.pending)
const mine = computed(() => workbench.todos.mine)
const done = computed(() => workbench.todos.done)
const mineRejected = computed(() => mine.value.filter(m => m.status === 'REJECTED'))
/** 全局在途单据的待办环节（个人无待办时用于填充左侧区域） */
const globalSteps = computed(() => workbench.overview.approval.pendingByStep || [])

const dlgVisible = ref(false)
const current = ref({})
const currentCtx = computed(() => docCtx(current.value.doc, workbench.assets))

/** 供工作台指标卡联动切换页签 */
defineExpose({ setTab: (name) => { tab.value = name } })

function statusType(status) {
  return { DONE: 'success', PROCESSING: 'primary', DRAFT: 'warning', REJECTED: 'danger', REVOKED: 'info' }[status] || 'info'
}

/** 单据落库：低值单据必须走低值 store（带库存结算联动） */
async function persistDoc(item, next) {
  if (item.bizType === 'REQUISITION') return lowValueStore.updateRequisitionDoc(next.id, next)
  if (item.bizType === 'LV_RETURN') return lowValueStore.updateReturnDoc(next.id, next)
  const reg = BIZ_DOC_REGISTRY[item.bizType]
  return dataService.update(reg.collection, next.id, next)
}

/** 执行审批动作 */
async function runAction(item, action, comment = '') {
  const res = await runApproval({
    doc: item.doc,
    docKey: item.docKey,
    bizType: item.bizType,
    action,
    comment,
    ctx: docCtx(item.doc, workbench.assets),
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    saveDoc: next => persistDoc(item, next),
    saveApproval: row => approvalStore.addApproval(row)
  })
  if (!res.ok) {
    ElMessage.error(res.message)
    return res
  }
  ElMessage.success(res.message)
  await workbench.load(true)
  await notifyResult(item, action, comment)
  return res
}

/** 审批结果通知发起人所在单位（站内信按单位广播） */
async function notifyResult(item, action, comment) {
  const creator = orgStore.users.find(u => u.id === item.doc?.creatorId)
  const target = creator?.companyId ? orgStore.companyName(creator.companyId) : 'all'
  const resultText = { approve: '通过', reject: '驳回', revoke: '撤销', submit: '提交' }[action] || action
  await notifyStore.sendByTemplate('approval_result', {
    billNo: item.code,
    bizType: item.bizName,
    result: resultText,
    comment: comment ? `，意见：${comment}` : ''
  }, { target, route: item.route })
}

function openApproval(item) {
  current.value = item
  dlgVisible.value = true
}

async function reject(item) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回意见', '驳回审批', {
      inputValidator: v => (v && v.trim() ? true : '驳回必须填写意见')
    })
    await runAction(item, 'reject', value.trim())
  } catch (e) {
    // 取消
  }
}

/** 我发起的：提交（草稿 → 审批中） */
async function submitDoc(item) {
  await runAction(item, 'submit', '提交审批申请')
}

async function onAct({ action, comment }) {
  const res = await runAction(current.value, action, comment)
  if (res.ok) dlgVisible.value = false
}

/** 去处理：跳到对应业务页面并定位 tab（支持子标签页） */
function goProcess(item) {
  const query = {}
  if (item.tab) query.tab = item.tab
  if (item.sub) query.sub = item.sub
  router.push({ path: item.route, query })
}
</script>

<style scoped>
.tab-badge { margin-left: 6px; vertical-align: top; }
.wb-overdue { color: var(--c-danger); font-weight: 600; }
.wb-todo-empty { padding-top: 6px; }
.wb-todo-tip { font-size: 12px; color: var(--t-weak); text-align: center; max-width: 460px; margin: 0 auto; line-height: 1.6; }
.wb-global { max-width: 560px; margin: 10px auto 0; padding-top: 10px; border-top: 1px dashed var(--bd); }
.wb-global-title { font-size: 12px; color: var(--t-weak); text-align: center; margin-bottom: 8px; }
.wb-global-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.wb-global-item { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: 1px solid var(--bd); border-radius: var(--r-md); }
.wb-global-item .n { font-size: 17px; font-weight: 700; color: var(--c-primary); min-width: 24px; text-align: center; }
.wb-global-item .txt { min-width: 0; }
/* 环节名与角色各占一行，超长省略，避免在窄格子里折成多行 */
.wb-global-item .t { font-size: 12px; font-weight: 600; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-global-item .r { font-size: 11px; color: var(--t-weak); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
