import { CONTRACTS, CONTRACT_PATTERNS, DYNAMIC_KEYS } from './schema'

export { CONTRACTS, CONTRACT_PATTERNS, DYNAMIC_KEYS } from './schema'
export { validateFields, assertValid, assertValidByKey, validateSeed } from './validate'

const cache = new Map()

/**
 * 取集合契约：先查静态契约表，再套用动态集合模式，最后回落到宽松契约。
 * 回落保证"未登记的集合"不会让引擎崩溃（渐进式接入）。
 */
export function getContract(key) {
  if (!key) return null
  if (cache.has(key)) return cache.get(key)

  let contract = CONTRACTS[key] || null
  if (!contract) {
    const hit = CONTRACT_PATTERNS.find(p => p.test(key))
    if (hit) contract = hit.make(key)
  }
  if (!contract) {
    contract = { key, label: key, idField: 'id', fields: {}, query: { keyword: [], filters: [], sort: [], page: false }, rules: {}, loose: true }
  }
  cache.set(key, contract)
  return contract
}

/** 主键字段名（动态集合各不相同） */
export function idFieldOf(key) {
  return getContract(key)?.idField || 'id'
}

/** 该集合是否支持服务端分页 */
export function isPageable(key) {
  return !!getContract(key)?.query?.page
}

/** 契约声明的可过滤字段 */
export function filterFieldsOf(key) {
  return getContract(key)?.query?.filters || []
}

/** 契约声明的关键字搜索字段 */
export function keywordFieldsOf(key) {
  return getContract(key)?.query?.keyword || []
}

/** 已登记的全部集合 key（静态 + 动态） */
export function allContractKeys() {
  return [...Object.keys(CONTRACTS), ...DYNAMIC_KEYS]
}

export default getContract
