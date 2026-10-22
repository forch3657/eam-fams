// 系统管理与消息/日志类种子（原内联在 SystemDict / SystemParams / TerminalManage / WorkflowConfig 视图，
// 以及 store/notify.js、store/audit.js 中的常量）
// 语义约定：状态存枚举编码；时间存 ISO 8601

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

// ---------------------------------------------------------------- 数据字典
const SEED_DICT_TYPES = [
  { code: 'asset_status', name: '资产状态', count: 6, status: 'ENABLED', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
  { code: 'asset_type', name: '资产类型', count: 6, status: 'ENABLED', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
  { code: 'contract_status', name: '合同状态', count: 4, status: 'ENABLED', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
  { code: 'fee_type', name: '费用类型', count: 3, status: 'ENABLED', ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') },
  { code: 'warning_level', name: '预警级别', count: 3, status: 'ENABLED', ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') }
]

/** 字典项按字典类型分集合存放，value 与业务枚举编码保持一致 */
const SEED_DICT_ITEMS = {
  asset_status: [
    { id: 'DI0101', label: '空闲', value: 'IDLE', sort: 1, status: 'ENABLED', remark: '未派发、未借出', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
    { id: 'DI0102', label: '使用中', value: 'IN_USE', sort: 2, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
    { id: 'DI0103', label: '派发中', value: 'DISPATCHING', sort: 3, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
    { id: 'DI0104', label: '借出中', value: 'BORROWED', sort: 4, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
    { id: 'DI0105', label: '维修中', value: 'REPAIRING', sort: 5, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
    { id: 'DI0106', label: '处置中', value: 'DISPOSING', sort: 6, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') }
  ],
  asset_type: [
    { id: 'DI0201', label: '电子设备', value: 'ELECTRONIC', sort: 1, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
    { id: 'DI0202', label: '机械设备', value: 'MACHINE', sort: 2, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
    { id: 'DI0203', label: '运输设备', value: 'VEHICLE', sort: 3, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
    { id: 'DI0204', label: '办公家具', value: 'FURNITURE', sort: 4, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
    { id: 'DI0205', label: '房屋建筑物', value: 'BUILDING', sort: 5, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
    { id: 'DI0206', label: '其他设备', value: 'OTHER', sort: 6, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') }
  ],
  contract_status: [
    { id: 'DI0301', label: '待签订', value: 'DRAFT', sort: 1, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
    { id: 'DI0302', label: '履行中', value: 'PROCESSING', sort: 2, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
    { id: 'DI0303', label: '已终止', value: 'REVOKED', sort: 3, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
    { id: 'DI0304', label: '已完结', value: 'DONE', sort: 4, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') }
  ],
  fee_type: [
    { id: 'DI0401', label: '租金', value: 'RENT', sort: 1, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') },
    { id: 'DI0402', label: '物业费', value: 'PROPERTY', sort: 2, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') },
    { id: 'DI0403', label: '保证金', value: 'DEPOSIT', sort: 3, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') }
  ],
  warning_level: [
    { id: 'DI0501', label: '普通', value: 'NORMAL', sort: 1, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') },
    { id: 'DI0502', label: '重要', value: 'IMPORTANT', sort: 2, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') },
    { id: 'DI0503', label: '紧急', value: 'URGENT', sort: 3, status: 'ENABLED', remark: '', ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') }
  ]
}

const SEED_ASSET_TYPES = [
  { code: 'OFFICE', name: '办公用房', remark: '用于办公的房屋资产', ...AUDIT('2026-01-06T10:00:00', '2026-09-12T14:30:21'), fields: [{ label: '所在楼层', key: 'floor', type: 'select', required: true, sort: 1, options: ['一楼', '二楼', '三楼', '四楼及以上'], defaultValue: '' }] },
  { code: 'SHOP', name: '商业用房', remark: '用于经营的商铺资产', ...AUDIT('2026-01-06T10:05:00', '2026-09-10T11:05:33'), fields: [{ label: '适营业态', key: 'bizType', type: 'select', required: false, sort: 1, options: ['餐饮', '零售', '不限'], defaultValue: '' }, { label: '装修情况', key: 'decoration', type: 'select', required: false, sort: 2, options: ['毛坯', '简装', '精装', '豪华装修'], defaultValue: '' }] },
  { code: 'LAND', name: '土地资产', remark: '土地使用权类资产', ...AUDIT('2026-01-06T10:10:00', '2026-09-08T16:41:02'), fields: [{ label: '土地等级', key: 'landLevel', type: 'select', required: true, sort: 1, options: ['甲级', '乙级', '丙级', '丁级'], defaultValue: '' }, { label: '取得方式', key: 'acquire', type: 'select', required: true, sort: 2, options: ['出让', '划拨', '租赁'], defaultValue: '' }] },
  { code: 'EQUIP', name: '设备类', remark: '通用设备资产', ...AUDIT('2026-01-06T10:15:00', '2026-09-07T10:22:45'), fields: [{ label: '是否特种设备', key: 'special', type: 'switch', required: false, sort: 1, defaultValue: false }] }
]

// ---------------------------------------------------------------- 系统参数
const SEED_PARAMS = [
  { id: 'SP01', name: '资产编号前缀', key: 'sys.asset.code.prefix', value: 'GD', type: 'SYSTEM', remark: '生成资产卡片编号的前缀', ...AUDIT('2026-01-06T11:00:00', '2026-10-20T09:12:00') },
  { id: 'SP02', name: '低值物品编号前缀', key: 'sys.lowvalue.code.prefix', value: 'DZ', type: 'SYSTEM', remark: '生成低值物品编码的前缀', ...AUDIT('2026-01-06T11:05:00', '2026-10-19T14:30:00') },
  { id: 'SP03', name: '折旧计提日', key: 'sys.depreciation.day', value: '1', type: 'SYSTEM', remark: '每月计提折旧的日期', ...AUDIT('2026-01-06T11:10:00', '2026-10-18T10:05:00') },
  { id: 'SP04', name: '盘点提醒提前天数', key: 'sys.inventory.remind.days', value: '7', type: 'SYSTEM', remark: '盘点截止前多少天开始提醒', ...AUDIT('2026-01-06T11:15:00', '2026-10-17T16:40:00') },
  { id: 'SP05', name: '附件大小上限(MB)', key: 'sys.upload.maxSize', value: '20', type: 'SYSTEM', remark: '单个附件上传大小上限', ...AUDIT('2026-01-06T11:20:00', '2026-10-16T11:25:00') },
  { id: 'SP06', name: '消息保留天数', key: 'sys.message.keepDays', value: '90', type: 'CUSTOM', remark: '站内消息保留天数，超时自动清理', ...AUDIT('2026-03-01T09:00:00', '2026-10-15T09:00:00') },
  { id: 'SP07', name: '低库存预警阈值', key: 'sys.lowvalue.safetyRatio', value: '0.2', type: 'CUSTOM', remark: '库存低于安全库存比例时预警', ...AUDIT('2026-03-01T09:05:00', '2026-10-14T15:20:00') },
  { id: 'SP08', name: '终端心跳超时(分钟)', key: 'sys.terminal.heartbeat', value: '5', type: 'CUSTOM', remark: '超过该时间未心跳视为离线', ...AUDIT('2026-03-01T09:10:00', '2026-10-13T13:45:00') }
]

// ---------------------------------------------------------------- 工作流程
const SEED_FLOWS = [
  { id: 'WF1', code: 'FLOW_DISPOSE', name: '资产处置流程', bizType: '资产处置', initiator: '资产管理员', enabled: true, ...AUDIT('2026-01-06T12:00:00', '2026-09-12T14:30:21'), steps: [{ key: 's1', name: '部门负责人审批', approver: '部门负责人', mode: 'ANY', amountLimit: 0, condition: '' }, { key: 's2', name: '财务复核', approver: '财务经理', mode: 'SEQUENCE', amountLimit: 50000, condition: '原值大于5万' }, { key: 's3', name: '分管领导审批', approver: '分管副总', mode: 'ALL', amountLimit: 200000, condition: '原值大于20万' }] },
  { id: 'WF2', code: 'FLOW_TRANSFER', name: '资产调拨流程', bizType: '资产调拨', initiator: '资产使用人', enabled: true, ...AUDIT('2026-01-06T12:05:00', '2026-09-10T11:05:33'), steps: [{ key: 's1', name: '调出部门审批', approver: '部门负责人', mode: 'ANY', amountLimit: 0, condition: '' }, { key: 's2', name: '资产管理员确认', approver: '资产管理员', mode: 'SEQUENCE', amountLimit: 0, condition: '' }] },
  { id: 'WF3', code: 'FLOW_DEPOSIT', name: '保证金退还流程', bizType: '保证金退还', initiator: '财务人员', enabled: false, ...AUDIT('2026-01-06T12:10:00', '2026-09-08T16:41:02'), steps: [{ key: 's1', name: '风控审核', approver: '风控专员', mode: 'ANY', amountLimit: 0, condition: '' }, { key: 's2', name: '总经理审批', approver: '总经理', mode: 'SEQUENCE', amountLimit: 100000, condition: '金额大于10万' }] }
]

// ---------------------------------------------------------------- 终端设备
const SEED_DEVICES = [
  { code: 'TER001', name: '前台收款终端', type: 'POS', location: '总部办公楼1层', bindAccount: 'cashier01', status: 'ONLINE', lastActive: '2026-10-21T09:12:30', vendor: '商米', model: 'T2s', sn: 'SM-T2S-0001', ip: '192.168.10.21', installDate: '2025-06-18', maintainer: '张三', maintainerPhone: '13800000001', remark: '', ...AUDIT('2025-06-18T09:00:00', '2026-10-21T09:12:30') },
  { code: 'TER002', name: '二号窗口扫码盒子', type: 'SCAN_BOX', location: '总部办公楼2层', bindAccount: 'cashier02', status: 'OFFLINE', lastActive: '2026-10-19T17:40:02', vendor: '收钱吧', model: 'SQB-A1', sn: 'SQB-A1-0007', ip: '192.168.10.22', installDate: '2025-08-02', maintainer: '李四', maintainerPhone: '13800000002', remark: '网络不稳定，待检修', ...AUDIT('2025-08-02T10:00:00', '2026-10-19T17:40:02') },
  { code: 'TER003', name: '大厅自助缴费机', type: 'KIOSK', location: '总部办公楼1层', bindAccount: 'kiosk01', status: 'ONLINE', lastActive: '2026-10-21T08:55:11', vendor: '广电运通', model: 'KT-200', sn: 'KT200-0033', ip: '192.168.10.23', installDate: '2025-11-20', maintainer: '王五', maintainerPhone: '13800000003', remark: '', ...AUDIT('2025-11-20T14:00:00', '2026-10-21T08:55:11') },
  { code: 'TER004', name: '备用POS机', type: 'POS_MACHINE', location: '仓库', bindAccount: '', status: 'DISABLED', lastActive: '2026-08-11T16:02:44', vendor: '新大陆', model: 'NL-8300', sn: 'NL8300-0012', ip: '192.168.10.24', installDate: '2024-12-05', maintainer: '张三', maintainerPhone: '13800000001', remark: '设备老化，已停用', ...AUDIT('2024-12-05T09:00:00', '2026-08-11T16:02:44') }
]

const SEED_MISUSE = [
  { recordNo: 'MS2026001', person: '陈某某', terminalCode: 'TER002', type: 'PRIVATE_COLLECTION', detail: '使用个人收款码收取租金，未入账', amount: 12600, handled: true, createTime: '2026-09-12T10:20:00', ...AUDIT('2026-09-12T10:20:00', '2026-09-20T15:30:00') },
  { recordNo: 'MS2026002', person: '林某某', terminalCode: 'TER001', type: 'ILLEGAL_REDUCTION', detail: '违规减免物业费，未走审批流程', amount: 3800, handled: false, createTime: '2026-10-08T14:05:00', ...AUDIT('2026-10-08T14:05:00', '2026-10-08T14:05:00') }
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
  dictItems: SEED_DICT_ITEMS,
  assetTypes: SEED_ASSET_TYPES,
  params: SEED_PARAMS,
  flows: SEED_FLOWS,
  devices: SEED_DEVICES,
  misuse: SEED_MISUSE,
  notifyTemplates: SEED_NOTIFY_TEMPLATES,
  notifyMessages: SEED_NOTIFY_MESSAGES,
  operationLogs: SEED_OPERATION_LOGS
}

export default SYSTEM_SEEDS
