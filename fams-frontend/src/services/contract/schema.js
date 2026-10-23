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
    // 资产被业务单据引用时禁止删除
    protect: [
      { collection: 'fixed-asset-dispatch', field: 'assetId', message: '该资产存在派发单据，不能删除' },
      { collection: 'fixed-asset-borrow', field: 'assetId', message: '该资产存在借出单据，不能删除' },
      { collection: 'fixed-asset-dispose', field: 'assetId', message: '该资产存在处置单据，不能删除' }
    ]
  }
}

const INBOUND = {
  key: 'fixed-asset-inbound',
  label: '入库/验收单',
  idField: 'id',
  audit: true,
  fields: {
    ...docFields({
      quantity: f.num({ required: true }),
      unit: f.str(),
      purchasePrice: f.num(),
      supplier: f.str(),
      inboundDate: f.date(),
      status: f.enum('INBOUND_STATUS', { required: true }),
      acceptor: f.str()
    })
  },
  query: { keyword: ['code', 'supplier'], filters: ['status', 'assetId'], sort: ['inboundDate'], page: true },
  rules: { unique: ['code'], refs: [{ field: 'assetId', collection: 'fixed-assets' }] }
}

const DISPATCH = {
  key: 'fixed-asset-dispatch',
  label: '派发/退库单',
  idField: 'id',
  audit: true,
  fields: {
    ...docFields({
      deptId: f.ref('org-departments'),
      userId: f.ref('org-users'),
      dispatchDate: f.date(),
      location: f.str(),
      status: f.enum('DISPATCH_STATUS', { required: true }),
      operator: f.str()
    })
  },
  query: { keyword: ['code'], filters: ['status', 'deptId', 'assetId'], sort: ['dispatchDate'], page: true },
  rules: { unique: ['code'], refs: [{ field: 'assetId', collection: 'fixed-assets' }] }
}

const BORROW = {
  key: 'fixed-asset-borrow',
  label: '借出单',
  idField: 'id',
  audit: true,
  fields: {
    ...docFields({
      userId: f.ref('org-users'),
      deptId: f.ref('org-departments'),
      borrowDate: f.date(),
      expectedReturnDate: f.date(),
      actualReturnDate: f.date(),
      status: f.enum('BORROW_STATUS', { required: true })
    })
  },
  query: { keyword: ['code'], filters: ['status', 'deptId', 'userId', 'assetId'], sort: ['borrowDate'], page: true },
  rules: { unique: ['code'], refs: [{ field: 'assetId', collection: 'fixed-assets' }, { field: 'userId', collection: 'org-users' }] }
}

const CHANGE = {
  key: 'fixed-asset-change',
  label: '资产变更单',
  idField: 'id',
  audit: true,
  fields: {
    ...docFields({
      changeType: f.enum('CHANGE_TYPE', { required: true }),
      changeReason: f.str(),
      changeDate: f.date(),
      operator: f.str()
    })
  },
  query: { keyword: ['code'], filters: ['changeType', 'assetId'], sort: ['changeDate'], page: true },
  rules: { unique: ['code'], refs: [{ field: 'assetId', collection: 'fixed-assets' }] }
}

const DISPOSE = {
  key: 'fixed-asset-dispose',
  label: '资产处置单',
  idField: 'id',
  audit: true,
  fields: {
    ...docFields({
      disposeType: f.enum('DISPOSE_TYPE', { required: true }),
      disposeReason: f.str(),
      residualValue: f.num(),
      disposeDate: f.date(),
      status: f.enum('DISPOSE_STATUS', { required: true })
    })
  },
  query: { keyword: ['code'], filters: ['status', 'disposeType', 'assetId'], sort: ['disposeDate'], page: true },
  rules: { unique: ['code'], refs: [{ field: 'assetId', collection: 'fixed-assets' }] }
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
    categoryId: f.ref('low-value-settings-categories'),
    name: f.str({ required: true }),
    spec: f.str(),
    unit: f.str(),
    price: f.num(),
    stock: f.num(),
    safetyStock: f.num(),
    location: f.str(),
    status: f.enum('LOW_VALUE_ITEM_STATUS', { required: true })
  },
  query: { keyword: ['name', 'code', 'spec'], filters: ['categoryId', 'status', 'location'], sort: ['updateTime', 'code'], page: true },
  rules: {
    unique: ['code'],
    refs: [{ field: 'categoryId', collection: 'low-value-settings-categories' }],
    // 仍有库存或已产生单据时禁止删除
    protect: [
      { collection: 'low-value-inbound', field: 'itemId', message: '该物品已产生入库单据，不能删除' },
      { collection: 'low-value-requisition', field: 'itemId', message: '该物品已产生领用单据，不能删除' }
    ],
    stockGuard: { field: 'stock', message: '该物品仍有库存，不能删除' }
  }
}

