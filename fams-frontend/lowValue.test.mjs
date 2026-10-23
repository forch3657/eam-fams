/**
 * 低值资产库存语义测试
 *
 * 验证"审批通过后才扣库存"这一核心语义：
 * 草稿不动库存 → 提交预占可用量 → 审批通过才真正扣减/回补 → 驳回撤销释放预占。
 *
 * 运行：node --experimental-loader ./.test-loader.mjs ./lowValue.test.mjs
 */
import { createPinia, setActivePinia } from 'pinia'
import { registerAllSeeds } from './src/services/mock/seed/index.js'
import { dataService } from './src/services/index.js'
import { useOrgStore } from './src/store/org.js'
import { useUserStore } from './src/store/user.js'
import { useApprovalStore } from './src/store/approval.js'
import { useLowValueAssetStore } from './src/store/lowValueAsset.js'
import { runApproval } from './src/services/approval.js'

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
await org.loadAll()
await approval.load()
await lv.loadAll()

const approvals = []
const saveApproval = async row => { approvals.push(row); return row }

async function login(username) {
  const res = await user.login(username, '123456')
  if (!res.ok) throw new Error(`登录失败：${username}`)
}

/** 引擎里的真实库存（权威账） */
async function stockOf(itemId) {
  const item = await dataService.get('low-value-items', itemId)
  return { stock: Number(item.stock || 0), reserved: Number(item.reserved || 0) }
}

/** 走一次审批动作（与页面逻辑一致） */
async function act(doc, kind, action, comment = '') {
  const bizType = kind === 'return' ? 'LV_RETURN' : 'REQUISITION'
  let target = null
  const res = await runApproval({
    doc,
    docKey: kind,
    bizType,
    action,
    comment,
    ctx: { amount: Number(doc.amount || 0), hasDiff: false },
    flows: approval.flows,
    approvals,
    saveDoc: async next => {
      const patch = { ...next }
      if (!patch.submitTime) patch.submitTime = new Date().toISOString()
      if (patch.status === 'DONE' && !patch.settleTime) patch.settleTime = new Date().toISOString()
      target = kind === 'return'
        ? await lv.updateReturnDoc(doc.id, patch)
        : await lv.updateRequisitionDoc(doc.id, patch)
      // 引擎/store 落库后回写本地单据对象，保持测试断言与页面一致
      if (target) Object.assign(doc, target)
    },
    saveApproval
  })
  return { res, target }
}

const ITEM = 'DZ08' // 白色复印纸，种子库存 135

// ---------------------------------------------------------------- 1. 草稿不动库存
const before = await stockOf(ITEM)
await login('wangqiang') // 资产使用人（发起人）
const draft = await lv.addRequisition({
  itemId: ITEM, quantity: 10, receiver: '王强', deptId: 'D3',
  requisitionDate: '2026-10-20', purpose: '日常办公', operator: '王强'
})
eq(draft.status, 'DRAFT', '新建领用单应为草稿')
const afterDraft = await stockOf(ITEM)
eq(afterDraft.stock, before.stock, '草稿不应扣减库存')
eq(afterDraft.reserved, before.reserved, '草稿不应占用库存')
eq(lv.availableStock(ITEM), before.stock, '草稿时可用量不变')

// ---------------------------------------------------------------- 2. 提交 → 预占可用量
let { res } = await act(draft, 'requisition', 'submit', '提交领用审批')
ok(res.ok, '提交领用审批失败：' + res.message)
eq(draft.status, 'PROCESSING', '提交后状态')
const afterSubmit = await stockOf(ITEM)
eq(afterSubmit.stock, before.stock, '审批中不应扣减库存')
eq(afterSubmit.reserved, before.reserved + 10, '审批中应预占 10')
eq(lv.availableStock(ITEM), before.stock - 10, '审批中可用量应减少 10')

// ---------------------------------------------------------------- 3. 第一环节通过：仍不结算
await login('chengang') // 部门主管
res = (await act(draft, 'requisition', 'approve', '同意')).res
ok(res.ok, '部门主管审批失败：' + res.message)
const afterStep1 = await stockOf(ITEM)
eq(afterStep1.stock, before.stock, '第一环节通过后仍不扣库存')
eq(afterStep1.reserved, before.reserved + 10, '第一环节通过后仍占用')

// ---------------------------------------------------------------- 4. 最后环节通过：真正扣减
await login('cangguan') // 仓管员
res = (await act(draft, 'requisition', 'approve', '出库确认')).res
ok(res.ok, '仓管员审批失败：' + res.message)
eq(draft.status, 'DONE', '全部通过后状态')
const afterDone = await stockOf(ITEM)
eq(afterDone.stock, before.stock - 10, '审批通过后才扣减库存')
eq(afterDone.reserved, before.reserved, '结算后应释放占用')

// ---------------------------------------------------------------- 5. 驳回释放预占
const draft2 = await lv.addRequisition({
  itemId: ITEM, quantity: 5, receiver: '王强', deptId: 'D3',
  requisitionDate: '2026-10-20', purpose: '测试驳回', operator: '王强'
})
await act(draft2, 'requisition', 'submit', '提交')
const mid2 = await stockOf(ITEM)
eq(mid2.reserved, afterDone.reserved + 5, '驳回前应预占 5')
await login('chengang')
res = (await act(draft2, 'requisition', 'reject', '用途不符')).res
ok(res.ok, '驳回失败：' + res.message)
eq(draft2.status, 'REJECTED', '驳回后状态')
const afterReject = await stockOf(ITEM)
eq(afterReject.stock, afterDone.stock, '驳回不应影响库存')
eq(afterReject.reserved, afterDone.reserved, '驳回应释放预占')

