<template>
  <div class="page-container">
    <div class="page-header">
      <h2>数据导入</h2>
      <span class="page-subtitle">
        组织架构、低值资产、固定资产均可一张表导完；其余数据按资源导入，校验与界面单条新增完全一致
      </span>
    </div>

    <!-- 1. 模式切换 -->
    <div class="mode-switch">
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'org' }"
        @click="switchMode('org')"
      >
        <div class="mode-title">
          组织架构导入
          <el-tag size="small" type="success" effect="light">推荐</el-tag>
        </div>
        <div class="mode-desc">
          公司 / 部门 / 人员 写在同一张表里，一次上传；无需填写任何内部主键
        </div>
      </button>
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'low' }"
        @click="switchMode('low')"
      >
        <div class="mode-title">低值资产导入</div>
        <div class="mode-desc">
          一张台账表：一行一个物品，含期初库存与存放位置；位置不存在自动建档
        </div>
      </button>
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'asset' }"
        @click="switchMode('asset')"
      >
        <div class="mode-title">固定资产导入</div>
        <div class="mode-desc">
          一张台账表：一行一张资产卡片，公司/部门/使用人按名称匹配
        </div>
      </button>
      <button
        type="button"
        class="mode-card"
        :class="{ active: mode === 'resource' }"
        @click="switchMode('resource')"
      >
        <div class="mode-title">按资源导入</div>
        <div class="mode-desc">
          字典等其它数据：按资源字段模板逐类导入（高级模式）
        </div>
      </button>
    </div>

    <!-- 2. 操作区 -->
    <el-card shadow="never" class="panel">
      <el-form v-if="mode === 'org'" label-width="110px" size="small">
        <el-form-item label="导入模板">
          <el-button :loading="tplLoading" @click="downloadOrgTemplate">下载组织架构模板</el-button>
          <span class="hint">一张表覆盖公司 / 部门 / 人员</span>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button>选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>

      <el-form v-else-if="mode === 'low'" label-width="110px" size="small">
        <el-form-item label="导入模板">
          <el-button :loading="tplLoading" @click="downloadLowValueTemplate">下载低值资产模板</el-button>
          <span class="hint">一张台账表，一行一个物品</span>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button>选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>

      <el-form v-else-if="mode === 'asset'" label-width="110px" size="small">
        <el-form-item label="导入模板">
          <el-button :loading="tplLoading" @click="downloadAssetTemplate">下载固定资产模板</el-button>
          <span class="hint">一张台账表，一行一张资产卡片</span>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button>选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>

      <el-form v-else label-width="110px" size="small">
        <el-form-item label="导入资源">
          <el-select
            v-model="key"
            filterable
            placeholder="请选择要导入的数据资源"
            style="width:420px"
            @change="onResourceChange"
          >
            <el-option v-for="r in resources" :key="r.key" :label="`${r.label}（${r.key}）`" :value="r.key" />
          </el-select>
          <el-button :disabled="!key" :loading="tplLoading" style="margin-left:8px" @click="downloadTemplate">
            下载模板
          </el-button>
        </el-form-item>

        <el-form-item label="校验模式">
          <el-switch
            v-model="abortOnError"
            active-text="整批校验（有错则整批拒绝，不落库）"
            inactive-text="跳过错误行（其余继续写入）"
          />
        </el-form-item>

        <el-form-item label="选择文件">
          <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.xlsx,.xls" :on-change="handleFile">
            <el-button :disabled="!key">选择 CSV / Excel 文件</el-button>
          </el-upload>
          <span v-if="file" class="hint file-name">{{ file.name }}</span>
          <el-button type="primary" :disabled="!canSubmit" :loading="uploading" style="margin-left:12px" @click="submit">
            开始导入
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 3. 模板说明 -->
    <el-card v-if="mode === 'org'" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>单表填写说明：一行写到哪一层就建到哪一层</span>
      </template>

      <div class="granularity">
        <div class="gran-item">
          <span class="gran-step">1</span>
          <span class="gran-text">只填<b>公司名称</b> → 只建公司</span>
        </div>
        <div class="gran-item">
          <span class="gran-step">2</span>
          <span class="gran-text">再加<b>部门名称</b> → 建公司 + 部门</span>
        </div>
        <div class="gran-item">
          <span class="gran-step">3</span>
          <span class="gran-text">再加<b>姓名 / 账号 / 口令</b> → 建公司 + 部门 + 人员</span>
        </div>
      </div>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="模板第 1 行为表头，第 2/3 行为「说明 / 示例」（以 # 开头，导入时自动跳过）；可直接在示例行下方追加数据。同一公司或部门出现多行时只会创建一次。"
        style="margin:12px 0"
      />

      <el-table :data="ORG_COLUMNS" border stripe size="small" max-height="360">
        <el-table-column prop="name" label="列名称" width="130" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="desc" label="说明" min-width="300" show-overflow-tooltip />
        <el-table-column prop="sample" label="示例" width="180" show-overflow-tooltip />
      </el-table>
    </el-card>

    <el-card v-else-if="mode === 'low'" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>单表填写说明：一行 = 一个低值物品</span>
      </template>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="期初库存直接写入台账，不会生成入库单，因此「入库管理」和「出入库汇总」里看不到这批数量；后续补货请用「入库管理 → 新增入库」。同一物品重复导入只按复用处理，库存不会重复累加。"
        style="margin-bottom:12px"
      />

      <el-table :data="LOW_VALUE_COLUMNS" border stripe size="small" max-height="360">
        <el-table-column prop="name" label="列名称" width="130" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="desc" label="说明" min-width="300" show-overflow-tooltip />
        <el-table-column prop="sample" label="示例" width="180" show-overflow-tooltip />
      </el-table>
    </el-card>

    <el-card v-else-if="mode === 'asset'" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>单表填写说明：一行 = 一张资产卡片（一物一码）</span>
      </template>

      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="固定资产一物一码：同名同型号可以有多台，请一行填一台；只按「资产编号」判重，编号已存在只复用、不覆盖原有数据。入库/派发/借出/维修/调拨/处置属于业务单据，不在本表范围内。"
        style="margin-bottom:12px"
      />

      <el-table :data="ASSET_COLUMNS" border stripe size="small" max-height="380">
        <el-table-column prop="name" label="列名称" width="130" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="desc" label="说明" min-width="300" show-overflow-tooltip />
        <el-table-column prop="sample" label="示例" width="180" show-overflow-tooltip />
      </el-table>
    </el-card>

    <el-card v-else-if="mode === 'resource' && current" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <span>字段说明：模板第 1 行为表头，第 2/3 行为「说明 / 示例」（以 # 开头，导入时自动忽略）；可直接在示例行下方追加数据</span>
      </template>
      <el-table :data="current.fields" border stripe size="small" max-height="320">
        <el-table-column prop="name" label="字段名" width="180" />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column label="必填" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.required ? 'danger' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="唯一" width="80" align="center">
          <template #default="{ row }">
            <el-tag :type="row.unique ? 'warning' : 'info'" size="small">{{ row.unique ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="枚举 / 引用" min-width="260">
          <template #default="{ row }">
            <span v-if="row.enumName">
              枚举：{{ row.enumName }}
              <template v-if="row.enumValues && row.enumValues.length">
                （{{ row.enumValues.join(' / ') }}）
              </template>
            </span>
            <span v-else-if="row.refCollection">引用：{{ row.refCollection }}（填目标记录主键）</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 4. 结果 -->
    <el-card v-if="result" shadow="never" class="panel" style="margin-top:12px">
      <template #header>
        <div class="result-header">
          <span>导入结果</span>
          <el-tag :type="statusTagType" size="small" effect="light">{{ statusText }}</el-tag>
        </div>
      </template>

      <!-- 组织架构：分级统计 -->
      <div v-if="mode === 'org'" class="metric-row">
        <div class="metric">
          <div class="metric-value">{{ result.createdCompanies || 0 }}</div>
          <div class="metric-label">新建公司</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedCompanies || 0 }}</div>
          <div class="metric-label">复用公司</div>
        </div>
        <div class="metric">
          <div class="metric-value">{{ result.createdDepartments || 0 }}</div>
          <div class="metric-label">新建部门</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedDepartments || 0 }}</div>
          <div class="metric-label">复用部门</div>
        </div>
        <div class="metric metric-user">
          <div class="metric-value">{{ result.createdUsers || 0 }}</div>
          <div class="metric-label">新建用户</div>
        </div>
        <div class="metric metric-total">
          <div class="metric-value">{{ result.total || 0 }}</div>
          <div class="metric-label">数据行数</div>
        </div>
      </div>

      <!-- 低值资产：分级统计 -->
      <div v-else-if="mode === 'low'" class="metric-row metric-row-low">
        <div class="metric">
          <div class="metric-value">{{ result.createdItems || 0 }}</div>
          <div class="metric-label">新建物品</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedItems || 0 }}</div>
          <div class="metric-label">复用物品</div>
        </div>
        <div class="metric metric-user">
          <div class="metric-value">{{ result.createdLocations || 0 }}</div>
          <div class="metric-label">新建存放位置</div>
        </div>
        <div class="metric metric-total">
          <div class="metric-value">{{ result.total || 0 }}</div>
          <div class="metric-label">数据行数</div>
        </div>
      </div>

      <!-- 固定资产：分级统计 -->
      <div v-else-if="mode === 'asset'" class="metric-row metric-row-low">
        <div class="metric">
          <div class="metric-value">{{ result.createdAssets || 0 }}</div>
          <div class="metric-label">新建资产</div>
        </div>
        <div class="metric metric-muted">
          <div class="metric-value">{{ result.reusedAssets || 0 }}</div>
          <div class="metric-label">复用资产</div>
        </div>
        <div class="metric metric-user">
          <div class="metric-value">{{ result.createdLocations || 0 }}</div>
          <div class="metric-label">新建存放地点</div>
        </div>
        <div class="metric metric-total">
          <div class="metric-value">{{ result.total || 0 }}</div>
          <div class="metric-label">数据行数</div>
        </div>
      </div>

      <el-descriptions v-else :column="3" size="small" border>
        <el-descriptions-item label="状态">{{ statusText }}</el-descriptions-item>
        <el-descriptions-item label="总行数">{{ result.total }}</el-descriptions-item>
        <el-descriptions-item label="成功">{{ result.success }}</el-descriptions-item>
      </el-descriptions>

      <el-alert
        v-if="result.status === 'REJECTED_INVALID'"
        type="error"
        :closable="false"
        show-icon
        title="整批被拒绝：存在不合法的数据行，未写入任何数据。请按下方错误明细修正后重新导入。"
        style="margin-top:12px"
      />

      <el-alert
        v-else-if="mode !== 'resource' && result.status === 'PARTIAL'"
        type="warning"
        :closable="false"
        show-icon
        title="部分成功：成功的数据已写入，失败行未导入。修正后可只提交失败的行重新导入。"
        style="margin-top:12px"
      />

      <el-table
        v-if="result.failures && result.failures.length"
        :data="result.failures"
        border
        stripe
        size="small"
        max-height="300"
        style="margin-top:12px"
      >
        <el-table-column prop="row" label="行号" width="90" />
        <el-table-column prop="message" label="失败原因" min-width="320" show-overflow-tooltip />
      </el-table>
    </el-card>

    <!-- 5. 危险操作：数据重置 -->
    <el-card shadow="never" class="panel danger-panel" style="margin-top:12px">
      <template #header>
        <div class="result-header">
          <span class="danger-title">危险操作 · 数据重置</span>
          <el-tag type="danger" size="small" effect="plain">不可恢复</el-tag>
        </div>
      </template>

      <div class="danger-tip">
        首次上线导入真实数据前，可一次性清理演示 / 历史业务数据；角色、系统参数、字典、流程模板、折旧方案、资产分类等
        <b>通用基础配置会保留</b>。仅 admin 管理员（ROLE_ADMIN）可执行，且清空后会保留当前登录的 admin 账号。
      </div>

      <div class="danger-actions">
        <el-button type="danger" plain :disabled="resetDialog.loading" @click="openReset('org')">
          清空组织架构
        </el-button>
        <el-button type="danger" plain :disabled="resetDialog.loading" @click="openReset('low-value')">
          清空低值资产
        </el-button>
        <el-button type="danger" plain :disabled="resetDialog.loading" @click="openReset('fixed-asset')">
          清空固定资产
        </el-button>
        <el-button type="danger" :disabled="resetDialog.loading" @click="openReset('all')">
          清空全部业务数据
        </el-button>
      </div>
    </el-card>

    <!-- 清空确认弹窗 -->
    <el-dialog
      v-model="resetDialog.visible"
      :title="`清空${resetDialog.label}数据`"
      width="600px"
      :close-on-click-modal="false"
      append-to-body
    >
      <div v-loading="resetDialog.loading">
        <el-alert
          type="error"
          :closable="false"
          show-icon
          title="清空不可恢复！仅建议在首次上线导入真实数据前使用，操作前请备份数据库。"
          style="margin-bottom:12px"
        />

        <template v-if="resetDialog.preview">
          <el-alert
            v-if="resetDialog.preview.blockers.length"
            type="warning"
            :closable="false"
            show-icon
            title="当前不能直接清空，请先处理下列依赖："
            style="margin-bottom:8px"
          />
          <ul v-if="resetDialog.preview.blockers.length" class="blocker-list">
            <li v-for="b in resetDialog.preview.blockers" :key="b">{{ b }}</li>
          </ul>

          <el-table
            v-if="resetDialog.preview.items.length"
            :data="resetDialog.preview.items"
            border
            size="small"
            max-height="260"
          >
            <el-table-column prop="label" label="数据" min-width="240" />
            <el-table-column prop="count" label="将删除" width="100" align="right" />
          </el-table>
          <div v-else class="hint-block">当前范围没有可清空的数据。</div>

          <div class="reset-total">合计：<b>{{ resetDialog.preview.total }}</b> 条</div>

          <ul class="reset-notes">
            <li v-for="n in resetDialog.preview.notes" :key="n">{{ n }}</li>
          </ul>

          <div v-if="resetDialog.preview.items.length && !resetDialog.preview.blockers.length" class="reset-confirm">
            <span>请输入 <b>清空</b> 以确认：</span>
            <el-input v-model="resetDialog.confirmText" placeholder="清空" style="width:140px" />
          </div>
        </template>
      </div>

      <template #footer>
        <el-button @click="resetDialog.visible = false">取消</el-button>
        <el-button type="danger" :disabled="!canReset" :loading="resetDialog.executing" @click="executeReset">
          确认清空
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import httpService from '../../services/http'
import { useFixedAssetStore } from '../../store/fixedAsset'
import { useLowValueAssetStore } from '../../store/lowValueAsset'
import { useOrgStore } from '../../store/org'
import { useWorkbenchStore } from '../../store/workbench'
import { useNotifyStore } from '../../store/notify'
import { useAuditStore } from '../../store/audit'

