// 系统管理与消息/日志类种子（原内联在 SystemDict / SystemParams / TerminalManage / WorkflowConfig 视图，
// 以及 store/notify.js、store/audit.js 中的常量）
// 语义约定：状态存枚举编码；时间存 ISO 8601；外键存 id
import { ENUMS, ENUM_DICT_META } from '../../../constants/enums'

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

// ---------------------------------------------------------------- 数据字典
// 字典是业务枚举的统一维护入口：字典类型与字典项由 constants/enums.js 自动派生，
// 保证「字典里的编码」与「代码里的枚举」永远一致（页面上改字典 = 改全站文案）。
const DICT_ITEMS_SEED = ENUM_DICT_META.reduce((acc, meta) => {
  const enumValues = ENUMS[meta.enumName] || {}
  acc[meta.code] = Object.entries(enumValues).map(([value, label], idx) => ({
    id: `DI_${meta.code}_${value}`,
    label,
    value,
    sort: idx + 1,
    status: 'ENABLED',
    remark: '',
    ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21')
  }))
  return acc
}, {})

const SEED_DICT_TYPES = ENUM_DICT_META.map(meta => ({
  code: meta.code,
  name: meta.name,
  count: DICT_ITEMS_SEED[meta.code].length,
  status: 'ENABLED',
  ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21')
}))

// ---------------------------------------------------------------- 系统参数
const SEED_PARAMS = [
  { id: 'SP01', name: '资产编号前缀', key: 'sys.asset.code.prefix', value: 'GD', type: 'SYSTEM', remark: '生成资产卡片编号的前缀', ...AUDIT('2026-01-06T11:00:00', '2026-10-20T09:12:00') },
  { id: 'SP02', name: '低值物品编号前缀', key: 'sys.lowvalue.code.prefix', value: 'DZ', type: 'SYSTEM', remark: '生成低值物品编码的前缀', ...AUDIT('2026-01-06T11:05:00', '2026-10-19T14:30:00') },
  { id: 'SP03', name: '折旧计提日', key: 'sys.depreciation.day', value: '1', type: 'SYSTEM', remark: '每月计提折旧的日期', ...AUDIT('2026-01-06T11:10:00', '2026-10-18T10:05:00') },
  { id: 'SP04', name: '盘点提醒提前天数', key: 'sys.inventory.remind.days', value: '7', type: 'SYSTEM', remark: '盘点截止前多少天开始提醒', ...AUDIT('2026-01-06T11:15:00', '2026-10-17T16:40:00') },
  { id: 'SP05', name: '附件大小上限(MB)', key: 'sys.upload.maxSize', value: '20', type: 'SYSTEM', remark: '单个附件上传大小上限', ...AUDIT('2026-01-06T11:20:00', '2026-10-16T11:25:00') },
  { id: 'SP06', name: '消息保留天数', key: 'sys.message.keepDays', value: '90', type: 'CUSTOM', remark: '站内消息保留天数，超时自动清理', ...AUDIT('2026-03-01T09:00:00', '2026-10-15T09:00:00') },
  { id: 'SP07', name: '低库存预警阈值', key: 'sys.lowvalue.safetyRatio', value: '0.2', type: 'CUSTOM', remark: '库存低于安全库存比例时预警', ...AUDIT('2026-03-01T09:05:00', '2026-10-14T15:20:00') },
  { id: 'SP08', name: '盘点终端心跳超时(分钟)', key: 'sys.terminal.heartbeat', value: '5', type: 'CUSTOM', remark: '盘点终端超过该时间未心跳视为离线', ...AUDIT('2026-03-01T09:10:00', '2026-10-13T13:45:00') }
]

