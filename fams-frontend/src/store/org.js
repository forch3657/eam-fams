import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { ORG_SEEDS } from '../services/mock/seed/org'
import { STATUS_ENABLED } from '../constants/enums'

function nowText() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function nextCode(prefix, rows, digits = 4) {
  const max = rows.reduce((m, r) => {
    const n = Number(String(r.code || '').replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `${prefix}-${String(max + 1).padStart(digits, '0')}`
}

function randomPassword(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let pwd = ''
  for (let i = 0; i < len; i++) pwd += chars.charAt(Math.floor(Math.random() * chars.length))
  return pwd
}

/**
 * 组织架构主数据：公司 / 部门 / 用户 / 角色 的唯一数据源。
 * 资产模块的公司、部门口径一律取这里，避免各处硬编码重复维护。
 */
export const useOrgStore = defineStore('org', () => {
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(ORG_SEEDS[key])) : [])

  const companies = ref(seedOf('companies'))
  const departments = ref(seedOf('departments'))
  const users = ref(seedOf('users'))
  const roles = ref(seedOf('roles'))
  const loaded = ref(false)

  // 种子由 services/mock/seed/index.js 统一注册，这里不再重复登记

  async function loadAll() {
    const [c, d, u, r] = await Promise.all([
      dataService.list(COLLECTION.orgCompanies),
      dataService.list(COLLECTION.orgDepartments),
      dataService.list(COLLECTION.orgUsers),
      dataService.list(COLLECTION.orgRoles)
    ])
    companies.value = c
    departments.value = d
    users.value = u
    roles.value = r
    loaded.value = true
  }

  // ---------------- 派生数据 ----------------
  const companyMap = computed(() => new Map(companies.value.map(c => [c.id, c])))
  const deptMap = computed(() => new Map(departments.value.map(d => [d.id, d])))
  const roleMap = computed(() => new Map(roles.value.map(r => [r.id, r])))

  function companyName(id) {
    return companyMap.value.get(id)?.name || ''
  }

  function deptName(id) {
    const dept = deptMap.value.get(id)
    if (!dept) return ''
    return dept.parentId ? `${companyName(dept.companyId)} / ${dept.name}` : dept.name
  }

  function roleNames(ids = []) {
    return ids.map(id => roleMap.value.get(id)?.name).filter(Boolean).join('、')
  }

  /** 公司层级树（集团 → 子公司） */
  const companyTree = computed(() => {
    const build = parentId => companies.value
      .filter(c => (c.parentId || null) === parentId)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map(c => ({ id: c.id, name: c.name, children: build(c.id) }))
    return build(null)
  })

  /** 组织树：公司 → 部门 → 子部门 */
  const deptTree = computed(() => {
    const buildDepts = (companyId, parentId) => departments.value
      .filter(d => d.companyId === companyId && (d.parentId || null) === parentId)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map(d => {
        const children = buildDepts(companyId, d.id)
        return { id: d.id, name: d.name, type: 'dept', children: children.length ? children : undefined }
      })
    return companies.value
      .filter(c => (c.parentId || null) === null)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map(c => {
        const subs = companies.value.filter(x => x.parentId === c.id).sort((a, b) => (a.sort || 0) - (b.sort || 0))
        const nodes = buildDepts(c.id, null)
        subs.forEach(s => nodes.push({
          id: s.id,
          name: s.name,
          type: 'company',
          children: buildDepts(s.id, null).length ? buildDepts(s.id, null) : undefined
        }))
        return { id: c.id, name: c.name, type: 'company', children: nodes.length ? nodes : undefined }
      })
  })

  /** 供业务模块下拉使用：仅启用状态 */
  const companyOptions = computed(() => companies.value.filter(c => c.status === STATUS_ENABLED).map(c => c.name))

  const departmentOptions = computed(() => departments.value
    .filter(d => d.status === STATUS_ENABLED)
    .map(d => ({ id: d.id, name: d.name, companyId: d.companyId, companyName: companyName(d.companyId) })))

  const roleOptions = computed(() => roles.value.filter(r => r.status === STATUS_ENABLED).map(r => ({ id: r.id, name: r.name })))

  /** 部门在职人数：由用户表统计，部门表不再冗余人员字段 */
  const deptMemberCount = computed(() => {
    const map = new Map()
    users.value.forEach(u => {
      if (!u.deptId) return
      map.set(u.deptId, (map.get(u.deptId) || 0) + 1)
    })
    return map
  })

  const roleUserCount = computed(() => {
    const map = new Map()
    users.value.forEach(u => {
      (u.roleIds || []).forEach(id => map.set(id, (map.get(id) || 0) + 1))
    })
    return map
  })

  // ---------------- 公司 ----------------
  async function addCompany(data) {
    if (companies.value.some(c => c.name === data.name)) throw new Error('公司名称已存在')
    // 主键由服务端生成，前端不再自行拼装 id
    const row = { ...data, code: data.code || nextCode('GS', companies.value), status: data.status || STATUS_ENABLED }
    const created = await dataService.create(COLLECTION.orgCompanies, row)
    companies.value.push(created || row)
    return created || row
  }

  async function updateCompany(id, data) {
    const idx = companies.value.findIndex(c => c.id === id || c.code === id || c._id === id)
    if (idx === -1) return null
    const next = { ...companies.value[idx], ...data }
    companies.value[idx] = next
    const saved = await dataService.update(COLLECTION.orgCompanies, id, next)
    if (saved) companies.value[idx] = saved
    return companies.value[idx]
  }

  async function removeCompany(id) {
    const target = companies.value.find(c => c.id === id)
    if (!target) return false
    if (companies.value.some(c => c.parentId === id)) throw new Error('该公司下仍有子公司，不能删除')
    if (departments.value.some(d => d.companyId === id)) throw new Error('该公司下仍有部门，不能删除')
    if (users.value.some(u => u.companyId === id)) throw new Error('该公司下仍有用户，不能删除')
    await dataService.remove(COLLECTION.orgCompanies, id)
    companies.value = companies.value.filter(c => c.id !== id)
    return true
  }

  // ---------------- 部门 ----------------
  async function addDept(data) {
    if (data.parentId === data.companyId) throw new Error('上级部门不能是所属公司本身')
    const row = {
      ...data,
      code: data.code || nextCode('BM', departments.value),
      status: data.status || STATUS_ENABLED
    }
    const created = await dataService.create(COLLECTION.orgDepartments, row)
    departments.value.push(created || row)
    return created || row
  }

  async function updateDept(id, data) {
    const idx = departments.value.findIndex(d => d.id === id || d.code === id || d._id === id)
    if (idx === -1) return null
    const next = { ...departments.value[idx], ...data }
    departments.value[idx] = next
    const saved = await dataService.update(COLLECTION.orgDepartments, id, next)
    if (saved) departments.value[idx] = saved
    return departments.value[idx]
  }

  async function removeDept(id) {
    const target = departments.value.find(d => d.id === id)
    if (!target) return false
    if (departments.value.some(d => d.parentId === id)) throw new Error('该部门下仍有子部门，不能删除')
    if (users.value.some(u => u.deptId === id)) throw new Error('该部门下仍有人员，请先调整人员归属')
    await dataService.remove(COLLECTION.orgDepartments, id)
    departments.value = departments.value.filter(d => d.id !== id)
    return true
  }

  /** 批量设置部门人员：进部门的用户写 deptId，移出的置空 */
  async function setDeptMembers(deptId, userIds) {
    const dept = departments.value.find(d => d.id === deptId)
    if (!dept) throw new Error('未找到部门')
    const next = new Set(userIds)
    const touched = []
    for (const u of users.value) {
      const shouldBelong = next.has(u.id)
      const belongs = u.deptId === deptId
      if (shouldBelong && !belongs) {
        u.deptId = deptId
        u.companyId = dept.companyId
        touched.push(u)
      } else if (!shouldBelong && belongs) {
        u.deptId = ''
        touched.push(u)
      }
    }
    for (const u of touched) {
      await dataService.update(COLLECTION.orgUsers, u.id, u)
    }
    return touched.length
  }

  // ---------------- 用户 ----------------
  async function addUser(data) {
    if (users.value.some(u => u.username === data.username)) throw new Error('用户名已存在')
    const row = {
      ...data,
      roleIds: data.roleIds || [],
      status: data.status || STATUS_ENABLED,
      createdAt: new Date().toISOString(),
      lastLoginAt: ''
    }
    const created = await dataService.create(COLLECTION.orgUsers, row)
    users.value.unshift(created || row)
    return created || row
  }

  async function updateUser(id, data) {
    const idx = users.value.findIndex(u => u.id === id || u.username === id || u._id === id)
    if (idx === -1) return null
    const next = { ...users.value[idx], ...data }
    users.value[idx] = next
    const saved = await dataService.update(COLLECTION.orgUsers, id, next)
    if (saved) users.value[idx] = saved
    return users.value[idx]
  }

  async function removeUser(id) {
    await dataService.remove(COLLECTION.orgUsers, id)
    users.value = users.value.filter(u => !(u.id === id || u.username === id))
    return true
  }

  async function resetPassword(id) {
    const idx = users.value.findIndex(u => u.id === id)
    if (idx === -1) throw new Error('未找到用户')
    const pwd = randomPassword()
    const next = { ...users.value[idx], password: pwd, passwordResetAt: nowText() }
    users.value[idx] = next
    await dataService.update(COLLECTION.orgUsers, id, next)
    return pwd
  }

  // ---------------- 角色 ----------------
  async function addRole(data) {
    if (roles.value.some(r => r.code === data.code)) throw new Error('角色编码已存在')
    if (roles.value.some(r => r.name === data.name)) throw new Error('角色名称已存在')
    const row = { ...data, permissions: data.permissions || [], status: data.status || STATUS_ENABLED }
    const created = await dataService.create(COLLECTION.orgRoles, row)
    roles.value.push(created || row)
    return created || row
  }

  async function updateRole(id, data) {
    const idx = roles.value.findIndex(r => r.id === id || r.code === id || r._id === id)
    if (idx === -1) return null
    const next = { ...roles.value[idx], ...data }
    roles.value[idx] = next
    const saved = await dataService.update(COLLECTION.orgRoles, id, next)
    if (saved) roles.value[idx] = saved
    return roles.value[idx]
  }

  async function removeRole(id) {
    const count = roleUserCount.value.get(id) || 0
    if (count > 0) throw new Error(`该角色已关联 ${count} 名用户，不能删除`)
    await dataService.remove(COLLECTION.orgRoles, id)
    roles.value = roles.value.filter(r => r.id !== id)
    return true
  }

  async function setRolePermissions(id, permissions) {
    return updateRole(id, { permissions })
  }

  return {
    companies,
    departments,
    users,
    roles,
    loaded,
    loadAll,
    companyTree,
    deptTree,
    companyOptions,
    departmentOptions,
    roleOptions,
    deptMemberCount,
    roleUserCount,
    companyName,
    deptName,
    roleNames,
    addCompany,
    updateCompany,
    removeCompany,
    addDept,
    updateDept,
    removeDept,
    setDeptMembers,
    addUser,
    updateUser,
    removeUser,
    resetPassword,
    addRole,
    updateRole,
    removeRole,
    setRolePermissions
  }
})
