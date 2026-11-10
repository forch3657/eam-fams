import { expect, test } from '@playwright/test'
import { loginViaApi } from './fixtures/auth'
import { act, suffix } from './fixtures/fixedAsset'
import { apiList, apiPost, withApi, type Row } from './fixtures/p5'
import {
  assertDeptConfigUnchanged,
  cleanupRealOrg,
  COMPANY_ID,
  DOC_PREFIX,
  HAND_DRAFT_DOC_NO,
  loadRealOrg,
  POOL,
  sessionOf,
  writeRealOrgReport,
  type RealOrgActor,
  type RealOrgContext,
  type RealOrgDept
} from './fixtures/realOrg'

/**
 * 真实组织回归（福州数据技术研究院有限公司）。
 *
 * 与 P9/P10 的区别：P9/P10 用临时账号验证「规则」，本专项用**在册真人账号 +
 * 生产部门 leader_id/vp_id + 生产流程配置**验证「这套规则在真实组织里确实能跑通」：
 * - 8 个有资产部门全覆盖，每部门一条完整真实审批链；
 * - 使用人 / 部门主管 / 分管领导 / 财务 / 仓管 / 审计全部真人登录（R2 由 admin 兜底）；
 * - 逐单断言台账状态、派生单据、审批轨迹命中真人；
 * - 部门配置、真实账号、用户手工草稿盘点单前后一致。
 *
 * 固定资产目标口径（docs/fixed-asset-business-rules.md）：
 * - 归还 = 关联原借出单的退库单（WF3），仓管验收后 BORROWED→IDLE 且清空使用人；
 * - 维修提交进入 REPAIRING，WF6 新增「修毕验收」环节后资产回 IN_USE；
 * - 变卖/捐赠/转让按处置方式强制财务 R4 + 审计 R6，服务端不采信客户端 ctx；
 * - 变更收敛为调拨/维修/信息更正，信息更正留更正前后快照。
 *
 * 只写 `E2E_ORG_` 前缀单据，afterAll 按基线差集逆序清理，绝不删真实账号。
 */

let ctx: RealOrgContext

/**
 * 环节条件上下文：金额门槛在单据未带金额字段时仍由客户端 ctx 兜底，
 * 但 disposeType / hasDiff 由服务端按单据事实覆盖，客户端无法伪造跳过环节。
 * submit 与各次 approve 必须传同一份 ctx，避免条件环节在中途漂移。
 */
const CTX_BASE = { amount: 0, hasDiff: false }
/** 触发 WF6「大额维修 > 5 万」分管副总环节 */
const CTX_LARGE_VP = { amount: 60000, hasDiff: false }
/** 伪造上下文：把转让谎报成报废、金额压到 0，服务端必须按单据事实覆盖 */
const CTX_FORGED_DISPOSE = { amount: 0, hasDiff: false, disposeType: 'SCRAP' }
/** 盘点差异由服务端按明细重算，此处仅保持一致 */
const CTX_DIFF = { amount: 0, hasDiff: true }

test.beforeAll(async () => {
  ctx = await loadRealOrg(await loginViaApi())
})

test.afterAll(async () => {
  await cleanupRealOrg(ctx)
  await assertDeptConfigUnchanged(ctx)
  const file = writeRealOrgReport(ctx)
  console.log(`[real-org] 分部门核对数据已写入 ${file}`)
})

function dept(name: string): RealOrgDept {
  const found = ctx.depts.find(d => d.deptName === name)
  if (!found) throw new Error(`真实组织矩阵里没有部门 ${name}`)
  return found
}

function assetOf(d: RealOrgDept): Row {
  const list = ctx.assetsByDept.get(d.deptId) ?? []
  const picked = list.find(a => String(a.status) === 'IN_USE') ?? list[0]
  if (!picked) throw new Error(`${d.deptName} 没有可用资产`)
  ctx.touchedAssets.add(String(picked.id))
  return picked
}

async function readAsset(id: string): Promise<Row> {
  return withApi(ctx.admin, async api => {
    const res = await api.get(`/api/fixed-assets/${id}`)
    expect(res.status(), `读取资产 ${id} 失败`).toBe(200)
    return ((await res.json()).data ?? {}) as Row
  })
}

