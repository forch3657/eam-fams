/**
 * 审批链自动化测试
 * 运行：node --experimental-loader ./.test-loader.mjs ./approval.test.mjs
 */
import { createPinia, setActivePinia } from 'pinia'
import { registerAllSeeds } from './src/services/mock/seed/index.js'
import { dataService } from './src/services/index.js'
import { useOrgStore } from './src/store/org.js'
import { useUserStore } from './src/store/user.js'
import { useApprovalStore } from './src/store/approval.js'
import { ENUMS } from './src/constants/enums.js'
import {
  DOC_BIZ_TYPE, getFlow, effectiveSteps, currentStep, stepApprovers, runApproval, canApprove
} from './src/services/approval.js'

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

// Node 环境没有 localStorage / sessionStorage，补一个内存实现
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
await org.loadAll()
await approval.load()

const approvals = []
/** 固资单据本身没有 dept_id，归属部门要由关联资产推导：审批人与工作台待办都依赖它 */
const mockAssets = await dataService.list('fixed-assets')
const saveApproval = async row => {
  approvals.push(row)
  return row
}
/** 引擎把新单据交给回调持久化；测试里直接回写到当前单据对象 */
let currentDoc = null
const saveDoc = async next => { Object.assign(currentDoc, next) }
/** 取某张单据的审批记录 */
const approvalsOfDoc = (docKey, docId) => approvals.filter(a => a.docKey === docKey && a.docId === docId)

async function login(username) {
  const res = await user.login(username, '123456')
  if (!res.ok) throw new Error(`登录失败：${username}`)
  return user.user
}

// ---------------------------------------------------------------- 1. 流程配置完整性
const bizTypes = Object.keys(ENUMS.BUSINESS_TYPE)
for (const bt of bizTypes) {
  const flow = getFlow(bt, approval.flows)
  ok(!!flow, `业务类型 ${bt} 没有启用的审批流程`)
}
eq(Object.keys(DOC_BIZ_TYPE).length, 11, '单据类型到业务类型的映射条数')
eq(Object.keys(ENUMS.BUSINESS_TYPE).length, 11, '审批业务类型条数')

// 纵向审批：部门负责人 / 分管领导按「单据归属部门」解析到唯一的人，
// 因此用生产部（D6）作为探针部门校验每个环节都能解析出审批人。
const probeDoc = { deptId: 'D6' }
for (const flow of approval.flows) {
  ok(Array.isArray(flow.steps) && flow.steps.length > 0, `流程 ${flow.code} 没有环节`)
  ok(!!flow.initiatorRoleId, `流程 ${flow.code} 未指定发起角色`)
  ok(org.roles.some(r => r.id === flow.initiatorRoleId), `流程 ${flow.code} 的发起角色不存在`)
  for (const s of flow.steps || []) {
    ok(org.roles.some(r => r.id === s.approverRoleId), `流程 ${flow.code} 环节「${s.name}」的审批角色不存在`)
    ok(['ANY', 'SEQUENCE', 'ALL'].includes(s.mode), `流程 ${flow.code} 环节「${s.name}」的审批方式编码非法：${s.mode}`)
    ok(['NONE', 'AMOUNT_GT', 'HAS_DIFF'].includes(s.conditionType), `流程 ${flow.code} 环节「${s.name}」的触发条件编码非法`)
    ok(stepApprovers(s, org, probeDoc).length > 0, `流程 ${flow.code} 环节「${s.name}」没有可审批的启用账号`)
  }
}

// ---------------------------------------------------------------- 2. 触发条件
const disposeFlow = getFlow('DISPOSE', approval.flows)
eq(effectiveSteps(disposeFlow, { amount: 1000 }).length, 1, '小金额处置单只生效 1 个环节')
eq(effectiveSteps(disposeFlow, { amount: 385000 }).length, 4, '大金额处置单生效 4 个环节')
const invFlow = getFlow('INVENTORY', approval.flows)
eq(effectiveSteps(invFlow, { hasDiff: false }).length, 1, '无差异盘点单只生效 1 个环节')
eq(effectiveSteps(invFlow, { hasDiff: true }).length, 3, '有差异盘点单生效 3 个环节')

// ---------------------------------------------------------------- 3. 会签：全部通过才推进
const allSteps = [{ key: 'x1', name: '会签环节', approverRoleId: 'R5', mode: 'ALL' }]
const allMembers = stepApprovers(allSteps[0], org)
const oneAgree = [{ stepKey: 'x1', result: 'AGREE', approverId: allMembers[0].id }]
ok(!!currentStep(allSteps, oneAgree, org), '会签只通过 1 人时不应推进')
const allAgree = allMembers.map(u => ({ stepKey: 'x1', result: 'AGREE', approverId: u.id }))
eq(currentStep(allSteps, allAgree, org), null, '会签全部通过后应推进')

// ---------------------------------------------------------------- 4. 完整审批链（处置 4 环节）
// 资产 A05 属生产部 D6：部门负责人=陈刚 U7，分管领导=马文远 U18
const doc = await dataService.create('fixed-asset-doc-lists-dispose', {
  code: 'CZTEST9001',
  name: '自动化测试处置单',
  companyId: 'C1',
  assetId: 'A05',
  creatorId: 'U17',
  createTime: new Date().toISOString(),
  finishTime: '',
  remark: '审批链测试',
  status: 'DRAFT'
})
const ctx = { amount: 385000, hasDiff: false }
currentDoc = doc

