<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据字典</h2>
      <span class="sub">业务枚举的统一维护入口 · 修改字典项即时作用于全站文案</span>
    </div>

    <div class="dict-layout">
      <!-- 左：字典类型 -->
      <div class="dict-side">
        <div class="toolbar">
          <el-input v-model="typeQuery.name" placeholder="字典名称" clearable style="width:150px" prefix-icon="Search" />
          <el-button type="primary" :icon="Plus" @click="openType()">新增</el-button>
        </div>
        <el-table :data="pagedTypes" border highlight-current-row size="small" @current-change="handleTypeRowClick">
          <el-table-column prop="name" label="字典名称" min-width="130" />
          <el-table-column prop="code" label="字典编码" min-width="150" show-overflow-tooltip />
          <el-table-column prop="count" label="项数" width="60" align="center" />
          <el-table-column label="状态" width="70" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="typePage"
            v-model:page-size="typePageSize"
            :total="filteredTypes.length"
            :page-sizes="[10, 20, 50]"
            layout="total, prev, pager, next"
          />
        </div>
      </div>

      <!-- 右：字典项 -->
      <div class="dict-main">
        <div class="dict-main-head">
          <div>
            <h3>{{ currentType ? currentType.name : '字典项' }}</h3>
            <span class="muted">{{ currentType ? `编码 ${currentType.code}` : '请先选择左侧字典类型' }}</span>
            <el-tag v-if="boundEnum" type="warning" size="small" effect="plain" class="bound-tag">
              已绑定枚举 {{ boundEnum }}：修改后全站文案即时生效
            </el-tag>
          </div>
          <div class="toolbar">
            <el-input v-model="itemQuery.keyword" placeholder="标签/编码" clearable style="width:160px" prefix-icon="Search" />
            <el-button type="primary" :icon="Plus" :disabled="!currentType" @click="openItem()">新增字典项</el-button>
            <el-button :disabled="!currentType" @click="openType(currentType)">编辑类型</el-button>
          </div>
        </div>

        <el-table :data="pagedItems" border stripe>
          <el-table-column prop="label" label="标签" min-width="140" />
          <el-table-column prop="value" label="值（枚举编码）" min-width="150">
            <template #default="{ row }"><code class="code">{{ row.value }}</code></template>
          </el-table-column>
          <el-table-column prop="sort" label="排序" width="70" align="right" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'" size="small">{{ labelOf('ENABLE_STATUS', row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          <el-table-column label="更新时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="180" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="openItem(row)">编辑</el-button>
              <el-button type="warning" link size="small" @click="toggleItem(row)">{{ row.status === 'ENABLED' ? '停用' : '启用' }}</el-button>
              <el-button type="danger" link size="small" @click="deleteItem(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无字典项" :image-size="70" />
          </template>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="itemPage"
            v-model:page-size="itemPageSize"
            :total="filteredItems.length"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </div>
    </div>

    <!-- 字典类型弹窗 -->
    <el-dialog v-model="showType" :title="editingType ? '编辑字典类型' : '新增字典类型'" width="480px">
      <el-form :model="typeForm" label-width="100px">
        <el-form-item label="字典名称" required><el-input v-model="typeForm.name" placeholder="如：资产状态" /></el-form-item>
        <el-form-item label="字典编码" required>
          <el-input v-model="typeForm.code" :disabled="editingType" placeholder="如：asset_status" />
          <div class="muted hint">编码为枚举绑定依据，创建后不建议修改</div>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="typeForm.status" style="width:100%">
            <el-option label="启用" value="ENABLED" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="typeForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showType = false">取消</el-button>
        <el-button type="primary" @click="saveType">保存</el-button>
      </template>
    </el-dialog>

    <!-- 字典项弹窗 -->
    <el-dialog v-model="showItem" :title="editingItem ? '编辑字典项' : '新增字典项'" width="480px">
      <el-form :model="itemForm" label-width="110px">
        <el-form-item label="标签" required><el-input v-model="itemForm.label" placeholder="展示文案，如：空闲" /></el-form-item>
        <el-form-item label="值" required>
          <el-input v-model="itemForm.value" :disabled="editingItem" placeholder="枚举编码，如：IDLE" />
          <div class="muted hint">值即存储编码，一经使用不可修改</div>
        </el-form-item>
        <el-form-item label="排序"><el-input-number v-model="itemForm.sort" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="itemForm.status" style="width:100%">
            <el-option label="启用" value="ENABLED" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="itemForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showItem = false">取消</el-button>
        <el-button type="primary" @click="saveItem">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION, dataService } from '../../services'
