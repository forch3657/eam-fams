import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION } from '../services'
import { BIZ_DOC_REGISTRY, ALL_BIZ_TYPES } from '../services/approval'
import { myTodos, buildAlerts, buildOverview } from '../services/workbench'
import { paramNumber } from '../services/sysParams'
import { useOrgStore } from './org'
import { useUserStore } from './user'
import { useApprovalStore } from './approval'

/**
 * 工作台数据
 *
 * 自包含：待办需要跨 11 类单据 + 审批记录 + 流程 + 资产 + 低值库存 + 盘点计划，
 * 这里一次性装载后交给 services/workbench.js 聚合。
 * 审批动作后调用 load(true) 刷新，保证待办/预警与业务数据一致。
 */
export const useWorkbenchStore = defineStore('workbench', () => {
  const docs = ref({})
  const assets = ref([])
  const items = ref([])
  const plans = ref([])
  const loaded = ref(false)
  const loading = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const [docResults, assetRows, itemRows, planRows] = await Promise.all([
        Promise.all(ALL_BIZ_TYPES.map(async bt => {
          const rows = await dataService.list(BIZ_DOC_REGISTRY[bt].collection)
          return [bt, rows]
        })),
        dataService.list(COLLECTION.assets),
        dataService.list(COLLECTION.lowValueItems),
        dataService.list(COLLECTION.inventoryPlans)
      ])
      docs.value = Object.fromEntries(docResults)
      assets.value = assetRows || []
      items.value = itemRows || []
      plans.value = planRows || []
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  const orgStore = useOrgStore()
  const userStore = useUserStore()
  const approvalStore = useApprovalStore()

  /** 预警阈值：取系统参数，未配置时用业务默认值 */
  const timeoutDays = computed(() => paramNumber('sys.approval.timeout.days', 5))
  const retryDays = computed(() => paramNumber('sys.approval.reject.retryDays', 3))
  const remindDays = computed(() => paramNumber('sys.inventory.remind.days', 7))
  const safetyRatio = computed(() => paramNumber('sys.lowvalue.safetyRatio', 0.2))

  const todos = computed(() => myTodos({
    docs: docs.value,
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    user: userStore.user,
    org: orgStore,
    assets: assets.value,
    timeoutDays: timeoutDays.value,
    retryDays: retryDays.value
  }))

  const alerts = computed(() => buildAlerts({
    docs: docs.value,
    items: items.value,
    plans: plans.value,
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    assets: assets.value,
    user: userStore.user,
    org: orgStore,
    safetyRatio: safetyRatio.value,
    remindDays: remindDays.value,
    timeoutDays: timeoutDays.value,
    retryDays: retryDays.value
  }))

  const overview = computed(() => buildOverview({
    docs: docs.value,
    items: items.value,
    assets: assets.value,
    approvals: approvalStore.approvals,
    flows: approvalStore.flows,
    org: orgStore
  }))

  /** 待我审批数量（顶栏徽标） */
  const pendingCount = computed(() => todos.value.pending.length)
  const alertCount = computed(() => alerts.value.length)
  const dangerAlertCount = computed(() => alerts.value.filter(a => a.level === 'danger').length)

  return {
    docs, assets, items, plans, loaded, loading,
    todos, alerts, overview,
    pendingCount, alertCount, dangerAlertCount,
    load
  }
})

export default useWorkbenchStore