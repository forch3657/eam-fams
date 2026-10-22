// 固定资产种子数据（仅在 mock 模式下使用）
// 语义约定：外键存 id（companyId/deptId/userId/assetId）；状态存枚举编码；时间存 ISO 8601；含审计字段
// 原写在 FixedAssetManagement.vue 里的演示数据构造器（buildDocs / buildCheckItems / buildCounters）已迁到此处

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

// ---------------------------------------------------------------- 资产台账
const SEED_ASSETS = [
  { id: 'A01', code: 'GD20260001', name: '联想ThinkPad笔记本电脑', category: 'ELECTRONIC', brand: '联想', model: 'ThinkPad T14', companyId: 'C1', deptId: 'D1', userId: 'U2', location: '总部办公楼2层', purchaseDate: '2026-03-12', inboundDate: '2026-03-15', amount: 8500, original: 8500, net: 7650, status: 'IDLE', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 36, ...AUDIT('2026-03-15T09:00:00', '2026-09-18T10:22:31') },
  { id: 'A02', code: 'GD20260002', name: '戴尔OptiPlex台式电脑', category: 'ELECTRONIC', brand: '戴尔', model: 'OptiPlex 7010', companyId: 'C1', deptId: 'D2', userId: 'U3', location: '总部办公楼3层', purchaseDate: '2026-02-20', inboundDate: '2026-02-25', amount: 6200, original: 6200, net: 5580, status: 'DISPATCHING', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 36, ...AUDIT('2026-02-25T09:30:00', '2026-09-17T15:40:12') },
  { id: 'A03', code: 'GD20260003', name: '惠普激光打印机', category: 'ELECTRONIC', brand: '惠普', model: 'LaserJet M405', companyId: 'C2', deptId: 'D8', userId: 'U10', location: '总部办公楼1层', purchaseDate: '2025-11-08', inboundDate: '2025-11-12', amount: 3200, original: 3200, net: 2560, status: 'BORROWED', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 24, ...AUDIT('2025-11-12T10:00:00', '2026-09-16T09:05:44') },
  { id: 'A04', code: 'GD20260004', name: '丰田考斯特商务车', category: 'VEHICLE', brand: '丰田', model: '考斯特 20座', companyId: 'C4', deptId: 'D12', userId: 'U14', location: '车库', purchaseDate: '2025-06-18', inboundDate: '2025-06-25', amount: 385000, original: 385000, net: 320800, status: 'REPAIRING', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 60, ...AUDIT('2025-06-25T11:00:00', '2026-09-15T14:22:08') },
  { id: 'A05', code: 'GD20260005', name: '数控车床CK6140', category: 'MACHINE', brand: '沈阳机床', model: 'CK6140', companyId: 'C1', deptId: 'D6', userId: 'U7', location: '仓库A区', purchaseDate: '2024-09-10', inboundDate: '2024-09-20', amount: 268000, original: 268000, net: 214400, status: 'DISPOSING', depreciate: true, purchaseMode: 'LEASE', leaseMonths: 48, ...AUDIT('2024-09-20T14:00:00', '2026-09-14T11:31:52') },
  { id: 'A06', code: 'GD20260006', name: '华为会议平板', category: 'ELECTRONIC', brand: '华为', model: 'IdeaHub S2', companyId: 'C1', deptId: 'D4', userId: 'U5', location: '总部办公楼3层', purchaseDate: '2026-04-02', inboundDate: '2026-04-06', amount: 26800, original: 26800, net: 25460, status: 'IDLE', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 36, ...AUDIT('2026-04-06T09:20:00', '2026-09-13T16:48:20') },
  { id: 'A07', code: 'GD20260007', name: '格力中央空调机组', category: 'MACHINE', brand: '格力', model: 'GMV-560', companyId: 'C2', deptId: 'D9', userId: 'U11', location: '数据中心机房', purchaseDate: '2025-03-15', inboundDate: '2025-03-28', amount: 158000, original: 158000, net: 132700, status: 'DISPATCHING', depreciate: true, purchaseMode: 'SELF_BUILD', leaseMonths: 120, ...AUDIT('2025-03-28T15:10:00', '2026-09-12T08:55:03') },
  { id: 'A08', code: 'GD20260008', name: '实木会议桌', category: 'FURNITURE', brand: '华丰', model: 'HF-B3200', companyId: 'C4', deptId: 'D13', userId: 'U15', location: '总部办公楼1层', purchaseDate: '2025-12-05', inboundDate: '2025-12-10', amount: 12800, original: 12800, net: 11520, status: 'BORROWED', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 60, ...AUDIT('2025-12-10T10:40:00', '2026-09-11T13:26:47') },
  { id: 'A09', code: 'GD20260009', name: '人体工学办公椅', category: 'FURNITURE', brand: '西昊', model: 'M57', companyId: 'C1', deptId: 'D3', userId: 'U4', location: '总部办公楼2层', purchaseDate: '2026-01-16', inboundDate: '2026-01-20', amount: 1580, original: 1580, net: 1420, status: 'IDLE', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 24, ...AUDIT('2026-01-20T11:00:00', '2026-09-10T10:12:35') },
  { id: 'A10', code: 'GD20260010', name: '服务器机柜', category: 'ELECTRONIC', brand: '图腾', model: 'G2.6642', companyId: 'C3', deptId: 'D11', userId: 'U13', location: '数据中心机房', purchaseDate: '2024-11-22', inboundDate: '2024-12-01', amount: 42000, original: 42000, net: 33600, status: 'REPAIRING', depreciate: true, purchaseMode: 'LEASE', leaseMonths: 36, ...AUDIT('2024-12-01T09:50:00', '2026-09-09T17:04:11') },
  { id: 'A11', code: 'GD20260011', name: '合力3吨叉车', category: 'MACHINE', brand: '合力', model: 'CPCD30', companyId: 'C4', deptId: 'D12', userId: 'U14', location: '仓库B区', purchaseDate: '2025-08-08', inboundDate: '2025-08-15', amount: 96000, original: 96000, net: 84000, status: 'DISPOSING', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 60, ...AUDIT('2025-08-15T16:20:00', '2026-09-08T09:38:56') },
  { id: 'A12', code: 'GD20260012', name: '爱普生投影仪', category: 'ELECTRONIC', brand: '爱普生', model: 'CB-X06', companyId: 'C2', deptId: 'D8', userId: 'U10', location: '总部办公楼3层', purchaseDate: '2026-05-20', inboundDate: '2026-05-24', amount: 4600, original: 4600, net: 4370, status: 'IDLE', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 36, ...AUDIT('2026-05-24T14:05:00', '2026-09-07T14:51:29') },
  { id: 'A13', code: 'GD20260013', name: '不间断电源UPS', category: 'ELECTRONIC', brand: '山特', model: 'C3KS', companyId: 'C1', deptId: 'D102', userId: 'U9', location: '数据中心机房', purchaseDate: '2025-10-11', inboundDate: '2025-10-18', amount: 18600, original: 18600, net: 16120, status: 'DISPATCHING', depreciate: true, purchaseMode: 'PURCHASE', leaseMonths: 48, ...AUDIT('2025-10-18T08:30:00', '2026-09-06T11:19:40') }
]

