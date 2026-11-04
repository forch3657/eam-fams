/**
 * 审批引擎
 *
 * 审批链完全由「系统管理 → 流程配置」(system-workflow-flows) 驱动：
 * - 流程按业务类型(bizType)与单据类型匹配；
 * - 环节审批人引用**系统角色**(approverRoleId)，持有该角色的启用用户即可审批；
 * - 环节触发条件(conditionType/conditionValue)：金额门槛、存在盘点差异；
 * - 审批方式(mode)：ANY 或签 / SEQUENCE 依次 / ALL 会签。
 *
 * 单据状态机（DOC_STATUS）：
 *   DRAFT 草稿 -> PROCESSING 审批中 -> DONE 已完结
 *                              |--驳回--> REJECTED 已驳回（可修改后重新提交）
 *                              `--撤销--> REVOKED 已撤销
 */
import { dataService, COLLECTION, dataMode } from './index'
import { httpService } from './http'
import { useOrgStore } from '../store/org'
import { useUserStore } from '../store/user'
import { useApprovalStore } from '../store/approval'
import { APPROVE_RESULT } from '../constants/enums'

/** 只写轨迹、不推进单据状态的协作动作 */
export const COLLAB_ACTIONS = ['addSign', 'transfer', 'cc']

export function isCollabAction(action) {
  return COLLAB_ACTIONS.includes(action)
}

/** 单据类型 -> 审批业务类型 */
export const DOC_BIZ_TYPE = {
  inbound: 'INBOUND',
  alloc: 'DISPATCH',
  back: 'RETURN',
  borrow: 'BORROW',
  transfer: 'TRANSFER',
  repair: 'REPAIR',
  change: 'CHANGE',
  dispose: 'DISPOSE',
  inventory: 'INVENTORY',
  requisition: 'REQUISITION',
  return: 'LV_RETURN'
}

/**
 * 业务类型 -> 单据注册表
 *
 * 「业务类型 ↔ 单据集合 ↔ 跳转入口」的唯一定义处：
 * 审批引擎按 bizType 找流程，工作台按 bizType 找单据集合与去处理入口。
 * 各处不再硬编码集合名，避免新增业务类型时漏改。
 * tab/sub 为主页面与子标签页（工作台"去处理"据此深链定位）。
 */
export const BIZ_DOC_REGISTRY = {
  INBOUND: { docKey: 'inbound', collection: 'fixed-asset-doc-lists-inbound', scope: 'fixed-asset', route: '/fixed-assets', tab: 'inbound' },
  DISPATCH: { docKey: 'alloc', collection: 'fixed-asset-doc-lists-alloc', scope: 'fixed-asset', route: '/fixed-assets', tab: 'dispatch', sub: 'alloc' },
  RETURN: { docKey: 'back', collection: 'fixed-asset-doc-lists-back', scope: 'fixed-asset', route: '/fixed-assets', tab: 'dispatch', sub: 'back' },
  BORROW: { docKey: 'borrow', collection: 'fixed-asset-doc-lists-borrow', scope: 'fixed-asset', route: '/fixed-assets', tab: 'borrow' },
  TRANSFER: { docKey: 'transfer', collection: 'fixed-asset-doc-lists-transfer', scope: 'fixed-asset', route: '/fixed-assets', tab: 'dispose', sub: 'transfer' },
  REPAIR: { docKey: 'repair', collection: 'fixed-asset-doc-lists-repair', scope: 'fixed-asset', route: '/fixed-assets', tab: 'dispose', sub: 'repair' },
  CHANGE: { docKey: 'change', collection: 'fixed-asset-doc-lists-change', scope: 'fixed-asset', route: '/fixed-assets', tab: 'change' },
  DISPOSE: { docKey: 'dispose', collection: 'fixed-asset-doc-lists-dispose', scope: 'fixed-asset', route: '/fixed-assets', tab: 'dispose', sub: 'dispose' },
  INVENTORY: { docKey: 'inventory', collection: 'fixed-asset-inventory-docs', scope: 'fixed-asset', route: '/fixed-assets', tab: 'inventory', sub: 'docs' },
  REQUISITION: { docKey: 'requisition', collection: 'low-value-requisition', scope: 'low-value', route: '/low-value-assets', tab: 'requisition' },
  LV_RETURN: { docKey: 'return', collection: 'low-value-return', scope: 'low-value', route: '/low-value-assets', tab: 'return' }
}

