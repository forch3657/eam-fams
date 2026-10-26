/**
 * 导出前端契约为后端可加载的 JSON。
 *
 * 目的：后端不手写第 4 节的 60+ 个集合字段定义，而是直接消费前端 schema.js，
 * 保证「契约单一真源」。schema.js 变更后重新执行本脚本即可同步。
 *
 * 之所以走 vite ssrLoadModule：前端源码是省略扩展名的 ESM（如 '../../constants/enums'），
 * Node 原生 ESM 解析器不做扩展名补全，直接 import 会失败。
 *
 * 用法：cd fams-frontend && npm run export:contract
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const OUT = resolve(process.cwd(), '../fams-backend/src/main/resources/contract')

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

const schema = await server.ssrLoadModule('/src/services/contract/schema.js')
const enumsMod = await server.ssrLoadModule('/src/constants/enums.js')
const permsMod = await server.ssrLoadModule('/src/config/permissions.js')
await server.close()

/** 表名：把 key 的连字符换成下划线 */
function toTable(key) {
  return key.replace(/-/g, '_')
}

/** 把契约归一化为后端元数据 */
function normalize(contract, dynamic) {
  const idField = contract.idField || 'id'
  const fields = Object.entries(contract.fields || {}).map(([name, def]) => ({
    name,
    type: def.type || 'string',
    required: !!def.required,
    unique: !!def.unique,
    enumName: def.enum || null,
    refCollection: def.ref || null
  }))
  // 主键可能不在 fields 里声明（多数集合只写业务字段）
  if (!fields.some(f => f.name === idField)) {
    fields.unshift({ name: idField, type: 'string', required: false, unique: true, enumName: null, refCollection: null })
  }
  const rules = contract.rules || {}
  const query = contract.query || {}
  // 字典项集合归一到同一张物理表（运行期可新增字典类型，按类型建表会导致 DDL）
  const dictMatch = /^system-dict-types-(.+)-items$/.exec(contract.key)
  const fixedFilters = dictMatch ? { dictCode: dictMatch[1] } : {}
  return {
    key: contract.key,
    label: contract.label || contract.key,
    table: dictMatch ? 'system_dict_items' : toTable(contract.key),
    fixedFilters,
    pkField: idField,
    // 服务端生成主键：主键类型为 string 且契约未声明为业务编码（id/recordNo 由服务端生成）
    idGenerated: idField === 'id' || idField === 'recordNo',
    audit: contract.audit !== false,
    dynamic,
    fields,
    uniqueFields: rules.unique || [],
    refs: rules.refs || [],
    protect: rules.protect || [],
    protectContains: rules.protectContains || [],
    protectSelf: rules.protectSelf || null,
    stockGuard: normalizeArray(rules.stockGuard),
    stock: rules.stock || null,
    cascade: rules.cascade || [],
    keywordFields: query.keyword || [],
    filterFields: query.filters || [],
    sortFields: query.sort || [],
    paged: query.page !== false
  }
}

/** stockGuard 在契约里可能是对象或数组 */
function normalizeArray(v) {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

const resources = Object.values(schema.CONTRACTS).map(c => normalize(c, false))
const dynamicKeys = schema.DYNAMIC_KEYS || []
for (const key of dynamicKeys) {
  const pattern = (schema.CONTRACT_PATTERNS || []).find(p => p.test && p.test(key))
  if (pattern) resources.push(normalize(pattern.make(key), true))
}

mkdirSync(OUT, { recursive: true })

writeFileSync(
  resolve(OUT, 'resources.json'),
  JSON.stringify({ generatedFrom: 'fams-frontend/src/services/contract/schema.js', resources }, null, 2)
)

writeFileSync(
  resolve(OUT, 'enums.json'),
  JSON.stringify(
    { generatedFrom: 'fams-frontend/src/constants/enums.js', enums: enumsMod.ENUMS, dictMeta: enumsMod.ENUM_DICT_META },
    null,
    2
  )
)

/** 权限树叶子节点 id 即权限码 */
function collectLeaves(nodes, acc = []) {
  for (const n of nodes || []) {
    if (n.children && n.children.length) collectLeaves(n.children, acc)
    else if (n.id) acc.push(n.id)
  }
  return acc
}

const codes = collectLeaves(permsMod.PERMISSION_TREE)
writeFileSync(
  resolve(OUT, 'permissions.json'),
  JSON.stringify({ generatedFrom: 'fams-frontend/src/config/permissions.js', codes }, null, 2)
)

console.log(`✅ 已导出 ${resources.length} 个集合（静态 ${resources.length - dynamicKeys.length} + 动态 ${dynamicKeys.length}）`)
console.log(`✅ 已导出 ${Object.keys(enumsMod.ENUMS).length} 个枚举`)
console.log(`✅ 已导出 ${codes.length} 个权限码`)
console.log(`   输出目录：${OUT}`)
