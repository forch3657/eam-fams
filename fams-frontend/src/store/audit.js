import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { SYSTEM_SEEDS } from '../services/mock/seed/system'
import { useUserStore } from './user'

const MAX_OPLOG = 2000

export const useAuditStore = defineStore('audit', () => {
  // 种子由 services/mock/seed/index.js 统一注册；mock 模式下同步取一份填充首屏
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(SYSTEM_SEEDS[key])) : [])

  const opLogs = ref(seedOf('operationLogs'))
  const loaded = ref(false)

  const allOpLogs = computed(() => opLogs.value)
  const opLogCount = computed(() => opLogs.value.length)

  async function loadAll() {
    opLogs.value = await dataService.list(COLLECTION.operationLogs)
    loaded.value = true
  }

  function actor() {
    const u = useUserStore().user
    return {
      operator: u?.name || '系统',
      operatorOrg: u?.org || '系统'
    }
  }

  /** 系统操作日志（主键由服务端生成，时间存 ISO） */
  async function logOp(entry) {
    const rec = {
      time: new Date().toISOString(),
      module: entry.module || '其他',
      action: entry.action || '访问',
      target: entry.target || '',
      result: entry.result || '成功',
      detail: entry.detail || '',
      ip: entry.ip || '127.0.0.1',
      ...actor()
    }
    const created = await dataService.create(COLLECTION.operationLogs, rec)
    opLogs.value.unshift(created || rec)
    if (opLogs.value.length > MAX_OPLOG) opLogs.value.length = MAX_OPLOG
    return created || rec
  }

  async function clearOpLogs() {
    opLogs.value = []
    await dataService.clear(COLLECTION.operationLogs)
  }

  return { opLogs, loaded, allOpLogs, opLogCount, loadAll, logOp, clearOpLogs }
})