// ---------------------------------------------------------------- 工作流程（全局审批流，模块只引用不另存）
// 约定：
// - initiatorRoleId / approverRoleId 引用「系统管理 → 组织架构 → 角色」的角色 id：审批权由角色派生，
//   持有该角色的**启用**用户即为该环节审批人；
// - mode 存 APPROVE_MODE 编码（ANY 或签 / SEQUENCE 依次 / ALL 会签）；
// - conditionType 存 APPROVE_CONDITION 编码（NONE / AMOUNT_GT / HAS_DIFF），conditionValue 为阈值；
// - approver / condition 为冗余展示文案（兼容旧数据与只读场景），不参与判定。
const STEP = (key, name, roleId, roleName, mode = 'ANY', conditionType = 'NONE', conditionValue = 0) => ({
  key,
  name,
  approverRoleId: roleId,
  approver: roleName,
  mode,
  conditionType,
  conditionValue,
  condition: conditionType === 'AMOUNT_GT'
    ? `单据金额大于 ${conditionValue} 元`
    : (conditionType === 'HAS_DIFF' ? '存在盘点差异' : '无条件')
})

// 角色速查：R1 系统管理员 / R2 资产管理员 / R3 资产使用人 / R4 财务管理员
//          R5 部门主管 / R6 审计员 / R7 分管副总 / R8 仓管员
const SEED_FLOWS = [
  {
    id: 'WF1', code: 'FLOW_INBOUND', name: '资产入库验收流程', bizType: 'INBOUND',
    initiator: '资产管理员', initiatorRoleId: 'R2', enabled: true,
    ...AUDIT('2026-01-06T12:00:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '仓管验收', 'R8', '仓管员', 'ANY'),
      STEP('s2', '资产管理员复核', 'R2', '资产管理员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF2', code: 'FLOW_DISPATCH', name: '资产派发流程', bizType: 'DISPATCH',
    initiator: '资产管理员', initiatorRoleId: 'R2', enabled: true,
    ...AUDIT('2026-01-06T12:05:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '使用部门确认', 'R5', '部门主管', 'ANY'),
      STEP('s2', '资产管理员登记', 'R2', '资产管理员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF3', code: 'FLOW_RETURN', name: '资产退库流程', bizType: 'RETURN',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:10:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管确认', 'R5', '部门主管', 'ANY'),
      STEP('s2', '仓管员验收入库', 'R8', '仓管员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF4', code: 'FLOW_BORROW', name: '资产借出流程', bizType: 'BORROW',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:15:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '资产管理员审核', 'R2', '资产管理员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF5', code: 'FLOW_TRANSFER', name: '资产调拨流程', bizType: 'TRANSFER',
    initiator: '资产管理员', initiatorRoleId: 'R2', enabled: true,
    ...AUDIT('2026-01-06T12:20:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '调出部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '资产管理员办理调拨', 'R2', '资产管理员', 'SEQUENCE'),
      STEP('s3', '大额调拨分管副总审批', 'R7', '分管副总', 'ANY', 'AMOUNT_GT', 200000)
    ]
  },
  {
    id: 'WF6', code: 'FLOW_REPAIR', name: '资产维修流程', bizType: 'REPAIR',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:25:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '资产管理员审核', 'R2', '资产管理员', 'SEQUENCE'),
      STEP('s3', '大额维修分管副总审批', 'R7', '分管副总', 'ANY', 'AMOUNT_GT', 50000)
    ]
  },
  {
    id: 'WF7', code: 'FLOW_CHANGE', name: '资产变更流程', bizType: 'CHANGE',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:30:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '调出部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '资产管理员确认', 'R2', '资产管理员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF8', code: 'FLOW_DISPOSE', name: '资产处置流程', bizType: 'DISPOSE',
    initiator: '资产管理员', initiatorRoleId: 'R2', enabled: true,
    ...AUDIT('2026-01-06T12:35:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '财务管理员复核', 'R4', '财务管理员', 'ANY', 'AMOUNT_GT', 50000),
      STEP('s3', '分管副总审批', 'R7', '分管副总', 'ALL', 'AMOUNT_GT', 200000),
      STEP('s4', '审计员备案', 'R6', '审计员', 'ANY', 'AMOUNT_GT', 200000)
    ]
  },
  {
    id: 'WF9', code: 'FLOW_INVENTORY', name: '资产盘点流程', bizType: 'INVENTORY',
    initiator: '资产管理员', initiatorRoleId: 'R2', enabled: true,
    ...AUDIT('2026-01-06T12:40:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '盘点结果确认', 'R2', '资产管理员', 'ANY'),
      STEP('s2', '盘点差异复核', 'R2', '资产管理员', 'ANY', 'HAS_DIFF'),
      STEP('s3', '审计抽查确认', 'R6', '审计员', 'ANY', 'HAS_DIFF')
    ]
  },
  {
    id: 'WF10', code: 'FLOW_LV_REQUISITION', name: '低值资产领用流程', bizType: 'REQUISITION',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:45:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管审批', 'R5', '部门主管', 'ANY'),
      STEP('s2', '仓管员出库确认', 'R8', '仓管员', 'SEQUENCE')
    ]
  },
  {
    id: 'WF11', code: 'FLOW_LV_RETURN', name: '低值资产退库流程', bizType: 'LV_RETURN',
    initiator: '资产使用人', initiatorRoleId: 'R3', enabled: true,
    ...AUDIT('2026-01-06T12:50:00', '2026-10-22T09:10:00'),
    steps: [
      STEP('s1', '部门主管确认', 'R5', '部门主管', 'ANY'),
      STEP('s2', '仓管员验收入库', 'R8', '仓管员', 'SEQUENCE')
    ]
  }
]

// ---------------------------------------------------------------- 盘点终端
const SEED_DEVICES = [
  { code: 'PD001', name: '盘点手持终端 01', type: 'PDA', location: '总部办公楼1层', bindUserId: 'U8', status: 'ONLINE', lastActive: '2026-10-21T09:12:30', vendor: '东集', model: 'PDA-20', sn: 'DS-PDA-0001', ip: '192.168.10.31', installDate: '2025-06-18', maintainer: '张伟', maintainerPhone: '13800000002', remark: '配发仓储部日常盘点', ...AUDIT('2025-06-18T09:00:00', '2026-10-21T09:12:30') },
  { code: 'PD002', name: '盘点无线扫码枪', type: 'SCANNER', location: '仓库A区', bindUserId: 'U8', status: 'OFFLINE', lastActive: '2026-10-19T17:40:02', vendor: '霍尼韦尔', model: 'HH-SR36', sn: 'HN-SR36-0007', ip: '192.168.10.32', installDate: '2025-08-02', maintainer: '王强', maintainerPhone: '13800000004', remark: '网络不稳定，待检修', ...AUDIT('2025-08-02T10:00:00', '2026-10-19T17:40:02') },
  { code: 'PD003', name: '盘点平板', type: 'TABLET', location: '总部办公楼2层', bindUserId: 'U2', status: 'MAINTENANCE', lastActive: '2026-10-18T11:22:41', vendor: '联想', model: 'TB-X306', sn: 'LX-TB-0033', ip: '192.168.10.33', installDate: '2025-11-20', maintainer: '李娜', maintainerPhone: '13800000003', remark: '电池故障，送修中', ...AUDIT('2025-11-20T14:00:00', '2026-10-18T11:22:41') },
  { code: 'PD004', name: '固定读码器', type: 'FIXED', location: '行政库房', status: 'DISABLED', lastActive: '2026-08-11T16:02:44', vendor: '新大陆', model: 'NL-8300', sn: 'NL8300-0012', ip: '192.168.10.34', installDate: '2024-12-05', maintainer: '张伟', maintainerPhone: '13800000002', remark: '设备老化，已停用', ...AUDIT('2024-12-05T09:00:00', '2026-08-11T16:02:44') }
]

/** 盘点终端异常记录（原「终端违规记录」，已对齐资产盘点场景） */
const SEED_DEVICE_ABNORMAL = [
  { recordNo: 'AB2026001', deviceCode: 'PD002', operatorId: 'U8', type: 'OFFLINE_UPLOAD', detail: '离线盘点数据超过 24 小时未上报', affectedCount: 12, handled: true, createTime: '2026-09-12T10:20:00', ...AUDIT('2026-09-12T10:20:00', '2026-09-20T15:30:00') },
  { recordNo: 'AB2026002', deviceCode: 'PD001', operatorId: 'U2', type: 'UNAUTHORIZED_BIND', detail: '终端被绑定到非盘点责任人账号', affectedCount: 0, handled: false, createTime: '2026-10-08T14:05:00', ...AUDIT('2026-10-08T14:05:00', '2026-10-08T14:05:00') }
]

// ---------------------------------------------------------------- 消息与日志
const SEED_NOTIFY_TEMPLATES = [
  { key: 'inbound_new', scene: '入库待验收', channel: '站内信+短信', title: '资产入库待验收：{asset}', content: '「{asset}」已提交入库申请（单据 {billNo}），请于 {date} 前完成验收。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'inbound_pass', scene: '入库验收通过', channel: '站内信', title: '入库验收通过：{asset}', content: '「{asset}」已通过验收并生成资产卡片，编号 {assetNo}。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'inbound_reject', scene: '入库验收驳回', channel: '站内信+短信', title: '入库验收被驳回：{asset}', content: '「{asset}」验收未通过，原因：{reason}，请补充资料后重新提交。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'dispatch_new', scene: '派发待确认', channel: '站内信', title: '资产派发待确认：{asset}', content: '「{asset}」已派发至 {dept}，使用人 {user}，请确认签收。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'dispatch_done', scene: '派发完成', channel: '站内信', title: '资产派发完成：{asset}', content: '「{asset}」已完成派发，当前使用人 {user}。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'borrow_due', scene: '借出到期提醒', channel: '站内信+短信', title: '借出即将到期：{asset}', content: '「{asset}」借出给 {user}，应于 {date} 归还，请及时提醒。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'borrow_overdue', scene: '借出逾期', channel: '站内信+短信', title: '借出已逾期：{asset}', content: '「{asset}」已逾期 {days} 天未归还，借用人 {user}，请跟进处理。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'change_submit', scene: '资产变更待审', channel: '站内信', title: '资产变更待审批：{asset}', content: '「{asset}」提交变更（{changeType}），单据 {billNo}，请审批。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'change_pass', scene: '资产变更通过', channel: '站内信', title: '资产变更已通过：{asset}', content: '「{asset}」的变更申请已通过，资产台账已同步更新。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'dispose_submit', scene: '处置申请待审', channel: '站内信+短信', title: '资产处置待审批：{asset}', content: '「{asset}」提交{disposeType}申请，原值 {amount} 元，请审批。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'dispose_pass', scene: '处置完成', channel: '站内信', title: '资产处置已完成：{asset}', content: '「{asset}」处置完成，已从在用台账转出。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'inventory_diff', scene: '盘点差异', channel: '站内信', title: '盘点差异待处理：{task}', content: '本次盘点发现盘盈 {gain} 项、盘亏 {loss} 项，请核实后提交调整。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'inventory_overdue', scene: '盘点逾期', channel: '站内信+短信', title: '盘点任务已逾期：{task}', content: '盘点任务「{task}」已超过截止日期 {date} 仍未完成，请尽快处理。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'depreciation_done', scene: '折旧计提完成', channel: '站内信', title: '{period} 折旧计提完成', content: '本期计提折旧 {amount} 元，涉及资产 {count} 项，请核对折旧报表。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'warning_idle', scene: '资产闲置预警', channel: '站内信', title: '资产闲置预警：{asset}', content: '「{asset}」已闲置 {days} 天，建议纳入调拨或处置计划。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'warning_unregistered', scene: '未入账预警', channel: '站内信', title: '资产未入账预警：{asset}', content: '「{asset}」已验收 {days} 天仍未生成资产卡片，请核查。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') },
  { key: 'asset_return', scene: '资产退库', channel: '站内信', title: '资产退库已确认：{asset}', content: '「{asset}」已由 {dept} 退回仓库，当前状态：空闲。', enabled: true, ...AUDIT('2026-01-06T13:00:00', '2026-09-12T14:30:21') }
]

const SEED_NOTIFY_MESSAGES = [
  { id: 'MSG-000001', time: '2026-10-21T09:12:30', type: '入库待验收', level: '重要', title: '资产入库待验收：联想ThinkPad笔记本（20台）', content: '「联想ThinkPad笔记本」已提交入库申请（单据 RK202610021），请于 2026-10-24 前完成验收。', target: 'all', channel: '站内信+短信', read: false, route: '/fixed-assets', ...AUDIT('2026-10-21T09:12:30', '2026-10-21T09:12:30') },
  { id: 'MSG-000002', time: '2026-10-21T08:40:12', type: '借出到期提醒', level: '紧急', title: '借出即将到期：佳能微单相机', content: '「佳能微单相机」借出给 市场部 陈晨，应于 2026-10-22 归还，请及时提醒。', target: 'all', channel: '站内信+短信', read: false, route: '/fixed-assets', ...AUDIT('2026-10-21T08:40:12', '2026-10-21T08:40:12') },
  { id: 'MSG-000003', time: '2026-10-20T17:25:44', type: '盘点差异', level: '重要', title: '盘点差异待处理：2026年三季度固定资产盘点', content: '本次盘点发现盘盈 2 项、盘亏 1 项，请核实后提交调整。', target: 'all', channel: '站内信', read: false, route: '/fixed-assets', ...AUDIT('2026-10-20T17:25:44', '2026-10-20T17:25:44') },
  { id: 'MSG-000004', time: '2026-10-20T15:03:18', type: '处置申请待审', level: '重要', title: '资产处置待审批：戴尔 OptiPlex 台式机（8台）', content: '「戴尔 OptiPlex 台式机」提交报废申请，原值 38400 元，请审批。', target: 'all', channel: '站内信+短信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-20T15:03:18', '2026-10-20T15:03:18') },
  { id: 'MSG-000005', time: '2026-10-20T11:32:09', type: '折旧计提完成', level: '普通', title: '2026-09 折旧计提完成', content: '本期计提折旧 86,420.00 元，涉及资产 42 项，请核对折旧报表。', target: 'all', channel: '站内信', read: true, route: '/fixed-asset-reports', ...AUDIT('2026-10-20T11:32:09', '2026-10-20T11:32:09') },
  { id: 'MSG-000006', time: '2026-10-19T16:48:21', type: '资产变更待审', level: '普通', title: '资产变更待审批：会议室 LED 显示屏', content: '「会议室 LED 显示屏」提交使用部门变更（技术部→品牌部），单据 BG202610019，请审批。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-19T16:48:21', '2026-10-19T16:48:21') },
  { id: 'MSG-000007', time: '2026-10-19T10:07:55', type: '资产闲置预警', level: '普通', title: '资产闲置预警：爱普生投影仪（3台）', content: '「爱普生投影仪」已闲置 95 天，建议纳入调拨或处置计划。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-19T10:07:55', '2026-10-19T10:07:55') },
  { id: 'MSG-000008', time: '2026-10-18T14:15:33', type: '派发完成', level: '普通', title: '资产派发完成：ThinkPad X1 Carbon', content: '「ThinkPad X1 Carbon」已完成派发，当前使用人 李萌（品牌部）。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-18T14:15:33', '2026-10-18T14:15:33') },
  { id: 'MSG-000009', time: '2026-10-18T09:02:10', type: '入库验收通过', level: '普通', title: '入库验收通过：华为会议终端', content: '「华为会议终端」已通过验收并生成资产卡片，编号 GD20260156。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-18T09:02:10', '2026-10-18T09:02:10') },
  { id: 'MSG-000010', time: '2026-10-17T18:21:47', type: '盘点逾期', level: '紧急', title: '盘点任务已逾期：研发中心设备专项盘点', content: '盘点任务「研发中心设备专项盘点」已超过截止日期 2026-10-15 仍未完成，请尽快处理。', target: 'all', channel: '站内信+短信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-17T18:21:47', '2026-10-17T18:21:47') },
  { id: 'MSG-000011', time: '2026-10-17T11:44:06', type: '资产退库', level: '普通', title: '资产退库已确认：飞利浦空气净化器', content: '「飞利浦空气净化器」已由行政部退回仓库，当前状态：空闲。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-17T11:44:06', '2026-10-17T11:44:06') },
  { id: 'MSG-000012', time: '2026-10-16T15:58:39', type: '未入账预警', level: '重要', title: '资产未入账预警：实验用示波器', content: '「实验用示波器」已验收 30 天仍未生成资产卡片，请核查。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets', ...AUDIT('2026-10-16T15:58:39', '2026-10-16T15:58:39') }
]

