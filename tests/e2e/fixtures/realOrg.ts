import fs from 'node:fs'
import path from 'node:path'
import { expect } from '@playwright/test'
import { loginViaApi, type Session } from './auth'
import { apiList, withApi, type Row } from './p5'
import { deleteDocQuietly } from './fixedAsset'

/**
 * 福州数据技术研究院有限公司「真实组织回归」夹具。
 *
 * 口径（2026-11-04 用户确认）：
 * - 只登录真人账号，不新建 / 不删除任何真实账号，不修改部门 `leader_id` / `vp_id`；
 * - 测试单据挂真人名下，`code` / `name` / `remark` 统一 `E2E_ORG_` 前缀；
 * - 清理只删本轮新增单据（按基线 id 差集 + 前缀双过滤），并把被改动过的资产整行还原；
 * - 用户手工草稿盘点单 `PD20261104001` 必须原样保留；
 * - R2 资产管理员在真实人员里没有独立账号，按用户确认由 `admin` 兜底。
 *
 * 初始口令只存在于本文件常量中，不写入日志、报告或任何产物。
 */

export const COMPANY_ID = 'mvsv021s37'
export const COMPANY_CODE = 'GS-0001'
export const COMPANY_NAME = '福州数据技术研究院有限公司'
export const HAND_DRAFT_DOC_NO = 'PD20261104001'
export const DOC_PREFIX = 'E2E_ORG_'

/** 真实人员初始口令：来自「数据录入准备/org-structure-fzidt.csv」，仅本夹具持有 */
const REAL_PASSWORD = 'Fzidt@2026!'
const ADMIN_PASSWORD = 'Fzidt@123'

export interface RealOrgActor {
  /** 运行时按 username 从生产库解析，不硬编码主键 */
  id: string
  username: string
  name: string
  roleIds: string[]
  password: string
}

export interface RealOrgDept {
  deptId: string
  deptCode: string
  deptName: string
  /** 2026-11-04 生产库基线资产数，仅用于核对报告，运行时按实际数断言 */
  assetCount: number
  actors: {
    user: RealOrgActor
    deptLeader: RealOrgActor
    vp: RealOrgActor
    assetManager: RealOrgActor
    finance: RealOrgActor
    warehouse: RealOrgActor
    auditor: RealOrgActor
  }
}

const actor = (username: string, name: string, roleIds: string[], password = REAL_PASSWORD): RealOrgActor => ({
  id: '', username, name, roleIds, password
})

/** 系统管理员同时是唯一的 R2 资产管理员（真实人员里没有独立 R2） */
const adminActor = actor('admin', '系统管理员', ['R1', 'R2'], ADMIN_PASSWORD)

/** 跨部门职能角色池：全部为在册真人 */
export const POOL = {
  admin: adminActor,
  assetManager: adminActor,
  /** 财务资金部 会计岗 */
  finance: actor('13599071971', '李弥贤', ['R4']),
  /** 综合管理部 行政管理岗 */
  warehouse: actor('18120648615', '陈铃', ['R3', 'R8']),
  /** 综合管理部 纪检专干 */
  auditor: actor('15750891336', '陈容源', ['R3', 'R6']),
  /** 董事长，全公司 8 个部门的 vp_id */
  vp: actor('18559869119', '郭晓雅', ['R7', 'mvu9z81n35'])
}

