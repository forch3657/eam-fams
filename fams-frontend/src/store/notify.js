import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { dataService, COLLECTION, useMock } from '../services'
import { SYSTEM_SEEDS } from '../services/mock/seed/system'
import { useUserStore } from './user'

const MAX_MSG = 1000

export const useNotifyStore = defineStore('notify', () => {
  // 种子由 services/mock/seed/index.js 统一注册；mock 模式下同步取一份填充首屏
  const seedOf = key => (useMock ? JSON.parse(JSON.stringify(SYSTEM_SEEDS[key])) : [])

  const templates = ref(seedOf('notifyTemplates'))
  const messages = ref(seedOf('notifyMessages'))
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

  /** 直接推送一条消息（主键由服务端生成） */
  async function push(msg) {
    const rec = {
      time: new Date().toISOString(),
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
    for (const d of SYSTEM_SEEDS.notifyTemplates) {
      if (!templates.value.some(t => t.key === d.key)) {
        const created = await dataService.create(COLLECTION.notifyTemplates, { ...d })
        templates.value.push(created || { ...d })
      }
    }
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
    await dataService.update(COLLECTION.notifyMessages, m.id, m)
  }

  async function markAllRead() {
    for (const m of inbox.value) {
      m.read = true
      await dataService.update(COLLECTION.notifyMessages, m.id, m)
    }
  }

  async function removeMessage(id) {
    const idx = messages.value.findIndex(x => x.id === id)
    if (idx === -1) return
    messages.value.splice(idx, 1)
    await dataService.remove(COLLECTION.notifyMessages, id)
  }

  async function clearAll() {
    messages.value = []
    await dataService.clear(COLLECTION.notifyMessages)
  }

  async function updateTemplate(key, updates) {
    const idx = templates.value.findIndex(t => t.key === key)
    if (idx === -1) return false
    Object.assign(templates.value[idx], updates)
    await dataService.update(COLLECTION.notifyTemplates, templates.value[idx].key || key, templates.value[idx])
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
    const idx = templates.value.findIndex(t => t.key === key)
    if (idx === -1) return false
    templates.value.splice(idx, 1)
    await dataService.remove(COLLECTION.notifyTemplates, key)
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
