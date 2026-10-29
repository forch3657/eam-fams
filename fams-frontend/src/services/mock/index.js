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
import { ApiError, ERROR_CODES, apiError } from '../errors'
import { USER_STORAGE_KEY } from '../keys'
import { getContract, idFieldOf, validateSeed, assertValid } from '../contract'
import { applyQuery, paginate } from './query'
import { labelOf } from '../../constants/enums'
import { checkUnique, checkRefs, checkProtect, applyStock, applyStockOnStatusChange, releaseStock, checkReturnLimit, primaryOf } from './rules'

const db = new Map()
const seeds = new Map()
let seq = 0
let hydrated = false
let persistTimer = null

// 数据模型升级后与旧结构不兼容，存储键升到 v10（旧键 v1~v9 自动失效并按最新种子重建）
const STORAGE_KEY = 'fams-mock-db-v10'

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
    // 键必须与 store/user.js 写入的一致，否则审计字段恒为 'system'
    const raw = sessionStorage.getItem(USER_STORAGE_KEY)
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

/**
 * 乐观锁校验：提交方携带 version 时，与服务端当前 version 比对。
 *
 * - 携带 version 且不一致 → 说明期间已被他人修改，抛 409 冲突
 * - 不携带 version → 视为"不参与并发控制"（兼容只改部分字段的调用），放行
 *
 * 后端需按同样语义实现：PUT 时比对 body.version 与库里 version，不一致返回 409。
 */
function assertVersionMatch(contract, previous, patch) {
  if (!contract?.audit) return
  const given = patch?.version
  if (given === undefined || given === null || given === '') return
  const current = Number(previous.version) || 0
  const submitted = Number(given)
  if (!Number.isFinite(submitted)) return
  if (submitted !== current) throw apiError.versionConflict(current, submitted)
}

async function simulate() {
  if (LATENCY) await new Promise(resolve => setTimeout(resolve, LATENCY))
  if (ERROR_RATE > 0 && Math.random() < ERROR_RATE) {
    throw new ApiError(ERROR_CODES.SERVER, '模拟服务异常（VITE_MOCK_ERROR_RATE）')
  }
}

/** 期间与起始日之间的整月数（mock 演示口径，与后端 usedMonths 一致） */
function monthsBetween(startText, period) {
  if (!startText) return 0
  const start = new Date(startText)
  if (Number.isNaN(start.getTime())) return 0
  const [y, m] = String(period || '').split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 0
  return Math.max(0, (y - start.getFullYear()) * 12 + (m - 1 - start.getMonth()))
}

/**
 * mock 模式的折旧试算/计提：与后端 DepreciationService 同口径的直线法简化实现。
 * 演示环境的规则/计划数据量很小，按「规则名称包含分类中文名」匹配即可。
 */
function mockDepreciation(period, persist) {
  const assets = ensure('fixed-assets').filter(a => a && (a.depreciate === true || a.depreciate === 'true'))
  const rules = ensure('fixed-asset-settings-depreciation-rules')
  const details = []
  const planRows = []
  let opening = 0
  let monthlyTotal = 0
  let accumulatedTotal = 0
  let netTotal = 0

  assets.forEach(asset => {
    const category = asset.category || asset.categoryCode || ''
    const categoryName = labelOf('ASSET_CATEGORY', category)
    const rule = rules.find(r => r.name && categoryName && r.name.includes(categoryName)) || rules[0]
    const years = Number(rule?.usefulLife) || 5
    const residualRate = Number(rule?.residualRate ?? 5)
    const original = Number(asset.original ?? asset.amount ?? 0)
    const totalMonths = Math.max(1, years * 12)
    const cap = original * (1 - residualRate / 100)
    const monthly = Math.round(cap / totalMonths * 100) / 100
    const used = Math.min(monthsBetween(asset.inboundDate || asset.purchaseDate, period), totalMonths)
    const accumulated = Math.min(Math.round(monthly * used * 100) / 100, Math.round(cap * 100) / 100)
    const net = Math.round((original - accumulated) * 100) / 100

    details.push({
      id: nextId(),
      assetId: asset.id,
      name: asset.name,
      originalValue: original,
      depreciationMethod: rule?.method || 'STRAIGHT_LINE',
      usefulLife: totalMonths,
      accumulatedDepreciation: accumulated,
      netValue: net,
      rate: Math.round(monthly / (original || 1) * 10000) / 100,
      purchaseDate: asset.purchaseDate || asset.inboundDate
    })
    planRows.push({
      id: nextId(),
      planName: rule?.name || '默认折旧',
      assetId: asset.id,
      assetNo: asset.assetNo,
      assetName: asset.name,
      assetType: category,
      companyId: asset.companyId,
      department: asset.department,
      location: asset.location,
      inboundDate: asset.inboundDate,
      method: rule?.method || 'STRAIGHT_LINE',
      original,
      residualRate,
      monthly,
      totalLife: totalMonths,
      usedLife: used,
      accumulated,
      netValue: net,
      depDate: `${period}-01`,
      finished: used >= totalMonths
    })
    opening += original
    monthlyTotal += monthly
    accumulatedTotal += accumulated
    netTotal += net
  })

  const round2 = v => Math.round(v * 100) / 100
  const result = {
    period,
    openingValue: round2(opening),
    periodDepreciation: round2(monthlyTotal),
    accumulated: round2(accumulatedTotal),
    closingNet: round2(netTotal),
    assetCount: details.length,
    details,
    planDetails: planRows
  }

  if (persist) {
    const detailRows = ensure('fixed-asset-report-depreciation-details')
    detailRows.length = 0
    details.forEach(row => detailRows.push(row))
    const planDetailRows = ensure('fixed-asset-report-depreciation-plan-details')
    planDetailRows.length = 0
    planRows.forEach(row => planDetailRows.push(row))

    const reports = ensure('fixed-asset-depreciation-reports')
    const report = {
      period,
      openingValue: result.openingValue,
      periodDepreciation: result.periodDepreciation,
      accumulated: result.accumulated,
      closingNet: result.closingNet,
      assetCount: result.assetCount,
      operator: actorName(),
      runDate: nowIso()
    }
    const existing = reports.find(r => r.period === period)
    if (existing) Object.assign(existing, report)
    else reports.push({ id: nextId(), ...report, createTime: nowIso(), updateTime: nowIso(), version: 1 })
    ctx.persist()
  }
  return clone(result)
}

