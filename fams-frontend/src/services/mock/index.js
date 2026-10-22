/**
 * 契约驱动的 mock 引擎（"准接口"）
 *
 * 与 HTTP 实现一一对应，行为完全一致：
 * - 同样支持过滤 / 关键字 / 排序 / 分页（返回 { rows, total }）
 * - 同样按契约做校验（必填 / 类型 / 枚举），不通过抛 ApiError(422)
 * - 同样执行业务规则（唯一性 / 外键引用 / 删除保护 / 库存联动），冲突抛 409、引用抛 1005…
 * - 同样由"服务端"生成主键、维护审计字段（createTime/updateTime/version）
 *
 * 因此业务代码面向 dataService 编写时，切到真实后端无需改动。
 */
import { ApiError, ERROR_CODES } from '../errors'
import { getContract, idFieldOf, validateSeed, assertValid } from '../contract'
import { applyQuery, paginate } from './query'
import { checkUnique, checkRefs, checkProtect, applyStock, checkReturnLimit, primaryOf } from './rules'

const db = new Map()
const seeds = new Map()
let seq = 0
let hydrated = false
let persistTimer = null

// 数据模型升级后与旧结构不兼容，存储键升到 v3（旧键 v1/v2 自动失效并按最新种子重建）
const STORAGE_KEY = 'fams-mock-db-v3'

// 可通过环境变量模拟网络延迟与随机故障，演练 loading 与错误分支
const LATENCY = Number(import.meta.env.VITE_MOCK_LATENCY ?? 0) || 0
const ERROR_RATE = Number(import.meta.env.VITE_MOCK_ERROR_RATE ?? 0) || 0

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value))
}

/** 模拟服务端生成主键 */
function nextId() {
  seq += 1
  return `${Date.now().toString(36)}${seq.toString(36)}`
}

function nowIso() {
  return new Date().toISOString()
}

function actorName() {
  try {
    const raw = sessionStorage.getItem('user')
    const u = raw ? JSON.parse(raw) : null
    return u?.name || u?.username || 'system'
  } catch (e) {
    return 'system'
  }
}

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
    console.error('[mock] 本地数据读取失败，已回落到种子数据', e)
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
      console.error('[mock] 本地数据写入失败', e)
    }
  }, 30)
}

/** 供业务规则读写集合的上下文 */
const ctx = {
  read(key) {
    hydrate()
    if (!db.has(key)) return ensure(key)
    return db.get(key)
  },
  persist() {
    persist()
  }
}

/** 注册种子数据，仅首次生效；dev 期按契约校验，提前暴露字段/枚举不一致 */
export function registerSeed(key, seed) {
  if (seeds.has(key)) return
  const rows = Array.isArray(seed) ? clone(seed) : []
  seeds.set(key, rows)
  validateSeed(key, rows)
}

function ensure(key) {
  hydrate()
  if (db.has(key)) return db.get(key)
  const rows = clone(seeds.get(key) || [])
  const idField = idFieldOf(key)
  rows.forEach(row => {
    if (row && typeof row === 'object' && !row[idField]) row[idField] = nextId()
  })
  db.set(key, rows)
  return rows
}

/** 定位行：优先契约主键，兼容历史数据里的 id / _id / code */
function locate(rows, id, contract) {
  if (id === undefined || id === null || id === '') return -1
  const idField = contract?.idField || 'id'
  return rows.findIndex(row =>
    row && (row[idField] === id || row.id === id || row._id === id || row.code === id)
  )
}

function stampCreate(row, contract) {
  if (!contract?.audit) return
  const t = nowIso()
  const who = actorName()
  if (!row.createTime) row.createTime = t
  if (!row.createBy) row.createBy = who
  row.updateTime = t
  row.updateBy = who
  row.version = 1
}

function stampUpdate(row, contract) {
  if (!contract?.audit) return
  row.updateTime = nowIso()
  row.updateBy = actorName()
  row.version = (Number(row.version) || 0) + 1
}

async function simulate() {
  if (LATENCY) await new Promise(resolve => setTimeout(resolve, LATENCY))
  if (ERROR_RATE > 0 && Math.random() < ERROR_RATE) {
    throw new ApiError(ERROR_CODES.SERVER, '模拟服务异常（VITE_MOCK_ERROR_RATE）')
  }
}

