<template>
  <div class="page-container">
    <div class="page-header">
      <h2>低值资产管理</h2>
      <div>
        <el-button v-if="activeTab === 'item'" type="primary" @click="openItemDialog()">
          <el-icon><Plus /></el-icon>
          新增物品
        </el-button>
        <el-button v-if="activeTab === 'inbound'" type="primary" @click="openInboundDialog">
          <el-icon><Plus /></el-icon>
          新增入库
        </el-button>
        <el-button v-if="activeTab === 'requisition'" type="primary" @click="openRequisitionDialog">
          <el-icon><Plus /></el-icon>
          新增领用
        </el-button>
        <el-button v-if="activeTab === 'return'" type="primary" @click="openReturnDialog">
          <el-icon><Plus /></el-icon>
          新增退库
        </el-button>
      </div>
    </div>

    <el-card class="fill">
      <el-tabs v-model="activeTab">
        <!-- 库存台账 -->
        <el-tab-pane label="库存台账" name="item">
          <el-form :inline="true" class="search-form">
            <el-form-item label="类别">
              <el-select v-model="itemSearch.category" placeholder="请选择" clearable style="width: 140px">
                <el-option label="全部" value="" />
                <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
            <el-form-item label="关键字">
              <el-input v-model="itemSearch.keyword" placeholder="物品名称/规格型号" clearable style="width: 220px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="itemPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetItemSearch">重置</el-button>
              <el-button type="primary" plain @click="exportItems">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedItemList" style="width: 100%">
            <el-table-column label="序号" width="70" align="center">
              <template #default="{ $index }">{{ (itemPage - 1) * itemPageSize + $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="code" label="物品编码" width="120" />
            <el-table-column prop="category" label="物品类别" width="110" />
            <el-table-column prop="name" label="物品名称" min-width="200" show-overflow-tooltip />
            <el-table-column prop="spec" label="规格型号" min-width="220" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="price" label="物品单价(元)" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ Number(row.price || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="stock" label="物品数量" width="100" align="right">
              <template #default="{ row }">
                <span class="num" :class="{ 'stock-warn': row.stock <= row.safetyStock }">{{ row.stock }}</span>
                <el-tag v-if="row.stock <= row.safetyStock" type="danger" size="small" effect="light">预警</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="safetyStock" label="安全库存" width="100" align="right" />
            <el-table-column prop="location" label="存放位置" width="140" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="操作" width="150" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="openItemDialog(row)">编辑</el-button>
                <el-button link type="danger" size="small" @click="handleDeleteItem(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="itemPage"
              v-model:page-size="itemPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredItemList.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 入库管理 -->
        <el-tab-pane label="入库管理" name="inbound">
          <el-form :inline="true" class="search-form">
            <el-form-item label="物品名称">
              <el-input v-model="inboundSearch.name" placeholder="请输入物品名称" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="供应商">
              <el-input v-model="inboundSearch.supplier" placeholder="请输入供应商" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="inboundPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetInboundSearch">重置</el-button>
              <el-button type="primary" plain @click="exportDocs('inbound')">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedInboundList" style="width: 100%">
            <el-table-column label="序号" width="70" align="center">
              <template #default="{ $index }">{{ (inboundPage - 1) * inboundPageSize + $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="docNo" label="单据编号" width="130" />
            <el-table-column prop="itemName" label="物品名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="category" label="物品类别" width="110" />
            <el-table-column prop="spec" label="规格型号" min-width="200" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="quantity" label="入库数量" width="100" align="right" />
            <el-table-column prop="price" label="单价(元)" width="100" align="right">
              <template #default="{ row }"><span class="num">{{ Number(row.price || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="amount" label="金额(元)" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ Number(row.amount || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="supplier" label="供应商" min-width="180" show-overflow-tooltip />
            <el-table-column prop="inboundDate" label="入库日期" width="120" />
            <el-table-column prop="operator" label="经办人" width="100" />
            <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="inboundPage"
              v-model:page-size="inboundPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredInboundList.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 领用管理 -->
        <el-tab-pane label="领用管理" name="requisition">
          <el-form :inline="true" class="search-form">
            <el-form-item label="物品名称">
              <el-input v-model="requisitionSearch.name" placeholder="请输入物品名称" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="领用部门">
              <el-input v-model="requisitionSearch.dept" placeholder="请输入领用部门" clearable style="width: 160px" />
            </el-form-item>
            <el-form-item label="领用人">
              <el-input v-model="requisitionSearch.receiver" placeholder="请输入领用人" clearable style="width: 160px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="requisitionPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetRequisitionSearch">重置</el-button>
              <el-button type="primary" plain @click="exportDocs('requisition')">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedRequisitionList" style="width: 100%">
            <el-table-column label="序号" width="70" align="center">
              <template #default="{ $index }">{{ (requisitionPage - 1) * requisitionPageSize + $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="docNo" label="单据编号" width="130" />
            <el-table-column prop="itemName" label="物品名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="category" label="物品类别" width="110" />
            <el-table-column prop="spec" label="规格型号" min-width="200" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="quantity" label="领用数量" width="100" align="right" />
            <el-table-column prop="amount" label="金额(元)" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ Number(row.amount || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="receiver" label="领用人" width="100" />
            <el-table-column prop="dept" label="领用部门" width="120" />
            <el-table-column prop="requisitionDate" label="领用日期" width="120" />
            <el-table-column prop="purpose" label="用途" min-width="160" show-overflow-tooltip />
            <el-table-column prop="operator" label="经办人" width="100" />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="requisitionPage"
              v-model:page-size="requisitionPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredRequisitionList.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>

        <!-- 退库管理 -->
        <el-tab-pane label="退库管理" name="return">
          <el-form :inline="true" class="search-form">
            <el-form-item label="物品名称">
              <el-input v-model="returnSearch.name" placeholder="请输入物品名称" clearable style="width: 200px" />
            </el-form-item>
            <el-form-item label="退库人">
              <el-input v-model="returnSearch.returner" placeholder="请输入退库人" clearable style="width: 160px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="returnPage = 1">
                <el-icon><Search /></el-icon>
                搜索
              </el-button>
              <el-button @click="resetReturnSearch">重置</el-button>
              <el-button type="primary" plain @click="exportDocs('return')">
                <el-icon><Download /></el-icon>
                导出
              </el-button>
            </el-form-item>
          </el-form>

          <el-table :data="pagedReturnList" style="width: 100%">
            <el-table-column label="序号" width="70" align="center">
              <template #default="{ $index }">{{ (returnPage - 1) * returnPageSize + $index + 1 }}</template>
            </el-table-column>
            <el-table-column prop="docNo" label="单据编号" width="130" />
            <el-table-column prop="itemName" label="物品名称" min-width="180" show-overflow-tooltip />
            <el-table-column prop="category" label="物品类别" width="110" />
            <el-table-column prop="spec" label="规格型号" min-width="200" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column prop="quantity" label="退库数量" width="100" align="right" />
            <el-table-column prop="amount" label="金额(元)" width="120" align="right">
              <template #default="{ row }"><span class="num">{{ Number(row.amount || 0).toLocaleString() }}</span></template>
            </el-table-column>
            <el-table-column prop="returner" label="退库人" width="100" />
            <el-table-column prop="dept" label="退库部门" width="120" />
            <el-table-column prop="returnDate" label="退库日期" width="120" />
            <el-table-column prop="reason" label="退库原因" min-width="180" show-overflow-tooltip />
            <el-table-column prop="operator" label="经办人" width="100" />
          </el-table>

          <div class="pager">
            <el-pagination
              v-model:current-page="returnPage"
              v-model:page-size="returnPageSize"
              :page-sizes="[10, 20, 50, 100]"
              :total="filteredReturnList.length"
              layout="total, sizes, prev, pager, next, jumper"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 新增/编辑物品 -->
    <el-dialog v-model="itemDialog.visible" :title="itemDialog.isEdit ? '编辑物品' : '新增物品'" width="640px">
      <el-form ref="itemFormRef" :model="itemDialog.form" :rules="itemRules" label-width="100px">
        <el-form-item label="物品编码">
          <el-input v-model="itemDialog.form.code" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="物品类别" prop="category">
          <el-select v-model="itemDialog.form.category" placeholder="请选择类别" style="width: 100%">
            <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="物品名称" prop="name">
          <el-input v-model="itemDialog.form.name" placeholder="请输入物品名称" />
        </el-form-item>
        <el-form-item label="规格型号">
          <el-input v-model="itemDialog.form.spec" placeholder="请输入规格型号" />
        </el-form-item>
        <el-form-item label="单位" prop="unit">
          <el-input v-model="itemDialog.form.unit" placeholder="如：包/个/箱" style="width: 160px" />
        </el-form-item>
        <el-form-item label="物品单价" prop="price">
          <el-input-number v-model="itemDialog.form.price" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="库存数量" prop="stock">
          <el-input-number v-model="itemDialog.form.stock" :min="0" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="安全库存">
          <el-input-number v-model="itemDialog.form.safetyStock" :min="0" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="存放位置">
          <el-select v-model="itemDialog.form.location" placeholder="请选择存放位置" clearable style="width: 100%">
            <el-option v-for="l in locationOptions" :key="l" :label="l" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="itemDialog.form.status" style="width: 160px">
            <el-option label="正常" value="正常" />
            <el-option label="停用" value="停用" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="itemDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitItem">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增入库 -->
    <el-dialog v-model="inboundDialog.visible" title="新增入库" width="560px">
      <el-form ref="inboundFormRef" :model="inboundDialog.form" :rules="docRules" label-width="100px">
        <el-form-item label="入库物品" prop="itemId">
          <el-select v-model="inboundDialog.form.itemId" placeholder="请选择物品" style="width: 100%" @change="onInboundItemChange">
            <el-option v-for="i in store.items" :key="i.id" :label="`${i.name}（${i.spec || '-'}）`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="当前库存">
          <span class="num">{{ inboundItem ? inboundItem.stock : 0 }}</span>
          <span class="unit-text">{{ inboundItem ? inboundItem.unit : '' }}</span>
        </el-form-item>
        <el-form-item label="入库数量" prop="quantity">
          <el-input-number v-model="inboundDialog.form.quantity" :min="1" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="入库单价">
          <el-input-number v-model="inboundDialog.form.price" :min="0" :precision="2" :step="1" />
        </el-form-item>
        <el-form-item label="供应商">
          <el-input v-model="inboundDialog.form.supplier" placeholder="请输入供应商" />
        </el-form-item>
        <el-form-item label="入库日期" prop="inboundDate">
          <el-date-picker v-model="inboundDialog.form.inboundDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="经办人">
          <el-input v-model="inboundDialog.form.operator" placeholder="请输入经办人" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="inboundDialog.form.remark" type="textarea" :rows="2" placeholder="请输入备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="inboundDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitInbound">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增领用 -->
    <el-dialog v-model="requisitionDialog.visible" title="新增领用" width="560px">
      <el-form ref="requisitionFormRef" :model="requisitionDialog.form" :rules="docRules" label-width="100px">
        <el-form-item label="领用物品" prop="itemId">
          <el-select v-model="requisitionDialog.form.itemId" placeholder="请选择物品" style="width: 100%">
            <el-option v-for="i in store.items" :key="i.id" :label="`${i.name}（库存 ${i.stock}${i.unit || ''}）`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="可领用">
          <span class="num">{{ requisitionItem ? requisitionItem.stock : 0 }}</span>
          <span class="unit-text">{{ requisitionItem ? requisitionItem.unit : '' }}</span>
        </el-form-item>
        <el-form-item label="领用数量" prop="quantity">
          <el-input-number v-model="requisitionDialog.form.quantity" :min="1" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="领用人" prop="receiver">
          <el-input v-model="requisitionDialog.form.receiver" placeholder="请输入领用人" />
        </el-form-item>
        <el-form-item label="领用部门" prop="dept">
          <el-select v-model="requisitionDialog.form.dept" placeholder="请选择领用部门" filterable style="width: 100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.label" :value="d.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="领用日期" prop="requisitionDate">
          <el-date-picker v-model="requisitionDialog.form.requisitionDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="用途">
          <el-input v-model="requisitionDialog.form.purpose" placeholder="请输入用途" />
        </el-form-item>
        <el-form-item label="经办人">
          <el-input v-model="requisitionDialog.form.operator" placeholder="请输入经办人" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="requisitionDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitRequisition">确定</el-button>
      </template>
    </el-dialog>

    <!-- 新增退库 -->
    <el-dialog v-model="returnDialog.visible" title="新增退库" width="560px">
      <el-form ref="returnFormRef" :model="returnDialog.form" :rules="docRules" label-width="100px">
        <el-form-item label="退库物品" prop="itemId">
          <el-select v-model="returnDialog.form.itemId" placeholder="请选择物品" style="width: 100%">
            <el-option v-for="i in store.items" :key="i.id" :label="`${i.name}（已领未退 ${issuedOf(i.id)}${i.unit || ''}）`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="可退数量">
          <span class="num">{{ returnItem ? issuedOf(returnItem.id) : 0 }}</span>
          <span class="unit-text">{{ returnItem ? returnItem.unit : '' }}</span>
        </el-form-item>
        <el-form-item label="退库数量" prop="quantity">
          <el-input-number v-model="returnDialog.form.quantity" :min="1" :precision="0" :step="1" />
        </el-form-item>
        <el-form-item label="退库人" prop="returner">
          <el-input v-model="returnDialog.form.returner" placeholder="请输入退库人" />
        </el-form-item>
        <el-form-item label="退库部门" prop="dept">
          <el-select v-model="returnDialog.form.dept" placeholder="请选择退库部门" filterable style="width: 100%">
            <el-option v-for="d in deptOptions" :key="d.id" :label="d.label" :value="d.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="退库日期" prop="returnDate">
          <el-date-picker v-model="returnDialog.form.returnDate" type="date" value-format="YYYY-MM-DD" placeholder="请选择日期" style="width: 100%" />
        </el-form-item>
        <el-form-item label="退库原因" prop="reason">
          <el-input v-model="returnDialog.form.reason" placeholder="请输入退库原因" />
        </el-form-item>
        <el-form-item label="经办人">
          <el-input v-model="returnDialog.form.operator" placeholder="请输入经办人" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="returnDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitReturn">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Download } from '@element-plus/icons-vue'
import { useLowValueAssetStore } from '../../store/lowValueAsset'
import { useOrgStore } from '../../store/org'

const store = useLowValueAssetStore()
const orgStore = useOrgStore()

const activeTab = ref('item')
const categoryOptions = computed(() => store.categoryOptions)
const locationOptions = computed(() => store.locationOptions)
/** 部门口径取自组织架构主数据，同名部门以公司名区分 */
const deptOptions = computed(() => orgStore.departmentOptions.map(d => ({ ...d, label: `${d.name}（${d.companyName}）` })))

function today() {
  return new Date().toISOString().slice(0, 10)
}

// ---------- 库存台账 ----------
const itemSearch = reactive({ category: '', keyword: '' })
watch(itemSearch, () => { itemPage.value = 1 }, { deep: true })

const itemPage = ref(1)
const itemPageSize = ref(15)

const filteredItemList = computed(() => {
  const kw = itemSearch.keyword.trim()
  return store.items.filter(i => {
    const categoryMatch = !itemSearch.category || i.category === itemSearch.category
    const kwMatch = !kw || i.name.includes(kw) || (i.spec || '').includes(kw) || i.code.includes(kw)
    return categoryMatch && kwMatch
  })
})

const pagedItemList = computed(() => {
  const start = (itemPage.value - 1) * itemPageSize.value
  return filteredItemList.value.slice(start, start + itemPageSize.value)
})

function resetItemSearch() {
  itemSearch.category = ''
  itemSearch.keyword = ''
  itemPage.value = 1
}

// ---------- 入库 ----------
const inboundSearch = reactive({ name: '', supplier: '' })
watch(inboundSearch, () => { inboundPage.value = 1 }, { deep: true })

const inboundPage = ref(1)
const inboundPageSize = ref(15)

const filteredInboundList = computed(() => {
  return store.inboundRecords.filter(r => {
    const nameMatch = !inboundSearch.name || (r.itemName || '').includes(inboundSearch.name)
    const supplierMatch = !inboundSearch.supplier || (r.supplier || '').includes(inboundSearch.supplier)
    return nameMatch && supplierMatch
  })
})

const pagedInboundList = computed(() => {
  const start = (inboundPage.value - 1) * inboundPageSize.value
  return filteredInboundList.value.slice(start, start + inboundPageSize.value)
})

function resetInboundSearch() {
  inboundSearch.name = ''
  inboundSearch.supplier = ''
  inboundPage.value = 1
}

// ---------- 领用 ----------
const requisitionSearch = reactive({ name: '', dept: '', receiver: '' })
watch(requisitionSearch, () => { requisitionPage.value = 1 }, { deep: true })

const requisitionPage = ref(1)
const requisitionPageSize = ref(15)

const filteredRequisitionList = computed(() => {
  return store.requisitionRecords.filter(r => {
    const nameMatch = !requisitionSearch.name || (r.itemName || '').includes(requisitionSearch.name)
    const deptMatch = !requisitionSearch.dept || (r.dept || '').includes(requisitionSearch.dept)
    const receiverMatch = !requisitionSearch.receiver || (r.receiver || '').includes(requisitionSearch.receiver)
    return nameMatch && deptMatch && receiverMatch
  })
})

const pagedRequisitionList = computed(() => {
  const start = (requisitionPage.value - 1) * requisitionPageSize.value
  return filteredRequisitionList.value.slice(start, start + requisitionPageSize.value)
})

function resetRequisitionSearch() {
  requisitionSearch.name = ''
  requisitionSearch.dept = ''
  requisitionSearch.receiver = ''
  requisitionPage.value = 1
}

// ---------- 退库 ----------
const returnSearch = reactive({ name: '', returner: '' })
watch(returnSearch, () => { returnPage.value = 1 }, { deep: true })

const returnPage = ref(1)
const returnPageSize = ref(15)

const filteredReturnList = computed(() => {
  return store.returnRecords.filter(r => {
    const nameMatch = !returnSearch.name || (r.itemName || '').includes(returnSearch.name)
    const returnerMatch = !returnSearch.returner || (r.returner || '').includes(returnSearch.returner)
    return nameMatch && returnerMatch
  })
})

const pagedReturnList = computed(() => {
  const start = (returnPage.value - 1) * returnPageSize.value
  return filteredReturnList.value.slice(start, start + returnPageSize.value)
})

function resetReturnSearch() {
  returnSearch.name = ''
  returnSearch.returner = ''
  returnPage.value = 1
}

// ---------- 导出 ----------
function downloadCsv(headers, rows, filename) {
  const csv = '\uFEFF' + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`导出成功（${rows.length} 条）`)
}

