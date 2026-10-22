/**
 * 业务枚举：编码 -> 中文文案
 *
 * 约定：
 * - 数据层（mock / 后端）一律存储、传输**编码**（如 'IDLE'），不存中文展示词。
 * - 视图展示统一经 labelOf()/optionsOf() 取文案，禁止在视图里硬编码中文状态判断。
 * - 新增枚举请同时登记到 ENUMS，契约校验才能生效。
 */

/** 资产状态（收敛原 assetStatusOptions 与 assetStatusPool 两套值域） */
export const ASSET_STATUS = {
  IDLE: '空闲',
  IN_USE: '使用中',
  DISPATCHING: '派发中',
  BORROWED: '借出中',
  REPAIRING: '维修中',
  DISPOSING: '处置中'
}

/**
 * 统一资产分类字典
 * 收敛原「资产 type（电子设备…）」与「单据 category（设备/办公用品/车辆/材料）」两套口径。
 */
export const ASSET_CATEGORY = {
  ELECTRONIC: '电子设备',
  MACHINE: '机械设备',
  VEHICLE: '运输设备',
  FURNITURE: '办公家具',
  BUILDING: '房屋建筑物',
  SUPPLIES: '办公用品',
  MATERIAL: '材料',
  OTHER: '其他设备'
}

/** 购置方式 */
export const PURCHASE_MODE = {
  PURCHASE: '购买',
  LEASE: '租赁',
  SELF_BUILD: '自建',
  DONATION: '受赠'
}

/** 通用启停状态 */
export const ENABLE_STATUS = {
  ENABLED: '启用',
  DISABLED: '停用'
}

/**
 * 通用启停的**存储编码**（与上面枚举的 key 一致）
 * 注意：ENABLE_STATUS.ENABLED 取到的是文案'启用'，做状态判断/默认值时必须用这里的编码常量，
 * 只有展示时才用 labelOf('ENABLE_STATUS', code)。
 */
export const STATUS_ENABLED = 'ENABLED'
export const STATUS_DISABLED = 'DISABLED'

/** 入库单状态 */
export const INBOUND_STATUS = {
  PENDING: '待验收',
  ACCEPTED: '已验收',
  STORED: '已入库'
}

/** 派发/退库单状态 */
export const DISPATCH_STATUS = {
  DISPATCHED: '已派发',
  RETURNED: '已退库'
}

/** 借出单状态 */
export const BORROW_STATUS = {
  BORROWED: '借出中',
  OVERDUE: '逾期',
  RETURNED: '已归还'
}

/** 处置单状态 */
export const DISPOSE_STATUS = {
  PROCESSING: '处置中',
  DONE: '已完成'
}

/** 处置方式 */
export const DISPOSE_TYPE = {
  SCRAP: '报废',
  SALE: '变卖',
  TRANSFER: '调拨',
  OTHER: '其他'
}

/** 资产变更类型 */
export const CHANGE_TYPE = {
  TRANSFER: '调拨',
  REPAIR: '维修',
  OTHER: '其他'
}

/** 单据流转状态（收敛原 docStatusOptions / docStatusPool 同值不同序） */
export const DOC_STATUS = {
  DRAFT: '待提交',
  PROCESSING: '进行中',
  REJECTED: '已驳回',
  REVOKED: '已撤销',
  DONE: '已完结'
}

/** 低值物品状态 */
export const LOW_VALUE_ITEM_STATUS = {
  NORMAL: '正常',
  LOW_STOCK: '低库存',
  DISABLED: '停用'
}

/** 盘点结果 */
export const INVENTORY_RESULT = {
  UNCHECKED: '未盘点',
  MATCHED: '相符',
  SURPLUS: '盘盈',
  LOSS: '盘亏'
}

/** 盘点明细状态 */
export const INVENTORY_ITEM_STATUS = {
  UNCHECKED: '未盘',
  CHECKED: '已盘',
  LOSS: '盘亏',
  ABNORMAL: '异常'
}

/** 盘点人状态 */
export const INVENTORY_COUNTER_STATUS = {
  COUNTING: '盘点中',
  DONE: '已完成'
}