async function putAsset(id: string, patch: Row): Promise<void> {
  await withApi(ctx.admin, async api => {
    const current = await readAsset(id)
    const res = await api.put(`/api/fixed-assets/${id}`, { data: { ...current, ...patch } })
    expect(res.status(), `更新资产 ${id} 失败`).toBe(200)
  })
}

async function readDoc(key: string, id: string): Promise<Row> {
  return withApi(ctx.admin, async api => {
    const res = await api.get(`/api/${key}/${id}`)
    return ((await res.json()).data ?? {}) as Row
  })
}

/** 单据由 admin 代建（R3 无固资单据写权限），但落在真人名下：creatorId = 真实使用人 */
async function makeDoc(d: RealOrgDept, bizKey: string, creator: RealOrgActor, extra: Row = {}) {
  const asset = assetOf(d)
  const code = `${DOC_PREFIX}${bizKey}_${suffix()}`
  const created = await apiPost<Row>(ctx.admin, `fixed-asset-doc-lists-${bizKey}`, {
    code,
    name: `${DOC_PREFIX}真实组织回归_${d.deptName}_${bizKey}`,
    companyId: COMPANY_ID,
    assetId: String(asset.id),
    creatorId: creator.id,
    createTime: new Date().toISOString(),
    finishTime: '',
    remark: `${DOC_PREFIX}真实组织回归_${d.deptName}_${bizKey}`,
    status: 'DRAFT',
    ...extra
  })
  return { id: String(created.id), code, asset, creator }
}

/** 归还型退库单：复用原借出单的资产，borrowDocId 指向 DONE 且未归还的借出单 */
async function makeBackDoc(d: RealOrgDept, borrowDoc: { id: string; asset: Row }, creator: RealOrgActor) {
  const code = `${DOC_PREFIX}back_${suffix()}`
  const created = await apiPost<Row>(ctx.admin, 'fixed-asset-doc-lists-back', {
    code,
    name: `${DOC_PREFIX}真实组织回归_${d.deptName}_归还退库`,
    companyId: COMPANY_ID,
    assetId: String(borrowDoc.asset.id),
    borrowDocId: borrowDoc.id,
    creatorId: creator.id,
    createTime: new Date().toISOString(),
    finishTime: '',
    remark: `${DOC_PREFIX}真实组织回归_${d.deptName}_归还退库`,
    status: 'DRAFT'
  })
  return { id: String(created.id), code }
}

async function submit(a: RealOrgActor, docKey: string, docId: string, chainCtx = CTX_BASE) {
  const res = await act(sessionOf(ctx, a).token, { docKey, docId, action: 'submit', ctx: chainCtx })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.data.status).toBe('PROCESSING')
}

