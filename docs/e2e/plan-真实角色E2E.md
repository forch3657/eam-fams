## 产品概述
按已确认的口径分四期补齐盘点与数据闭环，并用福州数据技术研究院有限公司的真实部门、真实人员账号和真实审批流程完成回归验证与数据核对。

## 核心 Features
- **异常闭环**：盘点明细登记为「异常」时必须选择处理去向（转维修单 / 转变更单 / 已说明）；未处理不得送审或完结，完结后按去向生成待审单据。
- **分批保存**：盘点结果可先保存已登记部分，之后继续盘点；送审仍要求全部明细登记完毕，盘点员进度按分派数量正确计算。
- **盘点报表**：在既有明细导出上追加差异汇总（盘盈、盘亏、异常清单与合计、盘点单号、期间）。
- **借出归还**：在原借出单登记归还日期与备注，登记后资产状态回到使用中，操作可追溯。
- **导入告警**：导入借出中、维修中、派发中、处置中的资产时行级告警但放行，并标注「期初导入」；不阻断期初数据。
- **口径边界**：明确盘点流程保留角色池的原因、盘点终端当前仅覆盖设备登记与异常登记的边界。
- **真实组织回归**：覆盖该公司在册资产的 8 个部门，按使用人、部门负责人、分管领导、财务、仓管、审计、资产管理员的真实层级登录，走真实审批链；自动化断言台账状态、派生单据、审批轨迹与部门配置前后一致，并交付可复跑 SQL 复核清单和分部门分层的核对报告。

## 技术栈选型
沿用现有栈，不引入新框架或新工具链：
- 后端：Spring Boot 2.7 + MyBatis `SqlProvider` 动态 SQL，契约驱动 CRUD（`GenericService` / `GenericController`），MySQL 8 生产库、H2 内存库单测。
- 前端：Vue 3 + Element Plus + Pinia + Vite，契约单一真源为 `fams-frontend/src/services/contract/schema.js`，经 `npm run export:contract` 生成后端 `contract/*.json`。
- 测试：后端 JUnit + MockMvc（`P5InventoryDepreciationTest` 等共 127 条）；E2E 复用项目既有 `@playwright/test` 与 `tests/e2e/fixtures/*`，不使用外部浏览器 CLI，避免破坏既有运行方式。
- 部署：`stop-prod.ps1` → `build-prod.ps1` → `start-prod.ps1`；DDL 与字典迁移用 `root@localhost` / `Fzidt@123`，`fams` 只有 DML。

## 实现策略
按「一期盘点闭环 → 二期数据闭环 → 三期口径边界 → 四期真实组织回归」串行推进。一期与二期都改 `ApprovalService.java`、`schema.js`，串行可避免同文件冲突；四期必须在功能冻结、生产栈重建后执行，保证断言针对最终行为。

关键决策与取舍：
1. **1B 复用既有集合与流程**：异常去向复用 `fixed-asset-doc-lists-repair` / `-change` 与 WF6 / WF7，沿用 `syncInventorySurplus` / `syncInventoryLoss` 的 `createIndependent` 独立事务模式，不新增集合、不新增资产状态，降低状态机复杂度。新增「未选去向」校验放在后端送审前置（与 `pendingCheckCount` 同处），前端只做提示，不采信客户端 `hasDiff`。
2. **3B 后端零改动**：`saveCheckResults` 放开「还有 N 项未登记」拦截；后端 `pendingCheckCount` 已在送审时兜底，因此不会出现绕过审批；`counters.done` 改为按该盘点员分派数计算。
3. **4B 单独静态契约**：`fixed-asset-doc-lists-*` 共用一套动态契约模板，直接给共用模板加字段会连带 8 张表。改为在 `CONTRACT_LIST` 中为 borrow 定义静态契约，并同步从 `DYNAMIC_KEYS` 排除 `fixed-asset-doc-lists-borrow`，避免导出时生成重复 key；仅 `fixed_asset_doc_lists_borrow` 加列。归还联动复用 `ApprovalService` 的 `updateQuietly` + `patchField` 与审批动作端点中等价的非推进型动作，不新建 Controller / 端点。
4. **5B 告警不阻断**：`FixedAssetImportResult` 增加 `warnings`，`SystemDataImport.vue` 增加告警表；资产表新增可选 `source_tag` 列承载「期初导入」标注。不推翻已定的「期初允许无单据、状态以台账为准」。
5. **2A / 6A 仅文档**：盘点单跨部门、明细横跨多个部门，纵向审批的部门维度不适用，WF9 保留角色池并在 `docs/dept-approval.md` 写明例外；终端边界写入 README。避免为不成立的维度改造 `ApproverResolver`。
6. **7B 纯前端**：`exportInventory` 增加汇总行与合计，不新增后端导出接口。

性能与复杂度：E2E 覆盖 8 个部门且每部门走完整层级，用例数约翻倍，串行执行时间上升。缓解措施：共享一份真实组织夹具（`beforeAll` 一次登录、批量取部门与资产快照），每部门只取必备资产，不重复全表遍历；`afterAll` 批量逆序清理；SQL 复核全部
