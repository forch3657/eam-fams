/**
 * 由「前端契约 + 前端 mock 种子数据」导出后端数据库脚本：
 *
 *   1. fams-backend/sql/01-schema/00-schema.sql   —— MySQL 建表脚本（部门规范要求）
 *   2. fams-backend/src/main/resources/db/schema.sql —— 可移植版本（H2 内存库测试用）
 *   3. fams-backend/src/main/resources/db/seed.sql  —— 演示数据（与前端 mock 模式数字一致）
 *
 * 目的是让后端不重复声明字段定义，也不手工造演示数据，
 * 保证「mock 模式」与「真实后端」跑出来的是同一份数据。
 *
 * 用法：cd fams-frontend && npm run export:db
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const BACKEND = resolve(process.cwd(), '../fams-backend')
const SCHEMA_OUT = resolve(BACKEND, 'sql/01-schema')
const RESOURCE_OUT = resolve(BACKEND, 'src/main/resources/db')

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error'
})

const schema = await server.ssrLoadModule('/src/services/contract/schema.js')
const enumsMod = await server.ssrLoadModule('/src/constants/enums.js')
const seedIndex = await server.ssrLoadModule('/src/services/mock/seed/index.js')

const asset = await server.ssrLoadModule('/src/services/mock/seed/asset.js')
const lowValue = await server.ssrLoadModule('/src/services/mock/seed/lowValueAsset.js')
const org = await server.ssrLoadModule('/src/services/mock/seed/org.js')
const settings = await server.ssrLoadModule('/src/services/mock/seed/settings.js')
const reports = await server.ssrLoadModule('/src/services/mock/seed/reports.js')
const system = await server.ssrLoadModule('/src/services/mock/seed/system.js')
const { COLLECTION } = await server.ssrLoadModule('/src/services/collections.js')
const { DOC_LIST_KEYS } = schema

await server.close()

const AUDIT_COLUMNS = ['createBy', 'createTime', 'updateBy', 'updateTime', 'version']

/** 契约中视为整数的字段（其余数值按金额处理，用 DECIMAL 存储） */
const INTEGER_FIELDS = new Set([
  'sort', 'count', 'headcount', 'leaseMonths', 'quantity', 'stock', 'reserved',
  'safetyStock', 'version', 'page', 'pageSize', 'usedMonths', 'depreciatedMonths'
])

function toTable(key) {
  return key.replace(/-/g, '_')
}

/**
 * 物理表名：字典项集合归一到 system_dict_items（用 dict_code 列区分），
 * 因为字典类型可在运行期新增，按类型建表会导致运行期 DDL。
 */
function tableName(contract) {
  const m = /^system-dict-types-(.+)-items$/.exec(contract.key)
  return m ? 'system_dict_items' : toTable(contract.key)
}

function camelToSnake(name) {
  return String(name).replace(/([A-Z])/g, '_$1').toLowerCase()
}

