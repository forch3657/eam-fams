<template>
  <div class="page-container">
    <div class="page-header">
      <h2>角色管理</h2>
      <div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          新增角色
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="fill">
      <el-form :inline="true" class="search-form">
        <el-form-item label="角色名称">
          <el-input v-model="query.keyword" placeholder="角色名称 / 编码" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" placeholder="全部" clearable style="width: 120px">
            <el-option label="启用" value="启用" />
            <el-option label="停用" value="停用" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="page = 1">
            <el-icon><Search /></el-icon>
            查询
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <el-table :data="pagedList" border stripe style="width: 100%">
        <el-table-column prop="code" label="角色编码" width="140" />
        <el-table-column prop="name" label="角色名称" width="140" />
        <el-table-column prop="orgScope" label="所属组织" width="110" />
        <el-table-column prop="dataScope" label="数据范围" width="140" />
        <el-table-column label="关联用户" width="100" align="center">
          <template #default="{ row }">
            <span class="num">{{ orgStore.roleUserCount.get(row.id) || 0 }}</span> 人
          </template>
        </el-table-column>
        <el-table-column label="权限数" width="90" align="center">
          <template #default="{ row }"><span class="num">{{ (row.permissions || []).length }}</span></template>
        </el-table-column>
        <el-table-column prop="remark" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button link type="primary" size="small" @click="openPermDialog(row)">权限配置</el-button>
            <el-button link :type="row.status === '启用' ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === '启用' ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无角色数据" :image-size="60" />
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑角色' : '新增角色'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="dialog.form" :rules="rules" label-width="100px">
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="dialog.form.code" placeholder="如：ROLE_ASSET" :disabled="dialog.isEdit" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="所属组织">
          <el-select v-model="dialog.form.orgScope" style="width: 100%">
            <el-option v-for="s in orgScopeOptions" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="dialog.form.dataScope" style="width: 100%">
            <el-option v-for="s in dataScopeOptions" :key="s" :label="s" :value="s" />
          </el-select>
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
        <el-form-item label="说明">
          <el-input v-model="dialog.form.remark" type="textarea" :rows="2" placeholder="角色职责说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permDialog.visible" :title="permDialog.role ? `权限配置 — ${permDialog.role.name}` : '权限配置'" width="560px" destroy-on-close>
      <div class="perm-head">
        <span class="muted">勾选该角色可访问的模块与操作</span>
        <div>
          <el-button link type="primary" size="small" @click="toggleAll(true)">全选</el-button>
          <el-button link type="primary" size="small" @click="toggleAll(false)">清空</el-button>
        </div>
      </div>
      <el-tree
        ref="permTreeRef"
        :data="PERMISSION_TREE"
        show-checkbox
        node-key="id"
        default-expand-all
        :props="{ label: 'label', children: 'children' }"
        :default-checked-keys="permDialog.keys"
      />
      <template #footer>
        <el-button @click="permDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="savePerm">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useOrgStore } from '../../store/org'
import { PERMISSION_TREE } from '../../config/permissions'

const orgStore = useOrgStore()

const orgScopeOptions = ['全集团', '本公司', '本部门']
const dataScopeOptions = ['全部数据', '本公司及以下', '本部门及以下', '本部门', '仅本人']

const query = reactive({ keyword: '', status: '' })
const page = ref(1)
const pageSize = ref(15)

const filteredList = computed(() => {
  const kw = query.keyword.trim()
  return orgStore.roles.filter(r => {
    if (query.status && r.status !== query.status) return false
    if (kw && !`${r.name}${r.code}`.includes(kw)) return false
    return true
  }).sort((a, b) => (a.sort || 0) - (b.sort || 0))
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

function handleReset() {
  query.keyword = ''
  query.status = ''
  page.value = 1
}

async function toggleStatus(row) {
  const next = row.status === '启用' ? '停用' : '启用'
  try {
    await orgStore.updateRole(row.id, { status: next })
    ElMessage.success(`已${next}角色「${row.name}」`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除角色「${row.name}」？`, '提示', { type: 'warning' })
    await orgStore.removeRole(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

const formRef = ref()
const dialog = reactive({ visible: false, isEdit: false, form: emptyForm() })

const rules = {
  code: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    { pattern: /^[A-Z][A-Z0-9_]{2,29}$/, message: '大写字母开头，3-30 位大写字母数字下划线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }]
}

function emptyForm() {
  return { id: '', code: '', name: '', orgScope: '本公司', dataScope: '本公司及以下', sort: 0, status: '启用', remark: '' }
}

function openDialog(row) {
  dialog.isEdit = !!row
  Object.assign(dialog.form, row ? { ...row } : emptyForm())
  if (!row) dialog.form.sort = orgStore.roles.length + 1
  dialog.visible = true
  nextTick(() => formRef.value?.clearValidate())
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (dialog.isEdit) {
      await orgStore.updateRole(dialog.form.id, dialog.form)
      ElMessage.success('角色已更新')
    } else {
      await orgStore.addRole(dialog.form)
      ElMessage.success('角色已新增')
    }
    dialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

// ---------- 权限配置 ----------
const permTreeRef = ref()
const permDialog = reactive({ visible: false, role: null, keys: [] })

function openPermDialog(row) {
  permDialog.role = row
  permDialog.keys = [...(row.permissions || [])]
  permDialog.visible = true
}

function toggleAll(checked) {
  const all = PERMISSION_TREE.flatMap(m => m.children.map(c => c.id))
  permTreeRef.value.setCheckedKeys(checked ? all : [])
}

async function savePerm() {
  const keys = [
    ...permTreeRef.value.getCheckedKeys(false),
    ...permTreeRef.value.getHalfCheckedKeys()
  ]
  const leafKeys = keys.filter(k => k.includes(':'))
  try {
    await orgStore.setRolePermissions(permDialog.role.id, leafKeys)
    permDialog.visible = false
    ElMessage.success(`「${permDialog.role.name}」权限已保存（${leafKeys.length} 项）`)
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}
</script>

<style scoped>
.search-form {
  margin-bottom: 16px;
}

.muted {
  color: var(--t-weak);
}

.perm-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
</style>