function exportItems() {
  const headers = ['物品编码', '物品类别', '物品名称', '规格型号', '单位', '物品单价(元)', '物品数量', '安全库存', '存放位置', '状态']
  const rows = filteredItemList.value.map(i => [i.code, i.category, i.name, i.spec, i.unit, i.price, i.stock, i.safetyStock, i.location, i.status])
  downloadCsv(headers, rows, `导出_低值资产台账_${today()}.csv`)
}

const DOC_EXPORT = {
  inbound: {
    name: '低值资产入库',
    headers: ['单据编号', '物品名称', '物品类别', '规格型号', '单位', '入库数量', '单价(元)', '金额(元)', '供应商', '入库日期', '经办人', '备注'],
    fields: r => [r.docNo, r.itemName, r.category, r.spec, r.unit, r.quantity, r.price, r.amount, r.supplier, r.inboundDate, r.operator, r.remark],
    list: () => filteredInboundList.value
  },
  requisition: {
    name: '低值资产领用',
    headers: ['单据编号', '物品名称', '物品类别', '规格型号', '单位', '领用数量', '金额(元)', '领用人', '领用部门', '领用日期', '用途', '经办人'],
    fields: r => [r.docNo, r.itemName, r.category, r.spec, r.unit, r.quantity, r.amount, r.receiver, r.dept, r.requisitionDate, r.purpose, r.operator],
    list: () => filteredRequisitionList.value
  },
  return: {
    name: '低值资产退库',
    headers: ['单据编号', '物品名称', '物品类别', '规格型号', '单位', '退库数量', '金额(元)', '退库人', '退库部门', '退库日期', '退库原因', '经办人'],
    fields: r => [r.docNo, r.itemName, r.category, r.spec, r.unit, r.quantity, r.amount, r.returner, r.dept, r.returnDate, r.reason, r.operator],
    list: () => filteredReturnList.value
  }
}