await login('asset') // U17 资产管理员（单据创建人 + 流程发起角色）
let res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'submit', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '提交审批失败：' + res.message)
eq(doc.status, 'PROCESSING', '提交后单据状态')
eq(approvals.length, 1, '提交后审批记录条数')

// 非当前环节角色不能审批
await login('wangqiang') // U4 资产使用人
res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'approve', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(!res.ok, '资产使用人不应能审批处置单')

// 第一环节：归属部门的负责人（纵向审批：别的部门主管不行）
await login('chengang') // U7 生产部负责人
res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'approve', comment: '同意', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '部门负责人审批失败：' + res.message)
eq(currentStep(effectiveSteps(disposeFlow, ctx), approvalsOfDoc('dispose', doc.id), org, doc, mockAssets).step.key, 's2', '通过后应进入财务复核')

// 第二环节：财务管理员
await login('lina') // U3 财务管理员
res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'approve', comment: '金额核对无误', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '财务复核失败：' + res.message)
eq(currentStep(effectiveSteps(disposeFlow, ctx), approvalsOfDoc('dispose', doc.id), org, doc, mockAssets).step.key, 's3', '通过后应进入分管副总审批')

// 第三环节：分管领导（纵向审批：别的部门分管副总不行）
await login('fuzong') // U18 分管副总
res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'approve', comment: '同意处置', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '分管领导审批失败：' + res.message)
eq(currentStep(effectiveSteps(disposeFlow, ctx), approvalsOfDoc('dispose', doc.id), org, doc, mockAssets).step.key, 's4', '通过后应进入审计备案')

// 第四环节：审计员
await login('chenjing') // U13 审计员
res = await runApproval({
  doc, docKey: 'dispose', bizType: 'DISPOSE', action: 'approve', comment: '已备案', ctx,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '审计备案失败：' + res.message)
eq(doc.status, 'DONE', '全部通过后单据应完结')
eq(approvals.length, 5, '完结时的审批记录条数')

// ---------------------------------------------------------------- 5. 驳回 → 重提 → 再驳回
// 资产 A01 属技术部 D1：部门负责人=张伟 U2（纵向审批：只有他本人能批）
const doc2 = await dataService.create('fixed-asset-doc-lists-borrow', {
  code: 'JCTEST9001', name: '自动化测试借出单', companyId: 'C1', assetId: 'A01',
  creatorId: 'U4', createTime: new Date().toISOString(), finishTime: '', remark: '', status: 'DRAFT'
})
const ctx2 = { amount: 8500, hasDiff: false }
currentDoc = doc2
await login('wangqiang') // U4 资产使用人（发起角色 R3）
res = await runApproval({
  doc: doc2, docKey: 'borrow', bizType: 'BORROW', action: 'submit', ctx: ctx2,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '借出单提交失败：' + res.message)

await login('zhangwei')
res = await runApproval({
  doc: doc2, docKey: 'borrow', bizType: 'BORROW', action: 'reject', comment: '归还日期不合理', ctx: ctx2,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '驳回失败：' + res.message)
eq(doc2.status, 'REJECTED', '驳回后单据状态')

// 驳回必须填意见
await login('zhangwei')
res = await runApproval({
  doc: doc2, docKey: 'borrow', bizType: 'BORROW', action: 'reject', comment: '', ctx: ctx2,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(!res.ok, '驳回未填意见时应失败')

// 重新提交 → 应回到被驳回的环节
await login('wangqiang')
res = await runApproval({
  doc: doc2, docKey: 'borrow', bizType: 'BORROW', action: 'submit', ctx: ctx2,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '重新提交失败：' + res.message)
eq(doc2.status, 'PROCESSING', '重新提交后单据状态')
eq(currentStep(effectiveSteps(getFlow('BORROW', approval.flows), ctx2), approvalsOfDoc('borrow', doc2.id), org, doc2, mockAssets).step.key, 's1',
  '重新提交后应回到被驳回的环节')

// ---------------------------------------------------------------- 6. 撤销
await login('wangqiang')
res = await runApproval({
  doc: doc2, docKey: 'borrow', bizType: 'BORROW', action: 'revoke', comment: '不需要了', ctx: ctx2,
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval, assets: mockAssets
})
ok(res.ok, '撤销失败：' + res.message)
eq(doc2.status, 'REVOKED', '撤销后单据状态')

// ---------------------------------------------------------------- 7. 未配置流程的业务类型
res = await runApproval({
  doc: { id: 'X1', status: 'DRAFT' }, docKey: 'unknown', bizType: 'UNKNOWN', action: 'submit',
  flows: approval.flows, approvals, saveDoc: saveDoc, saveApproval
})
ok(!res.ok, '未配置流程时提交应失败')

// ---------------------------------------------------------------- 8. canApprove 判定
// 纵向审批：第一个环节是「归属部门负责人」，只有该负责人本人可批
const s1 = disposeFlow.steps[0]
const disposeProbe = { assetId: 'A05' } // 生产部 D6
ok(canApprove(s1, { id: 'U7' }, org, [], disposeProbe, mockAssets), '归属部门负责人应可审批第一环节')
ok(!canApprove(s1, { id: 'U8' }, org, [], disposeProbe, mockAssets), '其他部门主管不应可审批第一环节')
ok(!canApprove(s1, { id: 'U4' }, org, [], disposeProbe, mockAssets), '资产使用人不应可审批第一环节')
ok(!canApprove(s1, { id: 'U16' }, org, [], disposeProbe, mockAssets), '已停用账号不应可审批')

// ---------------------------------------------------------------- 输出
console.log(`\n审批链测试：通过 ${pass} 项，失败 ${fails.length} 项`)
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log('全部通过 ✅')