const fixedAssetStore = useFixedAssetStore()
const lowValueAssetStore = useLowValueAssetStore()
const orgStore = useOrgStore()
const workbench = useWorkbenchStore()
const notifyStore = useNotifyStore()
const auditStore = useAuditStore()

const ORG_COLUMNS = [
  { name: '公司名称', required: true, desc: '必填；已存在则自动复用，不会重复创建', sample: '示例科技有限公司' },
  { name: '公司编码', required: false, desc: '选填；留空按 GS-0001 规则自动生成；填写时按编码优先匹配', sample: 'GS-0001' },
  { name: '部门名称', required: false, desc: '选填；留空表示该行只建公司', sample: '研发部' },
  { name: '上级部门', required: false, desc: '选填；留空为一级部门；须在本文件或系统中已存在于同一公司', sample: '（留空）' },
  { name: '姓名', required: false, desc: '选填；留空表示该行只建部门', sample: '张三' },
  { name: '登录账号', required: false, desc: '填写姓名时必填；全局唯一，重复不会覆盖已有账号', sample: 'zhangsan' },
  { name: '初始口令', required: false, desc: '填写姓名时必填；至少 8 位且含字母/数字/符号中两类，落库自动加密', sample: 'Zhang@2026!' },
  { name: '岗位', required: false, desc: '选填', sample: '工程师' },
  { name: '手机', required: false, desc: '选填', sample: '13800138000' },
  { name: '邮箱', required: false, desc: '选填', sample: 'zhangsan@example.com' },
  { name: '角色', required: false, desc: '选填；可填角色编码或名称，多个用 | 分隔', sample: 'ROLE_ADMIN' },
  { name: '状态', required: false, desc: '选填；默认 ENABLED，可选 ENABLED / DISABLED', sample: 'ENABLED' }
]

