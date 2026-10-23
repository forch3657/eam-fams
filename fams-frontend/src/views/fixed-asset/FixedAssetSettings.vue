<template>
  <div class="page-container">
    <div class="page-header">
      <h2>固定资产基础设置</h2>
    </div>
    <el-card class="fill">

      <el-tabs v-model="activeTab">
        <!-- 位置设置 -->
        <el-tab-pane label="位置设置" name="location">
          <el-button type="primary" style="margin-bottom: 16px" @click="handleAddLocation">
            <el-icon><Plus /></el-icon>
            新增位置
          </el-button>
          <el-table :data="pagedLocationList" style="width: 100%">
            <el-table-column prop="code" label="位置编码" width="120" />
            <el-table-column prop="name" label="位置名称" min-width="180" />
            <el-table-column prop="parentName" label="上级位置" width="150" />
            <el-table-column prop="manager" label="负责人" width="100" />
            <el-table-column prop="assetCount" label="资产数量" width="100" />
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditLocation(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteLocation(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="locPage"
              v-model:page-size="locPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="locationList.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 分类设置 -->
        <el-tab-pane label="分类设置" name="category">
          <el-form :inline="true" class="search-form">
            <el-form-item label="分类状态">
              <el-select v-model="catSearch.status" placeholder="请选择状态" clearable style="width: 120px">
                <el-option label="启用" value="ENABLED" />
                <el-option label="禁用" value="DISABLED" />
              </el-select>
            </el-form-item>
            <el-form-item label="关键字">
              <el-input v-model="catSearch.keyword" placeholder="分类名称/分类编码" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="catPage = 1">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetCatSearch">重置</el-button>
              <el-button type="primary" @click="handleAddCategory">
                <el-icon><Plus /></el-icon>
                新增分类
              </el-button>
            </el-form-item>
          </el-form>

          <el-table
            :data="pagedCategoryTree"
            row-key="id"
            :tree-props="{ children: 'children' }"
            style="width: 100%"
          >
            <el-table-column prop="name" label="分类名称" min-width="240" />
            <el-table-column prop="code" label="分类编码" width="140" />
            <el-table-column prop="parentName" label="上级分类" width="140" />
            <el-table-column label="默认折旧方式" width="130"><template #default="{ row }">{{ labelOf('DEPRECIATION_METHOD', row.depreciationMethod) }}</template></el-table-column>
            <el-table-column prop="usefulLife" label="默认使用年限" width="120" />
            <el-table-column prop="assetCount" label="资产数量" width="100" />
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="createTime" label="创建时间" width="170" />
            <el-table-column prop="updateTime" label="更新时间" width="170" />
            <el-table-column label="操作" width="270" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditCategory(row)">修改</el-button>
                <el-button link type="primary" size="small" @click="handleAddSubCategory(row)">新增下一级</el-button>
                <el-button link type="warning" size="small" @click="handleToggleCategory(row)">{{ row.status === 'ENABLED' ? '停用' : '启用' }}</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteCategory(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="catPage"
              v-model:page-size="catPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="catTotal"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 折旧设置 -->
        <el-tab-pane label="折旧设置" name="depreciation">
          <el-form :inline="true" class="search-form">
            <el-form-item label="所属公司">
              <el-select v-model="depSearch.companyId" placeholder="请选择公司" clearable style="width: 200px">
                <el-option v-for="c in companyOptions" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="折旧名称">
              <el-input v-model="depSearch.name" placeholder="请输入折旧名称" clearable style="width: 180px" />
            </el-form-item>
            <el-form-item label="计算时间">
              <el-select v-model="depSearch.calcTime" placeholder="请选择" clearable style="width: 120px">
                <el-option v-for="c in calcTimeOptions" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="购置方式">
              <el-select v-model="depSearch.purchaseMode" placeholder="请选择" clearable style="width: 120px">
                <el-option v-for="m in purchaseModeOptions" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="depPage = 1">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetDepSearch">重置</el-button>
              <el-button type="primary" @click="handleAddPlan">
                <el-icon><Plus /></el-icon>
                新增
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedDepreciationPlans" style="width: 100%">
            <el-table-column label="所属公司" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.companyId ? (orgStore.companyName(row.companyId) || row.companyId) : '-' }}</template>
            </el-table-column>
            <el-table-column prop="name" label="折旧名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="createTime" label="创建时间" width="170" />
            <el-table-column prop="updateTime" label="更新时间" width="170" />
            <el-table-column label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditPlan(row)">修改</el-button>
                <el-button link type="danger" size="small" @click="handleDeletePlan(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="depPage"
              v-model:page-size="depPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="depTotal"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>

          <div class="section-title">折旧规则</div>
          <el-button type="primary" style="margin-bottom: 16px" @click="handleAddDepreciation">
            <el-icon><Plus /></el-icon>
            新增折旧规则
          </el-button>
          <el-table :data="pagedDepreciationRules" style="width: 100%">
            <el-table-column prop="name" label="规则名称" min-width="150" />
            <el-table-column prop="method" label="折旧方式" width="140" />
            <el-table-column prop="usefulLife" label="使用年限" width="100" />
            <el-table-column prop="residualRate" label="残值率" width="100">
              <template #default="{ row }">{{ row.residualRate }}%</template>
            </el-table-column>
            <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
            <el-table-column label="操作" width="150">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleEditDepreciation(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteDepreciation(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="rulePage"
              v-model:page-size="rulePageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="depreciationRules.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 审批设置：引用「系统管理 > 流程配置」的全局流程 -->
        <el-tab-pane label="审批设置" name="approval">
          <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
            <template #title>
              审批流程统一在「系统管理 &gt; 流程配置」维护，本页只读引用并可启停；改动对全站生效。
            </template>
          </el-alert>
          <el-button type="primary" style="margin-bottom: 16px" @click="goWorkflowConfig">
            <el-icon><Setting /></el-icon>
            前往流程配置
          </el-button>
          <el-table :data="pagedApprovalFlows" style="width: 100%">
            <el-table-column prop="name" label="流程名称" min-width="150" />
            <el-table-column label="适用业务" width="130">
              <template #default="{ row }">{{ labelOf('BUSINESS_TYPE', row.bizType) }}</template>
            </el-table-column>
            <el-table-column label="审批环节" min-width="300">
              <template #default="{ row }">
                <el-tag v-for="(step, idx) in flowStepNames(row)" :key="idx" size="small" style="margin-right: 8px">{{ step }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small">{{ row.enabled ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="handleToggleApproval(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="apprPage"
              v-model:page-size="apprPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="approvalFlows.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 位置编辑对话框 -->
    <el-dialog v-model="locationDialogVisible" :title="isEditLocation ? '编辑位置' : '新增位置'" width="500px">
      <el-form :model="locationForm" label-width="100px">
        <el-form-item label="位置编码">
          <el-input v-model="locationForm.code" placeholder="请输入编码" />
        </el-form-item>
        <el-form-item label="位置名称">
          <el-input v-model="locationForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="上级位置">
          <el-select v-model="locationForm.parentCode" placeholder="请选择" clearable style="width: 100%">
            <el-option v-for="item in locationOptions" :key="item.code" :label="item.name" :value="item.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="locationForm.manager" placeholder="请输入负责人" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="locationDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleLocationSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 分类编辑对话框 -->
    <el-dialog v-model="categoryDialogVisible" :title="categoryDialogTitle" width="520px">
      <el-form :model="categoryForm" label-width="110px">
        <el-form-item label="分类名称" required>
          <el-input v-model="categoryForm.name" maxlength="50" show-word-limit placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="分类编码">
          <el-input v-model="categoryForm.code" maxlength="50" show-word-limit placeholder="不填则自动生成" />
        </el-form-item>
        <el-form-item label="上级分类">
          <el-select v-model="categoryForm.parentCode" placeholder="不选则为顶级分类" clearable style="width: 100%">
            <el-option
              v-for="item in categoryFlatOptions"
              :key="item.code"
              :label="`${'　'.repeat(item.level)}${item.name}`"
              :value="item.code"
              :disabled="item.code === categoryForm.code"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="折旧方式">
          <el-select v-model="categoryForm.depreciationMethod" placeholder="请选择" style="width: 100%">
            <el-option v-for="m in depreciationMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用年限">
          <el-input-number v-model="categoryForm.usefulLife" :min="1" :max="50" style="width: 100%" />
          <span style="margin-left: 12px">年</span>
        </el-form-item>
        <el-form-item label="分类状态">
          <el-radio-group v-model="categoryForm.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleCategorySubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 折旧规则编辑对话框 -->
    <el-dialog v-model="depreciationDialogVisible" :title="isEditDepreciation ? '编辑折旧规则' : '新增折旧规则'" width="500px">
      <el-form :model="depreciationForm" label-width="100px">
        <el-form-item label="规则名称">
          <el-input v-model="depreciationForm.name" placeholder="请输入名称" />
        </el-form-item>
        <el-form-item label="折旧方式">
          <el-select v-model="depreciationForm.method" placeholder="请选择" style="width: 100%">
            <!-- 存编码不存文案：契约声明为 DEPRECIATION_METHOD 枚举，写中文会校验失败 -->
            <el-option v-for="m in depreciationMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用年限">
          <el-input-number v-model="depreciationForm.usefulLife" :min="1" :max="50" style="width: 100%" />
          <span style="margin-left: 12px">年</span>
        </el-form-item>
        <el-form-item label="残值率">
          <el-input-number v-model="depreciationForm.residualRate" :min="0" :max="100" style="width: 100%" />
          <span style="margin-left: 12px">%</span>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="depreciationForm.description" type="textarea" :rows="3" placeholder="请输入说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="depreciationDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleDepreciationSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 折旧设置对话框 -->
    <el-dialog v-model="planDialogVisible" :title="isEditPlan ? '修改折旧设置' : '新增折旧设置'" width="820px" top="6vh">
      <el-form :model="planForm" label-width="130px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="所属公司" required>
              <el-select v-model="planForm.companyId" placeholder="请选择公司" style="width: 100%">
                <el-option v-for="c in companyOptions" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="折旧名称" required>
              <el-input v-model="planForm.name" maxlength="100" show-word-limit placeholder="请输入折旧名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="折旧方法">
              <el-select v-model="planForm.method" placeholder="请选择折旧方法" style="width: 100%">
                <el-option v-for="m in depreciationMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资产类型">
              <el-select v-model="planForm.assetTypes" multiple collapse-tags collapse-tags-tooltip placeholder="请选择资产类型" style="width: 100%">
                <el-option v-for="t in assetTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="残值率(%)">
              <el-input-number v-model="planForm.residualRate" :min="0" :max="100" :precision="2" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计算时间">
              <el-select v-model="planForm.calcTime" placeholder="请选择计算时间" style="width: 100%">
                <el-option v-for="c in calcTimeOptions" :key="c.value" :label="c.label" :value="c.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="每月计提时间">
              <el-input-number v-model="planForm.monthlyDay" :min="1" :max="31" style="width: calc(100% - 40px)" />
              <span style="margin-left: 12px">日</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购置方式">
              <el-select v-model="planForm.purchaseMode" placeholder="请选择购置方式" style="width: 100%">
                <el-option v-for="m in purchaseModeOptions" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="planForm.remark" type="textarea" :rows="3" maxlength="250" show-word-limit placeholder="请输入备注" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePlanSubmit">提交</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Setting } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { useOrgStore } from '../../store/org'
import { labelOf, optionsOf } from '../../constants/enums'
import { COLLECTION } from '../../services'

const router = useRouter()
const orgStore = useOrgStore()
const activeTab = ref('location')

// 所属公司：下拉展示公司名、落库存 companyId（契约与种子都用 companyId，
// 原先存公司名导致表格「所属公司」列读 companyId 永远为空）
const companyOptions = computed(() => {
  const list = orgStore.companies.filter(c => c.status === 'ENABLED').map(c => ({ id: c.id, name: c.name }))
  return list.length ? list : FALLBACK_COMPANIES
})
// 全部下拉统一取数据字典：下拉展示中文、落库存编码，改文案不必改代码
const assetTypeOptions = computed(() => optionsOf('ASSET_CATEGORY'))
const purchaseModeOptions = computed(() => optionsOf('PURCHASE_MODE'))
const calcTimeOptions = computed(() => optionsOf('CALC_TIME'))
const depreciationMethodOptions = computed(() => optionsOf('DEPRECIATION_METHOD'))

// 位置设置
const locationCol = useCollection(COLLECTION.settingsLocations)
const locationList = locationCol.items

const locationOptionCol = useCollection(COLLECTION.settingsLocationOptions)
const locationOptions = locationOptionCol.items

const locationDialogVisible = ref(false)
const isEditLocation = ref(false)
const editingLocationIndex = ref(-1)
const locationForm = reactive({ code: '', name: '', parentCode: '', manager: '' })

const handleAddLocation = () => {
  isEditLocation.value = false
  editingLocationIndex.value = -1
  Object.assign(locationForm, { code: '', name: '', parentCode: '', manager: '' })
  locationDialogVisible.value = true
}

const handleEditLocation = (row) => {
  isEditLocation.value = true
  editingLocationIndex.value = locationList.value.findIndex(l => l.code === row.code)
  const parent = locationOptions.value.find(o => o.name === row.parentName)
  Object.assign(locationForm, { code: row.code, name: row.name, parentCode: parent ? parent.code : '', manager: row.manager })
  locationDialogVisible.value = true
}

const handleDeleteLocation = (row) => {
  ElMessageBox.confirm(`确定要删除位置"${row.name}"吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    locationCol.remove(row)
    ElMessage.success('删除成功')
  }).catch(() => {})
}

const handleLocationSubmit = () => {
  if (!locationForm.code || !locationForm.name) {
    ElMessage.warning('请填写完整信息')
    return
  }
  const parent = locationOptions.value.find(o => o.code === locationForm.parentCode)
  if (isEditLocation.value && editingLocationIndex.value > -1) {
    const target = locationList.value[editingLocationIndex.value]
    Object.assign(target, {
      code: locationForm.code,
      name: locationForm.name,
      parentName: parent ? parent.name : '-',
      manager: locationForm.manager
    })
    locationCol.update(target)
    ElMessage.success('编辑成功')
  } else {
    locationCol.add({
      code: locationForm.code,
      name: locationForm.name,
      parentName: parent ? parent.name : '-',
      manager: locationForm.manager,
      assetCount: 0
    })
    ElMessage.success('新增成功')
  }
  locationDialogVisible.value = false
}

// 分类设置
const categoryCol = useCollection(COLLECTION.settingsCategories)
const categoryTree = categoryCol.items

const catSearch = reactive({ status: '', keyword: '' })
const catPage = ref(1)
const catPageSize = ref(15)
watch(catSearch, () => { catPage.value = 1 }, { deep: true })

/** 统一 ISO 8601：契约与后端只认这种格式，空格分隔的本地格式会被判为非法 */
function nowText() {
  return new Date().toISOString()
}

function filterCategoryNodes(nodes) {
  const kw = catSearch.keyword.trim()
  const out = []
  nodes.forEach(n => {
    const selfHit = (!kw || n.name.includes(kw) || n.code.includes(kw)) && (!catSearch.status || n.status === catSearch.status)
    const kids = filterCategoryNodes(n.children || [])
    if (selfHit) {
      out.push({ ...n, children: n.children || [] })
    } else if (kids.length) {
      out.push({ ...n, children: kids })
    }
  })
  return out
}

const filteredCategoryTree = computed(() => filterCategoryNodes(categoryTree.value))

const pagedCategoryTree = computed(() => {
  const start = (catPage.value - 1) * catPageSize.value
  return filteredCategoryTree.value.slice(start, start + catPageSize.value)
})

const catTotal = computed(() => filteredCategoryTree.value.length)

function resetCatSearch() {
  Object.assign(catSearch, { status: '', keyword: '' })
  catPage.value = 1
}

const categoryFlatOptions = computed(() => {
  const out = []
  const walk = (nodes, level) => {
    nodes.forEach(n => {
      out.push({ code: n.code, name: n.name, level })
      walk(n.children || [], level + 1)
    })
  }
  walk(categoryTree.value, 0)
  return out
})

function findCategoryNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = findCategoryNode(n.children || [], id)
    if (hit) return hit
  }
  return null
}

function findCategoryByCode(nodes, code) {
  for (const n of nodes) {
    if (n.code === code) return n
    const hit = findCategoryByCode(n.children || [], code)
    if (hit) return hit
  }
  return null
}

function findCategorySiblings(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return nodes
    const hit = findCategorySiblings(n.children || [], id)
    if (hit) return hit
  }
  return null
}

function isCategoryLoop(rootId, parentCode) {
  let cur = parentCode ? findCategoryByCode(categoryTree.value, parentCode) : null
  let guard = 0
  while (cur && guard < 30) {
    if (cur.id === rootId) return true
    cur = cur.parentCode ? findCategoryByCode(categoryTree.value, cur.parentCode) : null
    guard++
  }
  return false
}

const categoryDialogVisible = ref(false)
const isEditCategory = ref(false)
const editingCategoryId = ref('')
const categoryForm = reactive({ code: '', name: '', parentCode: '', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 5, status: 'ENABLED' })

const categoryDialogTitle = computed(() => {
  if (isEditCategory.value) return '修改分类'
  return categoryForm.parentCode ? '新增下一级分类' : '新增分类'
})

const handleAddCategory = () => {
  isEditCategory.value = false
  editingCategoryId.value = ''
  Object.assign(categoryForm, { code: '', name: '', parentCode: '', depreciationMethod: 'STRAIGHT_LINE', usefulLife: 5, status: 'ENABLED' })
  categoryDialogVisible.value = true
}

const handleAddSubCategory = (row) => {
  const node = findCategoryNode(categoryTree.value, row.id)
  isEditCategory.value = false
  editingCategoryId.value = ''
  Object.assign(categoryForm, {
    code: '',
    name: '',
    parentCode: node ? node.code : row.code,
    depreciationMethod: node ? node.depreciationMethod : 'STRAIGHT_LINE',
    usefulLife: node ? node.usefulLife : 5,
    status: 'ENABLED'
  })
  categoryDialogVisible.value = true
}

const handleEditCategory = (row) => {
  const node = findCategoryNode(categoryTree.value, row.id) || row
  isEditCategory.value = true
  editingCategoryId.value = node.id
  Object.assign(categoryForm, {
    code: node.code,
    name: node.name,
    parentCode: node.parentCode || '',
    depreciationMethod: node.depreciationMethod,
    usefulLife: node.usefulLife,
    status: node.status
  })
  categoryDialogVisible.value = true
}

const handleToggleCategory = (row) => {
  const node = findCategoryNode(categoryTree.value, row.id)
  if (!node) return
  const next = node.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  const applyTo = (nodes, status) => nodes.forEach(n => {
    n.status = status
    n.updateTime = nowText()
    applyTo(n.children || [], status)
  })
  node.status = next
  node.updateTime = nowText()
  applyTo(node.children || [], next)
  categoryCol.save()
  ElMessage.success(`分类"${node.name}"已${next}`)
}

const handleDeleteCategory = (row) => {
  ElMessageBox.confirm(`确定要删除分类"${row.name}"吗？其下级分类将一并删除。`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    const siblings = findCategorySiblings(categoryTree.value, row.id)
    if (siblings) {
      const idx = siblings.findIndex(n => n.id === row.id)
      if (idx > -1) siblings.splice(idx, 1)
      categoryCol.save()
      ElMessage.success('删除成功')
    }
  }).catch(() => {})
}

const handleCategorySubmit = () => {
  if (!categoryForm.name) {
    ElMessage.warning('请填写分类名称')
    return
  }
  const parent = categoryForm.parentCode ? findCategoryByCode(categoryTree.value, categoryForm.parentCode) : null
  if (isEditCategory.value && isCategoryLoop(editingCategoryId.value, categoryForm.parentCode)) {
    ElMessage.warning('上级分类不能选择自身或其下级分类')
    return
  }
  const code = categoryForm.code || `${parent ? parent.code : 'CAT'}${String(Date.now()).slice(-4)}`
  if (isEditCategory.value) {
    const node = findCategoryNode(categoryTree.value, editingCategoryId.value)
    if (node) {
      const current = findCategorySiblings(categoryTree.value, node.id)
      const target = parent ? parent.children : categoryTree.value
      Object.assign(node, {
        code,
        name: categoryForm.name,
        parentCode: parent ? parent.code : '',
        parentName: parent ? parent.name : '-',
        depreciationMethod: categoryForm.depreciationMethod,
        usefulLife: categoryForm.usefulLife,
        status: categoryForm.status,
        updateTime: nowText()
      })
      if (current && current !== target) {
        const idx = current.indexOf(node)
        if (idx > -1) current.splice(idx, 1)
        target.push(node)
      }
      categoryCol.save()
    }
    ElMessage.success('修改成功')
  } else {
    const node = {
      id: `${code}-${Date.now()}`,
      code,
      name: categoryForm.name,
      parentCode: parent ? parent.code : '',
      parentName: parent ? parent.name : '-',
      depreciationMethod: categoryForm.depreciationMethod,
      usefulLife: categoryForm.usefulLife,
      assetCount: 0,
      status: categoryForm.status,
      createTime: nowText(),
      updateTime: nowText(),
      children: []
    }
    if (parent) {
      parent.children.push(node)
    } else {
      categoryTree.value.unshift(node)
      catPage.value = 1
    }
    categoryCol.save()
    ElMessage.success('新增成功')
  }
  categoryDialogVisible.value = false
}

// 折旧设置
const depreciationRuleCol = useCollection(COLLECTION.settingsDepreciationRules)
const depreciationRules = depreciationRuleCol.items

const depreciationDialogVisible = ref(false)
const isEditDepreciation = ref(false)
const editingDepreciationIndex = ref(-1)
const depreciationForm = reactive({ name: '', method: 'STRAIGHT_LINE', usefulLife: 5, residualRate: 5, description: '' })

const handleAddDepreciation = () => {
  isEditDepreciation.value = false
  editingDepreciationIndex.value = -1
  Object.assign(depreciationForm, { name: '', method: 'STRAIGHT_LINE', usefulLife: 5, residualRate: 5, description: '' })
  depreciationDialogVisible.value = true
}

const handleEditDepreciation = (row) => {
  isEditDepreciation.value = true
  editingDepreciationIndex.value = depreciationRules.value.findIndex(d => d.name === row.name)
  Object.assign(depreciationForm, { name: row.name, method: row.method, usefulLife: row.usefulLife, residualRate: row.residualRate, description: row.description })
  depreciationDialogVisible.value = true
}

const handleDeleteDepreciation = (row) => {
  ElMessageBox.confirm(`确定要删除折旧规则"${row.name}"吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    depreciationRuleCol.remove(row)
    ElMessage.success('删除成功')
  }).catch(() => {})
}

const handleDepreciationSubmit = () => {
  if (!depreciationForm.name || !depreciationForm.method) {
    ElMessage.warning('请填写完整信息')
    return
  }
  if (isEditDepreciation.value && editingDepreciationIndex.value > -1) {
    const target = depreciationRules.value[editingDepreciationIndex.value]
    Object.assign(target, { ...depreciationForm })
    depreciationRuleCol.update(target)
    ElMessage.success('编辑成功')
  } else {
    depreciationRuleCol.add({ ...depreciationForm })
    ElMessage.success('新增成功')
  }
  depreciationDialogVisible.value = false
}

const depreciationPlanCol = useCollection(COLLECTION.settingsDepreciationPlans)
const depreciationPlans = depreciationPlanCol.items

const depSearch = reactive({ companyId: '', name: '', calcTime: '', purchaseMode: '' })
const depPage = ref(1)
const depPageSize = ref(15)
watch(depSearch, () => { depPage.value = 1 }, { deep: true })

const filteredDepreciationPlans = computed(() => depreciationPlans.value.filter(p =>
  (!depSearch.companyId || p.companyId === depSearch.companyId) &&
  (!depSearch.name || p.name.includes(depSearch.name)) &&
  (!depSearch.calcTime || p.calcTime === depSearch.calcTime) &&
  (!depSearch.purchaseMode || p.purchaseMode === depSearch.purchaseMode)
))

const pagedDepreciationPlans = computed(() => {
  const start = (depPage.value - 1) * depPageSize.value
  return filteredDepreciationPlans.value.slice(start, start + depPageSize.value)
})

const depTotal = computed(() => filteredDepreciationPlans.value.length)

function resetDepSearch() {
  Object.assign(depSearch, { companyId: '', name: '', calcTime: '', purchaseMode: '' })
  depPage.value = 1
}

const planDialogVisible = ref(false)
const isEditPlan = ref(false)
const editingPlanId = ref('')
const planForm = reactive({ companyId: '', name: '', method: 'STRAIGHT_LINE', assetTypes: [], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 25, purchaseMode: 'PURCHASE', remark: '' })

const handleAddPlan = () => {
  isEditPlan.value = false
  editingPlanId.value = ''
  Object.assign(planForm, { companyId: '', name: '', method: 'STRAIGHT_LINE', assetTypes: [], residualRate: 5, calcTime: 'MONTHLY', monthlyDay: 25, purchaseMode: 'PURCHASE', remark: '' })
  planDialogVisible.value = true
}

const handleEditPlan = (row) => {
  isEditPlan.value = true
  editingPlanId.value = row.id
  Object.assign(planForm, {
    companyId: row.companyId,
    name: row.name,
    method: row.method,
    assetTypes: [...row.assetTypes],
    residualRate: row.residualRate,
    calcTime: row.calcTime,
    monthlyDay: row.monthlyDay,
    purchaseMode: row.purchaseMode,
    remark: row.remark
  })
  planDialogVisible.value = true
}

const handleDeletePlan = (row) => {
  ElMessageBox.confirm(`确定要删除折旧设置"${row.name}"吗？`, '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    depreciationPlanCol.remove(row)
    ElMessage.success('删除成功')
  }).catch(() => {})
}

const handlePlanSubmit = () => {
  if (!planForm.companyId || !planForm.name) {
    ElMessage.warning('请填写所属公司与折旧名称')
    return
  }
  if (isEditPlan.value) {
    const target = depreciationPlans.value.find(p => p.id === editingPlanId.value)
    if (target) {
      Object.assign(target, { ...planForm, assetTypes: [...planForm.assetTypes], updateTime: nowText() })
      depreciationPlanCol.update(target)
    }
    ElMessage.success('修改成功')
  } else {
    depreciationPlanCol.add({
      id: `DP${Date.now()}`,
      companyId: planForm.companyId,
      name: planForm.name,
      method: planForm.method,
      assetTypes: [...planForm.assetTypes],
      residualRate: planForm.residualRate,
      calcTime: planForm.calcTime,
      monthlyDay: planForm.monthlyDay,
      purchaseMode: planForm.purchaseMode,
      remark: planForm.remark,
      createTime: nowText(),
      updateTime: nowText()
    })
    depPage.value = 1
    ElMessage.success('新增成功')
  }
  planDialogVisible.value = false
}

// 审批设置：引用全局流程（系统管理 > 流程配置），本页只读 + 启停
const APPROVAL_BIZ_TYPES = ['INBOUND', 'DISPATCH', 'BORROW', 'CHANGE', 'DISPOSE', 'INVENTORY']
const globalFlowCol = useCollection(COLLECTION.systemFlows)
const globalFlows = globalFlowCol.items
const approvalFlows = computed(() => globalFlows.value.filter(f => APPROVAL_BIZ_TYPES.includes(f.bizType)))

/** 环节名（全局流程环节为对象数组） */
const flowStepNames = row => (row.steps || []).map(s => s?.name || s).filter(Boolean)

const handleToggleApproval = row => {
  row.enabled = !row.enabled
  globalFlowCol.update(row)
  ElMessage.success(`流程「${row.name}」已${row.enabled ? '启用' : '停用'}`)
}

const goWorkflowConfig = () => router.push('/system/workflow')

const locPage = ref(1)
const locPageSize = ref(15)
const pagedLocationList = computed(() => {
  const start = (locPage.value - 1) * locPageSize.value
  return locationList.value.slice(start, start + locPageSize.value)
})

const rulePage = ref(1)
const rulePageSize = ref(15)
const pagedDepreciationRules = computed(() => {
  const start = (rulePage.value - 1) * rulePageSize.value
  return depreciationRules.value.slice(start, start + rulePageSize.value)
})

const apprPage = ref(1)
const apprPageSize = ref(15)
const pagedApprovalFlows = computed(() => {
  const start = (apprPage.value - 1) * apprPageSize.value
  return approvalFlows.value.slice(start, start + apprPageSize.value)
})
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
</style>
