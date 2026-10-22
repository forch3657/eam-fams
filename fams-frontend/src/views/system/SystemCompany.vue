<template>
  <div class="page-container">
    <div class="page-header">
      <h2>公司管理</h2>
      <div>
        <el-button type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>
          新增公司
        </el-button>
      </div>
    </div>

    <div class="org-split">
      <el-card shadow="never" class="tree-card">
        <template #header>
          <div class="card-head">
            <span>公司架构</span>
            <el-button link type="primary" size="small" @click="selectedCompanyId = null">全部</el-button>
          </div>
        </template>
        <el-tree
          :data="orgStore.companyTree"
          :props="{ label: 'name', children: 'children' }"
          node-key="id"
          default-expand-all
          highlight-current
          :expand-on-click-node="false"
          @node-click="handleNodeClick"
        />
      </el-card>

      <el-card shadow="never" class="fill">
        <el-form :inline="true" class="search-form">
          <el-form-item label="公司名称">
            <el-input v-model="query.name" placeholder="名称/简称/编码" clearable style="width: 200px" />
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
          <el-table-column prop="code" label="公司编码" width="110" />
          <el-table-column prop="name" label="公司名称" min-width="200" show-overflow-tooltip />
          <el-table-column prop="shortName" label="简称" width="110" />
          <el-table-column label="上级公司" width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.parentId">{{ orgStore.companyName(row.parentId) }}</span>
              <span v-else class="muted">—（集团本级）</span>
            </template>
          </el-table-column>
          <el-table-column prop="type" label="公司类型" width="130" />
          <el-table-column prop="creditCode" label="统一社会信用代码" width="200" show-overflow-tooltip />
          <el-table-column prop="legalPerson" label="法人代表" width="100" />
          <el-table-column prop="contact" label="联系人" width="100" />
          <el-table-column prop="phone" label="联系电话" width="130" />
          <el-table-column prop="sort" label="排序" width="70" align="center" />
          <el-table-column prop="status" label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === '启用' ? 'success' : 'info'" size="small" effect="light">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openDialog(row)">编辑</el-button>
              <el-button link :type="row.status === '启用' ? 'warning' : 'success'" size="small" @click="toggleStatus(row)">
                {{ row.status === '启用' ? '停用' : '启用' }}
              </el-button>
              <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无公司数据" :image-size="60" />
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

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑公司' : '新增公司'" width="640px" destroy-on-close>
      <el-form ref="formRef" :model="dialog.form" :rules="rules" label-width="120px">
        <el-form-item label="公司编码">
          <el-input v-model="dialog.form.code" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="公司名称" prop="name">
          <el-input v-model="dialog.form.name" placeholder="请输入公司全称" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="公司简称">
          <el-input v-model="dialog.form.shortName" placeholder="请输入公司简称" maxlength="20" />
        </el-form-item>
        <el-form-item label="上级公司">
          <el-tree-select
            v-model="dialog.form.parentId"
            :data="parentOptions"
            :props="{ label: 'name', children: 'children' }"
            node-key="id"
            check-strictly
            clearable
            placeholder="无（集团本级）"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="公司类型">
          <el-select v-model="dialog.form.type" placeholder="请选择公司类型" style="width: 100%">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="信用代码">
          <el-input v-model="dialog.form.creditCode" placeholder="统一社会信用代码" maxlength="18" />
        </el-form-item>
        <el-form-item label="法人代表">
          <el-input v-model="dialog.form.legalPerson" style="width: 200px" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="dialog.form.contact" style="width: 200px" />
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="dialog.form.phone" style="width: 200px" />
        </el-form-item>
        <el-form-item label="公司地址">
          <el-input v-model="dialog.form.address" placeholder="请输入公司地址" />
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
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import { useOrgStore } from '../../store/org'

const orgStore = useOrgStore()

const query = reactive({ name: '', status: '' })
const selectedCompanyId = ref(null)
const page = ref(1)
const pageSize = ref(15)

const typeOptions = ['有限责任公司', '股份有限公司', '国有独资公司', '合伙企业', '个体工商户']

const filteredList = computed(() => {
  const kw = query.name.trim()
  return orgStore.companies.filter(c => {
    if (selectedCompanyId.value && c.id !== selectedCompanyId.value) return false
    if (query.status && c.status !== query.status) return false
    if (kw && !`${c.name}${c.shortName || ''}${c.code}`.includes(kw)) return false
    return true
  })
})

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

function handleSearch() { page.value = 1 }

function handleReset() {
  query.name = ''
  query.status = ''
  selectedCompanyId.value = null
  page.value = 1
}

function handleNodeClick(data) {
  selectedCompanyId.value = data.id
  page.value = 1
}

async function toggleStatus(row) {
  const next = row.status === '启用' ? '停用' : '启用'
  try {
    await orgStore.updateCompany(row.id, { status: next })
    ElMessage.success(`已${next}公司「${row.name}」`)
  } catch (e) {
    ElMessage.error(e.message || '操作失败')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除公司「${row.name}」？`, '提示', { type: 'warning' })
    await orgStore.removeCompany(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

const formRef = ref()
const dialog = reactive({
  visible: false,
  isEdit: false,
  form: emptyForm()
})

const rules = {
  name: [{ required: true, message: '请输入公司名称', trigger: 'blur' }],
  phone: [{ pattern: /^(\d{3,4}-)?\d{7,8}(-\d{1,5})?$|^1[3-9]\d{9}$/, message: '联系电话格式不正确', trigger: 'blur' }]
}

function emptyForm() {
  return {
    id: '', code: '', name: '', shortName: '', parentId: null, type: '有限责任公司',
    creditCode: '', legalPerson: '', contact: '', phone: '', address: '', sort: 0, status: '启用'
  }
}

const parentOptions = computed(() => {
  const editingId = dialog.isEdit ? dialog.form.id : null
  const filter = nodes => nodes
    .filter(n => n.id !== editingId)
    .map(n => ({ ...n, children: n.children ? filter(n.children) : undefined }))
  return filter(orgStore.companyTree)
})

function openDialog(row) {
  dialog.isEdit = !!row
  Object.assign(dialog.form, row ? { ...row } : emptyForm())
  dialog.visible = true
  nextTick(() => formRef.value?.clearValidate())
}

async function submit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (dialog.isEdit) {
      await orgStore.updateCompany(dialog.form.id, dialog.form)
      ElMessage.success('公司信息已更新')
    } else {
      await orgStore.addCompany(dialog.form)
      ElMessage.success('公司已新增')
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

.org-split {
  display: grid;
  gap: 16px;
  grid-template-columns: 280px minmax(0, 1fr);
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

.muted {
  color: var(--t-weak);
}
</style>
