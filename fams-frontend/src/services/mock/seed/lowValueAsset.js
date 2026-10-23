// 低值资产种子数据（仅在 mock 模式下使用）
// 语义约定：物品类别引用 categoryId、领用/退库部门引用 deptId；状态存枚举编码；时间存 ISO 8601

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

const SEED_CATEGORIES = [
  { id: 'LVC01', code: 'BGYH', name: '办公用品', status: 'ENABLED', sort: 1, remark: '日常办公消耗品', ...AUDIT('2026-01-06T09:00:00', '2026-09-12T14:30:21') },
  { id: 'LVC02', code: 'SHUI', name: '水', status: 'ENABLED', sort: 2, remark: '饮用水及饮品', ...AUDIT('2026-01-06T09:05:00', '2026-09-10T11:05:33') },
  { id: 'LVC03', code: 'LBYH', name: '劳保用品', status: 'ENABLED', sort: 3, remark: '劳动防护用品', ...AUDIT('2026-01-06T09:10:00', '2026-09-08T16:41:02') },
  { id: 'LVC04', code: 'ZHIP', name: '纸品', status: 'ENABLED', sort: 4, remark: '复印纸、打印纸等', ...AUDIT('2026-01-06T09:15:00', '2026-09-07T10:22:45') }
]

const SEED_LOCATIONS = [
  { id: 'LVL01', code: 'XZKF', name: '行政库房', parentCode: '', manager: '张三', itemCount: 8, status: 'ENABLED', ...AUDIT('2026-01-06T09:20:00', '2026-09-06T08:41:57') },
  { id: 'LVL02', code: 'ZBL1', name: '总部办公楼1层', parentCode: '', manager: '李四', itemCount: 1, status: 'ENABLED', ...AUDIT('2026-01-06T09:25:00', '2026-09-05T15:38:27') },
  { id: 'LVL03', code: 'ZBL2', name: '总部办公楼2层', parentCode: '', manager: '王五', itemCount: 0, status: 'ENABLED', ...AUDIT('2026-01-06T09:30:00', '2026-09-04T10:11:52') },
  { id: 'LVL04', code: 'CKAQ', name: '仓库A区', parentCode: '', manager: '赵敏', itemCount: 0, status: 'ENABLED', ...AUDIT('2026-01-06T09:35:00', '2026-09-03T14:02:09') },
  // 子位置示例：体现位置层级（parentCode 指向上级位置编码）
  { id: 'LVL05', code: 'XZKF-A', name: '行政库房·A架', parentCode: 'XZKF', parentName: '行政库房', manager: '张三', itemCount: 0, status: 'ENABLED', ...AUDIT('2026-02-11T09:40:00', '2026-09-02T11:20:00') }
]

