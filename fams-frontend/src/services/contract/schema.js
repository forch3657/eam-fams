/**
 * API 契约层：mock 与后端 HTTP 的**单一真源**
 *
 * 每个集合声明：字段（类型/必填/枚举/外键引用）、查询能力（关键字/过滤/排序/分页）、
 * 业务规则（唯一性/引用完整性/删除保护/库存联动）。
 * mock 引擎与 http 适配层都从这里派生行为，二者行为一致 ⇒ 切后端只需改 .env。
 *
 * 字段类型：string / number / boolean / date(ISO 8601) / enum / array / object
 */
import { ENUM_DICT_META } from '../../constants/enums'

/** 字段构造器，减少样板代码 */
const f = {
  str: (o = {}) => ({ type: 'string', ...o }),
  num: (o = {}) => ({ type: 'number', ...o }),
  bool: (o = {}) => ({ type: 'boolean', ...o }),
  date: (o = {}) => ({ type: 'date', ...o }),
  enum: (name, o = {}) => ({ type: 'enum', enum: name, ...o }),
  arr: (o = {}) => ({ type: 'array', ...o }),
  obj: (o = {}) => ({ type: 'object', ...o }),
  /** 外键：值为关联集合的主键 id */
  ref: (collection, o = {}) => ({ type: 'string', ref: collection, ...o })
}

/** 单据集合的通用字段：单据编号 + 资产引用 + 审计 */
function docFields(extra = {}) {
  return {
    code: f.str({ required: true, unique: true }),
    assetId: f.ref('fixed-assets', { required: true }),
    ...extra
  }
}

// ---------------------------------------------------------------- 固定资产单据集合清单
// 必须在下方 ASSETS 契约之前定义：ASSETS 的删除保护规则按此清单展开
const DOC_LIST_KEYS = ['inbound', 'alloc', 'back', 'borrow', 'transfer', 'repair', 'change', 'dispose']
const DOC_LIST_LABELS = {
  inbound: '入库单列表', alloc: '派发单列表', back: '退库单列表', borrow: '借出单列表',
  transfer: '调拨单列表', repair: '维修单列表', change: '资产变更单列表', dispose: '处置单列表'
}

// ---------------------------------------------------------------- 固定资产

const ASSETS = {
  key: 'fixed-assets',
  label: '固定资产台账',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    category: f.enum('ASSET_CATEGORY', { required: true }),
    brand: f.str(),
    model: f.str(),
    companyId: f.ref('org-companies'),
    deptId: f.ref('org-departments'),
    userId: f.ref('org-users'),
    location: f.str(),
    purchaseDate: f.date(),
    inboundDate: f.date(),
    amount: f.num(),
    original: f.num(),
    net: f.num(),
    status: f.enum('ASSET_STATUS', { required: true }),
    depreciate: f.bool(),
    purchaseMode: f.enum('PURCHASE_MODE'),
    leaseMonths: f.num()
  },
  query: {
    keyword: ['name', 'code', 'brand', 'model'],
    filters: ['companyId', 'deptId', 'userId', 'status', 'category'],
    sort: ['updateTime', 'code'],
    page: true
  },
  rules: {
    unique: ['code'],
    refs: [
      { field: 'companyId', collection: 'org-companies' },
      { field: 'deptId', collection: 'org-departments' },
      { field: 'userId', collection: 'org-users' }
    ],
    // 资产被业务单据引用时禁止删除（覆盖全部 8 类单据，原先只保护 4 类，
    // 导致有退库/调拨/维修/变更单据的资产仍可被删除）
    protect: DOC_LIST_KEYS.map(biz => ({
      collection: `fixed-asset-doc-lists-${biz}`,
      field: 'assetId',
      message: `该资产存在${DOC_LIST_LABELS[biz] || biz}单据，不能删除`
    }))
  }
}

