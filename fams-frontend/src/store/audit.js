import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { SYSTEM_SEEDS } from '../services/mock/seed/system'

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

  // operation-logs 是 append-only 审计表：只允许后端切面写，前端不得新增/清空。
  // 保留空实现仅为兼容旧调用点，避免误触发 403；审计写入全部由后端完成。
  async function logOp() {
    return null
  }

  async function clearOpLogs() {
    // no-op：审计日志不可从前端清空
  }

  return { opLogs, loaded, allOpLogs, opLogCount, loadAll, logOp, clearOpLogs }
})
