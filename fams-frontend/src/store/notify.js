import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, registerSeed, COLLECTION, useMock } from '../services'
import { useUserStore } from './user'

const MAX_MSG = 1000

function pad(n) { return String(n).padStart(2, '0') }

function nowStr() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 消息模板：{var} 占位，发送时按 vars 渲染。模板可在「消息模板」页维护
const DEFAULT_TEMPLATES = [
  { key: 'inbound_new', scene: '入库待验收', channel: '站内信+短信', title: '资产入库待验收：{asset}', content: '「{asset}」已提交入库申请（单据 {billNo}），请于 {date} 前完成验收。', enabled: true },
  { key: 'inbound_pass', scene: '入库验收通过', channel: '站内信', title: '入库验收通过：{asset}', content: '「{asset}」已通过验收并生成资产卡片，编号 {assetNo}。', enabled: true },
  { key: 'inbound_reject', scene: '入库验收驳回', channel: '站内信+短信', title: '入库验收被驳回：{asset}', content: '「{asset}」验收未通过，原因：{reason}，请补充资料后重新提交。', enabled: true },
  { key: 'dispatch_new', scene: '派发待确认', channel: '站内信', title: '资产派发待确认：{asset}', content: '「{asset}」已派发至 {dept}，使用人 {user}，请确认签收。', enabled: true },
  { key: 'dispatch_done', scene: '派发完成', channel: '站内信', title: '资产派发完成：{asset}', content: '「{asset}」已完成派发，当前使用人 {user}。', enabled: true },
  { key: 'borrow_due', scene: '借出到期提醒', channel: '站内信+短信', title: '借出即将到期：{asset}', content: '「{asset}」借出给 {user}，应于 {date} 归还，请及时提醒。', enabled: true },
  { key: 'borrow_overdue', scene: '借出逾期', channel: '站内信+短信', title: '借出已逾期：{asset}', content: '「{asset}」已逾期 {days} 天未归还，借用人 {user}，请跟进处理。', enabled: true },
  { key: 'change_submit', scene: '资产变更待审', channel: '站内信', title: '资产变更待审批：{asset}', content: '「{asset}」提交变更（{changeType}），单据 {billNo}，请审批。', enabled: true },
  { key: 'change_pass', scene: '资产变更通过', channel: '站内信', title: '资产变更已通过：{asset}', content: '「{asset}」的变更申请已通过，资产台账已同步更新。', enabled: true },
  { key: 'dispose_submit', scene: '处置申请待审', channel: '站内信+短信', title: '资产处置待审批：{asset}', content: '「{asset}」提交{disposeType}申请，原值 {amount} 元，请审批。', enabled: true },
  { key: 'dispose_pass', scene: '处置完成', channel: '站内信', title: '资产处置已完成：{asset}', content: '「{asset}」处置完成，已从在用台账转出。', enabled: true },
  { key: 'inventory_diff', scene: '盘点差异', channel: '站内信', title: '盘点差异待处理：{task}', content: '本次盘点发现盘盈 {gain} 项、盘亏 {loss} 项，请核实后提交调整。', enabled: true },
  { key: 'inventory_overdue', scene: '盘点逾期', channel: '站内信+短信', title: '盘点任务已逾期：{task}', content: '盘点任务「{task}」已超过截止日期 {date} 仍未完成，请尽快处理。', enabled: true },
  { key: 'depreciation_done', scene: '折旧计提完成', channel: '站内信', title: '{period} 折旧计提完成', content: '本期计提折旧 {amount} 元，涉及资产 {count} 项，请核对折旧报表。', enabled: true },
  { key: 'warning_idle', scene: '资产闲置预警', channel: '站内信', title: '资产闲置预警：{asset}', content: '「{asset}」已闲置 {days} 天，建议纳入调拨或处置计划。', enabled: true },
  { key: 'warning_unregistered', scene: '未入账预警', channel: '站内信', title: '资产未入账预警：{asset}', content: '「{asset}」已验收 {days} 天仍未生成资产卡片，请核查。', enabled: true },
  { key: 'asset_return', scene: '资产退库', channel: '站内信', title: '资产退库已确认：{asset}', content: '「{asset}」已由 {dept} 退回仓库，当前状态：空闲。', enabled: true }
]