function exportDocs(type) {
  const cfg = DOC_EXPORT[type]
  downloadCsv(cfg.headers, cfg.list().map(cfg.fields), `导出_${cfg.name}_${today()}.csv`)
}

// ---------- 物品对话框 ----------
const itemFormRef = ref()
const itemDialog = reactive({
  visible: false,
  isEdit: false,
  form: { id: '', code: '', category: '', name: '', spec: '', unit: '', price: 0, stock: 0, safetyStock: 0, location: '', status: '正常' }
})

const itemRules = {
  category: [{ required: true, message: '请选择物品类别', trigger: 'change' }],
  name: [{ required: true, message: '请输入物品名称', trigger: 'blur' }],
  unit: [{ required: true, message: '请输入单位', trigger: 'blur' }]
}

function emptyItemForm() {
  return { id: '', code: '', category: categoryOptions.value[0] || '', name: '', spec: '', unit: '', price: 0, stock: 0, safetyStock: 0, location: locationOptions.value[0] || '', status: '正常' }
}

function openItemDialog(row) {
  itemDialog.isEdit = !!row
  Object.assign(itemDialog.form, row ? { ...row } : emptyItemForm())
  itemDialog.visible = true
  nextTick(() => itemFormRef.value?.clearValidate())
}

async function submitItem() {
  const valid = await itemFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    if (itemDialog.isEdit) {
      await store.updateItem(itemDialog.form.id, itemDialog.form)
      ElMessage.success('物品更新成功')
    } else {
      await store.addItem(itemDialog.form)
      ElMessage.success('物品新增成功')
    }
    itemDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '保存失败')
  }
}