// ---------------------------------------------------------------- 6. 撤销释放预占
await login('wangqiang')
const draft3 = await lv.addRequisition({
  itemId: ITEM, quantity: 3, receiver: '王强', deptId: 'D3',
  requisitionDate: '2026-10-20', purpose: '测试撤销', operator: '王强'
})
await act(draft3, 'requisition', 'submit', '提交')
eq((await stockOf(ITEM)).reserved, afterReject.reserved + 3, '撤销前应预占 3')
res = (await act(draft3, 'requisition', 'revoke', '不需要了')).res
ok(res.ok, '撤销失败：' + res.message)
eq(draft3.status, 'REVOKED', '撤销后状态')
const afterRevoke = await stockOf(ITEM)
eq(afterRevoke.stock, afterReject.stock, '撤销不应影响库存')
eq(afterRevoke.reserved, afterReject.reserved, '撤销应释放预占')

// ---------------------------------------------------------------- 7. 入库单即时生效
const beforeIn = await stockOf(ITEM)
const inbound = await lv.addInbound({
  itemId: ITEM, quantity: 20, supplier: '得力办公旗舰店',
  inboundDate: '2026-10-20', operator: '孟海涛'
})
eq(inbound.status, 'DONE', '入库单应直接生效')
eq((await stockOf(ITEM)).stock, beforeIn.stock + 20, '入库应立即回补库存')

// ---------------------------------------------------------------- 8. 退库：草稿不回补，通过后回补
// 种子：领用 50、退库 15（均已生效）→ 已领未退 35；本次已完成领用 10 → 45
const issued = lv.issuedQuantity(ITEM)
eq(issued, 45, '已领未退数量口径')
const beforeRet = await stockOf(ITEM)
const retDraft = await lv.addReturn({
  itemId: ITEM, quantity: 5, returner: '王强', deptId: 'D3',
  returnDate: '2026-10-20', reason: '过量领用退回', operator: '王强'
})
eq(retDraft.status, 'DRAFT', '新建退库单应为草稿')
eq((await stockOf(ITEM)).stock, beforeRet.stock, '退库草稿不应回补库存')
eq(lv.returnableQuantity(ITEM), issued, '草稿不占用可退额度')

await act(retDraft, 'return', 'submit', '提交退库审批')
eq(retDraft.status, 'PROCESSING', '退库提交后状态')
eq(lv.returnableQuantity(ITEM), issued - 5, '审批中退库应占用可退额度')
eq((await stockOf(ITEM)).stock, beforeRet.stock, '退库审批中不回补库存')

await login('chengang')
res = (await act(retDraft, 'return', 'approve', '同意')).res
ok(res.ok, '退库第一环节审批失败：' + res.message)
await login('cangguan')
res = (await act(retDraft, 'return', 'approve', '验收入库')).res
ok(res.ok, '退库第二环节审批失败：' + res.message)
eq(retDraft.status, 'DONE', '退库全部通过后状态')
eq((await stockOf(ITEM)).stock, beforeRet.stock + 5, '退库审批通过后才回补库存')

// ---------------------------------------------------------------- 9. 超额退库被拦截
let threw = false
try {
  await lv.addReturn({
    itemId: ITEM, quantity: 999, returner: '王强', deptId: 'D3',
    returnDate: '2026-10-20', reason: '超额', operator: '王强'
  })
} catch (e) { threw = true }
ok(threw, '超过可退额度的退库单应被拦截')

// ---------------------------------------------------------------- 10. 超量领用被拦截
threw = false
try {
  await lv.addRequisition({
    itemId: 'DZ01', quantity: 50, receiver: '王强', deptId: 'D3',
    requisitionDate: '2026-10-20', purpose: '超量', operator: '王强'
  })
} catch (e) { threw = true }
ok(threw, '超过可用库存的领用单应被拦截')

// ---------------------------------------------------------------- 11. 并发占用：两张审批中的单据不会超领
await login('wangqiang')
const d1 = await lv.addRequisition({
  itemId: 'DZ03', quantity: 15, receiver: '王强', deptId: 'D3',
  requisitionDate: '2026-10-20', purpose: '并发1', operator: '王强'
})
await act(d1, 'requisition', 'submit', '提交')
let blocked = false
try {
  await lv.addRequisition({
    itemId: 'DZ03', quantity: 10, receiver: '刘洋', deptId: 'D4',
    requisitionDate: '2026-10-20', purpose: '并发2', operator: '刘洋'
  })
} catch (e) { blocked = true }
ok(blocked, '审批中单据占用的库存不应被重复领用')

// ---------------------------------------------------------------- 12. 统计口径：只算已生效
const stats = lv.stats
ok(stats.requisitionQuantity >= 50, '领用统计应包含已生效单据')
ok(stats.requisitionPendingQuantity >= 15, '在途领用数量应单独统计')

// ---------------------------------------------------------------- 输出
console.log(`\n低值库存语义测试：通过 ${pass} 项，失败 ${fails.length} 项`)
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log('全部通过 ✅')
