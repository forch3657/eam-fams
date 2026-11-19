/**
 * 手机端卡片字段配置真源。
 *
 * 桌面表格列保持原样；这里只决定手机上每张卡片显示哪些字段（4~6 个），
 * 其余字段由 MobileDetailDrawer 承载，避免 13 列全量堆叠成一屏一张的长卡片。
 * 键为路由 path；页面可用自己的配置覆盖（例如保留既有详情抽屉入口的页面）。
 */

export const field = (prop, label, extra = {}) => ({ prop, label, ...extra })

export const moneyField = (prop, label) => ({
  prop,
  label,
  type: 'num',
  formatter: (_row, value) => (value === null || value === undefined || value === '' ? '—' : `¥${Number(value).toLocaleString()}`)
})

export const statusField = (prop, label, tagType = 'info') => ({
  prop,
  label,
  type: 'tag',
  tagType
})

const STATUS_TAG = {
  使用中: 'success', 已启用: 'success', 正常: 'success', 通过: 'success', 成功: 'success',
  空闲: 'info', 已停用: 'info', 草稿: 'info', 待提交: 'info',
  已核销: 'warning', 待核销: 'warning', 待入库: 'warning', 在途: 'warning',
  已驳回: 'danger', 失败: 'danger', 停用: 'danger'
}

/** 状态字段的通用标签色：页面可传自定义 tagType 覆盖 */
export const tagTypeOfStatus = value => STATUS_TAG[value] || 'info'

export const MOBILE_COLUMNS = {
  '/fixed-assets': {
    detailTitle: '资产详情',
    primary: field('code', '资产编号'),
    fields: [
      field('name', '资产名称'),
      field('type', '资产类型'),
      field('user', '使用人员'),
      statusField('status', '资产状态', row => tagTypeOfStatus(row.status)),
      moneyField('original', '资产原值')
    ]
  },
  '/low-value-assets': {
    detailTitle: '低值资产详情',
    primary: field('code', '资产编号'),
    fields: [
      field('name', '物品名称'),
      field('type', '物品类型'),
      field('user', '领用人'),
      statusField('status', '状态', row => tagTypeOfStatus(row.status)),
      moneyField('price', '单价')
    ]
  },
  '/system/user': {
    detailTitle: '用户详情',
    primary: field('name', '姓名'),
    fields: [
      field('username', '账号'),
      field('phone', '手机号'),
      field('deptName', '所属部门'),
      field('roles', '角色', { formatter: (_row, value) => (Array.isArray(value) ? value.join('、') : value) }),
      statusField('status', '状态', row => tagTypeOfStatus(row.status))
    ]
  },
  '/system/log': {
    detailTitle: '操作详情',
    primary: field('action', '操作内容'),
    fields: [
      field('time', '时间'),
      field('user', '操作人'),
      field('module', '模块'),
      statusField('result', '结果', row => (row.result === '成功' ? 'success' : 'danger'))
    ]
  }
}

/** 取路由对应的手机列配置；未登记的路由返回 null，由页面自行配置或走兜底 */
export function columnsOf(path) {
  return MOBILE_COLUMNS[path] || null
}

/** 把配置展开为 MobileRecordList 的 columns 数组 */
export function toMobileColumns(config) {
  if (!config) return []
  const primary = config.primary ? { ...config.primary, primary: true } : null
  return primary ? [primary, ...(config.fields || [])] : (config.fields || [])
}

/**
 * 按表格自身的表头识别核心列，供全局注入器使用。
 *
 * 不能按路由写死一套 label：低值资产「入库/领用/退库」页签的数量列分别是
 * 入库数量/领用数量/退库数量，状态列叫「单据状态」；报表页各表头也完全不同。
 * 这里按「标识 → 名称 → 数量 → 状态 → 金额 → 人员/组织」的优先级从实际表头挑选，
 * 保证每张表（含弹窗内表格）都能保留 4~6 条关键信息。
 */
const CORE_GROUPS = [
  { patterns: [/编号$/, /编码$/, /模板键$/, /^键$/], limit: 1 },
  // 主字段不能只认「XX名称」：用户管理是「姓名/用户名」，消息是「标题」，
  // 字典是「标签」，日志是「操作内容」。少一个主字段卡片就认不出是哪条记录。
  {
    patterns: [/名称$/, /姓名$/, /用户名$/, /标题/, /标签$/, /内容/, /场景$/, /^资产分类$/, /^物品类别$/, /^单据$/],
    limit: 2
  },
  { patterns: [/数量/], limit: 1 },
  { patterns: [/状态$/, /^启用$/, /^结果$/], limit: 1 },
  { patterns: [/金额|原值|净值|总值|单价|占比|人数|次数/], limit: 2 },
  { patterns: [/人员$|人$|部门$|公司$|日期$|时间$|供应商|位置$/], limit: 1 }
]

export function pickCoreLabels(labels, max = 6) {
  const clean = (labels || []).map(l => String(l || '').trim()).filter(Boolean)
  const chosen = []
  const add = label => {
    if (!label || /操作/.test(label) || chosen.includes(label) || chosen.length >= max) return
    chosen.push(label)
  }
  for (const group of CORE_GROUPS) {
    let hit = 0
    for (const label of clean) {
      if (hit >= group.limit) break
      if (group.patterns.some(p => p.test(label))) {
        add(label)
        hit++
      }
    }
  }
  // 极端表头（如只有「序号/说明」）至少留两列，避免卡片空掉
  if (!chosen.length) clean.filter(l => !/操作|序号/.test(l)).slice(0, 2).forEach(add)
  return chosen
}
