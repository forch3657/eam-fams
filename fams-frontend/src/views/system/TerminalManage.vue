<template>
  <div class="page-container">
    <div class="page-header">
      <h2>盘点终端</h2>
      <span class="sub">资产盘点终端设备登记 · 在线状态 · 终端异常登记</span>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="fill">
      <el-tab-pane label="盘点终端" name="devices">
        <div class="toolbar">
          <el-input v-model="devKeyword" placeholder="终端编号/名称/存放位置" clearable style="width:220px" prefix-icon="Search" />
          <el-select v-model="devStatus" placeholder="状态" clearable style="width:140px">
            <el-option v-for="o in deviceStatusOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-select v-model="devType" placeholder="类型" clearable style="width:160px">
            <el-option v-for="o in deviceTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="devPage = 1">查询</el-button>
          <el-button type="primary" @click="openDevice()">新增终端</el-button>
        </div>
        <el-table :data="pagedDevices" border stripe>
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="detail-grid" style="margin:12px 48px">
                <div class="cell" v-for="c in deviceCells(row)" :key="c.label">
                  <div class="label">{{ c.label }}</div>
                  <div class="value" :class="{ hl: c.hl }">{{ c.value || '—' }}</div>
                </div>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="code" label="终端编号" width="130" />
          <el-table-column prop="name" label="终端名称" min-width="150" />
          <el-table-column label="类型" width="140">
            <template #default="{ row }"><el-tag size="small" effect="plain">{{ labelOf('DEVICE_TYPE', row.type) }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="location" label="存放位置" min-width="160" show-overflow-tooltip />
          <el-table-column label="绑定盘点责任人" min-width="140">
            <template #default="{ row }">{{ userName(row.bindUserId) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="deviceStatusType(row.status)" size="small">{{ labelOf('DEVICE_STATUS', row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最后活跃" width="170">
            <template #default="{ row }">{{ formatDateTime(row.lastActive) || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="230" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
              <el-button type="primary" link size="small" @click="openDevice(row)">编辑</el-button>
              <el-button v-if="row.status !== 'DISABLED'" type="warning" link size="small" @click="toggleDevice(row)">停用</el-button>
              <el-button v-else type="success" link size="small" @click="toggleDevice(row)">启用</el-button>
              <el-button type="danger" link size="small" @click="delDevice(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无数据" :image-size="70" />
          </template>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="devPage"
            v-model:page-size="devPageSize"
            :total="filteredDevices.length"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane label="终端异常登记" name="abnormal">
        <div class="toolbar">
          <el-input v-model="misKeyword" placeholder="记录编号/终端编号/描述" clearable style="width:240px" prefix-icon="Search" />
          <el-select v-model="misType" placeholder="异常类型" clearable style="width:170px">
            <el-option v-for="o in abnormalTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <el-select v-model="misHandled" placeholder="处理状态" clearable style="width:130px">
            <el-option label="待处理" :value="false" />
            <el-option label="已处理" :value="true" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="misPage = 1">查询</el-button>
          <el-button type="primary" @click="openAbnormal()">登记异常</el-button>
        </div>
        <el-table :data="pagedAbnormal" border stripe>
          <el-table-column prop="recordNo" label="记录编号" width="140" />
          <el-table-column label="涉及终端" min-width="170">
            <template #default="{ row }">{{ deviceName(row.deviceCode) }}</template>
          </el-table-column>
          <el-table-column label="操作人" min-width="120">
            <template #default="{ row }">{{ userName(row.operatorId) }}</template>
          </el-table-column>
          <el-table-column label="异常类型" width="150">
            <template #default="{ row }"><el-tag size="small" type="danger" effect="plain">{{ labelOf('DEVICE_ABNORMAL_TYPE', row.type) }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="detail" label="情况描述" min-width="220" show-overflow-tooltip />
          <el-table-column prop="affectedCount" label="影响资产数" width="110" align="right" />
          <el-table-column label="处理状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.handled ? 'success' : 'warning'" size="small">{{ row.handled ? '已处理' : '待处理' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="登记时间" width="170">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="!row.handled" type="primary" link size="small" @click="handleAbnormal(row)">处理</el-button>
              <span v-else class="muted">已处理</span>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无数据" :image-size="70" />
          </template>
        </el-table>
        <div class="pager">
          <el-pagination
            v-model:current-page="misPage"
            v-model:page-size="misPageSize"
            :total="filteredAbnormal.length"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showDevice" :title="editingDevice ? '编辑盘点终端' : '新增盘点终端'" width="520px">
      <el-form :model="deviceForm" label-width="110px">
        <el-form-item label="终端名称" required><el-input v-model="deviceForm.name" placeholder="如：盘点手持终端 01" /></el-form-item>
        <el-form-item label="终端类型">
          <el-select v-model="deviceForm.type" style="width:100%">
            <el-option v-for="o in deviceTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="存放位置"><el-input v-model="deviceForm.location" placeholder="如：仓库A区" /></el-form-item>
        <el-form-item label="盘点责任人">
          <el-select v-model="deviceForm.bindUserId" placeholder="请选择盘点责任人" clearable filterable style="width:100%">
            <el-option v-for="u in orgStore.users" :key="u.id" :label="`${u.name}（${u.position || '—'}）`" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="deviceForm.status" style="width:100%">
            <el-option v-for="o in deviceStatusOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="生产厂商"><el-input v-model="deviceForm.vendor" placeholder="如：东集" /></el-form-item>
        <el-form-item label="设备型号"><el-input v-model="deviceForm.model" placeholder="如：PDA-20" /></el-form-item>
        <el-form-item label="出厂序列号"><el-input v-model="deviceForm.sn" /></el-form-item>
        <el-form-item label="IP地址"><el-input v-model="deviceForm.ip" placeholder="如：192.168.10.31" /></el-form-item>
        <el-form-item label="安装日期"><el-date-picker v-model="deviceForm.installDate" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="维护人"><el-input v-model="deviceForm.maintainer" /></el-form-item>
        <el-form-item label="维护电话"><el-input v-model="deviceForm.maintainerPhone" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="deviceForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDevice = false">取消</el-button>
        <el-button type="primary" @click="saveDevice">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showDeviceDetail" title="盘点终端详情" width="760px">
      <div class="detail-grid" v-if="detailDevice">
        <div class="cell" v-for="c in deviceCells(detailDevice)" :key="c.label">
          <div class="label">{{ c.label }}</div>
          <div class="value" :class="{ hl: c.hl }">{{ c.value || '—' }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="showDeviceDetail = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="showAbnormal" title="登记终端异常" width="520px">
      <el-form :model="abnormalForm" label-width="110px">
        <el-form-item label="涉及终端" required>
          <el-select v-model="abnormalForm.deviceCode" style="width:100%" filterable>
            <el-option v-for="d in devices" :key="d.code" :label="`${d.code} ${d.name}`" :value="d.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作人">
          <el-select v-model="abnormalForm.operatorId" placeholder="请选择操作人" clearable filterable style="width:100%">
            <el-option v-for="u in orgStore.users" :key="u.id" :label="u.name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="异常类型">
          <el-select v-model="abnormalForm.type" style="width:100%">
            <el-option v-for="o in abnormalTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="影响资产数"><el-input-number v-model="abnormalForm.affectedCount" :min="0" style="width:100%" /></el-form-item>
        <el-form-item label="情况描述"><el-input v-model="abnormalForm.detail" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAbnormal = false">取消</el-button>
        <el-button type="primary" @click="saveAbnormal">提交登记</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'
import { useOrgStore } from '../../store/org'
import { labelOf, optionsOf } from '../../constants/enums'
import { formatDateTime } from '../../utils/format'

const activeTab = ref('devices')
const orgStore = useOrgStore()

const deviceTypeOptions = computed(() => optionsOf('DEVICE_TYPE'))
const deviceStatusOptions = computed(() => optionsOf('DEVICE_STATUS'))
const abnormalTypeOptions = computed(() => optionsOf('DEVICE_ABNORMAL_TYPE'))

/** 终端状态标签色 */
function deviceStatusType(status) {
  return { ONLINE: 'success', OFFLINE: 'info', MAINTENANCE: 'warning', DISABLED: 'danger' }[status] || 'info'
}

function userName(id) {
  if (!id) return ''
  const u = orgStore.users.find(x => x.id === id)
  return u ? u.name : id
}

function deviceName(code) {
  if (!code) return ''
  const d = devices.value.find(x => x.code === code)
  return d ? `${d.code} ${d.name}` : code
}

// ---------------------------------------------------------------- 盘点终端
const devKeyword = ref('')
const devStatus = ref('')
const devType = ref('')
const deviceCol = useCollection(COLLECTION.systemDevices)
const devices = deviceCol.items
const filteredDevices = computed(() => devices.value.filter(d => {
  const kw = devKeyword.value.trim()
  if (kw && !(`${d.code} ${d.name} ${d.location || ''}`.includes(kw))) return false
  if (devStatus.value && d.status !== devStatus.value) return false
  if (devType.value && d.type !== devType.value) return false
  return true
}))

const devPage = ref(1)
const devPageSize = ref(15)
const pagedDevices = computed(() => {
  const list = filteredDevices.value
  const start = Math.min((devPage.value - 1) * devPageSize.value, Math.max(0, list.length - devPageSize.value))
  return list.slice(start, start + devPageSize.value)
})

function deviceCells(row) {
  return [
    { label: '终端编号', value: row.code, hl: true },
    { label: '终端名称', value: row.name },
    { label: '终端类型', value: labelOf('DEVICE_TYPE', row.type) },
    { label: '状态', value: labelOf('DEVICE_STATUS', row.status) },
    { label: '存放位置', value: row.location },
    { label: '盘点责任人', value: userName(row.bindUserId) },
    { label: '最后活跃', value: formatDateTime(row.lastActive) },
    { label: '生产厂商', value: row.vendor },
    { label: '设备型号', value: row.model },
    { label: '出厂序列号', value: row.sn },
    { label: 'IP地址', value: row.ip },
    { label: '安装日期', value: row.installDate },
    { label: '维护人', value: row.maintainer },
    { label: '维护电话', value: row.maintainerPhone },
    { label: '备注', value: row.remark }
  ]
}

const showDeviceDetail = ref(false)
const detailDevice = ref(null)
function openDetail(row) {
  detailDevice.value = row
  showDeviceDetail.value = true
}

const showDevice = ref(false)
const editingDevice = ref(false)
const emptyDeviceForm = () => ({
  code: '', name: '', type: 'PDA', location: '', bindUserId: '', status: 'ONLINE',
  vendor: '', model: '', sn: '', ip: '', installDate: '', maintainer: '', maintainerPhone: '', remark: ''
})
const deviceForm = ref(emptyDeviceForm())
function openDevice(row) {
  if (row) { editingDevice.value = true; deviceForm.value = { ...emptyDeviceForm(), ...row } }
  else { editingDevice.value = false; deviceForm.value = emptyDeviceForm() }
  showDevice.value = true
}
function saveDevice() {
  if (!deviceForm.value.name) { ElMessage.warning('请填写终端名称'); return }
  if (editingDevice.value) {
    const d = devices.value.find(x => x.code === deviceForm.value.code)
    if (d) {
      Object.assign(d, deviceForm.value)
      deviceCol.update(d)
    }
    ElMessage.success('盘点终端已更新')
  } else {
    deviceForm.value.code = `PD${new Date().getFullYear()}${String(devices.value.length + 1).padStart(3, '0')}`
    deviceForm.value.lastActive = new Date().toISOString()
    deviceCol.add({ ...deviceForm.value })
    ElMessage.success('盘点终端已新增')
  }
  showDevice.value = false
}
function toggleDevice(row) {
  const next = row.status === 'DISABLED' ? 'ONLINE' : 'DISABLED'
  row.status = next
  deviceCol.update(row)
  ElMessage.success(next === 'DISABLED' ? '终端已停用' : '终端已启用')
}
function delDevice(row) {
  ElMessageBox.confirm(`确认删除盘点终端「${row.name}」？`, '提示', { type: 'warning' }).then(() => {
    deviceCol.remove(row)
    ElMessage.success('已删除')
  }).catch(() => {})
}

// ---------------------------------------------------------------- 终端异常
const misKeyword = ref('')
const misType = ref('')
const misHandled = ref('')
const abnormalCol = useCollection(COLLECTION.systemTerminalAbnormal)
const abnormalList = abnormalCol.items
const filteredAbnormal = computed(() => abnormalList.value.filter(m => {
  const kw = misKeyword.value.trim()
  if (kw && !(`${m.recordNo} ${m.deviceCode || ''} ${m.detail || ''}`.includes(kw))) return false
  if (misType.value && m.type !== misType.value) return false
  if (misHandled.value !== '' && m.handled !== misHandled.value) return false
  return true
}))

const misPage = ref(1)
const misPageSize = ref(15)
const pagedAbnormal = computed(() => {
  const list = filteredAbnormal.value
  const start = Math.min((misPage.value - 1) * misPageSize.value, Math.max(0, list.length - misPageSize.value))
  return list.slice(start, start + misPageSize.value)
})

const showAbnormal = ref(false)
const abnormalForm = ref({ deviceCode: '', operatorId: '', type: 'OFFLINE_UPLOAD', affectedCount: 0, detail: '' })
function openAbnormal() {
  abnormalForm.value = { deviceCode: '', operatorId: '', type: 'OFFLINE_UPLOAD', affectedCount: 0, detail: '' }
  showAbnormal.value = true
}
function saveAbnormal() {
  if (!abnormalForm.value.deviceCode) { ElMessage.warning('请选择涉及终端'); return }
  abnormalCol.add({
    recordNo: `AB${new Date().getFullYear()}${String(abnormalList.value.length + 1).padStart(4, '0')}`,
    ...abnormalForm.value,
    handled: false,
    createTime: new Date().toISOString()
  })
  showAbnormal.value = false
  ElMessage.success('异常登记已提交')
}
function handleAbnormal(row) {
  ElMessageBox.prompt('请输入处理结果', '处理异常', { inputPlaceholder: '如：已补传离线数据并提醒责任人' }).then(({ value }) => {
    row.handled = true
    row.handleResult = value
    abnormalCol.update(row)
    ElMessage.success('已标记为处理完成')
  }).catch(() => {})
}
</script>

<style scoped>
.page-header { display: flex; align-items: baseline; gap: 12px; }
.page-header h2 { margin: 0; font-size: 20px; }
.page-header .sub { color: var(--t-weak); font-size: 13px; }
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.muted { color: var(--t-weak); }
</style>
