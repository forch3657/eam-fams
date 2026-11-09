import { expect, request, test, type APIRequestContext } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import {
  cleanupTemp,
  createTempRole,
  createTempUser,
  deleteRole,
  setRolePermissions,
  setRoleStatus,
  type TempRole,
  type TempRoleOptions,
  type TempUser
} from './fixtures/data'
import { ADMIN, BASE_URL } from './fixtures/env'
import { installGuards } from './fixtures/net'

/**
 * P4 权限矩阵。
 *
 * 覆盖三层：菜单（可见性）→ 路由（兜底）→ 接口（后端强制），
 * 以及角色状态/权限变更的即时性、多角色并集、删除保护、数据范围。
 *
 * 数据：每个用例现建 `E2E_` 前缀角色 + 用户，afterAll 先用户后角色删除；
 * 全部断言走独立 token，不复用 admin 会话，避免「管理员能过 = 用例通过」的假绿。
 */
let admin: Session
let anonymous: APIRequestContext
const tempUsers: TempUser[] = []
const tempRoles: TempRole[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()
  anonymous = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true })
})

test.afterAll(async () => {
  // 先删用户再删角色：角色被引用时后端会以 code=1003 拒绝删除
  for (const user of tempUsers) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
  for (const role of tempRoles) {
    await deleteRole(admin, role.id)
  }
  await anonymous?.dispose()
})

/** 建角色 + 用户并完成一次真实接口登录，返回该账号的会话 */
async function newPrincipal(permissions: string[], options: TempRoleOptions = {}) {
  const role = await createTempRole(admin, { permissions, ...options })
  tempRoles.push(role)
  const user = await createTempUser(admin, role.id)
  tempUsers.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })
  return { role, user, session, token: session.token }
}

/**
 * 受限账号导航守卫。
 *
 * 2026-11-02 起预取已按权限懒加载，业务角色首屏不应再有 403；
 * 因此这里不再提供整页 403 豁免，确需豁免必须逐请求写明 reason。
 */
function restrictedGuards(page: Parameters<typeof installGuards>[0]) {
  return installGuards(page)
}

async function withApi<T>(token: string, fn: (api: APIRequestContext) => Promise<T>): Promise<T> {
  const api = await apiAs(token)
  try {
    return await fn(api)
  } finally {
    await api.dispose()
  }
}

// ---------------------------------------------------------------- 菜单与路由

test('[P4-01] 仅 wm:view 时菜单只有工作台', async ({ context, page }, testInfo) => {
  const { session } = await newPrincipal(['wm:view'])
  const guards = restrictedGuards(page)

  await seedSession(context, session)
  await page.goto('/workbench')
  await waitSettled(page)

  const menu = page.locator('.el-menu').first()
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('工作台')
  for (const group of ['固定资产', '低值资产', '组织架构', '系统管理']) {
    await expect(menu, `不应出现「${group}」菜单`).not.toContainText(group)
  }
  await expect(page).toHaveURL(/workbench/)
  await shot(page, testInfo, 1, '仅工作台权限')
  guards.assertClean()
})

test('[P4-02] 无 wm:view 时按可访问页落地', async ({ page }, testInfo) => {
  const { user } = await newPrincipal(['fa:view'])
  const guards = restrictedGuards(page)

  await page.goto('/login')
  await page.locator('.login-form input').first().fill(user.username)
  await page.locator('input[type=password]').first().fill(user.password)
  await page.locator('button').filter({ hasText: /登\s*录/ }).first().click()

  // 登录后统一跳 /workbench，守卫按 FALLBACK_ROUTES 找到第一个可访问页
  await page.waitForURL(/fixed-assets/, { timeout: 30_000 })
  await waitSettled(page)
  const menu = page.locator('.el-menu').first()
  await expect(menu).toContainText('固定资产')
  await expect(menu).toContainText('资产管理')
  await expect(menu, '无 wm:view 不应出现工作台').not.toContainText('工作台')
  await shot(page, testInfo, 1, '落到资产台账')
  guards.assertClean()
})

test('[P4-03] 直链越权被兜底回可访问页', async ({ context, page }, testInfo) => {
  const { session } = await newPrincipal(['wm:view'])
  const guards = restrictedGuards(page)
  await seedSession(context, session)

  await page.goto('/system/role')
  await page.waitForURL(/workbench/, { timeout: 30_000 })
  await waitSettled(page)
  await expect(page.locator('.el-menu').first()).toBeVisible()
  await shot(page, testInfo, 1, '越权直链回落工作台')
  guards.assertClean()
})