import { labelOf, DICT_CODE_TO_ENUM } from '../../constants/enums'
import { loadDictEnums } from '../../services/dictEnums'
import { formatDateTime } from '../../utils/format'

// ---------------------------------------------------------------- 字典类型
const dictTypeCol = useCollection(COLLECTION.systemDictTypes)
const dictTypes = dictTypeCol.items

const typeQuery = reactive({ name: '', status: '' })
const filteredTypes = computed(() => dictTypes.value.filter(t => {
  if (typeQuery.name && !t.name.includes(typeQuery.name)) return false
  if (typeQuery.status && t.status !== typeQuery.status) return false
  return true
}))
const typePage = ref(1)
const typePageSize = ref(10)
const pagedTypes = computed(() => filteredTypes.value.slice((typePage.value - 1) * typePageSize.value, typePage.value * typePageSize.value))

const selectedType = ref('')
const currentType = computed(() => dictTypes.value.find(t => t.code === selectedType.value) || null)
/** 该字典是否绑定了业务枚举（绑定后改动即时作用全站） */
const boundEnum = computed(() => (currentType.value ? DICT_CODE_TO_ENUM[currentType.value.code] : ''))

function handleTypeRowClick(row) {
  // el-table 在数据翻页时，若高亮行不在新一页会以 null 触发 current-change
  if (!row) return
  selectedType.value = row.code
  itemPage.value = 1
  itemQuery.keyword = ''
  loadItems(row.code)
}

// 首次加载后自动选中第一个字典类型
watch(dictTypes, list => {
  if (!selectedType.value && list.length) {
    selectedType.value = list[0].code
    loadItems(list[0].code)
  }
}, { immediate: true })

// ---------------------------------------------------------------- 字典项
/** 每个字典类型一个集合：system-dict-types-{code}-items（按需加载，不预建全部集合） */
const itemRows = ref([])
const itemsCollection = code => `${COLLECTION.systemDictTypes}-${code}-items`

async function loadItems(code) {
  if (!code) { itemRows.value = []; return }
  try {
    itemRows.value = await dataService.list(itemsCollection(code))
  } catch (e) {
    itemRows.value = []
  }
}

const itemQuery = reactive({ keyword: '' })
const filteredItems = computed(() => itemRows.value.filter(i => {
  const kw = itemQuery.keyword.trim()
  if (kw && !(`${i.label} ${i.value}`.includes(kw))) return false
  return true
}))
const itemPage = ref(1)
const itemPageSize = ref(10)
const pagedItems = computed(() => filteredItems.value.slice((itemPage.value - 1) * itemPageSize.value, itemPage.value * itemPageSize.value))

/** 字典项变更后刷新全站枚举文案 */
async function refreshEnums() {
  await loadDictEnums()
}

// ---------------------------------------------------------------- 字典类型维护
const showType = ref(false)
const editingType = ref(false)
const typeForm = ref({ code: '', name: '', status: 'ENABLED', remark: '' })

function openType(row) {
  editingType.value = !!row
  typeForm.value = row
    ? { code: row.code, name: row.name, status: row.status || 'ENABLED', remark: row.remark || '' }
    : { code: '', name: '', status: 'ENABLED', remark: '' }
  showType.value = true
}

async function saveType() {
  const { code, name } = typeForm.value
  if (!code || !name) { ElMessage.warning('请填写字典名称与编码'); return }
  if (!editingType.value && dictTypes.value.some(t => t.code === code)) {
    ElMessage.warning('字典编码已存在')
    return
  }
  if (editingType.value) {
    const t = dictTypes.value.find(x => x.code === code)
    if (t) {
      Object.assign(t, {
        name,
        status: typeForm.value.status,
        remark: typeForm.value.remark,
        updateTime: new Date().toISOString()
      })
      await dictTypeCol.update(t)
    }
  } else {
    const created = await dictTypeCol.add({
      code,
      name,
      count: 0,
      status: typeForm.value.status,
      remark: typeForm.value.remark,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString()
    })
    selectedType.value = created?.code || code
    await loadItems(code)
  }
  showType.value = false
  await refreshEnums()
  ElMessage.success('保存成功')
}

