import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, registerSeed, COLLECTION, useMock } from '../services'
import { LOW_VALUE_SEEDS } from '../services/mock/seed/lowValueAsset'

function nowText() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export const useLowValueAssetStore = defineStore('lowValueAsset', () => {
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(LOW_VALUE_SEEDS[key])) : [])

  const items = ref(seedOf('items'))
  const inboundRecords = ref(seedOf('inbound'))
  const requisitionRecords = ref(seedOf('requisition'))
  const returnRecords = ref(seedOf('return'))
  const categories = ref(seedOf('categories'))
  const locations = ref(seedOf('locations'))
  const approvalFlows = ref(seedOf('approvalFlows'))
  const loaded = ref(false)

  registerSeed(COLLECTION.lowValueItems, LOW_VALUE_SEEDS.items)
  registerSeed(COLLECTION.lowValueInbound, LOW_VALUE_SEEDS.inbound)
  registerSeed(COLLECTION.lowValueRequisition, LOW_VALUE_SEEDS.requisition)
  registerSeed(COLLECTION.lowValueReturn, LOW_VALUE_SEEDS.return)
  registerSeed(COLLECTION.lowValueSettingsCategories, LOW_VALUE_SEEDS.categories)
  registerSeed(COLLECTION.lowValueSettingsLocations, LOW_VALUE_SEEDS.locations)
  registerSeed(COLLECTION.lowValueSettingsApprovalFlows, LOW_VALUE_SEEDS.approvalFlows)

  async function loadAll() {
    const [it, ib, rq, rt, cg, lc, fl] = await Promise.all([
      dataService.list(COLLECTION.lowValueItems),
      dataService.list(COLLECTION.lowValueInbound),
      dataService.list(COLLECTION.lowValueRequisition),
      dataService.list(COLLECTION.lowValueReturn),
      dataService.list(COLLECTION.lowValueSettingsCategories),
      dataService.list(COLLECTION.lowValueSettingsLocations),
      dataService.list(COLLECTION.lowValueSettingsApprovalFlows)
    ])
    items.value = it
    inboundRecords.value = ib
    requisitionRecords.value = rq
    returnRecords.value = rt
    categories.value = cg
    locations.value = lc
    approvalFlows.value = fl
    loaded.value = true
  }

  /** 按 id / code / _id 定位物品 */
  function findItem(id) {
    return items.value.find(i => i && (i.id === id || i.code === id || i._id === id)) || null
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

  async function addItem(data) {
    const seq = items.value.length + 1
    const item = {
      id: `DZ${Date.now()}`,
      code: data.code || `DZ${new Date().getFullYear()}${String(seq).padStart(4, '0')}`,
      category: data.category || '',
      name: data.name,
      spec: data.spec || '',
      unit: data.unit || '',
      price: money(data.price),
      stock: Number(data.stock) || 0,
      safetyStock: Number(data.safetyStock) || 0,
      location: data.location || '',
      status: data.status || '正常',
      updateTime: nowText()
    }
    const created = await dataService.create(COLLECTION.lowValueItems, item)
    const row = created || item
    items.value.unshift(row)
    return row
  }

  async function updateItem(id, data) {
    const idx = items.value.findIndex(i => i.id === id || i.code === id || i._id === id)
    if (idx === -1) return null
    const next = { ...items.value[idx], ...data, price: money(data.price ?? items.value[idx].price), updateTime: nowText() }
    items.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueItems, id, next)
    if (saved) items.value[idx] = saved
    return items.value[idx]
  }

  /** 删除保护：仍有库存或已被单据引用的物品不允许删除 */
  async function removeItem(id) {
    const item = findItem(id)
    if (!item) return false
    if (item.stock > 0) throw new Error('该物品仍有库存，请先办理出库或退库后再删除')
    const referenced = [...inboundRecords.value, ...requisitionRecords.value, ...returnRecords.value]
      .some(r => r.itemId === item.id || r.itemId === item.code)
    if (referenced) throw new Error('该物品已存在业务单据，不允许删除')
    await dataService.remove(COLLECTION.lowValueItems, id)
    items.value = items.value.filter(i => !(i.id === id || i.code === id || i._id === id))
    return true
  }

  /** 库存联动：正数入库、负数出库，库存不足时抛错 */
  async function applyStock(itemId, delta, available) {
    const item = findItem(itemId)
    if (!item) throw new Error('未找到对应物品，请刷新后重试')
    if (delta < 0 && item.stock < Math.abs(delta)) {
      throw new Error(`库存不足，当前库存 ${item.stock}${item.unit || ''}`)
    }
    if (available !== undefined && delta < 0 && available < Math.abs(delta)) {
      throw new Error('库存不足，无法完成该操作')
    }
    const next = { ...item, stock: item.stock + delta, updateTime: nowText() }
    const saved = await dataService.update(COLLECTION.lowValueItems, item.id || item.code, next)
    const row = saved || next
    const idx = items.value.findIndex(i => i.id === item.id)
    if (idx > -1) items.value[idx] = row
    return row
  }

  async function addInbound(data) {
    const item = findItem(data.itemId)
    if (!item) throw new Error('请选择要入库的物品')
    const quantity = toPositiveInt(data.quantity, '入库数量')
    const price = data.price === undefined || data.price === '' ? item.price : money(data.price)
    const record = {
      docNo: data.docNo || nextDocNo('RK', inboundRecords.value),
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      spec: item.spec,
      unit: item.unit,
      quantity,
      price,
      amount: money(quantity * price),
      supplier: data.supplier || '',
      inboundDate: data.inboundDate || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueInbound, record)
    const row = created || record
    inboundRecords.value.unshift(row)
    await applyStock(item.id, quantity)
    return row
  }

  async function addRequisition(data) {
    const item = findItem(data.itemId)
    if (!item) throw new Error('请选择要领用的物品')
    const quantity = toPositiveInt(data.quantity, '领用数量')
    if (item.stock < quantity) throw new Error(`库存不足，当前库存 ${item.stock}${item.unit || ''}`)
    const price = item.price
    const record = {
      docNo: data.docNo || nextDocNo('PY', requisitionRecords.value),
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      spec: item.spec,
      unit: item.unit,
      quantity,
      price,
      amount: money(quantity * price),
      receiver: data.receiver || '',
      dept: data.dept || '',
      requisitionDate: data.requisitionDate || '',
      purpose: data.purpose || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueRequisition, record)
    const row = created || record
    requisitionRecords.value.unshift(row)
    await applyStock(item.id, -quantity, item.stock)
    return row
  }

  /** 已领未退数量 = 领用总量 - 退库总量，防止超量退库 */
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
    const price = item.price
    const record = {
      docNo: data.docNo || nextDocNo('TK', returnRecords.value),
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      spec: item.spec,
      unit: item.unit,
      quantity,
      price,
      amount: money(quantity * price),
      returner: data.returner || '',
      dept: data.dept || '',
      returnDate: data.returnDate || '',
      reason: data.reason || '',
      operator: data.operator || '',
      remark: data.remark || ''
    }
    const created = await dataService.create(COLLECTION.lowValueReturn, record)
    const row = created || record
    returnRecords.value.unshift(row)
    await applyStock(item.id, quantity)
    return row
  }

  // ---- 基础设置 ----
  async function addCategory(data) {
    const row = { ...data, id: `LVC${Date.now()}` }
    const created = await dataService.create(COLLECTION.lowValueSettingsCategories, row)
    categories.value.push(created || row)
    return created || row
  }

  async function updateCategory(id, data) {
    const idx = categories.value.findIndex(c => c.id === id || c.code === id || c._id === id)
    if (idx === -1) return null
    const next = { ...categories.value[idx], ...data }
    categories.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueSettingsCategories, id, next)
    if (saved) categories.value[idx] = saved
    return categories.value[idx]
  }

  async function removeCategory(id) {
    const target = categories.value.find(c => c.id === id || c.code === id || c._id === id)
    if (target && items.value.some(i => i.category === target.name)) {
      throw new Error('该类别下仍有物品，不能删除')
    }
    await dataService.remove(COLLECTION.lowValueSettingsCategories, id)
    categories.value = categories.value.filter(c => !(c.id === id || c.code === id || c._id === id))
    return true
  }

  async function addLocation(data) {
    const row = { ...data, id: `LVL${Date.now()}` }
    const created = await dataService.create(COLLECTION.lowValueSettingsLocations, row)
    locations.value.push(created || row)
    return created || row
  }

  async function updateLocation(id, data) {
    const idx = locations.value.findIndex(l => l.id === id || l.code === id || l._id === id)
    if (idx === -1) return null
    const next = { ...locations.value[idx], ...data }
    locations.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueSettingsLocations, id, next)
    if (saved) locations.value[idx] = saved
    return locations.value[idx]
  }

  async function removeLocation(id) {
    const target = locations.value.find(l => l.id === id || l.code === id || l._id === id)
    if (target && items.value.some(i => i.location === target.name)) {
      throw new Error('该位置下仍有物品，不能删除')
    }
    await dataService.remove(COLLECTION.lowValueSettingsLocations, id)
    locations.value = locations.value.filter(l => !(l.id === id || l.code === id || l._id === id))
    return true
  }

  async function addFlow(data) {
    const row = { ...data, id: `LVF${Date.now()}` }
    const created = await dataService.create(COLLECTION.lowValueSettingsApprovalFlows, row)
    approvalFlows.value.push(created || row)
    return created || row
  }

  async function updateFlow(id, data) {
    const idx = approvalFlows.value.findIndex(f => f.id === id || f._id === id)
    if (idx === -1) return null
    const next = { ...approvalFlows.value[idx], ...data }
    approvalFlows.value[idx] = next
    const saved = await dataService.update(COLLECTION.lowValueSettingsApprovalFlows, id, next)
    if (saved) approvalFlows.value[idx] = saved
    return approvalFlows.value[idx]
  }

  async function removeFlow(id) {
    await dataService.remove(COLLECTION.lowValueSettingsApprovalFlows, id)
    approvalFlows.value = approvalFlows.value.filter(f => !(f.id === id || f._id === id))
    return true
  }

  // ---- 派生数据 ----
  const categoryOptions = computed(() => categories.value.filter(c => c.status !== '禁用').map(c => c.name))
  const locationOptions = computed(() => locations.value.filter(l => l.status !== '禁用').map(l => l.name))

  const stats = computed(() => {
    const total = items.value.length
    const stockQuantity = items.value.reduce((s, i) => s + (Number(i.stock) || 0), 0)
    const stockAmount = items.value.reduce((s, i) => s + (Number(i.stock) || 0) * (Number(i.price) || 0), 0)
    const lowStock = items.value.filter(i => (Number(i.stock) || 0) <= (Number(i.safetyStock) || 0)).length
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
      const key = i.category || '未分类'
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

  /** 部门领用统计 */
  const deptStats = computed(() => {
    const map = new Map()
    requisitionRecords.value.forEach(r => {
      const key = r.dept || '未指定'
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
      map.set(i.id, { name: i.name, category: i.category, spec: i.spec, unit: i.unit, inbound: 0, requisition: 0, return: 0, stock: Number(i.stock) || 0 })
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
    approvalFlows,
    loaded,
    loadAll,
    addItem,
    updateItem,
    removeItem,
    addInbound,
    addRequisition,
    addReturn,
    addCategory,
    updateCategory,
    removeCategory,
    addLocation,
    updateLocation,
    removeLocation,
    addFlow,
    updateFlow,
    removeFlow,
    categoryOptions,
    locationOptions,
    stats,
    categoryStats,
    deptStats,
    flowSummary
  }
})