test('[P4-04] 无任何权限时落到 403', async ({ context, page }, testInfo) => {
  const { session } = await newPrincipal([])
  const guards = restrictedGuards(page)
  await seedSession(context, session)

  await page.goto('/workbench')
  await page.waitForURL(/\/403/, { timeout: 30_000 })
  await waitSettled(page)
  await expect(page.locator('body')).toContainText(/无访问权限|无权限/)
  await shot(page, testInfo, 1, '无可用页面落 403')
  guards.assertClean()
})

test('[P4-05] 只有查看权时不渲染新增/删除按钮', async ({ context, page, browser }, testInfo) => {
  const { session } = await newPrincipal(['fa:view'])
  const guards = restrictedGuards(page)
  await seedSession(context, session)

  await page.goto('/fixed-assets')
  await waitSettled(page)
  const pane = page.locator('.el-tab-pane:visible').first()
  await expect(page.getByRole('button', { name: /新增资产/ })).toHaveCount(0)
  await expect(pane.getByRole('button', { name: '删除' })).toHaveCount(0)
  await shot(page, testInfo, 1, '受限角色无新增删除')

  // 对照组：同一页面在管理员视角下按钮存在，排除「页面本来就没有按钮」
  const adminContext = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true
  })
  const adminPage = await adminContext.newPage()
  await seedSession(adminContext, await loginViaApi({ username: ADMIN.username, password: ADMIN.password }))
  await adminPage.goto('/fixed-assets')
  await waitSettled(adminPage)
  await expect(adminPage.getByRole('button', { name: /新增资产/ }).first()).toBeVisible()
  await shot(adminPage, testInfo, 2, '管理员同页有新增按钮')
  await adminContext.close()
  guards.assertClean()
})

// ---------------------------------------------------------------- 接口级鉴权

test('[P4-06] 无 sys:dict 读取字典被拒绝', async () => {
  const { token } = await newPrincipal(['wm:view'])
  await withApi(token, async api => {
    const res = await api.get('/api/system-dict-types')
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe(403)
  })
})

test('[P4-07] 无 org:user 读取用户表被拒绝', async () => {
  const { token } = await newPrincipal(['wm:view'])
  await withApi(token, async api => {
    const res = await api.get('/api/org-users')
    expect(res.status()).toBe(403)
    expect((await res.json()).code).toBe(403)
  })
})

test('[P4-08] 只有查看权不可新增资产', async () => {
  const { token } = await newPrincipal(['fa:view'])
  await withApi(token, async api => {
    const read = await api.get('/api/fixed-assets')
    expect(read.status()).toBe(200)
    expect((await read.json()).code).toBe(0)

    // 权限校验先于入参校验：空 body 也应先返回 403 而不是 422
    const write = await api.post('/api/fixed-assets', { data: {} })
    expect(write.status()).toBe(403)
    expect((await write.json()).code).toBe(403)
  })
})

test('[P4-09] 未登录访问受保护接口返回 401', async () => {
  const res = await anonymous.get('/api/fixed-assets')
  expect(res.status()).toBe(401)
  expect((await res.json()).code).toBe(401)
})

/**
 * 回归：后端曾把所有 low-value-* 写入统一要求 lv:edit，
 * 而前端「新增领用/入库/退库」分别按 lv:requisition / lv:inbound / lv:return 显示，
 * 导致只有模块码的业务角色点保存就 403。这里直接按接口口径断言。
 */
test('[P4-22] 低值单据按模块权限码放行', async () => {
  const requisitionOnly = await newPrincipal(['wm:view', 'lv:view', 'lv:requisition'])
  await withApi(requisitionOnly.token, async api => {
    // 鉴权通过后才进入参数校验，因此不应是 403
    const req = await api.post('/api/low-value-requisition', { data: {} })
    const reqBody = await req.json()
    expect(req.status(), JSON.stringify(reqBody)).toBe(422)

    const inbound = await api.post('/api/low-value-inbound', { data: {} })
    expect(inbound.status()).toBe(403)
    expect((await inbound.json()).code).toBe(403)
  })

  const readOnly = await newPrincipal(['wm:view', 'lv:view'])
  await withApi(readOnly.token, async api => {
    const req = await api.post('/api/low-value-requisition', { data: {} })
    expect(req.status()).toBe(403)
    expect((await req.json()).code).toBe(403)
  })
})

