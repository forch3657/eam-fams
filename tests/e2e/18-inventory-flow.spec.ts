import { expect, test } from '@playwright/test'
import { loginViaApi, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, findRoleIdByCode, type TempUser } from './fixtures/data'
import { act, createInventoryDoc, withApi } from './fixtures/fixedAsset'
import { apiList, type Row } from './fixtures/p5'

/**
 * P10 盘点闭环：
 *
 * - 盘点明细必须引用真实资产（不再是 A01 这类假编号），且能逐项对账；
 * - 没盘完的盘点单不允许送审（避免空盘点单被审批通过）；
 * - 伪造 hasDiff 不能跳过「差异复核」「审计抽查」（差异判定以服务端为准）；
 * - 审批中的盘点单不能被通用 CRUD 改动或删除（审批对象可改等于审批失效）；
 * - 审批完结后，盘亏明细自动生成待审处置单（带真实资产主键）；
 * - 明细体量超过 64KB 仍能落库（TEXT 溢出回归）。
 */

let admin: Session
let companyId = ''
let assets: Row[] = []

const users: TempUser[] = []
const docIds: string[] = []

/** 盘点结果枚举（与后端 inventory_result 字典一致） */
const RESULT_OF = { MATCHED: 'CHECKED', SURPLUS: 'SURPLUS', LOSS: 'LOSS', ABNORMAL: 'ABNORMAL', UNCHECKED: 'UNCHECKED' }

/** 造一个持有指定角色的审批人（盘点流程：资产管理员 R2 → 审计员 R6） */
async function approver(roleCode: string): Promise<Session> {
  const roleId = await findRoleIdByCode(admin, roleCode)
  const user = await createTempUser(admin, roleId)
  users.push(user)
  return loginViaApi({ username: user.username, password: user.password })
}

/** 明细快照：带真实资产编号 / 名称 / 状态 / 位置，可与台账逐项对账 */
function itemOf(asset: Row, result: string, remark: string): Row {
  const now = new Date().toISOString()
  return {
    assetId: asset.id,
    assetNo: asset.code,
    assetName: asset.name,
    assetType: asset.category,
    assetStatus: asset.status,
    dept: asset.deptId,
    userName: asset.userId,
    location: asset.location,
    itemStatus: RESULT_OF[result] ?? 'UNCHECKED',
    result,
    remark,
    checker: 'U1',
    checkerName: 'E2E 盘点员',
    countMethod: '现场登记',
    createTime: now,
    checkTime: now
  }
}

/** 建盘点单：items 用真实台账资产 */
async function createDoc(items: Row[]): Promise<Row> {
  const created = await createInventoryDoc(admin, { companyId, deptId: '' }, { items })
  docIds.push(created.id)
  const detail = await withApi(admin.token, async api => {
    const res = await api.get(`/api/fixed-asset-inventory-docs/${created.id}`)
    return ((await res.json()).data ?? {}) as Row
  })
  return detail
}

/** 读单据当前状态 */
async function statusOf(docId: string): Promise<string> {
  return withApi(admin.token, async api => {
    const res = await api.get(`/api/fixed-asset-inventory-docs/${docId}`)
    const body = await res.json()
    return String((body.data ?? {}).status ?? '')
  })
}

test.beforeAll(async () => {
  admin = await loginViaApi()
  const all = await apiList(admin, 'fixed-assets')
  expect(all.length, '台账里没有资产，盘点用例无法运行').toBeGreaterThan(0)
  // 取资产最多的公司：明细多，才能覆盖「明细超过 64KB」的场景
  const byCompany = new Map<string, Row[]>()
  all.forEach(a => {
    const list = byCompany.get(a.companyId) ?? []
    list.push(a)
    byCompany.set(a.companyId, list)
  })
  const [cid, list] = [...byCompany.entries()].sort((x, y) => y[1].length - x[1].length)[0]
  companyId = cid
  assets = list
})

test.afterAll(async () => {
  await withApi(admin.token, async api => {
    // 审批中的盘点单删不掉（409），先由创建人撤销再删
    for (const id of docIds) {
      const detail = await api.get(`/api/fixed-asset-inventory-docs/${id}`)
      const row = detail.ok() ? ((await detail.json()).data ?? {}) : ({} as Row)
      if (String(row.status ?? '') === 'PROCESSING') {
        await api
          .post('/api/approvals/action', {
            data: { docKey: 'inventory', docId: id, action: 'revoke', ctx: { amount: 0, hasDiff: true } }
          })
          .catch(() => null)
      }
      await api.delete(`/api/fixed-asset-inventory-docs/${id}`).catch(() => null)
    }
    // 盘亏处置单由后端在审批完结时生成，靠备注里的 E2E 标记清理
    const res = await api.get('/api/fixed-asset-doc-lists-dispose?pageSize=2000')
    const rows = ((await res.json()).data ?? []) as Row[]
    for (const row of rows) {
      if (String(row.remark || '').includes('E2E盘点')) {
        await api.delete(`/api/fixed-asset-doc-lists-dispose/${row.id}`).catch(() => null)
      }
    }
  })
  // 单据删掉后审批轨迹随之级联清理，临时账号这时才能删干净
  for (const user of users) await cleanupTemp(admin, { userId: user.id }).catch(() => null)
})