const INVENTORY_PLANS = {
  key: 'fixed-asset-inventory-plans',
  label: '盘点计划',
  idField: 'id',
  audit: true,
  fields: {
    planNo: f.str({ required: true, unique: true }),
    planName: f.str({ required: true }),
    scope: f.str(),
    counter: f.str(),
    planDate: f.date(),
    status: f.enum('DOC_STATUS', { required: true }),
    items: f.arr()
  },
  query: { keyword: ['planNo', 'planName'], filters: ['status'], sort: ['planDate'], page: true },
  rules: { unique: ['planNo'] }
}

const INVENTORY_DOCS = {
  key: 'fixed-asset-inventory-docs',
  label: '盘点单据',
  idField: 'id',
  audit: true,
  fields: {
    docNo: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    companyId: f.ref('org-companies'),
    applicant: f.str(),
    creatorId: f.ref('org-users'),
    scope: f.str(),
    assetTypes: f.arr(),
    createTime: f.date(),
    finishTime: f.date(),
    remark: f.str(),
    status: f.enum('DOC_STATUS', { required: true }),
    items: f.arr(),
    counters: f.arr()
  },
  query: { keyword: ['docNo', 'name', 'applicant'], filters: ['status', 'companyId'], sort: ['createTime'], page: true },
  rules: { unique: ['docNo'], refs: [{ field: 'companyId', collection: 'org-companies' }] }
}

const DEPRECIATION_SCHEMES = {
  key: 'fixed-asset-depreciation-schemes',
  label: '折旧方案',
  idField: 'id',
  audit: true,
  fields: {
    schemeNo: f.str({ required: true, unique: true }),
    schemeName: f.str({ required: true }),
    method: f.enum('DEPRECIATION_METHOD', { required: true }),
    years: f.num(),
    residualRate: f.num(),
    monthlyRate: f.num(),
    applicableCategory: f.str(),
    enabled: f.bool()
  },
  query: { keyword: ['schemeNo', 'schemeName'], filters: ['method', 'enabled'], sort: ['schemeNo'], page: true },
  rules: { unique: ['schemeNo'] }
}

const DEPRECIATION_REPORTS = {
  key: 'fixed-asset-depreciation-reports',
  label: '折旧报表',
  idField: 'id',
  audit: true,
  fields: {
    period: f.str({ required: true, unique: true }),
    openingValue: f.num(),
    periodDepreciation: f.num(),
    accumulated: f.num(),
    closingNet: f.num(),
    assetCount: f.num(),
    operator: f.str(),
    runDate: f.date()
  },
  query: { keyword: ['period'], filters: ['period'], sort: ['period'], page: true },
  rules: { unique: ['period'] }
}

const REPORT_DEPRECIATION_DETAILS = {
  key: 'fixed-asset-report-depreciation-details',
  label: '折旧明细',
  idField: 'id',
  audit: true,
  fields: {
    assetId: f.ref('fixed-assets'),
    name: f.str(),
    originalValue: f.num(),
    depreciationMethod: f.enum('DEPRECIATION_METHOD'),
    usefulLife: f.num(),
    accumulatedDepreciation: f.num(),
    netValue: f.num(),
    depreciationRate: f.num(),
    purchaseDate: f.date()
  },
  query: { keyword: ['name'], filters: ['depreciationMethod'], sort: ['purchaseDate'], page: true },
  rules: {}
}

const REPORT_DEPRECIATION_PLAN_DETAILS = {
  key: 'fixed-asset-report-depreciation-plan-details',
  label: '折旧计划明细',
  idField: 'id',
  audit: true,
  fields: {
    planName: f.str(),
    assetId: f.ref('fixed-assets'),
    assetName: f.str(),
    assetType: f.enum('ASSET_CATEGORY'),
    companyId: f.ref('org-companies'),
    original: f.num(),
    residualRate: f.num(),
    totalLife: f.num(),
    usedLife: f.num(),
    depDate: f.date(),
    finished: f.bool()
  },
  query: { keyword: ['planName', 'assetName'], filters: ['assetType', 'companyId', 'finished'], sort: ['depDate'], page: true },
  rules: {}
}

// ---------------------------------------------------------------- 固定资产：基础设置