function lowValueDoc(key, label, effect, extra = {}) {
  return {
    key,
    label,
    idField: 'id',
    audit: true,
    fields: {
      docNo: f.str({ required: true, unique: true }),
      itemId: f.ref('low-value-items', { required: true }),
      categoryId: f.ref('low-value-settings-categories'),
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
      ...extra
    },
    query: { keyword: ['docNo'], filters: ['itemId', 'categoryId', 'deptId'], sort: ['createTime'], page: true },
    rules: {
      unique: ['docNo'],
      refs: [
        { field: 'itemId', collection: 'low-value-items' },
        { field: 'categoryId', collection: 'low-value-settings-categories' },
        { field: 'deptId', collection: 'org-departments' }
      ],
      // 库存联动：入库/退库加库存，领用扣库存
      stock: { effect, target: 'low-value-items', itemField: 'itemId', qtyField: 'quantity', stockField: 'stock' }
    }
  }
}

const LOW_VALUE_INBOUND = lowValueDoc('low-value-inbound', '低值资产入库单', 'in', {
  supplier: f.str(),
  inboundDate: f.date()
})

const LOW_VALUE_REQUISITION = lowValueDoc('low-value-requisition', '低值资产领用单', 'out', {
  receiver: f.str(),
  requisitionDate: f.date(),
  purpose: f.str()
})

const LOW_VALUE_RETURN = lowValueDoc('low-value-return', '低值资产退库单', 'in', {
  returner: f.str(),
  returnDate: f.date(),
  reason: f.str()
})

const LOW_VALUE_CATEGORIES = {
  key: 'low-value-settings-categories',
  label: '低值资产类别',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true, unique: true }),
    status: f.enum('ENABLE_STATUS', { required: true }),
    sort: f.num(),
    remark: f.str()
  },
  query: { keyword: ['name', 'code'], filters: ['status'], sort: ['sort'], page: true },
  rules: {
    unique: ['code', 'name'],
    protect: [{ collection: 'low-value-items', field: 'categoryId', message: '该类别下仍有物品，不能删除' }]
  }
}

const LOW_VALUE_LOCATIONS = {
  key: 'low-value-settings-locations',
  label: '低值资产存放位置',
  idField: 'id',
  audit: true,
  fields: {
    code: f.str({ required: true, unique: true }),
    name: f.str({ required: true }),
    parentCode: f.str(),
    manager: f.str(),
    itemCount: f.num(),
    status: f.enum('ENABLE_STATUS', { required: true })
  },
  query: { keyword: ['name', 'code'], filters: ['status', 'parentCode'], sort: ['code'], page: true },
  rules: { unique: ['code'] }
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
    count: f.num(),
    status: f.enum('ENABLE_STATUS', { required: true })
  },
  query: { keyword: ['name', 'code'], filters: ['status'], sort: ['code'], page: true },
  rules: { unique: ['code', 'name'] }
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
    enabled: f.bool(),
    steps: f.arr()
  },
  query: { keyword: ['name', 'code'], filters: ['bizType', 'enabled'], sort: ['code'], page: true },
  rules: { unique: ['code'] }
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
  rules: { unique: ['code'], refs: [{ field: 'bindUserId', collection: 'org-users' }] }
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
    createTime: f.date()
  },
  query: { keyword: ['recordNo', 'detail'], filters: ['type', 'handled'], sort: ['createTime'], page: true },
  rules: { unique: ['recordNo'], refs: [{ field: 'deviceCode', collection: 'system-terminal-devices' }] }
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
  ASSETS, INBOUND, DISPATCH, BORROW, CHANGE, DISPOSE,
  INVENTORY_PLANS, INVENTORY_DOCS,
  DEPRECIATION_SCHEMES, DEPRECIATION_REPORTS,
  REPORT_DEPRECIATION_DETAILS, REPORT_DEPRECIATION_PLAN_DETAILS,
  SETTINGS_LOCATIONS, SETTINGS_LOCATION_OPTIONS, SETTINGS_CATEGORIES,
  SETTINGS_DEPRECIATION_RULES, SETTINGS_DEPRECIATION_PLANS,
  LOW_VALUE_ITEMS, LOW_VALUE_INBOUND, LOW_VALUE_REQUISITION, LOW_VALUE_RETURN,
  LOW_VALUE_CATEGORIES, LOW_VALUE_LOCATIONS,
  ORG_COMPANIES, ORG_DEPARTMENTS, ORG_USERS, ORG_ROLES,
  SYSTEM_DICT_TYPES, SYSTEM_PARAMS, SYSTEM_FLOWS,
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
const DOC_LIST_KEYS = ['inbound', 'alloc', 'back', 'transfer', 'repair', 'dispose']
const DOC_LIST_LABELS = {
  inbound: '入库单列表', alloc: '派发单列表', back: '退库单列表',
  transfer: '调拨单列表', repair: '维修单列表', dispose: '处置单列表'
}

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
          docNo: f.str({ required: true, unique: true }),
          name: f.str({ required: true }),
          companyId: f.ref('org-companies'),
          createTime: f.date(),
          finishTime: f.date(),
          remark: f.str(),
          status: f.enum('DOC_STATUS', { required: true })
        },
        query: { keyword: ['docNo', 'name'], filters: ['status', 'companyId'], sort: ['createTime'], page: true },
        rules: { unique: ['docNo'], refs: [{ field: 'companyId', collection: 'org-companies' }] }
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
