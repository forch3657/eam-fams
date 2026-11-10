<template>
  <div class="page-container">
    <div class="page-header">
      <h2>固定资产管理</h2>
      <div>
        <el-button type="primary" title="资产登记建档：直接入账为「空闲」，不生成入库单；账外资产的实物入库请在「入库/验收」页签办理" @click="openAssetDialog()" v-if="activeTab === 'asset' && can('fa:add')">
          <el-icon><Plus /></el-icon>
          新增资产
        </el-button>
        <el-button type="primary" @click="handleCreatePlan" v-if="activeTab === 'inventory' && can('fa:inventory')">
          <el-icon><Plus /></el-icon>
          生成盘点计划
        </el-button>

      </div>
    </div>
    <el-card class="fill">

      <el-tabs v-model="activeTab">
        <el-tab-pane v-if="tabVisible('fa:view')" label="固定资产" name="asset">
          <el-form :inline="true" class="search-form asset-search-form">
            <el-form-item label="关键字">
              <el-input v-model="assetSearch.keyword" placeholder="资产编号/资产名称" clearable style="width: 180px" />
            </el-form-item>
            <el-form-item label="使用人员">
              <el-input v-model="assetSearch.user" placeholder="按姓名筛选" clearable style="width: 120px" />
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
              <el-checkbox v-model="assetSearch.mineOnly" border class="mine-only">只看我的资产（{{ myAssetCount }}）</el-checkbox>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="assetPage = 1">
                <el-icon><Search /></el-icon>
                查询
              </el-button>
              <el-button @click="resetAssetSearch">重置</el-button>
              <el-button v-if="can('fa:add')" type="primary" @click="openAssetDialog()">
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
            <el-table-column label="操作" width="330" fixed="right">
              <template #default="{ row }">
                <div class="row-actions">
                  <el-button v-if="can('fa:edit')" link type="primary" size="small" @click="openAssetDialog(row)">修改</el-button>
                  <el-button link type="primary" size="small" @click="downloadAssetQr(row)">下载二维码</el-button>
                  <!-- 台账行级业务入口：期初导入、无前置单据的资产同样按状态直接发起，避免成为死数据 -->
                  <el-dropdown v-if="assetActionsOf(row).length" trigger="click" @command="cmd => startAssetAction(cmd, row)">
                    <el-button link type="primary" size="small">
                      发起业务<el-icon class="action-caret"><ArrowDown /></el-icon>
                    </el-button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item v-for="act in assetActionsOf(row)" :key="act.docKey" :command="act.docKey">
                          {{ act.label }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                  <!-- fa:delete 此前定义了却无任何消费点。删除安全性由契约保护：
                       存在任意一类业务单据的资产由服务端拒绝，前端无需重复校验 -->
                  <el-button v-if="can('fa:delete')" link type="danger" size="small" @click="deleteAsset(row)">删除</el-button>
                </div>
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
        <el-tab-pane v-if="tabVisible('fa:inbound')" label="入库/验收" name="inbound">
          <FixedAssetDocList
            doc-key="inbound" prefix="RK" :perm="canCreateDoc('inbound')"
            :ref="el => bindDocList('inbound', el)"
          />
        </el-tab-pane>

        <!-- 派发/退库：key 必须随子签变化，否则 useCollection 仍绑定初始集合，退库单会写进派发单 -->
        <el-tab-pane v-if="tabVisible('fa:dispatch')" label="派发/退库" name="dispatch">
          <el-tabs v-model="dispatchSub" type="card" class="sub-tabs">
            <el-tab-pane label="分配" name="alloc" />
            <el-tab-pane label="退库" name="back" />
          </el-tabs>
          <FixedAssetDocList
            :key="'dispatch-' + dispatchSub"
            :doc-key="dispatchSub" :prefix="dispatchPrefix[dispatchSub]" :perm="canCreateDoc(dispatchSub)"
            :ref="el => bindDocList(dispatchSub, el)"
          />
        </el-tab-pane>

        <!-- 借出使用 -->
        <el-tab-pane v-if="tabVisible('fa:borrow')" label="借出使用" name="borrow">
          <FixedAssetDocList
            doc-key="borrow" prefix="JC" :perm="canCreateDoc('borrow')"
            :ref="el => bindDocList('borrow', el)"
          />
        </el-tab-pane>

        <!-- 资产变更：调拨 / 维修 / 信息更正三类，同属「在册继续使用」 -->
        <el-tab-pane v-if="tabVisible('fa:change') || tabVisible('fa:dispose') || can('fa:repair')" label="资产变更" name="change">
          <el-tabs v-model="changeSub" type="card" class="sub-tabs">
            <el-tab-pane v-if="tabVisible('fa:dispose') || tabVisible('fa:change')" label="调拨" name="transfer" />
            <el-tab-pane v-if="tabVisible('fa:dispose') || can('fa:repair')" label="维修" name="repair" />
            <el-tab-pane v-if="tabVisible('fa:change')" label="信息更正" name="change" />
          </el-tabs>
          <FixedAssetDocList
            :key="'change-' + changeSub"
            :doc-key="changeSub"
            :prefix="changePrefix[changeSub]"
            :perm="canCreateDoc(changeSub)"
            :ref="el => bindDocList(changeSub, el)"
          />
        </el-tab-pane>

        <!-- 资产处置：报废 / 变卖 / 捐赠 / 转让，四类方式在单据表单里选择 -->
        <el-tab-pane v-if="tabVisible('fa:dispose')" label="资产处置" name="dispose">
          <FixedAssetDocList
            doc-key="dispose" prefix="CZ" :perm="canCreateDoc('dispose')"
            :ref="el => bindDocList('dispose', el)"
          />
        </el-tab-pane>

        <!-- 资产盘点 -->
        <el-tab-pane v-if="tabVisible('fa:inventory')" label="资产盘点" name="inventory">
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
                <el-button v-if="can('fa:inventory')" type="primary" @click="openWizard">
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
              <el-table-column label="盘点差异" width="160" align="center">
                <template #default="{ row }">
                  <el-tag v-if="invDiffOf(row).surplus" type="primary" size="small" effect="plain">盈 {{ invDiffOf(row).surplus }}</el-tag>
                  <el-tag v-if="invDiffOf(row).loss" type="danger" size="small" effect="plain" style="margin-left:4px">亏 {{ invDiffOf(row).loss }}</el-tag>
                  <el-tag v-if="invDiffOf(row).abnormal" type="warning" size="small" effect="plain" style="margin-left:4px">异 {{ invDiffOf(row).abnormal }}</el-tag>
                  <span v-if="!invDiffOf(row).total" style="color:#909399">-</span>
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
                  <el-button v-if="can('fa:inventory') && isDocEditable(row)" link type="primary" size="small" @click="openDocDialog(row)">修改</el-button>
                  <el-button v-if="can('fa:inventory') && canDeleteInvDoc(row)" link type="danger" size="small" @click="deleteInvDoc(row)">删除</el-button>
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
                <el-tag type="primary" size="small" effect="plain">盈 {{ countResult(itemsOfPlan(row), 'SURPLUS') }}</el-tag>
                <el-tag type="danger" size="small" effect="plain" style="margin-left:4px">亏 {{ countResult(itemsOfPlan(row), 'LOSS') }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="planStatusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="230" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" :disabled="row.status === 'PROCESSING' || row.status === 'DONE'" @click="createDocFromPlan(row)">生成盘点单</el-button>
                <el-button v-if="can('fa:export')" link type="primary" size="small" @click="exportInventory(row)">报表下载</el-button>
                <el-button v-if="can('fa:inventory')" link type="danger" size="small" @click="deletePlan(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          </template>
        </el-tab-pane>

        <!-- 折旧管理 -->
        <el-tab-pane v-if="tabVisible('fa:depreciation')" label="折旧管理" name="depreciation">
          <div class="grid-4 kpi-row">
            <div class="kpi-card"><div class="kpi-label">资产原值合计</div><div class="kpi-value num">¥{{ money(planSummary.original) }}</div></div>
            <div class="kpi-card"><div class="kpi-label">累计折旧</div><div class="kpi-value num" style="color:#e6a23c">¥{{ money(planSummary.accumulated) }}</div></div>
            <div class="kpi-card"><div class="kpi-label">资产净值</div><div class="kpi-value num" style="color:#67c23a">¥{{ money(planSummary.net) }}</div></div>
            <div class="kpi-card"><div class="kpi-label">本期计提折旧</div><div class="kpi-value num" style="color:var(--c-primary)">¥{{ money(planSummary.monthly) }}</div></div>
          </div>

          <div class="section-title" style="flex-wrap:wrap;gap:8px">
            <span>折旧计提 <em class="plan-hint">（按「折旧规则 / 折旧计划」自动匹配，统一按月计提；台账为后端计提结果）</em></span>
            <div style="display:flex;align-items:center;gap:8px">
              <el-date-picker v-model="depPeriod" type="month" value-format="YYYY-MM" size="small" style="width:130px" :clearable="false" @change="loadDepreciationPlan" />
              <el-button v-if="can('fa:depreciation')" size="small" @click="previewDepreciation">试算</el-button>
              <el-button v-if="can('fa:depreciation')" type="success" plain size="small" @click="runDepreciation">执行计提</el-button>
              <el-button v-if="can('fa:export')" type="primary" plain size="small" @click="exportDepreciationLedger">导出台账</el-button>
            </div>
          </div>

          <el-table v-loading="planLoading" :data="depreciationPlanRows" style="width: 100%" empty-text="当前期间暂无计提结果，请先执行计提">
            <el-table-column prop="assetNo" label="资产编号" width="120" />
            <el-table-column prop="assetName" label="资产名称" min-width="150" show-overflow-tooltip />
            <el-table-column label="分类" width="100">
              <template #default="{ row }">{{ labelOf('ASSET_CATEGORY', row.assetType) || row.assetType }}</template>
            </el-table-column>
            <el-table-column prop="department" label="使用部门" width="130">
              <template #default="{ row }">{{ orgStore.deptName(row.department) || row.department || '—' }}</template>
            </el-table-column>
            <el-table-column prop="location" label="存放位置" width="110" />
            <el-table-column prop="inboundDate" label="入库日期" width="110">
              <template #default="{ row }">{{ row.inboundDate || '—' }}</template>
            </el-table-column>
            <el-table-column prop="original" label="资产原值" width="130">
              <template #default="{ row }">¥{{ money(row.original) }}</template>
            </el-table-column>
            <el-table-column prop="planName" label="适用规则/计划" min-width="150" show-overflow-tooltip />
            <el-table-column prop="usedLife" label="已提月数" width="90" />
            <el-table-column prop="monthly" label="月折旧额" width="120">
              <template #default="{ row }">¥{{ money(row.monthly) }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="130">
              <template #default="{ row }">¥{{ money(row.accumulated) }}</template>
            </el-table-column>
            <el-table-column prop="netValue" label="资产净值" min-width="130">
              <template #default="{ row }">¥{{ money(row.netValue) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="row.finished ? 'info' : 'success'" size="small" effect="plain">{{ row.finished ? '已提足' : '计提中' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>

          <div v-if="can('fa:depreciation')" class="section-title" style="margin-top:24px">
            <span>折旧计提报表</span>
            <el-button v-if="can('fa:export')" type="primary" plain size="small" @click="exportDepreciation">导出折旧报表</el-button>
          </div>
          <el-table v-if="can('fa:depreciation')" :data="depreciationReports" style="width: 100%" show-summary :summary-method="depreciationSummaries">
            <el-table-column prop="period" label="折旧期间" width="120" />
            <el-table-column prop="openingValue" label="期初原值" width="140">
              <template #default="{ row }">¥{{ money(row.openingValue) }}</template>
            </el-table-column>
            <el-table-column prop="periodDepreciation" label="本期折旧" width="140">
              <template #default="{ row }">¥{{ money(row.periodDepreciation) }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="140">
              <template #default="{ row }">¥{{ money(row.accumulated) }}</template>
            </el-table-column>
            <el-table-column prop="closingNet" label="期末净值" width="140">
              <template #default="{ row }">¥{{ money(row.closingNet) }}</template>
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
              <template #default="{ row }">¥{{ money(row.original) }}</template>
            </el-table-column>
            <el-table-column prop="accumulated" label="累计折旧" width="160">
              <template #default="{ row }">¥{{ money(row.accumulated) }}</template>
            </el-table-column>
            <el-table-column prop="net" label="净值" min-width="160">
              <template #default="{ row }">¥{{ money(row.net) }}</template>
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

    <el-dialog v-model="assetDialogVisible" :title="assetEditId ? '修改资产' : '新增资产'" width="960px" top="6vh">
      <el-alert
        v-if="!assetEditId"
        type="info"
        show-icon
        :closable="false"
        title="此处是「资产登记」：填完即在台账建卡并直接置为「空闲」可用，不生成入库单。账外 / 盘盈资产的实物入库请到「入库/验收」页签办理 WF1 验收。"
        style="margin-bottom:12px"
      />
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
            <el-form-item v-if="assetForm.purchaseMode === 'LEASE'" label="租赁使用期限(月)">
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
          <el-dropdown
            v-if="assetActionsOf(currentAsset).length"
            trigger="click" class="drawer-actions"
            @command="cmd => startAssetAction(cmd, currentAsset)"
          >
            <el-button type="primary" size="small">
              发起业务<el-icon class="action-caret"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="act in assetActionsOf(currentAsset)" :key="act.docKey" :command="act.docKey">
                  {{ act.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
        <div v-if="!assetRecordLoading && recordCount === 0" class="record-empty">
          期初导入，暂无关联单据
        </div>
        <el-tabs v-model="assetRecordTab" v-loading="assetRecordLoading">
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
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="kind" label="类型" width="90" />
              <el-table-column prop="person" label="领用/退库人" width="110" />
              <el-table-column prop="dept" label="部门" width="110" />
              <el-table-column prop="time" label="时间" min-width="160" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="借出使用" name="borrow">
            <el-table :data="assetRecordData.borrow" size="small" style="width:100%">
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="borrower" label="借用人" width="100" />
              <el-table-column prop="borrowTime" label="借出时间" width="120" />
              <el-table-column prop="returnTime" label="归还时间" width="120" />
              <el-table-column label="状态" min-width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产维修" name="repair">
            <el-table :data="assetRecordData.repair" size="small" style="width:100%">
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="fault" label="故障描述" min-width="150" show-overflow-tooltip />
              <el-table-column prop="vendor" label="维修商" width="120" />
              <el-table-column prop="cost" label="维修费用(元)" width="110" />
              <el-table-column label="状态" width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产调拨" name="transfer">
            <el-table :data="assetRecordData.transfer" size="small" style="width:100%">
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="from" label="调出公司" min-width="170" show-overflow-tooltip />
              <el-table-column prop="to" label="调入公司" min-width="170" show-overflow-tooltip />
              <el-table-column prop="time" label="调拨时间" width="160" />
              <el-table-column label="状态" width="90" ><template #default="{ row }">{{ statusText(row.status) }}</template></el-table-column>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产变更" name="change">
            <el-table :data="assetRecordData.change" size="small" style="width:100%">
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="content" label="变更内容" min-width="200" show-overflow-tooltip />
              <el-table-column prop="person" label="操作人" width="100" />
              <el-table-column prop="time" label="变更时间" width="120" />
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="资产处置" name="dispose">
            <el-table :data="assetRecordData.dispose" size="small" style="width:100%">
              <el-table-column label="单据编号" width="140">
                <template #default="{ row }">
                  <el-link v-if="row.docKey" type="primary" :underline="false" @click="openRecordDoc(row)">{{ row.docNo || '-' }}</el-link>
                  <span v-else>{{ row.docNo || '-' }}</span>
                </template>
              </el-table-column>
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

    <!-- 资产详情「操作记录」的单据编号链接：只读查看，审批动作仍在对应业务页签办理 -->
    <DocApprovalDialog
      v-model="recordApprovalVisible"
      :doc="recordApprovalDoc"
      :doc-key="recordApprovalDocKey"
      :assets="fixedAssetStore.assets"
      readonly
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
          <el-select
            v-model="wizardForm.applicant"
            filterable
            :disabled="!wizardForm.company"
            :placeholder="wizardForm.company ? '请选择申请人' : '请先选择所属公司'"
            style="width:100%"
          >
            <el-option v-for="p in applicantOptions" :key="p.userId" :label="`${p.name}（${p.dept}）`" :value="p.name" />
          </el-select>
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
        <el-select
          v-model="wizardForm.counterIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="搜索姓名或部门选择盘点员"
          style="width:100%"
        >
          <el-option v-for="e in empPool" :key="e.userId" :label="`${e.name}（${e.dept}）`" :value="e.name" />
        </el-select>
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

    <el-dialog v-model="checkListVisible" :title="checkListDoc ? `盘点清单 - ${checkListDoc.docNo}` : '盘点清单'" width="1180px" top="5vh">
      <div class="checklist-bar">
        <el-button @click="checkListVisible = false">
          <el-icon><ArrowLeft /></el-icon>
          返回盘点单列表
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
        <div class="checklist-actions">
          <el-button size="small" :disabled="!checkListEditable" @click="addProfitItem">登记账外资产</el-button>
          <el-button type="primary" :disabled="!checkItems.length || !checkListEditable" @click="saveCheckResults">保存盘点结果</el-button>
          <el-button :disabled="!checkItems.length || !checkListEditable" @click="finishCounting">结束盘点</el-button>
        </div>
      </div>
      <div class="plan-hint">
        应盘 {{ checkCounts.ALL }} 项，已盘 {{ checkCounts.ALL - checkCounts.UNCHECKED }} 项，
        差异 {{ checkCounts.SURPLUS + checkCounts.LOSS + checkCounts.ABNORMAL }} 项
        （盘盈 {{ checkCounts.SURPLUS }} / 盘亏 {{ checkCounts.LOSS }} / 异常 {{ checkCounts.ABNORMAL }}）；
        盘盈、盘亏、异常必须填写原因，异常还要选「处理去向」。
        可先保存已登记部分，下次接着盘；提交审批仍需全部明细登记完毕，
        且会校验盘盈明细的建账要素（分类枚举码、数量 1~99、金额、位置、部门/使用人）。
        审批通过后：盘盈自动建账并生成入库单（待入库 → 验收后可用），盘亏在台账置「待核销」并生成处置单，
        异常按去向生成待审维修单 / 变更单（选「已说明」只留痕）。
      </div>
      <el-alert
        v-if="checkListDoc && !checkListEditable"
        type="info"
        show-icon
        :closable="false"
        :title="can('fa:inventory')
          ? '该盘点单已进入审批，明细只读；如需修改请先在盘点单列表撤销审批。'
          : '您没有盘点执行权限，盘点明细只读；核对明细与审批不受影响。'"
        style="margin-bottom:10px"
      />
      <el-table :data="filteredCheckItems" max-height="440" style="width:100%">
        <el-table-column label="资产信息" align="center">
          <el-table-column prop="assetNo" label="资产编号" width="120" />
          <el-table-column prop="assetName" label="资产名称" min-width="140" show-overflow-tooltip />
          <el-table-column label="资产状态" width="90" ><template #default="{ row }">{{ statusText(row.assetStatus) }}</template></el-table-column>
          <el-table-column prop="dept" label="使用部门" width="110" show-overflow-tooltip />
          <el-table-column prop="userName" label="使用人" width="90" />
          <el-table-column prop="location" label="存放位置" width="120" show-overflow-tooltip />
        </el-table-column>
        <el-table-column label="盘点结果" width="130">
          <template #default="{ row }">
            <el-select v-model="row.result" size="small" placeholder="选择结果" style="width:100%" :disabled="!checkListEditable">
              <el-option v-for="r in CHECK_RESULT_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="处理去向" width="130">
          <template #default="{ row }">
            <el-select
              v-if="row.result === 'ABNORMAL'"
              v-model="row.disposal"
              size="small"
              placeholder="选择去向"
              style="width:100%"
              :disabled="!checkListEditable"
            >
              <el-option v-for="o in DISPOSAL_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <span v-else style="color:#909399">-</span>
          </template>
        </el-table-column>
        <el-table-column label="盘点备注" min-width="170">
          <template #default="{ row }">
            <el-input v-model="row.remark" size="small" placeholder="盘盈 / 盘亏 / 异常需填写原因" :disabled="!checkListEditable" />
          </template>
        </el-table-column>
        <el-table-column label="盘点人员" width="90">
          <template #default="{ row }">{{ row.checkerName || row.checker || '-' }}</template>
        </el-table-column>
        <el-table-column label="盘点时间" width="150">
          <template #default="{ row }">{{ row.checkTime ? formatDateTime(row.checkTime) : '-' }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="checkListVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!checkItems.length" @click="saveCheckResults">保存盘点结果</el-button>
      </template>
    </el-dialog>

    <!-- 登记账外资产（盘盈）：要素要齐，盘点完结后据此建账并生成入库单 -->
    <el-dialog v-model="profitDialogVisible" title="登记账外资产（盘盈）" width="560px">
      <el-alert
        type="info"
        show-icon
        :closable="false"
        title="账外资产：现场有、台账上没有。盘点审批通过后自动建档（待入库）并生成入库单，走入库验收流程后转正式可用。提交审批前会校验建账要素，缺项或填了中文分类/部门名会被拦下。"
        style="margin-bottom:12px"
      />
      <el-form :model="profitForm" label-width="100px">
        <el-form-item label="资产名称" required>
          <el-input v-model="profitForm.assetName" placeholder="如：闲置会议桌" maxlength="60" show-word-limit />
        </el-form-item>
        <el-form-item label="资产分类" required>
          <el-select v-model="profitForm.assetType" placeholder="请选择分类" style="width:100%">
            <el-option v-for="c in categoryCodeOptions" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用部门">
          <el-select v-model="profitForm.dept" placeholder="请选择部门" clearable filterable style="width:100%">
            <el-option v-for="d in orgStore.departments" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用人">
          <el-select v-model="profitForm.userId" placeholder="请选择使用人" clearable filterable style="width:100%">
            <el-option v-for="u in orgStore.users" :key="u.id" :label="u.name" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="存放位置" required>
          <el-input v-model="profitForm.location" placeholder="如：总部办公楼2层" maxlength="60" />
        </el-form-item>
        <el-form-item label="数量" required>
          <el-input-number v-model="profitForm.qty" :min="1" :max="99" :precision="0" controls-position="right" />
          <span class="muted hint" style="margin-left:8px">1~99 件，每件单独建一条台账；超出请分多条登记</span>
        </el-form-item>
        <el-form-item label="购置金额" required>
          <el-input-number v-model="profitForm.price" :min="0" :precision="2" :controls="false" style="width:200px" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profitDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitProfitItem">登记</el-button>
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
import { Plus, Search, ArrowLeft, ArrowDown, Picture } from '@element-plus/icons-vue'
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
import { useMock } from '../../services'
import { optionsOf, labelOf, DOC_EDITABLE_STATUS } from '../../constants/enums'
import { ASSET_ACTION_DEFS, DOC_WRITE_CODES, OWNER_INITIATED_DOC_KEYS } from '../../constants/assetActions'
import { formatDateTime } from '../../utils/format'
import {
  getFlow, effectiveSteps, approvalsOf, currentStep,
  canSubmit, canApprove, runApproval, isCollabAction, isApproverOfBiz
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
import { dataService, COLLECTION } from '../../services'

const fixedAssetStore = useFixedAssetStore()
const userStore = useUserStore()
/** 各单据类型的单号前缀 */
const dispatchPrefix = { alloc: 'FP', back: 'TK' }
const changePrefix = { transfer: 'DB', repair: 'WX', change: 'BG' }
/** 权限判定：按钮级鉴权 */
const can = code => userStore.can(code)

/**
 * 页签级鉴权：持报表/导出/设置权的管理层与审批人要能在页面上只读浏览全部业务页签
 * （核对单据、查看审批信息都在这里）；普通资产使用人只看自己能办理的页签。
 * 写操作仍由各按钮按对应模块权限码判定，并由后端 PermissionPolicy 独立把关，页签显隐不是安全边界。
 */
const canBrowseAll = computed(() =>
  ['fa:report', 'fa:export', 'fa:settings'].some(code => can(code))
)
const tabVisible = code => canBrowseAll.value || can(code)

/** 盘点单的业务类型（对应流程配置里的 bizType） */
const INV_BIZ = 'INVENTORY'

const orgStore = useOrgStore()
const approvalStore = useApprovalStore()
const route = useRoute()

const activeTab = ref('asset')
const dispatchSub = ref('alloc')
// 只有报修权的使用人默认落在「维修」子签，否则会停在无权的「调拨」上看到空壳列表
const changeSub = ref(tabVisible('fa:dispose') || tabVisible('fa:change') ? 'transfer' : 'repair')
const inventorySub = ref('docs')

/** 当前登录人是否是台账上登记的资产使用人（至少有一台资产在自己名下） */
const hasOwnedAssets = computed(() => {
  const me = userStore.user?.id
  return !!me && fixedAssetStore.assets.some(a => a.userId === me)
})

/** 页签级历史口径：一个 perm 管住对应页签（资产变更下三个子签共用一套） */
function hasTabPerm(docKey) {
  if (docKey === 'inbound') return can('fa:inbound')
  if (docKey === 'alloc' || docKey === 'back') return can('fa:dispatch')
  if (docKey === 'borrow') return can('fa:borrow')
  if (docKey === 'dispose') return can('fa:dispose')
  if (docKey === 'repair') return can('fa:dispose') || can('fa:change') || can('fa:repair')
  return can('fa:dispose') || can('fa:change')
}

/** 页签「新增单据」权限：权限码，或「台账使用人本人发起自己名下资产业务」的兜底授权 */
function canCreateDoc(docKey) {
  return hasTabPerm(docKey) ||
    (OWNER_INITIATED_DOC_KEYS.includes(docKey) && hasOwnedAssets.value)
}

/**
 * 台账行级入口的写权限：与后端 PermissionPolicy.WRITE + AssetOwnerPolicy 同源。
 * 传 row 时按「该资产是否登记在当前用户名下」判定；不传 row 时按「是否有名下资产」判定。
 */
function canWriteDoc(docKey, row) {
  if (can('fa:add') || can('fa:edit')) return true
  if ((DOC_WRITE_CODES[docKey] || []).some(code => can(code))) return true
  if (!OWNER_INITIATED_DOC_KEYS.includes(docKey)) return false
  const me = userStore.user?.id
  if (!me) return false
  return row ? row.userId === me : hasOwnedAssets.value
}

/** 各单据面板实例：供台账行级入口直接打开新增弹窗 */
const docListRefs = {}
function bindDocList(docKey, el) {
  if (el) docListRefs[docKey] = el
}

/** 按资产状态 + 权限列出可办业务；状态编码取自 assetLedger.statusCode */
function assetActionsOf(row) {
  if (!row) return []
  return ASSET_ACTION_DEFS.filter(def =>
    // 传 row：无 fa:* 写权限码的使用人只对「本人名下」资产显示入口，与服务端 AssetOwnerPolicy 同源
    def.statuses.includes(row.statusCode) && canWriteDoc(def.docKey, row))
}

/**
 * 从资产台账直接发起业务：切到对应页签 / 子签，预选资产并打开新增单据弹窗。
 * 期初导入、无前置单据的资产不做任何来源排除——服务端只校验资产状态与审批互斥。
 */
function startAssetAction(docKey, row) {
  const def = ASSET_ACTION_DEFS.find(d => d.docKey === docKey)
  if (!def || !assetActionsOf(row).some(d => d.docKey === docKey)) return
  assetDrawerVisible.value = false
  activeTab.value = def.tab
  if (def.tab === 'dispatch') dispatchSub.value = def.sub
  if (def.tab === 'change') changeSub.value = def.sub
  // 子签切换会按 :key 重建单据面板，待新实例注册 ref 后再打开弹窗
  nextTick(() => nextTick(() => {
    const panel = docListRefs[docKey]
    if (!panel || typeof panel.openCreateWithAsset !== 'function') {
      ElMessage.warning('业务单据面板尚未就绪，请稍后重试')
      return
    }
    panel.openCreateWithAsset(row.id, row.companyId)
  }))
}

/**
 * 深链定位：工作台「去处理」按 ?tab=&sub= 直接落到对应页签
 * 例：/fixed-assets?tab=change&sub=repair
 * 兼容旧链接 ?tab=dispose&sub=repair|transfer：调拨与维修已迁到「资产变更」页签。
 */
function applyDeepLink() {
  const q = route?.query || {}
  if (q.tab) activeTab.value = String(q.tab)
  if (q.sub) {
    const sub = String(q.sub)
    if (activeTab.value === 'dispatch') dispatchSub.value = sub
    if (activeTab.value === 'dispose' && ['repair', 'transfer', 'change'].includes(sub)) {
      activeTab.value = 'change'
    }
    if (activeTab.value === 'change') {
      changeSub.value = tabVisible('fa:dispose') || tabVisible('fa:change') ? sub : 'repair'
    }
    if (activeTab.value === 'inventory') inventorySub.value = sub
  }
}
onMounted(applyDeepLink)
// 进入台账页时刷新主数据：导入、清空、审批都可能已在别的页面改过资产与单据，
// 而 store 只在应用启动时加载一次，不刷新会看到旧数据。
onMounted(() => {
  if (can('fa:view')) fixedAssetStore.loadAll().catch(() => {})
  // 守卫只加载基础三张表；用户表按权限补，无权角色不请求（否则首屏 403）
  if (can('org:user') || can('wm:todo')) orgStore.loadAll({ withUsers: true }).catch(() => {})
  // 流程配置与审批轨迹：盘点单的「当前环节 / 通过 / 驳回」按钮要靠它算，
  // 没有流程配置时按钮恒不显示（审批人只能看到单据却批不了）。
  if (can('wm:todo') || can('sys:workflow')) approvalStore.load().catch(() => {})
})
// 折旧台账是后端产物，进入页签时按当前期间拉取；报表仅折旧执行角色需要
onMounted(() => {
  loadDepreciationPlan()
  if (can('fa:depreciation')) depreciationReportCol.load()
})
watch(activeTab, tab => {
  if (tab !== 'depreciation') return
  loadDepreciationPlan()
  if (can('fa:depreciation')) depreciationReportCol.load()
})
// 同页面内通过 query 切换页签时也要响应（工作台"去处理"跳转）
watch(() => route.query, applyDeepLink)

// 公司口径取自组织架构主数据；主数据尚未加载完成时回落示例值
const FALLBACK_COMPANIES = ['华信科技集团有限公司', '云鼎资产管理有限公司', '恒信融资租赁有限公司', '中天建设集团有限公司']
const companyOptions = computed(() => (orgStore.companyOptions.length ? orgStore.companyOptions : FALLBACK_COMPANIES))
/** 公司下拉：取主数据的 id/name，表单保存公司 ID 而非名称 */
const companyOptionList = computed(() => orgStore.companies.map(c => ({ id: c.id, name: c.name })))
/** E2E 临时账号（username 以 e2e_ 开头）不是业务人员，选人时排除 */
const isTempAccount = u =>
  String(u?.username || '').toLowerCase().startsWith('e2e_') ||
  String(u?.name || '').startsWith('E2E_')
/** 所属公司的在职人员：申请人与盘点员都从这里选，不允许跨公司挑人 */
const companyStaff = computed(() => {
  const companyId = wizardForm.company
  if (!companyId) return []
  return orgStore.users
    .filter(u => u.companyId === companyId && u.status === 'ENABLED')
    // E2E 临时账号不是业务人员，不出现在选人下拉里
    .filter(u => !isTempAccount(u))
    .map(u => ({
      userId: u.id,
      name: u.name,
      dept: orgStore.deptName(u.deptId) || '-',
      phone: u.phone || '-'
    }))
})
/** 申请人候选（所属公司在职人员） */
const applicantOptions = computed(() => companyStaff.value)
/** 盘点员候选（同一公司在职人员） */
const empPool = computed(() => companyStaff.value)
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
  // 分类编码：折旧方案匹配用编码，展示仍用中文 category
  categoryCode: a.category,
  department: a.dept || '未分配',
  location: a.location || '未指定',
  user: a.user || '未派发',
  quantity: 1,
  unit: '台',
  original: Number(a.original || 0),
  inboundDate: a.inboundDate
})))

const categoryOptions = computed(() => optionsOf('ASSET_CATEGORY').map(o => o.label))
/** 需要落编码的场景（如折旧方案适用分类）：展示中文、存编码 */
const categoryCodeOptions = computed(() => optionsOf('ASSET_CATEGORY'))
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
/**
 * 盘点计划的资产明细：取自真实台账（带 assetId，生成盘点单时才能对得上账）。
 * 计划只是事前安排，真正的盘点执行与结论在「盘点单」里做。
 */
function buildPlanItems(scopeType, scopeValue) {
  return fixedAssetStore.assetLedger
    .filter(a => scopeType === '全部' || (scopeType === '分类' ? a.type === scopeValue : a.dept === scopeValue))
    .map(a => ({
      assetId: a.id,
      assetNo: a.code,
      assetName: a.name,
      category: a.type,
      department: a.dept,
      location: a.location,
      user: a.user,
      bookQty: 1,
      result: 'UNCHECKED',
      countMethod: '',
      countTime: '',
      remark: ''
    }))
}

/**
 * 由盘点计划生成盘点单。
 * 计划是事前安排（谁在什么时候盘哪些资产），盘点单才是执行载体：
 * 明细取计划里的真实资产，盘点员沿用计划指定的盘点人，之后走正式审批链。
 */
async function createDocFromPlan(plan) {
  const items = (plan.items || []).map(i => ({
    assetId: i.assetId || '',
    assetNo: i.assetNo,
    assetName: i.assetName,
    assetType: i.category,
    assetStatus: i.assetStatus || '',
    dept: i.department,
    userName: i.user,
    location: i.location,
    itemStatus: 'UNCHECKED',
    result: 'UNCHECKED',
    remark: '',
    checker: '',
    checkerName: '',
    countMethod: '',
    createTime: new Date().toISOString(),
    checkTime: ''
  }))
  if (!items.length) {
    ElMessage.warning('该盘点计划没有资产明细，无法生成盘点单')
    return
  }
  const me = userStore.user || {}
  const counterUser = orgStore.users.find(u => u.name === plan.counter)
  const counters = counterUser
    ? [{
        userId: counterUser.id,
        name: counterUser.name,
        dept: orgStore.deptName(counterUser.deptId) || '-',
        phone: counterUser.phone || '-',
        assigned: items.length,
        done: 0,
        status: 'COUNTING'
      }]
    : []
  try {
    await inventoryDocCol.add({
      docNo: nextInvDocNo(),
      name: plan.planName,
      companyId: me.companyId || companyOptionList.value[0]?.id || '',
      applicant: me.name || '',
      creatorId: me.id || '',
      scope: plan.scope,
      assetTypes: [],
      createTime: new Date().toISOString(),
      finishTime: '',
      remark: `由盘点计划 ${plan.planNo} 生成`,
      status: 'DRAFT',
      items,
      counters
    })
    const target = inventoryPlans.value.find(p => p.id === plan.id)
    if (target) {
      target.status = 'PROCESSING'
      await inventoryPlanCol.update(target)
    }
    activeTab.value = 'inventory'
    inventorySub.value = 'docs'
    ElMessage.success('已生成盘点单，请到「盘点单」分配盘点员并执行盘点')
  } catch (e) {
    ElMessage.error(e?.message || '生成盘点单失败')
  }
}

function scopeLabel(scopeType, scopeValue) {
  if (scopeType === '全部') return '全部资产'
  return `${scopeType}：${scopeValue}`
}

// 盘点数据的可见性：
// - 有 fa:inventory（盘点执行权）：建计划、建盘点单、登记结果；
// - 盘点流程的环节审批人（如审计员 R6）：只读打开盘点单核对明细，否则等于盲批。
const canReadInventory = computed(() =>
  can('fa:inventory') || isApproverOfBiz(INV_BIZ, userStore.user, orgStore, approvalStore.flows)
)
const inventoryPlanCol = useCollection(COLLECTION.inventoryPlans, { enabled: () => canReadInventory.value })
const inventoryPlans = inventoryPlanCol.items

/**
 * 盘点明细结果统一存 INVENTORY_RESULT 编码：
 * UNCHECKED 未盘 / MATCHED 已盘(账实相符) / SURPLUS 盘盈 / LOSS 盘亏
 * 原先存中文，与种子数据（编码）对不上，导致进度与盘盈亏统计恒为 0。
 */
function countResult(items = [], value) {
  return items.filter(i => i.result === value).length
}

/**
 * 盘点明细可能以 JSON 字符串落库，统一解析成数组
 */
function asItems(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * 盘点单 → 来源盘点计划单号。
 *
 * <p>盘点单契约里没有 planId 字段（加字段要改表结构），来源计划写在 remark 里：
 * 「由盘点计划 PD-2026-001 生成」（后端同步计划状态时用同一标记）。</p>
 */
function planNoOfDoc(doc) {
  const m = String(doc?.remark || '').match(/盘点计划\s*([A-Za-z0-9\-]+)/)
  return m ? m[1] : ''
}

/** 某计划生成的全部盘点单 */
function docsOfPlan(plan) {
  const no = String(plan?.planNo || '')
  if (!no) return []
  return inventoryDocs.value.filter(d => planNoOfDoc(d) === no)
}

/**
 * 计划下的盘点明细（带盘点单号）。
 *
 * <p>盘点结果登记在**盘点单**明细上，计划里只有资产范围快照；
 * 直接读计划的 items 会导致进度、盘盈盘亏、导出报表恒为 0。</p>
 */
function itemsOfPlan(plan) {
  return docsOfPlan(plan).flatMap(d => asItems(d.items).map(i => ({ ...i, docNo: d.docNo })))
}

function countedOf(plan) {
  const items = itemsOfPlan(plan)
  if (!items.length) return 0
  return items.filter(i => i.result === 'MATCHED' || i.result === 'SURPLUS' || i.result === 'LOSS').length
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
  // 应盘/已盘/盘盈/盘亏取盘点单明细：结果登记在盘点单上，计划里只有资产范围快照
  const items = inventoryDocs.value.flatMap(d => asItems(d.items))
  const planned = inventoryPlans.value.filter(p => p.status !== 'DONE').length
  return {
    running: planned,
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
const profitDialogVisible = ref(false)
const profitForm = reactive({
  assetName: '', assetType: '', dept: '', userId: '', location: '', qty: 1, price: 0
})
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

/**
 * 盘点计划单号：api 模式交给后端生成，前端按可见列表推算会跨数据范围撞号
 * （两个管理员同一天各建一张计划，必然撞 unique 约束）。
 * mock 演示没有后端，才在前端按当年序号生成。
 */
function nextPlanNo() {
  if (!useMock) return ''
  const year = new Date().getFullYear()
  const head = `PD-${year}-`
  const max = inventoryPlans.value.reduce((m, p) => {
    const no = String(p?.planNo || '')
    if (!no.startsWith(head)) return m
    const n = Number(no.slice(head.length))
    return Number.isFinite(n) ? Math.max(m, n) : m
  }, 0)
  return `${head}${String(max + 1).padStart(3, '0')}`
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
    planNo: nextPlanNo(),
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

function exportInventory(row) {
  // 盘点结果登记在盘点单明细上，计划里只有资产范围快照；导出要用盘点单的结果，
  // 否则报表里「盘点结果」永远是空值。
  const rows = itemsOfPlan(row)
  const source = rows.length ? rows : (row.items || [])
  const header = ['计划编号', '盘点单号', '资产编号', '资产名称', '分类', '使用部门', '存放位置', '使用人', '账面数量', '盘点结果', '盘点方式', '盘点时间', '备注']
  const detail = source.map(i => [row.planNo, i.docNo || '', i.assetNo, i.assetName, i.category, i.department, i.location, i.user, i.bookQty, labelOf('INVENTORY_RESULT', i.result), i.countMethod, i.countTime, i.remark])

  // 差异汇总：验收时可以直接对着清单核对盘盈/盘亏/异常的结论与后续去向，
  // 不必再回系统逐条翻明细。每行仍补齐到与表头相同的列数，保证 CSV 可解析。
  const blank = () => Array(header.length).fill('')
  const countOf = result => source.filter(i => i.result === result).length
  const diffs = source.filter(i => i.result === 'SURPLUS' || i.result === 'LOSS' || i.result === 'ABNORMAL')
  const summary = [
    blank(),
    ['差异汇总', `盘点单号：${source.find(i => i.docNo)?.docNo || ''}`, `计划编号：${row.planNo}`, `期间：${row.planDate || ''}`, '', '', '', '', '', '', '', '', ''],
    ['差异类型', '资产编号', '资产名称', '使用部门', '存放位置', '盘点结果', '处理去向', '原因', '盘点人', '盘点时间', '', '', ''],
    ...diffs.map(i => [
      labelOf('INVENTORY_RESULT', i.result), i.assetNo || '', i.assetName || '',
      i.department || i.dept || '', i.location || '', labelOf('INVENTORY_RESULT', i.result),
      i.result === 'ABNORMAL' ? (labelOf('INVENTORY_DISPOSAL', i.disposal) || '') : '',
      i.remark || '', i.userName || i.user || i.checkerName || '',
      i.countTime || i.checkTime || '', '', '', ''
    ]),
    ['合计', `应盘 ${source.length}`, `已盘 ${source.filter(i => i.result && i.result !== 'UNCHECKED').length}`,
      `盘盈 ${countOf('SURPLUS')}`, `盘亏 ${countOf('LOSS')}`, `异常 ${countOf('ABNORMAL')}`,
      `差异合计 ${diffs.length}`, '', '', '', '', '', '']
  ]
  downloadCsv(`${row.planNo}_盘点报表.csv`, header, [...detail, ...summary])
  ElMessage.success(`盘点报表 ${row.planNo} 已导出（含差异汇总）`)
}

/**
 * 盘点计划不再自带审批：
 * 计划只是事前安排，盘点结论必须由「盘点单」走系统里的盘点审批链
 * （盘点结果确认 → 差异复核 → 审计抽查），否则会出现绕过审批的盘点结论。
 */
function deletePlan(row) {
  ElMessageBox.confirm(`确认删除盘点计划"${row.planName}"？`, '删除确认', { type: 'warning' }).then(() => {
    inventoryPlanCol.remove(row)
    ElMessage.success('盘点计划已删除')
  }).catch(() => {})
}

// ==================== 折旧管理 ====================
// 配置只认「设置页 → 折旧规则 / 折旧计划」，计提与台账全部由后端产出：
// 试算 POST /depreciation/preview、计提 POST /depreciation/run、台账 GET /depreciation/plan。
// 前端不再自算折旧，也不再维护「折旧方案」（已废弃）。

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 保留两位小数；非有限数归零，避免 NaN 在汇总里扩散 */
function round2(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** 金额展示：NaN / Infinity / undefined 一律按 0 输出，杜绝表格出现 ¥NaN */
function money(value) {
  const n = Number(value)
  return (Number.isFinite(n) ? n : 0).toLocaleString()
}

// 计提报表属于折旧执行数据（fa:depreciation），普通角色不加载、不渲染
const depreciationReportCol = useCollection(COLLECTION.depreciationReports, { immediate: false })
const depreciationReports = depreciationReportCol.items

/** 台账期间：默认当月，可切换到历史期间查看已计提结果 */
const depPeriod = ref(currentPeriod())
const depreciationPlanRows = ref([])
const planLoading = ref(false)

/** 后端返回的期间汇总：原值 / 本期折旧 / 累计 / 期末净值 */
const depPlanMeta = ref({ openingValue: 0, periodDepreciation: 0, accumulated: 0, closingNet: 0 })

async function loadDepreciationPlan() {
  planLoading.value = true
  try {
    const res = await dataService.depreciationPlan({ month: depPeriod.value })
    depreciationPlanRows.value = res?.rows || []
    depPlanMeta.value = {
      openingValue: res?.openingValue || 0,
      periodDepreciation: res?.periodDepreciation || 0,
      accumulated: res?.accumulated || 0,
      closingNet: res?.closingNet || 0
    }
  } catch (e) {
    depreciationPlanRows.value = []
    depPlanMeta.value = { openingValue: 0, periodDepreciation: 0, accumulated: 0, closingNet: 0 }
    ElMessage.error(e?.message || '折旧台账加载失败')
  } finally {
    planLoading.value = false
  }
}

const planSummary = computed(() => ({
  original: round2(depPlanMeta.value.openingValue),
  accumulated: round2(depPlanMeta.value.accumulated),
  // 本期折旧取后端汇总，不能用「月折旧额」求和（提足资产月折旧额不为 0）
  monthly: round2(depPlanMeta.value.periodDepreciation),
  net: round2(depPlanMeta.value.closingNet)
}))

const categoryDepreciation = computed(() => {
  const map = {}
  depreciationPlanRows.value.forEach(r => {
    const code = r.assetType || 'OTHER'
    if (!map[code]) {
      map[code] = { category: labelOf('ASSET_CATEGORY', code) || code, count: 0, original: 0, accumulated: 0 }
    }
    map[code].count += 1
    map[code].original += Number(r.original) || 0
    map[code].accumulated += Number(r.accumulated) || 0
  })
  return Object.values(map).map(c => ({
    ...c,
    original: round2(c.original),
    accumulated: round2(c.accumulated),
    net: round2(c.original - c.accumulated),
    rate: c.original ? Math.round(c.accumulated / c.original * 100) : 0
  }))
})

/** 试算：先给金额，再让用户决定是否落库 */
async function previewDepreciation() {
  try {
    const res = await dataService.previewDepreciation(depPeriod.value)
    const count = res?.assetCount ?? 0
    await ElMessageBox.confirm(
      `期间 ${depPeriod.value}：参与计提 ${count} 项资产，本期折旧合计 ¥${money(res?.periodDepreciation)}。是否执行计提？`,
      '折旧试算', { confirmButtonText: '执行计提', cancelButtonText: '取消', type: 'info' }
    )
    await doRunDepreciation()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.message || '折旧试算失败')
  }
}

async function runDepreciation() {
  try {
    await ElMessageBox.confirm(
      `确认对 ${depPeriod.value} 执行折旧计提？同一期间重复计提会覆盖该期间原有明细与报表。`,
      '计提确认', { type: 'warning' }
    )
    await doRunDepreciation()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e?.message || '折旧计提失败')
  }
}

async function doRunDepreciation() {
  const res = await dataService.runDepreciation(depPeriod.value)
  await Promise.all([loadDepreciationPlan(), depreciationReportCol.load()])
  ElMessage.success(`${depPeriod.value} 计提完成：${res?.assetCount ?? 0} 项资产，本期折旧 ¥${money(res?.periodDepreciation)}`)
}

function exportDepreciation() {
  downloadCsv(
    `固定资产折旧报表_${depPeriod.value}.csv`,
    ['折旧期间', '期初原值', '本期折旧', '累计折旧', '期末净值', '计提资产数', '计提人', '计提日期'],
    depreciationReports.value.map(r => [r.period, r.openingValue, r.periodDepreciation, r.accumulated, r.closingNet, r.assetCount, r.operator, r.runDate])
  )
  ElMessage.success('折旧报表已导出')
}

function exportDepreciationLedger() {
  downloadCsv(
    `固定资产折旧台账_${depPeriod.value}.csv`,
    ['资产编号', '资产名称', '分类', '使用部门', '存放位置', '入库日期', '资产原值', '适用规则/计划', '已提月数', '月折旧额', '累计折旧', '资产净值'],
    depreciationPlanRows.value.map(r => [
      r.assetNo, r.assetName, labelOf('ASSET_CATEGORY', r.assetType) || r.assetType,
      orgStore.deptName(r.department) || r.department, r.location, r.inboundDate, r.original, r.planName,
      r.usedLife, r.monthly, r.accumulated, r.netValue
    ])
  )
  ElMessage.success('资产折旧台账已导出')
}

function depreciationSummaries({ columns, data }) {
  return columns.map((col, i) => {
    if (i === 0) return '合计'
    if (['openingValue', 'periodDepreciation', 'accumulated', 'closingNet'].includes(col.property)) {
      return '¥' + money(data.reduce((s, r) => s + (Number(r[col.property]) || 0), 0))
    }
    return ''
  })
}

const inventoryDocCol = useCollection(COLLECTION.inventoryDocs, { enabled: () => canReadInventory.value })
/**
 * 审批人视角的补载：集合的 enabled 只在 onMounted 判一次，
 * 而「本流程审批人」要等流程配置加载完才能判定（审计员 R6），
 * 判定结果从 false 变 true 时补载一次，否则审计员看到的永远是空列表。
 */
watch(canReadInventory, allowed => {
  if (!allowed) return
  inventoryPlanCol.load()
  inventoryDocCol.load()
})
/** 处置单集合：盘点盘亏核销时补建处置单；读权限随台账 fa:view */
const disposeDocCol = useCollection(`${COLLECTION.docListPrefix}-dispose`, { enabled: () => can('fa:view') })
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

/** 盘点差异统计：盘盈 / 盘亏 / 异常（按明细登记结果口径） */
function invDiffOf(doc) {
  const d = { surplus: 0, loss: 0, abnormal: 0, total: 0 }
  ;(doc?.items || []).forEach(i => {
    if (i.result === 'SURPLUS') { d.surplus++; d.total++ }
    else if (i.result === 'LOSS') { d.loss++; d.total++ }
    else if (i.result === 'ABNORMAL' || i.itemStatus === 'ABNORMAL') { d.abnormal++; d.total++ }
  })
  return d
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

/** 已完结盘点单只有系统管理员（R1）可删；审批中 / 已作废一律不可删 */
function canDeleteInvDoc(row) {
  if (['PROCESSING', 'REVOKED'].includes(row.status)) return false
  if (row.status === 'DONE') return (userStore.user?.roleIds || []).includes('R1')
  return true
}

function deleteInvDoc(row) {
  if (!canDeleteInvDoc(row)) {
    ElMessage.warning('审批中或已作废的盘点单不可删除；已完结的单据仅系统管理员可删')
    return
  }
  ElMessageBox.confirm(`确认删除盘点单"${row.docNo}"？`, '删除确认', { type: 'warning' }).then(() => {
    inventoryDocCol.remove(row)
    ElMessage.success('盘点单已删除')
  }).catch(() => {})
}

const checkListVisible = ref(false)
const checkListDoc = ref(null)
/** 盘点清单的本地编辑副本：登记结果先改副本，保存时才写回单据 */
const checkItems = ref([])
/** 盘点结果选项：value 写 result，明细状态 itemStatus 由 result 派生 */
const CHECK_RESULT_OPTIONS = [
  { value: 'MATCHED', label: '账实相符' },
  { value: 'SURPLUS', label: '盘盈' },
  { value: 'LOSS', label: '盘亏' },
  { value: 'ABNORMAL', label: '异常' }
]
const ITEM_STATUS_OF_RESULT = { MATCHED: 'CHECKED', SURPLUS: 'SURPLUS', LOSS: 'LOSS', ABNORMAL: 'ABNORMAL', UNCHECKED: 'UNCHECKED' }
/** 异常处理去向：运行期字典 inventory_disposal 覆盖内置枚举，与后端白名单同源 */
const DISPOSAL_OPTIONS = computed(() => optionsOf('INVENTORY_DISPOSAL'))
const DISPOSAL_VALUES = ['REPAIR', 'CHANGE', 'EXPLAINED']
/** 明细当前状态：优先按已登记的 result 推导，未登记时回退单据里的状态 */
function itemStatusOf(item) {
  return ITEM_STATUS_OF_RESULT[item?.result] || item?.itemStatus || 'UNCHECKED'
}
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
  const c = { ALL: 0, UNCHECKED: 0, CHECKED: 0, SURPLUS: 0, LOSS: 0, ABNORMAL: 0 }
  checkItems.value.forEach(i => {
    const s = itemStatusOf(i)
    if (c[s] !== undefined) c[s]++
    c.ALL++
  })
  return c
})

const filteredCheckItems = computed(() => {
  if (checkFilter.value === 'ALL') return checkItems.value
  return checkItems.value.filter(i => itemStatusOf(i) === checkFilter.value)
})

/**
 * 盘点明细是否可编辑：只有草稿 / 已驳回的单据能改，且必须持有盘点执行权。
 *
 * <p>盘点明细就是审批对象，审批期间改动等于篡改审批依据，
 * 后端对审批中的盘点单也会直接 409，这里同步置灰避免点了才报错。</p>
 *
 * <p>另外要求 fa:inventory：审计员等只读审批人要看明细、能审批，但不能改明细。</p>
 */
const checkListEditable = computed(() => {
  const status = checkListDoc.value?.status
  if (status !== 'DRAFT' && status !== 'REJECTED') return false
  return can('fa:inventory')
})

function openCheckList(row) {
  checkListDoc.value = row
  checkItems.value = (row.items || []).map(i => ({ ...i }))
  checkFilter.value = 'ALL'
  checkListVisible.value = true
}

/** 登记账外资产（盘盈）：现场多出来、台账上没有的资产 */
function addProfitItem() {
  Object.assign(profitForm, {
    assetName: '', assetType: '', dept: '', userId: '', location: '', qty: 1, price: 0
  })
  profitDialogVisible.value = true
}

/**
 * 提交账外资产登记。
 *
 * <p>要素必须齐：盘点审批完结后，后端按这些字段建台账（待入库）并生成入库单，
 * 分类要落枚举码（不是中文名），部门/使用人要是主数据 id，否则台账的枚举 / 引用校验会拒绝这条资产。
 * 单条明细最多 99 件，与后端「送审前置预检」同源；这里先拦一遍，避免用户到送审时才发现。</p>
 */
function submitProfitItem() {
  if (!profitForm.assetName.trim()) {
    ElMessage.warning('请填写资产名称')
    return
  }
  if (!profitForm.assetType) {
    ElMessage.warning('请选择资产分类')
    return
  }
  if (!profitForm.location.trim()) {
    ElMessage.warning('请填写存放位置')
    return
  }
  const qty = Number(profitForm.qty)
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
    ElMessage.warning('盘盈数量须为 1~99 的整数，超出请分多条登记')
    return
  }
  const price = Number(profitForm.price)
  if (!Number.isFinite(price) || price < 0) {
    ElMessage.warning('购置金额须为不小于 0 的数字')
    return
  }
  const me = userStore.user || {}
  const now = new Date().toISOString()
  checkItems.value.unshift({
    assetId: '',
    assetNo: `PY-${String(Date.now()).slice(-6)}`,
    assetName: profitForm.assetName.trim(),
    assetType: profitForm.assetType,
    assetStatus: '',
    dept: profitForm.dept,
    userId: profitForm.userId,
    userName: userNameOf(profitForm.userId),
    location: profitForm.location.trim(),
    qty,
    price,
    itemStatus: 'SURPLUS',
    result: 'SURPLUS',
    remark: '账外资产，盘点完结后建账并补录入库单',
    checker: me.id || '',
    checkerName: me.name || '',
    countMethod: '现场登记',
    createTime: now,
    checkTime: now
  })
  profitDialogVisible.value = false
  ElMessage.success('已登记账外资产，保存后生效')
}

/**
 * 保存盘点结果：把本地副本写回单据，并按盘点员累计进度。
 *
 * <p>支持分批保存：已登记的部分可以先落盘、下次接着盘；送审时后端仍要求
 * 全部明细登记完毕（pendingCheckCount），并校验异常已选处理去向，
 * 因此放开这里的拦截不会绕过审批。盘盈/盘亏/异常仍必须填原因。</p>
 */
async function saveCheckResults() {
  const doc = checkListDoc.value
  if (!doc) return
  const noReason = checkItems.value.find(i =>
    (i.result === 'LOSS' || i.result === 'SURPLUS' || i.result === 'ABNORMAL') && !(i.remark || '').trim()
  )
  if (noReason) {
    const label = CHECK_RESULT_OPTIONS.find(o => o.value === noReason.result)?.label || noReason.result
    ElMessage.warning(`「${noReason.assetNo || noReason.assetName}」标记为${label}时必须填写原因`)
    return
  }
  const now = new Date().toISOString()
  const me = userStore.user || {}
  const items = checkItems.value.map(i => ({
    ...i,
    itemStatus: ITEM_STATUS_OF_RESULT[i.result] || 'UNCHECKED',
    checker: i.checker || me.id || '',
    checkerName: i.checkerName || me.name || '',
    checkTime: i.checkTime || now
  }))
  const target = inventoryDocs.value.find(d => d.id === doc.id)
  if (!target) return
  // done 只统计「该盘点员已登记结果」的明细，且与该盘点员的分派数比较：
  // 旧口径拿单人已盘数去比整单总数，多人分工时永远到不了 DONE。
  const counters = (target.counters || []).map(c => {
    const assigned = Number(c.assigned) || 0
    const done = items.filter(i =>
      i.checker === c.userId && i.result && i.result !== 'UNCHECKED'
    ).length
    return { ...c, done, status: assigned > 0 && done >= assigned ? 'DONE' : 'COUNTING' }
  })
  try {
    Object.assign(target, { items, counters })
    await inventoryDocCol.update(target)
    checkListDoc.value = target
    checkItems.value = items.map(i => ({ ...i }))
    ElMessage.success('盘点结果已保存')
  } catch (e) {
    ElMessage.error(e?.message || '盘点结果保存失败')
  }
}

/** 结束盘点：全部明细已登记结果后，把盘点员标记为已完成并记录完结时间 */
async function finishCounting() {
  const doc = checkListDoc.value
  if (!doc) return
  const pending = checkItems.value.filter(i => !i.result || i.result === 'UNCHECKED').length
  if (pending) {
    ElMessage.warning(`还有 ${pending} 项未盘点，无法结束盘点`)
    return
  }
  // 异常必须有处理去向才能完结（后端送审前置也会拦，这里提前给出可读提示）
  const unresolved = checkItems.value.filter(i =>
    i.result === 'ABNORMAL' && !DISPOSAL_VALUES.includes(i.disposal)
  ).length
  if (unresolved) {
    ElMessage.warning(`还有 ${unresolved} 项异常未选择处理去向，无法结束盘点`)
    return
  }
  const target = inventoryDocs.value.find(d => d.id === doc.id)
  if (!target) return
  try {
    Object.assign(target, {
      counters: (target.counters || []).map(c => ({ ...c, status: 'DONE' })),
      finishTime: new Date().toISOString()
    })
    await inventoryDocCol.update(target)
    checkListDoc.value = target
    ElMessage.success('盘点已结束，可提交审批')
  } catch (e) {
    ElMessage.error(e?.message || '结束盘点失败')
  }
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

// 换公司后人员范围变了：已选的申请人与盘点员都作废，避免留到不属于该公司的旧选择
watch(() => wizardForm.company, () => {
  wizardForm.applicant = ''
  wizardForm.counterIds = []
})

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

/**
 * 按「所属公司 + 资产类型」从资产台账取真实资产生成盘点明细。
 *
 * 明细带资产快照（编号/名称/状态/部门/使用人/位置），
 * 单据脱离主数据后仍可追溯，也能与台账逐项对账。
 */
function buildInventoryItems() {
  const companyId = wizardForm.company
  const types = wizardForm.assetTypes || []
  // 用 store 的完整视图模型：带 id / companyId / 状态编码，明细才能与台账逐项对账
  const list = fixedAssetStore.assetLedger.filter(a => {
    if (companyId && a.companyId !== companyId) return false
    if (wizardForm.scope === '按资产类型' && types.length && !types.includes(a.type)) return false
    return true
  })
  const now = new Date().toISOString()
  return list.map(a => ({
    assetId: a.id,
    assetNo: a.code,
    assetName: a.name,
    assetType: a.type,
    assetStatus: a.statusCode,
    dept: a.dept,
    userName: a.user,
    location: a.location,
    itemStatus: 'UNCHECKED',
    result: 'UNCHECKED',
    remark: '',
    checker: '',
    checkerName: '',
    countMethod: '',
    createTime: now,
    checkTime: ''
  }))
}

/**
 * 盘点单号：api 模式交给后端生成，前端按可见列表推算会跨数据范围撞号
 * （两个管理员同一天各建一张盘点单，必然撞 unique 约束）。
 * mock 演示没有后端，才在前端按当日序号生成。
 */
function nextInvDocNo() {
  if (!useMock) return ''
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const used = inventoryDocs.value.filter(d => String(d.docNo || '').includes(ymd)).length
  return `PD${ymd}${String(used + 1).padStart(3, '0')}`
}

async function submitWizard() {
  if (!wizardForm.startDate) {
    ElMessage.warning('请选择盘点开始日期')
    return
  }
  if (!wizardForm.counterIds.length) {
    ElMessage.warning('请至少选择一名盘点员')
    return
  }
  const n = wizardForm.counterIds.length
  const seq = inventoryDocs.value.length + 6
  try {
    const items = buildInventoryItems()
    if (!items.length) {
      ElMessage.warning('所选公司 / 资产类型下没有可盘点的资产，请调整盘点范围')
      return
    }
    // empPool 是 computed ref，脚本里必须取 .value 再 find（模板中才是自动解包）
    const counters = wizardForm.counterIds.map(name => {
      const e = empPool.value.find(x => x.name === name) || { name, dept: '-', phone: '-' }
      return { userId: e.userId || '', name: e.name, dept: e.dept, phone: e.phone, assigned: items.length, done: 0, status: 'COUNTING' }
    })
    await inventoryDocCol.add({
      docNo: nextInvDocNo(),
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
      items,
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

/** 只有草稿 / 已驳回可改；与后端 GenericService.assertDocMutable 同源，无状态的历史数据按草稿处理 */
const isDocEditable = row => !row?.status || DOC_EDITABLE_STATUS.includes(row.status)

/** 盘点单据的新增/修改（其它单据由 FixedAssetDocList 组件自行处理） */
function openDocDialog(row) {
  if (row && !isDocEditable(row)) { ElMessage.warning('单据审批中或已完结，不可修改'); return }
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
  if (target && !isDocEditable(target)) { ElMessage.warning('单据已审批或完结，不可修改'); return }
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

function invFlow() {
  return getFlow(INV_BIZ, approvalStore.flows)
}
function invCurrent(doc) {
  const flow = invFlow()
  if (!flow) return null
  const steps = effectiveSteps(flow, invCtx(doc))
  const records = approvalsOf(approvalStore.approvals, 'inventory', doc?.id)
  return currentStep(steps, records, orgStore, doc)
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
  return canApprove(cur.step, userStore.user, orgStore, cur.records, doc)
}

async function runInvApproval(doc, action, comment = '', targetUserId = '') {
  if (!approvalStore.loaded) await approvalStore.load()
  const res = await runApproval({
    doc,
    docKey: 'inventory',
    bizType: INV_BIZ,
    action,
    comment,
    targetUserId,
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
  // 没盘完的盘点单不允许提交审批：否则会出现「空盘点单被审批通过」
  const pending = (doc.items || []).filter(i => !i.result || i.result === 'UNCHECKED').length
  if (pending > 0) {
    ElMessage.warning(`还有 ${pending} 项资产未登记盘点结果，请先在「盘点清单」完成盘点`)
    return
  }
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

async function onApprovalAct({ action, comment, targetUserId }) {
  const res = await runInvApproval(approvalDoc.value, action, comment, targetUserId)
  if (res.ok && !isCollabAction(action)) approvalVisible.value = false
}

const locationOptions = ref(['总部办公楼1层', '总部办公楼2层', '总部办公楼3层', '仓库A区', '仓库B区', '车库', '数据中心机房'])

/** 台账取 store 的视图模型：外键已解析为名称、状态已解析为文案 */
const assetList = computed(() => fixedAssetStore.assetLedger)

const assetSearch = reactive({ keyword: '', user: '', type: '', status: '', mineOnly: false })
const assetPage = ref(1)
const assetPageSize = ref(15)
watch(assetSearch, () => { assetPage.value = 1 }, { deep: true })

/** 当前登录人名下的资产台数，直接按台账 userId 统计，不依赖 org-users 主数据权限 */
const myAssetCount = computed(() => {
  const me = userStore.user?.id
  return me ? assetList.value.filter(a => a.userId === me).length : 0
})

const filteredAssetList = computed(() => {
  const name = (assetSearch.user || '').trim()
  const me = userStore.user?.id
  return assetList.value.filter(a =>
    (!assetSearch.keyword || a.code.includes(assetSearch.keyword) || a.name.includes(assetSearch.keyword)) &&
    // user 是台账视图解析出的姓名；若 org-users 不可读导致姓名为空，退化为按使用人 ID 匹配
    (!name || String(a.user || '').includes(name) || String(a.userId || '').includes(name)) &&
    (!assetSearch.mineOnly || (!!me && a.userId === me)) &&
    (!assetSearch.type || a.type === assetSearch.type) &&
    (!assetSearch.status || a.statusCode === assetSearch.status || matchStatus(a, assetSearch.status))
  )
})

const pagedAssetList = computed(() => {
  const start = (assetPage.value - 1) * assetPageSize.value
  return filteredAssetList.value.slice(start, start + assetPageSize.value)
})

const assetTotal = computed(() => filteredAssetList.value.length)

function resetAssetSearch() {
  Object.assign(assetSearch, { keyword: '', user: '', type: '', status: '', mineOnly: false })
  assetPage.value = 1
}

function assetStatusType(status) {
  const m = {
    IDLE: 'success', IN_USE: 'success', DISPATCHING: 'primary',
    BORROWED: 'warning', REPAIRING: 'danger', DISPOSING: 'info',
    // 待入库：盘盈建账后等验收；待核销：盘亏等处置；已核销：账面上注销
    PENDING_INBOUND: 'warning', PENDING_WRITE_OFF: 'danger', DISPOSED: 'info',
    空闲: 'success', 使用中: 'success', 派发中: 'primary', 借出中: 'warning', 维修中: 'danger', 处置中: 'info',
    待入库: 'warning', 待核销: 'danger', 已核销: 'info'
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
        purchaseMode: assetForm.purchaseMode,
        leaseMonths: assetForm.purchaseMode === 'LEASE' ? assetForm.leaseMonths : null
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
        leaseMonths: assetForm.purchaseMode === 'LEASE' ? assetForm.leaseMonths : null
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
  assetRecordData.value = EMPTY_RECORDS()
  loadAssetRecords(row)
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

/**
 * 资产操作记录：按 assetId 从真实单据聚合（BUG-004）。
 *
 * 之前这里是硬编码演示数据，任何资产点开都显示同一批单号。
 * 现在打开详情时拉取 8 类单据，按 assetId 过滤；盘点记录从盘点计划的 items 里取。
 * 无记录时展示「期初导入，暂无关联单据」，不再伪造单据。
 */
const EMPTY_RECORDS = () => ({
  check: [], dispatch: [], borrow: [], repair: [], transfer: [], change: [], dispose: []
})
const assetRecordData = ref(EMPTY_RECORDS())
const assetRecordLoading = ref(false)
const recordCount = computed(() =>
  Object.values(assetRecordData.value).reduce((sum, rows) => sum + rows.length, 0)
)

/** 操作记录里的单据编号链接：只读打开该单据的审批信息（资产编号/名称 + 环节 + 轨迹） */
const recordApprovalVisible = ref(false)
const recordApprovalDoc = ref(null)
const recordApprovalDocKey = ref('repair')

function openRecordDoc(row) {
  if (!row?.raw || !row?.docKey) return
  recordApprovalDoc.value = row.raw
  recordApprovalDocKey.value = row.docKey
  recordApprovalVisible.value = true
}

const RECORD_SOURCES = [
  { tab: 'dispatch', biz: 'alloc' },
  { tab: 'dispatch', biz: 'back' },
  { tab: 'borrow', biz: 'borrow' },
  { tab: 'repair', biz: 'repair' },
  { tab: 'transfer', biz: 'transfer' },
  { tab: 'change', biz: 'change' },
  { tab: 'dispose', biz: 'dispose' }
]

const INVENTORY_RESULT_TEXT = { MATCHED: '已盘', SURPLUS: '盘盈', LOSS: '盘亏', UNCHECKED: '未盘' }

function userNameOf(id) {
  if (!id) return ''
  return orgStore.users.find(u => u.id === id)?.name || ''
}

async function loadAssetRecords(asset) {
  assetRecordLoading.value = true
  const next = EMPTY_RECORDS()
  try {
    const results = await Promise.all(
      RECORD_SOURCES.map(async source => {
        try {
          const rows = await dataService.list(`${COLLECTION.docListPrefix}-${source.biz}`)
          return { ...source, rows }
        } catch {
          // 无权限或集合为空时按「无记录」处理，不能因为一个集合失败就整页空白
          return { ...source, rows: [] }
        }
      })
    )

    for (const { tab, biz, rows } of results) {
      for (const row of rows.filter(r => r.assetId === asset.id)) {
        const base = {
          docNo: row.code || row.docNo || '',
          person: userNameOf(row.creatorId) || row.operator || '',
          time: formatDateTime(row.createTime || row.finishTime || ''),
          status: row.status,
          // 保留原始单据与业务类型：编号链接据此打开该单据的审批信息
          docKey: biz,
          raw: row
        }
        if (tab === 'dispatch') {
          // 归还型退库单关联原借出单，在操作记录里显式标注，形成「借出 → 归还退库」闭环
          const kind = biz === 'alloc' ? '派发' : (row.borrowDocId ? '归还退库' : '退库')
          next.dispatch.push({ ...base, kind, dept: row.deptName || '' })
        } else if (tab === 'borrow') {
          next.borrow.push({
            ...base,
            borrower: row.borrower || userNameOf(row.userId),
            borrowTime: row.borrowDate || '',
            returnTime: row.returnDate || ''
          })
        } else if (tab === 'repair') {
          next.repair.push({
            ...base,
            fault: row.fault || row.faultDesc || row.remark || '',
            vendor: row.vendor || row.repairVendor || '',
            cost: row.cost ?? row.amount ?? ''
          })
        } else if (tab === 'transfer') {
          next.transfer.push({
            ...base,
            from: row.fromCompany || row.fromCompanyName || '',
            to: row.toCompany || row.toCompanyName || ''
          })
        } else if (tab === 'change') {
          next.change.push({ ...base, content: row.content || row.changeContent || row.remark || '' })
        } else if (tab === 'dispose') {
          next.dispose.push({ ...base, mode: row.mode || row.disposeMode || '', amount: row.amount ?? '' })
        }
      }
    }

    // 盘点记录：来源是盘点单明细（结果登记在盘点单上，计划里只有资产范围快照）
    if (canReadInventory.value) {
      for (const doc of inventoryDocs.value) {
        for (const item of asItems(doc.items)) {
          if (item.assetId !== asset.id) continue
          next.check.push({
            docNo: doc.docNo || '',
            result: INVENTORY_RESULT_TEXT[item.result] || item.result || '未盘',
            person: item.checkerName || item.checker || '',
            time: item.checkTime || doc.finishTime || doc.createTime || ''
          })
        }
      }
    }

    // 用户可能已经切换到另一条资产，避免旧请求覆盖新详情
    if (currentAsset.value?.id === asset.id) assetRecordData.value = next
  } finally {
    assetRecordLoading.value = false
  }
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

/* 台账搜索区：控件换行时保持同一基线，姓名与「我的资产」不与按钮互相挤压 */
.asset-search-form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.asset-search-form :deep(.el-form-item) {
  display: inline-flex;
  align-items: center;
  margin-right: 16px;
  margin-bottom: 8px;
}
.asset-search-form .mine-only {
  height: 32px;
  margin-right: 8px;
  background: #fff;
}

/* 操作列：el-dropdown 会打断 .el-button + .el-button 的间距链，统一交给 flex 排版 */
.row-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.row-actions :deep(.el-button),
.row-actions :deep(.el-dropdown) {
  margin: 0;
  height: 24px;
}
.row-actions :deep(.el-button.is-link) {
  padding: 0;
}
.action-caret {
  margin-left: 2px;
  font-size: 12px;
}

.record-empty {
  padding: 12px 16px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #909399;
  background: #f7f9fc;
  border: 1px dashed #dcdfe6;
  border-radius: var(--r-md);
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
  min-height: 32px;
  margin-bottom: 4px;
}

.drawer-actions {
  display: inline-flex;
  align-items: center;
  margin-left: auto;
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

/* 盘点清单右侧操作区：靠右排列 */
.checklist-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
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
