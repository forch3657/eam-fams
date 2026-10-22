<template>
  <div class="page-container">
    <div class="page-header">
      <h2>固定资产报表</h2>
      <div>
        <el-button type="primary" @click="handleExport">
          <el-icon><Download /></el-icon>
          导出报表
        </el-button>
      </div>
    </div>
    <el-card class="fill">

      <el-tabs v-model="activeTab">
        <!-- 分类统计 -->
        <el-tab-pane label="分类统计" name="category">
          <div class="grid-4 stat-cards">
            <el-card v-for="item in categoryStats" :key="item.name" shadow="hover" class="stat-card">
              <div class="stat-name">{{ item.name }}</div>
              <div class="stat-value"><span class="num">{{ item.count }}</span> <span class="stat-unit">件</span></div>
              <div class="stat-amount num">¥{{ item.amount.toLocaleString() }}</div>
            </el-card>
          </div>
          <el-table :data="pagedCategoryStats" style="width: 100%">
            <el-table-column prop="name" label="资产分类" width="120" />
            <el-table-column prop="count" label="数量" width="100" />
            <el-table-column prop="amount" label="总金额" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="percentage" label="占比" width="100">
              <template #default="{ row }">{{ row.percentage }}%</template>
            </el-table-column>
            <el-table-column label="分布" min-width="200">
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
              :total="categoryStats.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 位置统计 -->
        <el-tab-pane label="位置统计" name="location">
          <el-table :data="pagedLocationStats" style="width: 100%">
            <el-table-column prop="location" label="存放位置" min-width="180" />
            <el-table-column prop="count" label="资产数量" width="120" />
            <el-table-column prop="amount" label="资产总值" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.amount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="departments" label="涉及部门" min-width="200" show-overflow-tooltip />
            <el-table-column label="占比" width="150">
              <template #default="{ row }">
                <el-progress :percentage="row.percentage" :stroke-width="14" />
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="locPage"
              v-model:page-size="locPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="locationStats.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 部门统计 -->
        <el-tab-pane label="部门统计" name="department">
          <el-table :data="pagedDepartmentStats" style="width: 100%">
            <el-table-column prop="department" label="部门名称" min-width="150" />
            <el-table-column prop="assetCount" label="资产数量" width="120" />
            <el-table-column prop="assetAmount" label="资产总值" width="150" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.assetAmount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="userCount" label="使用人数" width="100" />
            <el-table-column prop="perCapita" label="人均资产" width="130" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.perCapita.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column label="占比" min-width="200">
              <template #default="{ row }">
                <el-progress :percentage="row.percentage" :stroke-width="14" />
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="deptPage"
              v-model:page-size="deptPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="departmentStats.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 使用人统计 -->
        <el-tab-pane label="使用人统计" name="user">
          <el-form :inline="true" :model="userSearch" class="search-form">
            <el-form-item label="使用人">
              <el-input v-model="userSearch.name" placeholder="请输入" clearable />
            </el-form-item>
            <el-form-item label="部门">
              <el-input v-model="userSearch.department" placeholder="请输入" clearable />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleUserSearch">查询</el-button>
              <el-button @click="handleUserReset">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="displayUserStats" style="width: 100%">
            <el-table-column prop="name" label="使用人" width="100" />
            <el-table-column prop="department" label="所属部门" width="120" />
            <el-table-column prop="position" label="职位" width="100" />
            <el-table-column prop="assetCount" label="持有资产数" width="120" />
            <el-table-column prop="assetAmount" label="资产总值" width="140" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.assetAmount.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="assetDetail" label="资产明细" min-width="200" show-overflow-tooltip />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="userPage"
              v-model:page-size="userPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="userTotal"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 资产折旧明细 -->
        <el-tab-pane label="资产折旧明细" name="depreciation">
          <el-form :inline="true" class="search-form">
            <el-form-item label="折旧月份">
              <el-date-picker
                v-model="detailSearch.month"
                type="month"
                value-format="YYYY-MM"
                placeholder="选择月份"
                :clearable="false"
                style="width: 150px"
              />
            </el-form-item>
            <el-form-item label="关键字">
              <el-input v-model="detailSearch.keyword" placeholder="折旧名称/资产编码/资产" clearable style="width: 240px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDetailSearch">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="handleDetailReset">重置</el-button>
              <el-button type="primary" plain @click="handleDetailExport">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedDepreciationDetails" style="width: 100%">
            <el-table-column prop="planName" label="折旧名称" min-width="180" show-overflow-tooltip fixed />
            <el-table-column prop="assetCode" label="资产编码" width="120" />
            <el-table-column prop="assetName" label="资产名称" min-width="170" show-overflow-tooltip />
            <el-table-column prop="assetType" label="资产类型" width="110" />
            <el-table-column prop="company" label="所属承租公司" min-width="190" show-overflow-tooltip />
            <el-table-column prop="original" label="原值(元)" width="120" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.original.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="netValue" label="当前净值(元)" width="130" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.netValue.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="periodAmount" label="本期折旧额(元)" width="140" align="center">
              <template #default="{ row }">
                <el-tag type="primary" size="small" effect="light">¥{{ row.periodAmount.toLocaleString() }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="accumulatedDepreciation" label="累计折旧额(元)" width="140" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.accumulatedDepreciation.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="residualRate" label="残值率(%)" width="100" align="right">
              <template #default="{ row }">{{ row.residualRate }}%</template>
            </el-table-column>
            <el-table-column prop="remainLife" label="剩余使用期限(月)" width="140" align="right" />
            <el-table-column prop="usedLife" label="已使用期限(月)" width="140" align="right" />
            <el-table-column prop="finished" label="是否提足资产" width="120">
              <template #default="{ row }">
                <el-tag :type="row.finished ? 'success' : 'info'" size="small">{{ row.finished ? '已提足' : '未提足' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="depDate" label="折旧日期" width="110" fixed="right" />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="detPage"
              v-model:page-size="detPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="detTotal"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>

          <div class="section-title">折旧进度明细</div>
          <el-form :inline="true" :model="depreciationSearch" class="search-form">
            <el-form-item label="资产名称">
              <el-input v-model="depreciationSearch.name" placeholder="请输入" clearable />
            </el-form-item>
            <el-form-item label="折旧方式">
              <el-select v-model="depreciationSearch.method" placeholder="请选择" clearable style="width: 140px">
                <el-option label="直线法" value="直线法" />
                <el-option label="双倍余额递减法" value="双倍余额递减法" />
                <el-option label="年数总和法" value="年数总和法" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleDepreciationSearch">查询</el-button>
              <el-button @click="handleDepreciationReset">重置</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="displayDepreciationList" style="width: 100%">
            <el-table-column prop="assetNo" label="资产编号" width="130" fixed />
            <el-table-column prop="name" label="资产名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="originalValue" label="原值" width="120" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.originalValue.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="depreciationMethod" label="折旧方式" width="130" />
            <el-table-column prop="usefulLife" label="使用年限" width="100" align="right" />
            <el-table-column prop="accumulatedDepreciation" label="累计折旧" width="130" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.accumulatedDepreciation.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="netValue" label="净值" width="120" align="right">
              <template #default="{ row }"><span class="num">¥{{ row.netValue.toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="depreciationRate" label="折旧进度" width="150">
              <template #default="{ row }">
                <el-progress :percentage="row.depreciationRate" :stroke-width="14" :color="getDepreciationColor(row.depreciationRate)" />
              </template>
            </el-table-column>
            <el-table-column prop="purchaseDate" label="购入日期" width="110" />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="depreciationPage"
              v-model:page-size="depreciationPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="depreciationTotal"
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
import { useFixedAssetStore } from '../../store/fixedAsset'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'

const fixedAssetStore = useFixedAssetStore()

const activeTab = ref('category')

const categoryStats = computed(() => {
  const grouped = {}
  fixedAssetStore.assets.forEach(a => {
    const key = a.type || '其他'
    if (!grouped[key]) grouped[key] = { name: key, count: 0, amount: 0 }
    grouped[key].count++
    grouped[key].amount += (a.original || 0)
  })
  const total = Object.values(grouped).reduce((s, g) => s + g.amount, 0) || 1
  return Object.values(grouped).map(g => ({
    ...g,
    percentage: Math.round(g.amount / total * 100)
  })).sort((a, b) => b.amount - a.amount)
})

const locationStats = computed(() => {
  const grouped = {}
  fixedAssetStore.assets.forEach(a => {
    const key = a.location || '未指定'
    if (!grouped[key]) grouped[key] = { location: key, count: 0, amount: 0, depts: new Set() }
    grouped[key].count++
    grouped[key].amount += (a.original || 0)
    if (a.dept) grouped[key].depts.add(a.dept)
  })
  const total = Object.values(grouped).reduce((s, g) => s + g.amount, 0) || 1
  return Object.values(grouped).map(g => ({
    location: g.location,
    count: g.count,
    amount: g.amount,
    departments: [...g.depts].join('、'),
    percentage: Math.round(g.amount / total * 100)
  })).sort((a, b) => b.amount - a.amount)
})

const departmentStats = computed(() => {
  const grouped = {}
  fixedAssetStore.assets.forEach(a => {
    const key = a.dept || '未分配'
    if (!grouped[key]) grouped[key] = { department: key, assetCount: 0, assetAmount: 0, users: new Set() }
    grouped[key].assetCount++
    grouped[key].assetAmount += (a.original || 0)
    if (a.user) grouped[key].users.add(a.user)
  })
  const total = Object.values(grouped).reduce((s, g) => s + g.assetAmount, 0) || 1
  return Object.values(grouped).map(g => {
    const userCount = g.users.size || 1
    return {
      department: g.department,
      assetCount: g.assetCount,
      assetAmount: g.assetAmount,
      userCount,
      perCapita: Math.round(g.assetAmount / userCount),
      percentage: Math.round(g.assetAmount / total * 100)
    }
  }).sort((a, b) => b.assetAmount - a.assetAmount)
})

// 使用人统计
const userSearch = reactive({ name: '', department: '' })
watch(userSearch, () => { userPage.value = 1 }, { deep: true })

const userStats = computed(() => {
  const grouped = {}
  fixedAssetStore.assets.forEach(a => {
    const key = a.user || '未分配'
    if (!grouped[key]) grouped[key] = { name: key, department: a.dept || '未分配', assetCount: 0, assetAmount: 0, assets: [] }
    grouped[key].assetCount++
    grouped[key].assetAmount += (a.original || 0)
    grouped[key].assets.push(a.name)
  })
  return Object.values(grouped).map(g => ({
    name: g.name,
    department: g.department,
    position: '',
    assetCount: g.assetCount,
    assetAmount: g.assetAmount,
    assetDetail: g.assets.join('、')
  })).sort((a, b) => b.assetAmount - a.assetAmount)
})

const filteredUserStats = computed(() => {
  return userStats.value.filter(item => {
    const nameMatch = !userSearch.name || item.name.includes(userSearch.name)
    const deptMatch = !userSearch.department || item.department.includes(userSearch.department)
    return nameMatch && deptMatch
  })
})

const displayUserStats = computed(() => {
  const start = (userPage.value - 1) * userPageSize.value
  return filteredUserStats.value.slice(start, start + userPageSize.value)
})

const userPage = ref(1)
const userPageSize = ref(15)
const userTotal = computed(() => filteredUserStats.value.length)

// 折旧明细
const depreciationSearch = reactive({ name: '', method: '' })
watch(depreciationSearch, () => { depreciationPage.value = 1 }, { deep: true })

const depreciationDetailCol = useCollection(COLLECTION.reportDepreciationDetails, [
  { assetNo: 'ZC2024001', name: '联想ThinkPad笔记本电脑', originalValue: 85000, depreciationMethod: '直线法', usefulLife: 5, accumulatedDepreciation: 34000, netValue: 51000, depreciationRate: 40, purchaseDate: '2024-01-15' },
  { assetNo: 'ZC2024002', name: '惠普打印机', originalValue: 16000, depreciationMethod: '直线法', usefulLife: 5, accumulatedDepreciation: 4800, netValue: 11200, depreciationRate: 30, purchaseDate: '2024-06-01' },
  { assetNo: 'ZC2023001', name: '丰田凯美瑞轿车', originalValue: 360000, depreciationMethod: '双倍余额递减法', usefulLife: 8, accumulatedDepreciation: 135000, netValue: 225000, depreciationRate: 37.5, purchaseDate: '2023-03-20' },
  { assetNo: 'ZC2023002', name: '办公桌', originalValue: 24000, depreciationMethod: '直线法', usefulLife: 10, accumulatedDepreciation: 7200, netValue: 16800, depreciationRate: 30, purchaseDate: '2023-08-10' },
  { assetNo: 'ZC2022001', name: '旧款联想台式机', originalValue: 50000, depreciationMethod: '直线法', usefulLife: 5, accumulatedDepreciation: 50000, netValue: 0, depreciationRate: 100, purchaseDate: '2022-01-05' },
  { assetNo: 'ZC2025001', name: 'A4复印纸', originalValue: 2500, depreciationMethod: '直线法', usefulLife: 1, accumulatedDepreciation: 1250, netValue: 1250, depreciationRate: 50, purchaseDate: '2025-09-01' },
  { assetNo: 'ZC2025002', name: '服务器', originalValue: 120000, depreciationMethod: '年数总和法', usefulLife: 5, accumulatedDepreciation: 48000, netValue: 72000, depreciationRate: 40, purchaseDate: '2025-02-15' }
])
const depreciationList = depreciationDetailCol.items

const filteredDepreciationList = computed(() => {
  return depreciationList.value.filter(item => {
    const nameMatch = !depreciationSearch.name || item.name.includes(depreciationSearch.name)
    const methodMatch = !depreciationSearch.method || item.depreciationMethod === depreciationSearch.method
    return nameMatch && methodMatch
  })
})

const displayDepreciationList = computed(() => {
  const start = (depreciationPage.value - 1) * depreciationPageSize.value
  return filteredDepreciationList.value.slice(start, start + depreciationPageSize.value)
})

const depreciationPage = ref(1)
const depreciationPageSize = ref(15)
const depreciationTotal = computed(() => filteredDepreciationList.value.length)

const getDepreciationColor = (percentage) => {
  if (percentage >= 80) return '#f56c6c'
  if (percentage >= 50) return '#e6a23c'
  return '#67c23a'
}

const handleUserSearch = () => { userPage.value = 1 }
const handleUserReset = () => {
  userSearch.name = ''
  userSearch.department = ''
  userPage.value = 1
}

const handleDepreciationSearch = () => { depreciationPage.value = 1 }
const handleDepreciationReset = () => {
  depreciationSearch.name = ''
  depreciationSearch.method = ''
  depreciationPage.value = 1
}

const handleExport = () => {
  const tabNames = { category: '分类统计', location: '位置统计', department: '部门统计', user: '使用人统计' }
  let headers, rows
  if (activeTab.value === 'category') {
    headers = ['资产分类', '数量', '总金额', '占比(%)']
    rows = categoryStats.value.map(r => [r.name, r.count, r.amount, r.percentage])
  } else if (activeTab.value === 'location') {
    headers = ['存放位置', '资产数量', '资产总值', '涉及部门', '占比(%)']
    rows = locationStats.value.map(r => [r.location, r.count, r.amount, r.departments, r.percentage])
  } else if (activeTab.value === 'department') {
    headers = ['部门名称', '资产数量', '资产总值', '使用人数', '人均资产', '占比(%)']
    rows = departmentStats.value.map(r => [r.department, r.assetCount, r.assetAmount, r.userCount, r.perCapita, r.percentage])
  } else {
    headers = ['使用人', '所属部门', '职位', '持有资产数', '资产总值', '资产明细']
    rows = displayUserStats.value.map(r => [r.name, r.department, r.position, r.assetCount, r.assetAmount, r.assetDetail])
  }
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `导出_${tabNames[activeTab.value]}_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`导出${tabNames[activeTab.value]}报表成功`)
}

const catPage = ref(1)
const catPageSize = ref(15)
const pagedCategoryStats = computed(() => {
  const start = (catPage.value - 1) * catPageSize.value
  return categoryStats.value.slice(start, start + catPageSize.value)
})

const locPage = ref(1)
const locPageSize = ref(15)
const pagedLocationStats = computed(() => {
  const start = (locPage.value - 1) * locPageSize.value
  return locationStats.value.slice(start, start + locPageSize.value)
})

const deptPage = ref(1)
const deptPageSize = ref(15)
const pagedDepartmentStats = computed(() => {
  const start = (deptPage.value - 1) * deptPageSize.value
  return departmentStats.value.slice(start, start + deptPageSize.value)
})

const depreciationPlanDetailCol = useCollection(COLLECTION.reportDepreciationPlanDetails, [
  { planName: '电子设备年限平均折旧', assetCode: 'GD20260001', assetName: '联想ThinkPad笔记本电脑', assetType: '电子设备', company: '华信科技集团有限公司', original: 8500, residualRate: 5, totalLife: 36, usedLife: 6, depDate: '2026-09-25', finished: false },
  { planName: '电子设备年限平均折旧', assetCode: 'GD20260006', assetName: '华为会议平板', assetType: '电子设备', company: '华信科技集团有限公司', original: 26800, residualRate: 5, totalLife: 36, usedLife: 5, depDate: '2026-09-25', finished: false },
  { planName: '租赁设备按起租日折旧', assetCode: 'GD20260010', assetName: '服务器机柜', assetType: '电子设备', company: '恒信融资租赁有限公司', original: 42000, residualRate: 5, totalLife: 36, usedLife: 22, depDate: '2026-09-28', finished: false },
  { planName: '运输设备双倍余额折旧', assetCode: 'GD20260004', assetName: '丰田考斯特商务车', assetType: '运输设备', company: '中天建设集团有限公司', original: 385000, residualRate: 5, totalLife: 60, usedLife: 15, depDate: '2026-09-20', finished: false },
  { planName: '机械设备工作量折旧', assetCode: 'GD20260005', assetName: '数控车床CK6140', assetType: '机械设备', company: '恒信融资租赁有限公司', original: 268000, residualRate: 5, totalLife: 48, usedLife: 24, depDate: '2026-09-15', finished: false },
  { planName: '办公家具直线折旧', assetCode: 'GD20260008', assetName: '实木会议桌', assetType: '办公家具', company: '中天建设集团有限公司', original: 12800, residualRate: 5, totalLife: 60, usedLife: 9, depDate: '2026-09-25', finished: false },
  { planName: '房屋建筑物年度折旧', assetCode: 'GD20250021', assetName: '总部办公楼附属用房', assetType: '房屋建筑物', company: '云鼎资产管理有限公司', original: 1280000, residualRate: 10, totalLife: 240, usedLife: 66, depDate: '2026-09-30', finished: false },
  { planName: '电子设备年限平均折旧', assetCode: 'GD20240018', assetName: '旧款联想台式机', assetType: '电子设备', company: '华信科技集团有限公司', original: 5600, residualRate: 5, totalLife: 36, usedLife: 36, depDate: '2026-09-25', finished: true },
  { planName: '电子设备年限平均折旧', assetCode: 'GD20260012', assetName: '爱普生投影仪', assetType: '电子设备', company: '云鼎资产管理有限公司', original: 4600, residualRate: 5, totalLife: 36, usedLife: 3, depDate: '2026-08-25', finished: false },
  { planName: '机械设备工作量折旧', assetCode: 'GD20260011', assetName: '合力3吨叉车', assetType: '机械设备', company: '中天建设集团有限公司', original: 96000, residualRate: 5, totalLife: 60, usedLife: 13, depDate: '2026-08-15', finished: false },
  { planName: '租赁设备按起租日折旧', assetCode: 'GD20260007', assetName: '格力中央空调机组', assetType: '机械设备', company: '云鼎资产管理有限公司', original: 158000, residualRate: 5, totalLife: 120, usedLife: 18, depDate: '2026-08-28', finished: false },
  { planName: '电子设备年限平均折旧', assetCode: 'GD20260013', assetName: '不间断电源UPS', assetType: '电子设备', company: '华信科技集团有限公司', original: 18600, residualRate: 5, totalLife: 48, usedLife: 11, depDate: '2026-08-25', finished: false },
  { planName: '运输设备双倍余额折旧', assetCode: 'GD20250009', assetName: '别克GL8商务车', assetType: '运输设备', company: '云鼎资产管理有限公司', original: 268000, residualRate: 5, totalLife: 60, usedLife: 26, depDate: '2026-07-20', finished: false },
  { planName: '办公家具直线折旧', assetCode: 'GD20260009', assetName: '人体工学办公椅', assetType: '办公家具', company: '华信科技集团有限公司', original: 1580, residualRate: 5, totalLife: 24, usedLife: 8, depDate: '2026-07-25', finished: false },
  { planName: '房屋建筑物年度折旧', assetCode: 'GD20240006', assetName: '一号生产厂房', assetType: '房屋建筑物', company: '中天建设集团有限公司', original: 2600000, residualRate: 10, totalLife: 300, usedLife: 92, depDate: '2026-07-31', finished: false },
  { planName: '电子设备年限平均折旧', assetCode: 'GD20230012', assetName: '惠普激光打印机', assetType: '电子设备', company: '恒信融资租赁有限公司', original: 3200, residualRate: 5, totalLife: 24, usedLife: 24, depDate: '2026-07-25', finished: true }
])
const depreciationDetailSource = depreciationPlanDetailCol.items

const depreciationDetails = computed(() => depreciationDetailSource.value.map(r => {
  const monthly = r.original * (1 - r.residualRate / 100) / r.totalLife
  const cap = r.original * (1 - r.residualRate / 100)
  const accumulated = Math.min(monthly * r.usedLife, cap)
  return {
    ...r,
    periodAmount: r.finished ? 0 : Math.round(monthly * 100) / 100,
    accumulatedDepreciation: Math.round(accumulated * 100) / 100,
    netValue: Math.round((r.original - accumulated) * 100) / 100,
    remainLife: Math.max(r.totalLife - r.usedLife, 0)
  }
}))

const detailSearch = reactive({ month: '2026-09', keyword: '' })
const detPage = ref(1)
const detPageSize = ref(15)
watch(detailSearch, () => { detPage.value = 1 }, { deep: true })

const filteredDepreciationDetails = computed(() => {
  const kw = detailSearch.keyword.trim()
  return depreciationDetails.value.filter(r =>
    (!detailSearch.month || r.depDate.slice(0, 7) === detailSearch.month) &&
    (!kw || r.planName.includes(kw) || r.assetCode.includes(kw) || r.assetName.includes(kw))
  )
})

const pagedDepreciationDetails = computed(() => {
  const start = (detPage.value - 1) * detPageSize.value
  return filteredDepreciationDetails.value.slice(start, start + detPageSize.value)
})

const detTotal = computed(() => filteredDepreciationDetails.value.length)

const handleDetailSearch = () => { detPage.value = 1 }

const handleDetailReset = () => {
  detailSearch.month = '2026-09'
  detailSearch.keyword = ''
  detPage.value = 1
}

const handleDetailExport = () => {
  const headers = ['折旧名称', '资产编码', '资产名称', '资产类型', '所属承租公司', '原值(元)', '当前净值(元)', '本期折旧额(元)', '累计折旧额(元)', '残值率(%)', '剩余使用期限(月)', '已使用期限(月)', '是否提足资产', '折旧日期']
  const rows = filteredDepreciationDetails.value.map(r => [r.planName, r.assetCode, r.assetName, r.assetType, r.company, r.original, r.netValue, r.periodAmount, r.accumulatedDepreciation, r.residualRate, r.remainLife, r.usedLife, r.finished ? '已提足' : '未提足', r.depDate])
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `导出_资产折旧明细_${detailSearch.month}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`导出 ${detailSearch.month} 资产折旧明细报表成功（${filteredDepreciationDetails.value.length} 条）`)
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
}

.search-form {
  margin-bottom: 20px;
}

.stat-cards {
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
  cursor: pointer;
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
  font-size: 28px;
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