async function approve(a: RealOrgActor, docKey: string, docId: string, chainCtx = CTX_BASE, comment = ''): Promise<string> {
  const res = await act(sessionOf(ctx, a).token, {
    docKey, docId, action: 'approve', ctx: chainCtx,
    comment: comment || `${a.name} 真实组织回归审批`
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return String(res.body.data.status)
}

async function trailsOf(docId: string): Promise<Row[]> {
  const base = ctx.baselineIds.get('fixed-asset-doc-approvals') ?? new Set<string>()
  const rows = await apiList(ctx.admin, 'fixed-asset-doc-approvals')
  return rows.filter(r => String(r.docId) === docId && !base.has(String(r.id)))
}

/** 审批轨迹必须命中到「人」，而不是只检查有一个同名角色批过 */
function expectTrail(rows: Row[], expected: RealOrgActor[]) {
  const ids = new Set(rows.map(r => String(r.approverId ?? '')))
  for (const a of expected) {
    expect(ids.has(a.id), `审批轨迹缺少 ${a.name}(${a.username})：${rows.map(r => `${r.result}/${r.approverName}`).join('、')}`).toBe(true)
  }
  expect(rows.filter(r => String(r.result) === 'AGREE').length, '通过类轨迹条数不足').toBeGreaterThanOrEqual(expected.length - 1)
}

function record(
  caseId: string, d: RealOrgDept, flow: string, actors: RealOrgActor[],
  steps: string[], ledger: { before: string; after: string }, derived: string[] = []
) {
  ctx.results.push({
    caseId, deptName: d.deptName, flow,
    actors: [...new Set(actors.map(a => `${a.name}(${a.username})`))],
    steps, ledgerBefore: ledger.before, ledgerAfter: ledger.after, derived, ok: true
  })
}

test('[FZ-00] 真实组织矩阵自检：8 部门、真人账号、部门配置与手工草稿单', async () => {
  expect(ctx.depts, '有资产部门应为 8 个').toHaveLength(8)
  expect(ctx.depts.reduce((n, d) => n + (ctx.assetsByDept.get(d.deptId) ?? []).length, 0), '公司资产总数')
    .toBeGreaterThanOrEqual(46)
  for (const d of ctx.depts) {
    const observed = (ctx.assetsByDept.get(d.deptId) ?? []).length
    expect(observed, `${d.deptName} 在册资产不应少于基线 ${d.assetCount}`).toBeGreaterThanOrEqual(d.assetCount)
    expect(d.actors.deptLeader.id, `${d.deptName} 部门主管 id 未解析`).toBeTruthy()
    expect(d.actors.vp.id, `${d.deptName} 分管领导 id 未解析`).toBeTruthy()
  }
  // 真实层级：每个部门的主管与分管领导都必须是已登录真人，且主管不是分管领导
  expect(ctx.sessions.size).toBeGreaterThanOrEqual(12)
  for (const d of ctx.depts) {
    expect(sessionOf(ctx, d.actors.deptLeader).user.username).toBe(d.actors.deptLeader.username)
    expect(sessionOf(ctx, d.actors.vp).user.username).toBe(d.actors.vp.username)
    if (d.deptName !== '公司领导') expect(d.actors.deptLeader.id).not.toBe(d.actors.vp.id)
  }
  await assertDeptConfigUnchanged(ctx)
  expect(String(ctx.handDraft.status), `手工草稿盘点单 ${HAND_DRAFT_DOC_NO} 必须保持草稿`).toBe('DRAFT')

  // 目标口径迁移必须已在生产库生效，否则后续断言会退化成旧口径还不自知
  const flows = await apiList(ctx.admin, 'system-workflow-flows')
  // 接口可能返回已解析的步骤数组，也可能返回 JSON 字符串，统一转成文本再断言
  const stepsText = (id: string) => {
    const raw = flows.find(f => String(f.id) === id)?.steps
    return typeof raw === 'string' ? raw : JSON.stringify(raw ?? '')
  }
  const wf6 = stepsText('WF6')
  const wf8 = stepsText('WF8')
  expect(wf6, 'WF6 应含修毕验收环节').toContain('修毕验收')
  expect(wf8, 'WF8 财务环节应按处置方式强制').toContain('DISPOSE_FINANCE')
  expect(wf8, 'WF8 审计环节应按处置方式强制').toContain('DISPOSE_AUDIT')
  const enabledValues = async (code: string) =>
    (await apiList(ctx.admin, `system-dict-types-${code}-items`))
      .filter(i => String(i.status) === 'ENABLED').map(i => String(i.value))
  expect(await enabledValues('dispose_type')).toEqual(expect.arrayContaining(['SCRAP', 'SALE', 'DONATE', 'TRANSFER_OUT']))
  expect(await enabledValues('change_type')).toEqual(expect.arrayContaining(['TRANSFER', 'REPAIR', 'CORRECTION']))
  const params = await apiList(ctx.admin, 'system-params')
  expect(params.some(p => String(p.key) === 'sys.asset.legacy.cutoff'), '期初切换日参数 SP11 应存在').toBe(true)
})

test('[FZ-01] 产品研发一部｜WF2 派发：石顺中→资产管理员，台账落使用人', async () => {
  const d = dept('产品研发一部')
  const doc = await makeDoc(d, 'alloc', d.actors.user)
  await putAsset(String(doc.asset.id), { status: 'IDLE' })
  const before = String((await readAsset(String(doc.asset.id))).status)

  await submit(POOL.admin, 'alloc', doc.id)
  expect(await approve(d.actors.deptLeader, 'alloc', doc.id)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'alloc', doc.id)).toBe('DONE')

  const after = await readAsset(String(doc.asset.id))
  expect(String(after.status)).toBe('IN_USE')
  expect(String(after.userId), '派发后使用人应落到单据创建人（真实使用人）').toBe(d.actors.user.id)
  const trail = await trailsOf(doc.id)
  expectTrail(trail, [POOL.admin, d.actors.deptLeader, POOL.assetManager])
  expect(trail.map(r => String(r.stepName))).toContain('使用部门确认')
  record('FZ-01', d, 'WF2 资产派发', [POOL.admin, d.actors.deptLeader, POOL.assetManager],
    ['提交申请', '使用部门确认（部门主管）', '资产管理员登记（R2）'], { before, after: String(after.status) })
})

test('[FZ-02] 综合管理部｜WF4 借出 + WF3 归还退库：BORROWED→IDLE 且清空使用人', async () => {
  const d = dept('综合管理部（党群工作部）')
  const doc = await makeDoc(d, 'borrow', d.actors.user)
  await putAsset(String(doc.asset.id), { status: 'IN_USE' })
  const before = String((await readAsset(String(doc.asset.id))).status)

  await submit(d.actors.user, 'borrow', doc.id)
  expect(await approve(d.actors.deptLeader, 'borrow', doc.id)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'borrow', doc.id)).toBe('DONE')
  expect(String((await readAsset(String(doc.asset.id))).status)).toBe('BORROWED')

  // 旧口径的免审批归还登记必须被拒绝：归还只能走关联原借出单的 WF3 退库单
  const legacy = await act(sessionOf(ctx, d.actors.user).token, {
    docKey: 'borrow', docId: doc.id, action: 'return', comment: `${DOC_PREFIX}${d.deptName}实物已归还，外观完好`
  })
  expect(legacy.status, JSON.stringify(legacy.body)).toBe(400)
  expect(String(legacy.body.message)).toContain('归还登记已停用')

  const back = await makeBackDoc(d, doc, d.actors.user)
  const savedBack = await readDoc('fixed-asset-doc-lists-back', back.id)
  expect(String(savedBack.borrowDocId), '归还退库单必须关联原借出单').toBe(doc.id)

  await submit(d.actors.user, 'back', back.id)
  expect(await approve(d.actors.deptLeader, 'back', back.id)).toBe('PROCESSING')
  expect(await approve(d.actors.warehouse, 'back', back.id)).toBe('DONE')

  const assetAfter = await readAsset(String(doc.asset.id))
  expect(String(assetAfter.status), '仓管验收后资产回仓库').toBe('IDLE')
  expect(String(assetAfter.userId ?? ''), '归还后清空使用人，继续使用须重新派发').toBe('')
  const borrowAfter = await readDoc('fixed-asset-doc-lists-borrow', doc.id)
  expect(['true', '1']).toContain(String(borrowAfter.returned))
  expect(String(borrowAfter.returnBy), '归还留痕落在最终验收的仓管员').toBe(d.actors.warehouse.id)
  expect(String(borrowAfter.returnDate ?? '')).not.toBe('')

  // 同一借出单不能重复归还
  const duplicate = await makeBackDoc(d, doc, d.actors.user)
  const blocked = await act(sessionOf(ctx, d.actors.user).token, {
    docKey: 'back', docId: duplicate.id, action: 'submit'
  })
  expect(blocked.status, JSON.stringify(blocked.body)).toBe(409)
  expect(String(blocked.body.message)).toContain('已归还')

  const trail = await trailsOf(back.id)
  expectTrail(trail, [d.actors.user, d.actors.deptLeader, d.actors.warehouse])
  expect(trail.map(r => String(r.stepName))).toContain('仓管员验收入库')
  record('FZ-02', d, 'WF4 借出 + WF3 归还退库', [d.actors.user, d.actors.deptLeader, POOL.assetManager, d.actors.warehouse],
    ['提交借出申请', '部门主管审批（DEPT_LEADER）', '资产管理员审核（R2）',
      '发起归还退库（borrowDocId 关联原借出单）', '部门主管确认（DEPT_LEADER）', '仓管员验收入库（R8）'],
    { before, after: String(assetAfter.status) },
    [`退库单 ${back.code}（DONE，关联借出单 ${doc.id}）；借出单 returned/returnBy/returnDate 留痕；重复归还被 409 拦截`])
})