/** 8 个「在册有资产」部门；部门负责人 / 分管领导与生产库 leader_id / vp_id 一一对应 */
export const REAL_ORG_DEPTS: RealOrgDept[] = [
  {
    deptId: 'mvsv022441', deptCode: 'BM-0001', deptName: '公司领导', assetCount: 2,
    actors: {
      // 该部门没有 R3 使用人，按真实组织由部门负责人（R7 领导班子）兼任
      user: actor('18605917225', '严坤斌', ['R7', 'mvu9z81n35']),
      deptLeader: actor('18605917225', '严坤斌', ['R7', 'mvu9z81n35']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv022n43', deptCode: 'BM-0003', deptName: '综合管理部（党群工作部）', assetCount: 16,
    actors: {
      user: actor('18350296364', '江小芳', ['R3']),
      deptLeader: actor('15960118864', '程乔楠', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv022r45', deptCode: 'BM-0005', deptName: '财务资金部', assetCount: 3,
    actors: {
      // 该部门没有 R3 使用人，由财务人员兼任（兼任口径登记在核对报告）
      user: actor('13599071971', '李弥贤', ['R4']),
      deptLeader: actor('13599964281', '陈宇', ['R5', 'R4']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv022u46', deptCode: 'BM-0006', deptName: '产品研发一部', assetCount: 20,
    actors: {
      user: actor('13015764128', '陈学知', ['R3']),
      deptLeader: actor('18659186605', '石顺中', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv022w47', deptCode: 'BM-0007', deptName: '产品研发二部', assetCount: 2,
    actors: {
      user: actor('15960191291', '李良', ['R3']),
      deptLeader: actor('18900220150', '陈福沨', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv022x48', deptCode: 'BM-0008', deptName: '科技创新部', assetCount: 1,
    actors: {
      user: actor('15059250197', '林姝含', ['R3']),
      deptLeader: actor('15205002251', '陈阳红', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv023050', deptCode: 'BM-0010', deptName: '项目管理部', assetCount: 1,
    actors: {
      user: actor('15960068070', '周彦嵘', ['R3']),
      deptLeader: actor('13799423891', '廖文琪', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  },
  {
    deptId: 'mvsv023251', deptCode: 'BM-0011', deptName: '市场营销部', assetCount: 1,
    actors: {
      user: actor('18906910676', '陈绪水', ['R3']),
      deptLeader: actor('13704011580', '李林', ['R5']),
      vp: POOL.vp, assetManager: POOL.assetManager,
      finance: POOL.finance, warehouse: POOL.warehouse, auditor: POOL.auditor
    }
  }
]

/** 需要按基线差集清理/复核的集合（轨迹只读，不参与删除） */
export const DOC_COLLECTIONS = [
  'fixed-asset-doc-lists-inbound', 'fixed-asset-doc-lists-alloc', 'fixed-asset-doc-lists-back',
  'fixed-asset-doc-lists-borrow', 'fixed-asset-doc-lists-transfer', 'fixed-asset-doc-lists-repair',
  'fixed-asset-doc-lists-change', 'fixed-asset-doc-lists-dispose',
  'fixed-asset-inventory-docs', 'fixed-asset-inventory-plans', 'fixed-asset-doc-approvals'
]

const DELETABLE_COLLECTIONS = DOC_COLLECTIONS.filter(k => k !== 'fixed-asset-doc-approvals')

export interface RealOrgResult {
  caseId: string
  deptName: string
  flow: string
  actors: string[]
  steps: string[]
  ledgerBefore: string
  ledgerAfter: string
  derived: string[]
  ok: boolean
}

export interface DeptConfig {
  leaderId: string
  vpId: string
  name: string
  code: string
}

export interface RealOrgContext {
  admin: Session
  sessions: Map<string, Session>
  actors: RealOrgActor[]
  depts: RealOrgDept[]
  assetsByDept: Map<string, Row[]>
  assetSnapshot: Map<string, Row>
  deptConfig: Map<string, DeptConfig>
  baselineIds: Map<string, Set<string>>
  baselineUserCount: number
  handDraft: Row
  touchedAssets: Set<string>
  results: RealOrgResult[]
  notes: string[]
}

const roleIdsOf = (row: Row): string[] => {
  if (Array.isArray(row.roleIds)) return row.roleIds.map(String)
  try {
    const parsed = JSON.parse(String(row.roleIds ?? '[]'))
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/**
 * 一次性完成：登录全部真人 → 解析账号 id → 校验部门配置 → 快照资产/单据/轨迹基线。
 * 任何一项与真实组织矩阵不符即抛错，避免「测了一圈其实测的是临时账号」。
 */
export async function loadRealOrg(admin: Session): Promise<RealOrgContext> {
  const [userRows, deptRows, assetRows] = await Promise.all([
    apiList(admin, 'org-users', `companyId=${encodeURIComponent(COMPANY_ID)}`),
    apiList(admin, 'org-departments', `companyId=${encodeURIComponent(COMPANY_ID)}`),
    apiList(admin, 'fixed-assets', `companyId=${encodeURIComponent(COMPANY_ID)}`)
  ])

  const byUsername = new Map<string, Row>(userRows.map(u => [String(u.username), u]))
  const actorSet = new Set<RealOrgActor>()
  Object.values(POOL).forEach(a => actorSet.add(a))
  REAL_ORG_DEPTS.forEach(d => Object.values(d.actors).forEach(a => actorSet.add(a)))
  const actors = [...actorSet]

  for (const a of actors) {
    const row = a.username === 'admin'
      ? { id: admin.user.id, username: 'admin', name: '系统管理员', status: 'ENABLED', roleIds: ['R1', 'R2'] }
      : byUsername.get(a.username)
    if (!row) throw new Error(`真实账号缺失：${a.name}(${a.username})，请先用组织架构 CSV 补齐后再跑回归`)
    if (String(row.status) !== 'ENABLED') throw new Error(`真实账号已停用：${a.name}(${a.username})`)
    const actualRoles = roleIdsOf(row)
    for (const expected of a.roleIds) {
      if (!actualRoles.includes(expected)) {
        throw new Error(`真实账号 ${a.name}(${a.username}) 缺少角色 ${expected}，实际 ${actualRoles.join('/')}`)
      }
    }
    a.id = String(row.id)
  }

  const deptConfig = new Map<string, DeptConfig>()
  for (const d of REAL_ORG_DEPTS) {
    const row = deptRows.find(r => String(r.id) === d.deptId)
    if (!row) throw new Error(`真实部门缺失：${d.deptName}(${d.deptId})`)
    const leaderId = String(row.leaderId ?? '')
    const vpId = String(row.vpId ?? '')
    if (leaderId !== d.actors.deptLeader.id) {
      throw new Error(`${d.deptName} leader_id=${leaderId} 与真实部门负责人 ${d.actors.deptLeader.name}(${d.actors.deptLeader.id}) 不一致`)
    }
    if (vpId !== d.actors.vp.id) {
      throw new Error(`${d.deptName} vp_id=${vpId} 与真实分管领导 ${d.actors.vp.name}(${d.actors.vp.id}) 不一致`)
    }
    deptConfig.set(d.deptId, { leaderId, vpId, name: String(row.name), code: String(row.code) })
  }

  const assetsByDept = new Map<string, Row[]>()
  const assetSnapshot = new Map<string, Row>()
  assetRows.forEach(a => assetSnapshot.set(String(a.id), a))
  for (const d of REAL_ORG_DEPTS) {
    const list = assetRows.filter(a => String(a.deptId) === d.deptId)
    if (!list.length) throw new Error(`${d.deptName} 在册资产为 0，真实组织回归无法覆盖该部门`)
    assetsByDept.set(d.deptId, list)
  }

  const baselineIds = new Map<string, Set<string>>()
  for (const key of DOC_COLLECTIONS) {
    baselineIds.set(key, new Set((await apiList(admin, key)).map(r => String(r.id))))
  }
  const handDraft = (await apiList(admin, 'fixed-asset-inventory-docs'))
    .find(r => String(r.docNo) === HAND_DRAFT_DOC_NO)
  if (!handDraft) throw new Error(`用户手工草稿盘点单 ${HAND_DRAFT_DOC_NO} 丢失，停止回归`)

  const sessions = new Map<string, Session>()
  sessions.set('admin', admin)
  for (const a of actors) {
    if (a.username === 'admin' || sessions.has(a.username)) continue
    sessions.set(a.username, await loginViaApi({ username: a.username, password: a.password }))
  }

  return {
    admin, sessions, actors, depts: REAL_ORG_DEPTS,
    assetsByDept, assetSnapshot, deptConfig, baselineIds,
    baselineUserCount: userRows.length,
    handDraft, touchedAssets: new Set(), results: [],
    notes: [
      'R2 资产管理员在真实人员中无独立账号，按用户确认由 admin 兜底；其余环节全部使用真人。',
      '公司领导、财务资金部两个部门没有 R3 使用人，由本部门负责人/财务人员兼任提交。',
      'WF1 入库与 WF9 盘点按产品口径保留角色池，是纵向审批的明确例外。',
      '维修 / 变更流程按业务口径不改变资产在用状态，台账断言为「状态保持」。'
    ]
  }
}

export function sessionOf(ctx: RealOrgContext, a: RealOrgActor): Session {
  const session = ctx.sessions.get(a.username)
  if (!session) throw new Error(`真实账号 ${a.name}(${a.username}) 未登录`)
  return session
}

/** 部门配置前后一致：既比对运行时快照，也比对 leader/vp 是否仍指向矩阵里的真人 */
export async function assertDeptConfigUnchanged(ctx: RealOrgContext): Promise<void> {
  const rows = await apiList(ctx.admin, 'org-departments', `companyId=${encodeURIComponent(COMPANY_ID)}`)
  for (const d of ctx.depts) {
    const row = rows.find(r => String(r.id) === d.deptId)
    expect(row, `${d.deptName} 部门配置丢失`).toBeTruthy()
    const before = ctx.deptConfig.get(d.deptId)!
    expect(String(row!.leaderId ?? ''), `${d.deptName} leader_id 被改动`).toBe(before.leaderId)
    expect(String(row!.vpId ?? ''), `${d.deptName} vp_id 被改动`).toBe(before.vpId)
  }
}

/**
 * 逆序清理：本轮新增单据 → 派生单据 → 资产整行还原。
 * 删除条件为「不在基线 id 集合」且「code/name/remark 带 E2E_ORG_」，双过滤确保
 * 绝不误删真实业务单据；轨迹由后端 afterDelete 级联清理，本夹具不直接删只读集合。
 */
export async function cleanupRealOrg(ctx: RealOrgContext): Promise<void> {
  await withApi(ctx.admin, async api => {
    for (const key of [...DELETABLE_COLLECTIONS].reverse()) {
      const res = await api.get(`/api/${key}?pageSize=2000`)
      const rows: Row[] = res.ok() ? (((await res.json()).data ?? []) as Row[]) : []
      const base = ctx.baselineIds.get(key) ?? new Set<string>()
      const created = rows.filter(r =>
        !base.has(String(r.id)) &&
        [r.code, r.name, r.remark, r.docNo].some(v => String(v ?? '').includes(DOC_PREFIX))
      )
      for (const row of [...created].reverse()) {
        const id = String(row.id)
        if (key.startsWith('fixed-asset-doc-lists-')) {
          await deleteDocQuietly(api, key.slice('fixed-asset-doc-lists-'.length), id)
        } else {
          if (String(row.status ?? '') === 'PROCESSING') {
            await api.post('/api/approvals/action', {
              data: {
                docKey: 'inventory', docId: id, action: 'revoke',
                ctx: { amount: 0, hasDiff: true }
              }
            }).catch(() => null)
          }
          await api.delete(`/api/${key}/${id}`).catch(() => null)
        }
      }
    }

    for (const id of ctx.touchedAssets) {
      const original = ctx.assetSnapshot.get(id)
      if (!original) continue
      const res = await api.get(`/api/fixed-assets/${id}`)
      if (!res.ok()) continue
      const current = ((await res.json()).data ?? {}) as Row
      await api.put(`/api/fixed-assets/${id}`, {
        data: {
          ...current,
          status: original.status,
          userId: original.userId,
          inboundDate: original.inboundDate
        }
      }).catch(() => null)
    }
  })
}

/** 复核结果落盘（不含任何口令），供核对报告与人工复查引用 */
export function writeRealOrgReport(ctx: RealOrgContext): string {
  const dir = path.resolve(process.cwd(), 'e2e-artifacts')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'real-org-result.json')
  const safeActor = (a: RealOrgActor) => ({ id: a.id, username: a.username, name: a.name, roles: a.roleIds })
  const payload = {
    company: COMPANY_NAME,
    companyId: COMPANY_ID,
    companyCode: COMPANY_CODE,
    generatedAt: new Date().toISOString(),
    accountPolicy: '仅登录真实人员账号；R2 资产管理员由 admin 兜底；未新建/删除任何真实账号；未改动部门 leader_id/vp_id',
    handDraftInventoryDoc: { docNo: String(ctx.handDraft.docNo), status: String(ctx.handDraft.status) },
    departments: ctx.depts.map(d => ({
      deptId: d.deptId,
      deptCode: d.deptCode,
      deptName: d.deptName,
      baselineAssetCount: d.assetCount,
      observedAssetCount: (ctx.assetsByDept.get(d.deptId) ?? []).length,
      leaderId: ctx.deptConfig.get(d.deptId)?.leaderId,
      vpId: ctx.deptConfig.get(d.deptId)?.vpId,
      actors: {
        user: safeActor(d.actors.user),
        deptLeader: safeActor(d.actors.deptLeader),
        vp: safeActor(d.actors.vp),
        assetManager: safeActor(d.actors.assetManager),
        finance: safeActor(d.actors.finance),
        warehouse: safeActor(d.actors.warehouse),
        auditor: safeActor(d.actors.auditor)
      }
    })),
    results: ctx.results,
    notes: ctx.notes
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8')
  return file
}
