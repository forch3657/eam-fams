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
      <div class="ov-cell clickable" @click="go('/fixed-asset-reports')">
        <div class="ov-hd">资产总览<span class="ov-go">→</span></div>
        <div class="ov-nums">
          <span class="n"><span class="lb">总数</span><b class="metric-num">{{ overview.asset.total }}</b></span>
          <span class="n"><span class="lb">原值</span><b class="metric-num"><i class="cur">¥</i>{{ formatMoney(overview.asset.original) }}</b></span>
          <span class="n"><span class="lb">净值</span><b class="metric-num"><i class="cur">¥</i>{{ formatMoney(overview.asset.net) }}</b></span>
        </div>
        <div class="ov-chips">
          <span v-for="s in overview.asset.byStatus" :key="s.name" class="chip">{{ s.name }} {{ s.value }}</span>
          <span v-if="!overview.asset.byStatus.length" class="chip muted">暂无数据</span>
        </div>
      </div>

      <div class="ov-cell clickable" @click="go('/low-value-asset-reports')">
        <div class="ov-hd">低值资产总览<span class="ov-go">→</span></div>
        <div class="ov-nums">
          <span class="n"><span class="lb">物品种类</span><b class="metric-num">{{ overview.lowValue.itemKinds }}</b></span>
          <span class="n"><span class="lb">库存金额</span><b class="metric-num"><i class="cur">¥</i>{{ formatMoney(overview.lowValue.stockAmount) }}</b></span>
          <span class="n"><span class="lb">审批占用</span><b class="metric-num">{{ overview.lowValue.reservedTotal }}</b><span class="unit">件</span></span>
        </div>
        <div class="ov-chips">
          <span v-for="t in overview.lowValue.topTypes" :key="t.name" class="chip">{{ t.name }} {{ t.value }}</span>
          <span v-if="!overview.lowValue.topTypes.length" class="chip muted">暂无数据</span>
        </div>
      </div>

      <div class="ov-cell">
        <div class="ov-hd">审批时效（近 7 天）</div>
        <div class="ov-nums">
          <span class="n"><span class="lb">提交</span><b class="metric-num">{{ overview.approval.submitCount }}</b></span>
          <span class="n"><span class="lb">通过</span><b class="metric-num">{{ overview.approval.agreeCount }}</b></span>
          <span class="n"><span class="lb">驳回</span><b class="metric-num">{{ overview.approval.rejectCount }}</b></span>
        </div>
        <div class="ov-chips">
          <span v-if="passRate !== null" class="chip">通过率 {{ passRate }}%</span>
          <span v-if="overview.approval.sampleCount" class="chip">平均 {{ overview.approval.avgHours }} 小时</span>
          <span v-else class="chip muted">暂无审批记录</span>
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

/** 近 7 天一次通过率（领导视角更关心"审得快不快、卡不卡"），无已办结单据时不显示 */
const passRate = computed(() => {
  const { agreeCount, rejectCount } = overview.value.approval
  const done = agreeCount + rejectCount
  return done ? Math.round((agreeCount / done) * 100) : null
})

function formatMoney(v) {
  return Math.round(Number(v || 0)).toLocaleString()
}
function go(path) {
  router.push(path)
}
</script>

<style scoped>
/* 概览是页面顶部的固定概览带：不参与 flex 伸缩，也不允许被压缩 */
.ov-panel { flex-shrink: 0; }
.panel-hd { display: flex; justify-content: space-between; align-items: center; }
.panel-ops { display: flex; align-items: center; gap: 4px; }

.ov-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
/* 三列之间 1px 中性分隔线：只表达分组，不与数字抢主色 */
.ov-cell {
  min-width: 0;
  padding-left: var(--content-px);
  border-left: 1px solid var(--bd);
  border-radius: var(--r-sm);
  transition: background-color .15s ease;
}
.ov-cell:first-child { padding-left: 0; border-left: none; }
/* 整列成为下钻入口，比右上角小链接更好点 */
.ov-cell.clickable { cursor: pointer; }
.ov-cell.clickable:hover { background: var(--bg-hover); }
.ov-go {
  margin-left: 6px;
  color: var(--c-action);
  opacity: 0;
  transition: opacity .15s ease;
}
.ov-cell.clickable:hover .ov-go { opacity: 1; }
.ov-hd {
  font-size: var(--fs-xs);
  color: var(--t-weak);
  line-height: 1.4;
  margin-bottom: var(--sp-1);
}

/* 数值语序统一为「标签 + 值」，经营数据用中性深色，不与可点击主色混淆 */
.ov-nums { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-4); margin-bottom: var(--sp-1); }
.ov-nums .n {
  display: flex;
  align-items: baseline;
  gap: 5px;
  font-size: var(--fs-xs);
  color: var(--t-weak);
  white-space: nowrap;
}
.ov-nums .n .lb { color: var(--t-sub); }
.ov-nums .n b {
  font-size: 22px;
  color: var(--c-data);
  line-height: 1.15;
}
/* 货币符号小一号，避免与数字抢视觉重量 */
.ov-nums .n b .cur {
  font-style: normal;
  font-size: .68em;
  font-weight: 600;
  color: var(--t-sub);
  margin-right: 1px;
}
.ov-nums .n .unit { font-size: var(--fs-xs); color: var(--t-weak); }

.ov-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.ov-chips .chip {
  font-size: var(--fs-xs);
  line-height: 18px;
  padding: 0 7px;
  border-radius: 9px;
  color: var(--t-sub);
  background: var(--bg-th);
  white-space: nowrap;
}
.ov-chips .chip.muted { color: var(--t-weak); }

/* 卡片正文内边距收紧，与整体紧凑风格一致；顶部概览带占高越少，下方待办越多 */
.ov-panel :deep(.el-card__body) { padding: 9px var(--content-px); }
.ov-panel :deep(.el-card__header) { padding: 6px var(--content-px); }

/* 窄屏：概览降为两列，第三组跨列，避免三列被挤成多行文字 */
@media (max-width: 1280px) {
  .ov-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: var(--sp-2); }
  .ov-cell:nth-child(3) {
    grid-column: 1 / -1;
    padding-top: var(--sp-2);
    padding-left: 0;
    border-left: none;
    border-top: 1px solid var(--bd);
  }
}

/* 矮屏：chips 单行截断，概览进一步压紧，给主体让出高度 */
@media (max-height: 720px) {
  .ov-chips { flex-wrap: nowrap; overflow: hidden; }
  .ov-nums { gap: var(--sp-3); margin-bottom: var(--sp-1); }
  .ov-nums .n b { font-size: 18px; }
  .ov-panel :deep(.el-card__body) { padding: var(--sp-1) var(--content-px); }
  .ov-panel :deep(.el-card__header) { padding: 2px var(--content-px); }
}
</style>