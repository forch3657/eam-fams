<template>
  <div class="page-container">
    <div class="page-header">
      <h2>终端管理</h2>
      <span class="sub">收费终端设备登记 · 在线状态 · 用户误用/违规登记</span>
    </div>

    <el-tabs v-model="activeTab" type="border-card" class="fill">
      <el-tab-pane label="终端设备" name="devices">
        <div class="toolbar">
          <el-input v-model="devKeyword" placeholder="终端编号/名称/点位" clearable style="width:220px" prefix-icon="Search" />
          <el-select v-model="devStatus" placeholder="状态" clearable style="width:130px">
            <el-option label="在线" value="在线" />
            <el-option label="离线" value="离线" />
            <el-option label="停用" value="停用" />
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
          <el-table-column prop="code" label="终端编号" width="140" />
          <el-table-column prop="name" label="终端名称" min-width="150" />
          <el-table-column prop="type" label="类型" width="120">
            <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="location" label="安装点位" min-width="180" show-overflow-tooltip />
          <el-table-column prop="bindAccount" label="绑定收款账户" min-width="170" show-overflow-tooltip />
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="row.status === '在线' ? 'success' : row.status === '离线' ? 'info' : 'danger'" size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="lastActive" label="最后活跃" width="170" />
          <el-table-column label="操作" width="230" align="center" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link size="small" @click="openDetail(row)">详情</el-button>
              <el-button type="primary" link size="small" @click="openDevice(row)">编辑</el-button>
              <el-button v-if="row.status !== '停用'" type="warning" link size="small" @click="row.status = '停用'; msg('终端已停用')">停用</el-button>
              <el-button v-else type="success" link size="small" @click="row.status = '在线'; msg('终端已启用')">启用</el-button>
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

      <el-tab-pane label="误用违规登记" name="misuse">
        <div class="toolbar">
          <el-input v-model="misKeyword" placeholder="当事人/终端编号" clearable style="width:220px" prefix-icon="Search" />
          <el-select v-model="misType" placeholder="违规类型" clearable style="width:150px">
            <el-option v-for="t in misuseTypes" :key="t" :label="t" :value="t" />
          </el-select>
          <el-button type="primary" :icon="Search" @click="misPage = 1">查询</el-button>
          <el-button type="primary" @click="openMisuse()">登记违规</el-button>
        </div>
        <el-table :data="pagedMisuse" border stripe>
          <el-table-column prop="recordNo" label="记录编号" width="140" />
          <el-table-column prop="person" label="当事人" min-width="130" />
          <el-table-column prop="terminalCode" label="涉及终端" width="140" />
          <el-table-column prop="type" label="违规类型" width="140">
            <template #default="{ row }"><el-tag size="small" type="danger" effect="plain">{{ row.type }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="detail" label="情况描述" min-width="220" show-overflow-tooltip />
          <el-table-column prop="amount" label="涉及金额(元)" width="130" align="right" />
          <el-table-column label="处理状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="row.handled ? 'success' : 'warning'" size="small">{{ row.handled ? '已处理' : '待处理' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createTime" label="登记时间" width="170" />
          <el-table-column label="操作" width="120" align="center" fixed="right">
            <template #default="{ row }">
              <el-button v-if="!row.handled" type="primary" link size="small" @click="handleMisuse(row)">处理</el-button>
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
            :total="filteredMisuse.length"
            :page-sizes="[10, 20, 50]"
            layout="total, sizes, prev, pager, next, jumper"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="showDevice" :title="editingDevice ? '编辑终端' : '新增终端'" width="520px">
      <el-form :model="deviceForm" label-width="120px">
        <el-form-item label="终端名称" required><el-input v-model="deviceForm.name" placeholder="如：收费大厅1号终端" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="deviceForm.type" style="width:100%">
            <el-option label="收款终端" value="收款终端" />
            <el-option label="扫码盒子" value="扫码盒子" />
            <el-option label="自助缴费机" value="自助缴费机" />
            <el-option label="POS机" value="POS机" />
          </el-select>
        </el-form-item>
        <el-form-item label="安装点位"><el-input v-model="deviceForm.location" placeholder="如：安东大厦一楼大厅" /></el-form-item>
        <el-form-item label="绑定收款账户"><el-input v-model="deviceForm.bindAccount" placeholder="资金直达公司账户，非个人" /></el-form-item>
        <el-form-item label="生产厂商"><el-input v-model="deviceForm.vendor" placeholder="如：新大陆" /></el-form-item>
        <el-form-item label="设备型号"><el-input v-model="deviceForm.model" placeholder="如：NLS-FR88" /></el-form-item>
        <el-form-item label="出厂序列号"><el-input v-model="deviceForm.sn" /></el-form-item>
        <el-form-item label="IP地址"><el-input v-model="deviceForm.ip" placeholder="如：192.168.1.100" /></el-form-item>
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

    <el-dialog v-model="showDeviceDetail" title="终端详情" width="760px">
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

    <el-dialog v-model="showMisuse" title="登记用户误用/违规" width="520px">
      <el-form :model="misuseForm" label-width="110px">
        <el-form-item label="当事人" required><el-input v-model="misuseForm.person" /></el-form-item>
        <el-form-item label="涉及终端">
          <el-select v-model="misuseForm.terminalCode" style="width:100%" filterable>
            <el-option v-for="d in devices" :key="d.code" :label="`${d.code} ${d.name}`" :value="d.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="违规类型">
          <el-select v-model="misuseForm.type" style="width:100%">
            <el-option v-for="t in misuseTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="涉及金额"><el-input-number v-model="misuseForm.amount" :min="0" :precision="2" style="width:100%" /></el-form-item>
        <el-form-item label="情况描述"><el-input v-model="misuseForm.detail" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMisuse = false">取消</el-button>
        <el-button type="primary" @click="saveMisuse">提交登记</el-button>
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

