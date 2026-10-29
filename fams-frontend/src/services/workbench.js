/**
 * 工作台聚合层（只读，不落库）
 *
 * 职责：把散落在各业务页面的「单据 / 审批记录 / 库存 / 盘点计划」聚合成工作台需要的
 * 三块数据：我的待办、预警中心、概览看板。
 *
 * 约定：
 * - 审批判定全部复用 services/approval.js（getFlow / effectiveSteps / currentStep / canApprove），
 *   本层不实现任何审批规则，避免两套口径；
 * - 单据 → 业务类型的映射统一取 BIZ_DOC_REGISTRY，新增业务类型只改注册表；
 * - 演示阶段在前端聚合，接后端后由服务端提供等价接口，本层可整体替换。
 */
import {
  BIZ_DOC_REGISTRY, ALL_BIZ_TYPES,
  getFlow, effectiveSteps, approvalsOf, currentStep, canApprove, stepInfo, stepRoleId
} from './approval'
import { labelOf } from '../constants/enums'

const DAY = 24 * 60 * 60 * 1000

/** 天数差（向上取整），按天计 */
export function daysSince(time, now = new Date()) {
  if (!time) return 0
  const t = new Date(time).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.ceil((now.getTime() - t) / DAY))
}

/** 距目标日期还有几天（负数表示已过期） */
export function daysUntil(date, now = new Date()) {
  if (!date) return 999
  const t = new Date(date).getTime()
  if (!Number.isFinite(t)) return 999
  return Math.ceil((t - now.getTime()) / DAY)
}

/**
 * 单据的条件上下文
 * - 金额：固资单据取关联资产原值，低值单据取单据金额（金额门槛类环节据此生效）
 * - 差异：盘点单存在盘盈/盘亏/异常明细
 */
export function docCtx(doc, assets = []) {
  const asset = assets.find(a => a.id === doc?.assetId)
  const amount = Number(doc?.amount || asset?.original || 0)
  const items = doc?.items || []
  const hasDiff = items.some(i => i.itemStatus === 'LOSS' || i.itemStatus === 'SURPLUS' || i.itemStatus === 'ABNORMAL')
  return { amount, hasDiff }
}

/** 单据展示名：固资单据用 name，低值单据用 itemName */
export function docTitle(doc) {
  return doc?.name || doc?.itemName || doc?.planName || doc?.code || ''
}

/** 单据编号：固资用 code，低值/盘点用 docNo */
export function docCode(doc) {
  return doc?.code || doc?.docNo || doc?.planNo || ''
}
/**
 * 我的待办
 * @param {object} p
 * @param {object} p.docs      { [bizType]: rows } 各业务类型单据
 * @param {Array}  p.flows      流程配置
 * @param {Array}  p.approvals  审批记录
 * @param {object} p.user       当前登录用户
 * @param {object} p.org        组织架构 store（含 roles / users）
 * @param {Array}  p.assets     资产台账（取关联资产原值）
 * @param {number} p.timeoutDays 审批滞留超时天数
 * @param {number} p.retryDays    驳回重提期限
 */
