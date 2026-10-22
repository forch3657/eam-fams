// 种子数据（从源项目 src/store/fixedAsset.js 迁移，仅在 mock 模式下使用）
const SEED_ASSETS = [
  { id: 'A01', code: 'GD20260001', name: '联想ThinkPad笔记本电脑', type: '电子设备', brand: '联想', model: 'ThinkPad T14', company: '华信科技集团有限公司', location: '总部办公楼2层', purchaseDate: '2026-03-12', amount: 8500, inboundDate: '2026-03-15', original: 8500, net: 7650, user: '张伟', dept: '技术部', status: '空闲', depreciate: true, purchaseMode: '购买', leaseMonths: 36, updateTime: '2026-09-18 10:22:31' },
  { id: 'A02', code: 'GD20260002', name: '戴尔OptiPlex台式电脑', type: '电子设备', brand: '戴尔', model: 'OptiPlex 7010', company: '华信科技集团有限公司', location: '总部办公楼3层', purchaseDate: '2026-02-20', amount: 6200, inboundDate: '2026-02-25', original: 6200, net: 5580, user: '李娜', dept: '财务部', status: '派发中', depreciate: true, purchaseMode: '购买', leaseMonths: 36, updateTime: '2026-09-17 15:40:12' },
  { id: 'A03', code: 'GD20260003', name: '惠普激光打印机', type: '电子设备', brand: '惠普', model: 'LaserJet M405', company: '云鼎资产管理有限公司', location: '总部办公楼1层', purchaseDate: '2025-11-08', amount: 3200, inboundDate: '2025-11-12', original: 3200, net: 2560, user: '王强', dept: '行政部', status: '借出中', depreciate: true, purchaseMode: '购买', leaseMonths: 24, updateTime: '2026-09-16 09:05:44' },
  { id: 'A04', code: 'GD20260004', name: '丰田考斯特商务车', type: '运输设备', brand: '丰田', model: '考斯特 20座', company: '中天建设集团有限公司', location: '车库', purchaseDate: '2025-06-18', amount: 385000, inboundDate: '2025-06-25', original: 385000, net: 320800, user: '赵敏', dept: '行政部', status: '维修中', depreciate: true, purchaseMode: '购买', leaseMonths: 60, updateTime: '2026-09-15 14:22:08' },
  { id: 'A05', code: 'GD20260005', name: '数控车床CK6140', type: '机械设备', brand: '沈阳机床', model: 'CK6140', company: '恒信融资租赁有限公司', location: '仓库A区', purchaseDate: '2024-09-10', amount: 268000, inboundDate: '2024-09-20', original: 268000, net: 214400, user: '陈刚', dept: '生产部', status: '处置中', depreciate: true, purchaseMode: '租赁', leaseMonths: 48, updateTime: '2026-09-14 11:31:52' },
  { id: 'A06', code: 'GD20260006', name: '华为会议平板', type: '电子设备', brand: '华为', model: 'IdeaHub S2', company: '华信科技集团有限公司', location: '总部办公楼3层', purchaseDate: '2026-04-02', amount: 26800, inboundDate: '2026-04-06', original: 26800, net: 25460, user: '刘洋', dept: '运营部', status: '空闲', depreciate: true, purchaseMode: '购买', leaseMonths: 36, updateTime: '2026-09-13 16:48:20' },
  { id: 'A07', code: 'GD20260007', name: '格力中央空调机组', type: '机械设备', brand: '格力', model: 'GMV-560', company: '云鼎资产管理有限公司', location: '数据中心机房', purchaseDate: '2025-03-15', amount: 158000, inboundDate: '2025-03-28', original: 158000, net: 132700, user: '孙磊', dept: '后勤部', status: '派发中', depreciate: true, purchaseMode: '自建', leaseMonths: 120, updateTime: '2026-09-12 08:55:03' },
  { id: 'A08', code: 'GD20260008', name: '实木会议桌', type: '办公家具', brand: '华丰', model: 'HF-B3200', company: '中天建设集团有限公司', location: '总部办公楼1层', purchaseDate: '2025-12-05', amount: 12800, inboundDate: '2025-12-10', original: 12800, net: 11520, user: '周静', dept: '行政部', status: '借出中', depreciate: true, purchaseMode: '购买', leaseMonths: 60, updateTime: '2026-09-11 13:26:47' },
  { id: 'A09', code: 'GD20260009', name: '人体工学办公椅', type: '办公家具', brand: '西昊', model: 'M57', company: '华信科技集团有限公司', location: '总部办公楼2层', purchaseDate: '2026-01-16', amount: 1580, inboundDate: '2026-01-20', original: 1580, net: 1420, user: '吴迪', dept: '技术部', status: '空闲', depreciate: true, purchaseMode: '购买', leaseMonths: 24, updateTime: '2026-09-10 10:12:35' },
  { id: 'A10', code: 'GD20260010', name: '服务器机柜', type: '电子设备', brand: '图腾', model: 'G2.6642', company: '恒信融资租赁有限公司', location: '数据中心机房', purchaseDate: '2024-11-22', amount: 42000, inboundDate: '2024-12-01', original: 42000, net: 33600, user: '郑凯', dept: '技术部', status: '维修中', depreciate: true, purchaseMode: '租赁', leaseMonths: 36, updateTime: '2026-09-09 17:04:11' },
  { id: 'A11', code: 'GD20260011', name: '合力3吨叉车', type: '机械设备', brand: '合力', model: 'CPCD30', company: '中天建设集团有限公司', location: '仓库B区', purchaseDate: '2025-08-08', amount: 96000, inboundDate: '2025-08-15', original: 96000, net: 84000, user: '冯涛', dept: '仓储部', status: '处置中', depreciate: true, purchaseMode: '购买', leaseMonths: 60, updateTime: '2026-09-08 09:38:56' },
  { id: 'A12', code: 'GD20260012', name: '爱普生投影仪', type: '电子设备', brand: '爱普生', model: 'CB-X06', company: '云鼎资产管理有限公司', location: '总部办公楼3层', purchaseDate: '2026-05-20', amount: 4600, inboundDate: '2026-05-24', original: 4600, net: 4370, user: '何欣', dept: '市场部', status: '空闲', depreciate: true, purchaseMode: '购买', leaseMonths: 36, updateTime: '2026-09-07 14:51:29' },
  { id: 'A13', code: 'GD20260013', name: '不间断电源UPS', type: '电子设备', brand: '山特', model: 'C3KS', company: '华信科技集团有限公司', location: '数据中心机房', purchaseDate: '2025-10-11', amount: 18600, inboundDate: '2025-10-18', original: 18600, net: 16120, user: '高翔', dept: '技术部', status: '派发中', depreciate: true, purchaseMode: '购买', leaseMonths: 48, updateTime: '2026-09-06 11:19:40' }
]

