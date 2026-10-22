// 低值资产种子数据（仅在 mock 模式下使用）
// 物品清单与类别来自参考原型：办公用品 / 水 / 劳保用品 / 纸品

const SEED_ITEMS = [
  { id: 'DZ01', code: 'DZ20260001', category: '办公用品', name: '得力7733优事贴', spec: '(76×76mm)4色装', unit: '包', price: 3.5, stock: 1, safetyStock: 10, location: '行政库房', status: '正常', updateTime: '2026-09-18 10:22:31' },
  { id: 'DZ02', code: 'DZ20260002', category: '办公用品', name: '得力9064标签贴', spec: '43*12mm箭头款', unit: '包', price: 3.5, stock: 1, safetyStock: 10, location: '行政库房', status: '正常', updateTime: '2026-09-18 10:25:12' },
  { id: 'DZ03', code: 'DZ20260003', category: '水', name: '农夫山泉饮用水(5L,4瓶/箱)', spec: '5L,4瓶/箱', unit: '箱', price: 42, stock: 20, safetyStock: 5, location: '行政库房', status: '正常', updateTime: '2026-09-17 15:40:08' },
  { id: 'DZ04', code: 'DZ20260004', category: '办公用品', name: '晨光ADM94897按钮文件袋', spec: 'A4透明文件袋', unit: '个', price: 1.5, stock: 37, safetyStock: 20, location: '行政库房', status: '正常', updateTime: '2026-09-17 09:15:44' },
  { id: 'DZ05', code: 'DZ20260005', category: '办公用品', name: '晨光AYZ97512A快干印台', spec: '透明圆 红', unit: '个', price: 4.5, stock: 2, safetyStock: 5, location: '行政库房', status: '正常', updateTime: '2026-09-16 14:22:08' },
  { id: 'DZ06', code: 'DZ20260006', category: '办公用品', name: '粉红色复印纸', spec: 'A4/210mm×297mm/70g/500张', unit: '包', price: 29, stock: 3, safetyStock: 10, location: '行政库房', status: '正常', updateTime: '2026-09-16 11:31:52' },
  { id: 'DZ07', code: 'DZ20260007', category: '劳保用品', name: '晨光ADM953948 A4纸塑料档案盒', spec: '7.5cm全新料 無味 A4文件盒资料盒 蓝（12个/份）', unit: '箱', price: 144, stock: 1, safetyStock: 3, location: '行政库房', status: '正常', updateTime: '2026-09-15 16:48:20' },
  { id: 'DZ08', code: 'DZ20260008', category: '纸品', name: '白色复印纸', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', price: 22, stock: 135, safetyStock: 30, location: '总部办公楼1层', status: '正常', updateTime: '2026-09-15 08:55:03' },
  { id: 'DZ09', code: 'DZ20260009', category: '办公用品', name: '无酸纸档案盒', spec: 'A4纸质大容量12CM（10个/包）', unit: '包', price: 45, stock: 1, safetyStock: 5, location: '行政库房', status: '正常', updateTime: '2026-09-14 13:26:47' }
]

const SEED_INBOUND = [
  { docNo: 'RK2026001', itemId: 'DZ08', itemName: '白色复印纸', category: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 200, price: 22, amount: 4400, supplier: '得力办公旗舰店', inboundDate: '2026-09-01', operator: '张三', remark: '年度集中采购' },
  { docNo: 'RK2026002', itemId: 'DZ03', itemName: '农夫山泉饮用水(5L,4瓶/箱)', category: '水', spec: '5L,4瓶/箱', unit: '箱', quantity: 30, price: 42, amount: 1260, supplier: '农夫山泉配送商', inboundDate: '2026-09-03', operator: '张三', remark: '' },
  { docNo: 'RK2026003', itemId: 'DZ04', itemName: '晨光ADM94897按钮文件袋', category: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 100, price: 1.5, amount: 150, supplier: '晨光文具官方店', inboundDate: '2026-09-05', operator: '李四', remark: '' },
  { docNo: 'RK2026004', itemId: 'DZ07', itemName: '晨光ADM953948 A4纸塑料档案盒', category: '劳保用品', spec: '7.5cm全新料 無味 A4文件盒资料盒 蓝（12个/份）', unit: '箱', quantity: 10, price: 144, amount: 1440, supplier: '晨光文具官方店', inboundDate: '2026-09-08', operator: '李四', remark: '档案室用' },
  { docNo: 'RK2026005', itemId: 'DZ06', itemName: '粉红色复印纸', category: '办公用品', spec: 'A4/210mm×297mm/70g/500张', unit: '包', quantity: 20, price: 29, amount: 580, supplier: '得力办公旗舰店', inboundDate: '2026-09-10', operator: '王五', remark: '' }
]

const SEED_REQUISITION = [
  { docNo: 'PY2026001', itemId: 'DZ08', itemName: '白色复印纸', category: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 50, price: 22, amount: 1100, receiver: '赵会计', dept: '财务部', requisitionDate: '2026-09-06', purpose: '日常办公', operator: '张三', remark: '' },
  { docNo: 'PY2026002', itemId: 'DZ03', itemName: '农夫山泉饮用水(5L,4瓶/箱)', category: '水', spec: '5L,4瓶/箱', unit: '箱', quantity: 10, price: 42, amount: 420, receiver: '钱助理', dept: '行政部', requisitionDate: '2026-09-09', purpose: '会议用水', operator: '张三', remark: '' },
  { docNo: 'PY2026003', itemId: 'DZ04', itemName: '晨光ADM94897按钮文件袋', category: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 63, price: 1.5, amount: 94.5, receiver: '孙主管', dept: '人事部', requisitionDate: '2026-09-11', purpose: '员工档案整理', operator: '李四', remark: '' },
  { docNo: 'PY2026004', itemId: 'DZ06', itemName: '粉红色复印纸', category: '办公用品', spec: 'A4/210mm×297mm/70g/500张', unit: '包', quantity: 17, price: 29, amount: 493, receiver: '周经理', dept: '市场部', requisitionDate: '2026-09-12', purpose: '宣传物料打印', operator: '李四', remark: '' },
  { docNo: 'PY2026005', itemId: 'DZ07', itemName: '晨光ADM953948 A4纸塑料档案盒', category: '劳保用品', spec: '7.5cm全新料 無味 A4文件盒资料盒 蓝（12个/份）', unit: '箱', quantity: 9, price: 144, amount: 1296, receiver: '吴主任', dept: '办公室', requisitionDate: '2026-09-15', purpose: '档案归档', operator: '王五', remark: '' }
]

const SEED_RETURN = [
  { docNo: 'TK2026001', itemId: 'DZ08', itemName: '白色复印纸', category: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 15, price: 22, amount: 330, returner: '赵会计', dept: '财务部', returnDate: '2026-09-13', reason: '部门领用过量', operator: '张三', remark: '' },
  { docNo: 'TK2026002', itemId: 'DZ04', itemName: '晨光ADM94897按钮文件袋', category: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 7, price: 1.5, amount: 10.5, returner: '孙主管', dept: '人事部', returnDate: '2026-09-16', reason: '项目取消，退回剩余', operator: '李四', remark: '' }
]

const SEED_CATEGORIES = [
  { id: 'LVC01', code: 'BGYH', name: '办公用品', status: '启用', sort: 1, remark: '日常办公消耗品' },
  { id: 'LVC02', code: 'SHUI', name: '水', status: '启用', sort: 2, remark: '饮用水及饮品' },
  { id: 'LVC03', code: 'LBYH', name: '劳保用品', status: '启用', sort: 3, remark: '劳动防护用品' },
  { id: 'LVC04', code: 'ZHIP', name: '纸品', status: '启用', sort: 4, remark: '复印纸、打印纸等' }
]

const SEED_LOCATIONS = [
  { id: 'LVL01', code: 'XZKF', name: '行政库房', parentCode: '', parentName: '', manager: '张三', itemCount: 8, status: '启用' },
  { id: 'LVL02', code: 'ZBL1', name: '总部办公楼1层', parentCode: '', parentName: '', manager: '李四', itemCount: 1, status: '启用' },
  { id: 'LVL03', code: 'ZBL2', name: '总部办公楼2层', parentCode: '', parentName: '', manager: '王五', itemCount: 0, status: '启用' },
  { id: 'LVL04', code: 'CKAQ', name: '仓库A区', parentCode: '', parentName: '', manager: '赵敏', itemCount: 0, status: '启用' }
]

const SEED_APPROVAL_FLOWS = [
  { id: 'LVF01', name: '低值资产入库审批', businessType: '入库', steps: ['部门负责人审批', '行政部审核', '库管确认入库'], status: '启用' },
  { id: 'LVF02', name: '低值资产领用审批', businessType: '领用', steps: ['部门负责人审批', '行政部审核'], status: '启用' },
  { id: 'LVF03', name: '低值资产退库审批', businessType: '退库', steps: ['部门负责人审批', '库管验收'], status: '启用' }
]

export const LOW_VALUE_SEEDS = {
  items: SEED_ITEMS,
  inbound: SEED_INBOUND,
  requisition: SEED_REQUISITION,
  return: SEED_RETURN,
  categories: SEED_CATEGORIES,
  locations: SEED_LOCATIONS,
  approvalFlows: SEED_APPROVAL_FLOWS
}

export default LOW_VALUE_SEEDS