/** 同一类问题：固资派发页签按 fa:dispatch 显示新增按钮，后端也要认这个码 */
test('[P4-23] 固资派发按 fa:dispatch 放行', async () => {
  const dispatchOnly = await newPrincipal(['wm:view', 'fa:view', 'fa:dispatch'])
  await withApi(dispatchOnly.token, async api => {
    const alloc = await api.post('/api/fixed-asset-doc-lists-alloc', { data: {} })
    const allocBody = await alloc.json()
    expect(alloc.status(), JSON.stringify(allocBody)).toBe(422)

    const borrow = await api.post('/api/fixed-asset-doc-lists-borrow', { data: {} })
    expect(borrow.status()).toBe(403)
  })
})

// ---------------------------------------------------------------- 角色状态与权限变更

test('[P4-10] 停用角色后同一 token 立即失效', async () => {
  const { role, token } = await newPrincipal(['fa:view'])
  await withApi(token, async api => {
    expect((await api.get('/api/fixed-assets')).status()).toBe(200)
    await setRoleStatus(admin, role.id, 'DISABLED')
    const after = await api.get('/api/fixed-assets')
    expect(after.status()).toBe(403)
    expect((await after.json()).code).toBe(403)
  })
})

test('[P4-11] 重新启用角色后同一 token 恢复', async () => {
  const { role, token } = await newPrincipal(['fa:view'])
  await setRoleStatus(admin, role.id, 'DISABLED')
  await setRoleStatus(admin, role.id, 'ENABLED')
  await withApi(token, async api => {
    const res = await api.get('/api/fixed-assets')
    expect(res.status()).toBe(200)
    expect((await res.json()).code).toBe(0)
  })
})

test('[P4-12] 角色追加权限后同一 token 立即生效', async () => {
  const { role, token } = await newPrincipal(['fa:view'])
  await withApi(token, async api => {
    expect((await api.get('/api/system-dict-types')).status()).toBe(403)
    await setRolePermissions(admin, role.id, ['fa:view', 'sys:dict'])
    expect((await api.get('/api/system-dict-types')).status()).toBe(200)
  })
})

test('[P4-13] 停用角色后刷新页面落 403', async ({ context, page }, testInfo) => {
  const { role, session } = await newPrincipal(['wm:view'])
  await setRoleStatus(admin, role.id, 'DISABLED')
  const guards = restrictedGuards(page)
  await seedSession(context, session)

  await page.goto('/workbench')
  await page.waitForURL(/\/403/, { timeout: 30_000 })
  await waitSettled(page)
  await shot(page, testInfo, 1, '角色停用后刷新落 403')
  guards.assertClean()
})

// ---------------------------------------------------------------- 多角色并集

test('[P4-14] 多角色权限取并集', async ({ context, page }, testInfo) => {
  const roleA = await createTempRole(admin, { permissions: ['wm:view'] })
  tempRoles.push(roleA)
  const roleB = await createTempRole(admin, { permissions: ['sys:dict'] })
  tempRoles.push(roleB)
  const user = await createTempUser(admin, [roleA.id, roleB.id])
  tempUsers.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })

  await withApi(session.token, async api => {
    // 两个角色各自授权的接口都应可访问
    const dict = await api.get('/api/system-dict-types')
    expect(dict.status()).toBe(200)
  })

  const guards = restrictedGuards(page)
  await seedSession(context, session)
  await page.goto('/workbench')
  await waitSettled(page)
  const menu = page.locator('.el-menu').first()
  await expect(menu).toContainText('工作台')
  await expect(menu).toContainText('数据字典')
  await shot(page, testInfo, 1, '两个角色的菜单并集')
  guards.assertClean()
})

test('[P4-15] 停用其中一个角色不影响另一个角色', async ({ context, page }, testInfo) => {
  const roleA = await createTempRole(admin, { permissions: ['wm:view'] })
  tempRoles.push(roleA)
  const roleB = await createTempRole(admin, { permissions: ['sys:dict'] })
  tempRoles.push(roleB)
  const user = await createTempUser(admin, [roleA.id, roleB.id])
  tempUsers.push(user)
  const session = await loginViaApi({ username: user.username, password: user.password })

  await setRoleStatus(admin, roleB.id, 'DISABLED')

  await withApi(session.token, async api => {
    expect((await api.get('/api/system-dict-types')).status()).toBe(403)
  })

  const guards = restrictedGuards(page)
  await seedSession(context, session)
  await page.goto('/workbench')
  await waitSettled(page)
  const menu = page.locator('.el-menu').first()
  await expect(menu).toContainText('工作台')
  await expect(menu).not.toContainText('数据字典')
  await shot(page, testInfo, 1, '停用其一仅失去该角色权限')
  guards.assertClean()
})