/** 全部业务类型（工作台遍历用） */
export const ALL_BIZ_TYPES = Object.keys(BIZ_DOC_REGISTRY)

/** 环节审批方式 -> 中文 */
export const MODE_TEXT = { ANY: '或签', SEQUENCE: '依次', ALL: '会签' }

/** 环节触发条件类型 -> 中文 */
export const CONDITION_TEXT = { NONE: '无条件', AMOUNT_GT: '单据金额大于', HAS_DIFF: '存在盘点差异' }

export { APPROVE_RESULT }

let recordSeq = 0
function nextRecordId() {
  recordSeq += 1
  return 'AP' + Date.now() + String(recordSeq).padStart(3, '0')
}

/** 按名称反查角色（兼容旧数据里只存了审批人名称的环节） */
export function roleIdByName(name, org) {
  if (!name) return ''
  const orgStore = org || useOrgStore()
  const hit = orgStore.roles.find(r => r.name === name || r.code === name)
  return hit ? hit.id : ''
}

/** 环节对应的角色 id */
export function stepRoleId(step, org) {
  if (!step) return ''
  if (step.approverRoleId) return step.approverRoleId
  return roleIdByName(step.approver, org)
}

/** 环节审批人类型 -> 中文 */
export const APPROVER_TYPE_TEXT = {
  ROLE: '角色成员',
  DEPT_LEADER: '部门负责人',
  PARENT_DEPT_LEADER: '上级部门负责人',
  DEPT_VP: '分管领导',
  USER: '指定审批人'
}

/** 环节是否按「组织里的人」解析（唯一审批人，与后端 ApproverResolver 对齐） */
export function isPersonScoped(step) {
  const type = (step && step.approverType) || 'ROLE'
  return type === 'DEPT_LEADER' || type === 'PARENT_DEPT_LEADER'
    || type === 'DEPT_VP' || type === 'USER'
}

function deptById(org, deptId) {
  return (org.departments || []).find(d => d.id === deptId) || null
}

function userById(org, id) {
  return (org.users || []).find(u => u.id === id) || null
}

/**
 * 单据归属部门：单据 deptId → 资产 deptId → 创建人所属部门。
 *
 * 固资单据表里没有 dept_id，必须先看资产；后端 ApproverResolver 用的是同一口径。
 */
export function docDeptId(doc, org, assets = []) {
  const orgStore = org || useOrgStore()
  if (!doc) return ''
  if (doc.deptId) return doc.deptId
  const asset = (assets || []).find(a => a && a.id === doc.assetId)
  if (asset && asset.deptId) return asset.deptId
  const creator = userById(orgStore, doc.creatorId)
  return (creator && creator.deptId) || ''
}

/** 分管领导：本部门没配就沿父部门向上找 */
function vpIdOf(org, deptId) {
  let cursor = deptId
  let depth = 0
  while (cursor && depth++ < 12) {
    const dept = deptById(org, cursor)
    if (!dept) return ''
    if (dept.vpId) return dept.vpId
    cursor = dept.parentId || ''
  }
  return ''
}

/**
 * 环节的审批人。
 *
 * - ROLE（缺省）：持有该角色的启用用户；
 * - DEPT_LEADER / PARENT_DEPT_LEADER / DEPT_VP：按单据归属部门解析到**唯一的人**；
 * - USER：环节上指定的固定审批人。
 */