const SETTINGS_LOCATIONS = {
  key: 'fixed-asset-settings-locations',
  label: '存放位置',
  idField: 'code',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    parentName: f.str(),
    manager: f.str(),
    assetCount: f.num()
  },
  query: { keyword: ['name', 'code'], filters: ['parentName'], sort: ['code'], page: true },
  rules: {
    unique: ['code', 'name'],
    // 被资产引用时禁止删除
    protect: [{ collection: 'fixed-assets', field: 'location', valueFrom: 'name', message: '该位置下仍有资产，不能删除' }]
  }
}

const SETTINGS_LOCATION_OPTIONS = {
  key: 'fixed-asset-settings-location-options',
  label: '位置候选项',
  idField: 'code',
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true })
  },
  query: { keyword: ['name'], filters: [], sort: ['code'], page: false },
  rules: { unique: ['code'] }
}

const SETTINGS_CATEGORIES = {
  key: 'fixed-asset-settings-categories',
  label: '资产分类',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    parentCode: f.str(),
    parentName: f.str(),
    depreciationMethod: f.enum('DEPRECIATION_METHOD'),
    usefulLife: f.num(),
    assetCount: f.num(),
    status: f.enum('ENABLE_STATUS', { required: true }),
    children: f.arr()
  },
  query: { keyword: ['name', 'code'], filters: ['status', 'parentCode'], sort: ['code'], page: true },
  rules: {
    unique: ['code', 'name'],
    // 有子分类时禁止删除
    protectSelf: { field: 'parentCode', idField: 'code', message: '该分类下仍有子分类，不能删除' }
  }
}

const SETTINGS_DEPRECIATION_RULES = {
  key: 'fixed-asset-settings-depreciation-rules',
  label: '折旧规则',
  idField: 'name',
  audit: true,
  fields: {
    name: f.str({ required: true, unique: true }),
    method: f.enum('DEPRECIATION_METHOD', { required: true }),
    usefulLife: f.num(),
    residualRate: f.num(),
    description: f.str()
  },
  query: { keyword: ['name'], filters: ['method'], sort: ['name'], page: true },
  rules: { unique: ['name'] }
}

const SETTINGS_DEPRECIATION_PLANS = {
  key: 'fixed-asset-settings-depreciation-plans',
  label: '折旧方案（设置）',
  idField: 'id',
  audit: true,
  fields: {
    companyId: f.ref('org-companies'),
    name: f.str({ required: true, unique: true }),
    method: f.enum('DEPRECIATION_METHOD'),
    assetTypes: f.arr(),
    residualRate: f.num(),
    calcTime: f.enum('CALC_TIME'),
    monthlyDay: f.num(),
    purchaseMode: f.enum('PURCHASE_MODE'),
    remark: f.str()
  },
  query: { keyword: ['name'], filters: ['companyId', 'calcTime', 'method'], sort: ['name'], page: true },
  rules: { unique: ['name'], refs: [{ field: 'companyId', collection: 'org-companies' }] }
}

// ---------------------------------------------------------------- 低值资产

const LOW_VALUE_ITEMS = {
  key: 'low-value-items',
  label: '低值资产台账',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    // 类别取字典编码（LOW_VALUE_CATEGORY，见 constants/enums.js）
    category: f.enum('LOW_VALUE_CATEGORY', { required: true }),
    name: f.str({ required: true }),
    spec: f.str(),
    unit: f.str(),
    price: f.num(),
    stock: f.num(),
    // reserved：审批中领用单占用的数量（在库数不变，但不可再被领用）
    reserved: f.num(),
    safetyStock: f.num(),
    location: f.str(),
    status: f.enum('LOW_VALUE_ITEM_STATUS', { required: true })
  },
  query: { keyword: ['name', 'code', 'spec'], filters: ['category', 'status', 'location'], sort: ['updateTime', 'code'], page: true },
  rules: {
    unique: ['code'],
    // 仍有库存或已产生单据时禁止删除
    protect: [
      { collection: 'low-value-inbound', field: 'itemId', message: '该物品已产生入库单据，不能删除' },
      { collection: 'low-value-requisition', field: 'itemId', message: '该物品已产生领用单据，不能删除' },
      { collection: 'low-value-return', field: 'itemId', message: '该物品已产生退库单据，不能删除' }
    ],
    stockGuard: [
      { field: 'stock', message: '该物品仍有库存，不能删除' },
      { field: 'reserved', message: '该物品有审批中的单据占用，不能删除' }
    ]
  }
}

