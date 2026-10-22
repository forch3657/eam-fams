import { ApiError, apiError, ERROR_CODES } from '../errors'
import { idFieldOf } from '../contract'

/**
 * 业务规则钩子：唯一性、引用完整性、删除保护、库存联动
 *
 * 规则由契约（contract/schema.js）声明，这里负责执行。
 * mock 阶段就按后端应有的语义校验，避免"mock 能过、后端报错"的落差。
 * ctx 提供集合读取能力：ctx.read(key) -> rows
 */

function valueOf(contract, row, field) {
  return row?.[field]
}

/** 取行的主键值（兼容历史数据的 _id） */
export function primaryOf(key, row) {
  if (!row) return undefined
  const field = idFieldOf(key)
  return row[field] ?? row.id ?? row._id ?? row.code
}

/** 唯一性校验：新增/改名时不得与现有行重复 */
export function checkUnique(ctx, key, contract, row, excludePrimary) {
  const uniques = contract?.rules?.unique || []
  if (!uniques.length) return
  const rows = ctx.read(key)
  const self = excludePrimary ?? primaryOf(key, row)
  uniques.forEach(field => {
    const val = row[field]
    if (val === undefined || val === null || val === '') return
    const dup = rows.some(r => {
      if (primaryOf(key, r) === self && self !== undefined) return false
      return r[field] === val
    })
    if (dup) throw apiError.conflict(`${field}「${val}」已存在，不能重复`)
  })
}

/** 外键引用完整性：引用的记录必须存在 */
export function checkRefs(ctx, contract, row) {
  const refs = contract?.rules?.refs || []
  refs.forEach(({ field, collection }) => {
    const val = row[field]
    if (val === undefined || val === null || val === '') return
    const exists = ctx.read(collection).some(r => primaryOf(collection, r) === val)
    if (!exists) throw apiError.refNotFound(`${field} 引用的记录不存在（${collection}: ${val}）`)
  })
}

/** 删除保护：其他集合仍引用该记录时禁止删除 */
export function checkProtect(ctx, key, contract, id) {
  const protects = contract?.rules?.protect || []
  protects.forEach(({ collection, field, message, valueFrom }) => {
    // valueFrom：用本行的某个字段值去比对（如位置用 name 被资产引用）
    const compareValue = valueFrom ? findValue(ctx, key, id, valueFrom) : id
    if (compareValue === undefined || compareValue === null || compareValue === '') return
    const hit = ctx.read(collection).some(r => valueOf(contract, r, field) === compareValue)
    if (hit) throw apiError.hasReference(message || '该数据已被引用，不能删除')
  })

  // 数组字段包含该 id（如用户 roleIds 含角色 id）
  const contains = contract?.rules?.protectContains || []
  contains.forEach(({ collection, field, message }) => {
    const hit = ctx.read(collection).some(r => Array.isArray(r[field]) && r[field].includes(id))
    if (hit) throw apiError.hasReference(message || '该数据已被引用，不能删除')
  })

  // 同集合内的父子保护（如分类 parentCode）
  const self = contract?.rules?.protectSelf
  if (self) {
    const rows = ctx.read(key)
    const children = rows.filter(r => r[self.field] === id)
    if (children.length) throw apiError.hasChildren(self.message || '存在下级数据，不能删除')
  }

  // 库存保护：仍有库存不允许删除
  const guard = contract?.rules?.stockGuard
  if (guard) {
    const row = ctx.read(key).find(r => primaryOf(key, r) === id)
    if (row && Number(row[guard.field] || 0) > 0) {
      throw apiError.hasReference(guard.message || '该数据仍在在用，不能删除')
    }
  }
}

function findValue(ctx, key, id, field) {
  const row = ctx.read(key).find(r => primaryOf(key, r) === id)
  return row?.[field]
}

/**
 * 库存联动：入库/退库加库存，领用扣库存
 * @param {string} mode 'create' | 'delete' —— 删除单据时反向回退库存
 */
export function applyStock(ctx, contract, row, mode = 'create') {
  const rule = contract?.rules?.stock
  if (!rule) return
  const { effect, target, itemField, qtyField, stockField } = rule
  const itemId = row[itemField]
  const qty = Number(row[qtyField] || 0)
  if (!itemId || !Number.isFinite(qty) || qty === 0) return

  const rows = ctx.read(target)
  const item = rows.find(r => primaryOf(target, r) === itemId)
  if (!item) throw apiError.refNotFound('关联物品不存在')

  const delta = (effect === 'out' ? -1 : 1) * qty * (mode === 'delete' ? -1 : 1)
  const next = Number(item[stockField] || 0) + delta
  if (next < 0) throw apiError.stockInsufficient(`库存不足，当前可用 ${item[stockField] || 0}`)
  item[stockField] = next
  ctx.persist(target)
}

/** 退库数量不得超过"已领未退" */
export function checkReturnLimit(ctx, contract, row) {
  if (contract?.key !== 'low-value-return') return
  const issued = ctx.read('low-value-requisition')
    .filter(r => r.itemId === row.itemId)
    .reduce((sum, r) => sum + Number(r.quantity || 0), 0)
  const returned = ctx.read('low-value-return')
    .filter(r => r.itemId === row.itemId)
    .reduce((sum, r) => sum + Number(r.quantity || 0), 0)
  const available = issued - returned
  if (Number(row.quantity || 0) > available) {
    throw new ApiError(ERROR_CODES.EXCEED_RETURNED, `退库数量超出可退范围，当前可退 ${available}`)
  }
}

export default { checkUnique, checkRefs, checkProtect, applyStock, checkReturnLimit, primaryOf }