const LOW_VALUE_COLUMNS = [
  { name: '物品类别', required: true, desc: '必填；填类别名称（办公用品/水/劳保用品/纸品）或编码（OFFICE/WATER/PPE/PAPER）', sample: '办公用品' },
  { name: '物品名称', required: true, desc: '必填', sample: 'A4 打印纸' },
  { name: '规格型号', required: false, desc: '选填', sample: '70g/500张' },
  { name: '单位', required: true, desc: '必填；如 包/个/箱', sample: '包' },
  { name: '物品单价', required: false, desc: '选填；默认 0，最多两位小数', sample: '25.00' },
  { name: '期初库存', required: false, desc: '选填；直接写入台账库存，不生成入库单；重复导入不会重复累加', sample: '100' },
  { name: '安全库存', required: false, desc: '选填；默认 0，用于低库存预警', sample: '20' },
  { name: '存放位置', required: false, desc: '选填；填位置名称，不存在时自动创建', sample: '行政库房' },
  { name: '状态', required: false, desc: '选填；默认 正常，可选 正常/低库存/停用 或 NORMAL/LOW_STOCK/DISABLED', sample: '正常' },
  { name: '物品编码', required: false, desc: '选填；留空自动生成 DZ20260001 形式', sample: '（留空）' }
]

