/**
 * 固定资产「正式使用」测试数据生成器。
 *
 * 按真实角色账号走 WF1~WF9 审批链，为每家公司生成覆盖全部功能的单据与轨迹。
 * 用法（需先启动生产栈）：
 *   node scripts/seed-fixed-asset-matrix.mjs --company=YY
 *   node scripts/seed-fixed-asset-matrix.mjs --all
 *
 * 说明：
 * - 只写 DEMO- 前缀的资产与单据，便于审阅和后续清理；
 * - 集团部门未配置 leaderId，涉及 DEPT_LEADER 的流程会降级为管理员直填 DONE；
 * - 不使用 --force 时不会重复生成同一前缀的数据。
 */
import process from 'node:process'

const BASE = process.env.FAMS_BASE || 'http://localhost/api'
const ADMIN = { username: 'admin', password: 'FAMSadmin@2026!' }
const USER_PWD = 'Fzidt@2026!'

/** 跨公司固定角色账号（R1/R2/R4/R6/R8 由研究院账号承担，ROLE 类环节不按公司过滤） */
const GLOBAL = {
  R2: ADMIN,
  R4: { username: '13599071971', name: '李弥贤' },
  R6: { username: '15750891336', name: '陈容源' },
  R8: { username: '18120648615', name: '陈铃' }
}

const COMPANIES = [
  {
    key: 'JT', name: '集团', companyId: 'mwikk1bz12', deptId: 'mwjzt7e010', deptName: '办公室',
    leader: null, vp: null,
    users: [
      { username: '15980690041', name: '方芳' },
      { username: '13950281262', name: '邱祥恩' }
    ]
  },
  {
    key: 'YY', name: '研究院', companyId: 'mvsv021s37', deptId: 'mvsv022n43', deptName: '综合管理部',
    leader: { username: '15960118864', name: '程乔楠' }, vp: { username: '18559869119', name: '郭晓雅' },
    users: [
      { username: '18350296364', name: '江小芳' },
      { username: '13625070487', name: '田有隆' }
    ]
  },
  {
    key: 'ZZ', name: '至臻', companyId: 'mvsv021z38', deptId: 'mvsv023754', deptName: '市场营销部',
    leader: { username: '18909838376', name: '葛封才' }, vp: { username: '13810279159', name: '窦康殷' },
    users: [
      { username: '13859019967', name: '张嘉善' },
      { username: '13754313095', name: '雷晓晔' }
    ]
  },
  {
    key: 'XS', name: '新视', companyId: 'mvsv022039', deptId: 'mvsv023d57', deptName: '研发部',
    leader: { username: '17720799091', name: '付云杰' }, vp: { username: '18559869119', name: '郭晓雅' },
    // 研发部分管领导是跨公司账号，DEPT_VP 按公司过滤后解析不到，故不触发大额环节
    skipBig: true,
    users: [
      { username: '13706018257', name: '陈由至' },
      { username: '18065025656', name: '王伟强' }
    ]
  },
  {
    key: 'SY', name: '数源', companyId: 'mvsv022240', deptId: 'mvsv023g59', deptName: '产业发展部',
    leader: { username: '13960793326', name: '兰天' }, vp: { username: '18659177190', name: '严人杰' },
    users: [
      { username: '18905909665', name: '林卓平' },
      { username: '18106065605', name: '郭伯伟' }
    ]
  }
]

const sessions = new Map()
const results = []

function arg(name) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}

async function request(token, path, { method = 'GET', data } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: data === undefined ? undefined : JSON.stringify(data)
  })
  const text = await res.text()
  let body = {}
  try { body = text ? JSON.parse(text) : {} } catch { body = { message: text } }
  if (!res.ok || (body.code !== undefined && Number(body.code) !== 0)) {
    throw new Error(`${method} ${path} -> HTTP ${res.status} code=${body.code} ${body.message || ''}`)
  }
  return body.data
}

async function login(account) {
  const key = account.username
  if (sessions.has(key)) return sessions.get(key)
  const pwd = key === 'admin' ? ADMIN.password : USER_PWD
  const data = await request('', '/auth/login', { method: 'POST', data: { username: key, password: pwd } })
  const session = { token: data.token, user: data.user }
  sessions.set(key, session)
  return session
}

async function api(account, path, method = 'GET', data) {
  const s = await login(account)
  return request(s.token, path, { method, data })
}

async function act(account, docKey, docId, action, ctx = { amount: 0, hasDiff: false }, comment = '') {
  return api(account, '/approvals/action', 'POST', {
    docKey, docId, action, ctx, comment: comment || '正式使用测试 · 按角色审批'
  })
}

function today() { return new Date().toISOString().slice(0, 10) }

