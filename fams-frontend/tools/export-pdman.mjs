/**
 * 由前端契约导出 PDMan（元数建模）数据库设计文件。
 *
 * 目的：部门规范要求交付「数据库设计文件」，而表结构已由 schema.js 单一真源决定，
 * 因此这里按契约自动生成，避免手工维护一份会漂移的 PDMan 工程。
 *
 * 产物：
 *   - fams-backend/docs/pdman/fams.pdman.json  —— PDMan 工程文件（含表/字段注释）
 *
 * 用法：cd fams-frontend && npm run export:pdman
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const OUT = resolve(process.cwd(), '../fams-backend/docs/pdman')

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

const schema = await server.ssrLoadModule('/src/services/contract/schema.js')
await server.close()

const AUDIT_COLUMNS = ['createBy', 'createTime', 'updateBy', 'updateTime', 'version']
const INTEGER_FIELDS = new Set([
  'sort', 'count', 'headcount', 'leaseMonths', 'quantity', 'stock', 'reserved',
  'safetyStock', 'version', 'page', 'pageSize', 'usedMonths', 'depreciatedMonths'
])

/** 物理表名：字典项集合归一到 system_dict_items */
function tableName(contract) {
  return /^system-dict-types-.+-items$/.test(contract.key)
    ? 'system_dict_items'
    : contract.key.replace(/-/g, '_')
}

function camelToSnake(name) {
  return String(name).replace(/([A-Z])/g, '_$1').toLowerCase()
}

/** 契约字段类型 → MySQL 列类型 */
function sqlType(field) {
  if (field.ref) return 'VARCHAR(64)'
  switch (field.type) {
    case 'number': return INTEGER_FIELDS.has(field.name) ? 'BIGINT' : 'DECIMAL(20,6)'
    case 'boolean': return 'TINYINT(1)'
    case 'date': return 'DATETIME(3)'
    case 'enum': return 'VARCHAR(64)'
    case 'array':
    case 'object': return 'TEXT'
    default: return 'VARCHAR(255)'
  }
}

/** 契约 → PDMan 实体 */
function toEntity(contract) {
  const idField = contract.idField || 'id'
  const auditSnake = contract.audit === false ? [] : AUDIT_COLUMNS.map(camelToSnake)
  const fields = []

  fields.push({
    name: camelToSnake(idField),
    defKey: camelToSnake(idField),
    defName: idField,
    type: 'VARCHAR(64)',
    remark: '主键',
    primaryKey: true,
    notNull: true
  })

  for (const [name, def] of Object.entries(contract.fields || {})) {
    if (name === idField) continue
    if (auditSnake.includes(camelToSnake(name))) continue
    const remark = []
    if (def.enum) remark.push('枚举 ' + def.enum)
    if (def.ref) remark.push('外键 → ' + def.ref)
    if (def.required) remark.push('必填')
    if (def.unique) remark.push('唯一')
    fields.push({
      name: camelToSnake(name),
      defKey: camelToSnake(name),
      defName: name,
      type: sqlType({ name, ...def }),
      remark: remark.join(' / '),
      primaryKey: false,
      notNull: !!def.required
    })
  }

  if (contract.audit !== false) {
    fields.push(
      { name: 'create_by', defKey: 'create_by', defName: 'createBy', type: 'VARCHAR(64)', remark: '创建人', primaryKey: false, notNull: false },
      { name: 'create_time', defKey: 'create_time', defName: 'createTime', type: 'DATETIME(3)', remark: '创建时间', primaryKey: false, notNull: false },
      { name: 'update_by', defKey: 'update_by', defName: 'updateBy', type: 'VARCHAR(64)', remark: '更新人', primaryKey: false, notNull: false },
      { name: 'update_time', defKey: 'update_time', defName: 'updateTime', type: 'DATETIME(3)', remark: '更新时间', primaryKey: false, notNull: false },
      { name: 'version', defKey: 'version', defName: 'version', type: 'INT', remark: '乐观锁版本', primaryKey: false, notNull: false }
    )
  }

  const dictMatch = /^system-dict-types-(.+)-items$/.exec(contract.key)
  if (dictMatch) {
    fields.push({
      name: 'dict_code', defKey: 'dict_code', defName: 'dictCode', type: 'VARCHAR(64)',
      remark: '所属字典类型（物理归一列）', primaryKey: false, notNull: true
    })
  }

  return {
    title: contract.label || contract.key,
    defKey: tableName(contract),
    defName: tableName(contract),
    comment: contract.label || contract.key,
    fields: fields.map((f, index) => ({ ...f, sort: index }))
  }
}