/**
 * 低值单据（入库 / 领用 / 退库）通用契约
 *
 * 库存语义（与审批联动的核心）：
 * - 单据 status 决定库存何时生效：
 *   DRAFT（草稿）不动物品 → PROCESSING（审批中）按需预占 → DONE（已完结）才真正结算库存；
 *   REJECTED / REVOKED 释放预占。
 * - 领用单（出库）在审批中会占用"可用量"（stock - reserved），避免并发超领；
 * - 退库单（入库）审批中不动库存，只在已完结时回补。
 */
function lowValueDoc(key, label, effect, extra = {}, stockExtra = {}) {
  return {
    key,
    label,
    idField: 'id',
    audit: true,
    fields: {
      docNo: f.str({ required: true, unique: true }),
      itemId: f.ref('low-value-items', { required: true }),
      // 类别取字典编码（办理当时的快照文案另存 categoryName）
      category: f.enum('LOW_VALUE_CATEGORY'),
      // 单据快照：记录办理当时的物品信息，后续改价改名不影响历史单据
      itemName: f.str(),
      categoryName: f.str(),
      spec: f.str(),
      unit: f.str(),
      quantity: f.num({ required: true }),
      price: f.num(),
      amount: f.num(),
      deptId: f.ref('org-departments'),
      operator: f.str(),
      remark: f.str(),
      // 审批相关：状态机由「系统管理 → 流程配置」驱动
      status: f.enum('DOC_STATUS', { required: true }),
      creatorId: f.ref('org-users'),
      submitTime: f.date(),
      settleTime: f.date(),
      ...extra
    },
    query: { keyword: ['docNo'], filters: ['itemId', 'category', 'deptId', 'status'], sort: ['createTime'], page: true },
    rules: {
      unique: ['docNo'],
      refs: [
        { field: 'itemId', collection: 'low-value-items' },
        { field: 'deptId', collection: 'org-departments' },
        { field: 'creatorId', collection: 'org-users' }
      ],
      // 库存联动：入库/退库加库存，领用扣库存；settleOn 指定"结算"状态
      stock: {
        effect,
        target: 'low-value-items',
        itemField: 'itemId',
        qtyField: 'quantity',
        stockField: 'stock',
        settleOn: 'DONE',
        ...stockExtra
      }
    }
  }
}

// 入库单：货到即入，直接以"已完结"状态创建（无需审批）
const LOW_VALUE_INBOUND = lowValueDoc('low-value-inbound', '低值资产入库单', 'in', {
  supplier: f.str(),
  inboundDate: f.date()
})

// 领用单：出库方向，审批中占用可用量（reserved）
const LOW_VALUE_REQUISITION = lowValueDoc('low-value-requisition', '低值资产领用单', 'out', {
  receiver: f.str(),
  requisitionDate: f.date(),
  purpose: f.str()
}, { reservedField: 'reserved', reserveOn: 'PROCESSING', releaseOn: ['REJECTED', 'REVOKED'] })

// 退库单：入库方向，审批中不动物品，通过后回补库存
const LOW_VALUE_RETURN = lowValueDoc('low-value-return', '低值资产退库单', 'in', {
  returner: f.str(),
  returnDate: f.date(),
  reason: f.str()
})

const LOW_VALUE_LOCATIONS = {
  key: 'low-value-settings-locations',
  label: '低值资产存放位置',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    parentCode: f.str(),
    // 上级位置名称（表单带该字段，整表提交）
    parentName: f.str(),
    manager: f.str(),
    itemCount: f.num(),
    status: f.enum('ENABLE_STATUS', { required: true })
  },
  query: { keyword: ['name', 'code'], filters: ['status', 'parentCode'], sort: ['code'], page: true },
  rules: {
    unique: ['code'],
    // 被物品引用时禁止删除（低值物品按位置名引用，非 id）
    protect: [{ collection: 'low-value-items', field: 'location', valueFrom: 'name', message: '该位置下仍有物品，不能删除' }]
  }
}