// ---------------------------------------------------------------- 字典项维护
const showItem = ref(false)
const editingItem = ref(false)
const itemForm = ref({ label: '', value: '', sort: 1, status: 'ENABLED', remark: '' })

function openItem(row) {
  if (!selectedType.value) { ElMessage.warning('请先选择字典类型'); return }
  editingItem.value = !!row
  itemForm.value = row
    ? { id: row.id, label: row.label, value: row.value, sort: row.sort || 1, status: row.status || 'ENABLED', remark: row.remark || '' }
    : { id: '', label: '', value: '', sort: (itemRows.value.length || 0) + 1, status: 'ENABLED', remark: '' }
  showItem.value = true
}

async function saveItem() {
  const { label, value } = itemForm.value
  if (!label || !value) { ElMessage.warning('请填写标签与值'); return }
  const col = itemsCollection(selectedType.value)
  const now = new Date().toISOString()
  if (editingItem.value) {
    const row = itemRows.value.find(i => i.id === itemForm.value.id)
    if (row) {
      Object.assign(row, {
        label,
        sort: itemForm.value.sort,
        status: itemForm.value.status,
        remark: itemForm.value.remark,
        updateTime: now
      })
      const saved = await dataService.update(col, row.id, { ...row })
      // 写回服务端返回（含自增 version），否则再次编辑同一字典项会被乐观锁误判为冲突
      if (saved) Object.assign(row, saved)
    }
  } else {
    if (itemRows.value.some(i => i.value === value)) { ElMessage.warning('该编码已存在'); return }
    await dataService.create(col, {
      id: `DI_${selectedType.value}_${value}`,
      label,
      value,
      sort: itemForm.value.sort,
      status: itemForm.value.status,
      remark: itemForm.value.remark,
      createTime: now,
      updateTime: now
    })
  }
  showItem.value = false
  await loadItems(selectedType.value)
  await refreshEnums()
  await syncTypeCount()
  ElMessage.success('保存成功')
}

/** 字典项增删改后同步字典类型的项数 */
async function syncTypeCount() {
  const t = dictTypes.value.find(x => x.code === selectedType.value)
  if (!t) return
  const count = itemRows.value.length
  if (t.count !== count) {
    t.count = count
    t.updateTime = new Date().toISOString()
    await dictTypeCol.update(t)
  }
}

async function toggleItem(row) {
  row.status = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  row.updateTime = new Date().toISOString()
  const saved = await dataService.update(itemsCollection(selectedType.value), row.id, { ...row })
  if (saved) Object.assign(row, saved)
  await loadItems(selectedType.value)
  await refreshEnums()
  ElMessage.success(row.status === 'ENABLED' ? '已启用' : '已停用')
}

async function deleteItem(row) {
  ElMessageBox.confirm(`确认删除字典项「${row.label}」？`, '提示', { type: 'warning' }).then(async () => {
    await dataService.remove(itemsCollection(selectedType.value), row.id)
    await loadItems(selectedType.value)
    await refreshEnums()
    await syncTypeCount()
    ElMessage.success('已删除')
  }).catch(() => {})
}
</script>

<style scoped>
.page-header { display: flex; align-items: baseline; gap: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-header .sub { color: var(--t-weak); font-size: 13px; }
.dict-layout { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
.dict-side, .dict-main { background: var(--t-card, #fff); border: 1px solid var(--t-border, #ebeef5); border-radius: 8px; padding: 12px; }
.dict-main-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.dict-main-head h3 { margin: 0 0 4px; font-size: 16px; }
.bound-tag { margin-left: 10px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.muted { color: var(--t-weak); }
.hint { font-size: 12px; line-height: 1.4; margin-top: 2px; }
.code { background: var(--t-bg-soft, #f5f7fa); padding: 1px 6px; border-radius: 4px; font-size: 12px; }
</style>
