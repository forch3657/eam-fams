import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, registerSeed, COLLECTION, useMock } from '../services'
import { ASSET_SEEDS } from '../services/mock/seed/asset'

function nowText() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const useFixedAssetStore = defineStore('fixedAsset', () => {
  // mock 模式下先用种子同步填充，保证依赖资产台账的派生数据在首屏就有值；
  // 接口模式下留空，等 loadAll 拉取回来后自动填充
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(ASSET_SEEDS[key])) : [])

  const assets = ref(seedOf('assets'))
  const inboundRecords = ref(seedOf('inbound'))
  const dispatchRecords = ref(seedOf('dispatch'))
  const borrowRecords = ref(seedOf('borrow'))
  const changeRecords = ref(seedOf('change'))
  const disposeRecords = ref(seedOf('dispose'))
  const loaded = ref(false)

  registerSeed(COLLECTION.assets, ASSET_SEEDS.assets)
  registerSeed(COLLECTION.inbound, ASSET_SEEDS.inbound)
  registerSeed(COLLECTION.dispatch, ASSET_SEEDS.dispatch)
  registerSeed(COLLECTION.borrow, ASSET_SEEDS.borrow)
  registerSeed(COLLECTION.change, ASSET_SEEDS.change)
  registerSeed(COLLECTION.dispose, ASSET_SEEDS.dispose)

  async function loadAll() {
    const [a, i, d, b, c, dp] = await Promise.all([
      dataService.list(COLLECTION.assets),
      dataService.list(COLLECTION.inbound),
      dataService.list(COLLECTION.dispatch),
      dataService.list(COLLECTION.borrow),
      dataService.list(COLLECTION.change),
      dataService.list(COLLECTION.dispose)
    ])
    assets.value = a
    inboundRecords.value = i
    dispatchRecords.value = d
    borrowRecords.value = b
    changeRecords.value = c
    disposeRecords.value = dp
    loaded.value = true
  }

  async function addAsset(data) {
    const seq = 200 + assets.value.length
    const code = data.code || `GD2026${seq}`
    const original = data.depreciate && data.original ? data.original : data.amount
    const asset = {
      id: `A${Date.now()}`,
      code,
      name: data.name,
      type: data.type,
      brand: data.brand || '',
      model: data.model || '',
      company: data.company || '华信科技集团有限公司',
      location: data.location || '',
      purchaseDate: data.purchaseDate || '',
      amount: data.amount || 0,
      inboundDate: data.inboundDate || '',
      original,
      net: original,
      user: '',
      dept: '',
      status: '空闲',
      depreciate: data.depreciate ?? true,
      purchaseMode: data.purchaseMode || '购买',
      leaseMonths: data.leaseMonths || 36,
      updateTime: nowText()
    }
    const created = await dataService.create(COLLECTION.assets, asset)
    assets.value.unshift(created || asset)
    return created || asset
  }

  async function updateAsset(id, data) {
    const idx = assets.value.findIndex(a => a.id === id)
    if (idx === -1) return null
    const next = { ...assets.value[idx], ...data, updateTime: nowText() }
    assets.value[idx] = next
    const saved = await dataService.update(COLLECTION.assets, id, next)
    if (saved) assets.value[idx] = saved
    return assets.value[idx]
  }

  async function addInbound(data) {
    const record = { ...data, assetNo: data.assetNo || `ZC${Date.now()}` }
    const created = await dataService.create(COLLECTION.inbound, record)
    inboundRecords.value.unshift(created || record)
    return created || record
  }

  async function addDispatch(data) {
    const record = { ...data, dispatchNo: data.dispatchNo || `PF${Date.now()}` }
    const created = await dataService.create(COLLECTION.dispatch, record)
    dispatchRecords.value.unshift(created || record)
    return created || record
  }

  async function addBorrow(data) {
    const record = { ...data, borrowNo: data.borrowNo || `JC${Date.now()}` }
    const created = await dataService.create(COLLECTION.borrow, record)
    borrowRecords.value.unshift(created || record)
    return created || record
  }

  async function addChange(data) {
    const record = { ...data, changeNo: data.changeNo || `BG${Date.now()}` }
    const created = await dataService.create(COLLECTION.change, record)
    changeRecords.value.unshift(created || record)
    return created || record
  }

  async function addDispose(data) {
    const record = { ...data, disposeNo: data.disposeNo || `CZ${Date.now()}` }
    const created = await dataService.create(COLLECTION.dispose, record)
    disposeRecords.value.unshift(created || record)
    return created || record
  }

  const stats = computed(() => {
    const total = assets.value.length
    const totalValue = assets.value.reduce((s, a) => s + (a.original || 0), 0)
    const netValue = assets.value.reduce((s, a) => s + (a.net || 0), 0)
    const byStatus = {}
    assets.value.forEach(a => {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1
    })
    const byType = {}
    assets.value.forEach(a => {
      byType[a.type] = (byType[a.type] || 0) + 1
    })
    const byCompany = {}
    assets.value.forEach(a => {
      byCompany[a.company] = (byCompany[a.company] || 0) + 1
    })
    const byDept = {}
    assets.value.forEach(a => {
      if (a.dept) byDept[a.dept] = (byDept[a.dept] || 0) + 1
    })
    return { total, totalValue, netValue, byStatus, byType, byCompany, byDept }
  })

  return {
    assets,
    inboundRecords,
    dispatchRecords,
    borrowRecords,
    changeRecords,
    disposeRecords,
    loaded,
    loadAll,
    addAsset,
    updateAsset,
    addInbound,
    addDispatch,
    addBorrow,
    addChange,
    addDispose,
    stats
  }
})