function sqlType(field) {
  if (field.refCollection) return 'VARCHAR(64)'
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

/**
 * 生成建表语句。
 * @param {object} contract 契约定义
 * @param {boolean} mysql 是否输出 MySQL 专有子句
 */
function createTable(contract, mysql) {
  const idField = contract.idField || 'id'
  const fields = Object.entries(contract.fields || {}).map(([name, def]) => ({ name, ...def }))
  if (!fields.some(f => f.name === idField)) {
    fields.unshift({ name: idField, type: 'string' })
  }
  // 字典项：同一张表，用 dict_code 区分
  const dictMatch = /^system-dict-types-(.+)-items$/.exec(contract.key)
  const cols = []
  const auditSnake = contract.audit === false ? [] : AUDIT_COLUMNS.map(camelToSnake)
  // 主键列：契约里主键可能是 id / code / name / recordNo / key
  cols.push(`  \`${camelToSnake(idField)}\` VARCHAR(64) NOT NULL COMMENT '主键'`)
  for (const f of fields) {
    if (f.name === idField) continue
    // 业务字段与审计字段同名（如单据的 createTime）时只保留一列
    if (auditSnake.includes(camelToSnake(f.name))) continue
    const comment = def2comment(f)
    cols.push(`  \`${camelToSnake(f.name)}\` ${sqlType(f)}${comment}`)
  }
  if (contract.audit !== false) {
    cols.push(`  \`create_by\` VARCHAR(64) COMMENT '创建人'`)
    cols.push(`  \`create_time\` DATETIME(3) COMMENT '创建时间'`)
    cols.push(`  \`update_by\` VARCHAR(64) COMMENT '更新人'`)
    cols.push(`  \`update_time\` DATETIME(3) COMMENT '更新时间'`)
    cols.push(`  \`version\` INT DEFAULT 1 COMMENT '乐观锁版本'`)
  }
  if (dictMatch) {
    cols.push('  `dict_code` VARCHAR(64) NOT NULL COMMENT \'所属字典类型\'')
  }
  const table = tableName(contract)
  const pkCol = camelToSnake(idField)
  let ddl = `DROP TABLE IF EXISTS \`${table}\`;\n`
  ddl += `CREATE TABLE \`${table}\` (\n`
  ddl += cols.join(',\n')
  ddl += `,\n  PRIMARY KEY (\`${pkCol}\`)\n)`
  if (mysql) {
    ddl += ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=\'' + (contract.label || contract.key) + '\''
  }
  ddl += ';\n\n'
  return ddl
}

function def2comment(f) {
  const pieces = []
  if (f.enum) pieces.push(f.enum)
  if (f.ref) pieces.push('→' + f.ref)
  if (f.required) pieces.push('必填')
  if (f.unique) pieces.push('唯一')
  if (!pieces.length) return ''
  return ' COMMENT \'' + pieces.join(' ') + '\''
}

// ------------------------------------------------------------------ 演示数据

/** 与 seed/index.js 完全一致的「集合 key → 种子数据」登记 */
function collectSeeds() {
  const map = new Map()
  map.set(COLLECTION.assets, asset.ASSET_SEEDS.assets)
  map.set(COLLECTION.inventoryPlans, asset.ASSET_SEEDS.inventoryPlans)
  map.set(COLLECTION.inventoryDocs, asset.ASSET_SEEDS.inventoryDocs)
  map.set(COLLECTION.depreciationSchemes, asset.ASSET_SEEDS.depreciationSchemes)
  map.set(COLLECTION.depreciationReports, asset.ASSET_SEEDS.depreciationReports)
  DOC_LIST_KEYS.forEach(k => map.set(`${COLLECTION.docListPrefix}-${k}`, asset.ASSET_SEEDS.docLists[k] || []))

  map.set(COLLECTION.settingsLocations, settings.SETTINGS_SEEDS.locations)
  map.set(COLLECTION.settingsLocationOptions, settings.SETTINGS_SEEDS.locationOptions)
  map.set(COLLECTION.settingsCategories, settings.SETTINGS_SEEDS.categories)
  map.set(COLLECTION.settingsDepreciationRules, settings.SETTINGS_SEEDS.depreciationRules)
  map.set(COLLECTION.settingsDepreciationPlans, settings.SETTINGS_SEEDS.depreciationPlans)
  map.set(COLLECTION.reportDepreciationDetails, reports.REPORT_SEEDS.depreciationDetails)
  map.set(COLLECTION.reportDepreciationPlanDetails, reports.REPORT_SEEDS.depreciationPlanDetails)

  map.set(COLLECTION.lowValueItems, lowValue.LOW_VALUE_SEEDS.items)
  map.set(COLLECTION.lowValueInbound, lowValue.LOW_VALUE_SEEDS.inbound)
  map.set(COLLECTION.lowValueRequisition, lowValue.LOW_VALUE_SEEDS.requisition)
  map.set(COLLECTION.lowValueReturn, lowValue.LOW_VALUE_SEEDS.return)
  map.set(COLLECTION.lowValueSettingsLocations, lowValue.LOW_VALUE_SEEDS.locations)

  map.set(COLLECTION.orgCompanies, org.ORG_SEEDS.companies)
  map.set(COLLECTION.orgDepartments, org.ORG_SEEDS.departments)
  map.set(COLLECTION.orgUsers, org.ORG_SEEDS.users)
  map.set(COLLECTION.orgRoles, org.ORG_SEEDS.roles)

  map.set(COLLECTION.systemDictTypes, system.SYSTEM_SEEDS.dictTypes)
  Object.entries(system.SYSTEM_SEEDS.dictItems || {}).forEach(([dictCode, items]) => {
    map.set(`system-dict-types-${dictCode}-items`, items)
  })
  map.set(COLLECTION.systemParams, system.SYSTEM_SEEDS.params)
  map.set(COLLECTION.systemFlows, system.SYSTEM_SEEDS.flows)
  map.set(COLLECTION.systemDevices, system.SYSTEM_SEEDS.devices)
  map.set(COLLECTION.systemTerminalAbnormal, system.SYSTEM_SEEDS.deviceAbnormal)
  map.set(COLLECTION.notifyTemplates, system.SYSTEM_SEEDS.notifyTemplates)
  map.set(COLLECTION.notifyMessages, system.SYSTEM_SEEDS.notifyMessages)
  map.set(COLLECTION.operationLogs, system.SYSTEM_SEEDS.operationLogs)
  return map
}

const AUDIT_DEFAULTS = {
  createBy: 'seed',
  updateBy: 'seed',
  version: 1
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''")
}

function toSqlLiteral(value, type) {
  if (value === null || value === undefined) return 'NULL'
  if (type === 'boolean') return value ? '1' : '0'
  if (type === 'number') return Number(value)
  if (type === 'date') {
    // ISO 8601 → MySQL DATETIME 字面量
    const text = String(value).trim()
    if (!text) return 'NULL'
    const d = new Date(text)
    if (isNaN(d.getTime())) return 'NULL'
    const p = n => String(n).padStart(2, '0')
    return `'${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}'`
  }
  if (type === 'array' || type === 'object') {
    // 数组/对象统一序列化为 JSON 文本存储
    return `'${escapeSql(JSON.stringify(value))}'`
  }
  return `'${escapeSql(value)}'`
}

function insertRows(contract, rows) {
  if (!rows || !rows.length) return ''
  const table = tableName(contract)
  const idField = contract.idField || 'id'
  const fields = Object.entries(contract.fields || {}).map(([name, def]) => ({ name, ...def }))
  const fieldMap = new Map(fields.map(f => [f.name, f]))
  if (!fieldMap.has(idField)) fieldMap.set(idField, { name: idField, type: 'string' })
  const dictMatch = /^system-dict-types-(.+)-items$/.exec(contract.key)

  // 与建表脚本保持同一套去重规则，避免 INSERT 列重复
  const auditSnake = contract.audit === false ? [] : AUDIT_COLUMNS.map(camelToSnake)
  const columns = [idField, ...fields
    .filter(f => f.name !== idField)
    .filter(f => !auditSnake.includes(camelToSnake(f.name)))
    .map(f => f.name)]
  if (contract.audit !== false) columns.push(...AUDIT_COLUMNS)
  // 字典项：补上归属于自己的 dict_code 列
  if (dictMatch) columns.push('dictCode')

  const lines = rows.map(row => {
    const values = columns.map(col => {
      if (col === 'dictCode') return toSqlLiteral(dictMatch[1], 'string')
      const def = fieldMap.get(col) || { type: 'string' }
      if (AUDIT_COLUMNS.includes(col)) {
        if (col === 'version') return 1
        const raw = row[col]
        if (col === 'createTime' || col === 'updateTime') return toSqlLiteral(raw || row.updatedAt || null, 'date')
        return toSqlLiteral(raw === undefined ? AUDIT_DEFAULTS[col] : raw, 'string')
      }
      return toSqlLiteral(row[col] === undefined ? null : row[col], def.type)
    })
    return `(${values.join(', ')})`
  })

  return `INSERT INTO \`${table}\` (${columns.map(c => '`' + camelToSnake(c) + '`').join(', ')}) VALUES\n`
    + lines.join(',\n') + ';\n\n'
}

// ------------------------------------------------------------------ 主流程

const resources = Object.values(schema.CONTRACTS)
const dynamicKeys = schema.DYNAMIC_KEYS || []
for (const key of dynamicKeys) {
  const pattern = (schema.CONTRACT_PATTERNS || []).find(p => p.test && p.test(key))
  if (pattern) resources.push(pattern.make(key))
}

// 动态字典项集合归一到同一张物理表，只建一次
const tables = new Set()
const uniqueResources = resources.filter(r => {
  const table = tableName(r)
  if (tables.has(table)) return false
  tables.add(table)
  return true
})

let mysqlSchema = '-- 由 fams-frontend/tools/export-db.mjs 自动生成，请勿手工修改\n'
  + '-- 来源：fams-frontend/src/services/contract/schema.js（契约单一真源）\n\n'
  + 'SET NAMES utf8mb4;\n\n'
let portableSchema = '-- 自动生成：可移植建表脚本（供 H2 内存库自动化测试使用）\n\n'

for (const contract of uniqueResources) {
  mysqlSchema += createTable(contract, true)
  portableSchema += createTable(contract, false)
}

mkdirSync(SCHEMA_OUT, { recursive: true })
mkdirSync(RESOURCE_OUT, { recursive: true })
writeFileSync(resolve(SCHEMA_OUT, '00-schema.sql'), mysqlSchema)
writeFileSync(resolve(RESOURCE_OUT, 'schema.sql'), portableSchema)

// 演示数据
const seeds = collectSeeds()

const contractByKey = new Map(resources.map(c => [c.key, c]))

/**
 * 数据分层：
 * - 02-seed：系统运行必需的基线（字典、参数、流程、公司/部门/角色、内置管理员）
 * - 03-demo：与前端 mock 模式完全对齐的演示数据（资产、单据、低值、盘点、折旧、消息、日志）
 */
const BASELINE = [/^system-dict-types/, /^system-params$/, /^system-workflow-flows$/,
  /^org-companies$/, /^org-departments$/, /^org-roles$/, /^org-users$/]

function isBaseline(key) {
  return BASELINE.some(p => p.test(key))
}

function render(key, rows) {
  const contract = contractByKey.get(key)
  if (!contract) {
    console.warn('⚠️  种子数据存在未登记的契约 key：' + key)
    return ''
  }
  if (!rows || !rows.length) return ''
  return `-- ${contract.label} (${key})\n` + insertRows(contract, rows)
}

const DEMO_HEADER = '-- 由前端 mock 种子数据导出：与「mock 模式」展示的演示数据完全一致\n'
  + '-- 用途：联调时前后端跑同一份数据，页面数字可直接对比\n'
  + '-- 注意：其中账号口令为演示值（123456），首次登录后请立即修改\n\n'
  + 'SET NAMES utf8mb4;\n\n'

const BASELINE_HEADER = '-- 系统基线数据：系统启动即可用所需的最小数据集\n'
  + '-- 说明：内置管理员口令取自 fams.security.bootstrap-password；\n'
  + '--       演示库里的明文口令由 DataInitializer 启动时统一迁移为 BCrypt\n\n'
  + 'SET NAMES utf8mb4;\n\n'

let baselineSql = BASELINE_HEADER
let demoSql = DEMO_HEADER

for (const [key, rows] of seeds) {
  if (isBaseline(key)) {
    baselineSql += render(key, key === 'org-users' ? rows.filter(u => u.username === 'admin') : rows)
    if (key === 'org-users') {
      demoSql += render(key, rows.filter(u => u.username !== 'admin'))
    }
  } else {
    demoSql += render(key, rows)
  }
}

const SEED_OUT = resolve(BACKEND, 'sql/02-seed')
const DEMO_OUT = resolve(BACKEND, 'sql/03-demo')
mkdirSync(SEED_OUT, { recursive: true })
mkdirSync(DEMO_OUT, { recursive: true })
writeFileSync(resolve(SEED_OUT, '00-baseline.sql'), baselineSql)
writeFileSync(resolve(DEMO_OUT, '00-demo.sql'), demoSql)
// 测试库用的仍是「基线 + 演示」的完整一份，保证联调与自动化测试同数据
writeFileSync(resolve(RESOURCE_OUT, 'seed.sql'), baselineSql + demoSql.replace(DEMO_HEADER, ''))

console.log(`✅ 建表脚本：${resolve(SCHEMA_OUT, '00-schema.sql')}（${uniqueResources.length} 张表）`)
console.log(`✅ 测试用可移植脚本：${resolve(RESOURCE_OUT, 'schema.sql')}`)
console.log(`✅ 演示数据：${resolve(RESOURCE_OUT, 'seed.sql')}（${seeds.size} 个集合）`)
