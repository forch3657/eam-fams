/**
 * 固定资产「从台账发起业务」的动作定义，单一真源。
 *
 * - statuses 必须与后端 ApprovalService.validateAssetPrecondition 的允许状态一致；
 * - FixedAssetDocList 的资产下拉过滤由 ALLOWED_ASSET_STATUS 派生；
 * - FixedAssetManagement 的台账行级入口由 ASSET_ACTION_DEFS 渲染，权限由 canCreateDoc 判定。
 *
 * 期初导入 / 无前置单据的资产不在此表做任何排除：服务端只看资产状态与互斥单据，
 * 历史台账同样可以发起退库、维修、调拨、处置等全部业务。
 * 2026-11-11 起「信息更正」下架：台账字段直接在固定资产列表「修改」里改，不再另开审批单。
 */
export const ASSET_ACTION_DEFS = [
  { docKey: 'inbound', label: '入库验收', statuses: ['PENDING_INBOUND'], tab: 'inbound' },
  { docKey: 'alloc', label: '派发', statuses: ['IDLE'], tab: 'dispatch', sub: 'alloc' },
  { docKey: 'back', label: '退库', statuses: ['IN_USE', 'BORROWED'], tab: 'dispatch', sub: 'back' },
  { docKey: 'borrow', label: '借出', statuses: ['IN_USE'], tab: 'borrow' },
  { docKey: 'transfer', label: '调拨', statuses: ['IDLE', 'IN_USE', 'PENDING_WRITE_OFF'], tab: 'change', sub: 'transfer' },
  { docKey: 'repair', label: '维修送修', statuses: ['IN_USE', 'BORROWED'], tab: 'change', sub: 'repair' },
  { docKey: 'dispose', label: '处置', statuses: ['IDLE', 'IN_USE', 'PENDING_WRITE_OFF'], tab: 'dispose' }
]

/** 各单据允许发起的资产前置状态（供 FixedAssetDocList 资产下拉过滤） */
export const ALLOWED_ASSET_STATUS = Object.fromEntries(
  ASSET_ACTION_DEFS.map(def => [def.docKey, def.statuses])
)

/** 服务端 PermissionPolicy.WRITE 的主权限码（与 permission-resources.json 一致） */
export const DOC_WRITE_CODES = {
  inbound: ['fa:inbound'],
  alloc: ['fa:dispatch'],
  back: ['fa:dispatch'],
  borrow: ['fa:borrow'],
  transfer: ['fa:dispose'],
  repair: ['fa:repair', 'fa:dispose'],
  change: ['fa:change'],
  dispose: ['fa:dispose']
}

/**
 * 流程定义中由资产使用人发起的单据：
 * system_workflow_flows.initiator_role_id = R3（WF3 退库 / WF4 借出 / WF6 维修 / WF7 变更）。
 * 台账使用人本人可对这些单据行使「自己名下资产」的发起权，须与后端 AssetOwnerPolicy 保持一致。
 *
 * WF7 信息更正的页面入口已下架，这里仍保留 `change` 编码：后端 AssetOwnerPolicy 同源，
 * 且生产库可能存在历史在途单据，不能单方面把这四类授权改小。
 */
export const OWNER_INITIATED_DOC_KEYS = ['back', 'borrow', 'repair', 'change']
