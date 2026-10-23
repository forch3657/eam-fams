import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { paramValue, paramNumber } from '../services/sysParams'
import { codeOf } from '../constants/enums'
import { ASSET_SEEDS } from '../services/mock/seed/asset'
import { useOrgStore } from './org'
import { labelOf } from '../constants/enums'

export const useFixedAssetStore = defineStore('fixedAsset', () => {
  // 种子由 services/mock/seed/index.js 统一注册；mock 模式下同步取一份填充首屏
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(ASSET_SEEDS[key])) : [])

  const assets = ref(seedOf('assets'))
  const loaded = ref(false)

  async function loadAll() {
    assets.value = await dataService.list(COLLECTION.assets)
    loaded.value = true
  }

  function nextCode() {
    // 编号前缀取自系统参数（系统管理 > 系统参数 → sys.asset.code.prefix）
    const prefix = paramValue('sys.asset.code.prefix', 'GD')
    const year = new Date().getFullYear()
    const seq = 200 + assets.value.length
    return `${prefix}${year}${seq}`
  }

  async function addAsset(data) {
    const original = data.depreciate && data.original ? data.original : data.amount
    const asset = {
      code: data.code || nextCode(),
      name: data.name,
      category: codeOf('ASSET_CATEGORY', data.category || data.type, 'OTHER'),
      brand: data.brand || '',
      model: data.model || '',
      companyId: data.companyId || '',
      deptId: data.deptId || '',
      userId: data.userId || '',
      location: data.location || '',
      purchaseDate: data.purchaseDate || '',
      amount: data.amount || 0,
      inboundDate: data.inboundDate || '',
      original,
      net: original,
      status: codeOf('ASSET_STATUS', data.status, 'IDLE'), // 状态存编码（文案会被自动转成编码）
      depreciate: data.depreciate ?? true,
      purchaseMode: codeOf('PURCHASE_MODE', data.purchaseMode, 'PURCHASE'),
      leaseMonths: data.leaseMonths || 36
    }
    const created = await dataService.create(COLLECTION.assets, asset)
    assets.value.unshift(created || asset)
    return created || asset
  }

  async function updateAsset(id, data) {
    const idx = assets.value.findIndex(a => a.id === id)
    if (idx === -1) return null
    const next = { ...assets.value[idx], ...data }
    // 服务端确认后才更新本地：乐观锁冲突时界面不会残留与服务端不一致的数据
    const saved = await dataService.update(COLLECTION.assets, id, next)
    if (saved) assets.value[idx] = saved
    return assets.value[idx]
  }

  /**
   * 删除资产。
   * 安全性由契约保证：存在任意一类业务单据的资产会被服务端拒绝（1003），
   * 因此这里不需要前端再重复校验。
   */
  async function removeAsset(id) {
    await dataService.remove(COLLECTION.assets, id)
    const idx = assets.value.findIndex(a => a.id === id || a.code === id)
    if (idx > -1) assets.value.splice(idx, 1)
    return true
  }

  /**
   * 台账视图模型：把外键 id 解析为展示名称、状态编码解析为文案。
   * 视图只读这个模型做展示与筛选，写入时仍用 id / 编码。
   */
  const assetLedger = computed(() => {
    const org = useOrgStore()
    return assets.value.map(a => ({
      ...a,
      // 兼容旧字段名：视图与导出沿用 company / dept / user / type
      company: org.companyName(a.companyId),
      companyId: a.companyId,
      dept: a.deptId ? (org.deptName(a.deptId) || '') : '',
      deptId: a.deptId,
      user: a.userId ? (org.users.find(u => u.id === a.userId)?.name || '') : '',
      userId: a.userId,
      type: labelOf('ASSET_CATEGORY', a.category),
      category: a.category,
      // 展示用文案；statusCode 保留编码供筛选与写回
      status: labelOf('ASSET_STATUS', a.status),
      statusText: labelOf('ASSET_STATUS', a.status),
      statusCode: a.status
    }))
  })

  const stats = computed(() => {
    const total = assets.value.length
    const totalValue = assets.value.reduce((s, a) => s + (a.original || 0), 0)
    const netValue = assets.value.reduce((s, a) => s + (a.net || 0), 0)
    const byStatus = {}
    const byType = {}
    const byCompany = {}
    const byDept = {}
    const org = useOrgStore()
    assets.value.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1
      byType[a.category] = (byType[a.category] || 0) + 1
      if (a.companyId) {
        const key = org.companyName(a.companyId) || a.companyId
        byCompany[key] = (byCompany[key] || 0) + 1
      }
      if (a.deptId) {
        const key = org.deptName(a.deptId) || a.deptId
        byDept[key] = (byDept[key] || 0) + 1
      }
    })
    return { total, totalValue, netValue, byStatus, byType, byCompany, byDept }
  })

  /** 盘点提醒提前天数（系统参数 sys.inventory.remind.days） */
  const inventoryRemindDays = computed(() => paramNumber('sys.inventory.remind.days', 7))

  return {
    assets,
    assetLedger,
    loaded,
    loadAll,
    addAsset,
    updateAsset,
    removeAsset,
    inventoryRemindDays,
    stats
  }
})
