// 固定资产「资产报表」相关种子（原内联在 FixedAssetReports.vue）
// 语义约定：资产引用 assetId、公司引用 companyId、分类存枚举编码；时间存 ISO 8601

const AUDIT = (createTime, updateTime) => ({ createTime, updateTime, version: 1 })

const SEED_DEPRECIATION_DETAILS = [
  { id: 'RDD1', assetId: 'A01', name: '联想ThinkPad笔记本电脑', originalValue: 8500, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 36, accumulatedDepreciation: 850, netValue: 7650, depreciationRate: 1.58, purchaseDate: '2026-03-12', ...AUDIT('2026-03-15T09:00:00', '2026-09-18T10:22:31') },
  { id: 'RDD2', assetId: 'A02', name: '戴尔OptiPlex台式电脑', originalValue: 6200, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 36, accumulatedDepreciation: 620, netValue: 5580, depreciationRate: 1.58, purchaseDate: '2026-02-20', ...AUDIT('2026-02-25T09:30:00', '2026-09-17T15:40:12') },
  { id: 'RDD3', assetId: 'A03', name: '惠普激光打印机', originalValue: 3200, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 24, accumulatedDepreciation: 640, netValue: 2560, depreciationRate: 2.08, purchaseDate: '2025-11-08', ...AUDIT('2025-11-12T10:00:00', '2026-09-16T09:05:44') },
  { id: 'RDD4', assetId: 'A04', name: '丰田考斯特商务车', originalValue: 385000, depreciationMethod: 'DOUBLE_DECLINE', usefulLife: 60, accumulatedDepreciation: 64200, netValue: 320800, depreciationRate: 3.33, purchaseDate: '2025-06-18', ...AUDIT('2025-06-25T11:00:00', '2026-09-15T14:22:08') },
  { id: 'RDD5', assetId: 'A05', name: '数控车床CK6140', originalValue: 268000, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 48, accumulatedDepreciation: 53600, netValue: 214400, depreciationRate: 1.98, purchaseDate: '2024-09-10', ...AUDIT('2024-09-20T14:00:00', '2026-09-14T11:31:52') },
  { id: 'RDD6', assetId: 'A07', name: '格力中央空调机组', originalValue: 158000, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 120, accumulatedDepreciation: 25300, netValue: 132700, depreciationRate: 0.79, purchaseDate: '2025-03-15', ...AUDIT('2025-03-28T15:10:00', '2026-09-13T16:48:20') },
  { id: 'RDD7', assetId: 'A10', name: '服务器机柜', originalValue: 42000, depreciationMethod: 'STRAIGHT_LINE', usefulLife: 36, accumulatedDepreciation: 8400, netValue: 33600, depreciationRate: 1.58, purchaseDate: '2024-11-22', ...AUDIT('2024-12-01T09:50:00', '2026-09-12T08:55:03') }
]

