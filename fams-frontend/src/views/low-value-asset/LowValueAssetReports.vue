<template>
  <div class="page-container">
    <div class="page-header">
      <h2>低值资产报表</h2>
      <div>
        <el-button v-if="can('lv:export')" type="primary" @click="handleExport">
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

        <!-- 公司统计：库存按物品归属公司、领用按单据归属公司，合计与下钻同源 -->
        <el-tab-pane label="公司统计" name="company">
          <el-table
            :data="companyStats"
            class="clickable-table"
            style="width: 100%"
            show-summary
            :summary-method="companySummary"
            @row-click="openCompanyDetail"
          >
            <el-table-column prop="company" label="所属公司" min-width="180">
              <template #default="{ row }"><el-link type="primary" :underline="false">{{ row.company }}</el-link></template>
            </el-table-column>
            <el-table-column prop="kinds" label="物品种类" width="100" align="right" />
            <el-table-column prop="stock" label="库存数量" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.stock }}</span></template>
            </el-table-column>
            <el-table-column prop="amount" label="库存金额(元)" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="lowStock" label="低库存种类" width="110" align="right" />
            <el-table-column prop="reqTimes" label="领用次数" width="100" align="right" />
            <el-table-column prop="reqQuantity" label="领用数量" width="110" align="right">
              <template #default="{ row }"><span class="num">{{ row.reqQuantity }}</span></template>
            </el-table-column>
            <el-table-column prop="reqAmount" label="领用金额(元)" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.reqAmount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column label="占比" min-width="200">
              <template #default="{ row }"><el-progress :percentage="row.percentage" :stroke-width="14" /></template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="openCompanyDetail(row)">下钻明细</el-button>
              </template>
            </el-table-column>
          </el-table>
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

          <el-table :data="pagedDeptStats" class="clickable-table" style="width: 100%" @row-click="openDeptDetail">
            <el-table-column prop="dept" label="领用部门" min-width="160">
              <template #default="{ row }"><el-link type="primary" :underline="false">{{ row.dept }}</el-link></template>
            </el-table-column>
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
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="openDeptDetail(row)">查看明细</el-button>
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

        <!-- 使用人领用统计 -->
        <el-tab-pane label="使用人领用统计" name="receiver">
          <el-form :inline="true" class="search-form">
            <el-form-item label="领用人">
              <el-input v-model="receiverSearch.name" placeholder="请输入领用人" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="部门">
              <el-input v-model="receiverSearch.department" placeholder="请输入部门" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="receiverPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetReceiverSearch">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedReceiverStats" class="clickable-table" style="width: 100%" @row-click="openReceiverDetail">
            <el-table-column prop="receiver" label="领用人" min-width="120">
              <template #default="{ row }"><el-link type="primary" :underline="false">{{ row.receiver }}</el-link></template>
            </el-table-column>
            <el-table-column prop="department" label="所属部门" min-width="160" />
            <el-table-column prop="times" label="领用次数" width="110" align="right" />
            <el-table-column prop="quantity" label="领用数量" width="120" align="right" />
            <el-table-column label="领用金额(元)" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ Number(row.amount || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="percentage" label="占比" width="100">
              <template #default="{ row }">{{ row.percentage }}%</template>
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="openReceiverDetail(row)">查看明细</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="receiverPage"
              v-model:page-size="receiverPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredReceiverStats.length"
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
                <el-option v-for="c in categoryOptions" :key="c.value" :label="c.label" :value="c.value" />
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

    <!-- 部门 / 使用人领用统计下钻：明细取自同一批已生效领用单，口径与统计行一致 -->
    <el-dialog v-model="detailVisible" :title="detailTitle" width="1080px" top="6vh">
      <div class="detail-toolbar">
        <span>共 {{ detailRows.length }} 条领用单</span>
        <el-button v-if="can('lv:export')" size="small" type="primary" plain @click="exportDetail">
          <el-icon><Download /></el-icon>
          导出明细
        </el-button>
      </div>
      <el-table :data="detailRows" max-height="480" style="width: 100%">
        <el-table-column prop="docNo" label="单据编号" width="140" />
        <el-table-column prop="itemName" label="物品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="receiver" label="领用人" width="100" />
        <el-table-column prop="deptName" label="领用部门" min-width="160" show-overflow-tooltip />
        <el-table-column prop="quantity" label="领用数量" width="110" align="right" />
        <el-table-column label="领用金额(元)" width="140" align="right">
          <template #default="{ row }"><span class="num">¥{{ Number(row.amount || 0).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column prop="requisitionDate" label="领用日期" width="120" />
        <el-table-column prop="purpose" label="用途" min-width="160" show-overflow-tooltip />
      </el-table>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 公司统计下钻：库存物品 + 该公司已生效领用单，口径与统计行一致 -->
    <el-dialog v-model="companyDetailVisible" :title="companyDetailTitle" width="1080px" top="6vh">
      <div class="detail-toolbar">
        <span>库存物品 {{ companyStockRows.length }} 种 · 已生效领用单 {{ companyReqRows.length }} 张</span>
        <el-button v-if="can('lv:export')" size="small" type="primary" plain @click="exportCompanyDetail">
          <el-icon><Download /></el-icon>
          导出库存明细
        </el-button>
      </div>
      <div class="detail-section-title">库存物品明细</div>
      <el-table :data="companyStockRows" max-height="300" style="width: 100%">
        <el-table-column prop="code" label="物品编号" width="130" />
        <el-table-column prop="name" label="物品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="categoryName" label="物品类别" width="110" />
        <el-table-column prop="spec" label="规格型号" min-width="180" show-overflow-tooltip />
        <el-table-column prop="stock" label="库存数量" width="100" align="right" />
        <el-table-column label="单价(元)" width="100" align="right">
          <template #default="{ row }"><span class="num">¥{{ Number(row.price || 0).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="库存金额(元)" width="130" align="right">
          <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
        </el-table-column>
      </el-table>
      <div class="detail-section-title">已生效领用单</div>
      <el-table :data="companyReqRows" max-height="260" style="width: 100%">
        <el-table-column prop="docNo" label="单据编号" width="140" />
        <el-table-column prop="itemName" label="物品名称" min-width="180" show-overflow-tooltip />
        <el-table-column prop="receiver" label="领用人" width="100" />
        <el-table-column prop="deptName" label="领用部门" min-width="160" show-overflow-tooltip />
        <el-table-column prop="quantity" label="领用数量" width="110" align="right" />
        <el-table-column label="领用金额(元)" width="140" align="right">
          <template #default="{ row }"><span class="num">¥{{ Number(row.amount || 0).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column prop="requisitionDate" label="领用日期" width="120" />
      </el-table>
      <template #footer>
        <el-button @click="companyDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Download, Search } from '@element-plus/icons-vue'
import { useLowValueAssetStore } from '../../store/lowValueAsset'
import { useOrgStore } from '../../store/org'
import { useUserStore } from '../../store/user'

const store = useLowValueAssetStore()
const orgStore = useOrgStore()
const userStore = useUserStore()
// 报表由 store 现算，进入页面时重新拉取，避免统计口径落后于导入/审批结果
onMounted(() => { if (userStore.can('lv:view')) store.loadAll().catch(() => {}) })
const activeTab = ref('category')
/** 类别选项取自数据字典（系统管理 > 数据字典 > 低值资产类别） */
const categoryOptions = computed(() => store.categoryOptions)

const tabNames = { category: '类别统计', company: '公司统计', dept: '部门领用统计', receiver: '使用人领用统计', flow: '出入库汇总' }

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

// 使用人领用统计：按领用人聚合已生效领用单，与部门统计共用同一批单据
const settledRequisitions = computed(() => store.requisitionRecords.filter(r => r.status === 'DONE'))
const deptNameOf = r => (r.deptId ? (orgStore.deptName(r.deptId) || r.deptId) : '未指定')
const receiverStats = computed(() => {
  const map = new Map()
  settledRequisitions.value.forEach(r => {
    const key = r.receiver || '未指定'
    const cur = map.get(key) || { receiver: key, department: '', times: 0, quantity: 0, amount: 0 }
    cur.times += 1
    cur.quantity += Number(r.quantity) || 0
    cur.amount += Number(r.amount) || 0
    if (!cur.department) cur.department = deptNameOf(r)
    map.set(key, cur)
  })
  const total = [...map.values()].reduce((s, x) => s + x.amount, 0)
  return [...map.values()]
    .map(x => ({ ...x, amount: Math.round(x.amount * 100) / 100, percentage: total ? Math.round(x.amount / total * 1000) / 10 : 0 }))
    .sort((a, b) => b.amount - a.amount)
})

/**
 * 公司统计：库存按物品台账的 companyId 归属，领用按已生效领用单的 companyId 归属。
 * 与类别统计共用 store.items / settledRequisitions，确保「合计 = 各公司下钻之和」。
 */
const round2 = n => Math.round((Number(n) || 0) * 100) / 100
const companyStats = computed(() => {
  const map = new Map()
  const rowOf = id => {
    const key = id || ''
    let row = map.get(key)
    if (!row) {
      row = {
        id: key,
        company: orgStore.companyName(key) || (key ? key : '未分配'),
        kinds: 0, stock: 0, amount: 0, lowStock: 0,
        reqTimes: 0, reqQuantity: 0, reqAmount: 0
      }
      map.set(key, row)
    }
    return row
  }
  store.items.forEach(i => {
    const row = rowOf(i.companyId)
    const stock = Number(i.stock) || 0
    row.kinds++
    row.stock += stock
    row.amount += stock * (Number(i.price) || 0)
    if (stock <= (Number(i.safetyStock) || 0)) row.lowStock++
  })
  settledRequisitions.value.forEach(r => {
    const row = rowOf(r.companyId)
    row.reqTimes++
    row.reqQuantity += Number(r.quantity) || 0
    row.reqAmount += Number(r.amount) || 0
  })
  const total = [...map.values()].reduce((s, r) => s + r.amount, 0)
  return [...map.values()]
    .map(r => ({
      ...r,
      amount: round2(r.amount),
      reqAmount: round2(r.reqAmount),
      percentage: total ? Math.round(r.amount / total * 1000) / 10 : 0
    }))
    .sort((a, b) => b.amount - a.amount)
})

/** 合计行只汇总数量/金额，占比列固定 100%，避免出现无意义的百分比相加 */
function companySummary({ columns, data }) {
  const numeric = ['kinds', 'stock', 'amount', 'lowStock', 'reqTimes', 'reqQuantity', 'reqAmount']
  return columns.map((col, index) => {
    if (index === 0) return '合计'
    if (col.label === '占比') return '100%'
    if (!numeric.includes(col.property)) return ''
    const sum = round2(data.reduce((s, r) => s + (Number(r[col.property]) || 0), 0))
    return col.property === 'amount' || col.property === 'reqAmount' ? `¥${sum.toLocaleString()}` : sum
  })
}

const receiverSearch = reactive({ name: '', department: '' })
watch(receiverSearch, () => { receiverPage.value = 1 }, { deep: true })
const receiverPage = ref(1)
const receiverPageSize = ref(15)

const filteredReceiverStats = computed(() => {
  const name = receiverSearch.name.trim()
  const dept = receiverSearch.department.trim()
  return receiverStats.value.filter(r => (!name || r.receiver.includes(name)) && (!dept || r.department.includes(dept)))
})

const pagedReceiverStats = computed(() => {
  const start = (receiverPage.value - 1) * receiverPageSize.value
  return filteredReceiverStats.value.slice(start, start + receiverPageSize.value)
})

function resetReceiverSearch() {
  receiverSearch.name = ''
  receiverSearch.department = ''
  receiverPage.value = 1
}

/**
 * 统计行下钻明细：明细取自同一批已生效领用单。
 * 领用单已由后端按 dataScope 过滤，故领导班子看全部、部门主管看本部门、使用人看本人办理的单据。
 */
const detailVisible = ref(false)
const detailTitle = ref('')
const detailRows = ref([])

/** 单据快照名可能因历史录入编码问题失真，展示时以当前台账的物品名为准 */
const itemNameOf = r => store.items.find(i => i.id === r.itemId)?.name || r.itemName

function withDeptName(rows) {
  return rows.map(r => ({ ...r, deptName: deptNameOf(r), itemName: itemNameOf(r) }))
}

function openDeptDetail(row) {
  const key = row.dept || '未指定'
  detailRows.value = withDeptName(settledRequisitions.value.filter(r => deptNameOf(r) === key))
  detailTitle.value = `${key} · 领用明细`
  detailVisible.value = true
}

function openReceiverDetail(row) {
  const key = row.receiver || '未指定'
  detailRows.value = withDeptName(settledRequisitions.value.filter(r => (r.receiver || '未指定') === key))
  detailTitle.value = `${key} · 领用明细`
  detailVisible.value = true
}

/** 公司统计下钻：库存明细与领用单都按同一 companyId 过滤，与统计行口径一致 */
const companyDetailVisible = ref(false)
const companyDetailTitle = ref('')
const companyStockRows = ref([])
const companyReqRows = ref([])

function openCompanyDetail(row) {
  const id = row.id || ''
  companyStockRows.value = store.items
    .filter(i => (i.companyId || '') === id)
    .map(i => ({
      ...i,
      categoryName: store.categoryName(i.category),
      amount: round2((Number(i.stock) || 0) * (Number(i.price) || 0))
    }))
  companyReqRows.value = withDeptName(settledRequisitions.value.filter(r => (r.companyId || '') === id))
  companyDetailTitle.value = `${row.company} · 资产明细`
  companyDetailVisible.value = true
}

function exportCompanyDetail() {
  const headers = ['物品编号', '物品名称', '物品类别', '规格型号', '库存数量', '单价(元)', '库存金额(元)']
  const rows = companyStockRows.value.map(r => [r.code, r.name, r.categoryName, r.spec, r.stock, r.price, r.amount])
  const date = new Date().toISOString().slice(0, 10)
  downloadCsv(headers, rows, `导出_${companyDetailTitle.value.replace(/[\s·]/g, '')}_${date}.csv`, '导出公司库存明细成功')
}

function exportDetail() {
  const headers = ['单据编号', '物品名称', '领用人', '领用部门', '领用数量', '领用金额(元)', '领用日期', '用途']
  const rows = detailRows.value.map(r => [r.docNo, r.itemName, r.receiver, r.deptName, r.quantity, r.amount, r.requisitionDate, r.purpose])
  const date = new Date().toISOString().slice(0, 10)
  downloadCsv(headers, rows, `导出_${detailTitle.value.replace(/[\s·]/g, '')}_${date}.csv`, '导出领用明细成功')
}

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

/** 权限判定：报表导出受 lv:export 控制 */
const can = code => userStore.can(code)

function downloadCsv(headers, rows, filename, tip) {
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(tip || `导出${tabNames[activeTab.value]}报表成功`)
}

function handleExport() {
  const date = new Date().toISOString().slice(0, 10)
  if (activeTab.value === 'category') {
    const headers = ['物品类别', '物品种类', '库存数量', '库存金额(元)', '占比(%)']
    const rows = store.categoryStats.map(r => [r.name, r.count, r.quantity, r.amount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.category}_${date}.csv`)
  } else if (activeTab.value === 'company') {
    const headers = ['所属公司', '物品种类', '库存数量', '库存金额(元)', '低库存种类', '领用次数', '领用数量', '领用金额(元)', '占比(%)']
    const rows = companyStats.value.map(r => [r.company, r.kinds, r.stock, r.amount, r.lowStock, r.reqTimes, r.reqQuantity, r.reqAmount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.company}_${date}.csv`)
  } else if (activeTab.value === 'dept') {
    const headers = ['领用部门', '领用次数', '领用数量', '领用金额(元)', '占比(%)']
    const rows = filteredDeptStats.value.map(r => [r.dept, r.times, r.quantity, r.amount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.dept}_${date}.csv`)
  } else if (activeTab.value === 'receiver') {
    const headers = ['领用人', '所属部门', '领用次数', '领用数量', '领用金额(元)', '占比(%)']
    const rows = filteredReceiverStats.value.map(r => [r.receiver, r.department, r.times, r.quantity, r.amount, r.percentage])
    downloadCsv(headers, rows, `导出_${tabNames.receiver}_${date}.csv`)
  } else if (activeTab.value === 'flow') {
    const headers = ['物品名称', '物品类别', '规格型号', '单位', '入库数量', '领用数量', '退库数量', '当前库存']
    const rows = filteredFlowSummary.value.map(r => [r.name, r.categoryName, r.spec, r.unit, r.inbound, r.requisition, r.return, r.stock])
    downloadCsv(headers, rows, `导出_${tabNames.flow}_${date}.csv`)
  }
}
</script>

<style scoped>
.search-form {
  margin-bottom: 16px;
}

.clickable-table {
  cursor: pointer;
}

.detail-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.detail-section-title {
  font-weight: 600;
  color: var(--t-main);
  margin: 12px 0 8px;
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