export function myTodos(p = {}) {
  const {
    docs = {}, flows = [], approvals = [], user, org, assets = [],
    timeoutDays = 5, retryDays = 3, now = new Date()
  } = p
  const pending = []
  const mine = []
  const done = []

  if (!user) return { pending, mine, done }

  for (const bizType of ALL_BIZ_TYPES) {
    const reg = BIZ_DOC_REGISTRY[bizType]
    const rows = docs[bizType] || []
    for (const doc of rows) {
      const ctx = docCtx(doc, assets)
      const flow = getFlow(bizType, flows)
      const steps = flow ? effectiveSteps(flow, ctx) : []
      const records = approvalsOf(approvals, reg.docKey, doc.id)
      const cur = steps.length ? currentStep(steps, records, org) : null
      const base = {
        bizType,
        bizName: labelOf('BUSINESS_TYPE', bizType),
        docKey: reg.docKey,
        collection: reg.collection,
        scope: reg.scope,
        route: reg.route,
        tab: reg.tab,
        sub: reg.sub,
        doc,
        id: doc.id,
        code: docCode(doc),
        title: docTitle(doc),
        status: doc.status,
        amount: ctx.amount,
        quantity: Number(doc.quantity || 0),
        creatorName: org?.users?.find(u => u.id === doc.creatorId)?.name || doc.applicant || '',
        createdAt: doc.createTime,
        stayDays: daysSince(doc.submitTime || doc.createTime, now)
      }

      // 待我审批：单据在审批中，且当前环节的审批角色包含我的角色
      if (doc.status === 'PROCESSING' && cur && canApprove(cur.step, user, org)) {
        pending.push({
          ...base,
          stepKey: cur.step.key,
          stepName: cur.step.name,
          stepRole: stepInfo(cur.step).roleName,
          stepMode: stepInfo(cur.step).modeText,
          overdue: base.stayDays > timeoutDays
        })
      }

      // 我发起的
      if (doc.creatorId === user.id) {
        mine.push({
          ...base,
          stepName: cur ? cur.step.name : '',
          overdue: doc.status === 'REJECTED' && daysSince(doc.updateTime || doc.createTime, now) > retryDays
        })
      }
    }
  }

  // 我已处理：审批记录里我给出结论的单据（近 30 天）
  const since = now.getTime() - 30 * DAY
  const handled = approvals
    .filter(a => a.approverId === user.id && (a.result === 'AGREE' || a.result === 'REJECT'))
    .filter(a => new Date(a.time || 0).getTime() >= since)
    .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
  for (const a of handled) {
    const reg = Object.values(BIZ_DOC_REGISTRY).find(r => r.docKey === a.docKey)
    done.push({
      bizType: a.bizType,
      bizName: labelOf('BUSINESS_TYPE', a.bizType),
      docKey: a.docKey,
      scope: reg?.scope || 'fixed-asset',
      route: reg?.route || '/fixed-assets',
      tab: reg?.tab || '',
      id: a.docId,
      code: a.docCode || '',
      title: a.stepName || '',
      stepName: a.stepName || '',
      result: a.result,
      comment: a.comment || '',
      time: a.time,
      approverName: a.approverName || ''
    })
  }

  // 被驳回的单据置顶
  mine.sort((a, b) => {
    const rank = s => (s === 'REJECTED' ? 0 : s === 'DRAFT' ? 1 : 2)
    return rank(a.status) - rank(b.status) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  })
  pending.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0) || b.stayDays - a.stayDays)

  return { pending, mine, done }
}

/**
 * 预警中心
 */