const SEED_MESSAGES = [
  { id: 'MSG-000001', time: '2026-10-21 09:12:30', type: '入库待验收', level: '重要', title: '资产入库待验收：联想ThinkPad笔记本（20台）', content: '「联想ThinkPad笔记本」已提交入库申请（单据 RK202610021），请于 2026-10-24 前完成验收。', target: 'all', channel: '站内信+短信', read: false, route: '/fixed-assets' },
  { id: 'MSG-000002', time: '2026-10-21 08:40:12', type: '借出到期提醒', level: '紧急', title: '借出即将到期：佳能微单相机', content: '「佳能微单相机」借出给 市场部 陈晨，应于 2026-10-22 归还，请及时提醒。', target: 'all', channel: '站内信+短信', read: false, route: '/fixed-assets' },
  { id: 'MSG-000003', time: '2026-10-20 17:25:44', type: '盘点差异', level: '重要', title: '盘点差异待处理：2026年三季度固定资产盘点', content: '本次盘点发现盘盈 2 项、盘亏 1 项，请核实后提交调整。', target: 'all', channel: '站内信', read: false, route: '/fixed-assets' },
  { id: 'MSG-000004', time: '2026-10-20 15:03:18', type: '处置申请待审', level: '重要', title: '资产处置待审批：戴尔 OptiPlex 台式机（8台）', content: '「戴尔 OptiPlex 台式机」提交报废申请，原值 38400 元，请审批。', target: 'all', channel: '站内信+短信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000005', time: '2026-10-20 11:32:09', type: '折旧计提完成', level: '普通', title: '2026-09 折旧计提完成', content: '本期计提折旧 86,420.00 元，涉及资产 42 项，请核对折旧报表。', target: 'all', channel: '站内信', read: true, route: '/fixed-asset-reports' },
  { id: 'MSG-000006', time: '2026-10-19 16:48:21', type: '资产变更待审', level: '普通', title: '资产变更待审批：会议室 LED 显示屏', content: '「会议室 LED 显示屏」提交使用部门变更（技术部→品牌部），单据 BG202610019，请审批。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000007', time: '2026-10-19 10:07:55', type: '资产闲置预警', level: '普通', title: '资产闲置预警：爱普生投影仪（3台）', content: '「爱普生投影仪」已闲置 95 天，建议纳入调拨或处置计划。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000008', time: '2026-10-18 14:15:33', type: '派发完成', level: '普通', title: '资产派发完成：ThinkPad X1 Carbon', content: '「ThinkPad X1 Carbon」已完成派发，当前使用人 李萌（品牌部）。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000009', time: '2026-10-18 09:02:10', type: '入库验收通过', level: '普通', title: '入库验收通过：华为会议终端', content: '「华为会议终端」已通过验收并生成资产卡片，编号 GD20260156。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000010', time: '2026-10-17 18:21:47', type: '盘点逾期', level: '紧急', title: '盘点任务已逾期：研发中心设备专项盘点', content: '盘点任务「研发中心设备专项盘点」已超过截止日期 2026-10-15 仍未完成，请尽快处理。', target: 'all', channel: '站内信+短信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000011', time: '2026-10-17 11:44:06', type: '资产退库', level: '普通', title: '资产退库已确认：飞利浦空气净化器', content: '「飞利浦空气净化器」已由行政部退回仓库，当前状态：空闲。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' },
  { id: 'MSG-000012', time: '2026-10-16 15:58:39', type: '未入账预警', level: '重要', title: '资产未入账预警：实验用示波器', content: '「实验用示波器」已验收 30 天仍未生成资产卡片，请核查。', target: 'all', channel: '站内信', read: true, route: '/fixed-assets' }
]

