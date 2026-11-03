/**
 * 权限契约静态校验（`npm run check:perm`）。
 *
 * 目的：把「前端用了但契约没有」「契约有但后端不认」「集合没配权限码」
 * 这三类漂移拦在构建期，而不是等到用户点出一个 403 才发现。
 *
 * 校验项：
 * 1. 前端权限树（PERMISSION_TREE）与 contract/permissions.json 完全一致；
 * 2. 源码中 `can('x')` / `permission: 'x'` 用到的码都在契约内；
 * 3. contract/permission-resources.json 引用的码都在契约内；
 * 4. contract/resources.json 的每个集合都能被某条权限规则命中（显式登记，含「故意放开」）；
 * 5. 种子角色权限码都在契约内。
 *
 * 只读文件、不依赖第三方包，正常在 1 秒内完成。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FRONTEND = resolve(HERE, '..')
const REPO = resolve(FRONTEND, '..')
const CONTRACT_DIR = join(REPO, 'fams-backend', 'src', 'main', 'resources', 'contract')

const CODE_RE = /^[a-z]{2,8}:[a-z]{2,20}$/
const CODE_LITERAL_RE = /['"]([a-z]{2,8}:[a-z]{2,20})['"]/g
const CAN_CALL_RE = /\bcan\(\s*['"]([a-z]{2,8}:[a-z]{2,20})['"]/g
const PERMISSION_FIELD_RE = /\bpermissions?\s*:\s*(?:\[[^\]]*\]|['"][^'"]+['"])/g

const errors = []
const warnings = []

function fail(section, message) {
  errors.push(`[${section}] ${message}`)
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    fail(label, `无法读取或解析 ${relative(REPO, path)}：${e.message}`)
    return null
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      walk(full, out)
    } else if (/\.(vue|js)$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

// ---------------------------------------------------------------- 1. 契约文件

const permissions = readJson(join(CONTRACT_DIR, 'permissions.json'), 'permissions.json')
const resources = readJson(join(CONTRACT_DIR, 'resources.json'), 'resources.json')
const matrix = readJson(join(CONTRACT_DIR, 'permission-resources.json'), 'permission-resources.json')
if (!permissions || !resources || !matrix) {
  report()
  process.exit(1)
}

const knownCodes = new Set(permissions.codes || [])

// ---------------------------------------------------------------- 2. 前端权限树

const permissionsJs = readFileSync(join(FRONTEND, 'src', 'config', 'permissions.js'), 'utf8')
const treeCodes = new Set([...permissionsJs.matchAll(/\{\s*id:\s*'([a-z]{2,8}:[a-z]{2,20})'/g)].map(m => m[1]))

if (treeCodes.size === 0) {
  fail('权限树', '未能从 src/config/permissions.js 解析出任何权限码，正则可能已失效')
}
for (const code of treeCodes) {
  if (!knownCodes.has(code)) {
    fail('权限树', `前端已使用 ${code}，但 contract/permissions.json 未登记`)
  }
}
for (const code of knownCodes) {
  if (!treeCodes.has(code)) {
    fail('权限树', `contract/permissions.json 登记了 ${code}，但前端权限树已移除`)
  }
}

// ---------------------------------------------------------------- 3. 源码中的权限码

const srcFiles = walk(join(FRONTEND, 'src'))
for (const file of srcFiles) {
  const text = readFileSync(file, 'utf8')
  const rel = relative(FRONTEND, file).replace(/\\/g, '/')

  for (const match of text.matchAll(CAN_CALL_RE)) {
    const code = match[1]
    if (!knownCodes.has(code)) fail('源码', `${rel} 使用 can('${code}')，但契约未登记该权限码`)
  }

  // 路由 meta.permission / permission: ['a','b'] 之类的声明
  for (const field of text.matchAll(PERMISSION_FIELD_RE)) {
    for (const quoted of field[0].matchAll(CODE_LITERAL_RE)) {
      const code = quoted[1]
      if (!knownCodes.has(code)) fail('源码', `${rel} 的 permission 声明使用了未登记权限码 ${code}`)
    }
  }
}

// ---------------------------------------------------------------- 4. 权限映射契约

const rules = matrix.rules || []
if (rules.length === 0) {
  fail('权限映射', 'permission-resources.json 没有任何规则')
}

const ruleResources = []
for (const rule of rules) {
  const key = rule.resource
  if (!key) {
    fail('权限映射', `存在缺少 resource 字段的规则：${JSON.stringify(rule)}`)
    continue
  }
  ruleResources.push(key)
  for (const kind of ['read', 'write', 'delete']) {
    for (const code of rule[kind] || []) {
      if (!knownCodes.has(code)) {
        fail('权限映射', `${key}.${kind} 引用了未登记权限码 ${code}`)
      }
    }
  }
}

/** 与后端 PermissionPolicy 一致：精确优先，否则最长前缀 */
function ruleOf(key) {
  if (ruleResources.includes(key)) return key
  let best = null
  for (const resource of ruleResources) {
    if (key.startsWith(resource) && (best === null || resource.length > best.length)) best = resource
  }
  return best
}

const resourceKeys = (resources.resources || []).map(r => r.key).filter(Boolean)
for (const key of resourceKeys) {
  if (!ruleOf(key)) {
    fail(
      '集合覆盖',
      `集合 ${key} 在 permission-resources.json 中没有任何匹配规则。` +
        '若确实只需登录，请显式登记一条（不含 read/write/delete 的规则），避免以后忘记配置'
    )
  }
}

// ---------------------------------------------------------------- 5. 种子角色权限

const orgSeedPath = join(FRONTEND, 'src', 'services', 'mock', 'seed', 'org.js')
const orgSeed = readFileSync(orgSeedPath, 'utf8')
const seedCodes = new Set([...orgSeed.matchAll(CODE_LITERAL_RE)].map(m => m[1]))
for (const code of seedCodes) {
  if (!knownCodes.has(code)) fail('种子角色', `org.js 中出现了未登记权限码 ${code}`)
}
if (seedCodes.size === 0) {
  warnings.push('[种子角色] org.js 未解析到权限码，种子结构可能已变更')
}

// ---------------------------------------------------------------- 输出

function report() {
  for (const message of warnings) console.warn(`WARN ${message}`)
  if (errors.length === 0) {
    console.log(
      `check:perm 通过：${treeCodes.size} 个权限码、${rules.length} 条映射、${resourceKeys.length} 个集合`
    )
    return
  }
  console.error(`check:perm 失败（${errors.length} 项）：`)
  for (const message of errors) console.error(`  - ${message}`)
}

report()
process.exit(errors.length === 0 ? 0 : 1)