// ---------------------------------------------------------------- 角色管理保护

test('[P4-16] 角色被用户引用时禁止删除', async () => {
  const { role } = await newPrincipal(['wm:view'])
  await withApi(admin.token, async api => {
    const res = await api.delete(`/api/org-roles/${role.id}`)
    // 契约业务码 1003 走 HTTP 200，语义由信封承载
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.code).toBe(1003)
    expect(body.message).toContain('已关联用户')
  })
})

test('[P4-17] 未被引用的角色可以删除', async () => {
  const role = await createTempRole(admin, { permissions: ['wm:view'] }) // 不入清理列表，本用例自己删
  await withApi(admin.token, async api => {
    const del = await api.delete(`/api/org-roles/${role.id}`)
    expect(del.status()).toBe(200)
    expect((await del.json()).code).toBe(0)

    const detail = await api.get(`/api/org-roles/${role.id}`)
    expect(detail.status()).toBe(404)
    expect((await detail.json()).code).toBe(404)
  })
})

// ---------------------------------------------------------------- 数据范围

test('[P4-18] dataScope 保存后可原样回读', async () => {
  const role = await createTempRole(admin, { permissions: ['fa:view'], dataScope: 'SELF', orgScope: 'DEPT' })
  tempRoles.push(role)
  await withApi(admin.token, async api => {
    const res = await api.get(`/api/org-roles/${role.id}`)
    expect(res.status()).toBe(200)
    const data = (await res.json()).data
    expect(data.dataScope).toBe('SELF')
    expect(data.orgScope).toBe('DEPT')
  })
})

/**
 * P4-D3（2026-11-02 修复）：GenericService 按当前主体 dataScope 注入过滤，
 * SELF 只返回 createBy = 当前账号的行，且服务端覆盖同名的 query 参数。
 */
test('[P4-19] dataScope=SELF 只应看到本人数据', async () => {
  const { user, token } = await newPrincipal(['fa:view'], { dataScope: 'SELF' })
  await withApi(token, async api => {
    const res = await api.get('/api/fixed-assets?pageSize=500')
    expect(res.status()).toBe(200)
    const rows = (await res.json()).data as Array<Record<string, unknown>>
    // SELF 按 createBy 过滤；DEPT_ONLY 已改为按 userId（固定资产）/ creatorId（单据）过滤，
    // 不再与 DEPT 共用 deptId 条件
    for (const row of rows) {
      expect(String(row.createBy ?? row.userId ?? '')).toBe(user.username)
    }
  })
})

/**
 * P4-D1（2026-11-02 修复）：AuthService.login 在密码校验通过后校验 status，
 * 停用账号返回 403，不再签发 token。
 */
test('[P4-20] 停用用户不能登录', async () => {
  const { user } = await newPrincipal(['wm:view'])
  await withApi(admin.token, async api => {
    const before = await api.get(`/api/org-users/${user.id}`)
    await api.put(`/api/org-users/${user.id}`, {
      data: { ...(await before.json()).data, status: 'DISABLED' }
    })
  })
  const ctx = await request.newContext({ baseURL: BASE_URL })
  try {
    const res = await ctx.post('/api/auth/login', { data: { username: user.username, password: user.password } })
    expect(res.ok(), '停用账号不应登录成功').toBeFalsy()
  } finally {
    await ctx.dispose()
  }
})

/**
 * P4-D2（2026-11-02 修复）：UserDetailsServiceImpl 重载用户时校验 status，
 * 停用后存量 token 在下一次请求即被拒绝（401）。
 */
test('[P4-21] 停用用户的存量 token 立即失效', async () => {
  const { user, token } = await newPrincipal(['fa:view'])
  await withApi(admin.token, async api => {
    const before = await api.get(`/api/org-users/${user.id}`)
    await api.put(`/api/org-users/${user.id}`, {
      data: { ...(await before.json()).data, status: 'DISABLED' }
    })
  })
  await withApi(token, async api => {
    expect((await api.get('/api/fixed-assets')).status()).toBe(401)
  })
})