const SEED_INBOUND = [
  { assetNo: 'ZC2026001', name: '联想ThinkPad笔记本电脑', category: '设备', model: 'ThinkPad T14', quantity: 10, unit: '台', purchasePrice: 8500, supplier: '联想官方授权经销商', inboundDate: '2026-09-01', status: '已入库', acceptor: '张三' },
  { assetNo: 'ZC2026002', name: '惠普打印机', category: '设备', model: 'HP M428fdw', quantity: 5, unit: '台', purchasePrice: 3200, supplier: '惠普官方旗舰店', inboundDate: '2026-09-05', status: '已验收', acceptor: '李四' },
  { assetNo: 'ZC2026003', name: '办公桌', category: '办公用品', model: '1.4m实木', quantity: 20, unit: '张', purchasePrice: 1200, supplier: '宜家家居', inboundDate: '2026-09-08', status: '待验收', acceptor: '' },
  { assetNo: 'ZC2026004', name: '丰田凯美瑞轿车', category: '车辆', model: '2026款2.5G', quantity: 2, unit: '辆', purchasePrice: 180000, supplier: '广汽丰田4S店', inboundDate: '2026-08-20', status: '已入库', acceptor: '王五' },
  { assetNo: 'ZC2026005', name: 'A4复印纸', category: '材料', model: '70g 500张/包', quantity: 100, unit: '包', purchasePrice: 25, supplier: '得力办公', inboundDate: '2026-09-10', status: '待验收', acceptor: '' },
  { assetNo: 'ZC2024006', name: '会议室投影仪', category: '设备', model: 'Epson CB-X06', quantity: 3, unit: '台', purchasePrice: 6800, supplier: '爱普生授权经销商', inboundDate: '2024-03-15', status: '已入库', acceptor: '张三' },
  { assetNo: 'ZC2024008', name: '中央空调机组', category: '设备', model: '格力GMV-560', quantity: 2, unit: '台', purchasePrice: 85000, supplier: '格力商用空调', inboundDate: '2024-06-20', status: '已入库', acceptor: '王五' },
  { assetNo: 'ZC2025007', name: '别克GL8商务车', category: '车辆', model: '2025款2.0T', quantity: 1, unit: '辆', purchasePrice: 320000, supplier: '上汽通用别克4S店', inboundDate: '2025-01-10', status: '已入库', acceptor: '李四' }
]