test('[FZ-03] 财务资金部｜WF6 大额维修：REPAIRING + 修毕验收，台账回 IN_USE', async () => {
  const d = dept('财务资金部')
  const doc = await makeDoc(d, 'repair', d.actors.user)
  await putAsset(String(doc.asset.id), { status: 'IN_USE' })
  const before = String((await readAsset(String(doc.asset.id))).status)

  await submit(d.actors.user, 'repair', doc.id, CTX_LARGE_VP)
  expect(String((await readAsset(String(doc.asset.id))).status), '提交送修即进入维修中').toBe('REPAIRING')
  expect(await approve(d.actors.deptLeader, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(await approve(d.actors.vp, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(String((await readAsset(String(doc.asset.id))).status), '修毕验收前仍为维修中').toBe('REPAIRING')
  expect(await approve(POOL.assetManager, 'repair', doc.id, CTX_LARGE_VP), '修毕验收为最后一个环节').toBe('DONE')

  const after = String((await readAsset(String(doc.asset.id))).status)
  expect(after, '修毕验收完结后资产恢复使用中').toBe('IN_USE')
  const trail = await trailsOf(doc.id)
  expectTrail(trail, [d.actors.user, d.actors.deptLeader, POOL.assetManager, d.actors.vp])
  const stepNames = trail.map(r => String(r.stepName))
  expect(stepNames).toContain('大额维修分管副总审批')
  expect(stepNames, 'WF6 应新增修毕验收环节').toContain('修毕验收')
  record('FZ-03', d, 'WF6 大额维修（>5 万 + 修毕验收）', [d.actors.user, d.actors.deptLeader, POOL.assetManager, d.actors.vp],
    ['提交申请（资产转维修中）', '部门主管审批（DEPT_LEADER）', '资产管理员审核（R2）',
      '大额维修分管副总审批（DEPT_VP，AMOUNT_GT 5 万）', '修毕验收（R2，资产回使用中）'],
    { before, after })
})

test('[FZ-04] 产品研发二部｜WF7 信息更正：更正前后快照留痕，台账状态与使用人不变', async () => {
  const d = dept('产品研发二部')
  const doc = await makeDoc(d, 'change', d.actors.user, {
    changeType: 'CORRECTION',
    beforeSnapshot: JSON.stringify({ location: 'E2E_ORG_旧存放位置', custodian: '原责任人' }),
    afterSnapshot: JSON.stringify({ location: 'E2E_ORG_新存放位置', custodian: '现责任人' })
  })
  await putAsset(String(doc.asset.id), { status: 'IN_USE' })
  const before = await readAsset(String(doc.asset.id))

  await submit(d.actors.user, 'change', doc.id)
  expect(await approve(d.actors.deptLeader, 'change', doc.id)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'change', doc.id)).toBe('DONE')

  const after = await readAsset(String(doc.asset.id))
  expect(String(after.status), '信息更正不改台账状态').toBe(String(before.status))
  expect(String(after.userId ?? ''), '信息更正不改使用人').toBe(String(before.userId ?? ''))
  const saved = await readDoc('fixed-asset-doc-lists-change', doc.id)
  expect(String(saved.changeType)).toBe('CORRECTION')
  expect(String(saved.beforeSnapshot), '更正前快照须落库').toContain('旧存放位置')
  expect(String(saved.afterSnapshot), '更正后快照须落库').toContain('新存放位置')
  expectTrail(await trailsOf(doc.id), [d.actors.user, d.actors.deptLeader, POOL.assetManager])
  record('FZ-04', d, 'WF7 信息更正（CORRECTION）', [d.actors.user, d.actors.deptLeader, POOL.assetManager],
    ['提交申请（附更正前后快照）', '调出部门主管审批（DEPT_LEADER）', '资产管理员确认（R2）'],
    { before: String(before.status), after: String(after.status) },
    [`变更单 ${doc.code} 保存 beforeSnapshot / afterSnapshot`])
})

test('[FZ-05] 科技创新部｜WF8 转让处置：按处置方式强制财务+审计，伪造 ctx 无效', async () => {
  const d = dept('科技创新部')
  const voucher = `${DOC_PREFIX}CZ_${suffix()}`
  const doc = await makeDoc(d, 'dispose', d.actors.user, {
    disposeType: 'TRANSFER_OUT',
    buyer: '集团内独立核算主体',
    voucherNo: voucher,
    disposalAmount: 1000,
    outLedgerBasis: '出公司即出账：集团内独立核算主体间转让'
  })
  // 期初「待核销」资产补走处置审批，是真实会用到的核销路径
  await putAsset(String(doc.asset.id), { status: 'PENDING_WRITE_OFF' })
  const before = String((await readAsset(String(doc.asset.id))).status)
  const saved = await readDoc('fixed-asset-doc-lists-dispose', doc.id)
  expect(String(saved.disposeType), '转让方式须随单据落库').toBe('TRANSFER_OUT')
  expect(String(saved.outLedgerBasis)).toContain('出公司即出账')
  expect(String(saved.voucherNo)).toBe(voucher)

  // 客户端谎报「报废 + 金额 0」试图跳过财务/审计；服务端 effectiveCtx 按单据事实覆盖
  await submit(POOL.admin, 'dispose', doc.id, CTX_FORGED_DISPOSE)
  expect(await approve(d.actors.deptLeader, 'dispose', doc.id, CTX_FORGED_DISPOSE)).toBe('PROCESSING')
  expect(await approve(d.actors.finance, 'dispose', doc.id, CTX_FORGED_DISPOSE), '财务复核必须强制生效').toBe('PROCESSING')
  expect(await approve(d.actors.auditor, 'dispose', doc.id, CTX_FORGED_DISPOSE)).toBe('DONE')

  const after = String((await readAsset(String(doc.asset.id))).status)
  expect(after, '处置审批通过后台账应转已核销').toBe('DISPOSED')
  const trail = await trailsOf(doc.id)
  expectTrail(trail, [POOL.admin, d.actors.deptLeader, d.actors.finance, d.actors.auditor])
  const stepNames = trail.map(r => String(r.stepName))
  expect(stepNames, '低额转让仍须财务复核').toContain('财务管理员复核')
  expect(stepNames, '低额转让仍须审计备案').toContain('审计员备案')
  expect(stepNames, '分管副总仍按金额门槛，不因转让强制触发').not.toContain('分管副总审批')
  record('FZ-05', d, 'WF8 转让处置（财务+审计强制）',
    [POOL.admin, d.actors.deptLeader, d.actors.finance, d.actors.auditor],
    ['提交申请（伪造 ctx 报废/0 元）', '部门主管审批（DEPT_LEADER）',
      '财务管理员复核（R4，DISPOSE_FINANCE 强制）', '审计员备案（R6，DISPOSE_AUDIT 强制）'],
    { before, after },
    [`处置单 ${doc.code} 记录 disposeType/受让方/凭证号/出账依据；台账转已核销`])
})

test('[FZ-06] 项目管理部｜WF1 入库：仓管角色池例外，台账待入库→空闲', async () => {
  const d = dept('项目管理部')
  const doc = await makeDoc(d, 'inbound', d.actors.user)
  await putAsset(String(doc.asset.id), { status: 'PENDING_INBOUND' })
  const before = String((await readAsset(String(doc.asset.id))).status)

  await submit(POOL.admin, 'inbound', doc.id)
  // 陈铃属综合管理部，但 WF1 按角色池判定，仍可验收项目管理部的入库单
  expect(d.actors.warehouse.id).not.toBe(d.actors.deptLeader.id)
  expect(await approve(d.actors.warehouse, 'inbound', doc.id)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'inbound', doc.id)).toBe('DONE')

  const afterRow = await readAsset(String(doc.asset.id))
  expect(String(afterRow.status)).toBe('IDLE')
  expect(String(afterRow.inboundDate ?? ''), '入库验收应补入库日期').not.toBe('')
  const trail = await trailsOf(doc.id)
  expectTrail(trail, [POOL.admin, d.actors.warehouse, POOL.assetManager])
  expect(trail.map(r => String(r.stepName))).toContain('仓管验收')
  record('FZ-06', d, 'WF1 入库验收（角色池例外）', [POOL.admin, d.actors.warehouse, POOL.assetManager],
    ['提交申请', '仓管验收（R8 角色池）', '资产管理员复核（R2 角色池）'],
    { before, after: String(afterRow.status) })
})

test('[FZ-07] 市场营销部｜WF9 盘点：跨部门角色池、审计抽查、盘亏派生处置单', async () => {
  const d = dept('市场营销部')
  const asset = assetOf(d)
  const before = String((await readAsset(String(asset.id))).status)
  const now = new Date().toISOString()
  const created = await apiPost<Row>(ctx.admin, 'fixed-asset-inventory-docs', {
    // docNo 由服务端按全表当日序号生成（P10-08），前端不推算
    name: `${DOC_PREFIX}真实组织回归_${d.deptName}_inventory`,
    companyId: COMPANY_ID,
    applicant: DOC_PREFIX,
    creatorId: ctx.admin.user.id,
    scope: `${d.deptName}在册资产`,
    assetTypes: [],
    createTime: now,
    finishTime: '',
    remark: `${DOC_PREFIX}真实组织回归_${d.deptName}_inventory`,
    status: 'DRAFT',
    items: [{
      assetId: String(asset.id),
      assetNo: String(asset.code),
      assetName: String(asset.name),
      assetType: String(asset.category),
      assetStatus: String(asset.status),
      dept: String(asset.deptId),
      userName: String(asset.userId ?? ''),
      location: String(asset.location ?? ''),
      itemStatus: 'LOSS',
      result: 'LOSS',
      remark: `${DOC_PREFIX}盘点盘亏_${d.deptName}`,
      checker: ctx.admin.user.id,
      checkerName: '真实组织回归',
      countMethod: '现场登记',
      createTime: now,
      checkTime: now
    }],
    counters: []
  })
  const docId = String(created.id)

  await submit(POOL.admin, 'inventory', docId, CTX_DIFF)
  expect(await approve(POOL.assetManager, 'inventory', docId, CTX_DIFF)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'inventory', docId, CTX_DIFF)).toBe('PROCESSING')
  expect(await approve(d.actors.auditor, 'inventory', docId, CTX_DIFF)).toBe('DONE')

  const after = String((await readAsset(String(asset.id))).status)
  expect(after, '盘亏完结后台账应显示待核销').toBe('PENDING_WRITE_OFF')
  const base = ctx.baselineIds.get('fixed-asset-doc-lists-dispose') ?? new Set<string>()
  const derived = (await apiList(ctx.admin, 'fixed-asset-doc-lists-dispose'))
    .filter(r => !base.has(String(r.id)) && String(r.assetId) === String(asset.id))
  expect(derived, '盘亏应派生一张待审处置单').toHaveLength(1)
  expect(String(derived[0].status)).toBe('DRAFT')

  const trail = await trailsOf(docId)
  expectTrail(trail, [POOL.admin, d.actors.auditor])
  const stepNames = trail.map(r => String(r.stepName))
  expect(stepNames, '有差异时差异复核环节应生效').toContain('盘点差异复核')
  expect(stepNames).toContain('审计抽查确认')
  record('FZ-07', d, 'WF9 盘点（盘亏差异）', [POOL.admin, d.actors.auditor],
    ['提交申请', '盘点结果确认（R2）', '盘点差异复核（R2, HAS_DIFF）', '审计抽查确认（R6, HAS_DIFF）'],
    { before, after }, [`处置单 ${String(derived[0].code)}（DRAFT，来源盘点单 ${docId}）`])
})

test('[FZ-08] 公司领导｜层级例外：leader 为 R7 账号，DEPT_VP 与修毕验收均可完成', async () => {
  const d = dept('公司领导')
  const doc = await makeDoc(d, 'repair', d.actors.user)
  await putAsset(String(doc.asset.id), { status: 'IN_USE' })
  const before = String((await readAsset(String(doc.asset.id))).status)
  expect(d.actors.user.id).toBe(d.actors.deptLeader.id)
  expect(d.actors.deptLeader.id).not.toBe(d.actors.vp.id)

  await submit(d.actors.user, 'repair', doc.id, CTX_LARGE_VP)
  expect(String((await readAsset(String(doc.asset.id))).status)).toBe('REPAIRING')
  // DEPT_LEADER 解析到的是 leader_id（严坤斌，R7 + 领导班子），不因角色停用而卡单
  expect(await approve(d.actors.deptLeader, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(await approve(d.actors.vp, 'repair', doc.id, CTX_LARGE_VP)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'repair', doc.id, CTX_LARGE_VP)).toBe('DONE')

  const after = String((await readAsset(String(doc.asset.id))).status)
  expect(after, '修毕验收后恢复使用中').toBe('IN_USE')
  const trail = await trailsOf(doc.id)
  expectTrail(trail, [d.actors.user, POOL.assetManager, d.actors.vp])
  expect(trail.map(r => String(r.stepName))).toContain('修毕验收')
  record('FZ-08', d, 'WF6 大额维修（部门层级例外 + 修毕验收）', [d.actors.user, POOL.assetManager, d.actors.vp],
    ['提交申请（资产转维修中）', '部门主管审批（leader=R7 账号）', '资产管理员审核（R2）',
      '大额维修分管副总审批（DEPT_VP）', '修毕验收（R2）'],
    { before, after })
})

test('[FZ-09] 越权防护：其他部门主管审批被 403 且点名到本部门负责人', async () => {
  const d = dept('产品研发一部')
  const other = dept('综合管理部（党群工作部）')
  const doc = await makeDoc(d, 'alloc', d.actors.user)
  // 派发要求资产处于空闲；FZ-01 已把同一在册资产派成「使用中」，这里显式回到空闲
  await putAsset(String(doc.asset.id), { status: 'IDLE' })
  await submit(POOL.admin, 'alloc', doc.id)

  const blocked = await act(sessionOf(ctx, other.actors.deptLeader).token, {
    docKey: 'alloc', docId: doc.id, action: 'approve', ctx: CTX_BASE
  })
  expect(blocked.status, JSON.stringify(blocked.body)).toBe(403)
  expect(String(blocked.body.message), '403 应点名到本部门负责人').toContain(d.actors.deptLeader.name)

  expect(await approve(d.actors.deptLeader, 'alloc', doc.id)).toBe('PROCESSING')
  expect(await approve(POOL.assetManager, 'alloc', doc.id)).toBe('DONE')
  ctx.notes.push(`[FZ-09] ${other.deptName} 主管 ${other.actors.deptLeader.name} 审批 ${d.deptName} 单据被 403，文案点名 ${d.actors.deptLeader.name}。`)
})

test('[FZ-10] 收尾核对：部门配置、真实账号、手工草稿单与 8 条链路结果', async () => {
  await assertDeptConfigUnchanged(ctx)
  const users = await apiList(ctx.admin, 'org-users', `companyId=${encodeURIComponent(COMPANY_ID)}`)
  expect(users.length, '真实账号数量前后必须一致，不得删号').toBe(ctx.baselineUserCount)
  const draft = (await apiList(ctx.admin, 'fixed-asset-inventory-docs'))
    .find(r => String(r.docNo) === HAND_DRAFT_DOC_NO)
  expect(draft, `用户手工草稿盘点单 ${HAND_DRAFT_DOC_NO} 必须保留`).toBeTruthy()
  expect(String(draft!.status)).toBe('DRAFT')

  expect(ctx.results, '8 个有资产部门应各完成一条真实审批链').toHaveLength(8)
  expect(new Set(ctx.results.map(r => r.deptName)).size).toBe(8)
  expect(ctx.results.every(r => r.ok)).toBe(true)
  expect(new Set(ctx.results.map(r => r.flow)).size, '应覆盖不同业务流程').toBeGreaterThanOrEqual(6)
  ctx.notes.push(`[FZ-10] 8 部门 / ${ctx.results.length} 条真实审批链全部通过；真实账号 ${users.length} 个保持不变；手工草稿单 ${HAND_DRAFT_DOC_NO} 状态 DRAFT。`)
})
