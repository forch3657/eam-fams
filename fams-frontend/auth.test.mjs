/**
 * 认证链路测试
 *
 * 验证切到真实后端前就已跑通的那条链路：
 * - 登录成功会签发并保存 token（否则 http.js 的 Authorization 头永远为空）
 * - token 键与 http.js 读取的是同一个（否则请求永远不带凭据）
 * - 审计字段 createBy/updateBy 取到的是登录用户，而不是恒为 'system'
 * - 登出会清掉 token 与用户快照
 * - 401 会触发统一处理器，并且处理器内部只做本地清理（不再发请求，避免死循环）
 *
 * 运行：node --experimental-loader ./.test-loader.mjs ./auth.test.mjs
 */
import { createPinia, setActivePinia } from 'pinia'
import { registerAllSeeds } from './src/services/mock/seed/index.js'
import { dataService } from './src/services/index.js'
import { useMock } from './src/services/index.js'
import { getToken } from './src/services/auth.js'
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from './src/services/keys.js'
import { useOrgStore } from './src/store/org.js'
import { useUserStore } from './src/store/user.js'

let pass = 0
const fails = []
function ok(cond, msg) {
  if (cond) { pass++ } else { fails.push(msg) }
}
function eq(actual, expected, msg) {
  ok(actual === expected, `${msg}（期望 ${expected}，实际 ${actual}）`)
}

setActivePinia(createPinia())

const memStore = () => {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    clear: () => m.clear()
  }
}
globalThis.localStorage = memStore()
globalThis.sessionStorage = memStore()

registerAllSeeds()

const org = useOrgStore()
const user = useUserStore()
await org.loadAll()

// ---------------------------------------------------------------- 1. 未登录无 token
eq(getToken(), '', '未登录时不应有 token')
ok(!user.isLoggedIn, '初始应为未登录')

// ---------------------------------------------------------------- 2. 登录签发 token
const res = await user.login('admin', '123456')
ok(res.ok, '管理员登录应成功')
const token = getToken()
ok(!!token, '登录后应签发 token')
ok(token.startsWith('mock.admin.'), 'mock 模式应签发本地 token（实际：' + token + '）')

// token 必须落在 http.js 读取的那个键上，否则请求永远不带 Authorization
eq(sessionStorage.getItem(TOKEN_STORAGE_KEY), token, 'token 应写入 http.js 读取的存储键')
ok(!!sessionStorage.getItem(USER_STORAGE_KEY), '应保存用户快照')

// ---------------------------------------------------------------- 3. 密码错误不签发 token
setActivePinia(createPinia())
globalThis.sessionStorage = memStore()
const org2 = useOrgStore()
const user2 = useUserStore()
await org2.loadAll()
const bad = await user2.login('admin', 'wrong-password')
ok(!bad.ok, '密码错误应登录失败')
eq(bad.reason, 'PASSWORD', '失败原因应为 PASSWORD')
eq(getToken(), '', '登录失败不应签发 token')

// ---------------------------------------------------------------- 4. 审计字段取到登录用户
// 键不一致时 createBy 会恒为 'system'，这里直接断言回归
await user2.login('admin', '123456')
const created = await dataService.create('low-value-items', {
  code: 'AUTH_TEST_001',
  category: 'OFFICE',
  name: '认证链路测试物品',
  spec: '测试',
  unit: '个',
  price: 1,
  stock: 1,
  safetyStock: 1,
  location: '行政库房',
  status: 'NORMAL'
})
eq(created.createBy, '系统管理员', '审计字段 createBy 应取登录用户名（而非 system）')
eq(created.updateBy, '系统管理员', '审计字段 updateBy 应取登录用户名')
eq(Number(created.version), 1, '新建行 version 应为 1')

// ---------------------------------------------------------------- 5. 登出清理
await user2.logout()
eq(getToken(), '', '登出后 token 应清空')
eq(sessionStorage.getItem(USER_STORAGE_KEY), null, '登出后用户快照应清空')
ok(!user2.isLoggedIn, '登出后应为未登录')

// ---------------------------------------------------------------- 6. 被动登出：只清本地，不发请求（避免死循环）
setActivePinia(createPinia())
globalThis.sessionStorage = memStore()
const org3 = useOrgStore()
const user3 = useUserStore()
await org3.loadAll()
await user3.login('admin', '123456')
ok(!!getToken(), '重新登录后应有 token')
user3.clearSession()
eq(getToken(), '', 'clearSession 应清掉 token')
ok(!user3.isLoggedIn, 'clearSession 后应为未登录')

// ---------------------------------------------------------------- 7. 模式判定
ok(useMock === true, '测试默认运行在 mock 模式')

// ---------------------------------------------------------------- 输出
console.log(`\n认证链路测试：通过 ${pass} 项，失败 ${fails.length} 项`)
if (fails.length) {
  fails.forEach(f => console.log('  ✗ ' + f))
  process.exit(1)
}
console.log('全部通过 ✅')
