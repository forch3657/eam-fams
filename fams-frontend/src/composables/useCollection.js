import { ref, onMounted } from 'vue'
import { dataService, idFieldOf } from '../services'

/**
 * 集合读写封装：视图只面对 items / add / update / remove / save，
 * 具体落到 mock 引擎还是后端接口由 services 决定。
 *
 * 不再接收 seed —— 演示数据统一由 services/mock/seed 注册，
 * 视图层因此不含任何 mock 代码，切到真实后端时无需清理。
 */
export function useCollection(key, { immediate = true, params } = {}) {
  const items = ref([])
  const total = ref(0)
  const loading = ref(false)

  /** 主键：按契约取（不同集合主键字段不同，如 code / key / recordNo） */
  function primaryOf(row) {
    const field = idFieldOf(key)
    return row?.[field] ?? row?.id ?? row?.code
  }

  async function load(queryParams = params) {
    loading.value = true
    try {
      items.value = (await dataService.list(key, queryParams)) || []
      total.value = items.value.length
    } finally {
      loading.value = false
    }
    return items.value
  }

  /** 服务端分页加载：items 为当前页，total 为总数 */
  async function loadPage(queryParams = {}) {
    loading.value = true
    try {
      const res = await dataService.page(key, queryParams)
      items.value = res?.rows || []
      total.value = Number(res?.total) || 0
    } finally {
      loading.value = false
    }
    return items.value
  }

  async function add(row) {
    const created = await dataService.create(key, row)
    const record = created || row
    items.value.unshift(record)
    return record
  }

  /** row 为对象或下标；patch 为空时表示整行持久化（如改了嵌套子数组） */
  async function update(row, patch = {}) {
    const target = typeof row === 'number' ? items.value[row] : row
    if (!target) return null
    Object.assign(target, patch)
    const saved = await dataService.update(key, primaryOf(target), target)
    return saved || target
  }

  async function remove(row) {
    const idx = typeof row === 'number' ? row : items.value.indexOf(row)
    if (idx > -1) items.value.splice(idx, 1)
    const target = typeof row === 'number' ? undefined : row
    if (target) await dataService.remove(key, primaryOf(target))
    return true
  }

  /** 整表回写：走批量保存接口（后端 PUT /{key}/batch），不再是 mock 专属能力 */
  async function save() {
    const saved = await dataService.batch(key, items.value)
    if (Array.isArray(saved) && saved.length) items.value = saved
    return items.value
  }

  if (immediate) onMounted(load)

  return { items, total, loading, load, loadPage, add, update, remove, save }
}

export default useCollection