/** 模块划分：与前端菜单分组保持一致 */
const MODULE_PREFIXES = [
  // 具体模块排在泛化规则之前，否则会被固定资产前缀先吃掉
  ['盘点', /^fixed-asset-inventory-/],
  ['折旧', /^fixed-asset-(depreciation|report)-/],
  ['资产设置', /^fixed-asset-settings-/],
  ['固定资产', /^fixed-assets?-/],
  ['低值资产', /^low-value-/],
  ['组织架构', /^org-/],
  ['系统管理', /^(system-|notify-|operation-)/]
]

function moduleOf(key) {
  for (const [name, pattern] of MODULE_PREFIXES) {
    if (pattern.test(key)) return name
  }
  return '其他'
}

const resources = Object.values(schema.CONTRACTS)
for (const key of (schema.DYNAMIC_KEYS || [])) {
  const pattern = (schema.CONTRACT_PATTERNS || []).find(p => p.test && p.test(key))
  if (pattern) resources.push(pattern.make(key))
}

// 同一物理表只出一个实体（字典项集合归一）
const seen = new Set()
const modules = new Map()
for (const contract of resources) {
  const table = tableName(contract)
  if (seen.has(table)) continue
  seen.add(table)
  const moduleName = moduleOf(contract.key)
  if (!modules.has(moduleName)) modules.set(moduleName, [])
  modules.get(moduleName).push(toEntity(contract))
}

const pdman = {
  project: {
    code: 'fams',
    name: '资产管理系统',
    description: '固定资产 + 低值耗材一体化资产管理平台，表结构由 fams-frontend/src/services/contract/schema.js 生成',
    database: 'MySQL 8.0',
    company: '',
    author: '',
    version: '1.0.0'
  },
  version: '2.0',
  profile: {
    defaultDbVersion: 'MySQL 8.0',
    generatedFrom: 'fams-frontend/tools/export-pdman.mjs'
  },
  dataTypeDomains: {
    默认: {
      code: '默认',
      datatypes: [
        { code: 'varchar', name: 'VARCHAR', apply: { MYSQL: 'VARCHAR({L})' } },
        { code: 'int', name: 'INT', apply: { MYSQL: 'INT' } },
        { code: 'bigint', name: 'BIGINT', apply: { MYSQL: 'BIGINT' } },
        { code: 'decimal', name: 'DECIMAL', apply: { MYSQL: 'DECIMAL(20,6)' } },
        { code: 'tinyint', name: 'TINYINT', apply: { MYSQL: 'TINYINT(1)' } },
        { code: 'datetime', name: 'DATETIME', apply: { MYSQL: 'DATETIME(3)' } },
        { code: 'text', name: 'TEXT', apply: { MYSQL: 'TEXT' } }
      ]
    }
  },
  modules: Array.from(modules, ([name, entities]) => ({
    name,
    code: name,
    remark: name + '相关表',
    entities
  })),
  diagrams: [],
  relations: []
}

mkdirSync(OUT, { recursive: true })
writeFileSync(resolve(OUT, 'fams.pdman.json'), JSON.stringify(pdman, null, 2) + '\n')
console.log(`✅ PDMan 数据库设计文件：${resolve(OUT, 'fams.pdman.json')}（${seen.size} 张表 / ${modules.size} 个模块）`)