export function stepApprovers(step, org, doc = null, assets = []) {
  const orgStore = org || useOrgStore()
  if (!step) return []
  const type = step.approverType || 'ROLE'
  if (type === 'DEPT_LEADER' || type === 'PARENT_DEPT_LEADER' || type === 'DEPT_VP') {
    const deptId = docDeptId(doc, orgStore, assets)
    if (!deptId) return []
    let target = ''
    if (type === 'DEPT_LEADER') {
      const dept = deptById(orgStore, deptId)
      target = (dept && dept.leaderId) || ''
    } else if (type === 'PARENT_DEPT_LEADER') {
      const dept = deptById(orgStore, (deptById(orgStore, deptId) || {}).parentId || '')
      target = (dept && dept.leaderId) || ''
    } else {
      target = vpIdOf(orgStore, deptId)
    }
    if (!target) return []
    const user = userById(orgStore, target)
    return user && user.status === 'ENABLED' ? [user] : []
  }
  if (type === 'USER') {
    const user = step.approverId ? userById(orgStore, step.approverId) : null
    return user && user.status === 'ENABLED' ? [user] : []
  }
  const roleId = stepRoleId(step, orgStore)
  if (!roleId) return []
  return orgStore.users.filter(u => (u.roleIds || []).includes(roleId) && u.status === 'ENABLED')
}

/** 环节可审批的账号清单（用于界面提示"该环节由谁审"，传入 records 时按加签/转办后的实际审批人） */
export function stepApproverAccounts(step, org, records = [], doc = null, assets = []) {
  return stepApproversWithRecords(step, org, records, doc, assets).map(u => ({ id: u.id, name: u.name, username: u.username }))
}

/**
 * 环节的实际审批人（含协作改动）：
 * - 基础 = 按环节类型解析出的审批人（角色成员 / 部门负责人 / 分管领导）；
 * - 存在转办时，最后一次转办的目标人替换基础集合；
 * - 转办之后（或从未转办时）的加签目标追加进集合。
 */
export function stepApproversWithRecords(step, org, records = [], doc = null, assets = []) {
  if (!step) return []
  const orgStore = org || useOrgStore()
  const stepRecords = (records || []).filter(r => r.stepKey === step.key)
  const lastTransfer = [...stepRecords].reverse().find(r => r.result === 'TRANSFER' && r.targetUserId)
  const base = lastTransfer
    ? (orgStore.users || []).filter(u => u.id === lastTransfer.targetUserId)
    : stepApprovers(step, orgStore, doc, assets)
  const result = new Map(base.map(u => [u.id, u]))
  const after = lastTransfer ? stepRecords.slice(stepRecords.indexOf(lastTransfer) + 1) : stepRecords
  for (const r of after) {
    if (r.result !== 'ADD_SIGN' || !r.targetUserId) continue
    const user = (orgStore.users || []).find(u => u.id === r.targetUserId)
    if (user) result.set(user.id, user)
  }
  return [...result.values()]
}

/** 环节是否在当前单据上生效（按触发条件过滤） */
export function stepApplies(step, ctx = {}) {
  const type = step.conditionType || 'NONE'
  if (type === 'AMOUNT_GT') {
    const threshold = Number(step.conditionValue != null ? step.conditionValue : (step.amountLimit || 0))
    return Number(ctx.amount || 0) > threshold
  }
  if (type === 'HAS_DIFF') return !!ctx.hasDiff
  return true
}

/** 流程在当前单据上生效的环节 */
export function effectiveSteps(flow, ctx = {}) {
  if (!flow) return []
  return (flow.steps || []).filter(s => stepApplies(s, ctx))
}

/** 取业务类型对应的启用流程 */
export function getFlow(bizType, flows) {
  const list = flows || []
  return list.find(f => f.bizType === bizType && f.enabled !== false) || null
}