test('[P10-01] 盘点明细引用真实资产，逐项可与台账对账', async () => {
  const picked = assets.slice(0, 5)
  const doc = await createDoc(picked.map(a => itemOf(a, 'UNCHECKED', '')))
  expect(doc.items).toHaveLength(5)

  const ledger = await apiList(admin, 'fixed-assets')
  const byId = new Map(ledger.map(a => [String(a.id), a]))
  ;(doc.items as Row[]).forEach(it => {
    const asset = byId.get(String(it.assetId))
    expect(asset, `明细里的资产 ${it.assetId} 在台账中不存在`).toBeTruthy()
    expect(it.assetNo).toBe(asset!.code)
    expect(it.assetName).toBe(asset!.name)
    expect(it.itemStatus).toBe('UNCHECKED')
  })
})

test('[P10-02] 明细未全部登记结果时不允许送审', async () => {
  const doc = await createDoc([
    itemOf(assets[0], 'UNCHECKED', ''),
    itemOf(assets[1], 'MATCHED', '账实相符')
  ])
  const res = await act(admin.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'submit',
    ctx: { amount: 0, hasDiff: true }
  })
  expect(res.status, JSON.stringify(res.body)).toBe(400)
  expect(res.body.message).toContain('未登记盘点结果')
  // 单据仍停在草稿，没被送审
  expect(await statusOf(String(doc.id))).toBe('DRAFT')
})

test('[P10-03] 盘完送审 → 审批到底 → 盘亏明细生成待审处置单', async () => {
  const lossAsset = assets[0]
  const doc = await createDoc([
    itemOf(lossAsset, 'LOSS', 'E2E盘点 现场未找到实物'),
    itemOf(assets[1], 'MATCHED', '账实相符')
  ])

  const submitted = await act(admin.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'submit',
    ctx: { amount: 0, hasDiff: true }
  })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
  expect(submitted.body.data.status).toBe('PROCESSING')

  // 盘点结果确认 / 差异复核（资产管理员）→ 审计抽查（审计员）
  const assetManager = await approver('ROLE_ASSET')
  const auditor = await approver('ROLE_AUDITOR')
  for (let i = 0; i < 2; i++) {
    const res = await act(assetManager.token, {
      docKey: 'inventory',
      docId: String(doc.id),
      action: 'approve',
      ctx: { amount: 0, hasDiff: true }
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.status).toBe('PROCESSING')
  }
  const audited = await act(auditor.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'approve',
    ctx: { amount: 0, hasDiff: true }
  })
  expect(audited.status, JSON.stringify(audited.body)).toBe(200)
  expect(audited.body.data.status).toBe('DONE')

  // 盘亏明细生成处置单草案，带真实资产主键
  const disposes = await apiList(admin, 'fixed-asset-doc-lists-dispose')
  const generated = disposes.filter(d => String(d.remark || '').includes('盘点盘亏核销'))
  expect(generated.length).toBeGreaterThan(0)
  const mine = generated.find(d => String(d.assetId) === String(lossAsset.id))
  expect(mine, '盘亏明细没有生成对应的处置单').toBeTruthy()
  expect(mine!.status).toBe('DRAFT')
})

test('[P10-04] 伪造 hasDiff 不能跳过差异复核与审计抽查', async () => {
  const doc = await createDoc([
    itemOf(assets[0], 'LOSS', 'E2E盘点 现场未找到实物'),
    itemOf(assets[1], 'MATCHED', '账实相符')
  ])
  // 明细里明明有盘亏，客户端却传 hasDiff=false
  const submitted = await act(admin.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'submit',
    ctx: { amount: 0, hasDiff: false }
  })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)

  const assetManager = await approver('ROLE_ASSET')
  const first = await act(assetManager.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'approve',
    ctx: { amount: 0, hasDiff: false }
  })
  expect(first.status, JSON.stringify(first.body)).toBe(200)
  // 差异复核仍在生效：一次审批不能完结
  expect(first.body.data.status).toBe('PROCESSING')
  expect(await statusOf(String(doc.id))).toBe('PROCESSING')
})

