/**
 * 展示层格式化工具
 * 数据层统一存 ISO 8601（如 2026-09-18T10:22:31），展示时按需格式化，
 * 避免视图直接渲染原始字段或各自拼接字符串。
 */

function pad(n) {
  return String(n).padStart(2, '0')
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  if (!text) return null
  // 兼容 'YYYY-MM-DD HH:mm:ss' 与 'YYYY-MM-DDTHH:mm:ss'
  const normalized = text.includes('T') ? text : text.replace(' ', 'T')
  const d = new Date(normalized)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 日期时间：2026-09-18 10:22:31 */
export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** 日期：2026-09-18 */
export function formatDate(value) {
  const d = toDate(value)
  if (!d) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 金额千分位：86420 -> 86,420.00；传 decimals=0 则不带小数 */
export function formatMoney(value, decimals = 2) {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** 当前时间（ISO，用于前端构造请求参数） */
export function nowIso() {
  return new Date().toISOString()
}

export default { formatDateTime, formatDate, formatMoney, nowIso }
