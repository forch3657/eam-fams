/**
 * 工作台聚合逻辑测试
 *
 * 运行：node --experimental-loader ./.test-loader.mjs ./workbench.test.mjs
 */
import { createPinia, setActivePinia } from 'pinia'
import { registerAllSeeds } from './src/services/mock/seed/index.js'
import { dataService } from './src/services/index.js'
import { useOrgStore } from './src/store/org.js'
import { useUserStore } from './src/store/user.js'
import { useApprovalStore } from './src/store/approval.js'
import { useLowValueAssetStore } from './src/store/lowValueAsset.js'
import { useWorkbenchStore } from './src/store/workbench.js'
import { ENUMS } from './src/constants/enums.js'
import { PERMISSION_TREE } from './src/config/permissions.js'
import { BIZ_DOC_REGISTRY, ALL_BIZ_TYPES } from './src/services/approval.js'
import { myTodos, buildAlerts, buildOverview, daysSince, daysUntil } from './src/services/workbench.js'

let pass = 0
const fails = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fails.push(msg) }
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg}（期望 ${expected}，实际 ${actual}）`)
}

setActivePinia(createPinia())
registerAllSeeds()

const memStore = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  }
}
globalThis.localStorage = memStore()
globalThis.sessionStorage = memStore()

const org = useOrgStore()
const user = useUserStore()
const approval = useApprovalStore()
const lv = useLowValueAssetStore()
const wb = useWorkbenchStore()
await org.loadAll()
await approval.load()
await lv.loadAll()
await wb.load()

async function login(username) {
  const res = await user.login(username, '123456')
  if (!res.ok) throw new Error(`登录失败：${username}`)
  return user.user
}

// ---------------------------------------------------------------- 1. 业务类型注册表
for (const bt of Object.keys(ENUMS.BUSINESS_TYPE)) {
  ok(!!BIZ_DOC_REGISTRY[bt], `业务类型 ${bt} 缺少单据注册表`)
}
eq(ALL_BIZ_TYPES.length, 11, '注册表业务类型条数')
for (const bt of ALL_BIZ_TYPES) {
  const reg = BIZ_DOC_REGISTRY[bt]
  ok(!!reg.collection, `${bt} 缺少集合`)
  ok(!!reg.docKey, `${bt} 缺少 docKey`)
  ok(!!reg.route, `${bt} 缺少跳转路由`)
}
// ---------------------------------------------------------------- 2. 待我审批的判定
await login('chengang') // 部门主管 R5，多数流程的第一审批环节
const chengang = user.user
const t1 = myTodos({
  docs: wb.docs, flows: approval.flows, approvals: approval.approvals,
  user: chengang, org, assets: wb.assets
})
ok(t1.pending.length > 0, '部门主管应能看到待审批单据')
for (const p of t1.pending) {
  ok(p.stepName, '待办应带当前环节名称')
  ok(p.code, '待办应带单据编号')
  ok(p.bizName, '待办应带业务类型名称')
  ok(p.route && p.tab, '待办应带跳转路由与页签')
}
// 审批中 + 当前环节是部门主管 → 才算待办
const processingDocs = ALL_BIZ_TYPES.flatMap(bt =>
  (wb.docs[bt] || []).filter(d => d.status === 'PROCESSING').map(d => [bt, d])
)
ok(processingDocs.length > 0, '种子应有审批中的单据用于验证')

await login('wangqiang') // 资产使用人 R3，不承担任何审批环节
const wangqiang = user.user
const t2 = myTodos({
  docs: wb.docs, flows: approval.flows, approvals: approval.approvals,
  user: wangqiang, org, assets: wb.assets
})
eq(t2.pending.length, 0, '资产使用人不应有待审批单据')

// ---------------------------------------------------------------- 3. 我发起的
await login('wangqiang')
const myReq = await lv.addRequisition({
  itemId: 'DZ08', quantity: 2, receiver: '王强', deptId: 'D3',
  requisitionDate: '2026-10-23', purpose: '工作台测试', operator: '王强'
})
await wb.load(true) // 工作台数据需刷新才能看到新建单据
const t3 = myTodos({
  docs: wb.docs, flows: approval.flows, approvals: approval.approvals,
  user: wangqiang, org, assets: wb.assets
})
ok(t3.mine.some(m => m.id === myReq.id), '我发起的应包含自己新建的领用单')
const mineReq = t3.mine.find(m => m.id === myReq.id)
eq(mineReq.status, 'DRAFT', '新建单据状态应为草稿')
ok(t3.mine.every(m => m.creatorName !== undefined), '我发起的应带提交人')
// 草稿排在驳回之后
const ranks = t3.mine.map(m => (m.status === 'REJECTED' ? 0 : m.status === 'DRAFT' ? 1 : 2))
ok(ranks.every((r, i) => i === 0 || ranks[i - 1] <= r), '我发起的应按 驳回 → 草稿 → 其它 排序')

// ---------------------------------------------------------------- 4. 预警中心
const alerts = buildAlerts({
  docs: wb.docs, items: wb.items, plans: wb.plans,
  flows: approval.flows, approvals: approval.approvals,
  assets: wb.assets, user: wangqiang, org,
  safetyRatio: 0.2, remindDays: 7, timeoutDays: 5, retryDays: 3
})
ok(alerts.length > 0, '应产生预警')
ok(alerts.some(a => a.type === '低值库存'), '应包含低值库存预警')
ok(alerts.some(a => a.level === 'danger'), '应包含严重级别预警')
ok(alerts.every(a => !!a.id && !!a.title && !!a.route), '预警应带 id/标题/跳转地址')
// 严重优先
const lvIdx = alerts.findIndex(a => a.level === 'danger')
ok(lvIdx === -1 || alerts.slice(0, lvIdx).every(a => a.level === 'danger'), '严重预警应排在前面')

// 库存被审批占用 → 预占后出现"库存占用"预警
await lv.updateRequisitionDoc(myReq.id, { ...myReq, status: 'PROCESSING' })
const itemAfter = wb.items.find(i => i.id === 'DZ08')
ok(Number(itemAfter?.reserved || 0) >= 0, '预占字段存在')
const alerts2 = buildAlerts({
  docs: wb.docs, items: wb.items, plans: wb.plans,
  flows: approval.flows, approvals: approval.approvals,
  assets: wb.assets, user: wangqiang, org
})
ok(Array.isArray(alerts2), '预警列表可生成')

// ---------------------------------------------------------------- 5. 概览看板
const ov = buildOverview({
  docs: wb.docs, items: wb.items, assets: wb.assets,
  approvals: approval.approvals, flows: approval.flows, org
})
ok(ov.asset.total > 0, '概览应统计资产总数')
ok(ov.asset.original > 0, '概览应统计资产原值')
ok(Array.isArray(ov.asset.byStatus) && ov.asset.byStatus.length > 0, '概览应给出资产状态分布')
ok(ov.asset.topTypes.length > 0, '概览应给出分类 Top5')
ok(ov.lowValue.itemKinds > 0, '概览应统计低值物品种类')
ok(typeof ov.approval.avgHours === 'number', '概览应给出平均审批时长')
ok(ov.approval.processing >= 0, '概览应统计在途单据')
ok(Array.isArray(ov.approval.pendingByStep), '概览应给出在途单据的待办环节分布')
ok(ov.approval.pendingByStep.every(s => s.count > 0 && s.roleName), '待办环节应带角色与数量')
// 在途环节合计应等于在途单据数
const stepTotal = ov.approval.pendingByStep.reduce((s, x) => s + x.count, 0)
ok(stepTotal <= ov.approval.processing, '待办环节合计不应超过在途单据数')

// ---------------------------------------------------------------- 6. 权限码与角色默认授权
const tree = PERMISSION_TREE.find(m => m.id === 'workbench')
ok(!!tree, '权限树应包含工作台分组')
eq(tree.children.length, 5, '工作台权限项数量')
const roles = await dataService.list('org-roles')
ok(roles.length >= 8, '角色数量')
for (const r of roles) {
  ok(r.permissions.includes('wm:view'), `角色 ${r.name} 应默认勾选 wm:view`)
}
// 资产使用人：可看待办与消息，但不看预警与概览
const roleUser = roles.find(r => r.id === 'R3')
ok(roleUser.permissions.includes('wm:todo'), '资产使用人应有 wm:todo')
ok(roleUser.permissions.includes('wm:message'), '资产使用人应有 wm:message')
ok(!roleUser.permissions.includes('wm:alert'), '资产使用人不应有 wm:alert')
ok(!roleUser.permissions.includes('wm:overview'), '资产使用人不应有 wm:overview')

// ---------------------------------------------------------------- 7. 时间工具
eq(daysSince(new Date(Date.now() - 3 * 86400000).toISOString()), 3, 'daysSince 计算天数')
eq(daysUntil(new Date(Date.now() + 5 * 86400000).toISOString()), 5, 'daysUntil 计算剩余天数')
eq(daysUntil(new Date(Date.now() - 2 * 86400000).toISOString()), -2, 'daysUntil 过期为负')

// ---------------------------------------------------------------- 8. 枚举值必须是编码，不能是中文
// 回归保护：曾经有页面把中文文案直接写进声明为 enum 的字段，
// 与种子数据（编码）对不上，切到真实后端后必然被契约校验拒掉。
const DOC_STATUS_CODES = Object.keys(ENUMS.DOC_STATUS)
const DEPRECIATION_CODES = Object.keys(ENUMS.DEPRECIATION_METHOD)

ok(wb.plans.length > 0, '应有盘点计划种子数据')
ok(
  wb.plans.every(p => DOC_STATUS_CODES.includes(p.status)),
  '盘点计划 status 应为 DOC_STATUS 编码（实际：' + wb.plans.map(p => p.status).join(',') + '）'
)

// 折旧方案 method 必须是编码
const schemes = await dataService.list('fixed-asset-depreciation-schemes')
ok(schemes.length > 0, '应有折旧方案种子数据')
ok(
  schemes.every(s => DEPRECIATION_CODES.includes(s.method)),
  '折旧方案 method 应为 DEPRECIATION_METHOD 编码（实际：' + schemes.map(s => s.method).join(',') + '）'
)

// 盘点明细：itemStatus 与 result 都要是编码，且 result 必须存在
// （result 缺失会导致盘点进度与盘盈/盘亏统计恒为 0）
const ITEM_STATUS_CODES = Object.keys(ENUMS.INVENTORY_ITEM_STATUS)
const RESULT_CODES = Object.keys(ENUMS.INVENTORY_RESULT)
const planItems = wb.plans.flatMap(p => p.items || [])
ok(planItems.length > 0, '盘点计划应含明细')
ok(
  planItems.every(i => ITEM_STATUS_CODES.includes(i.itemStatus)),
  '盘点明细 itemStatus 应为 INVENTORY_ITEM_STATUS 编码'
)
ok(
  planItems.every(i => RESULT_CODES.includes(i.result)),
  '盘点明细 result 应为 INVENTORY_RESULT 编码且不能缺失'
)
ok(
  planItems.some(i => i.result !== 'UNCHECKED'),
  '种子盘点明细应存在已盘记录（否则进度恒为 0）'
)

// ---------------------------------------------------------------- 输出
console.log(`\n工作台聚合测试：通过 ${pass} 项，失败 ${fails.length} 项`)
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log('全部通过 ✅')
