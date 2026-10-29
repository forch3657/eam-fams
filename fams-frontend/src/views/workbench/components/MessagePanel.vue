<template>
  <div class="wb-msg-wrap">
    <div class="wb-msg-bar">
      <span class="wb-msg-count">{{ messages.length }} 条{{ unread ? `，${unread} 条未读` : '' }}</span>
      <el-button v-if="unread" link type="primary" size="small" @click="markAll">全部已读</el-button>
    </div>
    <div v-if="!messages.length" class="wb-none">
      <el-empty description="暂无消息" :image-size="60" />
      <p class="wb-none-tip">审批结果、库存提醒等信息会以站内信的形式出现在这里。</p>
    </div>
    <div v-else class="wb-msg-list">
      <div
        v-for="m in messages"
        :key="m.id"
        class="wb-msg"
        :class="{ unread: !m.read }"
        @click="open(m)"
      >
        <div class="wb-msg-title">
          <span class="wb-dot" v-if="!m.read" />
          {{ m.title }}
        </div>
        <div class="wb-msg-content">{{ m.content }}</div>
        <div class="wb-msg-time">{{ formatDateTime(m.time) }} · {{ m.type }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
/**
 * 我的消息（内容区，外层卡片与页签由工作台承载）
 *
 * 可见性由 wm:message 权限控制（角色管理里勾选后普通用户也能看到）。
 * 消息内容沿用系统消息中心的数据（站内信按单位广播），这里只做只读速览。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifyStore } from '../../../store/notify'
import { formatDateTime } from '../../../utils/format'

const router = useRouter()
const notifyStore = useNotifyStore()

const messages = computed(() => notifyStore.inbox.slice(0, 20))
const unread = computed(() => notifyStore.unreadCount)

async function open(m) {
  if (!m.read) await notifyStore.markRead(m.id)
  if (m.route) router.push(m.route)
}

async function markAll() {
  await notifyStore.markAllRead()
}
</script>

<style scoped>
.wb-msg-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.wb-msg-count { font-size: 12px; color: var(--t-weak); }
.wb-msg-list { max-height: 340px; overflow-y: auto; }
.wb-msg { padding: 9px 4px; border-bottom: 1px dashed var(--bd); cursor: pointer; }
.wb-msg:last-child { border-bottom: none; }
.wb-msg:hover { background: var(--bg-hover, #f5f7fa); }
.wb-msg-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; line-height: 1.4; }
.wb-msg-content { font-size: 12px; color: var(--t-weak); margin-top: 3px; line-height: 1.5; }
.wb-msg-time { font-size: var(--fs-xs); color: var(--t-weak); margin-top: 4px; }
.wb-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c-danger); display: inline-block; flex-shrink: 0; }
.wb-none {
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--sp-2) 0;
}
.wb-none :deep(.el-empty) { padding: var(--sp-2) 0; }
.wb-none-tip {
  max-width: 320px;
  margin: var(--sp-1) auto 0;
  font-size: var(--fs-xs);
  color: var(--t-weak);
  text-align: center;
  line-height: 1.6;
}
</style>