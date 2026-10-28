<template>
  <div class="page-container">
    <div class="page-header">
      <h2>低值资产基础设置</h2>
    </div>

    <el-card class="fill">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        <template #title>
          <span>物品类别已统一纳入「系统管理 &gt; 数据字典」维护（字典类型：低值资产类别），改文案 / 停用 / 新增类别对全站即时生效。</span>
        </template>
        <el-button v-if="can('sys:dict')" type="primary" link size="small" @click="goDict">
          <el-icon><Setting /></el-icon>
          前往数据字典维护
        </el-button>
      </el-alert>

      <el-tabs v-model="activeTab">
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

          <el-table :data="pagedFlowList" style="width: 100%">
            <el-table-column prop="name" label="流程名称" min-width="180" />
            <el-table-column label="适用业务" width="120">
              <template #default="{ row }">{{ labelOf('BUSINESS_TYPE', row.bizType) }}</template>
            </el-table-column>
            <el-table-column label="审批环节" min-width="260">
              <template #default="{ row }">
                <el-tag v-for="(step, idx) in flowStepNames(row)" :key="idx" size="small" style="margin-right: 8px">{{ step }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.enabled ? 'success' : 'info'" size="small" effect="light">{{ row.enabled ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button link :type="row.enabled ? 'warning' : 'success'" size="small" @click="toggleFlow(row)">
                  {{ row.enabled ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="flowPage"
              v-model:page-size="flowPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="globalFlows.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

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
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Setting } from '@element-plus/icons-vue'
import { useLowValueAssetStore } from '../../store/lowValueAsset'
import { useUserStore } from '../../store/user'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'
import { labelOf } from '../../constants/enums'

const router = useRouter()
const store = useLowValueAssetStore()
const userStore = useUserStore()
// 物品与存放位置会被导入/清空改动，进入页面时刷新一次
onMounted(() => store.loadAll().catch(() => {}))
/** 权限判定：按钮级鉴权 */
const can = code => userStore.can(code)
const activeTab = ref('location')

function itemCountOf(locationName) {
  return store.items.filter(i => i.location === locationName).length
}

// ---------- 分页 ----------
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
  return globalFlows.value.slice(start, start + flowPageSize.value)
})

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

// ---------- 审批流程：引用全局流程（系统管理 > 流程配置） ----------
const LOW_VALUE_BIZ_TYPES = ['REQUISITION', 'RETURN']
const globalFlowCol = useCollection(COLLECTION.systemFlows)
const globalFlows = computed(() => globalFlowCol.items.value.filter(f => LOW_VALUE_BIZ_TYPES.includes(f.bizType)))

/** 环节名（全局流程环节为对象数组） */
const flowStepNames = row => (row.steps || []).map(s => s?.name || s).filter(Boolean)

async function toggleFlow(row) {
  row.enabled = !row.enabled
  await globalFlowCol.update(row)
  ElMessage.success(`流程「${row.name}」已${row.enabled ? '启用' : '停用'}`)
}

const goWorkflowConfig = () => router.push('/system/workflow')

/** 类别统一在「系统管理 > 数据字典」维护 */
const goDict = () => router.push('/system/dict')
</script>

<style scoped>
.pager {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