/** 列表全量拉取后按编码匹配，让脚本可重复执行而不产生重复数据 */
async function findByCode(path, code, key = 'code') {
  try {
    const rows = await api(ADMIN, `${path}?pageSize=500`)
    return rows.find(r => r[key] === code) || null
  } catch { return null }
}

async function createAsset(cfg, tag, overrides = {}) {
  const code = `DEMO-FA-${cfg.key}-${tag}`
  const old = await findByCode('/fixed-assets', code)
  if (old) return { id: old.id, code, name: old.name, status: old.status }
  const payload = {
    code,
    name: `演示资产-${cfg.name}-${tag}`,
    category: 'ELECTRONIC',
    companyId: cfg.companyId,
    deptId: cfg.deptId,
    userId: overrides.userId || '',
    location: `${cfg.deptName}库房`,
    purchaseDate: '2026-01-15',
    inboundDate: '2026-01-16',
    amount: 12000,
    original: 12000,
    net: 11400,
    status: 'IDLE',
    depreciate: true,
    purchaseMode: 'PURCHASE',
    ...overrides
  }
  const created = await api(ADMIN, '/fixed-assets', 'POST', payload)
  return { id: created.id, code, name: payload.name, status: payload.status }
}

async function createDoc(cfg, bizKey, tag, asset, creator, extra = {}) {
  const code = `DEMO-DOC-${cfg.key}-${bizKey}-${tag}`
  const old = await findByCode(`/fixed-asset-doc-lists-${bizKey}`, code)
  if (old) return { id: old.id, code, docKey: bizKey, asset }
  const payload = {
    code,
    name: `演示单据-${cfg.name}-${bizKey}-${tag}`,
    companyId: cfg.companyId,
    deptId: cfg.deptId,
    assetId: asset.id,
    creatorId: creator.id,
    createTime: new Date().toISOString(),
    finishTime: '',
    remark: '正式使用测试 · 按角色流程生成',
    status: 'DRAFT',
    ...extra
  }
  const created = await api(ADMIN, `/fixed-asset-doc-lists-${bizKey}`, 'POST', payload)
  return { id: created.id, code, docKey: bizKey, asset }
}

/** 提交 + 逐级审批；失败时 throw，由调用方决定是否降级 */
async function runFlow(doc, submitter, approvers, ctx = { amount: 0, hasDiff: false }) {
  const detailPath = doc.docKey === 'inventory'
    ? `/fixed-asset-inventory-docs/${doc.id}`
    : `/fixed-asset-doc-lists-${doc.docKey}/${doc.id}`
  let current = await api(ADMIN, detailPath)
  if (current.status === 'DONE') return 0
  // 上次中断卡在 PROCESSING 时从当前环节续跑，不重复 submit
  if (current.status !== 'PROCESSING') await act(submitter, doc.docKey, doc.id, 'submit', ctx)
  for (const approver of approvers) {
    current = await api(ADMIN, detailPath)
    if (current.status === 'DONE') break
    try {
      await act(approver, doc.docKey, doc.id, 'approve', ctx)
    } catch (e) {
      // 跳过大额等环节后，预置的审批人可能与剩余环节不匹配，忽略后继续
      if (!/需要由|只有草稿|没有可用|409/.test(e.message)) throw e
    }
  }
  const rows = await api(ADMIN, '/fixed-asset-doc-approvals?pageSize=200')
  const trails = rows.filter(r => r.docId === doc.id && r.result === 'AGREE')
  return trails.length
}

/** 集团等缺审批人配置时，管理员直接把 DRAFT 推进到 DONE（保留业务数据，无审批轨迹） */
async function forceDone(bizKey, id, assetId) {
  const path = bizKey === 'inventory' ? `/fixed-asset-inventory-docs/${id}` : `/fixed-asset-doc-lists-${bizKey}/${id}`
  const row = await api(ADMIN, path, 'GET')
  if (row.status !== 'DONE') {
    await api(ADMIN, path, 'PUT', { ...row, status: 'DONE', finishTime: new Date().toISOString(), remark: `${row.remark || ''}（组织未配置负责人，管理员直填）` })
  }
  const after = { inbound: 'IDLE', alloc: 'IN_USE', borrow: 'BORROWED', back: 'IDLE', repair: 'IN_USE', transfer: 'IN_USE', dispose: 'DISPOSED' }
  if (after[bizKey] && assetId) {
    try {
      const asset = await api(ADMIN, `/fixed-assets/${assetId}`, 'GET')
      await api(ADMIN, `/fixed-assets/${assetId}`, 'PUT', { ...asset, status: after[bizKey] })
    } catch (e) {
      console.log(`  (资产状态同步跳过：${e.message})`)
    }
  }
}

