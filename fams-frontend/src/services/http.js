/**
 * HTTP 适配层：按 API 契约对接真实后端
 *
 * 约定（见 docs/API_CONTRACT.md）：
 * - 统一响应信封 { code, message, data }，code=0 为成功，非 0 抛 ApiError
 * - 列表   GET    /{key}             -> data: Row[]
 * - 分页   GET    /{key}/page        -> data: { rows, total, page, pageSize }
 * - 详情   GET    /{key}/{id}        -> data: Row
 * - 新增   POST   /{key}             -> data: Row
 * - 更新   PUT    /{key}/{id}        -> data: Row
 * - 删除   DELETE /{key}/{id}        -> data: true
 * - 批量   PUT    /{key}/batch       -> data: Row[]
 * - 清空   DELETE /{key}/all         -> data: true
 *
 * 行为与 mock 引擎完全一致（同样的参数语义、同样的错误模型），
 * 因此上层业务代码在两种模式下无需分支。
 */
import { ApiError, ERROR_CODES } from './errors'

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const DEFAULT_TIMEOUT = 15000

function buildQuery(params) {
  if (!params) return ''
  const search = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return
    if (Array.isArray(v)) {
      v.forEach(item => search.append(k, String(item)))
      return
    }
    search.append(k, String(v))
  })
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

function authHeaders() {
  const token = sessionStorage.getItem('token') || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, { method = 'GET', params, data, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!BASE) throw new ApiError(ERROR_CODES.SERVER, '未配置 VITE_API_BASE_URL，无法调用后端接口')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}${buildQuery(params)}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: controller.signal
    })

    const text = await res.text()
    let body = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch (e) {
        throw new ApiError(ERROR_CODES.SERVER, '接口返回内容无法解析', res.status)
      }
    }

    if (!res.ok) {
      const code = body?.code || res.status || ERROR_CODES.SERVER
      throw new ApiError(code, body?.message || `接口请求失败：${res.status}`, res.status, body?.details)
    }

    // 兼容统一信封 { code, message, data } 与裸数据两种形式
    if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body) {
      if (Number(body.code) !== 0) {
        throw new ApiError(Number(body.code), body.message || '操作失败', res.status, body.details)
      }
      return body.data
    }
    return body
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err?.name === 'AbortError') throw new ApiError(ERROR_CODES.SERVER, '接口请求超时')
    throw new ApiError(ERROR_CODES.SERVER, err?.message || '网络异常')
  } finally {
    clearTimeout(timer)
  }
}

export const httpService = {
  async list(key, params) {
    const rows = await request(`/${key}`, { params })
    return Array.isArray(rows) ? rows : []
  },

  async page(key, params) {
    const data = await request(`/${key}/page`, { params })
    if (data && Array.isArray(data.rows)) {
      return { rows: data.rows, total: Number(data.total) || 0, page: Number(data.page) || 1, pageSize: Number(data.pageSize) || 20 }
    }
    const rows = Array.isArray(data) ? data : []
    return { rows, total: rows.length, page: 1, pageSize: rows.length || 20 }
  },

  async get(key, id) {
    return request(`/${key}/${encodeURIComponent(id)}`)
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

  async batch(key, rows) {
    return request(`/${key}/batch`, { method: 'PUT', data: rows })
  },

  async clear(key) {
    return request(`/${key}/all`, { method: 'DELETE' })
  }
}

export { request }
export default httpService