/** 单据的审批记录 */
export function approvalsOf(records, docKey, docId) {
  return (records || []).filter(r => r.docKey === docKey && r.docId === docId)
}
/**
 * 当前待审环节
 * - ANY / SEQUENCE：一人通过即进入下一环节
 * - ALL：需该环节全部审批人通过
 * - 只有"通过"记录才算该环节已处理；驳回后重新提交会回到该环节
 */
export function currentStep(steps, approvals, org, doc = null, assets = []) {
  const list = steps || []
  const done = approvals || []
  for (let i = 0; i < list.length; i++) {
    const step = list[i]
    const stepRecords = done.filter(a => a.stepKey === step.key)
    const agreed = stepRecords.filter(a => a.result === 'AGREE')
    if (!agreed.length) return { index: i, step, records: stepRecords }
    if (step.mode === 'ALL') {
      const approvers = stepApproversWithRecords(step, org, stepRecords, doc, assets)
      const passed = new Set(agreed.map(a => a.approverId))
      if (approvers.length && approvers.some(u => !passed.has(u.id))) {
        return { index: i, step, records: stepRecords }
      }
    }
  }
  return null
}

/**
 * 环节状态：已通过 / 已驳回 / 待审批 / 未开始
 */
export function stepState(step, approvals, org, current) {
  const records = (approvals || []).filter(a => a.stepKey === step.key)
  const agreed = records.filter(a => a.result === 'AGREE')
  const rejected = records.filter(a => a.result === 'REJECT')
  if (current && current.step && current.step.key === step.key) {
    return rejected.length ? 'REJECTED' : 'PENDING'
  }
  if (agreed.length) return 'DONE'
  if (rejected.length) return 'REJECTED'
  return 'WAITING'
}

/** 当前登录用户是否可以提交该单据（创建人，或流程发起人角色持有者） */
export function canSubmit(doc, flow, user, org) {
  const orgStore = org || useOrgStore()
  const me = user || useUserStore().user
  if (!me || !doc) return false
  if (doc.creatorId && doc.creatorId === me.id) return true
  const roleId = (flow && flow.initiatorRoleId) || roleIdByName(flow && flow.initiator, orgStore)
  if (roleId && (me.roleIds || []).includes(roleId)) return true
  return false
}

/** 当前登录用户是否可以审批该环节（records 传入后按加签/转办后的实际审批人判定） */
export function canApprove(step, user, org, records = [], doc = null, assets = []) {
  const me = user || useUserStore().user
  if (!me || !step) return false
  return stepApproversWithRecords(step, org, records, doc, assets).some(u => u.id === me.id)
}

/** 环节的展示信息（角色名 / 方式 / 条件） */
export function stepInfo(step, org) {
  const orgStore = org || useOrgStore()
  const role = orgStore.roles.find(r => r.id === stepRoleId(step, orgStore))
  return {
    roleName: role ? role.name : (step.approver || '未指定'),
    modeText: MODE_TEXT[step.mode] || step.mode || '或签',
    conditionText: step.conditionType && step.conditionType !== 'NONE'
      ? (CONDITION_TEXT[step.conditionType] || step.conditionType) +
        (step.conditionType === 'AMOUNT_GT' ? ' ' + Number(step.conditionValue || 0) + ' 元' : '')
      : ''
  }
}
/**
 * 执行审批动作
 * @param {object} p
 * @param {object} p.doc          单据（会被更新 status/finishTime）
 * @param {string} p.docKey       单据类型（inbound/dispose/…）
 * @param {string} p.bizType      审批业务类型
 * @param {string} p.action       submit | approve | reject | revoke | addSign | transfer | cc
 * @param {string} [p.comment]    审批意见
 * @param {string} [p.targetUserId] 加签 / 转办 / 抄送的目标人员 ID
 * @param {object} [p.ctx]        条件上下文：{ amount, hasDiff }
 * @param {Function} [p.saveDoc]  持久化单据的回调
 * @param {Function} [p.saveApproval] 持久化审批记录的回调（默认直接写集合）
 * @param {Array} [p.flows]       流程集合
 * @param {Array} [p.approvals]   已有审批记录
 */
