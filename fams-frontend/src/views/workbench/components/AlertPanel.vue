<template>
  <div class="wb-alert">
    <div v-if="!alerts.length" class="wb-none">
      <el-empty description="暂无预警" :image-size="60">
        <el-button size="small" link type="primary" @click="router.push('/low-value-assets')">查看低值库存</el-button>
      </el-empty>
      <p class="wb-none-tip">库存与单据都在正常范围；低库存、单据滞留或驳回未重提时会在这里提醒。</p>
    </div>
    <ul v-else class="wb-alert-list">
      <li v-for="a in alerts" :key="a.id" @click="go(a)">
        <el-tag :type="levelType(a.level)" size="small" effect="light">{{ a.type }}</el-tag>
        <div class="wb-alert-body">
          <div class="wb-alert-title">{{ a.title }}</div>
          <div class="wb-alert-desc">{{ a.desc }}</div>
        </div>
        <el-icon class="wb-arrow"><ArrowRight /></el-icon>
      </li>
    </ul>
  </div>
</template>

<script setup>
/**
 * 预警中心（内容区，外层卡片与页签由工作台承载）
 *
 * 数据来自 services/workbench.js 的 buildAlerts：
 * 低值低库存 / 库存被审批占用 / 盘点到期 / 单据滞留 / 驳回未重提。
 * 点击直接跳到对应业务页面处理。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight } from '@element-plus/icons-vue'
import { useWorkbenchStore } from '../../../store/workbench'

const router = useRouter()
const workbench = useWorkbenchStore()

const alerts = computed(() => workbench.alerts)

function levelType(level) {
  return { danger: 'danger', warning: 'warning', info: 'info' }[level] || 'info'
}

function go(a) {
  router.push({ path: a.route, query: a.tab ? { tab: a.tab } : {} })
}
</script>

<style scoped>
.wb-alert-list { list-style: none; margin: 0; padding: 0; }
.wb-alert-list li { display: flex; align-items: flex-start; gap: 8px; padding: 9px 4px; border-bottom: 1px dashed var(--bd); cursor: pointer; }
.wb-alert-list li:last-child { border-bottom: none; }
.wb-alert-list li:hover { background: var(--bg-hover, #f5f7fa); }
.wb-alert-body { flex: 1; min-width: 0; }
/* 标题最多两行，超出省略，避免长物品名把整条预警撑得很高 */
.wb-alert-title {
  font-size: 13px; font-weight: 600; line-height: 1.4;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.wb-alert-desc { font-size: 12px; color: var(--t-weak); margin-top: 2px; line-height: 1.4; }
.wb-arrow { color: var(--t-weak); margin-top: 4px; flex-shrink: 0; }
/* 空态在卡片内容区垂直居中，并给出一个可继续的操作 */
.wb-none {
  min-height: 220px;
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