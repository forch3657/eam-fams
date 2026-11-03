import type { APIRequestContext } from '@playwright/test'

/**
 * 真实角色 × 资源 × 方法的权限矩阵数据源。
 *
 * 规则口径与后端 `engine/PermissionPolicy` 完全一致：
 * - 读 → 对应模块的 view 码；写 → 模块操作码（多码任一命中即放行）；删 → 单独的表；
 * - `null` 表示后端**没有**登记权限码，任何已登录账号都应可访问（属于全局字典，故意放开）；
 * - 后端按「精确 key 优先、否则最长前缀」匹配，下面的 key 已按该规则展开。
 *
 * 为什么不用「临时角色 + 手挑权限」：那样只能验证后端自身逻辑自洽，
 * 测不出「真实角色在前端的可见按钮」与「后端实际放行的码」之间的漂移
 * （2026-11-02 的 BUG-001 就是这类漂移：前端认 lv:requisition，后端只认 lv:edit）。
 *
 * P1 会把这份映射迁到 `fams-backend/.../contract/permission-resources.json`，
 * 由后端启动时加载，这里改为读取契约文件即可。
 */

export type HttpMethod = 'GET' | 'WRITE' | 'DELETE'

export type ResourceRule = {
  /** 集合 key，与 resources.json / 前端 collections.js 一致 */
  key: string
  /** GET 所需权限码；null = 仅需登录 */
  read: string[] | null
  /** POST / PUT(batch) 所需权限码；null = 仅需登录 */
  write: string[] | null
  /** DELETE 所需权限码；null = 仅需登录 */
  remove: string[] | null
  /**
   * 后端硬编码为只读（审批留痕），与角色权限无关：
   * 任何账号的写/删都必须 403，不能按角色权限推导。
   */
  immutable?: boolean
  note?: string
}

