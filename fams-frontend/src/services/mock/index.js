// 内存版数据服务：行为与 HTTP 版一致（全部异步返回、返回深拷贝）
// 页面/ store 只依赖 services/index.js 暴露的 facade，不感知当前是 mock 还是后端
const db = new Map()
const seeds = new Map()
let seq = 0
let hydrated = false
let persistTimer = null

// 演示数据落 localStorage，刷新后仍保留用户改动；清空 localStorage 即可恢复种子
const STORAGE_KEY = 'fams-mock-db-v1'

function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && typeof saved === 'object') {
      Object.entries(saved).forEach(([key, rows]) => {
        if (Array.isArray(rows)) db.set(key, rows)
      })
    }
  } catch (e) {
    console.error(e)
  }
}

function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      const snapshot = {}
      db.forEach((rows, key) => { snapshot[key] = rows })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    } catch (e) {
      console.error(e)
    }
  }, 30)
}

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value))
}

function nextId() {
  seq += 1
  return `M${Date.now().toString(36)}${seq}`
}

/** 注册种子数据：只有首次注册生效，避免页面重复挂载时覆盖运行时数据 */
export function registerSeed(key, seed) {
  if (seeds.has(key)) return
  seeds.set(key, Array.isArray(seed) ? clone(seed) : [])
}

function ensure(key) {
  hydrate()
  if (db.has(key)) return db.get(key)
  const rows = clone(seeds.get(key) || [])
  rows.forEach(row => {
    if (row && typeof row === 'object' && !row._id) row._id = nextId()
  })
  db.set(key, rows)
  return rows
}

function locate(rows, id) {
  if (id === undefined || id === null) return -1
  return rows.findIndex(row => row && (row._id === id || row.id === id || row.code === id))
}

// 与 HTTP 版保持一致：读返回深拷贝、写只落库。
// 页面/store 维护自己的响应式副本，避免“服务已插入 + 页面再插入”造成重复；
// 行内嵌套字段的就地修改需显式调用 update()/save() 回写（与后端模式要求相同）。
export const mockService = {
  registerSeed,

  async list(key) {
    return clone(ensure(key))
  },

  async create(key, row) {
    const rows = ensure(key)
    const record = { ...clone(row) }
    if (!record._id) record._id = nextId()
    rows.unshift(record)
    persist()
    return clone(record)
  },

  async update(key, id, patch) {
    const rows = ensure(key)
    const idx = locate(rows, id)
    if (idx === -1) return null
    Object.assign(rows[idx], clone(patch || {}))
    if (!rows[idx]._id) rows[idx]._id = nextId()
    persist()
    return clone(rows[idx])
  },

  async remove(key, id) {
    const rows = ensure(key)
    const idx = locate(rows, id)
    if (idx === -1) return false
    rows.splice(idx, 1)
    persist()
    return true
  },

  async replaceAll(key, rows) {
    const next = Array.isArray(rows) ? clone(rows) : []
    next.forEach(row => {
      if (row && typeof row === 'object' && !row._id) row._id = nextId()
    })
    db.set(key, next)
    persist()
    return clone(next)
  }
}

export default mockService