// ---------------------------------------------------------------- 组织架构

const ORG_COMPANIES = {
  key: 'org-companies',
  label: '公司',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true, unique: true }),
    shortName: f.str(),
    parentId: f.ref('org-companies'),
    type: f.str(),
    creditCode: f.str(),
    legalPerson: f.str(),
    contact: f.str(),
    phone: f.str(),
    address: f.str(),
    status: f.enum('ENABLE_STATUS', { required: true }),
    sort: f.num()
  },
  query: { keyword: ['name', 'shortName', 'code'], filters: ['status', 'parentId'], sort: ['sort'], page: true },
  rules: {
    unique: ['code', 'name'],
    refs: [{ field: 'parentId', collection: 'org-companies' }],
    // 删除保护：子公司 / 部门 / 用户
    protect: [
      { collection: 'org-companies', field: 'parentId', message: '该公司下仍有子公司，不能删除' },
      { collection: 'org-departments', field: 'companyId', message: '该公司下仍有部门，不能删除' },
      { collection: 'org-users', field: 'companyId', message: '该公司下仍有用户，不能删除' }
    ]
  }
}

const ORG_DEPARTMENTS = {
  key: 'org-departments',
  label: '部门',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    parentId: f.ref('org-departments'),
    companyId: f.ref('org-companies', { required: true }),
    leader: f.str(),
    headcount: f.num(),
    phone: f.str(),
    status: f.enum('ENABLE_STATUS', { required: true }),
    sort: f.num()
  },
  query: { keyword: ['name', 'code'], filters: ['companyId', 'parentId', 'status'], sort: ['sort'], page: true },
  rules: {
    unique: ['code'],
    refs: [
      { field: 'companyId', collection: 'org-companies' },
      { field: 'parentId', collection: 'org-departments' }
    ],
    protect: [
      { collection: 'org-departments', field: 'parentId', message: '该部门下仍有子部门，不能删除' },
      { collection: 'org-users', field: 'deptId', message: '该部门下仍有人员，请先调整人员归属' }
    ]
  }
}

const ORG_USERS = {
  key: 'org-users',
  label: '用户',
  idField: 'id',
  audit: true,
  fields: {
    username: f.str({ required: true, unique: true }),
    // 登录口令（前端演示用明文存储；接入后端后由后端校验，前端不再持有）
    password: f.str(),
    // 管理员重置密码的时间（「重置密码」会写入）
    passwordResetAt: f.date(),
    name: f.str({ required: true }),
    companyId: f.ref('org-companies', { required: true }),
    deptId: f.ref('org-departments'),
    position: f.str(),
    roleIds: f.arr(),
    phone: f.str(),
    email: f.str(),
    status: f.enum('ENABLE_STATUS', { required: true }),
    createdAt: f.date(),
    lastLoginAt: f.date()
  },
  query: { keyword: ['username', 'name', 'phone'], filters: ['companyId', 'deptId', 'status'], sort: ['createdAt'], page: true },
  rules: {
    unique: ['username'],
    refs: [
      { field: 'companyId', collection: 'org-companies' },
      { field: 'deptId', collection: 'org-departments' }
    ],
    // 被业务数据引用的用户禁止删除：原先无任何保护，
    // 删除后资产/单据/审批记录/终端会留下悬空引用
    protect: [
      { collection: 'fixed-assets', field: 'userId', message: '该用户仍是资产使用人，不能删除' },
      { collection: 'fixed-asset-doc-approvals', field: 'approverId', message: '该用户已有审批记录，不能删除' },
      { collection: 'system-terminal-devices', field: 'bindUserId', message: '该用户已绑定盘点终端，不能删除' },
      { collection: 'low-value-inbound', field: 'creatorId', message: '该用户已创建入库单，不能删除' },
      { collection: 'low-value-requisition', field: 'creatorId', message: '该用户已创建领用单，不能删除' },
      { collection: 'low-value-return', field: 'creatorId', message: '该用户已创建退库单，不能删除' },
      ...DOC_LIST_KEYS.map(biz => ({
        collection: `fixed-asset-doc-lists-${biz}`,
        field: 'creatorId',
        message: `该用户已创建${DOC_LIST_LABELS[biz] || biz}单据，不能删除`
      }))
    ]
  }
}

