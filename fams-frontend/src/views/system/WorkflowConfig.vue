<template>
  <div class="page-container">
    <div class="page-header">
      <h2>流程配置中心</h2>
      <div>
        <el-button type="primary" @click="openCreate">新建流程</el-button>
      </div>
    </div>

    <el-alert type="info" :closable="false" show-icon class="mb12"
      title="审批链由本页配置驱动：环节审批人引用「组织架构 → 角色」，持有该角色的启用账号即可审批；触发条件决定该环节在单据上是否生效。" />

    <el-card class="filter-bar" shadow="never">
      <div class="grid-3">
        <el-input v-model="keyword" placeholder="流程名称/编号" clearable prefix-icon="Search" />
        <el-select v-model="bizType" placeholder="业务类型" clearable>
          <el-option v-for="b in bizTypes" :key="b.value" :label="b.label" :value="b.value" />
        </el-select>
        <el-select v-model="statusFilter" placeholder="状态" clearable>
          <el-option label="启用" :value="true" />
          <el-option label="停用" :value="false" />
        </el-select>
      </div>
    </el-card>

    <el-row :gutter="16" class="fill main-row">
      <!-- 左：流程列表 -->
      <el-col :span="9">
        <el-card shadow="never" class="list-card">
          <template #header><span>审批流程（{{ filtered.length }}）</span></template>
          <div
            v-for="p in filtered"
            :key="p.id"
            class="flow-item"
            :class="{ active: selected && selected.id === p.id }"
            @click="select(p)"
          >
            <div class="flow-top">
              <span class="flow-name">{{ p.name }}</span>
              <el-switch v-model="p.enabled" size="small" @click.stop @change="onToggle(p)" />
            </div>
            <div class="flow-meta">
              <el-tag size="small" effect="plain">{{ labelOf('BUSINESS_TYPE', p.bizType) }}</el-tag>
              <span class="flow-no">{{ p.code }}</span>
              <span class="flow-steps">{{ (p.steps || []).length }} 个环节</span>
            </div>
          </div>
          <el-empty v-if="!filtered.length" description="暂无流程" />
        </el-card>
      </el-col>

      <!-- 右：环节可视化配置 -->
      <el-col :span="15">
        <el-card shadow="never" class="designer-card">
          <template #header>
            <div class="card-hd">
              <span>{{ selected ? selected.name + ' · 环节设计' : '环节设计' }}</span>
              <div>
                <el-button v-if="selected" size="small" @click="openEditFlow">编辑流程</el-button>
                <el-button v-if="selected" type="primary" size="small" @click="addStep">添加环节</el-button>
              </div>
            </div>
          </template>

          <div v-if="selected" class="designer">
            <!-- 发起人 -->
            <div class="node start">
              <div class="node-box start-box">发起人<div class="node-sub">{{ roleName(selected.initiatorRoleId) || selected.initiator || '未指定' }}</div></div>
            </div>
            <div class="arrow">↓</div>

            <template v-for="(s, i) in selected.steps" :key="s.key">
              <div class="node" :class="{ editing: editingKey === s.key }">
                <div class="node-box" @click="editStep(s)">
                  <div class="node-idx">{{ i + 1 }}</div>
                  <div class="node-body">
                    <div class="node-title">{{ s.name }}</div>
                    <div class="node-sub">审批角色：{{ roleName(s.approverRoleId) || s.approver || '未指定' }}</div>
                    <div class="node-sub">方式：{{ labelOf('APPROVE_MODE', s.mode) || s.mode }}</div>
                    <div v-if="condText(s)" class="node-cond">条件：{{ condText(s) }}</div>
                    <div v-if="usersOf(s.approverRoleId).length" class="node-sub">
                      审批账号：{{ usersOf(s.approverRoleId).map(u => u.username + '(' + u.name + ')').join('、') }}
                    </div>
                    <div v-else class="node-cond">该角色暂无启用账号</div>
                  </div>
                  <div class="node-ops">
                    <el-button link type="primary" size="small" @click.stop="moveStep(i, -1)" :disabled="i === 0">↑</el-button>
                    <el-button link type="primary" size="small" @click.stop="moveStep(i, 1)" :disabled="i === selected.steps.length - 1">↓</el-button>
                    <el-button link type="danger" size="small" @click.stop="removeStep(i)">删</el-button>
                  </div>
                </div>
              </div>
              <div class="arrow">↓</div>
            </template>

            <div class="node end">
              <div class="node-box end-box">结束<div class="node-sub">流程归档 / 回写业务</div></div>
            </div>
          </div>
          <el-empty v-else description="请在左侧选择一个流程" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 流程基本信息弹窗 -->
    <el-dialog v-model="showCreate" :title="editingFlowId ? '编辑流程信息' : '新建流程'" width="520px">
      <el-form :model="flowForm" label-width="100px">
        <el-form-item label="流程名称" required><el-input v-model="flowForm.name" placeholder="如：资产处置流程" /></el-form-item>
        <el-form-item label="业务类型" required>
          <el-select v-model="flowForm.bizType" style="width:100%">
            <el-option v-for="b in bizTypes" :key="b.value" :label="b.label" :value="b.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="发起角色">
          <el-select v-model="flowForm.initiatorRoleId" placeholder="如：资产管理员 / 资产使用人" clearable filterable style="width:100%">
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="流程编号">
          <el-input v-model="flowForm.code" placeholder="如：FLOW_DISPOSE" :disabled="!!editingFlowId" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="saveFlow">保存</el-button>
      </template>
    </el-dialog>

    <!-- 环节编辑弹窗 -->
    <el-dialog v-model="showStep" title="编辑审批环节" width="560px">
      <el-form :model="stepForm" label-width="100px">
        <el-form-item label="环节名称" required><el-input v-model="stepForm.name" placeholder="如：部门审批" /></el-form-item>
        <el-form-item label="审批角色" required>
          <el-select v-model="stepForm.approverRoleId" placeholder="选择承担该环节的系统角色" filterable style="width:100%">
            <el-option v-for="r in roleOptions" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
          <div v-if="stepForm.approverRoleId" class="tip">
            可审批账号：{{ usersOf(stepForm.approverRoleId).map(u => u.username + '(' + u.name + ')').join('、') || '该角色暂无启用账号' }}
          </div>
        </el-form-item>
        <el-form-item label="审批方式">
          <el-radio-group v-model="stepForm.mode">
            <el-radio v-for="m in modeOptions" :key="m.value" :value="m.value">{{ m.label }}</el-radio>
          </el-radio-group>
          <div class="tip">{{ modeTip }}</div>
        </el-form-item>
        <el-form-item label="触发条件">
          <el-select v-model="stepForm.conditionType" style="width:100%">
            <el-option v-for="c in conditionOptions" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="stepForm.conditionType === 'AMOUNT_GT'" label="金额门槛">
          <el-input-number v-model="stepForm.conditionValue" :min="0" :step="10000" style="width:100%" />
          <div class="tip">单据金额（关联资产原值）大于该金额时，该环节才生效</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showStep = false">取消</el-button>
        <el-button type="primary" @click="saveStep">保存环节</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