test('[P10-05] 审批中的盘点单不能被直接改明细或删除', async () => {
  const doc = await createDoc([itemOf(assets[0], 'MATCHED', '账实相符')])
  const submitted = await act(admin.token, {
    docKey: 'inventory',
    docId: String(doc.id),
    action: 'submit',
    ctx: { amount: 0, hasDiff: false }
  })
  expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)

  const res = await withApi(admin.token, async api => {
    const put = await api.put(`/api/fixed-asset-inventory-docs/${doc.id}`, {
      data: { ...doc, items: [itemOf(assets[0], 'LOSS', 'E2E盘点 审批期间偷改')] }
    })
    const putBody = await put.json()
    const del = await api.delete(`/api/fixed-asset-inventory-docs/${doc.id}`)
    const delBody = await del.json()
    return { putStatus: put.status(), putBody, delStatus: del.status(), delBody }
  })
  expect(res.putStatus, JSON.stringify(res.putBody)).toBe(409)
  expect(res.delStatus, JSON.stringify(res.delBody)).toBe(409)
})

test('[P10-06] 明细超过 64KB 仍能创建并读回（TEXT 溢出回归）', async () => {
  const items = assets.map(a => itemOf(a, 'UNCHECKED', ''))
  const bytes = Buffer.byteLength(JSON.stringify(items), 'utf8')
  expect(bytes, '资产量不足，未覆盖到 64KB 场景').toBeGreaterThan(64 * 1024)

  const doc = await createDoc(items)
  expect((doc.items as Row[]).length).toBe(items.length)
  expect((doc.items as Row[])[0].assetId).toBe(items[0].assetId)
})

test('[P10-07] 连续完结两张有盘亏的盘点单：处置单号不冲突，审批不报 500', async () => {
  const assetManager = await approver('ROLE_ASSET')
  const auditor = await approver('ROLE_AUDITOR')

  const docs: string[] = []
  for (let i = 0; i < 2; i++) {
    const doc = await createDoc([
      itemOf(assets[i], 'LOSS', 'E2E盘点 现场未找到实物'),
      itemOf(assets[i + 1], 'MATCHED', '账实相符')
    ])
    docs.push(String(doc.id))
  }

  for (const docId of docs) {
    const submitted = await act(admin.token, {
      docKey: 'inventory',
      docId,
      action: 'submit',
      ctx: { amount: 0, hasDiff: true }
    })
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
    for (let i = 0; i < 2; i++) {
      const res = await act(assetManager.token, {
        docKey: 'inventory',
        docId,
        action: 'approve',
        ctx: { amount: 0, hasDiff: true }
      })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
    }
    const audited = await act(auditor.token, {
      docKey: 'inventory',
      docId,
      action: 'approve',
      ctx: { amount: 0, hasDiff: true }
    })
    expect(audited.status, JSON.stringify(audited.body)).toBe(200)
    expect(audited.body.data.status).toBe('DONE')
  }

  // 两张盘点单各自生成一张处置单，单号互不相同
  const disposes = await apiList(admin, 'fixed-asset-doc-lists-dispose')
  const generated = disposes.filter(d => String(d.remark || '').includes('盘点盘亏核销'))
  expect(generated.length).toBeGreaterThanOrEqual(2)
  expect(new Set(generated.map(d => String(d.code))).size).toBe(generated.length)
})

test('[P10-08] 盘点单号由服务端生成：不传单号也能建单且不撞号', async () => {
  const created: Row[] = []
  for (let i = 0; i < 2; i++) {
    const res = await withApi(admin.token, async api => {
      const r = await api.post('/api/fixed-asset-inventory-docs', {
        data: {
          docNo: '',
          name: `E2E_服务端单号_${i}`,
          companyId,
          applicant: 'E2E',
          creatorId: 'U1',
          scope: '全部资产',
          assetTypes: [],
          createTime: new Date().toISOString(),
          finishTime: '',
          remark: 'E2E 自动创建，用后删除',
          status: 'DRAFT',
          items: [],
          counters: []
        }
      })
      return { status: r.status(), body: await r.json() }
    })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.code).toBe(0)
    const docNo = String(res.body.data?.docNo || '')
    expect(docNo, '服务端未生成盘点单号').toMatch(/^PD\d{8}\d{3}$/)
    created.push(res.body.data)
  }
  // 两张单号互不相同
  expect(new Set(created.map(d => String(d.docNo))).size).toBe(2)
  docIds.push(...created.map(d => String(d.id)))
})