const ORG_ROLES = {
  key: 'org-roles',
  label: '角色',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true, unique: true }),
    orgScope: f.enum('ORG_SCOPE'),
    dataScope: f.enum('DATA_SCOPE'),
    status: f.enum('ENABLE_STATUS', { required: true }),
    sort: f.num(),
    remark: f.str(),
    permissions: f.arr()
  },
  query: { keyword: ['name', 'code'], filters: ['status', 'orgScope'], sort: ['sort'], page: true },
  rules: {
    unique: ['code', 'name'],
    // 有关联用户时禁止删除（roleIds 为数组，按包含判断）
    protectContains: [{ collection: 'org-users', field: 'roleIds', message: '该角色已关联用户，不能删除' }]
  }
}

// ---------------------------------------------------------------- 系统管理

const SYSTEM_DICT_TYPES = {
  key: 'system-dict-types',
  label: '数据字典类型',
  idField: 'code',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    // 字典项数（由「数据字典」页在项增删改后同步）
    count: f.num(),
    status: f.enum('ENABLE_STATUS', { required: true }),
    remark: f.str()
  },
  query: { keyword: ['name', 'code'], filters: ['status'], sort: ['code'], page: true },
  rules: {
    unique: ['code', 'name'],
    // 字典项是动态集合（system-dict-types-{code}-items），静态契约无法枚举，
    // 因此这里只声明"删除字典类型必须级联清理其字典项"，
    // 由「数据字典」页在删除时一并清除（见 SystemDict.vue）
    cascade: [{ pattern: 'system-dict-types-{code}-items', message: '删除字典类型会同时删除其全部字典项' }]
  }
}

const SYSTEM_PARAMS = {
  key: 'system-params',
  label: '系统参数',
  idField: 'id',
  audit: true,
  fields: {
    name: f.str({ required: true }),
    key: f.str({ required: true, unique: true }),
    value: f.str(),
    type: f.enum('PARAM_TYPE'),
    remark: f.str()
  },
  query: { keyword: ['name', 'key'], filters: ['type'], sort: ['key'], page: true },
  rules: { unique: ['key'] }
}

const SYSTEM_FLOWS = {
  key: 'system-workflow-flows',
  label: '工作流程',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    bizType: f.enum('BUSINESS_TYPE', { required: true }),
    initiator: f.str(),
    initiatorRoleId: f.ref('org-roles'),
    enabled: f.bool(),
    steps: f.arr()
  },
  query: { keyword: ['name', 'code'], filters: ['bizType', 'enabled'], sort: ['code'], page: true },
  rules: {
    unique: ['code'],
    refs: [{ field: 'initiatorRoleId', collection: 'org-roles' }],
    // 已产生审批记录的流程不允许删除
    protect: [{ collection: 'fixed-asset-doc-approvals', field: 'flowId', message: '该流程已产生审批记录，不能删除' }]
  }
}

/**
 * 审批记录（审批轨迹）
 * 一条记录 = 单据在某个环节上的一次动作（提交/通过/驳回/撤销）
 */
