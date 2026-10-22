<template>
  <div class="page-container">
    <div class="page-header">
      <h2>部门管理</h2>
      <div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          新增部门
        </el-button>
      </div>
    </div>

    <div class="org-split">
      <el-card shadow="never" class="tree-card">
        <template #header>
          <div class="card-head">
            <span>组织树</span>
            <el-button link type="primary" size="small" @click="resetTreeFilter">全部</el-button>
          </div>
        </template>
        <el-tree
          :data="orgStore.deptTree"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          default-expand-all
          highlight-current
          :expand-on-click-node="false"
          @node-click="handleNodeClick"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <el-tag v-if="data.type === 'company'" size="small" effect="plain" type="warning">公司</el-tag>
              {{ data.name }}
            </span>
          </template>
        </el-tree>
      </el-card>

      <el-card shadow="never" class="fill">
        <el-form :inline="true" class="search-form">
          <el-form-item label="部门名称">
            <el-input v-model="query.name" placeholder="名称/编码" clearable style="width: 180px" />
          </el-form-item>
          <el-form-item label="所属公司">
            <el-select v-model="query.companyId" placeholder="全部" clearable style="width: 200px">
              <el-option v-for="c in orgStore.companies" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
              <el-option label="启用" value="启用" />
              <el-option label="停用" value="停用" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">
              <el-icon><Search /></el-icon>
              查询
            </el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>

        <el-table :data="pagedList" border stripe style="width: 100%">
          <el-table-column prop="code" label="部门编码" width="120" />
          <el-table-column prop="name" label="部门名称" min-width="160" show-overflow-tooltip />
          <el-table-column label="上级部门" width="130" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.parentId">{{ parentName(row.parentId) }}</span>
              <span v-else class="muted">—（一级部门）</span>
            </template>
          </el-table-column>
          <el-table-column label="所属公司" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ orgStore.companyName(row.companyId) }}</template>
          </el-table-column>
          <el-table-column prop="leader" label="负责人" width="100" />
          <el-table-column prop="headcount" label="编制" width="80" align="center" />
          <el-table-column label="在职" width="80" align="center">
            <template #default="{ row }">
              <span class="num">{{ orgStore.deptMemberCount.get(row.id) || 0 }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="部门电话" width="130" />
          <el-table-column prop="sort" label="排序" width="70" align="center" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="230" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
              <el-button link type="primary" size="small" @click="openMembers(row)">部门人员</el-button>
              <el-button link :type="row.status === '启用' ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
                {{ row.status === '启用' ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无部门数据" :image-size="60" />
          </template>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            :page-sizes="[10, 20, 50]"
            :total="filteredList.length"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-card>
    </div>

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑部门' : '新增部门'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="dialog.form" :rules="rules" label-width="100px">
        <el-form-item label="部门编码">
          <el-input v-model="dialog.form.code" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="部门名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入部门名称" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="所属公司" prop="companyId">
          <el-select v-model="dialog.form.companyId" placeholder="请选择所属公司" style="width: 100%">
            <el-option v-for="c in orgStore.companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="上级部门">
          <el-select v-model="dialog.form.parentId" placeholder="无（一级部门）" clearable style="width: 100%">
            <el-option v-for="d in parentDeptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="部门负责人">
          <el-input v-model="dialog.form.leader" style="width: 200px" />
        </el-form-item>
        <el-form-item label="编制人数">
          <el-input-number v-model="dialog.form.headcount" :min="0" :precision="0" />
        </el-form-item>
        <el-form-item label="部门电话" prop="phone">
          <el-input v-model="dialog.form.phone" style="width: 200px" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="dialog.form.sort" :min="0" :precision="0" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="dialog.form.status">
            <el-radio value="启用">启用</el-radio>
            <el-radio value="停用">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="memberDialog.visible" title="部门人员" width="520px" destroy-on-close>
      <div class="member-head">
        <span>{{ memberDialog.dept ? orgStore.companyName(memberDialog.dept.companyId) + ' / ' + memberDialog.dept.name : '' }}</span>
        <el-input v-model="memberDialog.keyword" placeholder="搜索姓名/用户名" clearable size="small" style="width: 180px" />
      </div>
      <div class="member-actions">
        <el-button link type="primary" size="small" @click="selectAll">全选当前结果</el-button>
        <el-button link type="primary" size="small" @click="clearAll">清空</el-button>
        <span class="muted">已选 {{ memberDialog.ids.length }} 人</span>
      </div>
      <el-checkbox-group v-model="memberDialog.ids" class="member-list">
        <div v-for="u in filteredMembers" :key="u.id" class="member-row">
          <el-checkbox :value="u.id">
            {{ u.name }}（{{ u.position || '—' }} · {{ u.phone }}）
          </el-checkbox>
        </div>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="memberDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="saveMembers">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useOrgStore } from '../../store/org'

const orgStore = useOrgStore()

const query = reactive({ name: '', companyId: '', status: '' })
const treeFilter = reactive({ companyId: '', deptId: '' })
const page = ref(1)
const pageSize = ref(15)

const filteredList = computed(() => {
  const kw = query.name.trim()
  return orgStore.departments.filter(d => {
    if (treeFilter.deptId && d.id !== treeFilter.deptId) return false
    if (treeFilter.companyId && d.companyId !== treeFilter.companyId) return false
    if (query.companyId && d.companyId !== query.companyId) return false
    if (query.status && d.status !== query.status) return false
    if (kw && !`${d.name}${d.code}`.includes(kw)) return false
    return true
  }).sort((a, b) => (a.sort || 0) - (b.sort || 0))
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

function parentName(id) {
  return orgStore.departments.find(d => d.id === id)?.name || ''
}

function handleSearch() { page.value = 1 }

function handleReset() {
  query.name = ''
  query.companyId = ''
  query.status = ''
  resetTreeFilter()
}

function resetTreeFilter() {
  treeFilter.companyId = ''
  treeFilter.deptId = ''
  page.value = 1
}

function handleNodeClick(data) {
  if (data.type === 'company') {
    treeFilter.companyId = data.id
    treeFilter.deptId = ''
  } else {
    treeFilter.companyId = ''
    treeFilter.deptId = data.id
  }
  page.value = 1
}

async function toggleStatus(row) {
  const next = row.status === '启用' ? '停用' : '启用'
  try {
    await orgStore.updateDept(row.id, { status: next })
    ElMessage.success(`已${next}部门「${row.name}」`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除部门「${row.name}」？`, '提示', { type: 'warning' })
    await orgStore.removeDept(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

const formRef = ref()
const dialog = reactive({ visible: false, isEdit: false, form: emptyForm() })

const rules = {
  name: [{ required: true, message: '请输入部门名称', trigger: 'blur' }],
  companyId: [{ required: true, message: '请选择所属公司', trigger: 'change' }],
  phone: [{ pattern: /^(\d{3,4}-)?\d{7,8}(-\d{1,5})?$|^1[3-9]\d{9}$/, message: '部门电话格式不正确', trigger: 'blur' }]
}

function emptyForm() {
  return { id: '', code: '', name: '', companyId: '', parentId: null, leader: '', headcount: 0, phone: '', sort: 0, status: '启用' }
}

/** 上级部门候选：同一公司内的部门，且排除自身及其子孙 */
const parentDeptOptions = computed(() => {
  const editingId = dialog.isEdit ? dialog.form.id : null
  const companyId = dialog.form.companyId
  if (!companyId) return []
  const descendants = []
  const collect = id => {
    orgStore.departments.filter(d => d.parentId === id).forEach(d => {
      descendants.push(d.id)
      collect(d.id)
    })
  }
  if (editingId) collect(editingId)
  return orgStore.departments.filter(d => d.companyId === companyId && d.id !== editingId && !descendants.includes(d.id))
})

function openDialog(row) {
  dialog.isEdit = !!row
  Object.assign(dialog.form, row ? { ...row } : emptyForm())
  if (!row && !dialog.form.companyId) dialog.form.companyId = orgStore.companies[0]?.id || ''
  dialog.visible = true
  nextTick(() => formRef.value?.clearValidate())
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  if (dialog.form.parentId === dialog.form.id) {
    ElMessage.warning('上级部门不能是自身')
    return
  }
  try {
    const payload = { ...dialog.form }
    if (!payload.parentId) payload.parentId = null
    if (dialog.isEdit) {
      await orgStore.updateDept(dialog.form.id, payload)
      ElMessage.success('部门信息已更新')
    } else {
      await orgStore.addDept(payload)
      ElMessage.success('部门已新增')
    }
    dialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

// ---------- 部门人员 ----------
const memberDialog = reactive({ visible: false, dept: null, ids: [], keyword: '' })

const filteredMembers = computed(() => {
  const kw = memberDialog.keyword.trim()
  const list = memberDialog.dept
    ? orgStore.users.filter(u => u.companyId === memberDialog.dept.companyId || u.deptId === memberDialog.dept.id)
    : orgStore.users
  return kw ? list.filter(u => `${u.name}${u.username}`.includes(kw)) : list
})

function openMembers(row) {
  memberDialog.dept = row
  memberDialog.keyword = ''
  memberDialog.ids = orgStore.users.filter(u => u.deptId === row.id).map(u => u.id)
  memberDialog.visible = true
}

function selectAll() {
  const set = new Set(memberDialog.ids)
  filteredMembers.value.forEach(u => set.add(u.id))
  memberDialog.ids = [...set]
}

function clearAll() {
  memberDialog.ids = []
}

async function saveMembers() {
  try {
    const count = await orgStore.setDeptMembers(memberDialog.dept.id, memberDialog.ids)
    memberDialog.visible = false
    ElMessage.success(`部门人员已更新，调整 ${count} 人`)
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}
</script>

<style scoped>
.search-form {
  margin-bottom: 16px;
}

.org-split {
  display: grid;
  gap: 16px;
  grid-template-columns: 300px minmax(0, 1fr);
}

@media (max-width: 1200px) {
  .org-split { grid-template-columns: minmax(0, 1fr); }
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tree-card {
  align-self: start;
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.muted {
  color: var(--t-weak);
}

.member-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.member-list {
  display: block;
  max-height: 360px;
  overflow: auto;
}

.member-row {
  padding: 6px 0;
  border-bottom: 1px dashed var(--bd-split);
}
</style>
