import { ENUMS } from '../../constants/enums'
import { ApiError, ERROR_CODES } from '../errors'
import { getContract } from './index'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z?)?$/

function typeOk(type, value) {
  switch (type) {
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    case 'array': return Array.isArray(value)
    case 'object': return value !== null && typeof value === 'object' && !Array.isArray(value)
    case 'date': return typeof value === 'string' ? ISO_DATE.test(value) : value instanceof Date
    case 'enum': return typeof value === 'string'
    default: return true
  }
}

/**
 * 校验一行数据是否符合契约
 * @param {object} contract 契约
 * @param {object} row 数据行
 * @param {object} opts partial=true 时跳过必填校验（用于 update）
 * @returns {Array<{field:string,message:string}>} 错误列表，空数组表示通过
 */
export function validateFields(contract, row, { partial = false } = {}) {
  const errors = []
  if (!contract || !row || typeof row !== 'object') return errors
  const { fields = {}, idField = 'id' } = contract

  Object.entries(fields).forEach(([name, def]) => {
    const value = row[name]

    if (value === undefined || value === null || value === '') {
      if (!partial && def.required) errors.push({ field: name, message: `${name} 不能为空` })
      return
    }

    if (!typeOk(def.type, value)) {
      errors.push({ field: name, message: `${name} 类型应为 ${def.type}` })
      return
    }

    if (def.type === 'enum') {
      const dict = ENUMS[def.enum]
      if (dict && !(value in dict)) {
        errors.push({ field: name, message: `${name} 取值 ${value} 不在枚举 ${def.enum} 中` })
      }
    }

    if (def.type === 'date' && typeof value === 'string' && !value.includes('T') && value.includes(' ')) {
      // 迁移期提示：日期应存 ISO 8601（用 T 分隔），空格分隔为旧格式
      errors.push({ field: name, message: `${name} 日期格式应为 ISO 8601（如 2026-09-18T10:22:31）` })
    }
  })

  if (!partial && row[idField] === undefined && row._id === undefined) {
    // id 由服务端生成，新增时不要求携带，仅提示
  }

  return errors
}

/** 校验并在不通过时抛 ApiError（422） */
export function assertValid(contract, row, opts = {}) {
  const errors = validateFields(contract, row, opts)
  if (errors.length) {
    const msg = errors.map(e => e.message).join('；')
    throw new ApiError(ERROR_CODES.VALIDATION, `数据校验未通过：${msg}`, 0, errors)
  }
  return true
}

/** 按集合 key 校验（内部解析契约） */
export function assertValidByKey(key, row, opts = {}) {
  const contract = getContract(key)
  if (!contract) return true
  return assertValid(contract, row, opts)
}

/**
 * dev 期校验种子数据：只在开发环境打印告警，不阻断运行。
 * 用于发现"种子字段/枚举与契约不符"的问题（如漏改的中文状态）。
 */
export function validateSeed(key, rows) {
  if (!import.meta.env.DEV || !Array.isArray(rows)) return []
  const contract = getContract(key)
  if (!contract) return []
  const problems = []
  rows.forEach((row, idx) => {
    const errs = validateFields(contract, row, { partial: false })
    if (errs.length) problems.push({ key, index: idx, errors: errs })
  })
  if (problems.length) {
    console.warn(`[契约校验] 集合 ${key} 有 ${problems.length} 行数据与契约不符：`, problems)
  }
  return problems
}

export default assertValid