const SEED_DEPRECIATION_PLAN_DETAILS = [
  { id: 'RPD01', planName: '华信科技-电子设备月折旧', assetId: 'A01', assetName: '联想ThinkPad笔记本电脑', assetType: 'ELECTRONIC', companyId: 'C1', original: 8500, residualRate: 5, totalLife: 36, usedLife: 6, depDate: '2026-09-01', finished: false, ...AUDIT('2026-09-01T02:00:00', '2026-09-01T02:05:00') },
  { id: 'RPD02', planName: '华信科技-电子设备月折旧', assetId: 'A02', assetName: '戴尔OptiPlex台式电脑', assetType: 'ELECTRONIC', companyId: 'C1', original: 6200, residualRate: 5, totalLife: 36, usedLife: 7, depDate: '2026-09-01', finished: false, ...AUDIT('2026-09-01T02:00:00', '2026-09-01T02:05:00') },
  { id: 'RPD03', planName: '华信科技-电子设备月折旧', assetId: 'A06', assetName: '华为会议平板', assetType: 'ELECTRONIC', companyId: 'C1', original: 26800, residualRate: 5, totalLife: 36, usedLife: 5, depDate: '2026-09-01', finished: false, ...AUDIT('2026-09-01T02:00:00', '2026-09-01T02:05:00') },
  { id: 'RPD04', planName: '华信科技-机械设备月折旧', assetId: 'A05', assetName: '数控车床CK6140', assetType: 'MACHINE', companyId: 'C1', original: 268000, residualRate: 5, totalLife: 48, usedLife: 24, depDate: '2026-09-01', finished: false, ...AUDIT('2026-09-01T02:00:00', '2026-09-01T02:05:00') },
  { id: 'RPD05', planName: '华信科技-办公家具季折旧', assetId: 'A09', assetName: '人体工学办公椅', assetType: 'FURNITURE', companyId: 'C1', original: 1580, residualRate: 5, totalLife: 24, usedLife: 8, depDate: '2026-07-01', finished: false, ...AUDIT('2026-07-01T02:00:00', '2026-07-01T02:05:00') },
  { id: 'RPD06', planName: '华信科技-房屋建筑年折旧', assetId: 'A13', assetName: '不间断电源UPS', assetType: 'ELECTRONIC', companyId: 'C1', original: 18600, residualRate: 5, totalLife: 48, usedLife: 11, depDate: '2026-01-01', finished: true, ...AUDIT('2026-01-01T02:00:00', '2026-01-01T02:05:00') },
  { id: 'RPD07', planName: '云鼎资产-电子设备月折旧', assetId: 'A03', assetName: '惠普激光打印机', assetType: 'ELECTRONIC', companyId: 'C2', original: 3200, residualRate: 5, totalLife: 24, usedLife: 10, depDate: '2026-09-05', finished: false, ...AUDIT('2026-09-05T02:00:00', '2026-09-05T02:05:00') },
  { id: 'RPD08', planName: '云鼎资产-电子设备月折旧', assetId: 'A12', assetName: '爱普生投影仪', assetType: 'ELECTRONIC', companyId: 'C2', original: 4600, residualRate: 5, totalLife: 36, usedLife: 4, depDate: '2026-09-05', finished: false, ...AUDIT('2026-09-05T02:00:00', '2026-09-05T02:05:00') },
  { id: 'RPD09', planName: '云鼎资产-机械设备月折旧', assetId: 'A07', assetName: '格力中央空调机组', assetType: 'MACHINE', companyId: 'C2', original: 158000, residualRate: 5, totalLife: 120, usedLife: 18, depDate: '2026-09-05', finished: false, ...AUDIT('2026-09-05T02:00:00', '2026-09-05T02:05:00') },
  { id: 'RPD10', planName: '恒信租赁-运输设备月折旧', assetId: 'A04', assetName: '丰田考斯特商务车', assetType: 'VEHICLE', companyId: 'C3', original: 385000, residualRate: 5, totalLife: 60, usedLife: 15, depDate: '2026-09-10', finished: false, ...AUDIT('2026-09-10T02:00:00', '2026-09-10T02:05:00') },
  { id: 'RPD11', planName: '恒信租赁-电子设备月折旧', assetId: 'A10', assetName: '服务器机柜', assetType: 'ELECTRONIC', companyId: 'C3', original: 42000, residualRate: 5, totalLife: 36, usedLife: 22, depDate: '2026-09-10', finished: false, ...AUDIT('2026-09-10T02:00:00', '2026-09-10T02:05:00') },
  { id: 'RPD12', planName: '中天建设-机械设备月折旧', assetId: 'A11', assetName: '合力3吨叉车', assetType: 'MACHINE', companyId: 'C4', original: 96000, residualRate: 5, totalLife: 60, usedLife: 13, depDate: '2026-09-15', finished: false, ...AUDIT('2026-09-15T02:00:00', '2026-09-15T02:05:00') },
  { id: 'RPD13', planName: '中天建设-运输设备月折旧', assetId: 'A08', assetName: '实木会议桌', assetType: 'FURNITURE', companyId: 'C4', original: 12800, residualRate: 5, totalLife: 60, usedLife: 9, depDate: '2026-09-15', finished: false, ...AUDIT('2026-09-15T02:00:00', '2026-09-15T02:05:00') },
  { id: 'RPD14', planName: '中天建设-房屋建筑年折旧', assetId: 'A11', assetName: '合力3吨叉车', assetType: 'MACHINE', companyId: 'C4', original: 96000, residualRate: 3, totalLife: 360, usedLife: 12, depDate: '2026-01-01', finished: true, ...AUDIT('2026-01-01T02:00:00', '2026-01-01T02:05:00') },
  { id: 'RPD15', planName: '华信科技-电子设备月折旧', assetId: 'A13', assetName: '不间断电源UPS', assetType: 'ELECTRONIC', companyId: 'C1', original: 18600, residualRate: 5, totalLife: 48, usedLife: 11, depDate: '2026-08-01', finished: true, ...AUDIT('2026-08-01T02:00:00', '2026-08-01T02:05:00') },
  { id: 'RPD16', planName: '华信科技-办公家具季折旧', assetId: 'A09', assetName: '人体工学办公椅', assetType: 'FURNITURE', companyId: 'C1', original: 1580, residualRate: 5, totalLife: 24, usedLife: 7, depDate: '2026-04-01', finished: true, ...AUDIT('2026-04-01T02:00:00', '2026-04-01T02:05:00') }
]

export const REPORT_SEEDS = {
  depreciationDetails: SEED_DEPRECIATION_DETAILS,
  depreciationPlanDetails: SEED_DEPRECIATION_PLAN_DETAILS
}

export default REPORT_SEEDS
