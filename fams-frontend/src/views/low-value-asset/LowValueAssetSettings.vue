<template>
  <div class="page-container">
    <div class="page-header">
      <h2>低值资产基础设置</h2>
    </div>

    <el-card class="fill">
      <el-tabs v-model="activeTab">
        <!-- 类别设置 -->
        <el-tab-pane label="类别设置" name="category">
          <el-button type="primary" style="margin-bottom: 16px" @click="openCategoryDialog()">
            <el-icon><Plus /></el-icon>
            新增类别
          </el-button>

          <el-table :data="pagedCategoryList" style="width: 100%">
            <el-table-column prop="code" label="类别编码" width="120" />
            <el-table-column prop="name" label="类别名称" min-width="180" />
            <el-table-column prop="sort" label="排序" width="80" align="right" />
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small" effect="light">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="remark" label="说明" min-width="200" show-overflow-tooltip />
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openCategoryDialog(row)">编辑</el-button>
                <el-button link :type="row.status === 'ENABLED' ? 'warning' : 'success'" size="small" @click="toggleCategory(row)">
                  {{ row.status === 'ENABLED' ? '停用' : '启用' }}
                </el-button>
                <el-button link type="danger" size="small" @click="removeCategory(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="catPage"
              v-model:page-size="catPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="store.categories.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 位置设置 -->
        <el-tab-pane label="位置设置" name="location">
          <el-button type="primary" style="margin-bottom: 16px" @click="openLocationDialog()">
            <el-icon><Plus /></el-icon>
            新增位置
          </el-button>

          <el-table :data="pagedLocationList" style="width: 100%">
            <el-table-column prop="code" label="位置编码" width="120" />
            <el-table-column prop="name" label="位置名称" min-width="180" />
            <el-table-column label="上级位置" width="150">
              <template #default="{ row }">{{ row.parentName || '—（一级位置）' }}</template>
            </el-table-column>
            <el-table-column prop="manager" label="负责人" width="100" />
            <el-table-column label="物品数量" width="100" align="right">
              <template #default="{ row }"><span class="num">{{ itemCountOf(row.name) }}</span></template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small" effect="light">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openLocationDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="removeLocation(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="locPage"
              v-model:page-size="locPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="store.locations.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 审批设置 -->
        <el-tab-pane label="审批设置" name="approval">
          <el-button type="primary" style="margin-bottom: 16px" @click="openFlowDialog()">
            <el-icon><Plus /></el-icon>
            新增流程
          </el-button>

          <el-table :data="pagedFlowList" style="width: 100%">
            <el-table-column prop="name" label="流程名称" min-width="180" />
            <el-table-column prop="businessType" label="适用业务" width="120" />
            <el-table-column label="审批步骤" min-width="260">
              <template #default="{ row }">
                <span>{{ (row.steps || []).join(' → ') }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small" effect="light">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openFlowDialog(row)">编辑</el-button>
                <el-button link :type="row.status === 'ENABLED' ? 'warning' : 'success'" size="small" @click="toggleFlow(row)">
                  {{ row.status === 'ENABLED' ? '停用' : '启用' }}
                </el-button>
                <el-button link type="danger" size="small" @click="removeFlow(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="flowPage"
              v-model:page-size="flowPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="store.approvalFlows.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 类别对话框 -->
    <el-dialog v-model="categoryDialog.visible" :title="categoryDialog.isEdit ? '编辑类别' : '新增类别'" width="500px">
      <el-form ref="categoryFormRef" :model="categoryDialog.form" :rules="categoryRules" label-width="90px">
        <el-form-item label="类别编码">
          <el-input v-model="categoryDialog.form.code" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="类别名称" prop="name">
          <el-input v-model="categoryDialog.form.name" placeholder="请输入类别名称" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="categoryDialog.form.sort" :min="0" :precision="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="categoryDialog.form.status" style="width: 160px">
            <el-option label="启用" value="ENABLED" />
            <el-option label="禁用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="categoryDialog.form.remark" type="textarea" :rows="2" placeholder="请输入说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitCategory">确定</el-button>
      </template>
    </el-dialog>

    <!-- 位置对话框 -->
    <el-dialog v-model="locationDialog.visible" :title="locationDialog.isEdit ? '编辑位置' : '新增位置'" width="500px">
      <el-form ref="locationFormRef" :model="locationDialog.form" :rules="locationRules" label-width="90px">
        <el-form-item label="位置编码">
          <el-input v-model="locationDialog.form.code" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="位置名称" prop="name">
          <el-input v-model="locationDialog.form.name" placeholder="请输入位置名称" />
        </el-form-item>
        <el-form-item label="上级位置">
          <el-select v-model="locationDialog.form.parentCode" placeholder="请选择上级位置" clearable style="width: 100%" @change="onParentChange">
            <el-option v-for="l in store.locations" :key="l.code" :label="l.name" :value="l.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="负责人">
          <el-input v-model="locationDialog.form.manager" placeholder="请输入负责人" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="locationDialog.form.status" style="width: 160px">
            <el-option label="启用" value="ENABLED" />
            <el-option label="禁用" value="DISABLED" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="locationDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitLocation">确定</el-button>
      </template>
    </el-dialog>

    <!-- 流程对话框 -->
    <el-dialog v-model="flowDialog.visible" :title="flowDialog.isEdit ? '编辑流程' : '新增流程'" width="500px">
      <el-form ref="flowFormRef" :model="flowDialog.form" :rules="flowRules" label-width="90px">
        <el-form-item label="流程名称" prop="name">
          <el-input v-model="flowDialog.form.name" placeholder="请输入流程名称" />
        </el-form-item>
        <el-form-item label="适用业务" prop="businessType">
          <el-select v-model="flowDialog.form.businessType" placeholder="请选择适用业务" style="width: 100%">
            <el-option label="入库" value="入库" />
            <el-option label="领用" value="领用" />
            <el-option label="退库" value="退库" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批步骤" prop="stepsText">
          <el-input v-model="flowDialog.form.stepsText" type="textarea" :rows="4" placeholder="每行一个步骤，例如：&#10;部门负责人审批&#10;行政部审核" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="flowDialog.form.status" style="width: 160px">
            <el-option label="启用" value="ENABLED" />
            <el-option label="禁用" value="DISABLED" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="flowDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitFlow">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useLowValueAssetStore } from '../../store/lowValueAsset'
