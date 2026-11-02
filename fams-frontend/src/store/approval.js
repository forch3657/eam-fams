import { defineStore } from 'pinia'
import { ref } from 'vue'
import { dataService, COLLECTION } from '../services'

/**
 * 审批数据
 *
 * - flows：流程配置（系统管理 → 流程配置维护），是审批链的唯一事实源
 * - approvals：审批记录（每条 = 单据在某个环节上的一次动作）
 *
 * 全局只加载一份：多个单据面板共享，避免每个面板各拉一次流程与轨迹。
 */
export const useApprovalStore = defineStore('approval', () => {
  const flows = ref([])
  const approvals = ref([])
  const loaded = ref(false)

  async function load(force = false) {
    if (loaded.value && !force) return
    const [f, a] = await Promise.all([
      dataService.list(COLLECTION.systemFlows),
      dataService.list(COLLECTION.docApprovals)
    ])
    flows.value = f
    approvals.value = a
    loaded.value = true
  }

  /** 写入一条审批记录并同步到本地列表 */
  async function addApproval(row) {
    const created = await dataService.create(COLLECTION.docApprovals, row)
    const record = created || row
    approvals.value.unshift(record)
    return record
  }

  /** 保存流程配置变更 */
  async function saveFlow(flow) {
    const saved = await dataService.update(COLLECTION.systemFlows, flow.id, flow)
    // 把服务端返回（含自增 version）写回调用方持有的对象：
    // 设计器的 selected 与 store 数组是同一引用，只替换数组元素会让调用方
    // 继续用旧 version 提交，第二次保存被乐观锁拒绝（P3-D4）。
    if (saved) Object.assign(flow, saved)
    const idx = flows.value.findIndex(f => f.id === flow.id)
    if (idx > -1) flows.value[idx] = flow
    return flow
  }

  /** 新建流程 */
  async function addFlow(flow) {
    const created = await dataService.create(COLLECTION.systemFlows, flow)
    const record = created || flow
    flows.value.push(record)
    return record
  }

  return { flows, approvals, loaded, load, addApproval, saveFlow, addFlow }
})

export default useApprovalStore
