<template>
  <div class="page-container">
    <div class="page-header">
      <h2>固定资产管理</h2>
      <div>
        <el-button type="primary" @click="openAssetDialog()" v-if="activeTab === 'asset' && can('fa:add')">
          <el-icon><Plus /></el-icon>
          新增资产
        </el-button>
        <el-button type="primary" @click="handleCreatePlan" v-if="activeTab === 'inventory' && can('fa:inventory')">
          <el-icon><Plus /></el-icon>
          生成盘点计划
        </el-button>
        <el-button type="primary" @click="handleCreateScheme" v-if="activeTab === 'depreciation' && can('fa:depreciation')">
          <el-icon><Plus /></el-icon>
          新增折旧方案
        </el-button>
      </div>
    </div>
    <el-card class="fill">

      <el-tabs v-model="activeTab">
        <el-tab-pane label="固定资产" name="asset">
          <el-form :inline="true" class="search-form">
            <el-form-item label="关键字">
              <el-input v-model="assetSearch.keyword" placeholder="资产编号/资产名称" clearable style="width: 180px" />
            </el-form-item>
            <el-form-item label="资产类型">
              <el-select v-model="assetSearch.type" placeholder="请选择" clearable style="width: 130px">
                <el-option v-for="t in assetTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="资产状态">
              <el-select v-model="assetSearch.status" placeholder="请选择" clearable style="width: 120px">
                <el-option v-for="s in assetStatusOptions" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="assetPage = 1">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetAssetSearch">重置</el-button>
              <el-button type="primary" @click="openAssetDialog()">
                <el-icon><Plus /></el-icon>
                新增
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedAssetList" style="width: 100%">
            <el-table-column prop="code" label="资产编号" width="120" fixed>
              <template #default="{ row }">
                <el-link type="primary" :underline="false" @click="openAssetDrawer(row)">{{ row.code }}</el-link>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="资产名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="type" label="资产类型" width="100" />
            <el-table-column prop="brand" label="品牌" width="80" />
            <el-table-column prop="model" label="型号" width="110" show-overflow-tooltip />
            <el-table-column prop="location" label="存放地点" width="130" show-overflow-tooltip />
            <el-table-column prop="original" label="资产原值(元)" width="120" align="right">
              <template #default="{ row }">¥{{ row.original.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="net" label="资产净值(元)" width="120" align="right">
              <template #default="{ row }">¥{{ row.net.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="user" label="使用人员" width="90" />
            <el-table-column prop="dept" label="使用部门" width="100" />
            <el-table-column prop="purchaseDate" label="购(建)时间" width="110" />
            <el-table-column prop="status" label="资产状态" width="90">
              <template #default="{ row }">
                <el-tag :type="assetStatusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button v-if="can('fa:edit')" link type="primary" size="small" @click="openAssetDialog(row)">修改</el-button>
                <el-button link type="primary" size="small" @click="downloadAssetQr(row)">下载二维码</el-button>
                <!-- fa:delete 此前定义了却无任何消费点。删除安全性由契约保护：
                     存在任意一类业务单据的资产由服务端拒绝，前端无需重复校验 -->
                <el-button v-if="can('fa:delete')" link type="danger" size="small" @click="deleteAsset(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="assetPage"
              v-model:page-size="assetPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="assetTotal"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 入库/验收 -->
        <el-tab-pane label="入库/验收" name="inbound">
          <FixedAssetDocList doc-key="inbound" prefix="RK" :perm="can('fa:inbound')" />
        </el-tab-pane>

        <!-- 派发/退库 -->
        <el-tab-pane label="派发/退库" name="dispatch">
          <el-tabs v-model="dispatchSub" type="card" class="sub-tabs">
            <el-tab-pane label="分配" name="alloc" />
            <el-tab-pane label="退库" name="back" />
          </el-tabs>
          <FixedAssetDocList :doc-key="dispatchSub" :prefix="dispatchPrefix[dispatchSub]" :perm="can('fa:dispatch')" />
        </el-tab-pane>

        <!-- 借出使用 -->
        <el-tab-pane label="借出使用" name="borrow">
          <FixedAssetDocList doc-key="borrow" prefix="JC" :perm="can('fa:borrow')" />
        </el-tab-pane>

        <!-- 资产变更 -->
        <el-tab-pane label="资产变更" name="change">
          <FixedAssetDocList doc-key="change" prefix="BG" :perm="can('fa:change')" />
        </el-tab-pane>

        <!-- 资产处置 -->
        <el-tab-pane label="资产处置" name="dispose">
          <el-tabs v-model="disposeSub" type="card" class="sub-tabs">
            <el-tab-pane label="调拨" name="transfer" />
            <el-tab-pane label="维修" name="repair" />
            <el-tab-pane label="处置" name="dispose" />
          </el-tabs>
          <FixedAssetDocList :doc-key="disposeSub" :prefix="disposePrefix[disposeSub]" :perm="can('fa:dispose')" />
        </el-tab-pane>

        <!-- 资产盘点 -->
        <el-tab-pane label="资产盘点" name="inventory">
          <el-tabs v-model="inventorySub" type="card" class="sub-tabs">
            <el-tab-pane label="盘点单" name="docs" />
            <el-tab-pane label="盘点计划" name="plans" />
          </el-tabs>

          <template v-if="inventorySub === 'docs'">
            <el-form :inline="true" class="search-form">
              <el-form-item label="单据编号">
                <el-input v-model="invSearch.docNo" placeholder="请输入单据编号" clearable style="width: 160px" />
              </el-form-item>
              <el-form-item label="公司">
                <el-select v-model="invSearch.company" placeholder="请选择公司" clearable style="width: 200px">
                  <el-option v-for="c in companyOptionList" :key="c.id" :label="c.name" :value="c.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="盘点单状态">
                <el-select v-model="invSearch.status" placeholder="请选择状态" clearable style="width: 160px">
                  <!-- 存编码不存文案：契约声明为 DOC_STATUS 枚举 -->
                  <el-option v-for="s in docStatusOptions" :key="s.value" :label="s.label" :value="s.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="创建时间">
                <el-date-picker
                  v-model="invSearch.createRange"
                  type="daterange"
                  value-format="YYYY-MM-DD"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  style="width: 240px"
                />
              </el-form-item>
              <el-form-item label="完结时间">
                <el-date-picker
                  v-model="invSearch.finishRange"
                  type="daterange"
                  value-format="YYYY-MM-DD"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  style="width: 240px"
                />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="invPage = 1">
                  <el-icon><Search /></el-icon>
                  查询
                </el-button>
                <el-button @click="resetInvSearch">重置</el-button>
                <el-button type="primary" @click="openWizard">
                  <el-icon><Plus /></el-icon>
                  新增盘点
                </el-button>
              </el-form-item>
            </el-form>

            <el-table :data="pagedInvDocs" style="width: 100%">
              <el-table-column prop="docNo" label="单据编号" width="130" fixed>
                <template #default="{ row }">
                  <el-link type="primary" :underline="false" @click="openCheckList(row)">{{ row.docNo }}</el-link>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="盘点名称" min-width="160" show-overflow-tooltip />
              <el-table-column prop="company" label="所属公司" min-width="180" show-overflow-tooltip />
              <el-table-column label="创建时间" width="160" ><template #default="{ row }">{{ formatDateTime(row.createTime) }}</template></el-table-column>
              <el-table-column label="完结时间" width="160">
                <template #default="{ row }">{{ row.finishTime ? formatDateTime(row.finishTime) : '-' }}</template>
              </el-table-column>
              <el-table-column label="资产盘点进展" width="110" align="center">
                <template #default="{ row }">
                  <span class="frac-chip">{{ invItemDone(row) }}/{{ row.items.length }}</span>
                </template>
              </el-table-column>
              <el-table-column label="员工盘点进展" width="110" align="center">
                <template #default="{ row }">
                  <span class="frac-chip">{{ invEmpDone(row) }}/{{ row.counters.length }}</span>
                </template>
              </el-table-column>
              <el-table-column label="备注" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ row.remark || '-' }}</template>
              </el-table-column>
              <el-table-column prop="status" label="盘点单状态" width="140">
                <template #default="{ row }">
                  <el-tag :type="invStatusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="380" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click="openCheckList(row)">盘点清单</el-button>
                  <el-button link type="primary" size="small" @click="openCounters(row)">盘点员</el-button>
                  <el-button link type="primary" size="small" @click="viewDocApproval(row)">审批信息</el-button>
                  <el-button v-if="canSubmitInvDoc(row)" link type="primary" size="small" @click="submitInvDoc(row)">提交</el-button>
                  <el-button v-if="canApproveInvDoc(row)" link type="success" size="small" @click="approveInvDoc(row)">通过</el-button>
                  <el-button v-if="canApproveInvDoc(row)" link type="danger" size="small" @click="rejectInvDoc(row)">驳回</el-button>
                  <el-button link type="primary" size="small" @click="openDocDialog(row)">修改</el-button>
                  <el-button v-if="can('fa:inventory')" link type="danger" size="small" @click="deleteInvDoc(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>

            <div class="pager">
              <el-pagination
                v-model:current-page="invPage"
                v-model:page-size="invPageSize"
                :page-sizes="[10, 20, 50, 100]"
                :total="invTotal"
                layout="total, sizes, prev, pager, next, jumper"
              />
            </div>
          </template>

          <template v-else>
          <div class="grid-4 kpi-row">
            <div class="kpi-card"><div class="kpi-label">盘点计划</div><div class="kpi-value num">{{ inventoryPlans.length }}</div></div>
            <div class="kpi-card"><div class="kpi-label">进行中</div><div class="kpi-value num" style="color:#e6a23c">{{ inventoryStats.running }}</div></div>
            <div class="kpi-card"><div class="kpi-label">应盘资产</div><div class="kpi-value num">{{ inventoryStats.total }}</div></div>
            <div class="kpi-card"><div class="kpi-label">已盘</div><div class="kpi-value num" style="color:#67c23a">{{ inventoryStats.counted }}</div></div>
            <div class="kpi-card"><div class="kpi-label">盘盈</div><div class="kpi-value num" style="color:var(--c-primary)">{{ inventoryStats.profit }}</div></div>
            <div class="kpi-card"><div class="kpi-label">盘亏</div><div class="kpi-value num" style="color:#f56c6c">{{ inventoryStats.loss }}</div></div>
          </div>

          <el-table :data="inventoryPlans" style="width: 100%">
            <el-table-column prop="planNo" label="计划编号" width="130" />
            <el-table-column prop="planName" label="盘点计划" min-width="160" show-overflow-tooltip />
            <el-table-column prop="scope" label="盘点范围" width="130" />
            <el-table-column prop="counter" label="盘点人" width="90" />
            <el-table-column prop="planDate" label="盘点日期" width="110" />
            <el-table-column label="盘点提醒" width="120">
              <template #default="{ row }">
                <el-tag :type="remindTagType(row)" size="small">{{ remindText(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="盘点进度" min-width="180">
              <template #default="{ row }">
                <el-progress :percentage="progressOf(row)" :status="progressOf(row) === 100 ? 'success' : ''" />
                <span class="progress-text">已盘 {{ countedOf(row) }} / {{ row.items.length }}</span>
              </template>
            </el-table-column>
            <el-table-column label="盘盈/盘亏" width="110">
              <template #default="{ row }">
                <el-tag type="primary" size="small" effect="plain">盈 {{ countResult(row.items, 'SURPLUS') }}</el-tag>
                <el-tag type="danger" size="small" effect="plain" style="margin-left:4px">亏 {{ countResult(row.items, 'LOSS') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="planStatusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" :disabled="row.status === 'DONE'" @click="openInventory(row)">执行盘点</el-button>
                <el-button v-if="can('fa:export')" link type="primary" size="small" @click="exportInventory(row)">报表下载</el-button>
                <el-button v-if="canSubmitPlan(row)" link type="success" size="small" @click="submitInventoryApproval(row)">提交审批</el-button>
                <el-button v-else-if="row.status === 'PROCESSING'" link type="warning" size="small" @click="approveInventory(row)">盘点审批</el-button>
                <el-button v-if="can('fa:inventory')" link type="danger" size="small" @click="deletePlan(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </template>
        </el-tab-pane>

        <!-- 折旧管理 -->
        <el-tab-pane label="折旧管理" name="depreciation">
          <div class="grid-4 kpi-row">
            <div class="kpi-card"><div class="kpi-label">资产原值合计</div><div class="kpi-value num">¥{{ depreciationSummary.original.toLocaleString() }}</div></div>
            <div class="kpi-card"><div class="kpi-label">累计折旧</div><div class="kpi-value num" style="color:#e6a23c">¥{{ depreciationSummary.accumulated.toLocaleString() }}</div></div>
            <div class="kpi-card"><div class="kpi-label">资产净值</div><div class="kpi-value num" style="color:#67c23a">¥{{ depreciationSummary.net.toLocaleString() }}</div></div>
            <div class="kpi-card"><div class="kpi-label">本月计提折旧</div><div class="kpi-value num" style="color:var(--c-primary)">¥{{ depreciationSummary.monthly.toLocaleString() }}</div></div>
          </div>

          <div class="section-title">
            <span>折旧方案配置</span>
            <el-button type="success" plain size="small" @click="runDepreciation">计提本月折旧</el-button>
          </div>
          <el-table :data="depreciationSchemes" style="width: 100%">
            <el-table-column prop="schemeNo" label="方案编号" width="120" />
            <el-table-column prop="schemeName" label="方案名称" min-width="150" show-overflow-tooltip />
            <el-table-column prop="method" label="折旧方式" width="140" />
            <el-table-column prop="years" label="折旧年限" width="100">
              <template #default="{ row }">{{ row.years }} 年</template>
            </el-table-column>
            <el-table-column prop="residualRate" label="残值率" width="90">
              <template #default="{ row }">{{ row.residualRate }}%</template>
            </el-table-column>
            <el-table-column prop="monthlyRate" label="月折旧率" width="100">
              <template #default="{ row }">{{ row.monthlyRate }}%</template>
            </el-table-column>
            <el-table-column prop="applicableCategory" label="适用分类" width="120" />
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-switch v-model="row.enabled" @change="toggleScheme(row)" />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button v-if="can('fa:depreciation')" link type="primary" size="small" @click="editScheme(row)">编辑</el-button>
                <el-button v-if="can('fa:depreciation')" link type="danger" size="small" @click="deleteScheme(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="section-title" style="margin-top:24px">
            <span>资产折旧台账</span>
            <el-button v-if="can('fa:export')" type="primary" plain size="small" @click="exportDepreciationLedger">导出台账</el-button>
          </div>
          <el-table :data="depreciationLedger" style="width: 100%">
            <el-table-column prop="assetNo" label="资产编号" width="120" />
            <el-table-column prop="assetName" label="资产名称" min-width="160" show-overflow-tooltip />
            <el-table-column prop="category" label="分类" width="100" />
            <el-table-column prop="department" label="使用部门" width="110" />
            <el-table-column prop="inboundDate" label="入库日期" width="110" />
            <el-table-column prop="original" label="资产原值" width="130">
              <template #default="{ row }">¥{{ row.original.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="schemeName" label="折旧方案" min-width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="row.schemeName === '未配置'" type="danger" size="small" effect="plain">未配置</el-tag>
                <span v-else>{{ row.schemeName }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="months" label="已计提月数" width="100" />
            <el-table-column prop="monthly" label="月折旧额" width="120">
              <template #default="{ row }">¥{{ row.monthly.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="130">
              <template #default="{ row }">¥{{ row.accumulated.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="net" label="资产净值" min-width="130">
              <template #default="{ row }">¥{{ row.net.toLocaleString() }}</template>
            </el-table-column>
          </el-table>

          <div class="section-title" style="margin-top:24px">
            <span>折旧计提报表</span>
            <el-button v-if="can('fa:export')" type="primary" plain size="small" @click="exportDepreciation">导出折旧报表</el-button>
          </div>
          <el-table :data="depreciationReports" style="width: 100%" show-summary :summary-method="depreciationSummaries">
            <el-table-column prop="period" label="折旧期间" width="120" />
            <el-table-column prop="openingValue" label="期初原值" width="140">
              <template #default="{ row }">¥{{ row.openingValue.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="periodDepreciation" label="本期折旧" width="140">
              <template #default="{ row }">¥{{ row.periodDepreciation.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="140">
              <template #default="{ row }">¥{{ row.accumulated.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="closingNet" label="期末净值" width="140">
              <template #default="{ row }">¥{{ row.closingNet.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="assetCount" label="计提资产数" width="110" />
            <el-table-column prop="operator" label="计提人" width="100" />
            <el-table-column prop="runDate" label="计提日期" min-width="120" />
          </el-table>

          <div class="section-title" style="margin-top:24px"><span>分类折旧统计</span></div>
          <el-table :data="categoryDepreciation" style="width: 100%">
            <el-table-column prop="category" label="资产分类" width="140" />
            <el-table-column prop="count" label="资产数量" width="110" />
            <el-table-column prop="original" label="原值合计" width="160">
              <template #default="{ row }">¥{{ row.original.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="160">
              <template #default="{ row }">¥{{ row.accumulated.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="net" label="净值" min-width="160">
              <template #default="{ row }">¥{{ row.net.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="折旧进度" min-width="160">
              <template #default="{ row }">
                <el-progress :percentage="row.rate" />
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 生成盘点计划对话框 -->
    <el-dialog v-model="planDialogVisible" title="生成盘点计划" width="560px">
      <el-form :model="planForm" label-width="100px">
        <el-form-item label="计划名称" required>
          <el-input v-model="planForm.planName" placeholder="如：2026年三季度固定资产盘点" />
        </el-form-item>
        <el-form-item label="盘点范围" required>
          <el-radio-group v-model="planForm.scopeType">
            <el-radio value="全部">全部资产</el-radio>
            <el-radio value="分类">按分类</el-radio>
            <el-radio value="部门">按使用部门</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="资产分类" v-if="planForm.scopeType === '分类'">
          <el-select v-model="planForm.scopeValue" placeholder="请选择分类" style="width:100%">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用部门" v-if="planForm.scopeType === '部门'">
          <el-select v-model="planForm.scopeValue" placeholder="请选择部门" style="width:100%">
            <el-option v-for="d in departmentOptions" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="盘点人" required>
          <el-select v-model="planForm.counter" placeholder="请选择盘点人" style="width:100%">
            <el-option v-for="u in counterOptions" :key="u" :label="u" :value="u" />
          </el-select>
        </el-form-item>
        <el-form-item label="盘点日期" required>
          <el-date-picker v-model="planForm.planDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
        </el-form-item>
        <el-form-item label="盘点方式">
          <el-checkbox-group v-model="planForm.methods">
            <el-checkbox value="小程序扫码">小程序扫码</el-checkbox>
            <el-checkbox value="PC手动">PC手动</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="预计应盘">
          <span class="plan-hint">{{ planPreviewCount }} 项资产将纳入本次盘点计划</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="planDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitPlan">生成计划并推送工单</el-button>
      </template>
    </el-dialog>

    <!-- 执行盘点抽屉 -->
    <el-drawer v-model="inventoryDrawerVisible" title="执行盘点" size="60%">
      <template v-if="currentPlan">
        <el-descriptions :column="3" border size="small" style="margin-bottom:16px">
          <el-descriptions-item label="计划编号">{{ currentPlan.planNo }}</el-descriptions-item>
          <el-descriptions-item label="盘点人">{{ currentPlan.counter }}</el-descriptions-item>
          <el-descriptions-item label="盘点日期">{{ currentPlan.planDate }}</el-descriptions-item>
          <el-descriptions-item label="盘点范围" :span="2">{{ currentPlan.scope }}</el-descriptions-item>
          <el-descriptions-item label="当前进度">{{ progressOf(currentPlan) }}%</el-descriptions-item>
        </el-descriptions>

        <div class="inventory-toolbar">
          <el-button type="primary" size="small" @click="batchScanCount">一键扫码盘点（未盘）</el-button>
          <el-button type="warning" size="small" @click="addProfitItem">登记盘盈资产</el-button>
          <el-tag type="info" effect="plain">已盘 {{ countedOf(currentPlan) }} / {{ currentPlan.items.length }}</el-tag>
        </div>

        <el-table :data="currentPlan.items" style="width:100%" max-height="460">
          <el-table-column prop="assetNo" label="资产编号" width="120" />
          <el-table-column prop="assetName" label="资产名称" min-width="150" show-overflow-tooltip />
          <el-table-column prop="department" label="使用部门" width="110" />
          <el-table-column prop="location" label="存放位置" min-width="130" show-overflow-tooltip />
          <el-table-column prop="user" label="使用人" width="90" />
          <el-table-column label="盘点结果" width="100">
            <template #default="{ row }">
              <el-tag :type="resultType(row.result)" size="small">{{ labelOf('INVENTORY_RESULT', row.result) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="countMethod" label="盘点方式" width="110">
            <template #default="{ row }">{{ row.countMethod || '-' }}</template>
          </el-table-column>
          <el-table-column prop="countTime" label="盘点时间" width="150">
            <template #default="{ row }">{{ row.countTime || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="scanCount(row)">扫码盘点</el-button>
              <el-button link type="primary" size="small" @click="pcCount(row)">PC盘点</el-button>
              <el-button link type="danger" size="small" @click="markLoss(row)">盘亏</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
      <template #footer>
        <el-button @click="inventoryDrawerVisible = false">关闭</el-button>
      </template>
    </el-drawer>

    <!-- 折旧方案对话框 -->
    <el-dialog v-model="schemeDialogVisible" :title="schemeForm.schemeNo ? '编辑折旧方案' : '新增折旧方案'" width="520px">
      <el-form :model="schemeForm" label-width="100px">
        <el-form-item label="方案名称" required>
          <el-input v-model="schemeForm.schemeName" placeholder="如：电子设备年限平均法" />
        </el-form-item>
        <el-form-item label="折旧方式" required>
          <el-select v-model="schemeForm.method" style="width:100%">
            <!-- 存编码不存文案：契约声明为 DEPRECIATION_METHOD 枚举，写中文会校验失败 -->
            <el-option v-for="m in depreciationMethodOptions" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="折旧年限" required>
          <el-input-number v-model="schemeForm.years" :min="1" :max="50" /> 年
        </el-form-item>
        <el-form-item label="残值率" required>
          <el-input-number v-model="schemeForm.residualRate" :min="0" :max="30" :precision="1" :step="0.5" /> %
        </el-form-item>
        <el-form-item label="适用分类" required>
          <el-select v-model="schemeForm.applicableCategory" style="width:100%">
            <el-option label="全部分类" value="全部分类" />
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="月折旧率">
          <span class="plan-hint">{{ computedMonthlyRate }}%（按年限平均法自动测算）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="schemeDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitScheme">保存方案</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assetDialogVisible" :title="assetEditId ? '修改资产' : '新增资产'" width="960px" top="6vh">
      <el-form :model="assetForm" label-width="120px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="资产名称" required>
              <el-input v-model="assetForm.name" maxlength="50" show-word-limit placeholder="请输入资产名称" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="资产类型" required>
              <el-select v-model="assetForm.type" placeholder="请选择资产类型" style="width:100%">
                <el-option v-for="t in assetTypeOptions" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="资产编号">
              <el-input v-model="assetForm.code" maxlength="50" show-word-limit placeholder="不填则自动生成" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="租赁/购买公司">
              <el-select v-model="assetForm.company" placeholder="请选择公司" style="width:100%">
                <el-option v-for="c in companyOptionList" :key="c.id" :label="c.name" :value="c.id" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="品牌">
              <el-input v-model="assetForm.brand" maxlength="50" show-word-limit placeholder="请输入品牌" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="型号">
              <el-input v-model="assetForm.model" maxlength="50" show-word-limit placeholder="请输入型号" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="存放地点">
              <div class="inline-select">
                <el-select v-model="assetForm.location" placeholder="请选择存放地点" style="flex:1">
                  <el-option v-for="l in locationOptions" :key="l" :label="l" :value="l" />
                </el-select>
                <el-button type="primary" plain @click="addLocationOption">新增</el-button>
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="购置/起租时间">
              <el-date-picker v-model="assetForm.purchaseDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="购置金额(含税)">
              <el-input-number v-model="assetForm.amount" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="入库时间">
              <el-date-picker v-model="assetForm.inboundDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="16">
            <el-form-item label="资产图片">
              <el-upload v-model:file-list="assetForm.images" list-type="picture-card" :auto-upload="false" :limit="4">
                <div class="upload-tile">
                  <el-icon><Picture /></el-icon>
                  <span>上传图片</span>
                </div>
              </el-upload>
            </el-form-item>
          </el-col>
        </el-row>
        <div class="section-title"><span>折旧信息</span></div>
        <div class="grid-3">
          <el-form-item label="是否折旧">
            <el-switch v-model="assetForm.depreciate" />
          </el-form-item>
          <template v-if="assetForm.depreciate">
            <el-form-item label="原值">
              <el-input-number v-model="assetForm.original" :min="0" :precision="2" :controls="false" style="width:100%" />
            </el-form-item>
            <el-form-item label="购置方式">
              <el-select v-model="assetForm.purchaseMode" placeholder="请选择购置方式" style="width:100%">
                <el-option v-for="m in purchaseModeOptions" :key="m.value" :label="m.label" :value="m.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="租赁使用期限(月)">
              <el-input-number v-model="assetForm.leaseMonths" :min="1" :max="600" style="width:100%" />
            </el-form-item>
          </template>
        </div>
        <div class="grid-3" v-if="!assetEditId">
          <el-form-item label="新增数量">
            <el-input-number v-model="assetForm.quantity" :min="1" :max="99" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="assetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAssetDialog">确定</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="assetDrawerVisible" size="60%" :with-header="false">
      <template v-if="currentAsset">
        <div class="drawer-head">
          <el-button link type="primary" @click="assetDrawerVisible = false">
            <el-icon><ArrowLeft /></el-icon>
            返回
          </el-button>
          <span class="drawer-title">{{ currentAsset.name }}</span>
          <el-tag :type="assetStatusType(currentAsset.status)" size="small">{{ currentAsset.status }}</el-tag>
        </div>
        <div class="drawer-sub">最后更新时间：{{ currentAsset.updateTime }}</div>
        <div class="qr-box">
          <canvas ref="qrCanvas" width="120" height="120"></canvas>
          <span>资产二维码</span>
        </div>
        <div class="section-title"><span>基础信息</span></div>
        <div class="detail-grid">
          <div class="cell"><div class="label">资产编号</div><div class="value hl">{{ currentAsset.code }}</div></div>
          <div class="cell"><div class="label">资产名称</div><div class="value">{{ currentAsset.name }}</div></div>
          <div class="cell"><div class="label">资产类型</div><div class="value">{{ currentAsset.type }}</div></div>
          <div class="cell"><div class="label">品牌</div><div class="value">{{ currentAsset.brand || '-' }}</div></div>
          <div class="cell"><div class="label">型号</div><div class="value">{{ currentAsset.model || '-' }}</div></div>
          <div class="cell"><div class="label">租赁/购买公司</div><div class="value">{{ currentAsset.company }}</div></div>
          <div class="cell"><div class="label">存放地点</div><div class="value">{{ currentAsset.location }}</div></div>
          <div class="cell"><div class="label">使用人员</div><div class="value">{{ currentAsset.user || '-' }}</div></div>
          <div class="cell"><div class="label">使用部门</div><div class="value">{{ currentAsset.dept || '-' }}</div></div>
          <div class="cell"><div class="label">购(建)时间</div><div class="value">{{ currentAsset.purchaseDate }}</div></div>
          <div class="cell"><div class="label">入库时间</div><div class="value">{{ currentAsset.inboundDate }}</div></div>
          <div class="cell"><div class="label">购置金额(含税)</div><div class="value hl">¥{{ currentAsset.amount.toLocaleString() }}</div></div>
          <div class="cell"><div class="label">资产原值(元)</div><div class="value">¥{{ currentAsset.original.toLocaleString() }}</div></div>
          <div class="cell"><div class="label">资产净值(元)</div><div class="value hl">¥{{ currentAsset.net.toLocaleString() }}</div></div>
          <div class="cell"><div class="label">是否折旧</div><div class="value">{{ currentAsset.depreciate ? '是' : '否' }}</div></div>
          <div class="cell"><div class="label">购置方式</div><div class="value">{{ currentAsset.purchaseMode }}</div></div>
          <div class="cell"><div class="label">租赁使用期限(月)</div><div class="value">{{ currentAsset.leaseMonths }}</div></div>
          <div class="cell"><div class="label">资产状态</div><div class="value">{{ currentAsset.status }}</div></div>
        </div>
        <div class="section-title"><span>操作记录</span></div>
        <el-tabs v-model="assetRecordTab">
          <el-tab-pane label="盘点记录" name="check">
            <el-table :data="assetRecordData.check" size="small" style="width:100%">
              <el-table-column prop="docNo" label="盘点单号" width="140" />
              <el-table-column prop="result" label="盘点结果" width="110" />
              <el-table-column prop="person" label="盘点人" width="100" />
              <el-table-column prop="time" label="盘点时间" min-width="160" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="派发退库" name="dispatch">
            <el-table :data="assetRecordData.dispatch" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="kind" label="类型" width="90" />
              <el-table-column prop="person" label="领用/退库人" width="110" />
              <el-table-column prop="dept" label="部门" width="110" />
              <el-table-column prop="time" label="时间" min-width="160" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="借出使用" name="borrow">
            <el-table :data="assetRecordData.borrow" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="borrower" label="借用人" width="100" />
              <el-table-column prop="borrowTime" label="借出时间" width="120" />
              <el-table-column prop="returnTime" label="归还时间" width="120" />
              <el-table-column label="状态" min-width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产维修" name="repair">
            <el-table :data="assetRecordData.repair" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="fault" label="故障描述" min-width="150" show-overflow-tooltip />
              <el-table-column prop="vendor" label="维修商" width="120" />
              <el-table-column prop="cost" label="维修费用(元)" width="110" />
              <el-table-column label="状态" width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产调拨" name="transfer">
            <el-table :data="assetRecordData.transfer" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="from" label="调出公司" min-width="170" show-overflow-tooltip />
              <el-table-column prop="to" label="调入公司" min-width="170" show-overflow-tooltip />
              <el-table-column prop="time" label="调拨时间" width="160" />
              <el-table-column label="状态" width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产变更" name="change">
            <el-table :data="assetRecordData.change" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="content" label="变更内容" min-width="200" show-overflow-tooltip />
              <el-table-column prop="person" label="操作人" width="100" />
              <el-table-column prop="time" label="变更时间" width="120" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产处置" name="dispose">
            <el-table :data="assetRecordData.dispose" size="small" style="width:100%">
              <el-table-column prop="docNo" label="单据编号" width="140" />
              <el-table-column prop="mode" label="处置方式" width="100" />
              <el-table-column prop="amount" label="处置金额(元)" width="120" />
              <el-table-column prop="time" label="处置时间" width="120" />
              <el-table-column label="状态" min-width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="docDialogVisible" :title="docDialogTitle" width="520px">
      <el-form :model="docForm" label-width="90px">
        <el-form-item label="单据名称">
          <el-input v-model="docForm.name" maxlength="50" show-word-limit placeholder="请输入单据名称" />
        </el-form-item>
        <el-form-item label="所属公司" required>
          <el-select v-model="docForm.company" placeholder="请选择公司" style="width:100%">
            <el-option v-for="c in companyOptionList" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="docForm.remark" type="textarea" :rows="3" maxlength="250" show-word-limit placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="docDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitDocDialog">确定</el-button>
      </template>
    </el-dialog>

    <DocApprovalDialog
      v-model="approvalVisible"
      :doc="approvalDoc"
      doc-key="inventory"
      :ctx="approvalCtx"
      @act="onApprovalAct"
    />

    <el-dialog v-model="wizardVisible" title="新增盘点" width="760px" top="6vh">
      <el-steps :active="wizardStep" align-center finish-status="success" style="margin-bottom:24px">
        <el-step title="基础信息" />
        <el-step title="任务分配" />
        <el-step title="开始盘点" />
      </el-steps>
      <el-form v-show="wizardStep === 0" :model="wizardForm" label-width="100px">
        <el-form-item label="所属公司" required>
          <el-select v-model="wizardForm.company" placeholder="请选择公司" style="width:100%">
            <el-option v-for="c in companyOptionList" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="申请人" required>
          <el-input v-model="wizardForm.applicant" placeholder="请输入申请人" style="width:100%" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="wizardForm.name" maxlength="50" show-word-limit placeholder="请输入盘点名称" />
        </el-form-item>
        <el-form-item label="盘点范围">
          <el-radio-group v-model="wizardForm.scope">
            <el-radio value="全部资产">全部资产</el-radio>
            <el-radio value="按资产类型">按资产类型</el-radio>
            <el-radio value="按存放地点">按存放地点</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="资产类型">
          <el-select v-model="wizardForm.assetTypes" multiple placeholder="请选择资产类型" style="width:100%">
            <el-option v-for="t in categoryOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
      </el-form>
      <div v-show="wizardStep === 1">
        <div class="section-title"><span>任务分配 - 选择盘点员</span></div>
        <el-checkbox-group v-model="wizardForm.counterIds" class="counter-group">
          <el-checkbox v-for="e in empPool" :key="e.name" :value="e.name" border>{{ e.name }}（{{ e.dept }}）</el-checkbox>
        </el-checkbox-group>
        <div class="plan-hint">已选 {{ wizardForm.counterIds.length }} 名盘点员，提交后盘点任务将推送到员工端</div>
      </div>
      <div v-show="wizardStep === 2">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="所属公司">{{ wizardForm.company ? (orgStore.companyName(wizardForm.company) || wizardForm.company) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="申请人">{{ wizardForm.applicant || '-' }}</el-descriptions-item>
          <el-descriptions-item label="盘点名称">{{ wizardForm.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="盘点范围">{{ wizardForm.scope }}</el-descriptions-item>
          <el-descriptions-item label="资产类型">{{ wizardForm.assetTypes.length ? wizardForm.assetTypes.join('、') : '全部' }}</el-descriptions-item>
          <el-descriptions-item label="盘点员">{{ wizardForm.counterIds.length ? wizardForm.counterIds.join('、') : '-' }}</el-descriptions-item>
        </el-descriptions>
        <el-form label-width="110px" style="margin-top:16px">
          <el-form-item label="盘点开始日期" required>
            <el-date-picker v-model="wizardForm.startDate" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" style="width:100%" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="wizardVisible = false">取消</el-button>
        <el-button v-if="wizardStep > 0" @click="wizardStep--">上一步</el-button>
        <el-button v-if="wizardStep < 2" type="primary" @click="wizardNext">下一步</el-button>
        <el-button v-else type="primary" @click="submitWizard">开始盘点</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="checkListVisible" :title="checkListDoc ? `盘点清单 - ${checkListDoc.docNo}` : '盘点清单'" width="1100px" top="5vh">
      <div class="checklist-bar">
        <el-button @click="checkListVisible = false">
          <el-icon><ArrowLeft /></el-icon>
          返回计划列表
        </el-button>
        <div class="chip-row" style="margin-bottom:0">
          <span class="chip-label">盘点状态</span>
          <span
            v-for="k in checkFilterKeys"
            :key="k.value"
            class="chip"
            :class="{ on: checkFilter === k.value }"
            @click="checkFilter = k.value"
          >{{ k.label }}({{ checkCounts[k.value] }})</span>
        </div>
      </div>
      <el-table :data="filteredCheckItems" max-height="480" style="width:100%">
        <el-table-column label="资产信息" align="center">
          <el-table-column prop="assetNo" label="资产编号" width="120" />
          <el-table-column prop="assetName" label="资产名称" min-width="150" show-overflow-tooltip />
          <el-table-column label="资产状态" width="90" ><template #default="{ row }">{{ statusText(row.assetStatus) }}</template></el-table-column>
          <el-table-column prop="location" label="设备所在位置" width="130" show-overflow-tooltip />
        </el-table-column>
        <el-table-column label="盘点单状态" width="100">
          <template #default="{ row }">
            <el-tag :type="itemStatusType(row.itemStatus)" size="small">{{ labelOf('INVENTORY_ITEM_STATUS', row.itemStatus) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="盘点备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="盘点人员" width="90">
          <template #default="{ row }">{{ row.checker || '-' }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="160" ><template #default="{ row }">{{ formatDateTime(row.createTime) }}</template></el-table-column>
        <el-table-column label="盘点时间" width="160">
          <template #default="{ row }">{{ row.checkTime || '-' }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="checkListVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="counterVisible" :title="counterDoc ? `盘点员 - ${counterDoc.docNo}` : '盘点员'" width="700px">
      <el-table :data="counterDoc ? counterDoc.counters : []" size="small" style="width:100%">
        <el-table-column prop="name" label="姓名" width="90" />
        <el-table-column prop="dept" label="部门" width="120" />
        <el-table-column prop="phone" label="联系电话" width="130" />
        <el-table-column label="盘点进度" width="100" align="center">
          <template #default="{ row }">
            <span class="frac-chip">{{ row.done }}/{{ row.assigned }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" min-width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'DONE' ? 'success' : 'primary'" size="small">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="counterVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, ArrowLeft, Picture } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import QRCode from 'qrcode'
import FixedAssetDocList from './FixedAssetDocList.vue'
import DocApprovalDialog from './DocApprovalDialog.vue'
import { genDocNo } from '../../utils/docNo'
import { buildCheckItems } from '../../utils/demoBuilders'
import { useFixedAssetStore } from '../../store/fixedAsset'
import { useOrgStore } from '../../store/org'
import { useUserStore } from '../../store/user'
import { useApprovalStore } from '../../store/approval'
import { optionsOf, labelOf } from '../../constants/enums'
import { formatDateTime } from '../../utils/format'
import {
  getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, runApproval
} from '../../services/approval'

/**
 * 状态展示：数据里存的是编码，展示时按枚举翻译成文案。
 * 依次尝试各业务枚举，未命中时原样返回（兼容已经是文案的视图模型字段）。
 */
const STATUS_ENUM_ORDER = [
  'ASSET_STATUS', 'DOC_STATUS', 'INBOUND_STATUS', 'DISPATCH_STATUS', 'BORROW_STATUS',
  'DISPOSE_STATUS', 'INVENTORY_ITEM_STATUS', 'INVENTORY_COUNTER_STATUS', 'ENABLE_STATUS',
  'CHANGE_TYPE', 'DISPOSE_TYPE', 'PURCHASE_MODE', 'ASSET_CATEGORY'
]
/** 状态筛选：支持按编码或按文案匹配 */
function matchStatus(row, value) {
  if (!value) return true
  return row.status === value || statusText(row.status) === value
}

function statusText(status) {
  if (status === undefined || status === null || status === '') return ''
  for (const name of STATUS_ENUM_ORDER) {
    const text = labelOf(name, status)
    if (text !== status) return text
  }
  return status
}
import { useCollection } from '../../composables/useCollection'
import { COLLECTION } from '../../services'

const fixedAssetStore = useFixedAssetStore()
const userStore = useUserStore()
/** 各单据类型的单号前缀 */
const dispatchPrefix = { alloc: 'FP', back: 'TK' }
const disposePrefix = { transfer: 'DB', repair: 'WX', dispose: 'CZ' }
/** 权限判定：按钮级鉴权 */
const can = code => userStore.can(code)

const orgStore = useOrgStore()
const approvalStore = useApprovalStore()
const route = useRoute()

const activeTab = ref('asset')
const dispatchSub = ref('alloc')
const disposeSub = ref('transfer')
const inventorySub = ref('docs')

/**
 * 深链定位：工作台「去处理」按 ?tab=&sub= 直接落到对应页签
 * 例：/fixed-assets?tab=dispose&sub=repair
 */
function applyDeepLink() {
  const q = route?.query || {}
  if (q.tab) activeTab.value = String(q.tab)
  if (q.sub) {
    if (activeTab.value === 'dispatch') dispatchSub.value = String(q.sub)
    if (activeTab.value === 'dispose') disposeSub.value = String(q.sub)
    if (activeTab.value === 'inventory') inventorySub.value = String(q.sub)
  }
}
onMounted(applyDeepLink)
// 进入台账页时刷新主数据：导入、清空、审批都可能已在别的页面改过资产与单据，
// 而 store 只在应用启动时加载一次，不刷新会看到旧数据。
onMounted(() => {
  fixedAssetStore.loadAll().catch(() => {})
  if (!orgStore.loaded) orgStore.loadAll().catch(() => {})
})
// 同页面内通过 query 切换页签时也要响应（工作台"去处理"跳转）
watch(() => route.query, applyDeepLink)

// 公司口径取自组织架构主数据；主数据尚未加载完成时回落示例值
const FALLBACK_COMPANIES = ['华信科技集团有限公司', '云鼎资产管理有限公司', '恒信融资租赁有限公司', '中天建设集团有限公司']
const companyOptions = computed(() => (orgStore.companyOptions.length ? orgStore.companyOptions : FALLBACK_COMPANIES))
/** 公司下拉：取主数据的 id/name，表单保存公司 ID 而非名称 */
const companyOptionList = computed(() => orgStore.companies.map(c => ({ id: c.id, name: c.name })))
/** 盘点员候选（来自组织架构用户） */
const empPool = computed(() => orgStore.users.map(u => ({
  userId: u.id,
  name: u.name,
  dept: orgStore.deptName(u.deptId) || '-',
  phone: u.phone || '-'
})))
// 分类与购置方式取自统一枚举（value 为编码，label 为文案）
// 枚举选项走 computed：optionsOf 读运行时字典覆盖表，字典改文案后下拉即时刷新
const assetTypeOptions = computed(() => optionsOf('ASSET_CATEGORY'))
const purchaseModeOptions = computed(() => optionsOf('PURCHASE_MODE'))
const assetStatusOptions = computed(() => optionsOf('ASSET_STATUS'))

// ==================== 固定资产台账（盘点/折旧共用数据源） ====================
/** 台账视图模型：取自 store（外键已解析为名称、状态已解析为文案） */
const assetLedger = computed(() => fixedAssetStore.assetLedger.map(a => ({
  assetNo: a.code,
  assetName: a.name,
  category: a.type,
  department: a.dept || '未分配',
  location: a.location || '未指定',
  user: a.user || '未派发',
  quantity: 1,
  unit: '台',
  original: Number(a.original || 0),
  inboundDate: a.inboundDate
})))

const categoryOptions = computed(() => optionsOf('ASSET_CATEGORY').map(o => o.label))
/** 单据 / 盘点计划状态选项：下拉展示中文，落库存编码 */
const docStatusOptions = computed(() => optionsOf('DOC_STATUS'))
const depreciationMethodOptions = computed(() => optionsOf('DEPRECIATION_METHOD'))
const counterOptions = ['张三', '李四', '王五', '赵会计', '钱助理', '孙主管']
const departmentOptions = computed(() => [...new Set(assetLedger.value.map(a => a.department))])

/**
 * 统一 ISO 8601。
 * 原先 toLocaleString 产出 `2026/10/21 09:18:02`（斜杠分隔），连日期正则都不过，
 * 写入 runDate 等字段后必然校验失败。
 */
function nowText() {
  return new Date().toISOString()
}

function downloadCsv(filename, header, rows) {
  const content = '\ufeff' + header.join(',') + '\n' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ==================== 资产盘点 ====================
function buildPlanItems(scopeType, scopeValue) {
  return assetLedger.value
    .filter(a => scopeType === '全部' || (scopeType === '分类' ? a.category === scopeValue : a.department === scopeValue))
    .map(a => ({
      assetNo: a.assetNo,
      assetName: a.assetName,
      category: a.category,
      department: a.department,
      location: a.location,
      user: a.user,
      bookQty: a.quantity,
      result: 'UNCHECKED',
      countMethod: '',
      countTime: '',
      remark: ''
    }))
}

function scopeLabel(scopeType, scopeValue) {
  if (scopeType === '全部') return '全部资产'
  return `${scopeType}：${scopeValue}`
}

const inventoryPlanCol = useCollection(COLLECTION.inventoryPlans)
const inventoryPlans = inventoryPlanCol.items

/**
 * 盘点明细结果统一存 INVENTORY_RESULT 编码：
 * UNCHECKED 未盘 / MATCHED 已盘(账实相符) / SURPLUS 盘盈 / LOSS 盘亏
 * 原先存中文，与种子数据（编码）对不上，导致进度与盘盈亏统计恒为 0。
 */
function countResult(items = [], value) {
  return items.filter(i => i.result === value).length
}

function countedOf(plan) {
  return plan.items.filter(i => i.result === 'MATCHED' || i.result === 'SURPLUS' || i.result === 'LOSS').length
}

function progressOf(plan) {
  if (!plan || !plan.items.length) return 0
  return Math.round(countedOf(plan) / plan.items.length * 100)
}

/** 距盘点日期的天数（负数=已逾期） */
function daysToPlan(row) {
  if (!row?.planDate) return null
  const target = new Date(`${row.planDate}T00:00:00`)
  if (Number.isNaN(target.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

/** 提醒文案：提醒窗口由系统参数 sys.inventory.remind.days 决定 */
function remindText(row) {
  const d = daysToPlan(row)
  if (d === null) return '—'
  if (d < 0) return `已逾期 ${Math.abs(d)} 天`
  if (d === 0) return '今天盘点'
  return `剩 ${d} 天`
}

function remindTagType(row) {
  const d = daysToPlan(row)
  if (d === null) return 'info'
  if (d < 0) return 'danger'
  if (d <= fixedAssetStore.inventoryRemindDays) return 'warning'
  return 'info'
}

const inventoryStats = computed(() => {
  const items = inventoryPlans.value.flatMap(p => p.items)
  return {
    running: inventoryPlans.value.filter(p => p.status !== 'DONE').length,
    total: items.length,
    counted: items.filter(i => i.result === 'MATCHED' || i.result === 'SURPLUS' || i.result === 'LOSS').length,
    profit: countResult(items, 'SURPLUS'),
    loss: countResult(items, 'LOSS')
  }
})

function planStatusType(status) {
  return { 已完成: 'success', 盘点中: 'warning', 待审批: 'primary' }[status] || 'info'
}

function resultType(result) {
  return { MATCHED: 'success', LOSS: 'danger', SURPLUS: 'primary' }[result] || 'info'
}

const planDialogVisible = ref(false)
const planForm = reactive({ planName: '', scopeType: '全部', scopeValue: '', counter: '', planDate: '', methods: ['小程序扫码'] })

const planPreviewCount = computed(() => {
  return assetLedger.value.filter(a =>
    planForm.scopeType === '全部' ||
    (planForm.scopeType === '分类' ? a.category === planForm.scopeValue : a.department === planForm.scopeValue)
  ).length
})

function handleCreatePlan() {
  inventorySub.value = 'plans'
  Object.assign(planForm, { planName: '', scopeType: '全部', scopeValue: '', counter: '', planDate: '', methods: ['小程序扫码'] })
  planDialogVisible.value = true
}

function submitPlan() {
  if (!planForm.planName || !planForm.counter || !planForm.planDate) {
    ElMessage.warning('请填写计划名称、盘点人与盘点日期')
    return
  }
  if (planForm.scopeType !== '全部' && !planForm.scopeValue) {
    ElMessage.warning('请选择盘点范围')
    return
  }
  if (!planForm.methods.length) {
    ElMessage.warning('请至少选择一种盘点方式')
    return
  }
  const items = buildPlanItems(planForm.scopeType, planForm.scopeValue)
  if (!items.length) {
    ElMessage.warning('所选范围内没有可盘点的资产')
    return
  }
  inventoryPlanCol.add({
    planNo: `PD-${new Date().getFullYear()}-${String(inventoryPlans.value.length + 1).padStart(3, '0')}`,
    planName: planForm.planName,
    scope: scopeLabel(planForm.scopeType, planForm.scopeValue),
    counter: planForm.counter,
    planDate: planForm.planDate,
    status: 'DRAFT',
    items
  })
  planDialogVisible.value = false
  ElMessage.success(`盘点计划已生成，${items.length} 项资产工单已推送给 ${planForm.counter}`)
}

const inventoryDrawerVisible = ref(false)
const currentPlan = ref(null)

function openInventory(row) {
  currentPlan.value = row
  inventoryDrawerVisible.value = true
}

function applyCount(row, method, result) {
  row.result = result
  row.countMethod = method
  row.countTime = nowText()
  if (currentPlan.value) inventoryPlanCol.update(currentPlan.value)
}

function scanCount(row) {
  applyCount(row, '小程序扫码', 'MATCHED')
  ElMessage.success(`${row.assetName} 扫码盘点成功`)
}

function pcCount(row) {
  applyCount(row, 'PC手动', 'MATCHED')
  ElMessage.success(`${row.assetName} 已登记盘点`)
}

function markLoss(row) {
  ElMessageBox.prompt('请说明盘亏原因（现场未找到、遗失、报废未销账等）', `标记盘亏 - ${row.assetName}`, {
    inputPlaceholder: '如：现场未找到实物',
    inputValidator: v => (v && v.trim() ? true : '盘亏原因不能为空')
  }).then(({ value }) => {
    row.remark = value
    applyCount(row, '现场核查', 'LOSS')
    ElMessage.warning(`${row.assetName} 已标记盘亏，审批通过后将转入资产处置`)
  }).catch(() => {})
}

function batchScanCount() {
  const pending = currentPlan.value.items.filter(i => i.result === 'UNCHECKED')
  if (!pending.length) {
    ElMessage.info('没有待盘点的资产')
    return
  }
  pending.forEach(i => applyCount(i, '小程序扫码', 'MATCHED'))
  ElMessage.success(`批量扫码盘点完成，本次盘到 ${pending.length} 项资产`)
}

function addProfitItem() {
  ElMessageBox.prompt('请填写账外资产名称（盘盈登记）', '登记盘盈资产', {
    inputPlaceholder: '如：闲置会议桌',
    inputValidator: v => (v && v.trim() ? true : '资产名称不能为空')
  }).then(({ value }) => {
    currentPlan.value.items.unshift({
      assetNo: `PY-${Date.now().toString().slice(-6)}`,
      assetName: value,
      category: '其他',
      department: currentPlan.value.counter + '（现场发现）',
      location: '待确认',
      user: '待确认',
      bookQty: 0,
      result: 'SURPLUS',
      countMethod: '小程序扫码',
      countTime: nowText(),
      remark: '账外资产，需补办入库'
    })
    inventoryPlanCol.update(currentPlan.value)
    ElMessage.success('盘盈资产已登记，审批通过后需补办入库手续')
  }).catch(() => {})
}

function exportInventory(row) {
  downloadCsv(
    `${row.planNo}_盘点报表.csv`,
    ['计划编号', '资产编号', '资产名称', '分类', '使用部门', '存放位置', '使用人', '账面数量', '盘点结果', '盘点方式', '盘点时间', '备注'],
    row.items.map(i => [row.planNo, i.assetNo, i.assetName, i.category, i.department, i.location, i.user, i.bookQty, labelOf('INVENTORY_RESULT', i.result), i.countMethod, i.countTime, i.remark])
  )
  ElMessage.success(`盘点报表 ${row.planNo} 已导出`)
}

function submitInventoryApproval(row) {
  const unfinished = row.items.length - countedOf(row)
  if (unfinished > 0) {
    ElMessage.warning(`还有 ${unfinished} 项资产未盘点，无法提交审批`)
    return
  }
  const loss = countResult(row.items, 'LOSS')
  const profit = countResult(row.items, 'SURPLUS')
  ElMessageBox.confirm(
    `盘点已完成，共 ${row.items.length} 项：盘亏 ${loss} 项、盘盈 ${profit} 项。确认提交盘点结果审批？`,
    '提交审批',
    { type: 'info' }
  ).then(async () => {
    row.status = 'PROCESSING'
    // 落库：原先只改内存对象，刷新后状态回退
    await inventoryPlanCol.update(row)
    ElMessage.success('盘点结果已提交审批')
  }).catch(() => {})
}

/** 草稿 / 被驳回的盘点计划可再次提交审批 */
function canSubmitPlan(row) {
  return row.status === 'DRAFT' || row.status === 'REJECTED'
}

function approveInventory(row) {
  ElMessageBox.confirm(`确认通过盘点计划"${row.planName}"的盘点结果？盘亏资产将转入资产处置。`, '盘点审批', {
    distinguishCancelAndClose: true,
    confirmButtonText: '审批通过',
    cancelButtonText: '驳回',
    type: 'warning'
  }).then(async () => {
    row.status = 'DONE'
    await inventoryPlanCol.update(row)
    const losses = row.items.filter(i => i.result === 'LOSS')
    for (const item of losses) {
      await disposeDocCol.add({
        name: `${item.assetName} 盘亏核销处置`,
        code: genDocNo('CZ', disposeDocCol.items.value.map(d => d.code)),
        companyId: '',
        assetId: '',
        createTime: new Date().toISOString(),
        finishTime: '',
        remark: `盘点盘亏核销：${item.remark || '现场未找到实物'}`,
        status: 'DRAFT'
      })
    }
    // 通知处置单面板刷新
    window.dispatchEvent(new CustomEvent('fams:doc-lists-changed', { detail: 'dispose' }))
    ElMessage.success(losses.length ? `盘点已完成，${losses.length} 项盘亏资产已转入资产处置` : '盘点已完成')
  }).catch(action => {
    if (action !== 'cancel') return
    ElMessageBox.prompt('请填写驳回意见', '盘点审批驳回', {
      inputValidator: v => (v && v.trim() ? true : '驳回意见不能为空')
    }).then(async ({ value }) => {
      row.status = 'REJECTED'
      row.items.forEach(i => {
        if (i.result === 'LOSS' || i.result === 'SURPLUS') {
          i.result = 'UNCHECKED'
          i.countMethod = ''
          i.countTime = ''
          i.remark = `审批驳回：${value}`
        }
      })
      await inventoryPlanCol.update(row)
      ElMessage.warning('审批已驳回，盘盈盘亏项已重置为未盘，请重新核查')
    }).catch(() => {})
  })
}

function deletePlan(row) {
  ElMessageBox.confirm(`确认删除盘点计划"${row.planName}"？`, '删除确认', { type: 'warning' }).then(() => {
    inventoryPlanCol.remove(row)
    ElMessage.success('盘点计划已删除')
  }).catch(() => {})
}

// ==================== 折旧管理 ====================
const depreciationSchemeCol = useCollection(COLLECTION.depreciationSchemes)
const depreciationSchemes = depreciationSchemeCol.items

function schemeFor(category) {
  return depreciationSchemes.value.find(s => s.enabled && (s.applicableCategory === category || s.applicableCategory === '全部分类')) || null
}

const depreciationLedger = computed(() => assetLedger.value.map(a => {
  const s = schemeFor(a.category)
  const cap = s ? a.original * (1 - s.residualRate / 100) : 0
  const monthly = s ? cap / (s.years * 12) : 0
  const months = monthsSince(a.inboundDate, currentPeriod())
  const accumulated = Math.min(Math.round(monthly * months * 100) / 100, Math.round(cap * 100) / 100)
  return {
    ...a,
    schemeName: s ? s.schemeName : '未配置',
    residualRate: s ? s.residualRate : 0,
    years: s ? s.years : 0,
    monthly: Math.round(monthly * 100) / 100,
    months,
    accumulated,
    net: Math.round((a.original - accumulated) * 100) / 100
  }
}))

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthsSince(inboundDate, period) {
  const start = new Date(inboundDate)
  const [y, m] = period.split('-').map(Number)
  return Math.max(0, (y - start.getFullYear()) * 12 + (m - 1 - start.getMonth()))
}

function accumulatedThrough(period) {
  return Math.round(depreciationLedger.value.reduce((sum, a) => {
    const s = schemeFor(a.category)
    if (!s) return sum
    const cap = a.original * (1 - s.residualRate / 100)
    const monthly = cap / (s.years * 12)
    return sum + Math.min(monthly * monthsSince(a.inboundDate, period), cap)
  }, 0) * 100) / 100
}

const totalOriginal = computed(() => Math.round(depreciationLedger.value.reduce((s, a) => s + a.original, 0) * 100) / 100)

const depreciationSummary = computed(() => {
  const original = totalOriginal.value
  const accumulated = Math.round(depreciationLedger.value.reduce((s, a) => s + a.accumulated, 0) * 100) / 100
  return {
    original,
    accumulated,
    net: Math.round((original - accumulated) * 100) / 100,
    monthly: Math.round(depreciationLedger.value.reduce((s, a) => s + a.monthly, 0) * 100) / 100
  }
})

const depreciationReportCol = useCollection(COLLECTION.depreciationReports)
const depreciationReports = depreciationReportCol.items

function prevPeriod(period) {
  const [y, m] = period.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

// 报表数值依赖资产台账，数据在挂载后异步载入，因此改为加载完成后再回填
function enrichReports() {
  if (!depreciationReports.value.length) return
  depreciationReports.value.forEach(report => {
    report.accumulated = accumulatedThrough(report.period)
    report.periodDepreciation = Math.round((report.accumulated - accumulatedThrough(prevPeriod(report.period))) * 100) / 100
    report.closingNet = Math.round((totalOriginal.value - report.accumulated) * 100) / 100
    report.assetCount = depreciationLedger.value.filter(a => schemeFor(a.category)).length
  })
}

watch(depreciationReports, enrichReports, { immediate: true })

function runDepreciation() {
  const period = currentPeriod()
  if (depreciationReports.value.some(r => r.period === period)) {
    ElMessage.warning(`${period} 折旧已计提，请勿重复计提`)
    return
  }
  const accumulated = accumulatedThrough(period)
  const periodAmount = Math.round((accumulated - accumulatedThrough(prevPeriod(period))) * 100) / 100
  depreciationReportCol.add({
    period,
    openingValue: totalOriginal.value,
    periodDepreciation: periodAmount,
    accumulated,
    closingNet: Math.round((totalOriginal.value - accumulated) * 100) / 100,
    assetCount: depreciationLedger.value.filter(a => schemeFor(a.category)).length,
    operator: '管理员',
    runDate: nowText()
  })
  ElMessage.success(`${period} 折旧计提完成，本期计提 ¥${periodAmount.toLocaleString()}`)
}

function exportDepreciation() {
  downloadCsv(
    `固定资产折旧报表_${currentPeriod()}.csv`,
    ['折旧期间', '期初原值', '本期折旧', '累计折旧', '期末净值', '计提资产数', '计提人', '计提日期'],
    depreciationReports.value.map(r => [r.period, r.openingValue, r.periodDepreciation, r.accumulated, r.closingNet, r.assetCount, r.operator, r.runDate])
  )
  ElMessage.success('折旧报表已导出')
}

function exportDepreciationLedger() {
  downloadCsv(
    `固定资产折旧台账_${currentPeriod()}.csv`,
    ['资产编号', '资产名称', '分类', '使用部门', '存放位置', '入库日期', '资产原值', '折旧方案', '已计提月数', '月折旧额', '累计折旧', '资产净值'],
    depreciationLedger.value.map(a => [a.assetNo, a.assetName, a.category, a.department, a.location, a.inboundDate, a.original, a.schemeName, a.months, a.monthly, a.accumulated, a.net])
  )
  ElMessage.success('资产折旧台账已导出')
}

function depreciationSummaries({ columns, data }) {
  return columns.map((col, i) => {
    if (i === 0) return '合计'
    if (['openingValue', 'periodDepreciation', 'accumulated', 'closingNet'].includes(col.property)) {
      return '¥' + data.reduce((s, r) => s + (r[col.property] || 0), 0).toLocaleString()
    }
    return ''
  })
}

const categoryDepreciation = computed(() => {
  const map = {}
  depreciationLedger.value.forEach(a => {
    if (!map[a.category]) map[a.category] = { category: a.category, count: 0, original: 0, accumulated: 0 }
    map[a.category].count += a.quantity
    map[a.category].original += a.original
    map[a.category].accumulated += a.accumulated
  })
  return Object.values(map).map(c => ({
    ...c,
    original: Math.round(c.original * 100) / 100,
    accumulated: Math.round(c.accumulated * 100) / 100,
    net: Math.round((c.original - c.accumulated) * 100) / 100,
    rate: c.original ? Math.round(c.accumulated / c.original * 100) : 0
  }))
})

const schemeDialogVisible = ref(false)
const schemeForm = reactive({ schemeNo: '', schemeName: '', method: 'STRAIGHT_LINE', years: 5, residualRate: 5, applicableCategory: '全部分类' })

const computedMonthlyRate = computed(() => {
  if (!schemeForm.years) return '0.0000'
  return ((1 - schemeForm.residualRate / 100) / (schemeForm.years * 12) * 100).toFixed(4)
})

function handleCreateScheme() {
  Object.assign(schemeForm, { schemeNo: '', schemeName: '', method: 'STRAIGHT_LINE', years: 5, residualRate: 5, applicableCategory: '全部分类' })
  schemeDialogVisible.value = true
}

function editScheme(row) {
  Object.assign(schemeForm, {
    schemeNo: row.schemeNo,
    schemeName: row.schemeName,
    method: row.method,
    years: row.years,
    residualRate: row.residualRate,
    applicableCategory: row.applicableCategory
  })
  schemeDialogVisible.value = true
}

function submitScheme() {
  if (!schemeForm.schemeName) {
    ElMessage.warning('请填写方案名称')
    return
  }
  const monthlyRate = parseFloat(computedMonthlyRate.value)
  if (schemeForm.schemeNo) {
    const target = depreciationSchemes.value.find(s => s.schemeNo === schemeForm.schemeNo)
    Object.assign(target, {
      schemeName: schemeForm.schemeName,
      method: schemeForm.method,
      years: schemeForm.years,
      residualRate: schemeForm.residualRate,
      monthlyRate,
      applicableCategory: schemeForm.applicableCategory
    })
    depreciationSchemeCol.update(target)
    ElMessage.success('折旧方案已更新，折旧台账已按新方案重算')
  } else {
    depreciationSchemeCol.add({
      schemeNo: `ZJ-${String(depreciationSchemes.value.length + 1).padStart(3, '0')}`,
      schemeName: schemeForm.schemeName,
      method: schemeForm.method,
      years: schemeForm.years,
      residualRate: schemeForm.residualRate,
      monthlyRate,
      applicableCategory: schemeForm.applicableCategory,
      enabled: true
    })
    ElMessage.success('折旧方案创建成功')
  }
  schemeDialogVisible.value = false
}

async function toggleScheme(row) {
  // v-model 已把 row.enabled 翻到新值；这里负责持久化（失败由 useCollection 回滚本地值）
  try {
    await depreciationSchemeCol.update(row)
    ElMessage.success(`折旧方案"${row.schemeName}"已${row.enabled ? '启用' : '停用'}`)
  } catch (e) {
    ElMessage.error(e?.message || '折旧方案状态保存失败')
  }
}

function deleteScheme(row) {
  ElMessageBox.confirm(`确认删除折旧方案"${row.schemeName}"？删除后对应分类资产将不再计提折旧。`, '删除确认', { type: 'warning' }).then(() => {
    depreciationSchemeCol.remove(row)
    ElMessage.success('折旧方案已删除')
  }).catch(() => {})
}

const inventoryDocCol = useCollection(COLLECTION.inventoryDocs)
/** 处置单集合：盘点盘亏核销时补建处置单 */
const disposeDocCol = useCollection(`${COLLECTION.docListPrefix}-dispose`)
const inventoryDocs = inventoryDocCol.items

const invSearch = reactive({ docNo: '', company: '', status: '', createRange: null, finishRange: null })
const invPage = ref(1)
const invPageSize = ref(15)
watch(invSearch, () => { invPage.value = 1 }, { deep: true })

const filteredInvDocs = computed(() => {
  const cr = invSearch.createRange
  const fr = invSearch.finishRange
  return inventoryDocs.value.filter(d =>
    (!invSearch.docNo || d.docNo.includes(invSearch.docNo)) &&
    (!invSearch.company || d.companyId === invSearch.company) &&
    (!invSearch.status || matchStatus(d, invSearch.status)) &&
    (!cr || cr.length !== 2 || (d.createTime.slice(0, 10) >= cr[0] && d.createTime.slice(0, 10) <= cr[1])) &&
    (!fr || fr.length !== 2 || (!!d.finishTime && d.finishTime.slice(0, 10) >= fr[0] && d.finishTime.slice(0, 10) <= fr[1]))
  )
})

const pagedInvDocs = computed(() => {
  const start = (invPage.value - 1) * invPageSize.value
  // 补出公司名称供表格展示（库里只存 companyId）
  return filteredInvDocs.value.slice(start, start + invPageSize.value)
    .map(d => ({ ...d, company: d.companyId ? (orgStore.companyName(d.companyId) || d.companyId) : '' }))
})

const invTotal = computed(() => filteredInvDocs.value.length)

function resetInvSearch() {
  Object.assign(invSearch, { docNo: '', company: '', status: '', createRange: null, finishRange: null })
  invPage.value = 1
}

function invStatusType(status) {
  const m = { DONE: 'success', PROCESSING: 'primary', DRAFT: 'warning', REJECTED: 'danger', REVOKED: 'info' }
  return m[status] || 'info'
}

function invItemDone(d) {
  return d.items.filter(i => i.itemStatus !== 'UNCHECKED').length
}

function invEmpDone(d) {
  // counters.status 取 INVENTORY_COUNTER_STATUS：COUNTING 盘点中 / DONE 已完成
  return d.counters.filter(c => c.status === 'DONE').length
}

/**
 * 删除资产。
 * 存在任意一类业务单据时服务端会返回 1003 拒绝，这里直接把错误透传给用户即可。
 */
async function deleteAsset(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除资产「${row.assetName}」（${row.assetNo}）？已产生业务单据的资产无法删除。`,
      '删除确认',
      { type: 'warning' }
    )
  } catch (e) {
    return
  }
  try {
    await fixedAssetStore.removeAsset(row.id)
    ElMessage.success('资产已删除')
  } catch (e) {
    ElMessage.error(e.message || '删除失败')
  }
}

function deleteInvDoc(row) {
  ElMessageBox.confirm(`确认删除盘点单"${row.docNo}"？`, '删除确认', { type: 'warning' }).then(() => {
    inventoryDocCol.remove(row)
    ElMessage.success('盘点单已删除')
  }).catch(() => {})
}

const checkListVisible = ref(false)
const checkListDoc = ref(null)
/** 盘点明细状态一律存枚举编码（见 INVENTORY_ITEM_STATUS），筛选也按编码走 */
const checkFilter = ref('ALL')
const checkFilterKeys = [
  { value: 'ALL', label: '全部' },
  { value: 'UNCHECKED', label: '未盘' },
  { value: 'CHECKED', label: '已盘' },
  { value: 'SURPLUS', label: '盘盈' },
  { value: 'LOSS', label: '盘亏' },
  { value: 'ABNORMAL', label: '异常' }
]

const checkCounts = computed(() => {
  const items = checkListDoc.value ? checkListDoc.value.items : []
  const c = { ALL: items.length, UNCHECKED: 0, CHECKED: 0, SURPLUS: 0, LOSS: 0, ABNORMAL: 0 }
  items.forEach(i => { if (c[i.itemStatus] !== undefined) c[i.itemStatus]++ })
  return c
})

const filteredCheckItems = computed(() => {
  const items = checkListDoc.value ? checkListDoc.value.items : []
  return checkFilter.value === 'ALL' ? items : items.filter(i => i.itemStatus === checkFilter.value)
})

function openCheckList(row) {
  checkListDoc.value = row
  checkFilter.value = 'ALL'
  checkListVisible.value = true
}

function itemStatusType(status) {
  const m = { CHECKED: 'success', SURPLUS: 'primary', LOSS: 'danger', ABNORMAL: 'warning', UNCHECKED: 'info' }
  return m[status] || 'info'
}

const counterVisible = ref(false)
const counterDoc = ref(null)

function openCounters(row) {
  counterDoc.value = row
  counterVisible.value = true
}

const wizardVisible = ref(false)
const wizardStep = ref(0)
const wizardForm = reactive({ company: '', applicant: '', name: '', scope: '全部资产', assetTypes: [], counterIds: [], startDate: '' })

function openWizard() {
  Object.assign(wizardForm, { company: '', applicant: '', name: '', scope: '全部资产', assetTypes: [], counterIds: [], startDate: '' })
  wizardStep.value = 0
  wizardVisible.value = true
}

function wizardNext() {
  if (wizardStep.value === 0 && (!wizardForm.company || !wizardForm.applicant || !wizardForm.name)) {
    ElMessage.warning('请填写所属公司、申请人与盘点名称')
    return
  }
  if (wizardStep.value === 1 && wizardForm.counterIds.length === 0) {
    ElMessage.warning('请至少选择一名盘点员')
    return
  }
  wizardStep.value++
}

async function submitWizard() {
  if (!wizardForm.startDate) {
    ElMessage.warning('请选择盘点开始日期')
    return
  }
  const n = wizardForm.counterIds.length
  const total = 6 + n * 3
  const per = Math.ceil(total / n)
  const counters = wizardForm.counterIds.map(name => {
    const e = empPool.find(x => x.name === name) || { name, dept: '-', phone: '-' }
    return { userId: e.userId || '', name: e.name, dept: e.dept, phone: e.phone, assigned: per, done: 0, status: 'COUNTING' }
  })
  const seq = inventoryDocs.value.length + 6
  try {
    await inventoryDocCol.add({
      id: `IV${Date.now()}`,
      docNo: `PD2026${String(1000 + inventoryDocs.value.length * 11).slice(0, 4)}`,
      name: wizardForm.name,
      companyId: wizardForm.company,
      applicant: wizardForm.applicant,
      creatorId: userStore.user?.id || '',
      scope: wizardForm.scope,
      assetTypes: [...wizardForm.assetTypes],
      createTime: new Date().toISOString(),
      finishTime: '',
      remark: `盘点开始日期 ${wizardForm.startDate}`,
      status: 'DRAFT',
      items: buildCheckItems(total, 0, seq * 3, fixedAssetStore.assets),
      counters
    })
  } catch (e) {
    ElMessage.error(e?.message || '盘点任务创建失败')
    return
  }
  wizardVisible.value = false
  inventorySub.value = 'docs'
  invPage.value = 1
  ElMessage.success('盘点任务已创建并推送至盘点员')
}

const docDialogVisible = ref(false)
const docDialogMode = ref('add')
const docForm = reactive({ id: '', name: '', company: '', remark: '' })
const docDialogTitle = computed(() => (docDialogMode.value === 'edit' ? '修改单据' : '新增单据'))

/** 盘点单据的新增/修改（其它单据由 FixedAssetDocList 组件自行处理） */
function openDocDialog(row) {
  docDialogMode.value = row ? 'edit' : 'add'
  Object.assign(docForm, row
    ? { id: row.id, name: row.name || '', company: row.companyId || '', remark: row.remark || '' }
    : { id: '', name: '', company: '', remark: '' })
  docDialogVisible.value = true
}

async function submitDocDialog() {
  if (!docForm.company) {
    ElMessage.warning('请选择所属公司')
    return
  }
  const target = inventoryDocs.value.find(d => d.id === docForm.id)
  if (target) {
    Object.assign(target, { name: docForm.name, companyId: docForm.company, remark: docForm.remark })
    await inventoryDocCol.update(target)
  }
  docDialogVisible.value = false
  ElMessage.success('盘点单已保存')
}

const approvalVisible = ref(false)
const approvalDoc = ref(null)
const approvalCtx = ref({ amount: 0, hasDiff: false })

/** 盘点单的审批上下文：存在盘亏/异常明细即视为"存在盘点差异" */
function invCtx(doc) {
  const items = doc?.items || []
  const hasDiff = items.some(i => i.itemStatus === 'LOSS' || i.itemStatus === 'ABNORMAL' || i.result === 'LOSS' || i.result === 'SURPLUS')
  return { amount: 0, hasDiff }
}

function viewDocApproval(row) {
  approvalDoc.value = row
  approvalCtx.value = invCtx(row)
  approvalVisible.value = true
}

// ---------------- 盘点单审批（按「系统管理 → 流程配置」执行） ----------------
const INV_BIZ = 'INVENTORY'

function invFlow() {
  return getFlow(INV_BIZ, approvalStore.flows)
}
function invCurrent(doc) {
  const flow = invFlow()
  if (!flow) return null
  const steps = effectiveSteps(flow, invCtx(doc))
  const records = approvalsOf(approvalStore.approvals, 'inventory', doc?.id)
  return currentStep(steps, records, orgStore)
}
function canSubmitInvDoc(doc) {
  const flow = invFlow()
  if (!flow) return false
  if (doc.status !== 'DRAFT' && doc.status !== 'REJECTED') return false
  return canSubmit(doc, flow, userStore.user, orgStore)
}
function canApproveInvDoc(doc) {
  if (doc.status !== 'PROCESSING') return false
  const cur = invCurrent(doc)
  if (!cur) return false
  return canApprove(cur.step, userStore.user, orgStore)
}

async function runInvApproval(doc, action, comment = '') {
  if (!approvalStore.loaded) await approvalStore.load()
  const res = await runApproval({
    doc,
    docKey: 'inventory',
    bizType: INV_BIZ,
    action,
    comment,
    ctx: invCtx(doc),
    flows: approvalStore.flows,
    approvals: approvalStore.approvals,
    saveDoc: async next => {
      const target = inventoryDocs.value.find(d => d.id === doc.id)
      if (target) {
        Object.assign(target, next)
        await inventoryDocCol.update(target)
      }
    },
    saveApproval: row => approvalStore.addApproval(row)
  })
  if (res.ok) ElMessage.success(res.message)
  else ElMessage.error(res.message)
  return res
}

async function submitInvDoc(doc) {
  await runInvApproval(doc, 'submit', '提交盘点审批')
}
async function approveInvDoc(doc) {
  await runInvApproval(doc, 'approve', '同意')
}
async function rejectInvDoc(doc) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回意见', '驳回审批', {
      inputValidator: v => (v && v.trim() ? true : '驳回必须填写意见')
    })
    await runInvApproval(doc, 'reject', value.trim())
  } catch (e) {
    // 取消
  }
}

async function onApprovalAct({ action, comment }) {
  const res = await runInvApproval(approvalDoc.value, action, comment)
  if (res.ok) approvalVisible.value = false
}

const locationOptions = ref(['总部办公楼1层', '总部办公楼2层', '总部办公楼3层', '仓库A区', '仓库B区', '车库', '数据中心机房'])

/** 台账取 store 的视图模型：外键已解析为名称、状态已解析为文案 */
const assetList = computed(() => fixedAssetStore.assetLedger)

const assetSearch = reactive({ keyword: '', type: '', status: '' })
const assetPage = ref(1)
const assetPageSize = ref(15)
watch(assetSearch, () => { assetPage.value = 1 }, { deep: true })

const filteredAssetList = computed(() => assetList.value.filter(a =>
  (!assetSearch.keyword || a.code.includes(assetSearch.keyword) || a.name.includes(assetSearch.keyword)) &&
  (!assetSearch.type || a.type === assetSearch.type) &&
  (!assetSearch.status || a.statusCode === assetSearch.status || matchStatus(a, assetSearch.status))
))

const pagedAssetList = computed(() => {
  const start = (assetPage.value - 1) * assetPageSize.value
  return filteredAssetList.value.slice(start, start + assetPageSize.value)
})

const assetTotal = computed(() => filteredAssetList.value.length)

function resetAssetSearch() {
  Object.assign(assetSearch, { keyword: '', type: '', status: '' })
  assetPage.value = 1
}

function assetStatusType(status) {
  const m = {
    IDLE: 'success', IN_USE: 'success', DISPATCHING: 'primary',
    BORROWED: 'warning', REPAIRING: 'danger', DISPOSING: 'info',
    空闲: 'success', 使用中: 'success', 派发中: 'primary', 借出中: 'warning', 维修中: 'danger', 处置中: 'info'
  }
  return m[status] || 'info'
}

const assetDialogVisible = ref(false)
const assetEditId = ref('')
const assetForm = reactive({ name: '', type: '', code: '', company: '', brand: '', model: '', location: '', purchaseDate: '', amount: 0, inboundDate: '', images: [], depreciate: true, original: 0, purchaseMode: 'PURCHASE', leaseMonths: 36, quantity: 1 })

function openAssetDialog(row) {
  assetEditId.value = row ? row.id : ''
  Object.assign(assetForm, row ? {
    name: row.name, type: row.category || row.type || '', code: row.code, company: row.companyId || '', brand: row.brand, model: row.model, location: row.location,
    purchaseDate: row.purchaseDate, amount: row.amount, inboundDate: row.inboundDate, images: [], depreciate: row.depreciate,
    original: row.original, purchaseMode: row.purchaseMode, leaseMonths: row.leaseMonths, quantity: 1
  } : {
    name: '', type: '', code: '', company: '', brand: '', model: '', location: '', purchaseDate: '', amount: 0, inboundDate: '',
    images: [], depreciate: true, original: 0, purchaseMode: 'PURCHASE', leaseMonths: 36, quantity: 1
  })
  assetDialogVisible.value = true
}

function addLocationOption() {
  ElMessageBox.prompt('请输入新的存放地点名称', '新增存放地点', { inputPattern: /\S+/, inputErrorMessage: '存放地点不能为空' }).then(({ value }) => {
    const v = value.trim()
    if (!locationOptions.value.includes(v)) locationOptions.value.push(v)
    assetForm.location = v
    ElMessage.success('存放地点已新增')
  }).catch(() => {})
}

/** 写操作统一处理：失败时提示真实原因，并阻止后续的"成功"提示 */
async function writeDo(fn) {
  try {
    await fn()
    return true
  } catch (e) {
    ElMessage.error(e?.message || '操作失败')
    return false
  }
}

async function submitAssetDialog() {
  if (!assetForm.name || !assetForm.type) {
    ElMessage.warning('请填写资产名称与资产类型')
    return
  }
  const ok = await writeDo(async () => {
    if (assetEditId.value) {
      const original = assetForm.depreciate && assetForm.original ? assetForm.original : assetForm.amount
      await fixedAssetStore.updateAsset(assetEditId.value, {
        name: assetForm.name, category: assetForm.type, code: assetForm.code, companyId: assetForm.company,
        brand: assetForm.brand, model: assetForm.model, location: assetForm.location, purchaseDate: assetForm.purchaseDate,
        amount: assetForm.amount, inboundDate: assetForm.inboundDate, depreciate: assetForm.depreciate, original,
        purchaseMode: assetForm.purchaseMode, leaseMonths: assetForm.leaseMonths
      })
      ElMessage.success('资产已保存')
      return
    }
    for (let i = 0; i < assetForm.quantity; i++) {
      const code = assetForm.code
        ? (assetForm.quantity > 1 ? `${assetForm.code}-${i + 1}` : assetForm.code)
        : undefined
      await fixedAssetStore.addAsset({
        name: assetForm.quantity > 1 ? `${assetForm.name}#${i + 1}` : assetForm.name,
        category: assetForm.type,
        code,
        brand: assetForm.brand,
        model: assetForm.model,
        companyId: assetForm.company || companyOptionList.value[0]?.id || '',
        location: assetForm.location || locationOptions.value[0],
        purchaseDate: assetForm.purchaseDate,
        amount: assetForm.amount,
        inboundDate: assetForm.inboundDate,
        depreciate: assetForm.depreciate,
        original: assetForm.depreciate && assetForm.original ? assetForm.original : assetForm.amount,
        purchaseMode: assetForm.purchaseMode,
        leaseMonths: assetForm.leaseMonths
      })
    }
    assetPage.value = 1
    ElMessage.success(`已新增 ${assetForm.quantity} 条资产`)
  })
  if (!ok) return
  assetDialogVisible.value = false
}

const assetDrawerVisible = ref(false)
const currentAsset = ref(null)
const assetRecordTab = ref('check')
const qrCanvas = ref(null)

function openAssetDrawer(row) {
  currentAsset.value = row
  assetRecordTab.value = 'check'
  assetDrawerVisible.value = true
  nextTick(() => {
    if (qrCanvas.value) {
      const qrData = `资产编号:${row.code}\n资产名称:${row.name}\n品牌型号:${row.brand || ''} ${row.model || ''}\n所属公司:${row.company}\n存放位置:${row.location}`
      QRCode.toCanvas(qrCanvas.value, qrData, { width: 120, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } })
    }
  })
}

function downloadAssetQr(row) {
  const qrData = `资产编号:${row.code}\n资产名称:${row.name}\n品牌型号:${row.brand || ''} ${row.model || ''}\n所属公司:${row.company}\n存放位置:${row.location}`
  QRCode.toDataURL(qrData, { width: 400, margin: 2, color: { dark: '#1a1a1a', light: '#ffffff' } }).then(dataUrl => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `二维码_${row.code}_${new Date().toISOString().slice(0, 10)}.png`
    a.click()
    ElMessage.success(`资产 ${row.code} 二维码已下载`)
  })
}

const assetRecordData = {
  check: [
    { docNo: 'PD202607003', result: '已盘', person: '张志刚', time: '2026-07-15 10:24:00' },
    { docNo: 'PD202604002', result: '已盘', person: '刘洋', time: '2026-04-12 09:40:00' }
  ],
  dispatch: [
    { docNo: 'FP2026880', kind: '派发', person: '张伟', dept: '技术部', time: '2026-03-18 14:10:00' },
    { docNo: 'TK2026860', kind: '退库', person: '张伟', dept: '技术部', time: '2026-08-02 16:30:00' }
  ],
  borrow: [
    { docNo: 'JC2026841', borrower: '李娜', borrowTime: '2026-06-11', returnTime: '2026-06-20', status: '已归还' },
    { docNo: 'JC2026812', borrower: '王强', borrowTime: '2026-09-05', returnTime: '-', status: '借用中' }
  ],
  repair: [
    { docNo: 'WX2026877', fault: '屏幕显示异常，更换排线', vendor: '联想售后', cost: 480, status: '已完成' },
    { docNo: 'WX2026823', fault: '电池续航衰减，需更换电池', vendor: '第三方维修商', cost: 620, status: '维修中' }
  ],
  transfer: [
    { docNo: 'DB2026869', from: '华信科技集团有限公司', to: '云鼎资产管理有限公司', time: '2026-07-28 11:00:00', status: '已完结' },
    { docNo: 'DB2026835', from: '恒信融资租赁有限公司', to: '华信科技集团有限公司', time: '2026-03-16 09:20:00', status: '已完结' }
  ],
  change: [
    { docNo: 'BG2026858', content: '使用部门由行政部变更为技术部', person: '张志刚', time: '2026-05-09 15:44:00' },
    { docNo: 'BG2026820', content: '存放地点调整为总部办公楼2层', person: '刘洋', time: '2026-03-16 09:25:00' }
  ],
  dispose: [
    { docNo: 'CZ2026812', mode: '报废', amount: 0, time: '2026-08-20 10:10:00', status: '审批中' },
    { docNo: 'CZ2026798', mode: '变卖', amount: 1200, time: '2026-02-14 15:02:00', status: '已驳回' }
  ]
}
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 16px;
  font-weight: bold;
}

.search-form {
  margin-bottom: 20px;
}

.kpi-row {
  margin-bottom: 16px;
}

.kpi-card {
  background: #f7f9fc;
  border: 1px solid #E2E8F0;
  border-radius: var(--r-md);
  padding: 12px 16px;
}

.kpi-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
}

.kpi-value {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--c-primary);
}

.progress-text {
  font-size: 12px;
  color: #909399;
}

.inventory-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.plan-hint {
  font-size: 13px;
  color: var(--c-primary);
}

.sub-tabs {
  margin-bottom: 8px;
}

.frac-chip {
  display: inline-block;
  padding: 1px 10px;
  border-radius: 10px;
  background: #e6f7ff;
  color: var(--c-primary);
  font-size: 12px;
  border: 1px solid #91d5ff;
}

.inline-select {
  display: flex;
  gap: 8px;
  width: 100%;
}

.upload-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--t-weak);
}

.drawer-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.drawer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--t-main);
}

.drawer-sub {
  font-size: 12px;
  color: var(--t-weak);
  margin-bottom: 16px;
}

.qr-box {
  width: 132px;
  height: 132px;
  border: 1px dashed #d9d9d9;
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--t-weak);
  font-size: 12px;
  margin-bottom: 16px;
  background: #F5F7FA;
}

.checklist-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.counter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.approval-node {
  font-weight: 600;
  color: var(--t-main);
}

.approval-meta {
  font-size: 12px;
  color: var(--t-weak);
}
</style>
