// 极简 HTTP 封装：基于 fetch，不引入额外依赖
// 仅在 VITE_USE_MOCK=false 且 VITE_API_BASE_URL 非空时被使用
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const DEFAULT_TIMEOUT = 15000

function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    search.append(k, String(v))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function authHeaders() {
  const token = sessionStorage.getItem('token') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function request(path, { method = 'GET', params, data, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!BASE) throw new Error('未配置 VITE_API_BASE_URL，无法调用后端接口')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}${buildQuery(params)}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal
    })
    if (!res.ok) throw new Error(`接口请求失败：${res.status} ${path}`)
    const text = await res.text()
    if (!text) return null
    const json = JSON.parse(text)
    // 兼容后端统一返回体 { code, data, rows } 与裸数据两种形式
    if (json && typeof json === 'object' && !Array.isArray(json) && 'data' in json) return json.data
    return json
  } finally {
    clearTimeout(timer)
  }
}

export const httpService = {
  async list(key, params) {
    const rows = await request(`/${key}`, { params })
    return Array.isArray(rows) ? rows : []
  },
  async create(key, row) {
    return request(`/${key}`, { method: 'POST', data: row })
  },
  async update(key, id, patch) {
    return request(`/${key}/${encodeURIComponent(id)}`, { method: 'PUT', data: patch })
  },
  async remove(key, id) {
    return request(`/${key}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  async replaceAll(key, rows) {
    return request(`/${key}/batch`, { method: 'PUT', data: rows })
  }
}

export default httpService