export async function runApproval(p) {
  const {
    doc, docKey, bizType, action, comment = '', ctx = {},
    saveDoc, saveApproval, flows = [], approvals = [], assets = []
  } = p

  // 后端模式下把整个审批动作交给服务端完成：状态推进 + 轨迹落库在一次请求内原子完成，
  // 避免前端「先写轨迹再改状态」两次写入导致轨迹缺失或重复。
  if (dataMode === 'api') {
    const data = await httpService.approvalAction(
      { docKey, docId: doc.id, bizType, action, comment, ctx, targetUserId: p.targetUserId })
    doc.status = data.status
    // 协作动作不关闭审批弹窗，需要把服务端新写入的轨迹拉回来，界面才能显示新的审批人
    if (isCollabAction(action)) await useApprovalStore().load(true).catch(() => {})
    return { ok: true, status: data.status, message: data.message }
  }

  const org = useOrgStore()
  const me = useUserStore().user
  if (!doc || !me) return { ok: false, message: '未登录或单据不存在' }

  const flow = getFlow(bizType, flows)
  if (!flow) return { ok: false, message: '该业务类型没有启用的审批流程，请先在「系统管理 → 流程配置」中配置' }

  const steps = effectiveSteps(flow, ctx)
  const docApprovals = approvalsOf(approvals, docKey, doc.id)
  const cur = currentStep(steps, docApprovals, org, doc, assets)
  const roleNameOf = step => (step ? ((org.roles.find(r => r.id === stepRoleId(step, org)) || {}).name || '') : '')

  const pushRecord = async record => {
    const row = { id: nextRecordId(), ...record }
    if (saveApproval) return saveApproval(row)
    return dataService.create(COLLECTION.docApprovals, row)
  }
  const base = {
    docKey,
    docId: doc.id,
    docCode: doc.code || doc.docNo || '',
    bizType,
    flowId: flow.id,
    flowCode: flow.code,
    approverId: me.id,
    approverName: me.name,
    approverRoleName: roleNameOf(cur && cur.step),
    time: new Date().toISOString()
  }

  if (action === 'submit') {
    if (doc.status !== 'DRAFT' && doc.status !== 'REJECTED') {
      return { ok: false, message: '只有草稿或已驳回的单据可以提交审批' }
    }
    if (!canSubmit(doc, flow, me, org)) return { ok: false, message: '只有单据创建人或流程发起人角色可以提交' }
    if (!steps.length) return { ok: false, message: '该流程没有可用环节，请检查流程配置' }
    await pushRecord({ ...base, stepKey: '', stepName: '提交申请', result: 'SUBMIT', comment })
    const next = { ...doc, status: 'PROCESSING', finishTime: '', creatorId: doc.creatorId || me.id }
    if (saveDoc) await saveDoc(next)
    return { ok: true, status: 'PROCESSING', message: '已提交审批' }
  }

  if (action === 'revoke') {
    if (doc.status !== 'PROCESSING') return { ok: false, message: '只有审批中的单据可以撤销' }
    if (!canSubmit(doc, flow, me, org)) return { ok: false, message: '只有单据创建人或流程发起人角色可以撤销' }
    await pushRecord({ ...base, stepKey: '', stepName: '撤销申请', result: 'REVOKE', comment })
    const next = { ...doc, status: 'REVOKED', finishTime: new Date().toISOString() }
    if (saveDoc) await saveDoc(next)
    return { ok: true, status: 'REVOKED', message: '单据已撤销' }
  }

  // 加签 / 转办 / 抄送：只写轨迹，不推进单据状态（与后端 ApprovalService#collaborate 保持一致）
  if (isCollabAction(action)) {
    if (doc.status !== 'PROCESSING') return { ok: false, message: '只有审批中的单据可以加签、转办或抄送' }
    const target = p.targetUserId
    if (!target) return { ok: false, message: '请选择目标人员' }
    if (target === me.id) return { ok: false, message: '目标人员不能是自己' }
    const targetUser = (org.users || []).find(u => u.id === target)
    if (!targetUser) return { ok: false, message: '目标人员不存在' }
    if (targetUser.status !== 'ENABLED') return { ok: false, message: '目标人员已停用，不能接收审批任务' }
    const cc = action === 'cc'
    if (!cur && !cc) return { ok: false, message: '该单据已无待审环节，不能加签或转办' }
    const isApprover = cur ? canApprove(cur.step, me, org, docApprovals, doc, assets) : false
    if (!isApprover && !(cc && doc.creatorId === me.id)) {
      return { ok: false, message: '只有当前环节的审批人可以执行该动作（抄送还允许单据创建人）' }
    }
    if (!cc && canApprove(cur.step, targetUser, org, docApprovals, doc, assets)) {
      return { ok: false, message: '该人员已是当前环节的审批人' }
    }
    const result = action === 'addSign' ? 'ADD_SIGN' : action === 'transfer' ? 'TRANSFER' : 'CC'
    await pushRecord({
      ...base,
      stepKey: cur ? cur.step.key : '',
      stepName: cur ? cur.step.name : '抄送',
      result,
      comment,
      targetUserId: target
    })
    const targetName = targetUser.name || targetUser.username
    return {
      ok: true,
      status: doc.status,
      message: action === 'addSign' ? `已加签给「${targetName}」`
        : action === 'transfer' ? `已转办给「${targetName}」`
        : `已抄送给「${targetName}」`
    }
  }

  if (doc.status !== 'PROCESSING') return { ok: false, message: '只有审批中的单据可以审批' }
  if (!cur) {
    if (saveDoc) await saveDoc({ ...doc, status: 'DONE', finishTime: new Date().toISOString() })
    return { ok: true, status: 'DONE', message: '审批已全部通过' }
  }
  if (!canApprove(cur.step, me, org, docApprovals, doc, assets)) {
    const who = stepApproversWithRecords(cur.step, org, docApprovals, doc, assets).map(u => u.name).join('、')
    return { ok: false, message: '当前环节「' + cur.step.name + '」需要由「' + (who || roleNameOf(cur.step) || cur.step.approver) + '」审批' }
  }

  if (action === 'reject') {
    if (!comment) return { ok: false, message: '驳回必须填写意见' }
    await pushRecord({ ...base, stepKey: cur.step.key, stepName: cur.step.name, result: 'REJECT', comment })
    const next = { ...doc, status: 'REJECTED', finishTime: new Date().toISOString() }
    if (saveDoc) await saveDoc(next)
    return { ok: true, status: 'REJECTED', message: '已驳回' }
  }

  if (action === 'approve') {
    await pushRecord({ ...base, stepKey: cur.step.key, stepName: cur.step.name, result: 'AGREE', comment })
    const after = currentStep(steps, [...docApprovals, { stepKey: cur.step.key, result: 'AGREE', approverId: me.id }], org, doc, assets)
    const done = !after
    const next = { ...doc, status: done ? 'DONE' : 'PROCESSING', finishTime: done ? new Date().toISOString() : '' }
    if (saveDoc) await saveDoc(next)
    return {
      ok: true,
      status: next.status,
      message: done ? '审批已全部通过，单据完结' : ('已通过「' + cur.step.name + '」，等待下一环节审批')
    }
  }

  return { ok: false, message: '不支持的审批动作：' + action }
}

/** 单据的审批进度（供界面展示） */
export function progressOf(doc, docKey, bizType, flows, approvals, org, ctx = {}, assets = []) {
  const flow = getFlow(bizType, flows)
  if (!flow) return { flow: null, steps: [], current: null, records: [] }
  const steps = effectiveSteps(flow, ctx)
  const records = approvalsOf(approvals, docKey, doc.id)
  const cur = currentStep(steps, records, org, doc, assets)
  return { flow, steps, current: cur, records }
}