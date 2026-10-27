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
import { TOKEN_STORAGE_KEY } from './keys'

const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const DEFAULT_TIMEOUT = 15000

/**
 * 401 处理器：由应用入口注入（router/index.js）。
 * http 层不反向依赖 router / store，避免循环依赖。
 */
let unauthorizedHandler = null
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn
}
function notifyUnauthorized() {
  if (!unauthorizedHandler) return
  try { unauthorizedHandler() } catch (e) { console.error('[http] 401 处理器异常', e) }
}

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
  let token = ''
  try { token = sessionStorage.getItem(TOKEN_STORAGE_KEY) || '' } catch (e) { /* 隐私模式下不可用 */ }
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
      const code = Number(body?.code ?? res.status ?? ERROR_CODES.SERVER)
      // 未登录 / token 失效：统一跳登录（文档约定 401 → 跳转登录）
      if (code === ERROR_CODES.UNAUTHORIZED) notifyUnauthorized()
      throw new ApiError(code, body?.message || `接口请求失败：${res.status}`, res.status, body?.details)
    }

    // 兼容统一信封 { code, message, data } 与裸数据两种形式
    if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body) {
      if (Number(body.code) !== 0) {
        if (Number(body.code) === ERROR_CODES.UNAUTHORIZED) notifyUnauthorized()
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

/**
 * multipart 表单请求（文件上传）。
 * 注意：不能手动设置 Content-Type，必须由浏览器自动补 multipart boundary，否则服务端无法解析。
 */
async function requestForm(path, formData, { timeout = 60000 } = {}) {
  if (!BASE) throw new ApiError(ERROR_CODES.SERVER, '未配置 VITE_API_BASE_URL，无法调用后端接口')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
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
      const code = Number(body?.code ?? res.status ?? ERROR_CODES.SERVER)
      if (code === ERROR_CODES.UNAUTHORIZED) notifyUnauthorized()
      throw new ApiError(code, body?.message || `接口请求失败：${res.status}`, res.status, body?.details)
    }
    if (body && typeof body === 'object' && !Array.isArray(body) && 'code' in body) {
      if (Number(body.code) !== 0) {
        if (Number(body.code) === ERROR_CODES.UNAUTHORIZED) notifyUnauthorized()
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

/**
 * 带鉴权的文件下载：下载接口需要 Authorization 头，
 * 因此不能直接用 <a href>（浏览器不会带自定义头），改为取 blob 后触发保存。
 */
async function downloadBlob(path, fallbackName) {
  if (!BASE) throw new ApiError(ERROR_CODES.SERVER, '未配置 VITE_API_BASE_URL，无法调用后端接口')
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() })
  if (!res.ok) throw new ApiError(ERROR_CODES.SERVER, `下载失败：${res.status}`)
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const matched = /filename="?([^"]+)"?/.exec(disposition)
  const name = matched ? matched[1] : fallbackName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
  },

  // ---------------------------------------------------------------- 业务动作

  /** 执行折旧计提（period 形如 2026-09） */
  async runDepreciation(period) {
    return request('/depreciation/run', { method: 'POST', data: { period } })
  },

  /** 折旧试算，不落库 */
  async previewDepreciation(period) {
    return request('/depreciation/preview', { method: 'POST', data: { period } })
  },

  /** 折旧计划明细 */
  async depreciationPlan(params) {
    return request('/depreciation/plan', { params })
  },

  /**
   * 执行审批动作（submit / approve / reject / revoke）。
   *
   * 审批是一个完整的业务动作，服务端会在一次请求内完成
   * 流程解析 → 权限校验 → 单据状态推进 → 审批轨迹落库，
   * 因此这里不走通用 CRUD，避免前端两次写入导致轨迹缺失或重复。
   */
  async approvalAction(payload) {
    return request('/approvals/action', { method: 'POST', data: payload })
  },

  // ---------------------------------------------------------------- 数据导入

  /** 可导入的资源列表（含字段元数据：类型/必填/唯一/枚举/引用） */
  async importResources() {
    const list = await request('/data-import/resources')
    return Array.isArray(list) ? list : []
  },

  /** 下载导入模板 CSV */
  async importTemplate(key) {
    return downloadBlob(`/data-import/template?key=${encodeURIComponent(key)}`, `${key}-template.csv`)
  },

  /**
   * 上传并导入（CSV / XLSX）。
   * abortOnError=true：先整批校验，任一单元格非法则整批拒绝、不落库；
   * abortOnError=false：逐行尝试，失败行记录在 failures 中，其余正常写入。
   */
  async importUpload(key, file, abortOnError = true) {
    const form = new FormData()
    form.append('file', file)
    return requestForm(
      `/data-import/upload?key=${encodeURIComponent(key)}&abortOnError=${abortOnError ? 'true' : 'false'}`,
      form
    )
  }
}

export { request }
export default httpService