function record(cfg, module, docCode, status, trails, degraded = false) {
  results.push({ company: cfg.name, module, docCode, status, trails, degraded })
  console.log(`  [${cfg.key}] ${module.padEnd(10)} ${docCode.padEnd(38)} ${status} 轨迹${trails}${degraded ? ' (降级)' : ''}`)
}

async function withFlow(cfg, module, doc, submitter, approvers, ctx) {
  if (!cfg.leader) {
    await forceDone(doc.docKey, doc.id, doc.asset?.id)
    record(cfg, module, doc.code, 'DONE', 0, true)
    return
  }
  try {
    const trails = await runFlow(doc, submitter, approvers, ctx)
    record(cfg, module, doc.code, 'DONE', trails)
  } catch (e) {
    console.log(`  [${cfg.key}] ${module} 流程失败：${e.message}`)
    throw e
  }
}

async function seedCompany(cfg) {
  console.log(`\n=== ${cfg.name} (${cfg.companyId}) ===`)
  const u1 = { ...cfg.users[0], password: USER_PWD }
  const u2 = { ...cfg.users[1], password: USER_PWD }
  const s1 = await login(u1)
  const s2 = await login(u2)
  const leader = cfg.leader ? { ...cfg.leader, password: USER_PWD } : null
  const vp = cfg.vp ? { ...cfg.vp, password: USER_PWD } : null
  const R2 = ADMIN
  const R8 = GLOBAL.R8
  const R4 = GLOBAL.R4
  const R6 = GLOBAL.R6

  // 1. 入库/验收：待入库资产 → R8 验收 → R2 复核
  const aIn = await createAsset(cfg, 'IN01', { status: 'PENDING_INBOUND' })
  const dIn = await createDoc(cfg, 'inbound', 'IN01', aIn, s1.user)
  await withFlow(cfg, '入库验收', dIn, u1, [R8, R2])

  // 2. 派发/退库：IDLE → IN_USE，再归还回 IDLE
  const aDispatch = await createAsset(cfg, 'DP01', { userId: s1.user.id })
  const dAlloc = await createDoc(cfg, 'alloc', 'DP01', aDispatch, s1.user, { receiverId: s1.user.id })
  await withFlow(cfg, '派发', dAlloc, u1, [leader, R2].filter(Boolean))

  const dBorrow = await createDoc(cfg, 'borrow', 'DP01', aDispatch, s1.user, {
    borrowerId: s2.user.id, borrowerDeptId: cfg.deptId, borrowPurpose: '正式使用测试 · 跨部门协作',
    expectedReturnDate: today(), returned: false
  })
  await withFlow(cfg, '借出使用', dBorrow, u1, [leader, R2, u2].filter(Boolean))

  const dBack = await createDoc(cfg, 'back', 'DP01', aDispatch, s1.user, { borrowDocId: dBorrow.id })
  await withFlow(cfg, '归还退库', dBack, u1, [leader, R8].filter(Boolean))

  // 3. 资产变更：维修（含 5 万大额环节）→ 调拨（含 20 万大额环节）→ 信息更正
  const aChange = await createAsset(cfg, 'CH01', { status: 'IN_USE', userId: s1.user.id })
  const dRepair = await createDoc(cfg, 'repair', 'CH01', aChange, s1.user, { fault: '正式使用测试 · 设备检修' })
  const repairApprovers = cfg.skipBig ? [leader, R2, R2] : [leader, R2, vp, R2]
  await withFlow(cfg, '维修', dRepair, u1, repairApprovers.filter(Boolean), { amount: cfg.skipBig ? 40000 : 60000, hasDiff: false })

  const dTransfer = await createDoc(cfg, 'transfer', 'CH01', aChange, s1.user, {
    toDeptId: cfg.deptId, toUserId: s2.user.id, toLocation: `${cfg.deptName}新工位`
  })
  const transferApprovers = cfg.skipBig ? [u1, leader, u2, R2] : [u1, leader, u2, vp, R2]
  await withFlow(cfg, '调拨', dTransfer, u1, transferApprovers.filter(Boolean), { amount: cfg.skipBig ? 150000 : 250000, hasDiff: false })

  const aInfo = await createAsset(cfg, 'CH02', { status: 'IDLE', userId: s1.user.id })
  const dChange = await createDoc(cfg, 'change', 'CH02', aInfo, s1.user, {
    changeType: 'CORRECTION', beforeSnapshot: '原存放位置：旧库房', afterSnapshot: '新存放位置：新库房'
  })
  await withFlow(cfg, '信息更正', dChange, u1, [leader, R2].filter(Boolean))

  // 4. 资产处置：SALE 大额，触发 R5 → R4 → R7 → R6 全链
  const disposeAmount = cfg.skipBig ? 160000 : 260000
  const aDispose = await createAsset(cfg, 'DS01', { status: 'PENDING_WRITE_OFF', original: disposeAmount, amount: disposeAmount, net: Math.round(disposeAmount * 0.46) })
  const dDispose = await createDoc(cfg, 'dispose', 'DS01', aDispose, s1.user, {
    disposeType: 'SALE', buyer: '演示受让单位', voucherNo: `DEMO-${cfg.key}-01`,
    disposalAmount: disposeAmount, outLedgerBasis: '正式使用测试 · 达到使用年限'
  })
  const disposeApprovers = cfg.skipBig ? [leader, R4, R6] : [leader, R4, vp, R6]
  await withFlow(cfg, '资产处置', dDispose, u1, disposeApprovers.filter(Boolean), { amount: disposeAmount, hasDiff: false })

  // 5. 盘点：含差异项（盘盈 + 盘亏），走 R2 → R2 → R6
  const now = new Date().toISOString()
  const items = [
    {
      assetId: aIn.id, assetNo: aIn.code, assetName: aIn.name, assetType: 'ELECTRONIC',
      assetStatus: 'IDLE', dept: cfg.deptId, userName: s1.user.name, location: aIn.name ? `${cfg.deptName}库房` : '',
      itemStatus: 'CHECKED', result: 'MATCHED', remark: '账实相符', checker: s1.user.id, checkerName: s1.user.name,
      countMethod: '现场登记', createTime: now, checkTime: now
    },
    {
      assetId: aDispatch.id, assetNo: aDispatch.code, assetName: aDispatch.name, assetType: 'ELECTRONIC',
      assetStatus: 'IDLE', dept: cfg.deptId, userName: s1.user.name, location: `${cfg.deptName}库房`,
      itemStatus: 'LOSS', result: 'LOSS', remark: '正式使用测试 · 盘亏差异', checker: s1.user.id, checkerName: s1.user.name,
      countMethod: '现场登记', createTime: now, checkTime: now
    },
    {
      assetId: '', assetNo: `DEMO-PY-${cfg.key}-01`, assetName: `演示盘盈资产-${cfg.name}`, assetType: 'FURNITURE',
      assetStatus: '', dept: '', userId: '', userName: '', location: `${cfg.deptName}库房`, qty: 1, price: 1200,
      itemStatus: 'SURPLUS', result: 'SURPLUS', remark: '正式使用测试 · 账外资产', checker: s1.user.id, checkerName: s1.user.name,
      countMethod: '现场登记', createTime: now, checkTime: now
    }
  ]
  const inv = (await findByCode('/fixed-asset-inventory-docs', `DEMO-PD-${cfg.key}-01`, 'docNo')) || await api(ADMIN, '/fixed-asset-inventory-docs', 'POST', {
    docNo: `DEMO-PD-${cfg.key}-01`,
    name: `演示盘点单-${cfg.name}`,
    companyId: cfg.companyId, applicant: s1.user.name, creatorId: s1.user.id,
    scope: '全部资产', assetTypes: [], createTime: now, finishTime: '',
    remark: '正式使用测试 · 含盘盈盘亏差异', status: 'DRAFT', items, counters: []
  })
  await withFlow(cfg, '资产盘点', { id: inv.id, code: inv.docNo, docKey: 'inventory' }, u1, [R2, R2, R6], { amount: 0, hasDiff: true })
}