const SEED_OPERATION_LOGS = [
  { id: 'OL-000012', time: '2026-10-21T09:18:02', module: '资产管理', action: '新增资产', target: '联想ThinkPad笔记本', result: '成功', detail: '新增资产卡片 GD20260162，原值 128000 元', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-21T09:18:02', '2026-10-21T09:18:02') },
  { id: 'OL-000011', time: '2026-10-21T09:02:47', module: '入库验收', action: '提交验收', target: 'RK202610021', result: '成功', detail: '提交 20 台笔记本验收申请', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-21T09:02:47', '2026-10-21T09:02:47') },
  { id: 'OL-000010', time: '2026-10-20T17:31:15', module: '资产盘点', action: '登记盘盈', target: 'PD-2026-003', result: '成功', detail: '登记盘盈资产 2 项', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-20T17:31:15', '2026-10-20T17:31:15') },
  { id: 'OL-000009', time: '2026-10-20T15:09:53', module: '资产处置', action: '提交处置申请', target: 'CZ202610008', result: '成功', detail: '批量报废台式机 8 台，原值 38400 元', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-20T15:09:53', '2026-10-20T15:09:53') },
  { id: 'OL-000008', time: '2026-10-20T11:40:28', module: '折旧管理', action: '计提折旧', target: '2026-09', result: '成功', detail: '计提折旧 86420.00 元，涉及资产 42 项', ip: '127.0.0.1', operator: '系统', operatorOrg: '系统', ...AUDIT('2026-10-20T11:40:28', '2026-10-20T11:40:28') },
  { id: 'OL-000007', time: '2026-10-19T16:52:11', module: '资产变更', action: '提交变更', target: 'BG202610019', result: '成功', detail: '会议室 LED 显示屏使用部门变更', ip: '192.168.10.28', operator: '王五', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-19T16:52:11', '2026-10-19T16:52:11') },
  { id: 'OL-000006', time: '2026-10-19T10:12:36', module: '借出管理', action: '新增借出单', target: 'JC202610011', result: '成功', detail: '佳能微单相机借出给陈晨，预计 10-22 归还', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-19T10:12:36', '2026-10-19T10:12:36') },
  { id: 'OL-000005', time: '2026-10-18T14:20:07', module: '派发管理', action: '确认派发', target: 'PF202610007', result: '成功', detail: 'ThinkPad X1 Carbon 派发至品牌部李萌', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-18T14:20:07', '2026-10-18T14:20:07') },
  { id: 'OL-000004', time: '2026-10-18T09:06:44', module: '系统管理', action: '修改参数', target: '资产编号前缀', result: '成功', detail: 'sys.asset.code.prefix: GD → GD', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-18T09:06:44', '2026-10-18T09:06:44') },
  { id: 'OL-000003', time: '2026-10-17T18:26:19', module: '资产盘点', action: '标记盘亏', target: 'PD-2026-003', result: '成功', detail: '实验用示波器标记盘亏', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-17T18:26:19', '2026-10-17T18:26:19') },
  { id: 'OL-000002', time: '2026-10-17T11:50:03', module: '组织架构', action: '编辑用户', target: '孙磊', result: '成功', detail: '调整所属部门为后勤保障部', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-17T11:50:03', '2026-10-17T11:50:03') },
  { id: 'OL-000001', time: '2026-10-16T16:02:58', module: '系统管理', action: '修改模板', target: 'borrow_due', result: '成功', detail: '借出到期提醒模板内容调整', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心', ...AUDIT('2026-10-16T16:02:58', '2026-10-16T16:02:58') }
]

export const SYSTEM_SEEDS = {
  dictTypes: SEED_DICT_TYPES,
  dictItems: DICT_ITEMS_SEED,
  params: SEED_PARAMS,
  flows: SEED_FLOWS,
  devices: SEED_DEVICES,
  deviceAbnormal: SEED_DEVICE_ABNORMAL,
  notifyTemplates: SEED_NOTIFY_TEMPLATES,
  notifyMessages: SEED_NOTIFY_MESSAGES,
  operationLogs: SEED_OPERATION_LOGS
}

export default SYSTEM_SEEDS