export const mockService = {
  registerSeed,

  /** 列表查询：支持过滤/关键字/排序，返回全部命中行 */
  async list(key, params = {}) {
    await simulate()
    const rows = applyQuery(ensure(key), getContract(key), params)
    return clone(rows)
  },

  /** 分页查询：返回 { rows, total, page, pageSize } */
  async page(key, params = {}) {
    await simulate()
    const matched = applyQuery(ensure(key), getContract(key), params)
    const result = paginate(matched, params)
    return { rows: clone(result.rows), total: result.total, page: result.page, pageSize: result.pageSize }
  },

  /** 单条查询 */
  async get(key, id) {
    await simulate()
    const rows = ensure(key)
    const idx = locate(rows, id, getContract(key))
    if (idx === -1) throw new ApiError(ERROR_CODES.NOT_FOUND, '数据不存在')
    return clone(rows[idx])
  },

  async create(key, row) {
    await simulate()
    const contract = getContract(key)
    const record = clone(row) || {}

    // 1) 契约校验（必填/类型/枚举/日期格式）
    assertValid(contract, record)

    // 2) 主键由服务端生成
    const idField = contract?.idField || 'id'
    if (!record[idField]) record[idField] = nextId()

    // 3) 业务规则
    checkUnique(ctx, key, contract, record)
    checkRefs(ctx, contract, record)
    if (contract?.key === 'low-value-return') checkReturnLimit(ctx, contract, record)
    applyStock(ctx, contract, record, 'create')

    stampCreate(record, contract)
    const rows = ensure(key)
    rows.unshift(record)
    persist()

    // 库存联动可能改动了另一个集合，这里统一回写
    if (contract?.rules?.stock) persist()
    return clone(record)
  },

  async update(key, id, patch = {}) {
    await simulate()
    const contract = getContract(key)
    const rows = ensure(key)
    const idx = locate(rows, id, contract)
    if (idx === -1) throw new ApiError(ERROR_CODES.NOT_FOUND, '数据不存在')

    const next = { ...rows[idx], ...clone(patch) }
    assertValid(contract, next, { partial: true })

    checkUnique(ctx, key, contract, next, primaryOf(key, rows[idx]))
    checkRefs(ctx, contract, next)

    stampUpdate(next, contract)
    rows[idx] = next
    persist()
    return clone(next)
  },

  async remove(key, id) {
    await simulate()
    const contract = getContract(key)
    const rows = ensure(key)
    const idx = locate(rows, id, contract)
    if (idx === -1) throw new ApiError(ERROR_CODES.NOT_FOUND, '数据不存在')

    const target = rows[idx]
    // 删除保护（引用/子级/库存）优先于库存回退
    checkProtect(ctx, key, contract, primaryOf(key, target))
    // 单据删除时反向回退库存
    if (contract?.rules?.stock) applyStock(ctx, contract, target, 'delete')

    rows.splice(idx, 1)
    persist()
    return true
  },

  /** 批量保存（新增或更新）：对应后端 PUT /{key}/batch */
  async batch(key, rows) {
    await simulate()
    const contract = getContract(key)
    const idField = contract?.idField || 'id'
    const list = Array.isArray(rows) ? rows : []
    const current = ensure(key)
    const saved = []

    list.forEach(row => {
      const record = clone(row)
      const id = record[idField]
      const idx = id === undefined ? -1 : locate(current, id, contract)
      if (idx === -1) {
        if (!record[idField]) record[idField] = nextId()
        stampCreate(record, contract)
        current.unshift(record)
      } else {
        stampUpdate(record, contract)
        current[idx] = { ...current[idx], ...record }
      }
      saved.push(record)
    })

    persist()
    return clone(saved)
  },

  /** 清空集合：对应后端 DELETE /{key}/all */
  async clear(key) {
    await simulate()
    db.set(key, [])
    persist()
    return true
  },

  /** 调试用：重置为种子数据 */
  async reset() {
    db.clear()
    localStorage.removeItem(STORAGE_KEY)
    return true
  }
}

export default mockService
