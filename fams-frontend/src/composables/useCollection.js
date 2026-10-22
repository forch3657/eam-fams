import { ref, onMounted } from 'vue'
import { dataService, registerSeed } from '../services'

/**
 * 集合读写封装：视图只面对 items / add / update / remove / save，
 * 具体落到 mock 内存库还是后端接口由 services 决定。
 * seed 仅在 mock 模式下作为初始数据使用。
 */
export function useCollection(key, seed = [], { immediate = true } = {}) {
  registerSeed(key, seed)
  const items = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      items.value = (await dataService.list(key)) || []
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
    const saved = await dataService.update(key, target._id || target.id || target.code, target)
    return saved || target
  }

  async function remove(row) {
    const idx = typeof row === 'number' ? row : items.value.indexOf(row)
    if (idx > -1) items.value.splice(idx, 1)
    const target = typeof row === 'number' ? undefined : row
    if (target) await dataService.remove(key, target._id || target.id || target.code)
    return true
  }

  /** 兜底：批量/嵌套改动后整表回写 */
  async function save() {
    await dataService.replaceAll(key, items.value)
    return items.value
  }

  if (immediate) onMounted(load)

  return { items, loading, load, add, update, remove, save }
}

export default useCollection
