<template>
  <div class="page-container">
    <div class="page-header">
      <h2>流程配置中心</h2>
      <div>
        <el-button type="primary" @click="openCreate">新建流程</el-button>
      </div>
    </div>

    <el-card class="filter-bar" shadow="never">
      <div class="grid-3">
        <el-input v-model="keyword" placeholder="流程名称/编号" clearable prefix-icon="Search" />
        <el-select v-model="bizType" placeholder="业务类型" clearable>
          <el-option v-for="b in bizTypes" :key="b" :label="b" :value="b" />
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
              <el-tag size="small" effect="plain">{{ p.bizType }}</el-tag>
              <span class="flow-no">{{ p.code }}</span>
              <span class="flow-steps">{{ p.steps.length }} 个环节</span>
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
              <el-button v-if="selected" type="primary" size="small" @click="addStep">添加环节</el-button>
            </div>
          </template>

          <div v-if="selected" class="designer">
            <!-- 发起人 -->
            <div class="node start">
              <div class="node-box start-box">发起人<div class="node-sub">{{ selected.initiator }}</div></div>
            </div>
            <div class="arrow">↓</div>

            <template v-for="(s, i) in selected.steps" :key="s.key">
              <div class="node" :class="{ editing: editingKey === s.key }">
                <div class="node-box" @click="editStep(s)">
                  <div class="node-idx">{{ i + 1 }}</div>
                  <div class="node-body">
                    <div class="node-title">{{ s.name }}</div>
                    <div class="node-sub">审批人：{{ s.approver }}</div>
                    <div class="node-sub">方式：{{ s.mode }}<span v-if="s.amountLimit"> · 限额￥{{ s.amountLimit }}</span></div>
                    <div v-if="s.condition" class="node-cond">条件：{{ s.condition }}</div>
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
        <el-form-item label="流程名称" required><el-input v-model="flowForm.name" placeholder="如：合同审批流程" /></el-form-item>
        <el-form-item label="业务类型" required>
          <el-select v-model="flowForm.bizType" style="width:100%">
            <el-option v-for="b in bizTypes" :key="b" :label="b" :value="b" />
          </el-select>
        </el-form-item>
        <el-form-item label="发起人"><el-input v-model="flowForm.initiator" placeholder="如：经办人 / 部门负责人" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="saveFlow">保存</el-button>
      </template>
    </el-dialog>

    <!-- 环节编辑弹窗 -->
    <el-dialog v-model="showStep" title="编辑审批环节" width="520px">
      <el-form :model="stepForm" label-width="100px">
        <el-form-item label="环节名称" required><el-input v-model="stepForm.name" placeholder="如：部门审批" /></el-form-item>
        <el-form-item label="审批人" required>
          <el-select v-model="stepForm.approver" style="width:100%" filterable allow-create>
            <el-option v-for="a in approvers" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批方式">
          <el-radio-group v-model="stepForm.mode">
            <el-radio label="或签">或签（一人通过即可）</el-radio>
            <el-radio label="会签">会签（需全部通过）</el-radio>
            <el-radio label="依次">依次审批</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额限额">
          <el-input-number v-model="stepForm.amountLimit" :min="0" :step="10000" style="width:100%" placeholder="0 表示不限额" />
        </el-form-item>
        <el-form-item label="触发条件">
          <el-input v-model="stepForm.condition" placeholder="如：金额>10万时触发，留空则无条件" />
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
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'

const bizTypes = ['合同审批', '资产处置', '保证金退还', '资产调拨', '股权投资变更', '无形资产处置', '督办事项']
const approvers = ['部门负责人', '法务专员', '财务经理', '分管副总', '总经理', '董事长', '风控专员']

const keyword = ref('')
const bizType = ref('')
const statusFilter = ref('')

let stepSeq = 100
const flowCol = useCollection(COLLECTION.systemFlows)
const flows = flowCol.items

const filtered = computed(() => flows.value.filter(p => {
  if (keyword.value && !(p.name.includes(keyword.value) || p.code.includes(keyword.value))) return false
  if (bizType.value && p.bizType !== bizType.value) return false
  if (statusFilter.value !== '' && statusFilter.value !== null && p.enabled !== statusFilter.value) return false
  return true
}))

const selected = ref(null)
function select(p) { selected.value = p }

function onToggle(p) {
  flowCol.update(p)
  ElMessage.success(`流程「${p.name}」已${p.enabled ? '启用' : '停用'}`)
}

// ===== 新建/编辑流程 =====
const showCreate = ref(false)
const editingFlowId = ref(null)
const flowForm = ref({ name: '', bizType: '合同审批', initiator: '经办人' })
function openCreate() {
  editingFlowId.value = null
  flowForm.value = { name: '', bizType: '合同审批', initiator: '经办人' }
  showCreate.value = true
}
function saveFlow() {
  if (!flowForm.value.name) { ElMessage.warning('请填写流程名称'); return }
  const code = `FLOW-${String(flows.value.length + 1).padStart(3, '0')}`
  const nf = { id: Date.now(), code, name: flowForm.value.name, bizType: flowForm.value.bizType, initiator: flowForm.value.initiator, enabled: true, steps: [] }
  selected.value = flowCol.add(nf)
  showCreate.value = false
  ElMessage.success('流程已创建，请在右侧添加审批环节')
}

// ===== 环节操作 =====
const showStep = ref(false)
const editingKey = ref(null)
const stepForm = ref({ name: '', approver: '', mode: '或签', amountLimit: 0, condition: '' })

function addStep() {
  editingKey.value = null
  stepForm.value = { name: '', approver: '', mode: '或签', amountLimit: 0, condition: '' }
  showStep.value = true
}
function editStep(s) {
  editingKey.value = s.key
  stepForm.value = { name: s.name, approver: s.approver, mode: s.mode, amountLimit: s.amountLimit || 0, condition: s.condition || '' }
  showStep.value = true
}
function saveStep() {
  if (!stepForm.value.name || !stepForm.value.approver) { ElMessage.warning('请填写环节名称与审批人'); return }
  if (editingKey.value) {
    const s = selected.value.steps.find(x => x.key === editingKey.value)
    Object.assign(s, stepForm.value)
    ElMessage.success('环节已更新')
  } else {
    selected.value.steps.push({ key: ++stepSeq, ...stepForm.value })
    ElMessage.success('环节已添加')
  }
  flowCol.update(selected.value)
  showStep.value = false
  editingKey.value = null
}
function removeStep(i) {
  ElMessageBox.confirm('确认删除该审批环节？', '提示', { type: 'warning' }).then(() => {
    selected.value.steps.splice(i, 1)
    flowCol.update(selected.value)
    ElMessage.success('已删除')
  }).catch(() => {})
}
function moveStep(i, dir) {
  const arr = selected.value.steps
  const j = i + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
  flowCol.update(selected.value)
}
</script>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; }
.page-header h2 { margin: 0; font-size: 20px; }
.filter-bar :deep(.el-select) { width: 100%; }
.main-row { align-items: stretch; }
.list-card, .designer-card { height: 100%; }
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
.node-box { display: flex; align-items: center; gap: 10px; border: 1px solid var(--bd); border-radius: var(--r-md); padding: 10px 14px; min-width: 320px; width: 100%; max-width: 480px; background: var(--bg-card); cursor: pointer; transition: box-shadow .15s; }
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
</style>