// ---------------------------------------------------------------- 业务单据（均引用 assetId）
const SEED_INBOUND = [
  { id: 'FAI1', code: 'RK2026001', assetId: 'A01', quantity: 10, unit: '台', purchasePrice: 8500, supplier: '联想官方授权经销商', inboundDate: '2026-09-01', status: 'STORED', acceptor: '张三', ...AUDIT('2026-09-01T09:00:00', '2026-09-01T17:20:00') },
  { id: 'FAI2', code: 'RK2026002', assetId: 'A03', quantity: 5, unit: '台', purchasePrice: 3200, supplier: '惠普官方旗舰店', inboundDate: '2026-09-05', status: 'ACCEPTED', acceptor: '李四', ...AUDIT('2026-09-05T09:10:00', '2026-09-05T16:30:00') },
  { id: 'FAI3', code: 'RK2026003', assetId: 'A08', quantity: 20, unit: '张', purchasePrice: 1200, supplier: '宜家家居', inboundDate: '2026-09-08', status: 'PENDING', acceptor: '', ...AUDIT('2026-09-08T10:00:00', '2026-09-08T10:00:00') },
  { id: 'FAI4', code: 'RK2026004', assetId: 'A04', quantity: 2, unit: '辆', purchasePrice: 180000, supplier: '广汽丰田4S店', inboundDate: '2026-08-20', status: 'STORED', acceptor: '王五', ...AUDIT('2026-08-20T11:00:00', '2026-08-20T15:40:00') },
  { id: 'FAI5', code: 'RK2026005', assetId: 'A12', quantity: 3, unit: '台', purchasePrice: 6800, supplier: '爱普生授权经销商', inboundDate: '2026-09-10', status: 'PENDING', acceptor: '', ...AUDIT('2026-09-10T09:30:00', '2026-09-10T09:30:00') },
  { id: 'FAI6', code: 'RK2026006', assetId: 'A07', quantity: 2, unit: '台', purchasePrice: 85000, supplier: '格力商用空调', inboundDate: '2026-08-12', status: 'STORED', acceptor: '王五', ...AUDIT('2026-08-12T14:00:00', '2026-08-12T17:00:00') },
  { id: 'FAI7', code: 'RK2026007', assetId: 'A10', quantity: 4, unit: '台', purchasePrice: 42000, supplier: '图腾机柜直销', inboundDate: '2026-09-12', status: 'ACCEPTED', acceptor: '张三', ...AUDIT('2026-09-12T09:00:00', '2026-09-12T14:20:00') }
]

