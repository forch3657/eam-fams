<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据字典</h2>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="字典管理" name="dict">
        <div class="dict-split">
          <el-card shadow="never">
            <template #header>
              <span>字典类型</span>
            </template>
            <el-form inline style="margin-bottom:4px">
              <el-form-item>
                <el-input v-model="typeQuery.name" placeholder="请输入名称" clearable style="width:150px" />
              </el-form-item>
              <el-form-item>
                <el-select v-model="typeQuery.status" placeholder="请选择状态" clearable style="width:130px">
                  <el-option label="启用" value="启用" />
                  <el-option label="禁用" value="禁用" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" :icon="Search" @click="typePage = 1">查询</el-button>
                <el-button type="primary" plain :icon="Plus" @click="showCreate = true">新增</el-button>
              </el-form-item>
            </el-form>
            <el-table :data="pagedTypes" border stripe :row-class-name="typeRowClass" style="width:100%;cursor:pointer" @row-click="handleTypeRowClick">
              <el-table-column prop="name" label="名称" min-width="100" />
              <el-table-column prop="code" label="编码" min-width="120" show-overflow-tooltip />
              <el-table-column prop="count" label="项数" width="60" align="center" class-name="num" />
              <el-table-column prop="status" label="状态" width="70" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.status === '启用' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="createTime" label="创建时间" width="150" />
              <el-table-column prop="updateTime" label="更新时间" width="150" />
              <template #empty>
                <el-empty description="暂无数据" :image-size="60" />
              </template>
            </el-table>
            <div class="pager">
              <el-pagination
                v-model:current-page="typePage"
                v-model:page-size="typePageSize"
                :total="filteredTypes.length"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next, jumper"
                size="small"
              />
            </div>
          </el-card>
          <el-card shadow="never">
            <template #header>
              <div class="card-head">
                <span>字典项 <span v-if="currentType" class="sub-hint">（{{ currentType.name }}）</span></span>
                <el-button type="primary" size="small" @click="showAddItem = true" :disabled="!currentType">新增字典项</el-button>
              </div>
            </template>
            <el-table :data="pagedItems" border stripe>
              <el-table-column prop="label" label="标签" width="120" />
              <el-table-column prop="value" label="值" width="110" />
              <el-table-column prop="sort" label="排序" width="70" align="right" class-name="num" />
              <el-table-column prop="status" label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="row.status === '启用' ? 'success' : 'danger'" size="small">{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip />
              <el-table-column prop="createTime" label="创建时间" width="150" />
              <el-table-column prop="updateTime" label="更新时间" width="150" />
              <el-table-column label="操作" width="130" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="editItem(row)">编辑</el-button>
                  <el-button type="danger" link size="small" @click="deleteItem(row)">删除</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无数据" :image-size="60" />
              </template>
            </el-table>
            <div class="pager">
              <el-pagination
                v-model:current-page="itemPage"
                v-model:page-size="itemPageSize"
                :total="currentItems.length"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next, jumper"
                size="small"
              />
            </div>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="资产类型表单配置" name="formSchema">
        <div class="schema-split">
          <el-card shadow="never">
            <template #header>
              <div class="card-head">
                <span>资产类型</span>
                <el-button type="primary" size="small" @click="showAddAssetType = true">新增类型</el-button>
              </div>
            </template>
            <el-menu :default-active="selectedAssetType" @select="handleAssetTypeSelect">
              <el-menu-item v-for="at in assetTypes" :key="at.code" :index="at.code">
                <div class="node-row">
                  <span>{{ at.name }}</span>
                  <el-tag size="small" type="info">{{ at.fields.length }} 字段</el-tag>
                </div>
              </el-menu-item>
            </el-menu>
          </el-card>
          <el-card shadow="never">
            <template #header>
              <div class="card-head">
                <span>字段配置 <span v-if="currentAssetType" class="sub-hint">（{{ currentAssetType.name }}）</span></span>
                <div>
                  <el-button type="success" size="small" @click="previewForm = true" :disabled="!currentAssetType">预览表单</el-button>
                  <el-button type="primary" size="small" @click="showAddField = true" :disabled="!currentAssetType">新增字段</el-button>
                </div>
              </div>
            </template>
            <el-table :data="pagedFields" border stripe>
              <el-table-column prop="label" label="字段名称" width="140" />
              <el-table-column prop="key" label="字段标识" width="130">
                <template #default="{ row }">
                  <code class="code-key">{{ row.key }}</code>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="控件类型" width="110">
                <template #default="{ row }">
                  <el-tag size="small">{{ controlTypeLabel(row.type) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="required" label="必填" width="70" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="options" label="选项/默认值" min-width="180">
                <template #default="{ row }">
                  <span v-if="row.type === 'select' || row.type === 'radio'">{{ (row.options || []).join('、') || '-' }}</span>
                  <span v-else-if="row.defaultValue">{{ row.defaultValue }}</span>
                  <span v-else class="muted">-</span>
                </template>
              </el-table-column>
              <el-table-column prop="placeholder" label="提示文字" width="140" />
              <el-table-column prop="sort" label="排序" width="70" align="right" class-name="num" />
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="editField(row)">编辑</el-button>
                  <el-button type="danger" link size="small" @click="deleteField(row)">删除</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无数据" :image-size="60" />
              </template>
            </el-table>
            <div class="pager">
              <el-pagination
                v-model:current-page="fieldPage"
                v-model:page-size="fieldPageSize"
                :total="currentFields.length"
                :page-sizes="[10, 20, 50]"
                layout="total, sizes, prev, pager, next, jumper"
              />
            </div>
          </el-card>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showCreate" title="新增字典类型" width="500px">
      <el-form :model="typeForm" label-width="100px">
        <el-form-item label="字典名称" required>
          <el-input v-model="typeForm.name" />
        </el-form-item>
        <el-form-item label="字典编码" required>
          <el-input v-model="typeForm.code" placeholder="如：asset_status" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="typeForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="saveType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddItem" :title="editingItem ? '编辑字典项' : '新增字典项'" width="500px">
      <el-form :model="itemForm" label-width="100px">
        <el-form-item label="标签" required>
          <el-input v-model="itemForm.label" />
        </el-form-item>
        <el-form-item label="值" required>
          <el-input v-model="itemForm.value" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="itemForm.sort" :min="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="itemForm.enabled" active-text="启用" inactive-text="禁用" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="itemForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddItem = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddAssetType" :title="editingAssetType ? '编辑资产类型' : '新增资产类型'" width="500px">
      <el-form :model="assetTypeForm" label-width="100px">
        <el-form-item label="类型名称" required>
          <el-input v-model="assetTypeForm.name" placeholder="如：商铺、写字楼、厂房" />
        </el-form-item>
        <el-form-item label="类型编码" required>
          <el-input v-model="assetTypeForm.code" placeholder="如：shop、office、factory" :disabled="!!editingAssetType" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="assetTypeForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddAssetType = false">取消</el-button>
        <el-button type="primary" @click="saveAssetType">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAddField" :title="editingField ? '编辑字段' : '新增字段'" width="620px" destroy-on-close>
      <el-form :model="fieldForm" label-width="100px">
        <el-form-item label="字段名称" required>
          <el-input v-model="fieldForm.label" placeholder="如：建筑面积、楼层、朝向" />
        </el-form-item>
        <el-form-item label="字段标识" required>
          <el-input v-model="fieldForm.key" placeholder="英文标识，如：buildingArea、floor、orientation" :disabled="!!editingField" />
        </el-form-item>
        <el-form-item label="控件类型" required>
          <el-select v-model="fieldForm.type" style="width:100%">
            <el-option label="单行文本" value="input" />
            <el-option label="多行文本" value="textarea" />
            <el-option label="数字" value="number" />
            <el-option label="下拉选择" value="select" />
            <el-option label="单选" value="radio" />
            <el-option label="日期" value="date" />
            <el-option label="日期范围" value="daterange" />
            <el-option label="开关" value="switch" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="fieldForm.type === 'select' || fieldForm.type === 'radio'" label="选项列表" required>
          <el-input v-model="fieldForm.optionsText" type="textarea" :rows="3" placeholder="每行一个选项，如：&#10;一楼&#10;二楼&#10;三楼" />
          <div class="form-tip">每行一个选项</div>
        </el-form-item>
        <el-form-item label="默认值">
          <el-input v-model="fieldForm.defaultValue" placeholder="选填" />
        </el-form-item>
        <el-form-item label="提示文字">
          <el-input v-model="fieldForm.placeholder" placeholder="输入框提示，选填" />
        </el-form-item>
        <el-form-item label="必填">
          <el-switch v-model="fieldForm.required" active-text="是" inactive-text="否" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="fieldForm.sort" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddField = false">取消</el-button>
        <el-button type="primary" @click="saveField">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewForm" title="表单预览" width="650px" destroy-on-close>
      <template v-if="currentAssetType">
        <el-alert :title="`资产类型：${currentAssetType.name}`" type="info" :closable="false" show-icon style="margin-bottom:16px" />
        <el-form :model="previewData" label-width="110px">
          <el-form-item v-for="field in currentFields" :key="field.key" :label="field.label" :required="field.required">
            <el-input v-if="field.type === 'input'" v-model="previewData[field.key]" :placeholder="field.placeholder || `请输入${field.label}`" />
            <el-input v-else-if="field.type === 'textarea'" v-model="previewData[field.key]" type="textarea" :rows="3" :placeholder="field.placeholder || `请输入${field.label}`" />
            <el-input-number v-else-if="field.type === 'number'" v-model="previewData[field.key]" :placeholder="field.placeholder" style="width:100%" />
            <el-select v-else-if="field.type === 'select'" v-model="previewData[field.key]" :placeholder="field.placeholder || `请选择${field.label}`" style="width:100%">
              <el-option v-for="opt in field.options" :key="opt" :label="opt" :value="opt" />
            </el-select>
            <el-radio-group v-else-if="field.type === 'radio'" v-model="previewData[field.key]">
              <el-radio v-for="opt in field.options" :key="opt" :value="opt">{{ opt }}</el-radio>
            </el-radio-group>
            <el-date-picker v-else-if="field.type === 'date'" v-model="previewData[field.key]" type="date" :placeholder="field.placeholder || `请选择${field.label}`" style="width:100%" />
            <el-date-picker v-else-if="field.type === 'daterange'" v-model="previewData[field.key]" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" style="width:100%" />
            <el-switch v-else-if="field.type === 'switch'" v-model="previewData[field.key]" />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="previewForm = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'

const activeTab = ref('dict')

const selectedType = ref('asset_status')
const showCreate = ref(false)
const showAddItem = ref(false)
const editingItem = ref(null)

const typeForm = ref({ name: '', code: '', remark: '' })
const itemForm = ref({ label: '', value: '', sort: 0, enabled: true, remark: '' })

const typeQuery = reactive({ name: '', status: '' })

const dictTypeCol = useCollection(COLLECTION.systemDictTypes, [
  { code: 'asset_status', name: '资产状态', count: 5, status: '启用', createTime: '2024-01-05 09:00:00', updateTime: '2026-08-20 15:32:10' },
  { code: 'asset_type', name: '资产类型', count: 4, status: '启用', createTime: '2024-01-05 09:10:00', updateTime: '2026-07-11 10:05:44' },
  { code: 'contract_status', name: '合同状态', count: 4, status: '启用', createTime: '2024-02-18 14:20:00', updateTime: '2026-06-30 09:41:02' },
  { code: 'fee_type', name: '费项类型', count: 3, status: '启用', createTime: '2024-02-18 14:35:00', updateTime: '2026-05-19 16:22:37' },
  { code: 'warning_level', name: '预警级别', count: 3, status: '禁用', createTime: '2024-03-02 11:00:00', updateTime: '2026-04-08 11:47:53' },
])
const dictTypes = dictTypeCol.items

const DICT_ITEMS_SEED = {
  asset_status: [
    { id: 1, label: '已出租', value: 'rented', sort: 1, status: '启用', remark: '', createTime: '2024-01-05 09:30:00', updateTime: '2026-08-20 15:32:10' },
    { id: 2, label: '闲置', value: 'idle', sort: 2, status: '启用', remark: '', createTime: '2024-01-05 09:31:00', updateTime: '2026-08-20 15:32:10' },
    { id: 3, label: '自用', value: 'selfuse', sort: 3, status: '启用', remark: '', createTime: '2024-01-05 09:32:00', updateTime: '2026-03-14 09:18:26' },
    { id: 4, label: '未办证', value: 'uncert', sort: 4, status: '启用', remark: '', createTime: '2024-01-05 09:33:00', updateTime: '2026-03-14 09:18:26' },
    { id: 5, label: '已处置', value: 'disposed', sort: 5, status: '禁用', remark: '停用中', createTime: '2024-01-05 09:34:00', updateTime: '2026-02-01 17:02:19' },
  ],
  asset_type: [
    { id: 1, label: '商业用房', value: 'commercial', sort: 1, status: '启用', remark: '', createTime: '2024-01-05 10:00:00', updateTime: '2026-07-11 10:05:44' },
    { id: 2, label: '工业厂房', value: 'industrial', sort: 2, status: '启用', remark: '', createTime: '2024-01-05 10:01:00', updateTime: '2026-07-11 10:05:44' },
    { id: 3, label: '办公用房', value: 'office', sort: 3, status: '启用', remark: '', createTime: '2024-01-05 10:02:00', updateTime: '2026-01-22 14:36:08' },
    { id: 4, label: '其他', value: 'other', sort: 4, status: '启用', remark: '', createTime: '2024-01-05 10:03:00', updateTime: '2026-01-22 14:36:08' },
  ],
  contract_status: [
    { id: 1, label: '履行中', value: 'active', sort: 1, status: '启用', remark: '', createTime: '2024-02-18 15:00:00', updateTime: '2026-06-30 09:41:02' },
    { id: 2, label: '已到期', value: 'expired', sort: 2, status: '启用', remark: '', createTime: '2024-02-18 15:01:00', updateTime: '2026-06-30 09:41:02' },
    { id: 3, label: '已终止', value: 'terminated', sort: 3, status: '启用', remark: '', createTime: '2024-02-18 15:02:00', updateTime: '2025-12-09 10:11:45' },
    { id: 4, label: '欠费', value: 'arrears', sort: 4, status: '启用', remark: '', createTime: '2024-02-18 15:03:00', updateTime: '2025-12-09 10:11:45' },
  ],
  fee_type: [
    { id: 1, label: '租金', value: 'rent', sort: 1, status: '启用', remark: '', createTime: '2024-02-18 16:00:00', updateTime: '2026-05-19 16:22:37' },
    { id: 2, label: '管理费', value: 'management', sort: 2, status: '启用', remark: '', createTime: '2024-02-18 16:01:00', updateTime: '2026-05-19 16:22:37' },
    { id: 3, label: '水电费', value: 'utility', sort: 3, status: '启用', remark: '', createTime: '2024-02-18 16:02:00', updateTime: '2025-11-27 09:03:52' },
  ],
  warning_level: [
    { id: 1, label: '高', value: 'high', sort: 1, status: '启用', remark: '', createTime: '2024-03-02 11:20:00', updateTime: '2026-04-08 11:47:53' },
    { id: 2, label: '中', value: 'medium', sort: 2, status: '启用', remark: '', createTime: '2024-03-02 11:21:00', updateTime: '2026-04-08 11:47:53' },
    { id: 3, label: '低', value: 'low', sort: 3, status: '启用', remark: '', createTime: '2024-03-02 11:22:00', updateTime: '2025-10-16 15:29:31' },
  ],
}

// 每个字典类型对应一个集合，读写走服务层
const dictItemCols = {}
Object.keys(DICT_ITEMS_SEED).forEach(code => {
  dictItemCols[code] = useCollection(`${COLLECTION.systemDictTypes}-${code}-items`, DICT_ITEMS_SEED[code])
})

function dictItemCol(code) {
  if (!dictItemCols[code]) {
    dictItemCols[code] = useCollection(`${COLLECTION.systemDictTypes}-${code}-items`, [], { immediate: false })
  }
  return dictItemCols[code]
}

const dictItems = reactive(Object.fromEntries(Object.keys(DICT_ITEMS_SEED).map(code => [code, dictItemCols[code].items])))

const filteredTypes = computed(() => dictTypes.value.filter(t => {
  if (typeQuery.name && !t.name.includes(typeQuery.name)) return false
  if (typeQuery.status && t.status !== typeQuery.status) return false
  return true
}))

const typePage = ref(1)
const typePageSize = ref(10)
const pagedTypes = computed(() => filteredTypes.value.slice((typePage.value - 1) * typePageSize.value, typePage.value * typePageSize.value))

const currentType = computed(() => dictTypes.value.find(t => t.code === selectedType.value))
const currentItems = computed(() => dictItems[selectedType.value] || [])

const itemPage = ref(1)
const itemPageSize = ref(10)
const pagedItems = computed(() => currentItems.value.slice((itemPage.value - 1) * itemPageSize.value, itemPage.value * itemPageSize.value))

const typeRowClass = ({ row }) => row.code === selectedType.value ? 'current-row' : ''

const handleTypeRowClick = (row) => {
  selectedType.value = row.code
  itemPage.value = 1
}

const editItem = (row) => {
  editingItem.value = row
  itemForm.value = { label: row.label, value: row.value, sort: row.sort, enabled: row.status === '启用', remark: row.remark }
  showAddItem.value = true
}

const deleteItem = (row) => {
  ElMessageBox.confirm(`确认删除字典项"${row.label}"？`, '提示', { type: 'warning' }).then(() => {
    dictItemCol(selectedType.value).remove(row)
    const t = dictTypes.value.find(t => t.code === selectedType.value)
    if (t) {
      t.count = Math.max(0, t.count - 1)
      t.updateTime = new Date().toLocaleString('zh-CN', { hour12: false })
      dictTypeCol.update(t)
    }
    ElMessage.success('删除成功')
  }).catch(() => {})
}

const saveType = () => {
  if (!typeForm.value.name || !typeForm.value.code) { ElMessage.warning('请填写完整信息'); return }
  if (!dictTypes.value.some(t => t.code === typeForm.value.code)) {
    const now = new Date().toLocaleString('zh-CN', { hour12: false })
    dictTypeCol.add({ code: typeForm.value.code, name: typeForm.value.name, count: 0, status: '启用', createTime: now, updateTime: now })
    dictItems[typeForm.value.code] = dictItemCol(typeForm.value.code).items
  }
  showCreate.value = false
  typeForm.value = { name: '', code: '', remark: '' }
  ElMessage.success('保存成功')
}

const saveItem = () => {
  if (!itemForm.value.label || !itemForm.value.value) { ElMessage.warning('请填写完整信息'); return }
  const col = dictItemCol(selectedType.value)
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  if (editingItem.value) {
    Object.assign(editingItem.value, {
      label: itemForm.value.label, value: itemForm.value.value, sort: itemForm.value.sort,
      status: itemForm.value.enabled ? '启用' : '禁用', remark: itemForm.value.remark, updateTime: now
    })
    col.update(editingItem.value)
  } else {
    col.add({
      id: Date.now(), label: itemForm.value.label, value: itemForm.value.value, sort: itemForm.value.sort,
      status: itemForm.value.enabled ? '启用' : '禁用', remark: itemForm.value.remark, createTime: now, updateTime: now
    })
    const t = dictTypes.value.find(t => t.code === selectedType.value)
    if (t) {
      t.count = col.items.value.length
      t.updateTime = now
      dictTypeCol.update(t)
    }
  }
  showAddItem.value = false
  editingItem.value = null
  itemForm.value = { label: '', value: '', sort: 0, enabled: true, remark: '' }
  ElMessage.success('保存成功')
}

const controlTypeLabel = (type) => {
  const map = { input: '单行文本', textarea: '多行文本', number: '数字', select: '下拉选择', radio: '单选', date: '日期', daterange: '日期范围', switch: '开关' }
  return map[type] || type
}

const selectedAssetType = ref('shop')
const showAddAssetType = ref(false)
const editingAssetType = ref(null)
const assetTypeForm = ref({ name: '', code: '', remark: '' })

const showAddField = ref(false)
const editingField = ref(null)
const fieldForm = ref({ label: '', key: '', type: 'input', optionsText: '', defaultValue: '', placeholder: '', required: false, sort: 0 })

const previewForm = ref(false)
const previewData = reactive({})

const assetTypeCol = useCollection(COLLECTION.systemAssetTypes, [
  {
    code: 'shop', name: '商铺', remark: '',
    fields: [
      { label: '建筑面积', key: 'buildingArea', type: 'number', required: true, sort: 1, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '使用面积', key: 'usableArea', type: 'number', required: false, sort: 2, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '楼层', key: 'floor', type: 'select', required: false, sort: 3, placeholder: '请选择楼层', options: ['一楼', '二楼', '三楼', '四楼及以上'], defaultValue: '' },
      { label: '门面宽度', key: 'frontWidth', type: 'number', required: false, sort: 4, placeholder: '单位：米', options: [], defaultValue: '' },
      { label: '是否有夹层', key: 'hasMezzanine', type: 'switch', required: false, sort: 5, placeholder: '', options: [], defaultValue: '' },
      { label: '业态限制', key: 'businessLimit', type: 'radio', required: false, sort: 6, placeholder: '', options: ['餐饮', '零售', '不限'], defaultValue: '不限' },
    ]
  },
  {
    code: 'office', name: '写字楼', remark: '',
    fields: [
      { label: '建筑面积', key: 'buildingArea', type: 'number', required: true, sort: 1, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '所在楼层', key: 'floor', type: 'input', required: false, sort: 2, placeholder: '如：15F', options: [], defaultValue: '' },
      { label: '总楼层', key: 'totalFloors', type: 'number', required: false, sort: 3, placeholder: '楼栋总楼层数', options: [], defaultValue: '' },
      { label: '装修状况', key: 'decoration', type: 'select', required: false, sort: 4, placeholder: '请选择', options: ['毛坯', '简装', '精装', '豪华装修'], defaultValue: '' },
      { label: '是否含车位', key: 'hasParking', type: 'switch', required: false, sort: 5, placeholder: '', options: [], defaultValue: '' },
      { label: '车位数量', key: 'parkingCount', type: 'number', required: false, sort: 6, placeholder: '含车位时填写', options: [], defaultValue: '' },
    ]
  },
  {
    code: 'factory', name: '厂房', remark: '',
    fields: [
      { label: '建筑面积', key: 'buildingArea', type: 'number', required: true, sort: 1, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '占地面积', key: 'landArea', type: 'number', required: true, sort: 2, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '层高', key: 'ceilingHeight', type: 'number', required: false, sort: 3, placeholder: '单位：米', options: [], defaultValue: '' },
      { label: '承重能力', key: 'loadCapacity', type: 'number', required: false, sort: 4, placeholder: '单位：吨/平方米', options: [], defaultValue: '' },
      { label: '配电容量', key: 'powerCapacity', type: 'number', required: false, sort: 5, placeholder: '单位：KVA', options: [], defaultValue: '' },
      { label: '消防等级', key: 'fireRating', type: 'select', required: false, sort: 6, placeholder: '请选择', options: ['甲级', '乙级', '丙级', '丁级'], defaultValue: '' },
      { label: '有无行车', key: 'hasCrane', type: 'switch', required: false, sort: 7, placeholder: '', options: [], defaultValue: '' },
      { label: '备注说明', key: 'remarks', type: 'textarea', required: false, sort: 8, placeholder: '其他特殊说明', options: [], defaultValue: '' },
    ]
  },
  {
    code: 'land', name: '土地', remark: '',
    fields: [
      { label: '土地面积', key: 'landArea', type: 'number', required: true, sort: 1, placeholder: '单位：平方米', options: [], defaultValue: '' },
      { label: '土地性质', key: 'landNature', type: 'select', required: true, sort: 2, placeholder: '请选择', options: ['出让', '划拨', '租赁'], defaultValue: '' },
      { label: '用地类型', key: 'landUsage', type: 'select', required: true, sort: 3, placeholder: '请选择', options: ['住宅用地', '商业用地', '工业用地', '综合用地'], defaultValue: '' },
      { label: '容积率', key: 'plotRatio', type: 'number', required: false, sort: 4, placeholder: '', options: [], defaultValue: '' },
      { label: '建筑密度', key: 'buildingDensity', type: 'number', required: false, sort: 5, placeholder: '单位：%', options: [], defaultValue: '' },
      { label: '使用年限', key: 'usageYears', type: 'number', required: false, sort: 6, placeholder: '单位：年', options: [], defaultValue: '' },
      { label: '使用期限', key: 'usagePeriod', type: 'daterange', required: false, sort: 7, placeholder: '', options: [], defaultValue: '' },
    ]
  },
])
const assetTypes = assetTypeCol.items

const currentAssetType = computed(() => assetTypes.value.find(at => at.code === selectedAssetType.value))
const currentFields = computed(() => currentAssetType.value ? [...currentAssetType.value.fields].sort((a, b) => a.sort - b.sort) : [])

const fieldPage = ref(1)
const fieldPageSize = ref(10)
const pagedFields = computed(() => currentFields.value.slice((fieldPage.value - 1) * fieldPageSize.value, fieldPage.value * fieldPageSize.value))

const handleAssetTypeSelect = (code) => {
  selectedAssetType.value = code
  fieldPage.value = 1
}

const saveAssetType = () => {
  if (!assetTypeForm.value.name || !assetTypeForm.value.code) { ElMessage.warning('请填写完整信息'); return }
  if (editingAssetType.value) {
    Object.assign(editingAssetType.value, { name: assetTypeForm.value.name, remark: assetTypeForm.value.remark })
    assetTypeCol.update(editingAssetType.value)
    ElMessage.success('资产类型已更新')
  } else {
    assetTypeCol.add({ code: assetTypeForm.value.code, name: assetTypeForm.value.name, remark: assetTypeForm.value.remark, fields: [] })
    ElMessage.success('资产类型已添加')
  }
  showAddAssetType.value = false
  editingAssetType.value = null
}

const editField = (field) => {
  editingField.value = field
  fieldForm.value = {
    label: field.label, key: field.key, type: field.type,
    optionsText: (field.options || []).join('\n'),
    defaultValue: field.defaultValue || '',
    placeholder: field.placeholder || '',
    required: field.required, sort: field.sort
  }
  showAddField.value = true
}

const deleteField = (field) => {
  ElMessageBox.confirm('确认删除该字段配置？', '提示', { type: 'warning' }).then(() => {
    const fields = currentAssetType.value.fields
    const idx = fields.findIndex(f => f === field)
    if (idx > -1) fields.splice(idx, 1)
    assetTypeCol.update(currentAssetType.value)
    ElMessage.success('字段已删除')
  }).catch(() => {})
}

const saveField = () => {
  if (!fieldForm.value.label || !fieldForm.value.key) { ElMessage.warning('请填写字段名称和标识'); return }
  if ((fieldForm.value.type === 'select' || fieldForm.value.type === 'radio') && !fieldForm.value.optionsText.trim()) {
    ElMessage.warning('下拉/单选类型必须配置选项')
    return
  }
  const fieldData = {
    label: fieldForm.value.label,
    key: fieldForm.value.key,
    type: fieldForm.value.type,
    required: fieldForm.value.required,
    sort: fieldForm.value.sort,
    placeholder: fieldForm.value.placeholder,
    defaultValue: fieldForm.value.defaultValue,
    options: fieldForm.value.optionsText ? fieldForm.value.optionsText.split('\n').filter(Boolean) : []
  }
  if (editingField.value) {
    Object.assign(editingField.value, fieldData)
    assetTypeCol.update(currentAssetType.value)
    ElMessage.success('字段已更新')
  } else {
    currentAssetType.value.fields.push(fieldData)
    assetTypeCol.update(currentAssetType.value)
    ElMessage.success('字段已添加')
  }
  showAddField.value = false
  editingField.value = null
}
</script>

<style scoped>
/* 两栏一律"定宽/比例 + 自适应"，右栏吃满剩余宽度，中间不留大洞 */
.dict-split {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 11fr) minmax(0, 13fr);
}

.schema-split {
  display: grid;
  gap: 16px;
  grid-template-columns: 280px minmax(0, 1fr);
}

@media (max-width: 1200px) {
  .dict-split,
  .schema-split { grid-template-columns: minmax(0, 1fr); }
}

.card-head { display: flex; justify-content: space-between; align-items: center; }
.node-row { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.sub-hint { color: var(--t-weak); font-size: 13px; }
.muted { color: var(--t-weak); }
.code-key { color: var(--c-primary); font-family: var(--font-mono); }
.form-tip { color: var(--t-weak); font-size: 12px; margin-top: 4px; }
</style>