export function buildAlerts(p = {}) {
  const {
    docs = {}, items = [], plans = [], flows = [], approvals = [], assets = [],
    user, org, safetyRatio = 0.2, remindDays = 7, timeoutDays = 5, retryDays = 3, now = new Date()
  } = p
  const alerts = []

  // 1. 低值库存预警（严重低库存优先）+ 2. 库存被审批占用
  for (const it of items) {
    const stock = Number(it.stock || 0)
    const safety = Number(it.safetyStock || 0)
    if (safety) {
      if (stock <= safety * safetyRatio) {
        alerts.push({
          id: `lv-critical-${it.id}`,
          level: 'danger',
          type: '低值库存',
          title: `${it.name} 库存严重不足`,
          desc: `在库 ${stock}${it.unit || ''}，安全库存 ${safety}${it.unit || ''}（低于 ${Math.round(safetyRatio * 100)}%）`,
          route: '/low-value-assets',
          tab: 'item'
        })
      } else if (stock <= safety) {
        alerts.push({
          id: `lv-low-${it.id}`,
          level: 'warning',
          type: '低值库存',
          title: `${it.name} 库存低于安全库存`,
          desc: `在库 ${stock}${it.unit || ''}，安全库存 ${safety}${it.unit || ''}`,
          route: '/low-value-assets',
          tab: 'item'
        })
      }
    }
    if (Number(it.reserved || 0) > 0) {
      alerts.push({
        id: `lv-reserved-${it.id}`,
        level: 'info',
        type: '库存占用',
        title: `${it.name} 有审批中的单据占用库存`,
        desc: `占用 ${it.reserved}${it.unit || ''}，可用量 ${stock - Number(it.reserved || 0)}${it.unit || ''}`,
        route: '/low-value-assets',
        tab: 'item'
      })
    }
  }

  // 3. 盘点到期
  for (const plan of plans) {
    if (plan.status === 'DONE' || plan.status === 'REVOKED') continue
    const left = daysUntil(plan.planDate, now)
    if (left <= remindDays) {
      alerts.push({
        id: `inv-${plan.id}`,
        level: left < 0 ? 'danger' : 'warning',
        type: '盘点到期',
        title: `盘点计划「${plan.planName}」${left < 0 ? '已逾期' : '即将到期'}`,
        desc: left < 0 ? `计划日期 ${plan.planDate}，已超期 ${Math.abs(left)} 天未完成` : `距计划日期 ${plan.planDate} 还有 ${left} 天`,
        route: '/fixed-assets',
        tab: 'inventory'
      })
    }
  }

  // 4. 单据滞留  5. 驳回未重提
  for (const bizType of ALL_BIZ_TYPES) {
    const reg = BIZ_DOC_REGISTRY[bizType]
    for (const doc of docs[bizType] || []) {
      const ctx = docCtx(doc, assets)
      const flow = getFlow(bizType, flows)
      const steps = flow ? effectiveSteps(flow, ctx) : []
      const records = approvalsOf(approvals, reg.docKey, doc.id)
      const cur = steps.length ? currentStep(steps, records, org) : null
      const code = docCode(doc)

      if (doc.status === 'PROCESSING') {
        const stay = daysSince(doc.submitTime || doc.createTime, now)
        if (stay > timeoutDays) {
          alerts.push({
            id: `stall-${reg.collection}-${doc.id}`,
            level: 'warning',
            type: '审批滞留',
            title: `${labelOf('BUSINESS_TYPE', bizType)}单 ${code} 审批滞留 ${stay} 天`,
            desc: `当前环节「${cur ? cur.step.name : '待处理'}」，已超过 ${timeoutDays} 天未处理`,
            route: reg.route,
            tab: reg.tab,
            sub: reg.sub,
            docKey: reg.docKey,
            bizType
          })
        }
      }
      if (doc.status === 'REJECTED' && doc.creatorId === user?.id) {
        const left = daysSince(doc.updateTime || doc.createTime, now)
        if (left > retryDays) {
          alerts.push({
            id: `rejected-${reg.collection}-${doc.id}`,
            level: 'warning',
            type: '驳回未重提',
            title: `${labelOf('BUSINESS_TYPE', bizType)}单 ${code} 被驳回后 ${left} 天未重新提交`,
            desc: '请修改后重新提交审批',
            route: reg.route,
            tab: reg.tab,
            sub: reg.sub,
            docKey: reg.docKey,
            bizType
          })
        }
      }
    }
  }

  const rank = { danger: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => rank[a.level] - rank[b.level])
  return alerts
}

/**
 * 概览看板
 */
