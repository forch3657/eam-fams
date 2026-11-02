import { request, type APIRequestContext, type BrowserContext } from '@playwright/test'
import { ADMIN, BASE_URL, STORAGE_KEYS } from './env'

export type Session = {
  token: string
  user: Record<string, any>
}

/**
 * 接口登录，拿到 token 与用户快照。
 *
 * 为什么不直接复用 storageState：本应用的会话存在 sessionStorage，
 * storageState 只持久化 cookie/localStorage，还原后仍是未登录态。
 */
export async function loginViaApi(
  credentials: { username: string; password: string } = ADMIN
): Promise<Session> {
  const api = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true })
  try {
    const res = await api.post('/api/auth/login', { data: credentials })
    if (!res.ok()) {
      throw new Error(`登录失败 HTTP ${res.status()}: ${await res.text()}`)
    }
    const body = await res.json()
    if (body.code !== 0) {
      throw new Error(`登录失败 code=${body.code} ${body.message ?? ''}`)
    }
    const { token, user } = body.data as { token: string; user: Record<string, any> }
    if (!token) throw new Error('登录接口未返回 token')

    // 登录接口只回账号本体，角色名/公司名由主数据拼出来，保证 UI 展示与真实登录一致
    const headers = { Authorization: `Bearer ${token}` }
    const [roles, companies] = await Promise.all([
      api.get('/api/org-roles?pageSize=200', { headers }).then(r => (r.ok() ? r.json() : null)).catch(() => null),
      api.get('/api/org-companies?pageSize=200', { headers }).then(r => (r.ok() ? r.json() : null)).catch(() => null)
    ])
    const roleList: any[] = roles?.data ?? []
    const companyList: any[] = companies?.data ?? []
    const roleText = (user.roleIds ?? [])
      .map((id: string) => roleList.find(r => r.id === id && r.status === 'ENABLED')?.name)
      .filter(Boolean)
      .join('、')
    const orgName = companyList.find(c => c.id === user.companyId)?.name ?? ''

    return { token, user: { ...user, role: roleText, org: orgName } }
  } finally {
    await api.dispose()
  }
}

/**
 * 把会话写进 sessionStorage。
 *
 * addInitScript 在每次导航的页面脚本之前执行，因此每个用例只需注入一次，
 * 后续路由跳转、刷新都不会丢会话（比每条用例走 UI 登录快 2–3 秒）。
 */
export async function seedSession(context: BrowserContext, session: Session): Promise<void> {
  await context.addInitScript(
    ([userKey, tokenKey, userJson, token]) => {
      sessionStorage.setItem(userKey as string, userJson as string)
      sessionStorage.setItem(tokenKey as string, token as string)
    },
    [STORAGE_KEYS.user, STORAGE_KEYS.token, JSON.stringify(session.user), session.token]
  )
}

/** 带鉴权的接口上下文，用于与界面结果交叉断言 */
export async function apiAs(token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` }
  })
}