const ASSET_COLUMNS = [
  { name: '资产名称', required: true, desc: '必填；同名同型号可以有多台，一行填一台', sample: '联想ThinkPad笔记本电脑' },
  { name: '资产分类', required: true, desc: '必填；填名称（电子设备/机械设备/运输设备/办公家具/房屋建筑物/办公用品/材料/其他设备）或编码', sample: '电子设备' },
  { name: '资产编号', required: false, desc: '选填；留空自动生成 GD20260001；填写时按编号判重，已存在只复用不覆盖', sample: '（留空）' },
  { name: '品牌', required: false, desc: '选填', sample: '联想' },
  { name: '规格型号', required: false, desc: '选填', sample: 'ThinkPad T14' },
  { name: '所属公司', required: false, desc: '选填；填公司名称，须已在组织架构中维护', sample: '华信科技集团有限公司' },
  { name: '使用部门', required: false, desc: '选填；填部门名称；填写公司时须属于该公司', sample: '研发部' },
  { name: '使用人', required: false, desc: '选填；填姓名或登录账号；同名时请改填登录账号', sample: '张三' },
  { name: '存放地点', required: false, desc: '选填；填名称，不存在时自动创建', sample: '总部办公楼2层' },
  { name: '购置日期', required: false, desc: '选填；yyyy-MM-dd', sample: '2026-03-12' },
  { name: '购置金额', required: false, desc: '选填；默认 0，最多两位小数', sample: '8500' },
  { name: '资产原值', required: false, desc: '选填；留空取购置金额', sample: '8500' },
  { name: '净值', required: false, desc: '选填；留空取资产原值', sample: '7650' },
  { name: '购置方式', required: false, desc: '选填；默认 购买，可选 购买/租赁/自建/受赠', sample: '购买' },
  { name: '状态', required: false, desc: '选填；默认 空闲，可选 空闲/使用中/派发中/借出中/维修中/处置中', sample: '空闲' },
  { name: '是否计提折旧', required: false, desc: '选填；默认 是，可选 是/否', sample: '是' }
]

