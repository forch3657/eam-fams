<template>
  <div class="page-container">
    <div class="page-header">
      <h2>系统参数</h2>
    </div>

    <el-card shadow="never" class="fill">
      <div class="toolbar">
        <el-input v-model="filter.name" placeholder="参数名称" clearable size="default" style="width:180px" />
        <el-input v-model="filter.key" placeholder="参数键名" clearable size="default" style="width:180px" />
        <el-select v-model="filter.type" placeholder="参数类型" clearable size="default" style="width:140px">
          <el-option label="系统内置" value="系统内置" />
          <el-option label="自定义" value="自定义" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="doQuery">查询</el-button>
        <el-button :icon="Plus" @click="openEdit(null)">新增</el-button>
      </div>

      <el-table :data="pagedRows" border stripe>
        <el-table-column prop="name" label="参数名称" min-width="160" />
        <el-table-column prop="key" label="参数键名" min-width="180" />
        <el-table-column prop="value" label="参数值" min-width="140" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.type === '系统内置' ? 'primary' : 'success'" size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column prop="updateTime" label="更新时间" width="160" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click="removeRow(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          :page-sizes="[10, 15, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
        />
      </div>
    </el-card>

    <el-dialog v-model="showEdit" :title="editing ? '编辑参数' : '新增参数'" width="520px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="参数名称" required>
          <el-input v-model="form.name" placeholder="请输入参数名称" />
        </el-form-item>
        <el-form-item label="参数键名" required>
          <el-input v-model="form.key" placeholder="如 sys.rent.warn.days" />
        </el-form-item>
        <el-form-item label="参数值" required>
          <el-input v-model="form.value" placeholder="请输入参数值" />
        </el-form-item>
        <el-form-item label="参数类型">
          <el-select v-model="form.type" style="width:100%">
            <el-option label="系统内置" value="系统内置" />
            <el-option label="自定义" value="自定义" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="参数用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">取消</el-button>
        <el-button type="primary" @click="saveRow">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'

const filter = ref({ name: '', key: '', type: '' })
const page = ref(1)
const pageSize = ref(15)
const showEdit = ref(false)
const editing = ref(null)
const form = ref({ name: '', key: '', value: '', type: '自定义', remark: '' })

const now = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const paramCol = useCollection(COLLECTION.systemParams, [
  { id: 1, name: '欠费预警天数', key: 'sys.rent.warn.days', value: '90', type: '系统内置', remark: '超过该天数未缴费触发欠费预警', updateTime: now(2) },
  { id: 2, name: '闲置预警天数', key: 'sys.idle.warn.days', value: '180', type: '系统内置', remark: '资产闲置超过该天数触发闲置预警', updateTime: now(5) },
  { id: 3, name: '合同临期提前天数', key: 'sys.contract.expire.days', value: '30', type: '系统内置', remark: '合同到期前该天数触发临期提醒', updateTime: now(5) },
  { id: 4, name: '单页默认条数', key: 'sys.page.size', value: '10', type: '自定义', remark: '列表页默认分页大小', updateTime: now(12) },
  { id: 5, name: '密码最短长度', key: 'sys.pwd.min.length', value: '8', type: '系统内置', remark: '用户密码最小长度限制', updateTime: now(20) },
  { id: 6, name: '登录失败锁定次数', key: 'sys.login.lock.times', value: '5', type: '系统内置', remark: '连续失败该次数后锁定账号', updateTime: now(20) },
  { id: 7, name: '会话超时时间(分钟)', key: 'sys.session.timeout', value: '30', type: '自定义', remark: '无操作自动退出时长', updateTime: now(33) },
  { id: 8, name: '资产编号前缀', key: 'sys.asset.code.prefix', value: 'ZC', type: '自定义', remark: '新增资产编号默认前缀', updateTime: now(41) },
])
const rows = paramCol.items

const filtered = computed(() => {
  let r = rows.value
  if (filter.value.name) r = r.filter(x => x.name.includes(filter.value.name))
  if (filter.value.key) r = r.filter(x => x.key.includes(filter.value.key))
  if (filter.value.type) r = r.filter(x => x.type === filter.value.type)
  return r
})
const pagedRows = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))

const doQuery = () => { page.value = 1 }
const openEdit = row => {
  editing.value = row
  form.value = row ? { ...row } : { name: '', key: '', value: '', type: '自定义', remark: '' }
  showEdit.value = true
}
const saveRow = () => {
  if (!form.value.name || !form.value.key) { ElMessage.warning('请填写参数名称与键名'); return }
  if (editing.value) {
    Object.assign(editing.value, form.value, { updateTime: now(0) })
    paramCol.update(editing.value)
  } else {
    paramCol.add({ id: Date.now(), ...form.value, updateTime: now(0) })
  }
  showEdit.value = false
  ElMessage.success('保存成功')
}
const removeRow = row => {
  ElMessageBox.confirm(`确认删除参数「${row.name}」？`, '提示', { type: 'warning' })
    .then(() => { paramCol.remove(row); ElMessage.success('已删除') })
    .catch(() => {})
}
</script>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
</style>