/** 固资 8 类单据：写码按页签维度区分，与前端按钮 :perm 对齐 */
const FIXED_DOC_RULES: ResourceRule[] = [
  { key: 'fixed-asset-doc-lists-inbound', read: ['fa:view'], write: ['fa:inbound', 'fa:add', 'fa:edit'], remove: ['fa:inbound', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-alloc', read: ['fa:view'], write: ['fa:dispatch', 'fa:add', 'fa:edit'], remove: ['fa:dispatch', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-back', read: ['fa:view'], write: ['fa:dispatch', 'fa:add', 'fa:edit'], remove: ['fa:dispatch', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-borrow', read: ['fa:view'], write: ['fa:borrow', 'fa:add', 'fa:edit'], remove: ['fa:borrow', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-change', read: ['fa:view'], write: ['fa:change', 'fa:add', 'fa:edit'], remove: ['fa:change', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-transfer', read: ['fa:view'], write: ['fa:dispose', 'fa:add', 'fa:edit'], remove: ['fa:dispose', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-repair', read: ['fa:view'], write: ['fa:dispose', 'fa:add', 'fa:edit'], remove: ['fa:dispose', 'fa:edit'] },
  { key: 'fixed-asset-doc-lists-dispose', read: ['fa:view'], write: ['fa:dispose', 'fa:add', 'fa:edit'], remove: ['fa:dispose', 'fa:edit'] }
]

/** 低值三类单据：写码按业务动作区分，不能统一收敛到 lv:edit */
const LOW_VALUE_DOC_RULES: ResourceRule[] = [
  { key: 'low-value-inbound', read: ['lv:view'], write: ['lv:inbound', 'lv:edit'], remove: ['lv:inbound', 'lv:edit'] },
  { key: 'low-value-requisition', read: ['lv:view'], write: ['lv:requisition', 'lv:edit'], remove: ['lv:requisition', 'lv:edit'] },
  { key: 'low-value-return', read: ['lv:view'], write: ['lv:return', 'lv:edit'], remove: ['lv:return', 'lv:edit'] }
]

export const RESOURCE_RULES: ResourceRule[] = [
  // ---------------- 固定资产
  { key: 'fixed-assets', read: ['fa:view'], write: ['fa:add', 'fa:edit'], remove: ['fa:delete'] },
  { key: 'fixed-asset-inventory-plans', read: ['fa:inventory'], write: ['fa:inventory'], remove: ['fa:inventory'] },
  { key: 'fixed-asset-inventory-docs', read: ['fa:inventory'], write: ['fa:inventory'], remove: ['fa:inventory'] },
  // 折旧方案/规则是基础字典：能看台账就要能读，写与计提仍要 fa:depreciation
  { key: 'fixed-asset-depreciation-schemes', read: ['fa:view'], write: ['fa:depreciation'], remove: ['fa:depreciation'] },
  { key: 'fixed-asset-depreciation-reports', read: ['fa:depreciation'], write: ['fa:depreciation'], remove: ['fa:depreciation'] },
  { key: 'fixed-asset-settings-locations', read: ['fa:settings'], write: ['fa:settings'], remove: ['fa:settings'] },
  { key: 'fixed-asset-settings-categories', read: ['fa:settings'], write: ['fa:settings'], remove: ['fa:settings'] },
  { key: 'fixed-asset-settings-depreciation-plans', read: ['fa:view'], write: ['fa:settings'], remove: ['fa:settings'] },
  { key: 'fixed-asset-settings-depreciation-rules', read: ['fa:view'], write: ['fa:settings'], remove: ['fa:settings'] },
  // 审批留痕：可读但不可写（任何角色写都必须 403）
  { key: 'fixed-asset-doc-approvals', read: null, write: null, remove: null, immutable: true, note: '审批留痕只读' },
  ...FIXED_DOC_RULES,

  // ---------------- 低值资产
  { key: 'low-value-items', read: ['lv:view'], write: ['lv:edit'], remove: ['lv:edit'] },
  ...LOW_VALUE_DOC_RULES,
  // 存放位置是业务表单依赖的基础字典：读随 lv:view，写要 lv:settings
  { key: 'low-value-settings-locations', read: ['lv:view'], write: ['lv:settings'], remove: ['lv:settings'] },

  // ---------------- 组织架构
  // 公司/部门/角色的「读」故意不设码：路由守卫与权限判定需要先读主数据
  { key: 'org-companies', read: null, write: ['org:company'], remove: ['org:company'] },
  { key: 'org-departments', read: null, write: ['org:dept'], remove: ['org:dept'] },
  // 审批人解析需要读用户：wm:todo 也必须能读
  { key: 'org-users', read: ['org:user', 'wm:todo'], write: ['org:user'], remove: ['org:user'] },
  { key: 'org-roles', read: null, write: ['org:role'], remove: ['org:role'] },

  // ---------------- 系统管理
  { key: 'system-dict-types', read: ['sys:dict'], write: ['sys:dict'], remove: ['sys:dict'] },
  { key: 'system-params', read: ['sys:params', 'wm:view'], write: ['sys:params'], remove: ['sys:params'] },
  { key: 'system-workflow-flows', read: ['sys:workflow', 'wm:todo'], write: ['sys:workflow'], remove: ['sys:workflow'] },
  { key: 'system-terminal-devices', read: ['sys:terminal'], write: ['sys:terminal'], remove: ['sys:terminal'] },
  { key: 'system-terminal-abnormal', read: ['sys:terminal'], write: ['sys:terminal'], remove: ['sys:terminal'] },
  { key: 'notify-messages', read: ['sys:message', 'wm:message'], write: ['sys:message', 'wm:todo'], remove: ['sys:message'] },
  { key: 'notify-templates', read: ['sys:template', 'wm:message'], write: ['sys:template'], remove: ['sys:template'] },
  { key: 'operation-logs', read: ['sys:log'], write: ['sys:log'], remove: ['sys:log'] }
]

/** 参与矩阵的种子角色（真实生产角色，非临时合成角色） */
export const SEED_ROLE_CODES = [
  'ROLE_ADMIN',
  'ROLE_ASSET',
  'ROLE_USER',
  'ROLE_FINANCE',
  'ROLE_LEADER',
  'ROLE_WAREHOUSE'
] as const

export type SeedRoleCode = (typeof SEED_ROLE_CODES)[number]

/**
 * 探测一次访问，不产生任何业务数据。
 *
 * - GET：走分页接口，pageSize=1，避免大表全量返回；
 * - WRITE：走 batch 且传空数组，鉴权在写库之前执行，空数组不会落库；
 * - DELETE：删一个必然不存在的 id，鉴权通过后只会返回「不存在」。
 *
 * 只关心状态码是否是 403：403 代表被权限策略拦下，
 * 其余状态（200/400/404/422）都说明已经越过鉴权层。
 */
export async function probeResource(
  api: APIRequestContext,
  rule: ResourceRule,
  method: HttpMethod
): Promise<number> {
  if (method === 'GET') {
    const res = await api.get(`/api/${rule.key}/page?page=1&pageSize=1`)
    return res.status()
  }
  if (method === 'WRITE') {
    const res = await api.put(`/api/${rule.key}/batch`, { data: [] })
    return res.status()
  }
  const res = await api.delete(`/api/${rule.key}/__e2e_probe_absent__`)
  return res.status()
}

/** 该角色对某资源某方法的期望：是否有权访问 */
export function expectedGranted(
  rule: ResourceRule,
  method: HttpMethod,
  granted: Set<string>
): { allowed: boolean; codes: string[] | null; immutable: boolean } {
  const immutable = Boolean(rule.immutable) && method !== 'GET'
  const codes = method === 'GET' ? rule.read : method === 'DELETE' ? rule.remove : rule.write
  if (immutable) return { allowed: false, codes, immutable }
  // codes === null 表示后端未登记权限码，仅要求登录
  if (codes === null) return { allowed: true, codes, immutable }
  return { allowed: codes.some(code => granted.has(code)), codes, immutable }
}
