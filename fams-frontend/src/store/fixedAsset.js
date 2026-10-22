import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { ASSET_SEEDS } from '../services/mock/seed/asset'
import { useOrgStore } from './org'
import { ASSET_STATUS, labelOf } from '../constants/enums'

export const useFixedAssetStore = defineStore('fixedAsset', () => {
  // 种子由 services/mock/seed/index.js 统一注册；mock 模式下同步取一份填充首屏
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(ASSET_SEEDS[key])) : [])

  const assets = ref(seedOf('assets'))
  const inboundRecords = ref(seedOf('inbound'))
  const dispatchRecords = ref(seedOf('dispatch'))
  const borrowRecords = ref(seedOf('borrow'))
  const changeRecords = ref(seedOf('change'))
  const disposeRecords = ref(seedOf('dispose'))
  const loaded = ref(false)

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

  function nextCode() {
    const seq = 200 + assets.value.length
    return `GD2026${seq}`
  }

  async function addAsset(data) {
    const original = data.depreciate && data.original ? data.original : data.amount
    const asset = {
      code: data.code || nextCode(),
      name: data.name,
      category: data.category || data.type || 'OTHER',
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
      status: data.status || ASSET_STATUS.IDLE,
      depreciate: data.depreciate ?? true,
      purchaseMode: data.purchaseMode || 'PURCHASE',
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
    assets.value[idx] = next
    const saved = await dataService.update(COLLECTION.assets, id, next)
    if (saved) assets.value[idx] = saved
    return assets.value[idx]
  }

  /**
   * 单据写入归一化：
   * 表单里用户选的是资产编号/部门名/人员名，落库前统一换成 id，
   * 并剔除 assetNo / assetName / department / user 这类展示字段（它们由读取时解析得到）。
   */
  function normalizeDoc(data) {
    const org = useOrgStore()
    const payload = { ...data }
    if (!payload.assetId && payload.assetNo) {
      const hit = assets.value.find(a => a.code === payload.assetNo || a.id === payload.assetNo)
      payload.assetId = hit ? hit.id : ''
    }
    if (!payload.deptId && payload.department) {
      const hit = org.departments.find(d => d.name === payload.department)
      payload.deptId = hit ? hit.id : ''
    }
    const personName = payload.userId ? '' : (payload.user || payload.borrower || '')
    if (!payload.userId && personName) {
      const hit = org.users.find(u => u.name === personName)
      payload.userId = hit ? hit.id : ''
    }
    delete payload.assetNo
    delete payload.assetName
    delete payload.department
    delete payload.user
    delete payload.borrower
    return payload
  }

  async function addInbound(data) {
    const created = await dataService.create(COLLECTION.inbound, normalizeDoc(data))
    inboundRecords.value.unshift(created || data)
    return created || data
  }

  async function addDispatch(data) {
    const created = await dataService.create(COLLECTION.dispatch, normalizeDoc(data))
    dispatchRecords.value.unshift(created || data)
    return created || data
  }

  async function addBorrow(data) {
    const created = await dataService.create(COLLECTION.borrow, normalizeDoc(data))
    borrowRecords.value.unshift(created || data)
    return created || data
  }

  async function addChange(data) {
    const created = await dataService.create(COLLECTION.change, normalizeDoc(data))
    changeRecords.value.unshift(created || data)
    return created || data
  }

  async function addDispose(data) {
    const created = await dataService.create(COLLECTION.dispose, normalizeDoc(data))
    disposeRecords.value.unshift(created || data)
    return created || data
  }

  /**
   * 单据视图模型：把 assetId / deptId / userId 解析为展示用的
   * assetNo（资产编号）、assetName、department、user、borrower、状态文案。
   * 视图只读这些模型，写入时仍用 id。
   */
  function decorateDocs(records, statusEnum) {
    const org = useOrgStore()
    return records.map(r => {
      const asset = assets.value.find(a => a.id === r.assetId)
      return {
        ...r,
        // 各单据列表用的编号字段名不同，统一由 code 派生
        docNo: r.code || '',
        dispatchNo: r.code || '',
        borrowNo: r.code || '',
        changeNo: r.code || '',
        disposeNo: r.code || '',
        assetNo: asset ? asset.code : '',
        assetName: asset ? asset.name : '',
        name: asset ? asset.name : (r.name || ''),
        category: asset ? labelOf('ASSET_CATEGORY', asset.category) : '',
        model: asset ? asset.model : '',
        brand: asset ? asset.brand : '',
        department: r.deptId ? (org.deptName(r.deptId) || '') : (r.department || ''),
        user: r.userId ? (org.users.find(u => u.id === r.userId)?.name || '') : (r.user || ''),
        borrower: r.userId ? (org.users.find(u => u.id === r.userId)?.name || '') : (r.borrower || ''),
        statusText: labelOf(statusEnum, r.status)
      }
    })
  }

  const inboundList = computed(() => decorateDocs(inboundRecords.value, 'INBOUND_STATUS'))
  const dispatchList = computed(() => decorateDocs(dispatchRecords.value, 'DISPATCH_STATUS'))
  const borrowList = computed(() => decorateDocs(borrowRecords.value, 'BORROW_STATUS'))
  const changeList = computed(() => decorateDocs(changeRecords.value, 'DOC_STATUS'))
  const disposeList = computed(() => decorateDocs(disposeRecords.value, 'DISPOSE_STATUS'))

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

  return {
    assets,
    assetLedger,
    inboundRecords,
    dispatchRecords,
    borrowRecords,
    changeRecords,
    disposeRecords,
    // 单据视图模型（外键已解析）：供列表展示与筛选
    inboundList,
    dispatchList,
    borrowList,
    changeList,
    disposeList,
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