async function handleDeleteItem(row) {
  try {
    await ElMessageBox.confirm(`确认删除物品「${row.name}」？`, '提示', { type: 'warning' })
    await store.removeItem(row.id)
    ElMessage.success('删除成功')
  } catch (e) {
    if (e !== 'cancel' && e?.message) ElMessage.error(e.message)
  }
}

// ---------- 业务单据对话框 ----------
const inboundFormRef = ref()
const requisitionFormRef = ref()
const returnFormRef = ref()

const inboundDialog = reactive({
  visible: false,
  form: { itemId: '', quantity: 1, price: 0, supplier: '', inboundDate: today(), operator: '', remark: '' }
})
const requisitionDialog = reactive({
  visible: false,
  form: { itemId: '', quantity: 1, receiver: '', dept: '', requisitionDate: today(), purpose: '', operator: '' }
})
const returnDialog = reactive({
  visible: false,
  form: { itemId: '', quantity: 1, returner: '', dept: '', returnDate: today(), reason: '', operator: '' }
})

const docRules = {
  itemId: [{ required: true, message: '请选择物品', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'change' }],
  inboundDate: [{ required: true, message: '请选择入库日期', trigger: 'change' }],
  requisitionDate: [{ required: true, message: '请选择领用日期', trigger: 'change' }],
  returnDate: [{ required: true, message: '请选择退库日期', trigger: 'change' }],
  receiver: [{ required: true, message: '请输入领用人', trigger: 'blur' }],
  returner: [{ required: true, message: '请输入退库人', trigger: 'blur' }],
  dept: [{ required: true, message: '请输入部门', trigger: 'blur' }],
  reason: [{ required: true, message: '请输入退库原因', trigger: 'blur' }]
}

