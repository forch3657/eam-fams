import type { APIRequestContext } from '@playwright/test'
import { apiAs, type Session } from './auth'

/** 固定资产用例共用：资产/单据工厂、审批动作、响应解析 */
export type OrgUnits = { companyId: string; deptId: string }

export function suffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e3).toString(36)}`
}

export async function withApi<T>(token: string, fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await apiAs(token)
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

export async function json<T = any>(res: any, action: string): Promise<T> {
  const body = await res.json()
  if (!res.ok() || body.code !== 0) {
    throw new Error(`${action} 失败 HTTP ${res.status()} code=${body.code} ${body.message ?? ''}`)
  }
  return body.data as T
}

/** 建一条资产；默认入账最小字段，断言聚焦状态机与联动 */
export async function createAsset(
  session: Session,
  units: OrgUnits,
  overrides: Record<string, unknown> = {}
): Promise<{ id: string; code: string; name: string }> {
  const code = String(overrides.code ?? `E2E_FA_${suffix()}`)
  const payload = {
    code,
    name: `E2E_资产_${code}`,
    category: 'ELECTRONIC',
    companyId: units.companyId,
    deptId: units.deptId || undefined,
    userId: session.user.id,
    location: 'E2E_位置',
    purchaseDate: '2026-01-15',
    inboundDate: '2026-01-16',
    amount: 1000,
    original: 1000,
    net: 1000,
    status: 'IDLE',
    depreciate: false,
    purchaseMode: 'PURCHASE',
    ...overrides
  }
  return withApi(session.token, async api => {
    const created = await json<{ id: string }>(await api.post('/api/fixed-assets', { data: payload }), '创建资产')
    return { id: created.id, code, name: String(payload.name) }
  })
}

/** 建一张固定资产单据（10 个集合字段同构，仅流程不同） */
export async function createDoc(
  session: Session,
  units: OrgUnits,
  bizKey: string,
  options: { assetId: string; creatorId?: string; code?: string; status?: string; name?: string } = { assetId: '' }
): Promise<{ id: string; code: string }> {
  const code = options.code ?? `E2E_DOC_${suffix()}`
  const payload = {
    code,
    name: options.name ?? `E2E_单据_${code}`,
    companyId: units.companyId,
    assetId: options.assetId,
    creatorId: options.creatorId ?? session.user.id,
    createTime: new Date().toISOString(),
    finishTime: '',
    remark: 'E2E 自动创建，用后删除',
    status: options.status ?? 'DRAFT'
  }
  return withApi(session.token, async api => {
    const created = await json<{ id: string }>(
      await api.post(`/api/fixed-asset-doc-lists-${bizKey}`, { data: payload }),
      `创建单据(${bizKey})`
    )
    return { id: created.id, code }
  })
}

/** 盘点单；docKey=inventory 对应 fixed-asset-inventory-docs */
export async function createInventoryDoc(
  session: Session,
  units: OrgUnits,
  options: { docNo?: string; items?: unknown[]; status?: string; remark?: string } = {}
): Promise<{ id: string; docNo: string }> {
  const docNo = options.docNo ?? `E2E_PD_${suffix()}`
  return withApi(session.token, async api => {
    const created = await json<{ id: string }>(
      await api.post('/api/fixed-asset-inventory-docs', {
        data: {
          docNo,
          name: `E2E_盘点单_${docNo}`,
          companyId: units.companyId,
          applicant: 'E2E',
          creatorId: session.user.id,
          scope: '全部资产',
          assetTypes: [],
          createTime: new Date().toISOString(),
          finishTime: '',
          remark: options.remark ?? 'E2E 自动创建，用后删除',
          status: options.status ?? 'DRAFT',
          items: options.items ?? [],
          counters: []
        }
      }),
      '创建盘点单'
    )
    return { id: created.id, docNo }
  })
}

/**
 * 清理单据：审批中的单据不能直接 DELETE（P1-D1 守卫返回 409），
 * 先用创建人身份撤销，再删除；轨迹由后端 afterDelete 级联清理。
 */
export async function deleteDocQuietly(api: APIRequestContext, bizKey: string, id: string): Promise<void> {
  const direct = await api.delete(`/api/fixed-asset-doc-lists-${bizKey}/${id}`)
  if (direct.ok()) return
  await api
    .post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, docKey: bizKey, docId: id, action: 'revoke' }
    })
    .catch(() => null)
  await api.delete(`/api/fixed-asset-doc-lists-${bizKey}/${id}`).catch(() => null)
}

export async function docStatus(session: Session, bizKey: string, id: string): Promise<string> {
  return withApi(session.token, async api => {
    const row = await json<Record<string, unknown>>(
      await api.get(`/api/fixed-asset-doc-lists-${bizKey}/${id}`),
      '读取单据'
    )
    return String(row.status)
  })
}

/**
 * 审批动作；在上下文销毁前读完响应体。
 * ctx 参与环节条件过滤（amount / hasDiff），必须与提交时保持一致，
 * 否则条件环节会因为 amount 为空而被视为「生效」。
 */
export async function act(
  token: string,
  payload: {
    docKey: string
    docId: string
    action: string
    comment?: string
    ctx?: Record<string, unknown>
    /** 加签 / 转办 / 抄送的目标人员 */
    targetUserId?: string
  }
) {
  return withApi(token, async api => {
    const res = await api.post('/api/approvals/action', {
      data: { ctx: { amount: 0, hasDiff: false }, ...payload }
    })
    return { status: res.status(), body: await res.json() }
  })
}
