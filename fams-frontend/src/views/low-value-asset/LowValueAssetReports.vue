<template>
  <div class="page-container">
    <div class="page-header">
      <h2>低值资产报表</h2>
      <div>
        <el-button type="primary" @click="handleExport">
          <el-icon><Download /></el-icon>
          导出报表
        </el-button>
      </div>
    </div>

    <el-card class="fill">
      <el-tabs v-model="activeTab">
        <!-- 类别统计 -->
        <el-tab-pane label="类别统计" name="category">
          <div class="grid-auto stat-cards">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">物品种类</div>
              <div class="stat-value"><span class="num">{{ store.stats.total }}</span> <span class="stat-unit">种</span></div>
              <div class="stat-amount num">库存数量 {{ store.stats.stockQuantity }}</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">库存金额</div>
              <div class="stat-value"><span class="num">¥{{ store.stats.stockAmount.toLocaleString() }}</span></div>
              <div class="stat-amount num">按当前单价估算</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">低库存预警</div>
              <div class="stat-value"><span class="num">{{ store.stats.lowStock }}</span> <span class="stat-unit">种</span></div>
              <div class="stat-amount num">低于安全库存</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">严重低库存</div>
              <div class="stat-value"><span class="num">{{ store.stats.warning }}</span> <span class="stat-unit">种</span></div>
              <div class="stat-amount num">低于安全库存的 {{ Math.round((store.stats.safetyRatio || 0) * 100) }}%</div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">累计领用金额</div>
              <div class="stat-value"><span class="num">¥{{ store.stats.requisitionAmount.toLocaleString() }}</span></div>
              <div class="stat-amount num">
                领用 {{ store.stats.requisitionQuantity }} 件
                <span v-if="store.stats.requisitionPendingQuantity > 0">（审批中 {{ store.stats.requisitionPendingQuantity }} 件未计入）</span>
              </div>
            </el-card>
            <el-card shadow="hover" class="stat-card">
              <div class="stat-name">审批占用</div>
              <div class="stat-value"><span class="num">{{ store.stats.reservedQuantityTotal }}</span> <span class="stat-unit">件</span></div>
              <div class="stat-amount num">审批中领用单占用，不计入可用库存</div>
            </el-card>
          </div>

          <el-table :data="pagedCategoryStats" style="width: 100%">
            <el-table-column prop="name" label="物品类别" width="140" />
            <el-table-column prop="count" label="物品种类" width="110" align="right" />
            <el-table-column prop="quantity" label="库存数量" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ row.quantity }}</span></template>
            </el-table-column>
            <el-table-column prop="amount" label="库存金额(元)" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="percentage" label="占比" width="100">
              <template #default="{ row }">{{ row.percentage }}%</template>
            </el-table-column>
            <el-table-column label="分布" min-width="220">
              <template #default="{ row }">
                <el-progress :percentage="row.percentage" :stroke-width="16" :text-inside="true" />
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="catPage"
              v-model:page-size="catPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="store.categoryStats.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 部门领用统计 -->
        <el-tab-pane label="部门领用统计" name="dept">
          <el-form :inline="true" class="search-form">
            <el-form-item label="部门">
              <el-input v-model="deptSearch.dept" placeholder="请输入部门名称" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="deptPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="deptSearch.dept = ''">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedDeptStats" style="width: 100%">
            <el-table-column prop="dept" label="领用部门" min-width="160" />
            <el-table-column prop="times" label="领用次数" width="110" align="right" />
            <el-table-column prop="quantity" label="领用数量" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ row.quantity }}</span></template>
            </el-table-column>
            <el-table-column prop="amount" label="领用金额(元)" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="percentage" label="占比" width="100">
              <template #default="{ row }">{{ row.percentage }}%</template>
            </el-table-column>
            <el-table-column label="分布" min-width="220">
              <template #default="{ row }">
                <el-progress :percentage="row.percentage" :stroke-width="16" :text-inside="true" />
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="deptPage"
              v-model:page-size="deptPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredDeptStats.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 出入库汇总 -->
        <el-tab-pane label="出入库汇总" name="flow">
          <el-form :inline="true" class="search-form">
            <el-form-item label="物品名称">
              <el-input v-model="flowSearch.name" placeholder="请输入物品名称" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="物品类别">
              <el-select v-model="flowSearch.category" placeholder="全部" clearable style="width: 140px">
                <el-option v-for="c in store.categoryOptions" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="flowPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetFlowSearch">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedFlowSummary" style="width: 100%">
            <el-table-column prop="name" label="物品名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="categoryName" label="物品类别" width="110" />
            <el-table-column prop="spec" label="规格型号" min-width="200" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="inbound" label="入库数量" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.inbound }}</span></template>
            </el-table-column>
            <el-table-column prop="requisition" label="领用数量" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.requisition }}</span></template>
            </el-table-column>
            <el-table-column prop="return" label="退库数量" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.return }}</span></template>
            </el-table-column>
            <el-table-column prop="stock" label="当前库存" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.stock }}</span></template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="flowPage"
              v-model:page-size="flowPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredFlowSummary.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Search } from '@element-plus/icons-vue'