/**
 * 流程配置中心
 *
 * 这里是审批链的唯一事实源：单据提交/审批时完全按本页配置执行。
 * - 发起角色 / 环节审批角色均引用「组织架构 → 角色」，审批权由角色派生；
 * - 审批方式存编码（ANY 或签 / SEQUENCE 依次 / ALL 会签）；
 * - 触发条件存编码（NONE 无条件 / AMOUNT_GT 单据金额大于 / HAS_DIFF 存在盘点差异）。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useOrgStore } from '../../store/org'
import { useApprovalStore } from '../../store/approval'
import { labelOf, optionsOf } from '../../constants/enums'
import { CONDITION_TEXT } from '../../services/approval'

const orgStore = useOrgStore()
const approvalStore = useApprovalStore()

const bizTypes = optionsOf('BUSINESS_TYPE')
const modeOptions = optionsOf('APPROVE_MODE')
const conditionOptions = optionsOf('APPROVE_CONDITION')
const roleOptions = computed(() => orgStore.roles.filter(r => r.status === 'ENABLED').map(r => ({ id: r.id, name: r.name })))

const keyword = ref('')
const bizType = ref('')
const statusFilter = ref('')

const flows = computed(() => approvalStore.flows)
const filtered = computed(() => flows.value.filter(p => {
  if (keyword.value && !(p.name.includes(keyword.value) || p.code.includes(keyword.value))) return false
  if (bizType.value && p.bizType !== bizType.value) return false
  if (statusFilter.value !== '' && statusFilter.value !== null && p.enabled !== statusFilter.value) return false
  return true
}))

const selected = ref(null)
function select(p) { selected.value = p }

function roleName(roleId) {
  if (!roleId) return ''
  const r = orgStore.roles.find(x => x.id === roleId)
  return r ? r.name : ''
}
function usersOf(roleId) {
  if (!roleId) return []
  return orgStore.users.filter(u => (u.roleIds || []).includes(roleId) && u.status === 'ENABLED')
}
function condText(step) {
  const type = step.conditionType || 'NONE'
  if (type === 'NONE') return ''
  const base = CONDITION_TEXT[type] || labelOf('APPROVE_CONDITION', type)
  return type === 'AMOUNT_GT' ? `${base} ${Number(step.conditionValue || 0)} 元` : base
}

// ===== 环节操作 =====
const showStep = ref(false)
const editingKey = ref(null)
const stepForm = ref({ name: '', approverRoleId: '', mode: 'ANY', conditionType: 'NONE', conditionValue: 0 })

const modeTip = computed(() => ({
  ANY: '或签：该环节任一审批账号通过即可进入下一环节',
  SEQUENCE: '依次：按环节顺序依次审批',
  ALL: '会签：该环节所有审批账号都通过才进入下一环节'
}[stepForm.value.mode] || ''))

function onToggle(p) {
  approvalStore.saveFlow(p)
  ElMessage.success(`流程「${p.name}」已${p.enabled ? '启用' : '停用'}`)
}

// ===== 新建/编辑流程 =====
const showCreate = ref(false)
const editingFlowId = ref(null)
const flowForm = ref({ name: '', bizType: 'DISPOSE', initiatorRoleId: '', code: '' })

function openCreate() {
  editingFlowId.value = null
  flowForm.value = { name: '', bizType: 'DISPOSE', initiatorRoleId: '', code: nextFlowCode() }
  showCreate.value = true
}
function openEditFlow() {
  editingFlowId.value = selected.value.id
  flowForm.value = {
    name: selected.value.name,
    bizType: selected.value.bizType,
    initiatorRoleId: selected.value.initiatorRoleId || '',
    code: selected.value.code
  }
  showCreate.value = true
}
function nextFlowCode() {
  const n = flows.value.filter(f => f.code?.startsWith('FLOW_')).length + 1
  return `FLOW_${String(n).padStart(3, '0')}`
}

async function saveFlow() {
  if (!flowForm.value.name) { ElMessage.warning('请填写流程名称'); return }
  if (!flowForm.value.bizType) { ElMessage.warning('请选择业务类型'); return }
  const roleNameText = roleName(flowForm.value.initiatorRoleId)
  try {
    if (editingFlowId.value) {
      const target = flows.value.find(f => f.id === editingFlowId.value)
      if (target) {
        Object.assign(target, {
          name: flowForm.value.name,
          bizType: flowForm.value.bizType,
          initiatorRoleId: flowForm.value.initiatorRoleId,
          initiator: roleNameText
        })
        await approvalStore.saveFlow(target)
        selected.value = target
      }
      ElMessage.success('流程已更新')
    } else {
      const nf = {
        code: flowForm.value.code || nextFlowCode(),
        name: flowForm.value.name,
        bizType: flowForm.value.bizType,
        initiatorRoleId: flowForm.value.initiatorRoleId,
        initiator: roleNameText,
        enabled: true,
        steps: []
      }
      const created = await approvalStore.addFlow(nf)
      selected.value = created
      ElMessage.success('流程已创建，请在右侧添加审批环节')
    }
    showCreate.value = false
  } catch (e) {
    ElMessage.error(e?.message || '保存失败')
  }
}

let stepSeq = 100
function addStep() {
  editingKey.value = null
  stepForm.value = { name: '', approverRoleId: '', mode: 'ANY', conditionType: 'NONE', conditionValue: 0 }
  showStep.value = true
}
function editStep(s) {
  editingKey.value = s.key
  stepForm.value = {
    name: s.name,
    approverRoleId: s.approverRoleId || '',
    mode: s.mode || 'ANY',
    conditionType: s.conditionType || 'NONE',
    conditionValue: Number(s.conditionValue || 0)
  }
  showStep.value = true
}
async function saveStep() {
  if (!stepForm.value.name) { ElMessage.warning('请填写环节名称'); return }
  if (!stepForm.value.approverRoleId) { ElMessage.warning('请选择审批角色'); return }
  const payload = {
    ...stepForm.value,
    approver: roleName(stepForm.value.approverRoleId),
    condition: condText(stepForm.value)
  }
  if (editingKey.value) {
    const s = selected.value.steps.find(x => x.key === editingKey.value)
    Object.assign(s, payload)
  } else {
    selected.value.steps.push({ key: ++stepSeq, ...payload })
  }
  await approvalStore.saveFlow(selected.value)
  showStep.value = false
  editingKey.value = null
  ElMessage.success('环节已保存')
}
function removeStep(i) {
  ElMessageBox.confirm('确认删除该审批环节？', '提示', { type: 'warning' }).then(async () => {
    selected.value.steps.splice(i, 1)
    await approvalStore.saveFlow(selected.value)
    ElMessage.success('已删除')
  }).catch(() => {})
}
function moveStep(i, dir) {
  const arr = selected.value.steps
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  approvalStore.saveFlow(selected.value)
}

onMounted(async () => {
  await approvalStore.load()
  if (!orgStore.loaded) await orgStore.loadAll()
  if (flows.value.length) selected.value = flows.value[0]
})
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 20px; }
.filter-bar :deep(.el-select) { width: 100%; }
.main-row { align-items: stretch; }
.list-card, .designer-card { height: 100%; }
.mb12 { margin-bottom: 12px; }
.card-hd { display: flex; justify-content: space-between; align-items: center; }
.flow-item { padding: 10px 12px; border: 1px solid var(--bd); border-radius: var(--r-md); margin-bottom: 12px; cursor: pointer; transition: all .15s; }
.flow-item:hover { border-color: var(--c-primary); }
.flow-item.active { border-color: var(--c-primary); background: var(--c-primary-light); }
.flow-top { display: flex; justify-content: space-between; align-items: center; }
.flow-name { font-weight: 600; font-size: 14px; }
.flow-meta { display: flex; align-items: center; gap: 10px; margin-top: 6px; font-size: 12px; color: var(--t-weak); }
.flow-no { font-family: monospace; }
.designer { padding: 8px 0; }
.node { display: flex; justify-content: center; }
.node-box { display: flex; align-items: center; gap: 10px; border: 1px solid var(--bd); border-radius: var(--r-md); padding: 10px 14px; min-width: 320px; width: 100%; max-width: 520px; background: var(--bg-card); cursor: pointer; transition: box-shadow .15s; }
.node-box:hover { box-shadow: 0 2px 10px rgba(0,0,0,.08); }
.node.editing .node-box { border-color: var(--c-primary); }
.start-box, .end-box { justify-content: center; flex-direction: column; text-align: center; background: #f0f9eb; border-color: #b3e19d; font-weight: 600; cursor: default; }
.end-box { background: #fef0f0; border-color: #fab6b6; }
.node-idx { width: 24px; height: 24px; border-radius: 50%; background: var(--c-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; }
.node-body { flex: 1; }
.node-title { font-weight: 600; font-size: 14px; }
.node-sub { font-size: 12px; color: var(--t-weak); margin-top: 2px; }
.node-cond { font-size: 12px; color: var(--c-warning); margin-top: 2px; }
.node-ops { display: flex; flex-direction: column; gap: 2px; }
.arrow { text-align: center; color: var(--t-weak); font-size: 16px; line-height: 20px; }
.tip { font-size: 12px; color: var(--t-weak); margin-top: 4px; line-height: 1.5; }
</style>
