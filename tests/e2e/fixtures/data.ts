import { apiAs, type Session } from './auth'

/** 测试数据统一前缀，便于事后清理与人工识别 */
export const E2E_PREFIX = 'E2E_'

export type TempRole = {
  id: string
  code: string
  name: string
  permissions: string[]
  dataScope: string
  status: 'ENABLED' | 'DISABLED'
}
export type TempUser = { id: string; username: string; name: string; password: string }

export type TempRoleOptions = {
  /** 权限码集合；空数组用于验证「无任何权限」的兜底 */
  permissions?: string[]
  /** 组织范围，契约枚举 GROUP / COMPANY / DEPT */
  orgScope?: string
  /** 数据范围，契约枚举 ALL / COMPANY / DEPT / DEPT_ONLY / SELF */
  dataScope?: string
  status?: 'ENABLED' | 'DISABLED'
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

async function assertOk(res: any, action: string) {
  if (!res.ok()) throw new Error(`${action} 失败 HTTP ${res.status()}: ${await res.text()}`)
  const body = await res.json()
  if (body.code !== 0) throw new Error(`${action} 失败 code=${body.code} ${body.message ?? ''}`)
  return body.data
}

/** 按角色编码取角色 id（审批环节按角色匹配，用例需要给临时账号挂对应角色） */
export async function findRoleIdByCode(session: Session, code: string): Promise<string> {
  const api = await apiAs(session.token)
  try {
    const roles = await assertOk(await api.get('/api/org-roles?pageSize=200'), '查询角色')
    const role = (roles ?? []).find((r: any) => r.code === code)
    if (!role) throw new Error(`未找到角色：${code}`)
    return role.id as string
  } finally {
    await api.dispose()
  }
}

/** 取一个可用的公司/部门，创建用户时外键必需 */
export async function pickOrgUnit(session: Session): Promise<{ companyId: string; deptId: string }> {
  const api = await apiAs(session.token)
  try {
    const companies = await assertOk(await api.get('/api/org-companies?pageSize=50'), '查询公司')
    const companyId = companies?.[0]?.id
    if (!companyId) throw new Error('生产/测试库缺少公司主数据')
    const depts = await assertOk(
      await api.get(`/api/org-departments?pageSize=50&companyId=${encodeURIComponent(companyId)}`),
      '查询部门'
    )
    return { companyId, deptId: depts?.[0]?.id ?? '' }
  } finally {
    await api.dispose()
  }
}

/**
 * 建一个临时角色。
 * 默认只给工作台权限，便于验证「无权限页面直链会兜底」；
 * 传 options 可指定权限集合 / 数据范围 / 状态（P4 权限矩阵用）。
 */
export async function createTempRole(
  session: Session,
  permissionsOrOptions: string[] | TempRoleOptions = ['wm:view']
): Promise<TempRole> {
  const options: TempRoleOptions = Array.isArray(permissionsOrOptions)
    ? { permissions: permissionsOrOptions }
    : permissionsOrOptions
  const suffix = uniqueSuffix()
  const payload = {
    code: `${E2E_PREFIX}ROLE_${suffix}`,
    name: `${E2E_PREFIX}临时角色_${suffix}`,
    orgScope: options.orgScope ?? 'COMPANY',
    dataScope: options.dataScope ?? 'COMPANY',
    status: options.status ?? 'ENABLED',
    sort: 999,
    remark: 'E2E 自动创建，用后删除',
    permissions: options.permissions ?? ['wm:view']
  }
  const api = await apiAs(session.token)
  try {
    const created = await assertOk(await api.post('/api/org-roles', { data: payload }), '创建临时角色')
    return {
      id: created.id,
      code: payload.code,
      name: payload.name,
      permissions: payload.permissions,
      dataScope: payload.dataScope,
      status: payload.status as 'ENABLED' | 'DISABLED'
    }
  } finally {
    await api.dispose()
  }
}

/** 建一个临时用户并绑定角色（支持多角色，验证权限并集）；口令满足密码策略 */
export async function createTempUser(
  session: Session,
  roleId: string | string[],
  options?: { deptId?: string }
): Promise<TempUser> {
  const suffix = uniqueSuffix()
  const org = await pickOrgUnit(session)
  const deptId = options?.deptId || org.deptId
  const payload = {
    username: `e2e_${suffix}`,
    password: 'E2e@2026test',
    name: `${E2E_PREFIX}临时用户_${suffix}`,
    companyId: org.companyId,
    deptId,
    position: 'E2E',
    roleIds: Array.isArray(roleId) ? roleId : [roleId],
    status: 'ENABLED'
  }
  const api = await apiAs(session.token)
  try {
    const created = await assertOk(await api.post('/api/org-users', { data: payload }), '创建临时用户')
    await bindDeptApprover(session, created.id, payload.roleIds, deptId)
    return { id: created.id, username: payload.username, name: payload.name, password: payload.password }
  } finally {
    await api.dispose()
  }
}

/**
 * 纵向审批（DEPT_LEADER / DEPT_VP）：审批人按单据归属部门解析到具体的人。
 *
 * 测试里承担「部门主管」「分管副总」的临时账号必须同时是该部门的
 * 负责人/分管领导，否则环节解析不到人、提交会被拦下。
 * 这里在创建临时账号时绑定，清理临时账号时还原，
 * 避免在库里留下指向已删除用户的悬空引用。
 */
const deptApproverState = new Map<string, { leaderId?: string; vpId?: string; bound: Set<string> }>()

async function bindDeptApprover(session: Session, userId: string, roleIds: string[], deptId: string) {
  if (!deptId || !roleIds?.length) return
  const api = await apiAs(session.token)
  try {
    const roles = await assertOk(await api.get('/api/org-roles?pageSize=200'), '查询角色')
    const codes = roleIds.map(id => ((roles ?? []).find((r: any) => r.id === id) || {}).code || '')
    const wantLeader = codes.includes('ROLE_LEADER')
    const wantVp = codes.includes('ROLE_VP')
    if (!wantLeader && !wantVp) return
    const dept = await assertOk(await api.get(`/api/org-departments/${deptId}`), '读取部门')
    if (!deptApproverState.has(deptId)) {
      deptApproverState.set(deptId, {
        leaderId: dept.leaderId || '',
        vpId: dept.vpId || '',
        bound: new Set<string>()
      })
    }
    const state = deptApproverState.get(deptId)!
    const body: Record<string, unknown> = {}
    if (wantLeader) body.leaderId = userId
    if (wantVp) body.vpId = userId
    state.bound.add(userId)
    await assertOk(
      await api.put(`/api/org-departments/${deptId}`, { data: { ...dept, ...body } }),
      '设置部门审批人'
    )
  } finally {
    await api.dispose()
  }
}

/** 清理临时账号前，把部门负责人/分管领导还原回原值 */
async function restoreDeptApprover(session: Session, userId: string) {
  const targets = [...deptApproverState.entries()].filter(([, s]) => s.bound.has(userId))
  if (!targets.length) return
  const api = await apiAs(session.token)
  try {
    for (const [deptId, state] of targets) {
      const dept = await assertOk(await api.get(`/api/org-departments/${deptId}`), '读取部门')
      const body: Record<string, unknown> = {}
      if (dept.leaderId === userId) body.leaderId = state.leaderId || ''
      if (dept.vpId === userId) body.vpId = state.vpId || ''
      if (Object.keys(body).length) {
        await assertOk(
          await api.put(`/api/org-departments/${deptId}`, { data: { ...dept, ...body } }),
          '还原部门审批人'
        )
      }
      state.bound.delete(userId)
      if (!state.bound.size) deptApproverState.delete(deptId)
    }
  } finally {
    await api.dispose()
  }
}

/** 清理：先用户后角色（角色被引用时删除会被外键/引用保护拦下） */
export async function cleanupTemp(session: Session, entities: { userId?: string; roleId?: string }) {
  const api = await apiAs(session.token)
  try {
    if (entities.userId) {
      await restoreDeptApprover(session, entities.userId)
      await api.delete(`/api/org-users/${entities.userId}`).catch(() => null)
    }
    if (entities.roleId) {
      await api.delete(`/api/org-roles/${entities.roleId}`).catch(() => null)
    }
  } finally {
    await api.dispose()
  }
}

/** 停用/启用角色（验证停用后权限立即失效） */
export async function setRoleStatus(session: Session, roleId: string, status: 'ENABLED' | 'DISABLED') {
  const api = await apiAs(session.token)
  try {
    const current = await assertOk(await api.get(`/api/org-roles/${roleId}`), '读取角色')
    await assertOk(
      await api.put(`/api/org-roles/${roleId}`, { data: { ...current, status } }),
      '更新角色状态'
    )
  } finally {
    await api.dispose()
  }
}

/** 覆盖角色权限码（用于验证「改权限后同一 token 立即生效」） */
export async function setRolePermissions(session: Session, roleId: string, permissions: string[]) {
  const api = await apiAs(session.token)
  try {
    const current = await assertOk(await api.get(`/api/org-roles/${roleId}`), '读取角色')
    await assertOk(
      await api.put(`/api/org-roles/${roleId}`, { data: { ...current, permissions } }),
      '更新角色权限'
    )
  } finally {
    await api.dispose()
  }
}

/** 停用/启用用户（验证停用后的登录与存量 token 行为） */
export async function setUserStatus(session: Session, userId: string, status: 'ENABLED' | 'DISABLED') {
  const api = await apiAs(session.token)
  try {
    const current = await assertOk(await api.get(`/api/org-users/${userId}`), '读取用户')
    await assertOk(
      await api.put(`/api/org-users/${userId}`, { data: { ...current, status } }),
      '更新用户状态'
    )
  } finally {
    await api.dispose()
  }
}

/** 删除角色；被用户引用时后端返回 code=1003，调用方需先删用户 */
export async function deleteRole(session: Session, roleId: string) {
  const api = await apiAs(session.token)
  try {
    await api.delete(`/api/org-roles/${roleId}`).catch(() => null)
  } finally {
    await api.dispose()
  }
}