const SEED_DISPATCH = [
  { id: 'FAD1', code: 'PF2026001', assetId: 'A01', deptId: 'D2', userId: 'U3', dispatchDate: '2026-09-02', location: '财务部办公室', status: 'DISPATCHED', operator: '张三', ...AUDIT('2026-09-02T09:00:00', '2026-09-02T10:30:00') },
  { id: 'FAD2', code: 'PF2026002', assetId: 'A03', deptId: 'D3', userId: 'U4', dispatchDate: '2026-09-06', location: '行政部打印区', status: 'DISPATCHED', operator: '李四', ...AUDIT('2026-09-06T09:30:00', '2026-09-06T11:00:00') },
  { id: 'FAD3', code: 'PF2026003', assetId: 'A08', deptId: 'D13', userId: 'U15', dispatchDate: '2026-08-15', location: '物资采购部', status: 'RETURNED', operator: '王五', ...AUDIT('2026-08-15T14:00:00', '2026-08-20T09:00:00') }
]

const SEED_BORROW = [
  { id: 'FAB1', code: 'JC2026001', assetId: 'A01', userId: 'U6', deptId: 'D5', borrowDate: '2026-09-10', expectedReturnDate: '2026-09-20', actualReturnDate: '', status: 'BORROWED', ...AUDIT('2026-09-10T09:00:00', '2026-09-10T09:00:00') },
  { id: 'FAB2', code: 'JC2026002', assetId: 'A04', userId: 'U12', deptId: 'D10', borrowDate: '2026-08-25', expectedReturnDate: '2026-09-05', actualReturnDate: '', status: 'OVERDUE', ...AUDIT('2026-08-25T10:00:00', '2026-09-05T10:00:00') },
  { id: 'FAB3', code: 'JC2026003', assetId: 'A03', userId: 'U11', deptId: 'D9', borrowDate: '2026-09-01', expectedReturnDate: '2026-09-10', actualReturnDate: '2026-09-09', status: 'RETURNED', ...AUDIT('2026-09-01T11:00:00', '2026-09-09T16:00:00') }
]

const SEED_CHANGE = [
  { id: 'FAC1', code: 'BG2026001', assetId: 'A01', changeType: 'TRANSFER', changeReason: '从技术部调拨至市场部', changeDate: '2026-09-12', operator: '张三', ...AUDIT('2026-09-12T09:00:00', '2026-09-12T15:00:00') },
  { id: 'FAC2', code: 'BG2026002', assetId: 'A03', changeType: 'REPAIR', changeReason: '打印机卡纸故障，送修', changeDate: '2026-09-08', operator: '李四', ...AUDIT('2026-09-08T10:00:00', '2026-09-08T17:00:00') }
]