export function buildOverview(p = {}) {
  const { docs = {}, items = [], assets = [], approvals = [], flows = [], org, now = new Date() } = p

  // 资产总览
  const total = assets.length
  const original = assets.reduce((s, a) => s + Number(a.original || 0), 0)
  const net = assets.reduce((s, a) => s + Number(a.net || 0), 0)
  const byStatus = {}
  assets.forEach(a => { byStatus[a.status] = (byStatus[a.status] || 0) + 1 })
  const byType = {}
  assets.forEach(a => { byType[a.category] = (byType[a.category] || 0) + 1 })
  const topTypes = Object.entries(byType)
    .map(([k, v]) => ({ name: labelOf('ASSET_CATEGORY', k), value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // 低值总览
  const itemKinds = items.length
  const stockAmount = items.reduce((s, i) => s + Number(i.stock || 0) * Number(i.price || 0), 0)
  const reservedTotal = items.reduce((s, i) => s + Number(i.reserved || 0), 0)
  // 低值物品种类 Top5：category 存的是 LOW_VALUE_CATEGORY 编码，展示前转中文
  const lowByCategory = {}
  items.forEach(i => { lowByCategory[i.category] = (lowByCategory[i.category] || 0) + 1 })
  const lowTopTypes = Object.entries(lowByCategory)
    .map(([k, v]) => ({ name: labelOf('LOW_VALUE_CATEGORY', k), value: v }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)

  // 审批时效（近 7 天）
  const since = now.getTime() - 7 * DAY
  const recent = approvals.filter(a => new Date(a.time || 0).getTime() >= since)
  const submitCount = recent.filter(a => a.result === 'SUBMIT').length
  const agreeCount = recent.filter(a => a.result === 'AGREE').length
  const rejectCount = recent.filter(a => a.result === 'REJECT').length
  const durations = []
  for (const a of recent) {
    if (a.result !== 'AGREE' && a.result !== 'REJECT') continue
    const start = approvals.find(x => x.docKey === a.docKey && x.docId === a.docId && x.result === 'SUBMIT')
    if (!start?.time) continue
    const hours = (new Date(a.time).getTime() - new Date(start.time).getTime()) / 3600000
    if (Number.isFinite(hours) && hours >= 0) durations.push(hours)
  }
  const avgHours = durations.length ? durations.reduce((s, h) => s + h, 0) / durations.length : 0

  // 在途单据（审批中）
  let processing = 0
  for (const bizType of ALL_BIZ_TYPES) {
    processing += (docs[bizType] || []).filter(d => d.status === 'PROCESSING').length
  }

  // 在途单据按"当前环节 + 审批角色"聚合：谁该审、压了多少单
  const stepAgg = new Map()
  for (const bizType of ALL_BIZ_TYPES) {
    const reg = BIZ_DOC_REGISTRY[bizType]
    for (const doc of docs[bizType] || []) {
      if (doc.status !== 'PROCESSING') continue
      const flow = getFlow(bizType, flows)
      if (!flow) continue
      const steps = effectiveSteps(flow, docCtx(doc, assets))
      const cur = currentStep(steps, approvalsOf(approvals, reg.docKey, doc.id), org)
      if (!cur) continue
      const roleId = stepRoleId(cur.step, org)
      const roleName = (org?.roles || []).find(r => r.id === roleId)?.name || '未指定角色'
      const key = `${roleId || ''}|${cur.step.name}`
      const agg = stepAgg.get(key) || {
        roleName,
        stepName: cur.step.name,
        bizName: labelOf('BUSINESS_TYPE', bizType),
        count: 0
      }
      agg.count++
      stepAgg.set(key, agg)
    }
  }
  const pendingByStep = [...stepAgg.values()].sort((a, b) => b.count - a.count)

  return {
    asset: {
      total,
      original,
      net,
      byStatus: Object.entries(byStatus).map(([k, v]) => ({ name: labelOf('ASSET_STATUS', k), value: v })),
      topTypes,
      idle: byStatus.IDLE || 0
    },
    lowValue: {
      itemKinds,
      stockAmount: Math.round(stockAmount * 100) / 100,
      reservedTotal,
      topTypes: lowTopTypes
    },
    approval: {
      submitCount,
      agreeCount,
      rejectCount,
      avgHours: Math.round(avgHours * 10) / 10,
      sampleCount: durations.length,
      processing,
      pendingByStep
    }
  }
}