const SEED_ITEMS = [
  { id: 'DZ01', code: 'DZ20260001', categoryId: 'LVC01', name: '得力7733优事贴', spec: '(76×76mm)4色装', unit: '包', price: 3.5, stock: 1, safetyStock: 10, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:00:00', '2026-09-18T10:22:31') },
  { id: 'DZ02', code: 'DZ20260002', categoryId: 'LVC01', name: '得力9064标签贴', spec: '43*12mm箭头款', unit: '包', price: 3.5, stock: 1, safetyStock: 10, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:05:00', '2026-09-18T10:25:12') },
  { id: 'DZ03', code: 'DZ20260003', categoryId: 'LVC02', name: '农夫山泉饮用水(5L,4瓶/箱)', spec: '5L,4瓶/箱', unit: '箱', price: 42, stock: 20, safetyStock: 5, location: '行政库房', status: 'NORMAL', ...AUDIT('2026-01-06T10:10:00', '2026-09-17T15:40:08') },
  { id: 'DZ04', code: 'DZ20260004', categoryId: 'LVC01', name: '晨光ADM94897按钮文件袋', spec: 'A4透明文件袋', unit: '个', price: 1.5, stock: 37, safetyStock: 20, location: '行政库房', status: 'NORMAL', ...AUDIT('2026-01-06T10:15:00', '2026-09-17T09:15:44') },
  { id: 'DZ05', code: 'DZ20260005', categoryId: 'LVC01', name: '晨光AYZ97512A快干印台', spec: '透明圆 红', unit: '个', price: 4.5, stock: 2, safetyStock: 5, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:20:00', '2026-09-16T14:22:08') },
  { id: 'DZ06', code: 'DZ20260006', categoryId: 'LVC01', name: '粉红色复印纸', spec: 'A4/210mm×297mm/70g/500张', unit: '包', price: 29, stock: 3, safetyStock: 10, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:25:00', '2026-09-16T11:31:52') },
  { id: 'DZ07', code: 'DZ20260007', categoryId: 'LVC03', name: '晨光ADM953948 A4纸塑料档案盒', spec: '7.5cm全新料 A4文件盒资料盒 蓝（12个/份）', unit: '箱', price: 144, stock: 1, safetyStock: 3, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:30:00', '2026-09-15T16:48:20') },
  { id: 'DZ08', code: 'DZ20260008', categoryId: 'LVC04', name: '白色复印纸', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', price: 22, stock: 135, safetyStock: 30, location: '总部办公楼1层', status: 'NORMAL', ...AUDIT('2026-01-06T10:35:00', '2026-09-15T08:55:03') },
  { id: 'DZ09', code: 'DZ20260009', categoryId: 'LVC01', name: '无酸纸档案盒', spec: 'A4纸质大容量12CM（10个/包）', unit: '包', price: 45, stock: 1, safetyStock: 5, location: '行政库房', status: 'LOW_STOCK', ...AUDIT('2026-01-06T10:40:00', '2026-09-14T13:26:47') }
]

const SEED_INBOUND = [
  { id: 'LVI1', docNo: 'RK2026001', itemId: 'DZ08', categoryId: 'LVC04', itemName: '白色复印纸', categoryName: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 200, price: 22, amount: 4400, supplier: '得力办公旗舰店', inboundDate: '2026-09-01', deptId: 'D3', operator: '张三', remark: '年度集中采购', ...AUDIT('2026-09-01T09:00:00', '2026-09-01T17:20:00') },
  { id: 'LVI2', docNo: 'RK2026002', itemId: 'DZ03', categoryId: 'LVC02', itemName: '农夫山泉饮用水(5L,4瓶/箱)', categoryName: '水', spec: '5L,4瓶/箱', unit: '箱', quantity: 30, price: 42, amount: 1260, supplier: '农夫山泉配送商', inboundDate: '2026-09-03', deptId: 'D3', operator: '张三', remark: '', ...AUDIT('2026-09-03T09:10:00', '2026-09-03T16:30:00') },
  { id: 'LVI3', docNo: 'RK2026003', itemId: 'DZ04', categoryId: 'LVC01', itemName: '晨光ADM94897按钮文件袋', categoryName: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 100, price: 1.5, amount: 150, supplier: '晨光文具官方店', inboundDate: '2026-09-05', deptId: 'D3', operator: '李四', remark: '', ...AUDIT('2026-09-05T10:00:00', '2026-09-05T15:00:00') },
  { id: 'LVI4', docNo: 'RK2026004', itemId: 'DZ07', categoryId: 'LVC03', itemName: '晨光ADM953948 A4纸塑料档案盒', categoryName: '劳保用品', spec: '7.5cm全新料 A4文件盒资料盒 蓝（12个/份）', unit: '箱', quantity: 10, price: 144, amount: 1440, supplier: '晨光文具官方店', inboundDate: '2026-09-08', deptId: 'D3', operator: '李四', remark: '档案室用', ...AUDIT('2026-09-08T11:00:00', '2026-09-08T17:00:00') },
  { id: 'LVI5', docNo: 'RK2026005', itemId: 'DZ06', categoryId: 'LVC01', itemName: '粉红色复印纸', categoryName: '办公用品', spec: 'A4/210mm×297mm/70g/500张', unit: '包', quantity: 20, price: 29, amount: 580, supplier: '得力办公旗舰店', inboundDate: '2026-09-10', deptId: 'D3', operator: '王五', remark: '', ...AUDIT('2026-09-10T09:30:00', '2026-09-10T14:20:00') }
]

const SEED_REQUISITION = [
  { id: 'LVR1', docNo: 'PY2026001', itemId: 'DZ08', categoryId: 'LVC04', itemName: '白色复印纸', categoryName: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 50, price: 22, amount: 1100, receiver: '李娜', deptId: 'D2', requisitionDate: '2026-09-06', purpose: '日常办公', operator: '张三', remark: '', ...AUDIT('2026-09-06T09:00:00', '2026-09-06T10:30:00') },
  { id: 'LVR2', docNo: 'PY2026002', itemId: 'DZ03', categoryId: 'LVC02', itemName: '农夫山泉饮用水(5L,4瓶/箱)', categoryName: '水', spec: '5L,4瓶/箱', unit: '箱', quantity: 10, price: 42, amount: 420, receiver: '王强', deptId: 'D3', requisitionDate: '2026-09-09', purpose: '会议用水', operator: '张三', remark: '', ...AUDIT('2026-09-09T09:30:00', '2026-09-09T11:00:00') },
  { id: 'LVR3', docNo: 'PY2026003', itemId: 'DZ04', categoryId: 'LVC01', itemName: '晨光ADM94897按钮文件袋', categoryName: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 63, price: 1.5, amount: 94.5, receiver: '王强', deptId: 'D3', requisitionDate: '2026-09-11', purpose: '员工档案整理', operator: '李四', remark: '', ...AUDIT('2026-09-11T14:00:00', '2026-09-11T15:40:00') },
  { id: 'LVR4', docNo: 'PY2026004', itemId: 'DZ06', categoryId: 'LVC01', itemName: '粉红色复印纸', categoryName: '办公用品', spec: 'A4/210mm×297mm/70g/500张', unit: '包', quantity: 17, price: 29, amount: 493, receiver: '何欣', deptId: 'D5', requisitionDate: '2026-09-12', purpose: '宣传物料打印', operator: '李四', remark: '', ...AUDIT('2026-09-12T09:00:00', '2026-09-12T16:20:00') },
  { id: 'LVR5', docNo: 'PY2026005', itemId: 'DZ07', categoryId: 'LVC03', itemName: '晨光ADM953948 A4纸塑料档案盒', categoryName: '劳保用品', spec: '7.5cm全新料 A4文件盒资料盒 蓝（12个/份）', unit: '箱', quantity: 9, price: 144, amount: 1296, receiver: '周芳', deptId: 'D13', requisitionDate: '2026-09-15', purpose: '档案归档', operator: '王五', remark: '', ...AUDIT('2026-09-15T10:00:00', '2026-09-15T17:00:00') }
]

const SEED_RETURN = [
  { id: 'LVT1', docNo: 'TK2026001', itemId: 'DZ08', categoryId: 'LVC04', itemName: '白色复印纸', categoryName: '纸品', spec: '白色A4/210mm×297mm/70g/500张/70G', unit: '包', quantity: 15, price: 22, amount: 330, returner: '李娜', deptId: 'D2', returnDate: '2026-09-13', reason: '部门领用过量', operator: '张三', remark: '', ...AUDIT('2026-09-13T09:00:00', '2026-09-13T11:30:00') },
  { id: 'LVT2', docNo: 'TK2026002', itemId: 'DZ04', categoryId: 'LVC01', itemName: '晨光ADM94897按钮文件袋', categoryName: '办公用品', spec: 'A4透明文件袋', unit: '个', quantity: 7, price: 1.5, amount: 10.5, returner: '王强', deptId: 'D3', returnDate: '2026-09-16', reason: '项目取消，退回剩余', operator: '李四', remark: '', ...AUDIT('2026-09-16T14:00:00', '2026-09-16T16:10:00') }
]

export const LOW_VALUE_SEEDS = {
  // 台账补默认占用量（reserved）：审批中领用单占用的数量
  items: SEED_ITEMS.map(i => ({ reserved: 0, ...i })),
  // 历史单据一律视为"已完结"：即已生效并已计入库存与统计
  inbound: SEED_INBOUND.map(r => ({ status: 'DONE', ...r })),
  requisition: SEED_REQUISITION.map(r => ({ status: 'DONE', ...r })),
  return: SEED_RETURN.map(r => ({ status: 'DONE', ...r })),
  categories: SEED_CATEGORIES,
  locations: SEED_LOCATIONS
}

export default LOW_VALUE_SEEDS