const SEED_DISPOSE = [
  { id: 'FAX1', code: 'CZ2026001', assetId: 'A11', disposeType: 'SCRAP', disposeReason: '使用超过5年，性能落后', residualValue: 500, disposeDate: '2026-08-20', status: 'DONE', ...AUDIT('2026-08-20T09:00:00', '2026-08-25T16:00:00') },
  { id: 'FAX2', code: 'CZ2026002', assetId: 'A08', disposeType: 'SALE', disposeReason: '办公区改造，旧家具处理', residualValue: 200, disposeDate: '2026-09-01', status: 'DONE', ...AUDIT('2026-09-01T09:00:00', '2026-09-03T11:00:00') }
]

// ---------------------------------------------------------------- 盘点（明细生成器，原在视图内）
const EMP_POOL = [
  { userId: 'U2', name: '张伟', deptId: 'D1', phone: '13800000002' },
  { userId: 'U3', name: '李娜', deptId: 'D2', phone: '13800000003' },
  { userId: 'U4', name: '王强', deptId: 'D3', phone: '13800000004' },
  { userId: 'U5', name: '刘洋', deptId: 'D4', phone: '13800000005' },
  { userId: 'U8', name: '冯涛', deptId: 'D7', phone: '13800000008' },
  { userId: 'U9', name: '高翔', deptId: 'D102', phone: '13800000009' },
  { userId: 'U10', name: '周静', deptId: 'D8', phone: '13800000010' },
  { userId: 'U13', name: '陈静', deptId: 'D11', phone: '13800000013' }
]

const ASSET_REF_POOL = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11', 'A12', 'A13']
const ASSET_STATUS_POOL = ['IDLE', 'IN_USE', 'REPAIRING', 'BORROWED', 'DISPATCHING']
const LOCATION_POOL = ['总部办公楼1层', '总部办公楼2层', '总部办公楼3层', '仓库A区', '仓库B区', '数据中心机房']

function pad2(n) { return String(n).padStart(2, '0') }

function buildCheckItems(total, counted, seed) {
  const items = []
  for (let i = 0; i < total; i++) {
    const assetId = ASSET_REF_POOL[(i + seed) % ASSET_REF_POOL.length]
    const emp = EMP_POOL[(i + seed) % EMP_POOL.length]
    let itemStatus = 'UNCHECKED'
    let remark = ''
    let checker = null
    let checkTime = ''

    if (i < counted) {
      itemStatus = 'CHECKED'
      remark = '账实相符'
      checker = emp.userId
      checkTime = `2026-09-${pad2(10 + (i % 8))}T${pad2(9 + (i % 8))}:${pad2((i * 7) % 60)}:00`
    } else if (i === counted && seed % 3 === 1) {
      itemStatus = 'LOSS'
      remark = '现场未找到实物，待核销'
      checker = emp.userId
      checkTime = `2026-09-${pad2(12 + (i % 6))}T15:30:00`
    } else if (i === counted && seed % 3 === 2) {
      itemStatus = 'ABNORMAL'
      remark = '编号标签破损，待补贴标签'
      checker = emp.userId
      checkTime = `2026-09-${pad2(12 + (i % 6))}T16:10:00`
    }

    const asset = SEED_ASSETS.find(a => a.id === assetId)
    items.push({
      assetId,
      // 盘点明细保留资产快照，便于单据脱离主数据后仍可追溯
      assetNo: asset ? asset.code : '',
      assetName: asset ? asset.name : '',
      assetStatus: asset ? asset.status : ASSET_STATUS_POOL[(i + seed) % ASSET_STATUS_POOL.length],
      location: LOCATION_POOL[(i + seed) % LOCATION_POOL.length],
      itemStatus,
      remark,
      checker,
      createTime: `2026-09-0${(seed % 8) + 1}T10:00:00`,
      checkTime
    })
  }
  return items
}

