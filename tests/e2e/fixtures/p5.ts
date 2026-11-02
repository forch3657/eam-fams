import fs from 'node:fs'
import { apiAs, type Session } from './auth'

/** P5（报表 / 导入导出 / 消息 / 工作台）共用工具 */
export type Row = Record<string, any>

export async function withApi<T>(session: Session, fn: (api: any) => Promise<T>): Promise<T> {
  const api = await apiAs(session.token)
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

export async function toJson<T = any>(res: any, action: string): Promise<T> {
  const body = await res.json()
  if (!res.ok() || body.code !== 0) {
    throw new Error(`${action} 失败 HTTP ${res.status()} code=${body.code} ${body.message ?? ''}`)
  }
  return body.data as T
}

/** 不分页列表；pageSize 调大以覆盖全量，用于聚合口径交叉断言 */
export async function apiList(session: Session, key: string, query = ''): Promise<Row[]> {
  const sep = query ? `&${query}` : ''
  return withApi(session, async api =>
    toJson<Row[]>(await api.get(`/api/${key}?pageSize=2000${sep}`), `查询 ${key}`)
  )
}

export async function apiPost<T = Row>(session: Session, key: string, data: Row): Promise<T> {
  return withApi(session, async api =>
    toJson<T>(await api.post(`/api/${key}`, { data }), `创建 ${key}`)
  )
}

export async function apiDeleteQuiet(session: Session, path: string): Promise<void> {
  await withApi(session, api => api.delete(path).catch(() => null))
}

/** 直接把 CSV 传给导入接口（绕过界面，验证服务端校验/模式差异） */
export async function apiUpload(
  session: Session,
  path: string,
  file: { name: string; buffer: Buffer }
): Promise<{ status: number; body: Row }> {
  return withApi(session, async api => {
    const res = await api.post(path, {
      multipart: { file: { name: file.name, mimeType: 'text/csv', buffer: file.buffer } }
    })
    return { status: res.status(), body: await res.json() }
  })
}

/**
 * 生成导入 CSV：UTF-8 BOM + CRLF，可选 # 说明行。
 * 统一走这个函数，避免 Excel 另存为 GBK 丢行（见 feedback_csv_import_encoding）。
 */
export function csvBuffer(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  commentLines: string[] = []
): Buffer {
  const quote = (v: string | number | null | undefined) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.map(quote).join(',')]
  commentLines.forEach(l => lines.push(l))
  rows.forEach(r => lines.push(r.map(quote).join(',')))
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8')
}

export function readDownloadedCsv(filePath: string): string {
  const raw = fs.readFileSync(filePath)
  return raw.toString('utf8').replace(/^\uFEFF/, '')
}

export function csvRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter(line => line.trim() !== '')
    .map(line => line.split(',').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"')))
}

/** 与概览看板一致：四舍五入后千分位 */
export function fmtMoney(value: unknown): string {
  return Math.round(Number(value || 0)).toLocaleString('en-US')
}

export function todayStamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
