// 固定资产「基础设置」相关种子（原内联在 FixedAssetSettings.vue）
// 语义约定：状态存枚举编码；时间存 ISO 8601；公司引用 companyId

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

const SEED_LOCATIONS = [
  { code: 'LOC001', name: '总部办公楼', parentName: '-', manager: '张三', assetCount: 135, ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
  { code: 'LOC001-01', name: '总部办公楼1层', parentName: '总部办公楼', manager: '张三', assetCount: 45, ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
  { code: 'LOC001-02', name: '总部办公楼2层', parentName: '总部办公楼', manager: '张三', assetCount: 38, ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
  { code: 'LOC001-03', name: '总部办公楼3层', parentName: '总部办公楼', manager: '张三', assetCount: 52, ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') },
  { code: 'LOC002', name: '仓库', parentName: '-', manager: '李四', assetCount: 110, ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') },
  { code: 'LOC002-01', name: '仓库A区', parentName: '仓库', manager: '李四', assetCount: 68, ...AUDIT('2026-01-06T09:25:00', '2026-09-05T15:38:27') },
  { code: 'LOC002-02', name: '仓库B区', parentName: '仓库', manager: '李四', assetCount: 42, ...AUDIT('2026-01-06T09:30:00', '2026-09-04T10:11:52') },
  { code: 'LOC003', name: '车库', parentName: '-', manager: '王五', assetCount: 12, ...AUDIT('2026-01-06T09:35:00', '2026-09-03T14:02:09') }
]

const SEED_LOCATION_OPTIONS = [
  { code: 'LOC001', name: '总部办公楼' },
  { code: 'LOC002', name: '仓库' },
  { code: 'LOC003', name: '车库' }
]

/** 资产分类树：parentCode 指向父级 code，用于分类设置与资产归类 */
const SEED_CATEGORIES = [
  {
    id: 'CAT000', code: 'CAT000', name: '高价值资产', parentCode: '', parentName: '-', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 10, assetCount: 326, status: 'ENABLED', ...AUDIT('2026-01-06T09:12:00', '2026-09-12T14:30:21'),
    children: [
      {
        id: 'CAT000-01', code: 'CAT000-01', name: '机械类', parentCode: 'CAT000', parentName: '高价值资产', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 10, assetCount: 128, status: 'ENABLED', ...AUDIT('2026-01-06T09:20:00', '2026-09-10T11:05:33'),
        children: [
          { id: 'CAT000-0101', code: 'CAT000-0101', name: '一般机械类', parentCode: 'CAT000-01', parentName: '机械类', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 10, assetCount: 62, status: 'ENABLED', ...AUDIT('2026-01-06T09:26:00', '2026-09-08T16:41:02'), children: [] },
          { id: 'CAT000-0102', code: 'CAT000-0102', name: '数控机床类', parentCode: 'CAT000-01', parentName: '机械类', depreciationMethod: 'SUM_YEARS', usefulLife: 12, assetCount: 38, status: 'ENABLED', ...AUDIT('2026-01-06T09:28:00', '2026-09-07T10:22:45'), children: [] },
          { id: 'CAT000-0103', code: 'CAT000-0103', name: '工程机械类', parentCode: 'CAT000-01', parentName: '机械类', depreciationMethod: 'WORKLOAD', usefulLife: 8, assetCount: 28, status: 'DISABLED', ...AUDIT('2026-01-06T09:30:00', '2026-08-30T09:14:18'), children: [] }
        ]
      },
      {
        id: 'CAT000-02', code: 'CAT000-02', name: '运输设备类', parentCode: 'CAT000', parentName: '高价值资产', depreciationMethod: 'DOUBLE_DECLINE', usefulLife: 8, assetCount: 96, status: 'ENABLED', ...AUDIT('2026-01-06T09:34:00', '2026-09-05T15:38:27'),
        children: [
          { id: 'CAT000-0201', code: 'CAT000-0201', name: '商务客车', parentCode: 'CAT000-02', parentName: '运输设备类', depreciationMethod: 'DOUBLE_DECLINE', usefulLife: 8, assetCount: 41, status: 'ENABLED', ...AUDIT('2026-01-06T09:36:00', '2026-09-04T10:11:52'), children: [] },
          { id: 'CAT000-0202', code: 'CAT000-0202', name: '货运车辆', parentCode: 'CAT000-02', parentName: '运输设备类', depreciationMethod: 'WORKLOAD', usefulLife: 6, assetCount: 55, status: 'ENABLED', ...AUDIT('2026-01-06T09:38:00', '2026-09-03T14:02:09'), children: [] }
        ]
      },
      {
        id: 'CAT000-03', code: 'CAT000-03', name: '房屋建筑物类', parentCode: 'CAT000', parentName: '高价值资产', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 30, assetCount: 102, status: 'ENABLED', ...AUDIT('2026-01-06T09:40:00', '2026-09-02T09:47:36'),
        children: [
          { id: 'CAT000-0301', code: 'CAT000-0301', name: '办公用房', parentCode: 'CAT000-03', parentName: '房屋建筑物类', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 30, assetCount: 64, status: 'ENABLED', ...AUDIT('2026-01-06T09:42:00', '2026-08-28T17:20:44'), children: [] },
          { id: 'CAT000-0302', code: 'CAT000-0302', name: '生产厂房', parentCode: 'CAT000-03', parentName: '房屋建筑物类', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 25, assetCount: 38, status: 'ENABLED', ...AUDIT('2026-01-06T09:44:00', '2026-08-26T11:33:15'), children: [] }
        ]
      }
    ]
  },
  {
    id: 'CAT001', code: 'CAT001', name: '办公用品', parentCode: '', parentName: '-', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 5, assetCount: 156, status: 'ENABLED', ...AUDIT('2026-01-06T10:02:00', '2026-09-11T09:26:40'),
    children: [
      { id: 'CAT001-01', code: 'CAT001-01', name: '办公家具', parentCode: 'CAT001', parentName: '办公用品', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 10, assetCount: 88, status: 'ENABLED', ...AUDIT('2026-01-06T10:04:00', '2026-09-09T15:52:11'), children: [] },
      { id: 'CAT001-02', code: 'CAT001-02', name: '办公耗材', parentCode: 'CAT001', parentName: '办公用品', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 1, assetCount: 68, status: 'ENABLED', ...AUDIT('2026-01-06T10:06:00', '2026-09-06T08:41:57'), children: [] }
    ]
  },
  { id: 'CAT002', code: 'CAT002', name: '电子设备', parentCode: '', parentName: '-', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 5, assetCount: 214, status: 'ENABLED', ...AUDIT('2026-01-06T10:10:00', '2026-09-04T10:11:52'), children: [] },
  { id: 'CAT003', code: 'CAT003', name: '运输设备', parentCode: '', parentName: '-', depreciationMethod: 'DOUBLE_DECLINE', usefulLife: 8, assetCount: 46, status: 'ENABLED', ...AUDIT('2026-01-06T10:14:00', '2026-09-03T14:02:09'), children: [] },
  { id: 'CAT004', code: 'CAT004', name: '办公家具', parentCode: '', parentName: '-', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 10, assetCount: 88, status: 'ENABLED', ...AUDIT('2026-01-06T10:18:00', '2026-09-02T09:47:36'), children: [] },
  { id: 'CAT005', code: 'CAT005', name: '其他设备', parentCode: '', parentName: '-', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 5, assetCount: 32, status: 'ENABLED', ...AUDIT('2026-01-06T10:22:00', '2026-09-01T17:20:44'), children: [] }
]

const SEED_DEPRECIATION_RULES = [
  { name: '电子设备折旧规则', method: 'STRAIGHT_LINE', usefulLife: 5, residualRate: 5, description: '电脑、打印机、会议设备等电子设备', ...AUDIT('2026-01-06T11:00:00', '2026-09-12T14:30:21') },
  { name: '机械设备折旧规则', method: 'STRAIGHT_LINE', usefulLife: 10, residualRate: 5, description: '机床、空调机组等生产设备', ...AUDIT('2026-01-06T11:05:00', '2026-09-10T11:05:33') },
  { name: '运输设备折旧规则', method: 'DOUBLE_DECLINE', usefulLife: 8, residualRate: 5, description: '商务车、货车等运输工具', ...AUDIT('2026-01-06T11:10:00', '2026-09-08T16:41:02') },
  { name: '房屋建筑物折旧规则', method: 'STRAIGHT_LINE', usefulLife: 30, residualRate: 3, description: '办公用房、生产厂房', ...AUDIT('2026-01-06T11:15:00', '2026-09-07T10:22:45') },
  { name: '办公家具折旧规则', method: 'SUM_YEARS', usefulLife: 10, residualRate: 5, description: '会议桌、办公椅等家具', ...AUDIT('2026-01-06T11:20:00', '2026-09-06T08:41:57') }
]

const SEED_DEPRECIATION_PLANS = [
  { id: 'DP01', companyId: 'C1', name: '华信科技-电子设备月折旧', method: 'STRAIGHT_LINE', assetTypes: ['ELECTRONIC'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 1, purchaseMode: 'PURCHASE', remark: '总部电子设备', ...AUDIT('2026-01-06T12:00:00', '2026-09-12T14:30:21') },
  { id: 'DP02', companyId: 'C1', name: '华信科技-机械设备月折旧', method: 'STRAIGHT_LINE', assetTypes: ['MACHINE'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 1, purchaseMode: 'PURCHASE', remark: '', ...AUDIT('2026-01-06T12:05:00', '2026-09-10T11:05:33') },
  { id: 'DP03', companyId: 'C1', name: '华信科技-办公家具季折旧', method: 'STRAIGHT_LINE', assetTypes: ['FURNITURE'], residualRate: 5, calcTime: 'QUARTERLY', monthlyDay: 1, purchaseMode: 'PURCHASE', remark: '', ...AUDIT('2026-01-06T12:10:00', '2026-09-08T16:41:02') },
  { id: 'DP04', companyId: 'C2', name: '云鼎资产-电子设备月折旧', method: 'STRAIGHT_LINE', assetTypes: ['ELECTRONIC'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 5, purchaseMode: 'PURCHASE', remark: '', ...AUDIT('2026-01-06T12:15:00', '2026-09-07T10:22:45') },
  { id: 'DP05', companyId: 'C2', name: '云鼎资产-机械设备月折旧', method: 'STRAIGHT_LINE', assetTypes: ['MACHINE'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 5, purchaseMode: 'SELF_BUILD', remark: '自建中央空调机组', ...AUDIT('2026-01-06T12:20:00', '2026-09-06T08:41:57') },
  { id: 'DP06', companyId: 'C3', name: '恒信租赁-运输设备月折旧', method: 'DOUBLE_DECLINE', assetTypes: ['VEHICLE'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 10, purchaseMode: 'PURCHASE', remark: '', ...AUDIT('2026-01-06T12:25:00', '2026-09-05T15:38:27') },
  { id: 'DP07', companyId: 'C3', name: '恒信租赁-电子设备月折旧', method: 'STRAIGHT_LINE', assetTypes: ['ELECTRONIC'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 10, purchaseMode: 'LEASE', remark: '租赁设备', ...AUDIT('2026-01-06T12:30:00', '2026-09-04T10:11:52') },
  { id: 'DP08', companyId: 'C4', name: '中天建设-机械设备月折旧', method: 'WORKLOAD', assetTypes: ['MACHINE'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 15, purchaseMode: 'PURCHASE', remark: '按工作量计提', ...AUDIT('2026-01-06T12:35:00', '2026-09-03T14:02:09') },
  { id: 'DP09', companyId: 'C4', name: '中天建设-运输设备月折旧', method: 'DOUBLE_DECLINE', assetTypes: ['VEHICLE'], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 15, purchaseMode: 'PURCHASE', remark: '', ...AUDIT('2026-01-06T12:40:00', '2026-09-02T09:47:36') },
  { id: 'DP10', companyId: 'C4', name: '中天建设-房屋建筑年折旧', method: 'STRAIGHT_LINE', assetTypes: ['BUILDING'], residualRate: 3, calcTime: 'YEARLY', monthlyDay: 1, purchaseMode: 'SELF_BUILD', remark: '', ...AUDIT('2026-01-06T12:45:00', '2026-08-28T17:20:44') },
  { id: 'DP11', companyId: 'C1', name: '华信科技-房屋建筑年折旧', method: 'STRAIGHT_LINE', assetTypes: ['BUILDING'], residualRate: 3, calcTime: 'YEARLY', monthlyDay: 1, purchaseMode: 'PURCHASE', remark: '总部办公楼', ...AUDIT('2026-01-06T12:50:00', '2026-08-26T11:33:15') }
]

const SEED_APPROVAL_FLOWS = [
  { name: '资产入库审批', type: 'INBOUND', steps: ['部门负责人审批', '资产管理员验收', '财务确认'], status: 'ENABLED', ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { name: '资产派发审批', type: 'DISPATCH', steps: ['部门负责人审批', '资产管理员确认'], status: 'ENABLED', ...AUDIT('2026-01-06T13:05:00', '2026-09-10T11:05:33') },
  { name: '资产借出审批', type: 'BORROW', steps: ['部门负责人审批'], status: 'ENABLED', ...AUDIT('2026-01-06T13:10:00', '2026-09-08T16:41:02') },
  { name: '资产处置审批', type: 'DISPOSE', steps: ['部门负责人审批', '资产管理员核实', '财务复核', '分管领导审批'], status: 'ENABLED', ...AUDIT('2026-01-06T13:15:00', '2026-09-07T10:22:45') },
  { name: '资产变更审批', type: 'CHANGE', steps: ['部门负责人审批', '资产管理员确认'], status: 'DISABLED', ...AUDIT('2026-01-06T13:20:00', '2026-09-06T08:41:57') }
]

export const SETTINGS_SEEDS = {
  locations: SEED_LOCATIONS,
  locationOptions: SEED_LOCATION_OPTIONS,
  categories: SEED_CATEGORIES,
  depreciationRules: SEED_DEPRECIATION_RULES,
  depreciationPlans: SEED_DEPRECIATION_PLANS,
  approvalFlows: SEED_APPROVAL_FLOWS
}

export default SETTINGS_SEEDS