function buildCounters(n, doneCount, seed) {
  const list = []
  for (let i = 0; i < n; i++) {
    const e = EMP_POOL[(i + seed) % EMP_POOL.length]
    const assigned = 4 + (seed % 3)
    list.push({
      userId: e.userId,
      name: e.name,
      deptId: e.deptId,
      phone: e.phone,
      assigned,
      done: i < doneCount ? assigned : 0,
      status: i < doneCount ? 'DONE' : 'COUNTING'
    })
  }
  return list
}

const SEED_INVENTORY_DOCS = [
  { id: 'IV1', docNo: 'PD202609001', name: '2026年三季度全面盘点', companyId: 'C1', applicant: '张伟', scope: '全部资产', assetTypes: [], createTime: '2026-09-01T09:00:00', finishTime: '', remark: '季度例行全面盘点', status: 'PROCESSING', items: buildCheckItems(24, 9, 1), counters: buildCounters(8, 0, 1), ...AUDIT('2026-09-01T09:00:00', '2026-09-18T10:22:31') },
  { id: 'IV2', docNo: 'PD202608002', name: '车辆资产专项盘点', companyId: 'C2', applicant: '李娜', scope: '按资产类型', assetTypes: ['VEHICLE'], createTime: '2026-08-12T10:20:00', finishTime: '', remark: '车辆专项核查', status: 'PROCESSING', items: buildCheckItems(6, 6, 2), counters: buildCounters(3, 2, 2), ...AUDIT('2026-08-12T10:20:00', '2026-09-12T14:51:29') },
  { id: 'IV3', docNo: 'PD202607003', name: '2026年二季度全面盘点', companyId: 'C1', applicant: '王强', scope: '全部资产', assetTypes: [], createTime: '2026-07-02T09:30:00', finishTime: '2026-07-20T16:40:00', remark: '账实核对完成', status: 'DONE', items: buildCheckItems(30, 30, 3), counters: buildCounters(8, 8, 3), ...AUDIT('2026-07-02T09:30:00', '2026-07-20T16:40:00') },
  { id: 'IV4', docNo: 'PD202606004', name: '仓库资产抽盘', companyId: 'C3', applicant: '刘洋', scope: '按存放地点', assetTypes: [], createTime: '2026-06-15T14:00:00', finishTime: '2026-06-25T11:20:00', remark: '仓库抽样盘点', status: 'DONE', items: buildCheckItems(12, 12, 4), counters: buildCounters(4, 4, 4), ...AUDIT('2026-06-15T14:00:00', '2026-06-25T11:20:00') },
  { id: 'IV5', docNo: 'PD202605005', name: '电子设备年度盘点', companyId: 'C4', applicant: '高翔', scope: '按资产类型', assetTypes: ['ELECTRONIC'], createTime: '2026-05-08T09:10:00', finishTime: '', remark: '年度电子设备核查', status: 'PROCESSING', items: buildCheckItems(18, 3, 5), counters: buildCounters(5, 1, 5), ...AUDIT('2026-05-08T09:10:00', '2026-09-05T13:26:47') }
]

const SEED_INVENTORY_PLANS = [
  { id: 'IP1', planNo: 'PDJH2026001', planName: '2026年三季度全面盘点计划', scope: '全部资产', counter: '张伟', planDate: '2026-09-01', status: 'PROCESSING', items: buildCheckItems(24, 9, 1), ...AUDIT('2026-08-25T09:00:00', '2026-09-01T09:00:00') },
  { id: 'IP2', planNo: 'PDJH2026002', planName: '2026年四季度抽盘计划', scope: '按存放地点', counter: '周静', planDate: '2026-12-01', status: 'DRAFT', items: buildCheckItems(12, 0, 6), ...AUDIT('2026-09-20T10:00:00', '2026-09-20T10:00:00') }
]

