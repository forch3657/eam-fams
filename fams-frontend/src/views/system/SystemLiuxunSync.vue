<template>
  <div class="page-container">
    <div class="page-header">
      <h2>柳讯通讯录同步</h2>
      <span class="page-subtitle">
        从柳讯通讯录批量预置公司 / 部门 / 人员；按手机号去重，一人多部门记为多岗位
      </span>
    </div>

    <el-alert
      type="warning"
      :closable="false"
      show-icon
      class="sync-alert"
      title="请先看这里"
      description="预置只建人员档案并默认启用，不分配任何角色；新用户在「用户管理」中补配角色后才能看到数据。已存在的公司/部门/用户一律跳过，不覆盖本地维护。"
    />

    <!-- 功能一（当前可用）：只预置组织 -->
    <el-card shadow="never" class="panel org-panel">
      <template #header>
        <div class="card-header">
          <span>只预置组织（公司 / 部门）</span>
        </div>
      </template>
      <p class="org-hint">
        从柳讯「用户所在部门组织架构树」拉取可见的公司/部门，交给系统现成的组织导入逻辑创建：
        <b>按名称复用、不重复、保留多级上下级、不建用户不改账号</b>。柳讯通讯录接口恢复后，再用下方「批量预置」补人员。
      </p>
      <div class="token-row">
        <span class="token-label">柳讯账号</span>
        <el-input v-model="liuxunPhone" size="small" clearable placeholder="柳讯手机号，如 18695732703" style="width: 200px" />
        <span class="token-label">密码</span>
        <el-input v-model="liuxunPassword" type="password" show-password size="small" clearable
          placeholder="柳讯账号密码" style="width: 200px" @keyup.enter="confirmOrgApply" />
        <el-button type="primary" size="small" :loading="orgApplying" :disabled="!liuxunPhone || !liuxunPassword" @click="confirmOrgApply">
          从柳讯组织树创建组织
        </el-button>
      </div>
      <div class="token-help">
        填任意一个有组织配置的柳讯账号即可（如 18695732703）。账号密码只在本次请求中用于换取 token，<b>不保存、不写日志、不进数据库</b>。
      </div>
      <el-alert v-if="orgResult" :type="orgResult.ok ? 'success' : 'warning'" :closable="false" show-icon class="org-result">
        <template #title>
          新建公司 {{ orgResult.createdCompanies }} / 复用公司 {{ orgResult.reusedCompanies }} /
          新建部门 {{ orgResult.createdDepartments }} / 复用部门 {{ orgResult.reusedDepartments }}；
          新建用户 {{ orgResult.createdUsers }} / 新建岗位 {{ orgResult.createdPositions }}（应为 0）
        </template>
        <div v-if="orgResult.failures?.length" class="org-failures">
          <div v-for="(f, i) in orgResult.failures" :key="i">{{ f }}</div>
        </div>
      </el-alert>
    </el-card>

    <!-- 功能二：批量预置（通讯录接口 500 期间不可用） -->
    <el-card shadow="never" class="panel">
      <template #header>
        <div class="card-header">
          <span>批量预置（通讯录 → 本地组织人员）</span>
          <div>
            <el-tag v-if="previewData?.mock" size="small" type="info" effect="light">mock 演示数据</el-tag>
            <el-button type="primary" size="small" :loading="previewing" @click="loadPreview">
              <el-icon><Refresh /></el-icon>
              拉取并预览
            </el-button>
            <el-button
              type="success"
              size="small"
              :disabled="!previewData || !hasCreate"
              :loading="applying"
              @click="confirmApply"
            >
              确认预置
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="!previewData" description="点击「拉取并预览」查看待预置数据（不会写库）" :image-size="70" />

      <template v-else>
        <div class="stat-row">
          <div class="stat"><span class="stat-num">{{ previewData.stats.companyNodes }}</span><span class="stat-label">公司节点</span></div>
          <div class="stat"><span class="stat-num">{{ previewData.stats.deptNodes }}</span><span class="stat-label">部门节点</span></div>
          <div class="stat"><span class="stat-num">{{ previewData.stats.peopleNodes }}</span><span class="stat-label">人员节点</span></div>
          <div class="stat highlight"><span class="stat-num">{{ previewData.stats.uniquePeople }}</span><span class="stat-label">去重后人员</span></div>
          <div class="stat"><span class="stat-num">{{ previewData.stats.skipExistingUsers }}</span><span class="stat-label">已存在跳过</span></div>
        </div>

        <el-tabs v-model="activeTab" class="preview-tabs">
          <el-tab-pane label="公司" name="companies">
            <el-table :data="previewData.companies" border stripe size="small" max-height="360">
              <el-table-column prop="name" label="公司名称" min-width="240" />
              <el-table-column prop="action" label="处理" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.action === 'CREATE' ? 'success' : 'info'" size="small" effect="light">
                    {{ row.action === 'CREATE' ? '新建' : '跳过（已存在）' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="部门" name="departments">
            <el-table :data="previewData.departments" border stripe size="small" max-height="360">
              <el-table-column prop="companyName" label="所属公司" min-width="200" />
              <el-table-column prop="name" label="部门名称" min-width="180" />
              <el-table-column prop="action" label="处理" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.action === 'CREATE' ? 'success' : 'info'" size="small" effect="light">
                    {{ row.action === 'CREATE' ? '新建' : '跳过（已存在）' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="人员（按手机号去重）" name="users">
            <el-table :data="previewData.users" border stripe size="small" max-height="360">
              <el-table-column prop="phone" label="手机号（唯一键）" width="150" />
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column prop="companyName" label="公司" min-width="180" />
              <el-table-column prop="deptName" label="部门" min-width="150" />
              <el-table-column prop="position" label="主职岗位" min-width="150" />
              <el-table-column prop="action" label="处理" width="110">
                <template #default="{ row }">
                  <el-tag :type="row.action === 'CREATE' ? 'success' : 'info'" size="small" effect="light">
                    {{ row.action === 'CREATE' ? '新建' : '跳过（已存在）' }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="岗位（含兼职）" name="positions">
            <el-table :data="previewData.positions" border stripe size="small" max-height="360">
              <el-table-column prop="phone" label="手机号" width="150" />
              <el-table-column prop="name" label="姓名" width="120" />
              <el-table-column prop="companyName" label="公司" min-width="180" />
              <el-table-column prop="deptName" label="部门" min-width="150" />
              <el-table-column prop="position" label="岗位" min-width="150" />
              <el-table-column label="主职" width="80" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.primary" type="warning" size="small" effect="light">主职</el-tag>
                  <span v-else class="muted">兼职</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-card>

    <!-- 功能三：按公司批量启用 -->
    <el-card shadow="never" class="panel">
      <template #header>
        <div class="card-header"><span>按公司批量启用</span></div>
      </template>
      <el-form :inline="true" label-width="100px" size="small">
        <el-form-item label="选择公司">
          <el-select v-model="selectedCompanyId" placeholder="请选择公司" filterable clearable style="width: 320px">
            <el-option v-for="c in orgStore.companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :disabled="!selectedCompanyId" :loading="enabling" @click="confirmEnable">
            启用该公司未启用账号
          </el-button>
        </el-form-item>
      </el-form>
      <div v-if="selectedCompanyId" class="company-hint">
        当前公司共 <b>{{ companyUserCount }}</b> 个本地账号，其中未启用 <b class="warn">{{ disabledCount }}</b> 个。
        为避免误操作，仅启用「当前公司」下账号，不含下级公司。
      </div>
      <div v-else class="company-hint muted">选择公司后显示该公司本地账号统计。</div>
    </el-card>

    <el-dialog v-model="orgDialog" title="确认创建组织" width="480px">
      <p>将从柳讯组织树创建公司/部门：</p>
      <ul class="confirm-list">
        <li>按名称复用已存在的组织，<b>不会重复创建、不覆盖本地数据</b></li>
        <li>保留多级公司/部门上下级关系</li>
        <li><b>不创建用户、不创建岗位、不改任何账号</b></li>
      </ul>
      <el-alert type="info" :closable="false" show-icon
        title="当前柳讯组织树接口只返回该账号所在链路，不是全量组织；如需全量请等通讯录接口恢复。" />
      <template #footer>
        <el-button @click="orgDialog = false">取消</el-button>
        <el-button type="primary" :loading="orgApplying" @click="doOrgApply">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="applyDialog" title="确认批量预置" width="480px">
      <p>将从柳讯通讯录新建以下档案：</p>
      <ul class="confirm-list">
        <li>公司 <b>{{ previewData?.stats.createCompanies || 0 }}</b> 个</li>
        <li>部门 <b>{{ previewData?.stats.createDepartments || 0 }}</b> 个</li>
        <li>用户 <b>{{ previewData?.stats.createUsers || 0 }}</b> 个（去重后）</li>
      </ul>
      <el-alert type="info" :closable="false" show-icon title="新用户默认启用，但未分配角色，登录后暂无可见数据；请到用户管理补配角色。" />
      <template #footer>
        <el-button @click="applyDialog = false">取消</el-button>
        <el-button type="primary" :loading="applying" @click="doApply">确认预置</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="enableDialog" title="确认批量启用" width="460px">
      <p>
        将启用「<b>{{ selectedCompanyName }}</b>」下 <b>{{ disabledCount }}</b> 个未启用账号（不含下级公司）。
      </p>
      <template #footer>
        <el-button @click="enableDialog = false">取消</el-button>
        <el-button type="primary" :loading="enabling" @click="doEnable">确认启用</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useOrgStore } from '../../store/org'
import { syncPreview, syncApply, syncApplyOrganizations, syncEnableByCompany } from '../../services/liuxun'

const orgStore = useOrgStore()

const orgApplying = ref(false)
const orgDialog = ref(false)
const orgResult = ref(null)
const liuxunPhone = ref('')
const liuxunPassword = ref('')

const previewing = ref(false)
const previewData = ref(null)
const applying = ref(false)
const applyDialog = ref(false)
const activeTab = ref('users')

const selectedCompanyId = ref('')
const enabling = ref(false)
const enableDialog = ref(false)

const hasCreate = computed(() => {
  const s = previewData.value?.stats
  return !!s && (s.createCompanies + s.createDepartments + s.createUsers) > 0
})

const selectedCompanyName = computed(() =>
  orgStore.companies.find(c => c.id === selectedCompanyId.value)?.name || ''
)

const companyUsers = computed(() =>
  orgStore.users.filter(u => u.companyId === selectedCompanyId.value)
)
const companyUserCount = computed(() => companyUsers.value.length)
const disabledCount = computed(() =>
  companyUsers.value.filter(u => u.status !== 'ENABLED').length
)

function confirmOrgApply() {
  orgDialog.value = true
}

async function doOrgApply() {
  orgApplying.value = true
  try {
    const res = await syncApplyOrganizations(liuxunPhone.value, liuxunPassword.value)
    orgResult.value = res
    liuxunPassword.value = ''
    orgDialog.value = false
    if (res.ok) {
      ElMessage.success('组织预置完成，可在「公司管理 / 部门管理」查看')
    } else {
      ElMessage.warning('组织预置部分失败，请查看下方明细')
    }
    orgStore.loadAll()
  } catch (e) {
    ElMessage.error(typeof e === 'string' ? e : (e?.message || '组织预置失败'))
  } finally {
    orgApplying.value = false
  }
}

async function loadPreview() {
  previewing.value = true
  try {
    const res = await syncPreview()
    previewData.value = res
    activeTab.value = 'users'
  } catch (e) {
    ElMessage.error(typeof e === 'string' ? e : (e?.message || '拉取通讯录失败'))
  } finally {
    previewing.value = false
  }
}

function confirmApply() {
  applyDialog.value = true
}

async function doApply() {
  applying.value = true
  try {
    const res = await syncApply()
    applyDialog.value = false
    const errors = res.errors || []
    if (errors.length) {
      ElMessageBox.alert(
        errors.slice(0, 8).join('\n') + (errors.length > 8 ? `\n…另有 ${errors.length - 8} 条` : ''),
        `预置完成，但有 ${errors.length} 条失败`,
        { type: 'warning' }
      )
    } else {
      ElMessage.success(
        `预置完成：公司 ${res.createdCompanies} / 部门 ${res.createdDepartments} / 用户 ${res.createdUsers} / 岗位 ${res.createdPositions}`
      )
    }
    orgStore.loadAll()
    previewData.value = null
  } catch (e) {
    ElMessage.error(typeof e === 'string' ? e : (e?.message || '批量预置失败'))
  } finally {
    applying.value = false
  }
}

function confirmEnable() {
  if (disabledCount.value === 0) {
    ElMessage.info('该公司没有需要启用的账号')
    return
  }
  enableDialog.value = true
}

async function doEnable() {
  enabling.value = true
  try {
    const res = await syncEnableByCompany(selectedCompanyId.value)
    enableDialog.value = false
    ElMessage.success(`已启用 ${res.enabled} 个账号（已启用 ${res.skipped} 个）`)
    orgStore.loadAll()
  } catch (e) {
    ElMessage.error(typeof e === 'string' ? e : (e?.message || '批量启用失败'))
  } finally {
    enabling.value = false
  }
}
</script>

<style scoped>
.sync-alert { margin-bottom: 16px; }
.panel { margin-bottom: 16px; }
.org-panel { border-color: var(--el-color-primary-light-7); }
.org-hint { margin: 0 0 10px; font-size: 13px; line-height: 1.8; color: var(--el-text-color-regular); }
.token-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.token-label { font-size: 13px; color: var(--el-text-color-regular); white-space: nowrap; }
.token-help { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
.token-help a { color: var(--el-color-primary); }
.org-result { margin-top: 10px; }
.org-failures { font-size: 12px; line-height: 1.6; margin-top: 6px; }
.card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.card-header > div { display: flex; align-items: center; gap: 8px; }
.stat-row { display: flex; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.stat { min-width: 110px; padding: 10px 16px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-bg-color); text-align: center; }
.stat.highlight { border-color: var(--el-color-primary-light-5); background: var(--el-color-primary-light-9); }
.stat-num { display: block; font-size: 22px; font-weight: 600; color: var(--el-text-color-primary); }
.stat-label { display: block; font-size: 12px; color: var(--el-text-color-secondary); margin-top: 4px; }
.preview-tabs :deep(.el-tabs__header) { margin-bottom: 8px; }
.company-hint { margin-top: 10px; font-size: 13px; color: var(--el-text-color-regular); }
.company-hint b { color: var(--el-text-color-primary); }
.company-hint .warn { color: var(--el-color-warning); }
.confirm-list { margin: 8px 0 16px; padding-left: 20px; line-height: 1.9; }
.muted { color: var(--el-text-color-secondary); }
</style>
