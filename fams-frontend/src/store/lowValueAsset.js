import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { paramValue, paramNumber } from '../services/sysParams'
import { LOW_VALUE_SEEDS } from '../services/mock/seed/lowValueAsset'
import { useOrgStore } from './org'
import { STATUS_ENABLED, LOW_VALUE_ITEM_STATUS, labelOf } from '../constants/enums'

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export const useLowValueAssetStore = defineStore('lowValueAsset', () => {
  // 种子由 services/mock/seed/index.js 统一注册；这里仅在 mock 模式下同步取一份填充首屏
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(LOW_VALUE_SEEDS[key])) : [])

  const items = ref(seedOf('items'))
  const inboundRecords = ref(seedOf('inbound'))
  const requisitionRecords = ref(seedOf('requisition'))
  const returnRecords = ref(seedOf('return'))
  const categories = ref(seedOf('categories'))
  const locations = ref(seedOf('locations'))
  const loaded = ref(false)

  async function loadAll() {
    const [it, ib, rq, rt, cg, lc] = await Promise.all([
      dataService.list(COLLECTION.lowValueItems),
      dataService.list(COLLECTION.lowValueInbound),
      dataService.list(COLLECTION.lowValueRequisition),
      dataService.list(COLLECTION.lowValueReturn),
      dataService.list(COLLECTION.lowValueSettingsCategories),
      dataService.list(COLLECTION.lowValueSettingsLocations)
    ])
    items.value = it
    inboundRecords.value = ib
    requisitionRecords.value = rq
    returnRecords.value = rt
    categories.value = cg
    locations.value = lc
    loaded.value = true
  }

  function findItem(id) {
    return items.value.find(i => i && (i.id === id || i.code === id)) || null
  }

  function nextDocNo(prefix, rows) {
    const year = new Date().getFullYear()
    return `${prefix}${year}${String(rows.length + 1).padStart(3, '0')}`
  }

  function toPositiveInt(value, label) {
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      throw new Error(`${label}必须为大于 0 的整数`)
    }
    return n
  }

  /** 库存变化时同步本地副本（引擎已改动库存，这里只做展示同步） */
  async function syncItemStock(itemId) {
    const fresh = await dataService.get(COLLECTION.lowValueItems, itemId)
    if (!fresh) return
    const idx = items.value.findIndex(i => i.id === itemId || i.code === itemId)
    if (idx > -1) items.value[idx] = fresh
  }

  async function addItem(data) {
    const seq = items.value.length + 1
    // 编号前缀取自系统参数（sys.lowvalue.code.prefix）
    const prefix = paramValue('sys.lowvalue.code.prefix', 'DZ')
    const item = {
      code: data.code || `${prefix}${new Date().getFullYear()}${String(seq).padStart(4, '0')}`,
      categoryId: data.categoryId || '',
      name: data.name,
      spec: data.spec || '',
      unit: data.unit || '',
      price: money(data.price),
      stock: Number(data.stock) || 0,
      safetyStock: Number(data.safetyStock) || 0,
      location: data.location || '',
      status: data.status || LOW_VALUE_ITEM_STATUS.NORMAL
    }
    const created = await dataService.create(COLLECTION.lowValueItems, item)
    const row = created || item
    items.value.unshift(row)
    return row
  }

  async function updateItem(id, data) {
    const idx = items.value.findIndex(i => i.id === id || i.code === id)
    if (idx === -1) return null
    const next = { ...items.value[idx], ...data, price: money(data.price ?? items.value[idx].price) }
    items.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueItems, id, next)
    if (saved) items.value[idx] = saved
    return items.value[idx]
  }

  /** 删除保护由引擎按契约执行（库存 / 单据引用），这里只做前置提示 */
  async function removeItem(id) {
    const item = findItem(id)
    if (!item) return false
    await dataService.remove(COLLECTION.lowValueItems, id)
    items.value = items.value.filter(i => !(i.id === id || i.code === id))
    return true
  }

  async function addInbound(data) {
    const item = findItem(data.itemId)
    if (!item) throw new Error('请选择要入库的物品')
    const quantity = toPositiveInt(data.quantity, '入库数量')
    const price = data.price === undefined || data.price === '' ? item.price : money(data.price)
    const record = {
      docNo: data.docNo || nextDocNo('RK', inboundRecords.value),
      itemId: item.id,
      categoryId: item.categoryId || '',
      // 快照：记录办理当时的物品信息
      itemName: item.name,
      categoryName: categoryName(item.categoryId),
      spec: item.spec || '',
      unit: item.unit || '',
      quantity,
      price,
      amount: money(quantity * price),
      supplier: data.supplier || '',
      inboundDate: data.inboundDate || '',
      deptId: data.deptId || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueInbound, record)
    const row = created || record
    inboundRecords.value.unshift(row)
    await syncItemStock(item.id)
    return row
  }

  async function addRequisition(data) {
    const item = findItem(data.itemId)
    if (!item) throw new Error('请选择要领用的物品')
    const quantity = toPositiveInt(data.quantity, '领用数量')
    if (item.stock < quantity) throw new Error(`库存不足，当前库存 ${item.stock}${item.unit || ''}`)
    const record = {
      docNo: data.docNo || nextDocNo('PY', requisitionRecords.value),
      itemId: item.id,
      categoryId: item.categoryId || '',
      itemName: item.name,
      categoryName: categoryName(item.categoryId),
      spec: item.spec || '',
      unit: item.unit || '',
      quantity,
      price: item.price,
      amount: money(quantity * item.price),
      receiver: data.receiver || '',
      deptId: data.deptId || '',
      requisitionDate: data.requisitionDate || '',
      purpose: data.purpose || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueRequisition, record)
    const row = created || record
    requisitionRecords.value.unshift(row)
    await syncItemStock(item.id)
    return row
  }

  /** 已领未退数量 = 领用总量 - 退库总量（与引擎的退库限额规则一致） */
  function issuedQuantity(itemId) {
    const taken = requisitionRecords.value.filter(r => r.itemId === itemId).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const back = returnRecords.value.filter(r => r.itemId === itemId).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    return taken - back
  }

  async function addReturn(data) {
    const item = findItem(data.itemId)
    if (!item) throw new Error('请选择要退库的物品')
    const quantity = toPositiveInt(data.quantity, '退库数量')
    const issued = issuedQuantity(item.id)
    if (quantity > issued) {
      throw new Error(`退库数量超过已领未退数量（${issued}${item.unit || ''}）`)
    }
    const record = {
      docNo: data.docNo || nextDocNo('TK', returnRecords.value),
      itemId: item.id,
      categoryId: item.categoryId || '',
      itemName: item.name,
      categoryName: categoryName(item.categoryId),
      spec: item.spec || '',
      unit: item.unit || '',
      quantity,
      price: item.price,
      amount: money(quantity * item.price),
      returner: data.returner || '',
      deptId: data.deptId || '',
      returnDate: data.returnDate || '',
      reason: data.reason || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueReturn, record)
    const row = created || record
    returnRecords.value.unshift(row)
    await syncItemStock(item.id)
    return row
  }

  // ---- 基础设置（id 由服务端生成） ----
  async function addCategory(data) {
    const row = { ...data, status: data.status || STATUS_ENABLED }
    const created = await dataService.create(COLLECTION.lowValueSettingsCategories, row)
    categories.value.push(created || row)
    return created || row
  }

  async function updateCategory(id, data) {
    const idx = categories.value.findIndex(c => c.id === id || c.code === id)
    if (idx === -1) return null
    const next = { ...categories.value[idx], ...data }
    categories.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueSettingsCategories, id, next)
    if (saved) categories.value[idx] = saved
    return categories.value[idx]
  }

  async function removeCategory(id) {
    await dataService.remove(COLLECTION.lowValueSettingsCategories, id)
    categories.value = categories.value.filter(c => !(c.id === id || c.code === id))
    return true
  }

  async function addLocation(data) {
    const row = { ...data, status: data.status || STATUS_ENABLED }
    const created = await dataService.create(COLLECTION.lowValueSettingsLocations, row)
    locations.value.push(created || row)
    return created || row
  }

  async function updateLocation(id, data) {
    const idx = locations.value.findIndex(l => l.id === id || l.code === id)
    if (idx === -1) return null
    const next = { ...locations.value[idx], ...data }
    locations.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueSettingsLocations, id, next)
    if (saved) locations.value[idx] = saved
    return locations.value[idx]
  }

  async function removeLocation(id) {
    await dataService.remove(COLLECTION.lowValueSettingsLocations, id)
    locations.value = locations.value.filter(l => !(l.id === id || l.code === id))
    return true
  }

  // ---- 派生数据 ----
  const categoryOptions = computed(() => categories.value
    .filter(c => c.status === STATUS_ENABLED)
    .map(c => ({ id: c.id, name: c.name })))

  const locationOptions = computed(() => locations.value
    .filter(l => l.status === STATUS_ENABLED)
    .map(l => ({ id: l.id, name: l.name })))

  function categoryName(id) {
    return categories.value.find(c => c.id === id)?.name || '未分类'
  }

  /** 台账视图模型：补出类别名与状态文案，避免视图直接渲染编码 */
  const itemRows = computed(() => items.value.map(i => ({
    ...i,
    categoryName: categoryName(i.categoryId),
    statusText: labelOf('LOW_VALUE_ITEM_STATUS', i.status)
  })))

  const stats = computed(() => {
    const total = items.value.length
    const stockQuantity = items.value.reduce((s, i) => s + (Number(i.stock) || 0), 0)
    const stockAmount = items.value.reduce((s, i) => s + (Number(i.stock) || 0) * (Number(i.price) || 0), 0)
    const lowStock = items.value.filter(i => (Number(i.stock) || 0) <= (Number(i.safetyStock) || 0)).length
    // 库存预警：低于安全库存的指定比例即预警（系统参数 sys.lowvalue.safetyRatio）
    const safetyRatio = paramNumber('sys.lowvalue.safetyRatio', 0.2)
    const warning = items.value.filter(i => {
      const safety = Number(i.safetyStock) || 0
      if (safety <= 0) return false
      return (Number(i.stock) || 0) <= safety * safetyRatio
    }).length
    const inboundQuantity = inboundRecords.value.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const inboundAmount = inboundRecords.value.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const requisitionQuantity = requisitionRecords.value.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const requisitionAmount = requisitionRecords.value.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const returnQuantity = returnRecords.value.reduce((s, r) => s + (Number(r.quantity) || 0), 0)
    const returnAmount = returnRecords.value.reduce((s, r) => s + (Number(r.amount) || 0), 0)
    return {
      total,
      stockQuantity,
      stockAmount: money(stockAmount),
      lowStock,
      warning,
      safetyRatio,
      inboundQuantity,
      inboundAmount: money(inboundAmount),
      requisitionQuantity,
      requisitionAmount: money(requisitionAmount),
      returnQuantity,
      returnAmount: money(returnAmount)
    }
  })

  /** 类别统计：库存数量、库存金额 */
  const categoryStats = computed(() => {
    const map = new Map()
    items.value.forEach(i => {
      const key = categoryName(i.categoryId)
      const cur = map.get(key) || { name: key, count: 0, quantity: 0, amount: 0 }
      cur.count += 1
      cur.quantity += Number(i.stock) || 0
      cur.amount += (Number(i.stock) || 0) * (Number(i.price) || 0)
      map.set(key, cur)
    })
    const list = [...map.values()].map(x => ({ ...x, amount: money(x.amount) }))
    const totalAmount = list.reduce((s, x) => s + x.amount, 0)
    return list.map(x => ({ ...x, percentage: totalAmount ? Math.round((x.amount / totalAmount) * 1000) / 10 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  })

  /** 部门领用统计：deptId 解析为部门名 */
  const deptStats = computed(() => {
    const org = useOrgStore()
    const map = new Map()
    requisitionRecords.value.forEach(r => {
      const key = r.deptId ? (org.deptName(r.deptId) || r.deptId) : '未指定'
      const cur = map.get(key) || { dept: key, times: 0, quantity: 0, amount: 0 }
      cur.times += 1
      cur.quantity += Number(r.quantity) || 0
      cur.amount += Number(r.amount) || 0
      map.set(key, cur)
    })
    const list = [...map.values()].map(x => ({ ...x, amount: money(x.amount) }))
    const totalAmount = list.reduce((s, x) => s + x.amount, 0)
    return list.map(x => ({ ...x, percentage: totalAmount ? Math.round((x.amount / totalAmount) * 1000) / 10 : 0 }))
      .sort((a, b) => b.amount - a.amount)
  })

  /** 出入库汇总：按物品汇总入库 / 领用 / 退库 */
  const flowSummary = computed(() => {
    const map = new Map()
    items.value.forEach(i => {
      map.set(i.id, {
        name: i.name,
        categoryName: categoryName(i.categoryId),
        spec: i.spec,
        unit: i.unit,
        inbound: 0,
        requisition: 0,
        return: 0,
        stock: Number(i.stock) || 0
      })
    })
    const bump = (id, field, qty) => {
      const row = map.get(id)
      if (row) row[field] += Number(qty) || 0
    }
    inboundRecords.value.forEach(r => bump(r.itemId, 'inbound', r.quantity))
    requisitionRecords.value.forEach(r => bump(r.itemId, 'requisition', r.quantity))
    returnRecords.value.forEach(r => bump(r.itemId, 'return', r.quantity))
    return [...map.values()].filter(r => r.inbound || r.requisition || r.return)
  })

  return {
    items,
    inboundRecords,
    requisitionRecords,
    returnRecords,
    categories,
    locations,
    loaded,
    loadAll,
    addItem,
    updateItem,
    removeItem,
    issuedQuantity,
    addInbound,
    addRequisition,
    addReturn,
    addCategory,
    updateCategory,
    removeCategory,
    addLocation,
    updateLocation,
    removeLocation,
    categoryOptions,
    locationOptions,
    categoryName,
    itemRows,
    stats,
    categoryStats,
    deptStats,
    flowSummary
  }
})
