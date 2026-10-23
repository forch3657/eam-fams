<template>
  <el-card shadow="never" class="wb-panel">
    <template #header>
      <div class="panel-hd">
        <span>概览看板</span>
        <div class="panel-ops">
          <el-button link type="primary" size="small" @click="go('/fixed-asset-reports')">资产报表</el-button>
          <el-button link type="primary" size="small" @click="go('/low-value-asset-reports')">低值报表</el-button>
        </div>
      </div>
    </template>

    <el-row :gutter="16">
      <el-col :span="8">
        <div class="ov-block">
          <div class="ov-title">资产总览</div>
          <div class="ov-kpis">
            <div class="ov-kpi"><span class="v">{{ overview.asset.total }}</span><span class="k">资产总数</span></div>
            <div class="ov-kpi"><span class="v">¥{{ formatMoney(overview.asset.original) }}</span><span class="k">原值合计</span></div>
            <div class="ov-kpi"><span class="v">¥{{ formatMoney(overview.asset.net) }}</span><span class="k">净值合计</span></div>
          </div>
          <div class="ov-list">
            <div v-for="s in overview.asset.byStatus" :key="s.name" class="ov-line">
              <span class="nm">{{ s.name }}</span>
              <el-progress :percentage="pct(s.value, overview.asset.total)" :show-text="false" :stroke-width="8" class="bar" />
              <span class="vl">{{ s.value }}</span>
            </div>
          </div>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="ov-block">
          <div class="ov-title">低值资产总览</div>
          <div class="ov-kpis">
            <div class="ov-kpi"><span class="v">{{ overview.lowValue.itemKinds }}</span><span class="k">物品种类</span></div>
            <div class="ov-kpi"><span class="v">¥{{ formatMoney(overview.lowValue.stockAmount) }}</span><span class="k">库存金额</span></div>
            <div class="ov-kpi"><span class="v">{{ overview.lowValue.reservedTotal }}</span><span class="k">审批占用</span></div>
          </div>
          <div class="ov-list">
            <div v-for="t in overview.asset.topTypes" :key="t.name" class="ov-line">
              <span class="nm">{{ t.name }}</span>
              <el-progress :percentage="pct(t.value, overview.asset.total)" :show-text="false" :stroke-width="8" class="bar" />
              <span class="vl">{{ t.value }}</span>
            </div>
            <div v-if="!overview.asset.topTypes.length" class="ov-tip">暂无数据</div>
          </div>
        </div>
      </el-col>

      <el-col :span="8">
        <div class="ov-block">
          <div class="ov-title">审批时效（近 7 天）</div>
          <div class="ov-kpis">
            <div class="ov-kpi"><span class="v">{{ overview.approval.submitCount }}</span><span class="k">提交</span></div>
            <div class="ov-kpi"><span class="v">{{ overview.approval.agreeCount }}</span><span class="k">通过</span></div>
            <div class="ov-kpi"><span class="v">{{ overview.approval.rejectCount }}</span><span class="k">驳回</span></div>
          </div>
          <div class="ov-list">
            <div class="ov-line"><span class="nm">平均审批时长</span><span class="vl">{{ overview.approval.avgHours }} 小时</span></div>
            <div class="ov-line"><span class="nm">在途单据</span><span class="vl">{{ overview.approval.processing }} 单</span></div>
          </div>
        </div>
      </el-col>
    </el-row>
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

function pct(value, total) {
  if (!total) return 0
  return Math.round((Number(value || 0) / Number(total)) * 100)
}
function formatMoney(v) {
  return Math.round(Number(v || 0)).toLocaleString()
}
function go(path) {
  router.push(path)
}
</script>

<style scoped>
.wb-panel { margin-bottom: 16px; }
.panel-hd { display: flex; justify-content: space-between; align-items: center; }
.ov-block { height: 100%; }
.ov-title { font-size: 13px; font-weight: 600; margin-bottom: 12px; }
.ov-kpis { display: flex; gap: 14px; margin-bottom: 12px; }
.ov-kpi { display: flex; flex-direction: column; }
.ov-kpi .v { font-size: 19px; font-weight: 700; color: var(--c-primary); line-height: 1.4; }
.ov-kpi .k { font-size: 12px; color: var(--t-weak); }
.ov-list { display: flex; flex-direction: column; gap: 7px; }
.ov-line { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.ov-line .nm { width: 74px; color: var(--t-weak); flex-shrink: 0; }
.ov-line .bar { flex: 1; }
.ov-line .vl { width: 40px; text-align: right; }
.ov-tip { font-size: 12px; color: var(--t-weak); }
.ov-title-sub { margin-top: 16px; padding-top: 12px; border-top: 1px dashed var(--bd); }
.ov-steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.ov-step { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--bd); border-radius: var(--r-md); }
.ov-step .n { font-size: 20px; font-weight: 700; color: var(--c-primary); min-width: 30px; text-align: center; }
.ov-step .t { font-size: 13px; font-weight: 600; }
.ov-step .r { font-size: 12px; color: var(--t-weak); }
</style>