export const useNotifyStore = defineStore('notify', () => {
  registerSeed(COLLECTION.notifyTemplates, DEFAULT_TEMPLATES)
  registerSeed(COLLECTION.notifyMessages, SEED_MESSAGES)

  const templates = ref(useMock ? DEFAULT_TEMPLATES.map(t => ({ ...t })) : [])
  const messages = ref(useMock ? SEED_MESSAGES.map(m => ({ ...m })) : [])
  const loaded = ref(false)

  async function loadAll() {
    const [tpls, msgs] = await Promise.all([
      dataService.list(COLLECTION.notifyTemplates),
      dataService.list(COLLECTION.notifyMessages)
    ])
    templates.value = tpls
    messages.value = msgs
    loaded.value = true
  }

  const allMessages = computed(() => messages.value)

  /** 当前登录用户可见的消息：target 为 all / 单位名 */
  const inbox = computed(() => {
    const u = useUserStore().user
    if (!u) return messages.value
    return messages.value.filter(m => !m.target || m.target === 'all' || m.target === u.org)
  })

  const unreadCount = computed(() => inbox.value.filter(m => !m.read).length)
  const unreadList = computed(() => inbox.value.filter(m => !m.read))

  function render(tpl, vars = {}) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
  }

  /** 直接推送一条消息 */
  async function push(msg) {
    const rec = {
      id: `MSG-${String(messages.value.length + 1).padStart(6, '0')}`,
      time: nowStr(),
      type: msg.type || '系统',
      level: msg.level || '普通',
      title: msg.title || '',
      content: msg.content || '',
      target: msg.target || 'all',
      channel: msg.channel || '站内信',
      bizType: msg.bizType || '',
      bizId: msg.bizId || '',
      route: msg.route || '',
      read: false
    }
    const created = await dataService.create(COLLECTION.notifyMessages, rec)
    messages.value.unshift(created || rec)
    if (messages.value.length > MAX_MSG) messages.value.length = MAX_MSG
    return created || rec
  }

  /** 旧数据里缺的新模板键，按默认补回 */
  async function syncDefaults() {
    DEFAULT_TEMPLATES.forEach(async d => {
      if (!templates.value.some(t => t.key === d.key)) {
        const created = await dataService.create(COLLECTION.notifyTemplates, { ...d })
        templates.value.push(created || { ...d })
      }
    })
  }

  /** 按模板发送：模板被停用则不发 */
  async function sendByTemplate(key, vars = {}, opts = {}) {
    await syncDefaults()
    const tpl = templates.value.find(t => t.key === key)
    if (!tpl || !tpl.enabled) return null
    return push({
      type: tpl.scene,
      channel: tpl.channel,
      title: render(tpl.title, vars),
      content: render(tpl.content, vars),
      ...opts
    })
  }

  async function markRead(id) {
    const m = messages.value.find(x => x.id === id)
    if (!m) return
    m.read = true
    await dataService.update(COLLECTION.notifyMessages, m._id || m.id, m)
  }

  async function markAllRead() {
    for (const m of inbox.value) {
      m.read = true
      await dataService.update(COLLECTION.notifyMessages, m._id || m.id, m)
    }
  }

  async function removeMessage(id) {
    const idx = messages.value.findIndex(x => x.id === id)
    if (idx === -1) return
    const [target] = messages.value.splice(idx, 1)
    await dataService.remove(COLLECTION.notifyMessages, target._id || target.id)
  }

  async function clearAll() {
    messages.value = []
    await dataService.replaceAll(COLLECTION.notifyMessages, [])
  }

  async function updateTemplate(key, updates) {
    const idx = templates.value.findIndex(t => t.key === key)
    if (idx === -1) return false
    Object.assign(templates.value[idx], updates)
    await dataService.update(COLLECTION.notifyTemplates, templates.value[idx]._id || key, templates.value[idx])
    return true
  }

  async function addTemplate(payload) {
    const key = (payload.key || '').trim()
    if (!key) return false
    if (templates.value.some(t => t.key === key)) return false
    const record = {
      key,
      scene: payload.scene || key,
      channel: payload.channel || '站内信',
      title: payload.title || '',
      content: payload.content || '',
      enabled: payload.enabled !== false
    }
    const created = await dataService.create(COLLECTION.notifyTemplates, record)
    templates.value.push(created || record)
    return true
  }

  async function removeTemplate(key) {
    if (DEFAULT_TEMPLATES.some(d => d.key === key)) return false
    const idx = templates.value.findIndex(t => t.key === key)
    if (idx === -1) return false
    const [target] = templates.value.splice(idx, 1)
    await dataService.remove(COLLECTION.notifyTemplates, target._id || key)
    return true
  }

  return {
    messages,
    templates,
    loaded,
    allMessages,
    inbox,
    unreadCount,
    unreadList,
    loadAll,
    push,
    sendByTemplate,
    syncDefaults,
    markRead,
    markAllRead,
    removeMessage,
    clearAll,
    updateTemplate,
    addTemplate,
    removeTemplate
  }
})