import { useLowValueAssetStore } from '../../store/lowValueAsset'

const store = useLowValueAssetStore()
const activeTab = ref('category')

const tabNames = { category: '类别统计', dept: '部门领用统计', flow: '出入库汇总' }

// 类别统计
const catPage = ref(1)
const catPageSize = ref(15)
const pagedCategoryStats = computed(() => {
  const start = (catPage.value - 1) * catPageSize.value
  return store.categoryStats.slice(start, start + catPageSize.value)
})

// 部门领用统计
const deptSearch = reactive({ dept: '' })
watch(deptSearch, () => { deptPage.value = 1 }, { deep: true })
const deptPage = ref(1)
const deptPageSize = ref(15)

const filteredDeptStats = computed(() => {
  const kw = deptSearch.dept.trim()
  return kw ? store.deptStats.filter(d => d.dept.includes(kw)) : store.deptStats
})

const pagedDeptStats = computed(() => {
  const start = (deptPage.value - 1) * deptPageSize.value
  return filteredDeptStats.value.slice(start, start + deptPageSize.value)
})

// 出入库汇总
const flowSearch = reactive({ name: '', category: '' })
watch(flowSearch, () => { flowPage.value = 1 }, { deep: true })
const flowPage = ref(1)
const flowPageSize = ref(15)

const filteredFlowSummary = computed(() => {
  return store.flowSummary.filter(r => {
    const nameMatch = !flowSearch.name || r.name.includes(flowSearch.name)
    const categoryMatch = !flowSearch.category || r.category === flowSearch.category
    return nameMatch && categoryMatch
  })
})

const pagedFlowSummary = computed(() => {
  const start = (flowPage.value - 1) * flowPageSize.value
  return filteredFlowSummary.value.slice(start, start + flowPageSize.value)
})

function resetFlowSearch() {
  flowSearch.name = ''
  flowSearch.category = ''
  flowPage.value = 1
}

function downloadCsv(headers, rows, filename) {
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`导出${tabNames[activeTab.value]}报表成功`)
}

function handleExport() {
  const date = new Date().toISOString().slice(0, 10)
  if (activeTab.value === 'category') {
    const headers = ['物品类别', '物品种类', '库存数量', '库存金额(元)', '占比(%)']
    const rows = store.categoryStats.map(r => [r.name, r.count, r.quantity, r.amount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.category}_${date}.csv`)
  } else if (activeTab.value === 'dept') {
    const headers = ['领用部门', '领用次数', '领用数量', '领用金额(元)', '占比(%)']
    const rows = filteredDeptStats.value.map(r => [r.dept, r.times, r.quantity, r.amount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.dept}_${date}.csv`)
  } else {
    const headers = ['物品名称', '物品类别', '规格型号', '单位', '入库数量', '领用数量', '退库数量', '当前库存']
    const rows = filteredFlowSummary.value.map(r => [r.name, r.category, r.spec, r.unit, r.inbound, r.requisition, r.return, r.stock])
    downloadCsv(headers, rows, `导出_${tabNames.flow}_${date}.csv`)
  }
}
</script>

<style scoped>
.search-form {
  margin-bottom: 16px;
}

.stat-cards {
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
  transition: all 0.3s;
}

.stat-card:hover {
  transform: translateY(-4px);
}

.stat-name {
  font-size: 14px;
  color: var(--t-weak);
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: var(--t-main);
  margin-bottom: 4px;
}

.stat-unit {
  font-size: 14px;
  color: var(--t-weak);
  font-weight: normal;
}

.stat-amount {
  font-size: 13px;
  color: var(--c-danger);
}
</style>