/** 折旧方法（收敛「年限平均法」与「直线法」语义重复） */
export const DEPRECIATION_METHOD = {
  STRAIGHT_LINE: '年限平均法',
  DOUBLE_DECLINE: '双倍余额递减法',
  SUM_YEARS: '年数总和法',
  WORKLOAD: '工作量法'
}

/** 计提频率 */
export const CALC_TIME = {
  MONTHLY: '按月计提',
  QUARTERLY: '按季计提',
  YEARLY: '按年计提'
}

/** 审批适用业务 */
export const BUSINESS_TYPE = {
  INBOUND: '入库',
  REQUISITION: '领用',
  RETURN: '退库',
  DISPATCH: '派发',
  BORROW: '借出',
  DISPOSE: '处置',
  INVENTORY: '盘点',
  CHANGE: '变更'
}

/** 审批模式 */
export const APPROVE_MODE = {
  ANY: '或签',
  SEQUENCE: '依次',
  ALL: '会签'
}

/** 终端状态 */
export const DEVICE_STATUS = {
  ONLINE: '在线',
  OFFLINE: '离线',
  DISABLED: '停用'
}

/** 终端类型 */
export const DEVICE_TYPE = {
  POS: '收款终端',
  SCAN_BOX: '扫码盒子',
  KIOSK: '自助缴费机',
  POS_MACHINE: 'POS机'
}

/** 终端违规类型 */
export const MISUSE_TYPE = {
  PRIVATE_COLLECTION: '私自收款',
  MISAPPROPRIATION: '挪用资金',
  ILLEGAL_REDUCTION: '违规减免',
  ACCOUNT_FRAUD: '冒用账户',
  DEVICE_LEND: '设备外借',
  OTHER: '其他'
}

/** 系统参数类型 */
export const PARAM_TYPE = {
  SYSTEM: '系统内置',
  CUSTOM: '自定义'
}

/** 角色数据范围 */
export const DATA_SCOPE = {
  ALL: '全部数据',
  COMPANY: '本公司及以下',
  DEPT: '本部门及以下',
  DEPT_ONLY: '本部门',
  SELF: '仅本人'
}

/** 角色所属组织 */
export const ORG_SCOPE = {
  GROUP: '全集团',
  COMPANY: '本公司',
  DEPT: '本部门'
}

/** 枚举注册表：契约校验与 labelOf 依赖它 */
export const ENUMS = {
  ASSET_STATUS,
  ASSET_CATEGORY,
  PURCHASE_MODE,
  ENABLE_STATUS,
  INBOUND_STATUS,
  DISPATCH_STATUS,
  BORROW_STATUS,
  DISPOSE_STATUS,
  DISPOSE_TYPE,
  CHANGE_TYPE,
  DOC_STATUS,
  LOW_VALUE_ITEM_STATUS,
  INVENTORY_RESULT,
  INVENTORY_ITEM_STATUS,
  INVENTORY_COUNTER_STATUS,
  DEPRECIATION_METHOD,
  CALC_TIME,
  BUSINESS_TYPE,
  APPROVE_MODE,
  DEVICE_STATUS,
  DEVICE_TYPE,
  MISUSE_TYPE,
  PARAM_TYPE,
  DATA_SCOPE,
  ORG_SCOPE
}

/** 取枚举文案：labelOf('ASSET_STATUS', 'IDLE') -> '空闲'；未知编码原样返回，避免白屏 */
export function labelOf(enumName, code) {
  const dict = ENUMS[enumName]
  if (!dict || code === undefined || code === null || code === '') return ''
  return dict[code] ?? code
}

/** 取枚举下拉选项：[{ value: 'IDLE', label: '空闲' }] */
export function optionsOf(enumName) {
  const dict = ENUMS[enumName]
  if (!dict) return []
  return Object.entries(dict).map(([value, label]) => ({ value, label }))
}

/** 取枚举编码列表 */
export function codesOf(enumName) {
  const dict = ENUMS[enumName]
  return dict ? Object.keys(dict) : []
}

export default ENUMS