import { labelOf, optionsOf } from '../../constants/enums'

const store = useLowValueAssetStore()
const activeTab = ref('category')

function itemCountOf(locationName) {
  return store.items.filter(i => i.location === locationName).length
}

// ---------- 分页 ----------
const catPage = ref(1)
const catPageSize = ref(15)
const pagedCategoryList = computed(() => {
  const start = (catPage.value - 1) * catPageSize.value
  return store.categories.slice(start, start + catPageSize.value)
})

const locPage = ref(1)
const locPageSize = ref(15)
const pagedLocationList = computed(() => {
  const start = (locPage.value - 1) * locPageSize.value
  return store.locations.slice(start, start + locPageSize.value)
})

const flowPage = ref(1)
const flowPageSize = ref(15)
const pagedFlowList = computed(() => {
  const start = (flowPage.value - 1) * flowPageSize.value
  return store.approvalFlows.slice(start, start + flowPageSize.value)
})

// ---------- 类别 ----------
const categoryFormRef = ref()
const categoryDialog = reactive({
  visible: false,
  isEdit: false,
  form: { id: '', code: '', name: '', sort: 0, status: 'ENABLED', remark: '' }
})

const categoryRules = {
  name: [{ required: true, message: '请输入类别名称', trigger: 'blur' }]
}

function openCategoryDialog(row) {
  categoryDialog.isEdit = !!row
  Object.assign(categoryDialog.form, row
    ? { ...row }
    : { id: '', code: '', name: '', sort: store.categories.length + 1, status: 'ENABLED', remark: '' })
  categoryDialog.visible = true
  nextTick(() => categoryFormRef.value?.clearValidate())
}

