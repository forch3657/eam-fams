<template>
  <el-card shadow="never" class="ov-panel">
    <template #header>
      <div class="panel-hd">
        <span>概览看板</span>
        <div class="panel-ops">
          <el-button link type="primary" size="small" @click="go('/fixed-asset-reports')">资产报表</el-button>
          <el-button link type="primary" size="small" @click="go('/low-value-asset-reports')">低值报表</el-button>
        </div>
      </div>
    </template>

    <!-- 一行三格：指标横排 + 明细用 chip，压缩到约 120px 高，保证一屏可见 -->
    <div class="ov-grid">
      <div class="ov-cell">
        <div class="ov-hd">资产总览</div>
        <div class="ov-nums">
          <span class="n"><b>{{ overview.asset.total }}</b>总数</span>
          <span class="n"><b>¥{{ formatMoney(overview.asset.original) }}</b>原值</span>
          <span class="n"><b>¥{{ formatMoney(overview.asset.net) }}</b>净值</span>
        </div>
        <div class="ov-chips">
          <span v-for="s in overview.asset.byStatus" :key="s.name" class="chip">{{ s.name }} {{ s.value }}</span>
          <span v-if="!overview.asset.byStatus.length" class="chip muted">暂无数据</span>
        </div>
      </div>

      <div class="ov-cell">
        <div class="ov-hd">低值资产总览</div>
        <div class="ov-nums">
          <span class="n"><b>{{ overview.lowValue.itemKinds }}</b>物品种类</span>
          <span class="n"><b>¥{{ formatMoney(overview.lowValue.stockAmount) }}</b>库存金额</span>
          <span class="n"><b>{{ overview.lowValue.reservedTotal }}</b>审批占用</span>
        </div>
        <div class="ov-chips">
          <span v-for="t in overview.asset.topTypes" :key="t.name" class="chip">{{ t.name }} {{ t.value }}</span>
          <span v-if="!overview.asset.topTypes.length" class="chip muted">暂无数据</span>
        </div>
      </div>

      <div class="ov-cell">
        <div class="ov-hd">审批时效（近 7 天）</div>
        <div class="ov-nums">
          <span class="n"><b>{{ overview.approval.submitCount }}</b>提交</span>
          <span class="n"><b>{{ overview.approval.agreeCount }}</b>通过</span>
          <span class="n"><b>{{ overview.approval.rejectCount }}</b>驳回</span>
        </div>
        <div class="ov-chips">
          <span class="chip">平均 {{ overview.approval.avgHours }} 小时</span>
          <span class="chip">在途 {{ overview.approval.processing }} 单</span>
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
/**
 * 概览看板（wm:overview 权限控制）
 * 只给汇总指标与跳转入口，详细报表仍在各自的报表页，避免重复建设。
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkbenchStore } from '../../../store/workbench'

const router = useRouter()
const workbench = useWorkbenchStore()
const overview = computed(() => workbench.overview)

function formatMoney(v) {
  return Math.round(Number(v || 0)).toLocaleString()
}
function go(path) {
  router.push(path)
}
</script>

<style scoped>
/* 概览是整页的固定底栏：不参与 flex 伸缩，也不允许被压缩 */
.ov-panel { flex-shrink: 0; }
.panel-hd { display: flex; justify-content: space-between; align-items: center; }
.panel-ops { display: flex; align-items: center; gap: 4px; }

.ov-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
}
/* 三列之间用竖线分隔，比卡片套卡片更轻 */
.ov-cell {
  min-width: 0;
  padding-left: 14px;
  border-left: 2px solid var(--c-primary);
}
.ov-hd {
  font-size: 12px;
  color: var(--t-weak);
  line-height: 1.4;
  margin-bottom: 2px;
}

.ov-nums { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 6px; }
.ov-nums .n {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  color: var(--t-weak);
  white-space: nowrap;
}
.ov-nums .n b {
  font-size: 17px;
  font-weight: 700;
  color: var(--c-primary);
  line-height: 1.3;
}

.ov-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ov-chips .chip {
  font-size: 11px;
  line-height: 18px;
  padding: 0 7px;
  border-radius: 9px;
  color: var(--t-sub);
  background: var(--bg-fill, #f2f4f8);
  white-space: nowrap;
}
.ov-chips .chip.muted { color: var(--t-weak); }

/* 卡片正文内边距收紧，与整体紧凑风格一致 */
.ov-panel :deep(.el-card__body) { padding: 12px 16px; }
.ov-panel :deep(.el-card__header) { padding: 8px 16px; }
</style>