import { expect, test } from '@playwright/test'
import { shot, waitSettled } from './fixtures/artifacts'
import { apiAs, loginViaApi, seedSession, type Session } from './fixtures/auth'
import { cleanupTemp, createTempUser, type TempUser } from './fixtures/data'
import { installGuards } from './fixtures/net'
import {
  RESOURCE_RULES,
  SEED_ROLE_CODES,
  expectedGranted,
  probeResource,
  type HttpMethod
} from './fixtures/permissionMatrix'

/**
 * 真实角色 × 资源 × 方法 的权限矩阵。
 *
 * 与 `04-permission-matrix.spec.ts` 的分工：
 * - P4 用临时合成角色验证「权限码本身生效」（开关、并集、即时性）；
 * - 本文件用生产种子角色验证「真实角色拿到的权限集合」与后端放行口径一致，
 *   用来发现前后端漂移（如前端按 lv:requisition 显示按钮、后端却要 lv:edit）。
 *
 * 数据策略：admin 只用于建临时账号并挂真实角色，业务断言全部用该账号自己的 token。
 * 所有写探测都用「空批量」或「不存在的 id」，不产生任何业务数据。
 */

type RoleRow = {
  id: string
  code: string
  name: string
  permissions?: string[]
}

type Principal = {
  code: string
  name: string
  roleId: string
  permissions: Set<string>
  session: Session
  user: TempUser
}

const METHODS: HttpMethod[] = ['GET', 'WRITE', 'DELETE']

let admin: Session
const tempUsers: TempUser[] = []
const principals: Principal[] = []

test.beforeAll(async () => {
  admin = await loginViaApi()

  const api = await apiAs(admin.token)
  try {
    const res = await api.get('/api/org-roles?pageSize=200')
    expect(res.ok(), `读取角色列表失败 HTTP ${res.status()}`).toBeTruthy()
    const body = await res.json()
    const roles: RoleRow[] = body?.data ?? []

    for (const code of SEED_ROLE_CODES) {
      const role = roles.find(r => r.code === code)
      if (!role) throw new Error(`生产库缺少种子角色 ${code}，无法执行权限矩阵`)

      // 用真实角色挂一个临时账号：既拿到真实权限集合，又不依赖种子账号的密码
      const user = await createTempUser(admin, role.id)
      tempUsers.push(user)
      const session = await loginViaApi({ username: user.username, password: user.password })

      principals.push({
        code,
        name: role.name,
        roleId: role.id,
        permissions: new Set(role.permissions ?? []),
        session,
        user
      })
    }
  } finally {
    await api.dispose()
  }
})

test.afterAll(async () => {
  // 先删用户再删角色；角色本身是生产种子，不删除
  for (const user of tempUsers) {
    await cleanupTemp(admin, { userId: user.id }).catch(() => null)
  }
})

for (const code of SEED_ROLE_CODES) {
  test(`[P4-20] ${code} 的接口权限与角色权限码一致`, async ({}, testInfo) => {
    // 6 个角色 × 33 个资源 × 3 个方法，串行探测，远超默认 90 秒
    test.setTimeout(240_000)

    const principal = principals.find(p => p.code === code)
    expect(principal, `角色 ${code} 未完成初始化`).toBeTruthy()
    if (!principal) return

    const api = await apiAs(principal.session.token)
    const mismatches: string[] = []
    const serverErrors: string[] = []
    let checked = 0

    try {
      for (const rule of RESOURCE_RULES) {
        for (const method of METHODS) {
          const exp = expectedGranted(rule, method, principal.permissions)
          const status = await probeResource(api, rule, method)
          checked++

          if (status === 401) {
            mismatches.push(`${method} ${rule.key}：期望正常鉴权，实际 401（token 失效）`)
            continue
          }
          if (exp.allowed && status === 403) {
            const codes = exp.codes?.join(' | ') ?? '仅需登录'
            mismatches.push(`${method} ${rule.key}：应放行（${codes}），实际 403`)
            continue
          }
          if (!exp.allowed && status !== 403) {
            const codes = exp.immutable
              ? '审批留痕不可写'
              : exp.codes?.join(' | ') ?? '未登记'
            mismatches.push(`${method} ${rule.key}：应 403（${codes}），实际 ${status}`)
            continue
          }
          // 已越过鉴权但服务端报错：说明权限没拦住问题，而是代码本身有问题
          if (exp.allowed && status >= 500) {
            serverErrors.push(`${method} ${rule.key}：HTTP ${status}`)
          }
        }
      }
    } finally {
      await api.dispose()
    }

    // 失败时把角色权限快照贴出来，避免只能看到「某个码不对」却不知道该角色到底有什么
    await testInfo.attach(`role-${code}-permissions`, {
      body: JSON.stringify(
        {
          code: principal.code,
          name: principal.name,
          roleId: principal.roleId,
          checked,
          permissions: [...principal.permissions].sort()
        },
        null,
        2
      ),
      contentType: 'application/json'
    })

    expect(
      serverErrors,
      `${code} 越权探测通过后出现服务端异常（权限层没问题，但接口本身报错）`
    ).toEqual([])
    expect(
      mismatches,
      `${code} 的接口放行结果与角色权限码不一致：\n${mismatches.join('\n')}`
    ).toEqual([])
  })
}

/**
 * 页面抽样：按钮可见性必须与权限码一致。
 *
 * 接口矩阵能发现「后端放行口径」漂移，但发现不了「前端该显示的按钮没显示」，
 * 这里用真实角色会话打开页面做交叉验证。
 */
const BUTTON_CASES = [
  {
    code: 'ROLE_USER',
    path: '/low-value-assets?tab=requisition',
    button: /新增领用/,
    visible: true,
    reason: '资产使用人有 lv:requisition'
  },
  {
    code: 'ROLE_FINANCE',
    path: '/low-value-assets?tab=requisition',
    button: /新增领用/,
    visible: false,
    reason: '财务管理员没有 lv:requisition'
  },
  {
    code: 'ROLE_ASSET',
    path: '/fixed-assets?tab=asset',
    button: /新增资产/,
    visible: true,
    reason: '资产管理员有 fa:add'
  },
  {
    code: 'ROLE_LEADER',
    path: '/fixed-assets?tab=asset',
    button: /新增资产/,
    visible: false,
    reason: '部门主管没有 fa:add（只有 fa:edit）'
  }
] as const

// 每个角色一条用例：403 能直接定位到哪个角色，而不是只看到「某处 403」
for (const [index, item] of BUTTON_CASES.entries()) {
  test(`[P4-21-${index + 1}] ${item.code} 的关键按钮${item.visible ? '可见' : '隐藏'}`, async ({ context, page }, testInfo) => {
    const principal = principals.find(p => p.code === item.code)
    expect(principal, `角色 ${item.code} 未完成初始化`).toBeTruthy()
    if (!principal) return

    const guards = installGuards(page)
    await seedSession(context, principal.session)
    await page.goto(item.path)
    await waitSettled(page)

    const button = page.getByRole('button', { name: item.button }).first()
    if (item.visible) {
      await expect(button, `${item.code}：${item.reason}`).toBeVisible()
    } else {
      await expect(button, `${item.code}：${item.reason}`).toHaveCount(0)
    }
    await shot(page, testInfo, 1, `${item.code}-${item.visible ? '可见' : '隐藏'}`)

    // 真实业务角色首屏不应再有未豁免的 4xx（P0-3 的验收口径）
    guards.assertClean()
  })
}