const activeTab = ref('devices')
function msg(t) { ElMessage.success(t) }

const devKeyword = ref('')
const devStatus = ref('')
const deviceCol = useCollection(COLLECTION.systemDevices, [
  { code: 'T-2024-001', name: '收费大厅1号终端', type: '收款终端', location: '安东大厦一楼收费大厅', bindAccount: '城投集团 工行 1402****8834', status: '在线', lastActive: '2026-09-16 09:12:33', vendor: '新大陆', model: 'NLS-FR88', sn: 'NLSCF88202401001', ip: '192.168.10.21', installDate: '2024-01-15', maintainer: '林工', maintainerPhone: '13905911001', remark: '主力收款终端，日交易量最大' },
  { code: 'T-2024-002', name: '大厅扫码盒子', type: '扫码盒子', location: '安东大厦一楼收费大厅', bindAccount: '城投集团 工行 1402****8834', status: '在线', lastActive: '2026-09-16 09:10:01', vendor: '商米', model: 'SUNMI-S2', sn: 'SM2S22024020035', ip: '192.168.10.22', installDate: '2024-02-20', maintainer: '林工', maintainerPhone: '13905911001', remark: '' },
  { code: 'T-2024-003', name: '壹城红寓自助缴费机', type: '自助缴费机', location: '红联壹城物业中心', bindAccount: '城投集团 建行 3505****1120', status: '离线', lastActive: '2026-09-15 18:44:20', vendor: '广电运通', model: 'GRG-A200', sn: 'GRGA22024030107', ip: '192.168.21.30', installDate: '2024-03-10', maintainer: '陈工', maintainerPhone: '13905911002', remark: '网络不稳定，待排查' },
  { code: 'T-2024-004', name: '招商部POS机', type: 'POS机', location: '航城商务楼3F招商部', bindAccount: '产投集团 招行 5919****0067', status: '停用', lastActive: '2026-08-30 16:02:11', vendor: '百富', model: 'PAX-D200', sn: 'PAXD22024040088', ip: '192.168.30.41', installDate: '2024-04-18', maintainer: '黄工', maintainerPhone: '13905911003', remark: '曾因违规收款停用' },
])
const devices = deviceCol.items
const filteredDevices = computed(() => devices.value.filter(d => {
  if (devKeyword.value && !(d.code.includes(devKeyword.value) || d.name.includes(devKeyword.value) || d.location.includes(devKeyword.value))) return false
  if (devStatus.value && d.status !== devStatus.value) return false
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
    { label: '类型', value: row.type },
    { label: '状态', value: row.status },
    { label: '安装点位', value: row.location },
    { label: '绑定收款账户', value: row.bindAccount },
    { label: '最后活跃', value: row.lastActive },
    { label: '生产厂商', value: row.vendor },
    { label: '设备型号', value: row.model },
    { label: '出厂序列号', value: row.sn },
    { label: 'IP地址', value: row.ip },
    { label: '安装日期', value: row.installDate },
    { label: '维护人', value: row.maintainer },
    { label: '维护电话', value: row.maintainerPhone },
    { label: '备注', value: row.remark },
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
const emptyDeviceForm = () => ({ code: '', name: '', type: '收款终端', location: '', bindAccount: '', status: '在线', vendor: '', model: '', sn: '', ip: '', installDate: '', maintainer: '', maintainerPhone: '', remark: '' })
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
    ElMessage.success('终端已更新')
  } else {
    deviceForm.value.code = `T-${new Date().getFullYear()}-${String(devices.value.length + 1).padStart(3, '0')}`
    deviceForm.value.lastActive = new Date().toLocaleString('zh-CN', { hour12: false })
    deviceCol.add({ ...deviceForm.value })
    ElMessage.success('终端已新增')
  }
  showDevice.value = false
}
function delDevice(row) {
  ElMessageBox.confirm(`确认删除终端「${row.name}」？`, '提示', { type: 'warning' }).then(() => {
    deviceCol.remove(row)
    ElMessage.success('已删除')
  }).catch(() => {})
}

const misuseTypes = ['私自收款', '挪用资金', '违规减免', '冒用账户', '设备外借', '其他']
const misKeyword = ref('')
const misType = ref('')
const misuseCol = useCollection(COLLECTION.systemMisuse, [
  { recordNo: 'MIS-2024-001', person: '刘××', terminalCode: 'T-2024-004', type: '私自收款', detail: '使用个人微信收取租户租金未入公司账户', amount: 6500, handled: true, createTime: '2026-08-30 16:20:00' },
  { recordNo: 'MIS-2024-002', person: '陈××', terminalCode: 'T-2024-003', type: '违规减免', detail: '未经审批擅自减免物业费', amount: 1200, handled: false, createTime: '2026-09-10 11:05:41' },
])
const misuse = misuseCol.items
const filteredMisuse = computed(() => misuse.value.filter(m => {
  if (misKeyword.value && !(m.person.includes(misKeyword.value) || m.terminalCode.includes(misKeyword.value))) return false
  if (misType.value && m.type !== misType.value) return false
  return true
}))

const misPage = ref(1)
const misPageSize = ref(15)
const pagedMisuse = computed(() => {
  const list = filteredMisuse.value
  const start = Math.min((misPage.value - 1) * misPageSize.value, Math.max(0, list.length - misPageSize.value))
  return list.slice(start, start + misPageSize.value)
})

const showMisuse = ref(false)
const misuseForm = ref({ person: '', terminalCode: '', type: '私自收款', amount: 0, detail: '' })
function openMisuse() {
  misuseForm.value = { person: '', terminalCode: '', type: '私自收款', amount: 0, detail: '' }
  showMisuse.value = true
}
function saveMisuse() {
  if (!misuseForm.value.person) { ElMessage.warning('请填写当事人'); return }
  misuseCol.add({
    recordNo: `MIS-${new Date().getFullYear()}-${String(misuse.value.length + 1).padStart(3, '0')}`,
    ...misuseForm.value,
    handled: false,
    createTime: new Date().toLocaleString('zh-CN', { hour12: false })
  })
  showMisuse.value = false
  ElMessage.success('违规登记已提交')
}
function handleMisuse(row) {
  ElMessageBox.prompt('请输入处理结果', '处理违规', { inputPlaceholder: '如：已追回资金并警告处分' }).then(({ value }) => {
    row.handled = true
    row.handleResult = value
    misuseCol.update(row)
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
