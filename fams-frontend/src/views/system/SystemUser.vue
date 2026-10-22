<template>
  <div class="page-container">
    <div class="page-header">
      <h2>用户管理</h2>
      <div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          新增用户
        </el-button>
      </div>
    </div>

    <el-card shadow="never" class="fill">
      <el-form :inline="true" class="search-form">
        <el-form-item label="关键字">
          <el-input v-model="query.keyword" placeholder="用户名 / 姓名 / 手机号" clearable style="width: 200px" />
        </el-form-item>
        <el-form-item label="所属公司">
          <el-select v-model="query.companyId" placeholder="全部" clearable style="width: 200px">
            <el-option v-for="c in orgStore.companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属部门">
          <el-select v-model="query.deptId" placeholder="全部" clearable style="width: 180px">
            <el-option v-for="d in deptFilterOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="query.roleId" placeholder="全部" clearable style="width: 150px">
            <el-option v-for="r in orgStore.roles" :key="r.id" :label="r.name" :value="r.id" />
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
        <el-table-column prop="username" label="用户名" width="120" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column label="所属公司" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ orgStore.companyName(row.companyId) }}</template>
        </el-table-column>
        <el-table-column label="所属部门" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.deptId">{{ orgStore.deptName(row.deptId) }}</span>
            <span v-else class="muted">未分配</span>
          </template>
        </el-table-column>
        <el-table-column prop="position" label="岗位" width="120" show-overflow-tooltip />
        <el-table-column label="角色" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-for="id in row.roleIds || []" :key="id" size="small" effect="light" class="role-tag">
              {{ roleName(id) }}
            </el-tag>
            <span v-if="!(row.roleIds || []).length" class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最后登录" width="170" />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button link type="warning" size="small" @click="handleResetPassword(row)">重置密码</el-button>
            <el-button link :type="row.status === '启用' ? 'danger' : 'success'" size="small" @click="toggleStatus(row)">
              {{ row.status === '启用' ? '停用' : '启用' }}
            </el-button>
            <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无用户数据" :image-size="60" />
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑用户' : '新增用户'" width="560px" destroy-on-close>
      <el-form ref="formRef" :model="dialog.form" :rules="rules" label-width="100px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="dialog.form.username" placeholder="登录账号" :disabled="dialog.isEdit" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="所属公司" prop="companyId">
          <el-select v-model="dialog.form.companyId" placeholder="请选择公司" style="width: 100%">
            <el-option v-for="c in orgStore.companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属部门" prop="deptId">
          <el-select v-model="dialog.form.deptId" placeholder="请选择部门" clearable style="width: 100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="岗位">
          <el-input v-model="dialog.form.position" placeholder="如：技术部经理" />
        </el-form-item>
        <el-form-item label="角色" prop="roleIds">
          <el-select v-model="dialog.form.roleIds" multiple placeholder="请选择角色（可多选）" style="width: 100%">
            <el-option v-for="r in orgStore.roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="dialog.form.phone" style="width: 200px" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="dialog.form.email" style="width: 260px" />
        </el-form-item>
        <el-form-item v-if="!dialog.isEdit" label="初始密码" prop="password">
          <el-input v-model="dialog.form.password" placeholder="留空则默认 123456" show-password style="width: 200px" />
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useOrgStore } from '../../store/org'

const orgStore = useOrgStore()

const query = reactive({ keyword: '', companyId: '', deptId: '', roleId: '', status: '' })
const page = ref(1)
const pageSize = ref(15)

const filteredList = computed(() => {
  const kw = query.keyword.trim()
  return orgStore.users.filter(u => {
    if (query.companyId && u.companyId !== query.companyId) return false
    if (query.deptId && u.deptId !== query.deptId) return false
    if (query.roleId && !(u.roleIds || []).includes(query.roleId)) return false
    if (query.status && u.status !== query.status) return false
    if (kw && !`${u.username}${u.name}${u.phone || ''}`.includes(kw)) return false
    return true
  })
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

const deptFilterOptions = computed(() => {
  const list = query.companyId
    ? orgStore.departments.filter(d => d.companyId === query.companyId)
    : orgStore.departments
  return list
})

function roleName(id) {
  return orgStore.roles.find(r => r.id === id)?.name || id
}

function handleSearch() { page.value = 1 }

function handleReset() {
  Object.assign(query, { keyword: '', companyId: '', deptId: '', roleId: '', status: '' })
  page.value = 1
}

async function toggleStatus(row) {
  const next = row.status === '启用' ? '停用' : '启用'
  try {
    await orgStore.updateUser(row.id, { status: next })
    ElMessage.success(`用户「${row.name}」已${next}`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function handleResetPassword(row) {
  try {
    await ElMessageBox.confirm(`确认将「${row.name}」的密码重置为随机密码？`, '提示', { type: 'warning' })
    const pwd = await orgStore.resetPassword(row.id)
    ElMessage.success(`密码已重置为：${pwd}，请通知用户及时修改`)
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除用户「${row.name}」？`, '提示', { type: 'warning' })
    await orgStore.removeUser(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

const formRef = ref()
const dialog = reactive({ visible: false, isEdit: false, form: emptyForm() })

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/, message: '字母开头，3-20 位字母数字下划线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  companyId: [{ required: true, message: '请选择所属公司', trigger: 'change' }],
  roleIds: [{ required: true, message: '请至少选择一个角色', trigger: 'change' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }]
}

function emptyForm() {
  return {
    id: '', username: '', name: '', companyId: '', deptId: '', position: '',
    roleIds: [], phone: '', email: '', password: '', status: '启用'
  }
}

const deptOptions = computed(() => orgStore.departments.filter(d => d.companyId === dialog.form.companyId))

// 切换公司时清空已选部门，避免跨公司归属
watch(() => dialog.form.companyId, () => { dialog.form.deptId = '' })

function openDialog(row) {
  dialog.isEdit = !!row
  Object.assign(dialog.form, row
    ? { ...row, roleIds: [...(row.roleIds || [])], password: '' }
    : emptyForm())
  dialog.visible = true
  nextTick(() => formRef.value?.clearValidate())
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  const payload = { ...dialog.form }
  if (!payload.deptId) payload.deptId = ''
  try {
    if (dialog.isEdit) {
      delete payload.password
      await orgStore.updateUser(dialog.form.id, payload)
      ElMessage.success('用户已更新')
    } else {
      payload.password = payload.password || '123456'
      await orgStore.addUser(payload)
      ElMessage.success('用户已新增')
    }
    dialog.visible = false
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

.role-tag {
  margin-right: 4px;
}
</style>