const SEED_DEPRECIATION_SCHEMES = [
  { id: 'DS1', schemeNo: 'ZJFA001', schemeName: '电子设备折旧方案', method: 'STRAIGHT_LINE', years: 5, residualRate: 5, monthlyRate: 1.58, applicableCategory: 'ELECTRONIC', enabled: true, ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
  { id: 'DS2', schemeNo: 'ZJFA002', schemeName: '机械设备折旧方案', method: 'STRAIGHT_LINE', years: 10, residualRate: 5, monthlyRate: 0.79, applicableCategory: 'MACHINE', enabled: true, ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
  { id: 'DS3', schemeNo: 'ZJFA003', schemeName: '运输设备折旧方案', method: 'DOUBLE_DECLINE', years: 8, residualRate: 5, monthlyRate: 2.08, applicableCategory: 'VEHICLE', enabled: true, ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
  { id: 'DS4', schemeNo: 'ZJFA004', schemeName: '房屋建筑物折旧方案', method: 'STRAIGHT_LINE', years: 30, residualRate: 3, monthlyRate: 0.27, applicableCategory: 'BUILDING', enabled: false, ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') }
]

const SEED_DEPRECIATION_REPORTS = [
  { id: 'DR1', period: '2026-08', openingValue: 12864500, periodDepreciation: 86420, accumulated: 3126800, closingNet: 9737700, assetCount: 42, operator: '李娜', runDate: '2026-09-01T02:00:00', ...AUDIT('2026-09-01T02:00:00', '2026-09-01T02:05:00') },
  { id: 'DR2', period: '2026-07', openingValue: 12950920, periodDepreciation: 86420, accumulated: 3040380, closingNet: 9910540, assetCount: 42, operator: '李娜', runDate: '2026-08-01T02:00:00', ...AUDIT('2026-08-01T02:00:00', '2026-08-01T02:06:00') }
]

// ---------------------------------------------------------------- 六类单据列表（原 DOT_SEED 构造器）
const DOC_STATUS_POOL = ['DONE', 'PROCESSING', 'DRAFT', 'REJECTED', 'REVOKED']
const DOC_NOTE_POOL = ['按季度例行办理', '需资产管理员现场复核', '已完成实物验收', '等待财务确认金额', '附现场照片存档']
const COMPANY_POOL = ['C1', 'C2', 'C3', 'C4']

function buildDocs(prefix, count, names) {
  const docs = []
  for (let i = 0; i < count; i++) {
    const status = DOC_STATUS_POOL[i % DOC_STATUS_POOL.length]
    docs.push({
      id: `${prefix}-${i + 1}`,
      code: `${prefix}2026${900 - i * 13}`,
      name: names[i % names.length],
      companyId: COMPANY_POOL[i % COMPANY_POOL.length],
      createTime: `2026-0${(i % 8) + 1}-${pad2(10 + i)}T09:${pad2((i * 7) % 60)}:00`,
      finishTime: status === 'DONE' ? `2026-0${(i % 8) + 1}-${pad2(15 + i)}T17:20:00` : '',
      remark: DOC_NOTE_POOL[i % DOC_NOTE_POOL.length],
      status
    })
  }
  return docs
}

const SEED_DOC_LISTS = {
  inbound: buildDocs('RK', 8, ['联想笔记本采购入库', '办公设备季度补充入库', '车辆采购入库验收', '打印耗材批量入库', '会议设备采购入库']),
  alloc: buildDocs('FP', 7, ['新员工入职设备分配', '市场部办公设备派发', '项目部现场设备派发', '财务部电脑更新派发']),
  back: buildDocs('TK', 6, ['员工离职设备退库', '项目结束设备退库', '部门调整资产退库']),
  transfer: buildDocs('DB', 6, ['总部调拨至分公司', '仓库间资产调拨', '跨区域调拨支援项目']),
  repair: buildDocs('WX', 6, ['打印机故障送修', '车辆年度维修保养', '空调机组检修']),
  dispose: buildDocs('CZ', 7, ['超期设备报废处置', '盘亏资产核销处置', '旧家具变卖处置'])
}

export const ASSET_SEEDS = {
  assets: SEED_ASSETS,
  inbound: SEED_INBOUND,
  dispatch: SEED_DISPATCH,
  borrow: SEED_BORROW,
  change: SEED_CHANGE,
  dispose: SEED_DISPOSE,
  inventoryPlans: SEED_INVENTORY_PLANS,
  inventoryDocs: SEED_INVENTORY_DOCS,
  depreciationSchemes: SEED_DEPRECIATION_SCHEMES,
  depreciationReports: SEED_DEPRECIATION_REPORTS,
  docLists: SEED_DOC_LISTS
}

export default ASSET_SEEDS