const inboundItem = computed(() => store.items.find(i => i.id === inboundDialog.form.itemId) || null)
const requisitionItem = computed(() => store.items.find(i => i.id === requisitionDialog.form.itemId) || null)
const returnItem = computed(() => store.items.find(i => i.id === returnDialog.form.itemId) || null)

function onInboundItemChange(itemId) {
  const item = store.items.find(i => i.id === itemId)
  if (item) inboundDialog.form.price = item.price
}

/** 已领未退数量：领用总量 - 退库总量 */
function issuedOf(itemId) {
  const taken = store.requisitionRecords.filter(r => r.itemId === itemId).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  const back = store.returnRecords.filter(r => r.itemId === itemId).reduce((s, r) => s + (Number(r.quantity) || 0), 0)
  return Math.max(taken - back, 0)
}

function openInboundDialog() {
  Object.assign(inboundDialog.form, { itemId: '', quantity: 1, price: 0, supplier: '', inboundDate: today(), operator: '', remark: '' })
  inboundDialog.visible = true
  nextTick(() => inboundFormRef.value?.clearValidate())
}

function openRequisitionDialog() {
  Object.assign(requisitionDialog.form, { itemId: '', quantity: 1, receiver: '', dept: '', requisitionDate: today(), purpose: '', operator: '' })
  requisitionDialog.visible = true
  nextTick(() => requisitionFormRef.value?.clearValidate())
}

function openReturnDialog() {
  Object.assign(returnDialog.form, { itemId: '', quantity: 1, returner: '', dept: '', returnDate: today(), reason: '', operator: '' })
  returnDialog.visible = true
  nextTick(() => returnFormRef.value?.clearValidate())
}

async function submitInbound() {
  const valid = await inboundFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await store.addInbound(inboundDialog.form)
    ElMessage.success('入库成功，库存已更新')
    inboundDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '入库失败')
  }
}

async function submitRequisition() {
  const valid = await requisitionFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await store.addRequisition(requisitionDialog.form)
    ElMessage.success('领用成功，库存已扣减')
    requisitionDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '领用失败')
  }
}

async function submitReturn() {
  const valid = await returnFormRef.value.validate().catch(() => false)
  if (!valid) return
  try {
    await store.addReturn(returnDialog.form)
    ElMessage.success('退库成功，库存已回补')
    returnDialog.visible = false
  } catch (e) {
    ElMessage.error(e.message || '退库失败')
  }
}
</script>

<style scoped>
.search-form {
  margin-bottom: 20px;
}

.stock-warn {
  color: #f56c6c;
  font-weight: 600;
  margin-right: 4px;
}

.unit-text {
  margin-left: 4px;
  color: #909399;
}
</style>