const STATUS_TEXT = {
  OK: '全部成功',
  REJECTED_INVALID: '整批拒绝（未写入）',
  PARTIAL: '部分成功',
  FAILED: '全部失败'
}

const RESET_SCOPES = {
  org: '组织架构',
  'low-value': '低值资产',
  'fixed-asset': '固定资产',
  all: '全部业务数据'
}

const resetDialog = reactive({
  visible: false,
  scope: '',
  label: '',
  preview: null,
  loading: false,
  executing: false,
  confirmText: ''
})

const canReset = computed(() => {
  const p = resetDialog.preview
  return !!p && !p.blockers.length && p.items.length > 0
    && resetDialog.confirmText.trim() === '清空' && !resetDialog.executing
})

const mode = ref('org')
const resources = ref([])
const key = ref('')
const file = ref(null)
const abortOnError = ref(true)
const uploading = ref(false)
const tplLoading = ref(false)
const result = ref(null)

const current = computed(() => resources.value.find(r => r.key === key.value) || null)
const canSubmit = computed(() => {
  if (!file.value || uploading.value) return false
  return mode.value === 'resource' ? !!key.value : true
})
const statusText = computed(() => STATUS_TEXT[result.value?.status] || result.value?.status || '')
const statusTagType = computed(() => {
  const s = result.value?.status
  if (s === 'OK') return 'success'
  if (s === 'PARTIAL') return 'warning'
  if (s === 'REJECTED_INVALID' || s === 'FAILED') return 'danger'
  return 'info'
})

