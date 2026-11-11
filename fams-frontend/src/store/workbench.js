import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION } from '../services'
import { BIZ_DOC_REGISTRY, ALL_BIZ_TYPES, isApproverOfBiz } from '../services/approval'
import { myTodos, buildAlerts, buildOverview } from '../services/workbench'
import { paramNumber } from '../services/sysParams'
import { DOC_IN_FLIGHT_STATUS } from '../constants/enums'
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
  // 上次加载时的权限快照：切换账号后权限集合变化，必须重新按新权限装载，
  // 否则会残留上一位用户可读的数据（越权展示）或缺数据（新角色本可读）。
  let loadedPermKey = null

  /** 每类单据的读权限码：没有对应权限就不发请求，避免业务角色首屏 403 */
  function readCodeOf(bt) {
    return BIZ_DOC_REGISTRY[bt].scope === 'low-value' ? 'lv:view' : 'fa:view'
  }

  /**
   * 某类单据当前账号能不能读。
   *
   * <p>盘点单额外放行「盘点流程的环节审批人」：审计员 R6 是「审计抽查确认」环节的审批人，
   * 读不到盘点单就等于盲批，待办里也拼不出这张单（后端读权限已随 fa:view 放开）。</p>
   */
  function readable(bt, can) {
    if (bt === 'INVENTORY') {
      if (can('fa:inventory')) return true
      return isApproverOfBiz('INVENTORY', useUserStore().user, orgStore, approvalStore.flows)
    }
    return can(readCodeOf(bt))
  }

  function permKey() {
    return useUserStore().permissions.slice().sort().join(',')
  }

  async function load(force = false) {
    const key = permKey()
    if (loaded.value && !force && key === loadedPermKey) return
    loading.value = true
    const can = code => useUserStore().can(code)
    try {
      // 盘点单的可见性要按流程环节判定审批人，必须先拿到流程配置；
      // 无 wm:todo 的账号读流程会 403，这里吞掉异常，退回按权限码判定。
      if (!approvalStore.loaded) {
        await approvalStore.load().catch(() => {})
      }
      const readableTypes = ALL_BIZ_TYPES.filter(bt => readable(bt, can))
      const [docResults, assetRows, itemRows, planRows] = await Promise.all([
        Promise.all(readableTypes.map(async bt => {
          const rows = await dataService.list(BIZ_DOC_REGISTRY[bt].collection)
          return [bt, rows]
        })),
        can('fa:view') ? dataService.list(COLLECTION.assets) : [],
        can('lv:view') ? dataService.list(COLLECTION.lowValueItems) : [],
        can('fa:inventory') ? dataService.list(COLLECTION.inventoryPlans) : []
      ])
      docs.value = Object.fromEntries(docResults)
      assets.value = assetRows || []
      items.value = itemRows || []
      plans.value = planRows || []
      loaded.value = true
      loadedPermKey = key
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

  /** 我发起的在途单据：行动条「我在途」与「我发起的」筛选列表共用，终态（已撤销/已完结）不计入 */
  const mineInFlight = computed(() => todos.value.mine.filter(m => DOC_IN_FLIGHT_STATUS.includes(m.status)))
  const mineInFlightCount = computed(() => mineInFlight.value.length)

  return {
    docs, assets, items, plans, loaded, loading,
    todos, alerts, overview,
    pendingCount, alertCount, dangerAlertCount,
    mineInFlight, mineInFlightCount,
    load
  }
})

export default useWorkbenchStore