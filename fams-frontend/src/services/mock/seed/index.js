/**
 * 种子数据中心：所有集合的演示数据在此统一登记
 *
 * 视图与 store 不再持有任何种子数据，改由这里集中注册，
 * 关闭 mock 后这些文件只是不被加载的死代码，不会污染业务代码。
 */
import { COLLECTION, registerSeed } from '../../'
import { ASSET_SEEDS } from './asset'
import { LOW_VALUE_SEEDS } from './lowValueAsset'
import { ORG_SEEDS } from './org'
import { SETTINGS_SEEDS } from './settings'
import { REPORT_SEEDS } from './reports'
import { SYSTEM_SEEDS } from './system'
import { DOC_LIST_KEYS } from '../../contract/schema'

let registered = false

export function registerAllSeeds() {
  if (registered) return
  registered = true

  // 固定资产
  registerSeed(COLLECTION.assets, ASSET_SEEDS.assets)
  registerSeed(COLLECTION.inventoryPlans, ASSET_SEEDS.inventoryPlans)
  registerSeed(COLLECTION.inventoryDocs, ASSET_SEEDS.inventoryDocs)
  registerSeed(COLLECTION.depreciationSchemes, ASSET_SEEDS.depreciationSchemes)
  registerSeed(COLLECTION.depreciationReports, ASSET_SEEDS.depreciationReports)

  // 固定资产：六类单据列表（每类一个集合）
  DOC_LIST_KEYS.forEach(k => {
    registerSeed(`${COLLECTION.docLists}-${k}`, ASSET_SEEDS.docLists[k] || [])
  })

  // 固定资产：基础设置与报表
  registerSeed(COLLECTION.settingsLocations, SETTINGS_SEEDS.locations)
  registerSeed(COLLECTION.settingsLocationOptions, SETTINGS_SEEDS.locationOptions)
  registerSeed(COLLECTION.settingsCategories, SETTINGS_SEEDS.categories)
  registerSeed(COLLECTION.settingsDepreciationRules, SETTINGS_SEEDS.depreciationRules)
  registerSeed(COLLECTION.settingsDepreciationPlans, SETTINGS_SEEDS.depreciationPlans)
  registerSeed(COLLECTION.reportDepreciationDetails, REPORT_SEEDS.depreciationDetails)
  registerSeed(COLLECTION.reportDepreciationPlanDetails, REPORT_SEEDS.depreciationPlanDetails)

  // 低值资产
  registerSeed(COLLECTION.lowValueItems, LOW_VALUE_SEEDS.items)
  registerSeed(COLLECTION.lowValueInbound, LOW_VALUE_SEEDS.inbound)
  registerSeed(COLLECTION.lowValueRequisition, LOW_VALUE_SEEDS.requisition)
  registerSeed(COLLECTION.lowValueReturn, LOW_VALUE_SEEDS.return)
  registerSeed(COLLECTION.lowValueSettingsCategories, LOW_VALUE_SEEDS.categories)
  registerSeed(COLLECTION.lowValueSettingsLocations, LOW_VALUE_SEEDS.locations)

  // 组织架构主数据
  registerSeed(COLLECTION.orgCompanies, ORG_SEEDS.companies)
  registerSeed(COLLECTION.orgDepartments, ORG_SEEDS.departments)
  registerSeed(COLLECTION.orgUsers, ORG_SEEDS.users)
  registerSeed(COLLECTION.orgRoles, ORG_SEEDS.roles)

  // 系统管理
  registerSeed(COLLECTION.systemDictTypes, SYSTEM_SEEDS.dictTypes)
  Object.entries(SYSTEM_SEEDS.dictItems).forEach(([dictCode, items]) => {
    registerSeed(`${COLLECTION.systemDictTypes}-${dictCode}-items`, items)
  })
  registerSeed(COLLECTION.systemParams, SYSTEM_SEEDS.params)
  registerSeed(COLLECTION.systemFlows, SYSTEM_SEEDS.flows)
  registerSeed(COLLECTION.systemDevices, SYSTEM_SEEDS.devices)
  registerSeed(COLLECTION.systemTerminalAbnormal, SYSTEM_SEEDS.deviceAbnormal)

  // 消息与日志
  registerSeed(COLLECTION.notifyTemplates, SYSTEM_SEEDS.notifyTemplates)
  registerSeed(COLLECTION.notifyMessages, SYSTEM_SEEDS.notifyMessages)
  registerSeed(COLLECTION.operationLogs, SYSTEM_SEEDS.operationLogs)
}

export default registerAllSeeds
