<template>
  <div class="page-container">
    <div class="page-header" style="display:flex;justify-content:space-between;align-items:center">
      <h2>操作日志</h2>
      <span style="color:var(--t-sub);font-size:13px">共 {{ logs.length }} 条</span>
    </div>
    <el-table v-if="!appStore.isPhone" :data="pagedLogs" border stripe size="small" class="fill">
      <el-table-column prop="time" label="时间" width="180" />
      <el-table-column prop="user" label="操作人" width="140" />
      <el-table-column prop="org" label="组织" width="120" />
      <el-table-column prop="module" label="模块" min-width="140" />
      <el-table-column prop="action" label="操作内容" min-width="160" show-overflow-tooltip />
      <el-table-column prop="detail" label="明细" min-width="200" show-overflow-tooltip />
      <el-table-column prop="result" label="结果" width="80">
        <template #default="{ row }">
          <el-tag :type="row.result === '成功' ? 'success' : 'danger'" size="small">{{ row.result }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="140" />
    </el-table>
    <MobileRecordList v-else :columns="mobileColumns" :rows="pagedLogs" empty-text="暂无操作日志" />
    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="logs.length"
        layout="total, sizes, prev, pager, next"
        background
        small
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuditStore } from '../../store/audit'
import { useAppStore } from '../../store/app'
import MobileRecordList from '../../components/mobile/MobileRecordList.vue'

const auditStore = useAuditStore()
const appStore = useAppStore()

/** 手机卡片列：字段与状态色口径与桌面表格保持一致 */
const mobileColumns = [
  { prop: 'action', label: '操作内容', primary: true },
  { prop: 'time', label: '时间' },
  { prop: 'user', label: '操作人' },
  { prop: 'org', label: '组织' },
  { prop: 'module', label: '模块' },
  { prop: 'detail', label: '明细' },
  { prop: 'result', label: '结果', type: 'tag', tagType: row => (row.result === '成功' ? 'success' : 'danger') },
  { prop: 'ip', label: 'IP' }
]

const page = ref(1)
const pageSize = ref(20)

const logs = computed(() => {
  return auditStore.opLogs.map(r => ({
    time: r.time,
    user: r.operator,
    org: r.operatorOrg,
    module: r.module,
    action: r.action,
    detail: r.detail,
    result: r.result,
    ip: r.ip
  }))
})

const pagedLogs = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return logs.value.slice(start, start + pageSize.value)
})
</script>

<style scoped>
.pager {
  display: flex;
  justify-content: flex-end;
}
</style>