const DOC_APPROVALS = {
  key: 'fixed-asset-doc-approvals',
  label: '审批记录',
  idField: 'id',
  audit: true,
  fields: {
    docKey: f.str({ required: true }),
    docId: f.str({ required: true }),
    docCode: f.str(),
    bizType: f.enum('BUSINESS_TYPE', { required: true }),
    flowId: f.ref('system-workflow-flows'),
    flowCode: f.str(),
    stepKey: f.str(),
    stepName: f.str(),
    result: f.enum('APPROVE_RESULT', { required: true }),
    comment: f.str(),
    approverId: f.ref('org-users'),
    approverName: f.str(),
    approverRoleName: f.str(),
    time: f.date()
  },
  query: { keyword: ['docCode', 'approverName', 'stepName'], filters: ['docKey', 'bizType', 'result', 'approverId'], sort: ['time'], page: true },
  rules: {
    refs: [
      { field: 'approverId', collection: 'org-users' },
      { field: 'flowId', collection: 'system-workflow-flows' }
    ]
  }
}

const SYSTEM_DEVICES = {
  key: 'system-terminal-devices',
  label: '盘点终端',
  idField: 'code',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    type: f.enum('DEVICE_TYPE', { required: true }),
    location: f.str(),
    bindUserId: f.ref('org-users'),
    status: f.enum('DEVICE_STATUS', { required: true }),
    lastActive: f.date(),
    vendor: f.str(),
    model: f.str(),
    sn: f.str(),
    ip: f.str(),
    installDate: f.date(),
    maintainer: f.str(),
    maintainerPhone: f.str(),
    remark: f.str()
  },
  query: { keyword: ['name', 'code', 'sn', 'ip'], filters: ['status', 'type'], sort: ['code'], page: true },
  rules: {
    unique: ['code'],
    refs: [{ field: 'bindUserId', collection: 'org-users' }],
    protect: [{ collection: 'system-terminal-abnormal', field: 'deviceCode', message: '该终端已有异常记录，不能删除' }]
  }
}

const SYSTEM_DEVICE_ABNORMAL = {
  key: 'system-terminal-abnormal',
  label: '终端异常记录',
  idField: 'recordNo',
  audit: true,
  fields: {
    recordNo: f.str({ required: true, unique: true }),
    deviceCode: f.ref('system-terminal-devices', { required: true }),
    operatorId: f.ref('org-users'),
    type: f.enum('DEVICE_ABNORMAL_TYPE', { required: true }),
    detail: f.str(),
    affectedCount: f.num(),
    handled: f.bool(),
    // 处理结果：终端异常页会写入该字段
    handleResult: f.str(),
    createTime: f.date()
  },
  query: { keyword: ['recordNo', 'detail'], filters: ['type', 'handled'], sort: ['createTime'], page: true },
  rules: {
    unique: ['recordNo'],
    refs: [
      { field: 'deviceCode', collection: 'system-terminal-devices' },
      { field: 'operatorId', collection: 'org-users' }
    ]
  }
}

const NOTIFY_MESSAGES = {
  key: 'notify-messages',
  label: '站内消息',
  idField: 'id',
  audit: true,
  fields: {
    time: f.date(),
    type: f.str(),
    level: f.str(),
    title: f.str({ required: true }),
    content: f.str(),
    target: f.str(),
    channel: f.str(),
    bizType: f.str(),
    bizId: f.str(),
    route: f.str(),
    read: f.bool()
  },
  query: { keyword: ['title', 'content'], filters: ['type', 'level', 'read', 'target'], sort: ['time'], page: true },
  rules: {}
}

const NOTIFY_TEMPLATES = {
  key: 'notify-templates',
  label: '消息模板',
  idField: 'key',
  audit: true,
  fields: {
    key: f.str({ required: true, unique: true }),
    scene: f.str(),
    channel: f.str(),
    title: f.str(),
    content: f.str(),
    enabled: f.bool()
  },
  query: { keyword: ['key', 'scene', 'title'], filters: ['enabled', 'channel'], sort: ['key'], page: true },
  rules: { unique: ['key'] }
}

const OPERATION_LOGS = {
  key: 'operation-logs',
  label: '操作日志',
  idField: 'id',
  audit: true,
  fields: {
    time: f.date(),
    module: f.str(),
    action: f.str(),
    target: f.str(),
    result: f.str(),
    detail: f.str(),
    ip: f.str(),
    operator: f.str(),
    operatorOrg: f.str()
  },
  query: { keyword: ['operator', 'target', 'detail', 'module'], filters: ['module', 'action', 'result'], sort: ['time'], page: true },
  rules: {}
}

