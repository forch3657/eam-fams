/**
 * 查询执行器：模拟服务端的过滤 / 关键字 / 排序 / 分页
 * mock 与后端使用同一套参数语义，页面迁移到服务端分页时无需改调用方式。
 *
 * 支持参数：
 * - keyword       关键字，在契约声明的 keyword 字段内做包含匹配
 * - <任意字段>     精确过滤；传数组表示 IN 查询
 * - sortBy/sortOrder  排序字段与方向（asc/desc）
 * - page/pageSize 分页（第几页 / 每页条数）
 */

const RESERVED = new Set(['keyword', 'sortBy', 'sortOrder', 'page', 'pageSize', '_t'])

function text(v) {
  return v === undefined || v === null ? '' : String(v)
}

/** 按契约执行过滤与排序，返回命中的全部行（不分页） */
export function applyQuery(rows, contract, params = {}) {
  const { keyword, sortBy, sortOrder } = params
  let out = Array.isArray(rows) ? rows.slice() : []

  // 关键字：命中契约声明的任意字段即算匹配
  const kw = String(keyword || '').trim().toLowerCase()
  if (kw) {
    const fields = contract?.query?.keyword || []
    const scope = fields.length ? fields : Object.keys(contract?.fields || {})
    out = out.filter(row => scope.some(fld => text(row[fld]).toLowerCase().includes(kw)))
  }

  // 字段过滤
  Object.entries(params).forEach(([field, value]) => {
    if (RESERVED.has(field)) return
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) {
      if (!value.length) return
      const set = new Set(value.map(text))
      out = out.filter(row => set.has(text(row[field])))
    } else {
      out = out.filter(row => text(row[field]) === text(value))
    }
  })

  // 排序
  if (sortBy) {
    const dir = String(sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1
    out.sort((a, b) => {
      const av = a[sortBy]
      const bv = b[sortBy]
      if (av === bv) return 0
      if (av === undefined || av === null) return 1
      if (bv === undefined || bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return text(av).localeCompare(text(bv), 'zh-CN') * dir
    })
  }

  return out
}

/** 分页切片，产出服务端风格的结果 */
export function paginate(list, params = {}) {
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = Math.max(1, Number(params.pageSize) || 20)
  const start = (page - 1) * pageSize
  return {
    rows: list.slice(start, start + pageSize),
    total: list.length,
    page,
    pageSize
  }
}

/** 一步到位：过滤 + 排序 + 分页 */
export function runQuery(rows, contract, params = {}) {
  const matched = applyQuery(rows, contract, params)
  return paginate(matched, params)
}

export default runQuery
