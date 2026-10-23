// 固定资产模块的集合标识：mock 与 HTTP 两种实现共用同一套 key
export const COLLECTION = {
  assets: 'fixed-assets',
  inventoryPlans: 'fixed-asset-inventory-plans',
  inventoryDocs: 'fixed-asset-inventory-docs',
  depreciationSchemes: 'fixed-asset-depreciation-schemes',
  depreciationReports: 'fixed-asset-depreciation-reports',
  docLists: 'fixed-asset-doc-lists',
  docApprovals: 'fixed-asset-doc-approvals',
  settingsLocations: 'fixed-asset-settings-locations',
  settingsLocationOptions: 'fixed-asset-settings-location-options',
  settingsCategories: 'fixed-asset-settings-categories',
  settingsDepreciationRules: 'fixed-asset-settings-depreciation-rules',
  settingsDepreciationPlans: 'fixed-asset-settings-depreciation-plans',
  reportDepreciationDetails: 'fixed-asset-report-depreciation-details',
  reportDepreciationPlanDetails: 'fixed-asset-report-depreciation-plan-details',

  // 低值资产
  lowValueItems: 'low-value-items',
  lowValueInbound: 'low-value-inbound',
  lowValueRequisition: 'low-value-requisition',
  lowValueReturn: 'low-value-return',
  lowValueSettingsCategories: 'low-value-settings-categories',
  lowValueSettingsLocations: 'low-value-settings-locations',

  // 组织架构（v2：公司/部门/用户/角色统一主数据，取代旧 system-* 五张表）
  orgCompanies: 'org-companies',
  orgDepartments: 'org-departments',
  orgUsers: 'org-users',
  orgRoles: 'org-roles',

  // 系统管理
  systemDictTypes: 'system-dict-types',
  systemParams: 'system-params',
  systemFlows: 'system-workflow-flows',
  systemDevices: 'system-terminal-devices',
  systemTerminalAbnormal: 'system-terminal-abnormal',
  notifyMessages: 'notify-messages',
  notifyTemplates: 'notify-templates',
  operationLogs: 'operation-logs'
}

export default COLLECTION