// ---------------------------------------------------------------- 契约表

const CONTRACT_LIST = [
  ASSETS,
  INVENTORY_PLANS, INVENTORY_DOCS,
  DEPRECIATION_SCHEMES, DEPRECIATION_REPORTS,
  REPORT_DEPRECIATION_DETAILS, REPORT_DEPRECIATION_PLAN_DETAILS,
  SETTINGS_LOCATIONS, SETTINGS_LOCATION_OPTIONS, SETTINGS_CATEGORIES,
  SETTINGS_DEPRECIATION_RULES, SETTINGS_DEPRECIATION_PLANS,
  LOW_VALUE_ITEMS, LOW_VALUE_INBOUND, LOW_VALUE_REQUISITION, LOW_VALUE_RETURN,
  LOW_VALUE_LOCATIONS,
  ORG_COMPANIES, ORG_DEPARTMENTS, ORG_USERS, ORG_ROLES,
  SYSTEM_DICT_TYPES, SYSTEM_PARAMS, SYSTEM_FLOWS, DOC_APPROVALS,
  SYSTEM_DEVICES, SYSTEM_DEVICE_ABNORMAL,
  NOTIFY_MESSAGES, NOTIFY_TEMPLATES, OPERATION_LOGS
]

/** key -> 契约 */
export const CONTRACTS = CONTRACT_LIST.reduce((acc, c) => {
  acc[c.key] = c
  return acc
}, {})

/**
 * 动态集合的契约模式（如按业务类型拆分的单据列表、按字典类型拆分的字典项）
 * 命中模式的 key 会套用同一个契约模板，避免为每类重复定义。
 */
export const CONTRACT_PATTERNS = [
  {
    test: key => key.startsWith('fixed-asset-doc-lists-'),
    make: key => {
      const biz = key.replace('fixed-asset-doc-lists-', '')
      return {
        key,
        label: DOC_LIST_LABELS[biz] || `单据列表(${biz})`,
        idField: 'id',
        audit: true,
        fields: {
          code: f.str({ required: true, unique: true }),
          name: f.str({ required: true }),
          companyId: f.ref('org-companies'),
          assetId: f.ref('fixed-assets'),
          creatorId: f.ref('org-users'),
          createTime: f.date(),
          finishTime: f.date(),
          remark: f.str(),
          status: f.enum('DOC_STATUS', { required: true })
        },
        query: { keyword: ['code', 'name'], filters: ['status', 'companyId'], sort: ['createTime'], page: true },
        rules: {
          // 字段名是 code 不是 docNo：写成 docNo 时 checkUnique 取到 undefined，唯一性校验会静默失效
          unique: ['code'],
          refs: [
            { field: 'companyId', collection: 'org-companies' },
            { field: 'assetId', collection: 'fixed-assets' },
            { field: 'creatorId', collection: 'org-users' }
          ]
        }
      }
    }
  },
  {
    test: key => key.startsWith('system-dict-types-') && key.endsWith('-items'),
    make: key => ({
      key,
      label: '字典项',
      idField: 'id',
      audit: true,
      fields: {
        label: f.str({ required: true }),
        value: f.str({ required: true }),
        sort: f.num(),
        status: f.enum('ENABLE_STATUS', { required: true }),
        remark: f.str()
      },
      query: { keyword: ['label', 'value'], filters: ['status'], sort: ['sort'], page: true },
      rules: { unique: ['value'] }
    })
  }
]

/** 已知的动态集合 key（供种子注册与文档生成使用） */
export const DYNAMIC_KEYS = [
  ...DOC_LIST_KEYS.map(k => `fixed-asset-doc-lists-${k}`),
  // 字典项集合由「数据字典」页动态创建：每个绑定枚举的字典类型一个集合
  ...ENUM_DICT_META.map(d => `system-dict-types-${d.code}-items`)
]

export { DOC_LIST_KEYS, DOC_LIST_LABELS }
export default CONTRACTS