async function main() {
  const only = arg('company')
  const all = process.argv.includes('--all')
  const targets = only ? COMPANIES.filter(c => c.key === only) : (all ? COMPANIES : [COMPANIES[1]])
  if (!targets.length) throw new Error(`未知公司：${only}`)

  console.log(`目标：${targets.map(c => c.name).join('、')}`)
  for (const cfg of targets) {
    try { await seedCompany(cfg) } catch (e) { console.error(`[${cfg.key}] 失败：${e.stack || e.message}`) }
  }

  // 折旧：资产就绪后按期间试算并执行（同 period 幂等）
  console.log('\n=== 折旧管理 ===')
  const period = '2026-11'
  try {
    const preview = await api(ADMIN, '/depreciation/preview', 'POST', { period })
    const run = await api(ADMIN, '/depreciation/run', 'POST', { period })
    console.log(`  preview=${JSON.stringify(preview).slice(0, 160)}`)
    console.log(`  run=${JSON.stringify(run).slice(0, 160)}`)
    results.push({ company: '全集团', module: '折旧计提', docCode: period, status: 'DONE', trails: 0 })
  } catch (e) {
    console.error(`  折旧失败：${e.message}`)
  }

  console.log('\n=== 汇总 ===')
  for (const r of results) console.log(`${r.company}\t${r.module}\t${r.docCode}\t${r.status}\t轨迹${r.trails}${r.degraded ? '(降级)' : ''}`)
  console.log(`共 ${results.length} 条`)
}

main().catch(e => { console.error(e); process.exitCode = 1 })