const SEED_DISPATCH = [
  { dispatchNo: 'PF2026001', assetName: '联想ThinkPad笔记本电脑', assetNo: 'ZC2026001', department: '财务部', user: '赵会计', dispatchDate: '2026-09-02', location: '财务部办公室', status: '已派发', operator: '张三' },
  { dispatchNo: 'PF2026002', assetName: '惠普打印机', assetNo: 'ZC2026002', department: '行政部', user: '钱助理', dispatchDate: '2026-09-06', location: '行政部打印区', status: '已派发', operator: '李四' },
  { dispatchNo: 'PF2026003', assetName: '办公桌', assetNo: 'ZC2026003', department: '人事部', user: '孙主管', dispatchDate: '2026-08-15', location: '人事部办公室', status: '已退库', operator: '王五' }
]

const SEED_BORROW = [
  { borrowNo: 'JC2026001', assetName: '联想ThinkPad笔记本电脑', assetNo: 'ZC2026001', borrower: '周经理', department: '市场部', borrowDate: '2026-09-10', expectedReturnDate: '2026-09-20', actualReturnDate: '', status: '借出中' },
  { borrowNo: 'JC2026002', assetName: '丰田凯美瑞轿车', assetNo: 'ZC2026004', borrower: '吴主任', department: '办公室', borrowDate: '2026-08-25', expectedReturnDate: '2026-09-05', actualReturnDate: '', status: '逾期' },
  { borrowNo: 'JC2026003', assetName: '惠普打印机', assetNo: 'ZC2026002', borrower: '郑员工', department: '技术部', borrowDate: '2026-09-01', expectedReturnDate: '2026-09-10', actualReturnDate: '2026-09-09', status: '已归还' }
]

const SEED_CHANGE = [
  { changeNo: 'BG2026001', assetName: '联想ThinkPad笔记本电脑', assetNo: 'ZC2026001', changeType: '调拨', changeReason: '从技术部调拨至市场部', changeDate: '2026-09-12', operator: '张三' },
  { changeNo: 'BG2026002', assetName: '惠普打印机', assetNo: 'ZC2026002', changeType: '维修', changeReason: '打印机卡纸故障，送修', changeDate: '2026-09-08', operator: '李四' }
]

const SEED_DISPOSE = [
  { disposeNo: 'CZ2026001', assetName: '旧款联想台式机', assetNo: 'ZC2024010', disposeType: '报废', disposeReason: '使用超过5年，性能落后', residualValue: 500, disposeDate: '2026-08-20', status: '已完成' },
  { disposeNo: 'CZ2026002', assetName: '旧办公桌', assetNo: 'ZC2023005', disposeType: '变卖', disposeReason: '办公区改造，旧家具处理', residualValue: 200, disposeDate: '2026-09-01', status: '已完成' }
]

export const ASSET_SEEDS = {
  assets: SEED_ASSETS,
  inbound: SEED_INBOUND,
  dispatch: SEED_DISPATCH,
  borrow: SEED_BORROW,
  change: SEED_CHANGE,
  dispose: SEED_DISPOSE
}

export default ASSET_SEEDS