export const mockService = {
  registerSeed,

  /** 折旧试算：只算不写 */
  async previewDepreciation(period) {
    await simulate()
    return mockDepreciation(period, false)
  },

  /** 折旧计提：重写当期明细与报表 */
  async runDepreciation(period) {
    await simulate()
    return mockDepreciation(period, true)
  },

  /** 折旧计划明细 */
  async depreciationPlan(params = {}) {
    await simulate()
    const month = params.month || ''
    const rows = ensure('fixed-asset-report-depreciation-plan-details')
      .filter(r => !month || String(r.depDate || '').startsWith(month))
    return { rows: clone(rows), total: rows.length }
  },

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
    // 库存联动：按单据状态决定何时结算
    // - 无 settleOn 的旧契约：创建即生效
    // - 有 settleOn：只有直接以"已完结"状态创建时才结算（如入库单）
    // - 草稿 / 审批中不动物品，等审批通过后再结算
    const stockRule = contract?.rules?.stock
    if (stockRule) {
      if (!stockRule.settleOn) applyStock(ctx, contract, record, 'create')
      else if (record.status === stockRule.settleOn) applyStock(ctx, contract, record, 'create')
    }

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

    const previous = rows[idx]
    // 乐观锁：先比对版本，避免已被他人修改的行继续走后续业务规则
    assertVersionMatch(contract, previous, patch)
    const next = { ...previous, ...clone(patch) }
    assertValid(contract, next, { partial: true })

    checkUnique(ctx, key, contract, next, primaryOf(key, rows[idx]))
    checkRefs(ctx, contract, next)
    // 退库额度校验：提交（审批中）与生效（已完结）时都要校验可退额度
    if (contract?.key === 'low-value-return') checkReturnLimit(ctx, contract, next)

    // 状态迁移驱动的库存结算（草稿 → 审批中 → 已完结）
    const stockRule = contract?.rules?.stock
    if (stockRule?.settleOn) {
      const qtyField = stockRule.qtyField
      if (previous.status === stockRule.settleOn && Number(next[qtyField] || 0) !== Number(previous[qtyField] || 0)) {
        throw new ApiError(ERROR_CODES.CONFLICT, '单据已生效，不能修改数量')
      }
      applyStockOnStatusChange(ctx, contract, previous, next)
    }

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
    // 单据删除时按状态反向回退：已结算的退回库存，审批中的释放预占，草稿无影响
    const stockRule = contract?.rules?.stock
    if (stockRule) {
      if (!stockRule.settleOn || target.status === stockRule.settleOn) {
        applyStock(ctx, contract, target, 'delete')
      } else if (stockRule.reserveOn && target.status === stockRule.reserveOn) {
        releaseStock(ctx, contract, target)
      }
    }

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
        // 与 create 保持一致：契约校验 + 唯一性 + 引用完整性
        assertValid(contract, record)
        checkUnique(ctx, key, contract, record)
        checkRefs(ctx, contract, record)
        stampCreate(record, contract)
        current.unshift(record)
      } else {
        // 批量保存同样受乐观锁约束，避免整表回写静默吞掉他人改动
        assertVersionMatch(contract, current[idx], record)
        const merged = { ...current[idx], ...record }
        assertValid(contract, merged, { partial: true })
        checkUnique(ctx, key, contract, merged, primaryOf(key, current[idx]))
        checkRefs(ctx, contract, merged)
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