async function submitCategory() {
  const valid = await categoryFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (categoryDialog.isEdit) {
      await store.updateCategory(categoryDialog.form.id, categoryDialog.form)
      ElMessage.success('类别更新成功')
    } else {
      await store.addCategory(categoryDialog.form)
      ElMessage.success('类别新增成功')
    }
    categoryDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

async function toggleCategory(row) {
  try {
    await store.updateCategory(row.id, { status: row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' })
    ElMessage.success('状态已更新')
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function removeCategory(row) {
  try {
    await ElMessageBox.confirm(`确认删除类别「${row.name}」？`, '提示', { type: 'warning' })
    await store.removeCategory(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

// ---------- 位置 ----------
const locationFormRef = ref()
const locationDialog = reactive({
  visible: false,
  isEdit: false,
  form: { id: '', code: '', name: '', parentCode: '', parentName: '', manager: '', status: 'ENABLED' }
})

const locationRules = {
  name: [{ required: true, message: '请输入位置名称', trigger: 'blur' }]
}

function onParentChange(code) {
  const parent = store.locations.find(l => l.code === code)
  locationDialog.form.parentName = parent ? parent.name : ''
}

function openLocationDialog(row) {
  locationDialog.isEdit = !!row
  Object.assign(locationDialog.form, row
    ? { ...row }
    : { id: '', code: '', name: '', parentCode: '', parentName: '', manager: '', status: 'ENABLED' })
  locationDialog.visible = true
  nextTick(() => locationFormRef.value?.clearValidate())
}

async function submitLocation() {
  const valid = await locationFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (locationDialog.isEdit) {
      await store.updateLocation(locationDialog.form.id, locationDialog.form)
      ElMessage.success('位置更新成功')
    } else {
      await store.addLocation(locationDialog.form)
      ElMessage.success('位置新增成功')
    }
    locationDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

async function removeLocation(row) {
  try {
    await ElMessageBox.confirm(`确认删除位置「${row.name}」？`, '提示', { type: 'warning' })
    await store.removeLocation(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

// ---------- 审批流程 ----------
const flowFormRef = ref()
const flowDialog = reactive({
  visible: false,
  isEdit: false,
  form: { id: '', name: '', businessType: '领用', stepsText: '', status: 'ENABLED' }
})

const flowRules = {
  name: [{ required: true, message: '请输入流程名称', trigger: 'blur' }],
  businessType: [{ required: true, message: '请选择适用业务', trigger: 'change' }],
  stepsText: [{ required: true, message: '请输入审批步骤', trigger: 'blur' }]
}

function openFlowDialog(row) {
  flowDialog.isEdit = !!row
  Object.assign(flowDialog.form, row
    ? { ...row, stepsText: (row.steps || []).join('\n') }
    : { id: '', name: '', businessType: '领用', stepsText: '部门负责人审批\n行政部审核', status: 'ENABLED' })
  flowDialog.visible = true
  nextTick(() => flowFormRef.value?.clearValidate())
}

async function submitFlow() {
  const valid = await flowFormRef.value.validate().catch(() => false)
  if (!valid) return
  const steps = flowDialog.form.stepsText.split('\n').map(s => s.trim()).filter(Boolean)
  if (!steps.length) {
    ElMessage.warning('请至少配置一个审批步骤')
    return
  }
  const payload = { name: flowDialog.form.name, businessType: flowDialog.form.businessType, steps, status: flowDialog.form.status }
  try {
    if (flowDialog.isEdit) {
      await store.updateFlow(flowDialog.form.id, payload)
      ElMessage.success('流程更新成功')
    } else {
      await store.addFlow(payload)
      ElMessage.success('流程新增成功')
    }
    flowDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

async function toggleFlow(row) {
  try {
    await store.updateFlow(row.id, { status: row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' })
    ElMessage.success('状态已更新')
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function removeFlow(row) {
  try {
    await ElMessageBox.confirm(`确认删除流程「${row.name}」？`, '提示', { type: 'warning' })
    await store.removeFlow(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}
</script>

<style scoped>
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