async function loadResources() {
  try {
    resources.value = await httpService.importResources()
  } catch (e) {
    ElMessage.error(e?.message || '加载可导入资源失败')
  }
}

function switchMode(next) {
  if (mode.value === next) return
  mode.value = next
  file.value = null
  result.value = null
}

function onResourceChange() {
  file.value = null
  result.value = null
}

function handleFile(uploadFile) {
  file.value = uploadFile?.raw || null
  result.value = null
}

async function downloadOrgTemplate() {
  tplLoading.value = true
  try {
    await httpService.importOrgTemplate()
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

async function downloadLowValueTemplate() {
  tplLoading.value = true
  try {
    await httpService.importLowValueTemplate()
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

async function downloadAssetTemplate() {
  tplLoading.value = true
  try {
    await httpService.importFixedAssetTemplate()
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

async function downloadTemplate() {
  tplLoading.value = true
  try {
    await httpService.importTemplate(key.value)
  } catch (e) {
    ElMessage.error(e?.message || '模板下载失败')
  } finally {
    tplLoading.value = false
  }
}

function notifyResult(res) {
  if (res.status === 'OK') {
    if (mode.value === 'org') {
      ElMessage.success(
        `导入成功：新建 ${res.createdCompanies} 家公司、${res.createdDepartments} 个部门、${res.createdUsers} 个用户`
      )
    } else if (mode.value === 'low') {
      ElMessage.success(
        `导入成功：新建 ${res.createdItems} 个物品、${res.createdLocations} 个存放位置`
      )
    } else if (mode.value === 'asset') {
      ElMessage.success(
        `导入成功：新建 ${res.createdAssets} 张资产卡片、${res.createdLocations} 个存放地点`
      )
    } else {
      ElMessage.success(`导入成功：${res.success} 行`)
    }
  } else if (res.status === 'PARTIAL') {
    ElMessage.warning(`部分成功：失败 ${res.failures?.length || 0} 行，请查看失败明细`)
  } else {
    ElMessage.error(statusText.value)
  }
}

async function submit() {
  if (!canSubmit.value) return
  uploading.value = true
  try {
    if (mode.value === 'org') {
      result.value = await httpService.importOrgUpload(file.value, abortOnError.value)
    } else if (mode.value === 'low') {
      result.value = await httpService.importLowValueUpload(file.value, abortOnError.value)
    } else if (mode.value === 'asset') {
      result.value = await httpService.importFixedAssetUpload(file.value, abortOnError.value)
    } else {
      result.value = await httpService.importUpload(key.value, file.value, abortOnError.value)
    }
    notifyResult(result.value)
    if (result.value?.status === 'OK' || result.value?.status === 'PARTIAL') {
      await refreshStores(mode.value === 'low' ? 'low-value' : mode.value === 'asset' ? 'fixed-asset' : mode.value)
    }
  } catch (e) {
    ElMessage.error(e?.message || '导入失败')
  } finally {
    uploading.value = false
  }
}

/**
 * 主动刷新内存中的 store。
 *
 * 各模块 store 由 MainLayout 在首屏加载一次（loaded 标记后不再拉取），
 * 导入/清空只改了服务端数据，不刷新内存就会出现「已清空/已导入，页面还是旧数据」的假象，
 * 过去只能靠刷新整个应用解决。
 */
async function refreshStores(scope) {
  const jobs = []
  if (scope === 'fixed-asset' || scope === 'org' || scope === 'all') jobs.push(fixedAssetStore.loadAll())
  if (scope === 'low-value' || scope === 'org' || scope === 'all') jobs.push(lowValueAssetStore.loadAll())
  if (scope === 'org' || scope === 'all') jobs.push(orgStore.loadAll())
  // 清空组织架构/全量清空会一并清掉站内消息，未读徽标要跟着归零
  if (scope === 'org' || scope === 'all') jobs.push(notifyStore.loadAll())
  // 全量清空会一并清掉操作日志，避免日志页还停留在 500+ 条的旧数据
  if (scope === 'all') jobs.push(auditStore.loadAll())
  jobs.push(workbench.load(true))
  try {
    await Promise.all(jobs)
  } catch (e) {
    // 刷新失败不影响本次操作结果，重新进入页面时会再次拉取
  }
}

async function openReset(scope) {
  resetDialog.visible = true
  resetDialog.scope = scope
  resetDialog.label = RESET_SCOPES[scope]
  resetDialog.preview = null
  resetDialog.confirmText = ''
  resetDialog.loading = true
  try {
    resetDialog.preview = await httpService.dataResetPreview(scope)
  } catch (e) {
    ElMessage.error(e?.message || '读取清空预览失败')
    resetDialog.visible = false
  } finally {
    resetDialog.loading = false
  }
}

async function executeReset() {
  if (!canReset.value) return
  resetDialog.executing = true
  try {
    const res = await httpService.dataReset(resetDialog.scope)
    resetDialog.visible = false
    file.value = null
    result.value = null
    await refreshStores(resetDialog.scope)
    ElMessage.success(`已清空 ${res.deleted || 0} 条数据`)
  } catch (e) {
    ElMessage.error(e?.message || '清空失败')
  } finally {
    resetDialog.executing = false
  }
}

onMounted(loadResources)
</script>

<style scoped>
.panel {
  margin-bottom: 0;
}

.hint {
  margin-left: 10px;
  color: var(--t-sub);
  font-size: 12px;
}

/* 危险操作 */
.danger-panel {
  border-color: rgba(208, 48, 80, 0.35);
}

.danger-title {
  color: var(--c-danger);
  font-weight: 600;
}

.danger-tip {
  font-size: 13px;
  line-height: 1.8;
  color: var(--t-sub);
}

.danger-tip b {
  color: var(--t-main);
}

.danger-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.blocker-list {
  margin: 0 0 10px 18px;
  padding: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--c-danger);
}

.reset-total {
  margin-top: 10px;
  font-size: 13px;
  color: var(--t-main);
}

.reset-total b {
  color: var(--c-danger);
  font-size: 16px;
}

.reset-notes {
  margin: 8px 0 0 18px;
  padding: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--t-sub);
}

.reset-confirm {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  font-size: 13px;
}

.reset-confirm b {
  color: var(--c-danger);
}

.hint-block {
  padding: 16px;
  font-size: 13px;
  color: var(--t-sub);
}

.file-name {
  max-width: 260px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* 模式切换 */
.mode-switch {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.mode-card {
  text-align: left;
  padding: 14px 16px;
  background: var(--bg-card);
  border: 1px solid var(--bd);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
}

.mode-card:hover {
  box-shadow: var(--shadow);
  border-color: var(--c-primary);
}

.mode-card.active {
  border-color: var(--c-primary);
  background: linear-gradient(135deg, rgba(31, 111, 235, 0.08), rgba(31, 111, 235, 0.02));
  box-shadow: 0 0 0 1px var(--c-primary) inset;
}

.mode-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--t-main);
}

.mode-desc {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--t-sub);
}

/* 粒度说明 */
.granularity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.gran-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-th);
  border-radius: var(--r-sm);
  font-size: 13px;
  color: var(--t-main);
}

.gran-step {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.gran-text b {
  color: var(--c-primary);
  font-weight: 600;
}

/* 分级结果指标 */
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.metric-row {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}

.metric-row-low {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric {
  padding: 12px 10px;
  text-align: center;
  background: var(--bg-th);
  border-radius: var(--r-sm);
  border-top: 2px solid var(--c-primary);
}

.metric-muted {
  border-top-color: var(--c-info, #5A9BE0);
}

.metric-user {
  border-top-color: var(--c-success);
}

.metric-total {
  border-top-color: var(--bd);
}

.metric-value {
  font-family: var(--font-num, inherit);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--c-primary);
}

.metric-muted .metric-value {
  color: var(--c-info, #5A9BE0);
}

.metric-user .metric-value {
  color: var(--c-success);
}

.metric-total .metric-value {
  color: var(--t-sub);
}

.metric-label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--t-weak);
}

@media (max-width: 1100px) {
  .metric-row {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
