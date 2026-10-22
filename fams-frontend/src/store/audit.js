import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, registerSeed, COLLECTION, useMock } from '../services'
import { useUserStore } from './user'

const MAX_OPLOG = 2000

function pad(n) { return String(n).padStart(2, '0') }

function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 固定资产域的示例操作日志，便于「操作日志」页开箱可见
const SEED_LOGS = [
  { id: 'OL-000012', time: '2026-10-21 09:18:02', module: '资产管理', action: '新增资产', target: '联想ThinkPad笔记本', result: '成功', detail: '新增资产卡片 GD20260162，原值 128000 元', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000011', time: '2026-10-21 09:02:47', module: '入库验收', action: '提交验收', target: 'RK202610021', result: '成功', detail: '提交 20 台笔记本验收申请', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000010', time: '2026-10-20 17:31:15', module: '资产盘点', action: '登记盘盈', target: 'PD-2026-003', result: '成功', detail: '登记盘盈资产 2 项', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000009', time: '2026-10-20 15:09:53', module: '资产处置', action: '提交处置申请', target: 'CZ202610008', result: '成功', detail: '批量报废台式机 8 台，原值 38400 元', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000008', time: '2026-10-20 11:40:28', module: '折旧管理', action: '计提折旧', target: '2026-09', result: '成功', detail: '计提折旧 86420.00 元，涉及资产 42 项', ip: '127.0.0.1', operator: '系统', operatorOrg: '系统' },
  { id: 'OL-000007', time: '2026-10-19 16:52:11', module: '资产变更', action: '提交变更', target: 'BG202610019', result: '成功', detail: '会议室 LED 显示屏使用部门变更', ip: '192.168.10.28', operator: '王五', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000006', time: '2026-10-19 10:12:36', module: '借出管理', action: '新增借出单', target: 'JC202610011', result: '成功', detail: '佳能微单相机借出给陈晨，预计 10-22 归还', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000005', time: '2026-10-18 14:20:07', module: '派发管理', action: '确认派发', target: 'PF202610007', result: '成功', detail: 'ThinkPad X1 Carbon 派发至品牌部李萌', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000004', time: '2026-10-18 09:06:44', module: '系统管理', action: '修改参数', target: '资产编号前缀', result: '成功', detail: 'sys.asset.code.prefix: GD → GD', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000003', time: '2026-10-17 18:26:19', module: '资产盘点', action: '标记盘亏', target: 'PD-2026-003', result: '成功', detail: '实验用示波器标记盘亏', ip: '192.168.10.31', operator: '李四', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000002', time: '2026-10-17 11:50:03', module: '组织架构', action: '编辑用户', target: '孙七', result: '成功', detail: '调整所属部门为资产管理部', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' },
  { id: 'OL-000001', time: '2026-10-16 16:02:58', module: '系统管理', action: '修改模板', target: 'borrow_due', result: '成功', detail: '借出到期提醒模板内容调整', ip: '192.168.10.24', operator: '张管理员', operatorOrg: '固定资产管理中心' }
]

export const useAuditStore = defineStore('audit', () => {
  registerSeed(COLLECTION.operationLogs, SEED_LOGS)

  const opLogs = ref(useMock ? SEED_LOGS.map(r => ({ ...r })) : [])
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

  /** 系统操作日志 */
  async function logOp(entry) {
    const rec = {
      id: `OL-${String(opLogs.value.length + 1).padStart(6, '0')}`,
      time: nowStr(),
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
    await dataService.replaceAll(COLLECTION.operationLogs, [])
  }

  return { opLogs, loaded, allOpLogs, opLogCount, loadAll, logOp, clearOpLogs }
})
