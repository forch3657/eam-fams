# 集团化多公司改造 · 阶段门禁记录（D1~D4）

> 本文件是四阶段门禁的唯一记录点。**每个阶段必须完成并通过测试后方可进入下一阶段**；任一门禁失败即回滚到该阶段开始前的只读快照，不启动下一阶段。
> 本期范围：仅实现系统自身独立的集团化多公司管理；外部组织架构接口与流程引擎对接整体后置，见 `docs/external-integration-prerequisites.md`，不在本期实施、不验收。
> 测试口径：后端全量 JUnit、前端 5 组单测（approval/lowValue/workbench/auth/orgTree）、`check:perm`、`npm run build` / `mvn clean package` 为自动门禁；只读 SQL 复核、备份与回滚演练、上线检查单为人工门禁；按项目既定口径**不运行自动化浏览器 E2E，点测由用户手动完成**。
> 编号口径：D1~D4 对应上一轮 P0~P3；Q1~Q4 为决策口径，不再与阶段编号混用。

---

## 0. 已固化口径 Q1~Q4（用户 2026-11-16 确认计划时固化，阶段进行中不再变更）

| 编号 | 口径 | 落地阶段 |
| --- | --- | --- |
| Q1 | 集中管控：集团统一字典与参数、各公司数据隔离、集团可看全部 | D1、D2 |
| Q2 | `COMPANY` = 本公司及所有下级展开 + 显式多公司授权；`DEPT` 含子部门；`orgScope` 参与范围判定 | D1、D2 |
| Q3 | 集团默认配置 + 公司级覆盖，不复制多套流程实例 | D2、D3 |
| Q4 | 跨公司转让在受让公司自动建卡；低值库存按公司独立 | D2、D3 |

修正后的组织架构对接口径（仅作后续阶段备注，本期不实施）：「对接人员的组织架构调整，接口对接工作联系陈国；人员组织架构信息予以保留，对接角色的权限需重新梳理与调整。」本地 `org-companies` / `org-departments` / `org-users` 全部保留；角色权限与数据范围重新梳理调整在 D1/D2 落地，D4 做矩阵复核签字。

---

## 1. 门禁 1 证据基线：数据范围盲区清单（D1 任务基线）

排查方式：code-explorer very thorough 全库只读排查 + 文本检索交叉验证。LSP 语义分析因本机无 Java documentSymbol/callHierarchy provider（`No Document Symbol provider available for language "java"`）按技能回退策略改用 `search_content` 复核，结论一致。排查未修改任何文件。

### 1.1 总体结论

- `scopedRaw(` 全后端仅 3 处命中：`GenericService.java:109`（list）、`:132`（page）、`:565`（定义）。`get` 及所有写方法、批量、清空、审批、导入、折旧、工作台均无行级断言，与 `docs/production-audit-report.md:277` 一致。
- `genericService.*` 写方法直调集中在 **12 个文件**：`ApprovalService`（28 处）、`DataResetService`（8 处）、`GenericController`（5 处）、`DepreciationService`（4 处）、`DataInitializer`（3 处）、`OrgStructureImportService`（3 处）、`FixedAssetImportService`（2 处）、`LowValueAssetImportService`（2 处）、`ApprovalTrailWriter`、`AssetOwnerPolicy`、`OperationLogAspect`、`DataImportService` 各 1 处。
- 绕过 `GenericService` 直连 `GenericMapper` 的 3 个文件：`GenericService.java`（自身）、`hook/ApprovalTrailHook.java`（`mapper.insert` 写审批轨迹）、`hook/ReturnLimitHook.java`（`sum` 跨公司聚合）；另有 `SnapshotHook`、`RuleEngine` 的直连查询。

### 1.2 GenericController 八个端点（`engine/GenericController.java`）

| 行号 | 端点 | 调用 | 断言状态 |
| --- | --- | --- | --- |
| :46-50 | `GET /api/{key}` | `list` | 已接入 scopedRaw |
| :53-57 | `GET /api/{key}/page` | `page` | 已接入 scopedRaw |
| :60-64 | `GET /api/{key}/{id}` | `get` | **缺** |
| :67-72 | `POST /api/{key}` | `create` | **缺** |
| :75-80 | `PUT /api/{key}/{id}` | `update` | **缺** |
| :83-87 | `DELETE /api/{key}/{id}` | `remove` | **缺** |
| :90-95 | `PUT /api/{key}/batch` | `batch` | **缺** |
| :98-102 | `DELETE /api/{key}/all` | `clear` | **缺**（S-05 另要求限管理员） |

`require(...)`（:105-122）只做权限码判定，`PermissionPolicy.matches`（:266）对未登记集合默认放行，不能替代行级断言。

### 1.3 GenericService 需接入统一断言的方法（`engine/GenericService.java`）

| 行号 | 方法 | 状态 |
| --- | --- | --- |
| :107 / :130 | `list` / `page` | 已有，需改为调用统一断言 |
| :122 | `listInternal`（明确「未经脱敏/不过滤」） | **需接入** |
| :141 | `get` | **需接入** |
| :153 / :205 | `create` / `createIndependent`（派生单据） | **需接入** |
| :263 / :295 | `update` / `updateQuietly` | **需接入** |
| :367 / :402 / :435 / :448 | `remove` / `batch` / `clear` / `deleteByIdQuietly` | **需接入** |
| :678 / :686 | `patchField` 两个重载（`mapper.updateWhere` 直改单列） | **需接入** |
| :498 | `dataScopeOf`（无角色默认 ALL、COMPANY 等值） | **需重构** |
| :565 / :599 / :641 | `scopedRaw` / `approverNeedsUnscopedDocs`（整体放开） / `userIdsOfRole`（全表扫描） | **需重构** |
| :700 / :707 / :973 / :984 | `findById` / `lockById` / `updateColumn` / `applyCascade` | 私有旁路，需随调用点覆盖 |

### 1.4 绕过 Controller 的直调路径（必须过断言）

- 审批：`ApprovalService`（`get` 6 处、`updateQuietly` 3 处、`patchField` 15 处、`createIndependent` 4 处、`listInternal` 4 处）、`ApprovalTrailWriter:69,81`、`ApprovalSupport:86,257,271`、`ApproverResolver:121,225`、`ApprovalController:27`。
- 导入与清空：`DataImportService:130,230`、`DataResetService:203,208,216,219,235,239,240,242,243,254,270`、`DataImportController` 上传/模板/重置预览/重置端点、`OrgStructureImportService:252,325,392`、`FixedAssetImportService:302,328`、`LowValueAssetImportService:241,267`。
- 折旧：`DepreciationService:81,83,100,102,149-152,342`（`run` 先 clear 整表再逐行 create）、`DepreciationController:36,43,56`。
- 其它：`OperationLogAspect:120`（审计写入）、`DataInitializer:66,74,87,99`（硬编码 `companyId=C1` / `deptId=D1`，:95-96）、`AssetOwnerPolicy:97`、`UserDetailsServiceImpl:25,34`。
- 动态集合：`DynamicKeyResolver:46,54,58` 运行时生成的 `fixed-asset-doc-lists-{biz}` 也带 `companyId`，静态白名单覆盖不到。
- Mapper 直连：`ApprovalTrailHook:104,107,136`、`SnapshotHook:83`、`ReturnLimitHook:82`、`RuleEngine:85,99,122,149,169`。

### 1.5 契约集合归属列盘点（`contract/resources.json`）

- 含 `companyId` 字段共 14 处；`DATA_SCOPED_PREFIXES`（`GenericService.java:545-551`）仅 6 类前缀。
- **有 companyId 但不在前缀（5 个盲区）**：`fixed-asset-inventory-docs`（:1234）、`fixed-asset-report-depreciation-plan-details`（:1722）、`fixed-asset-settings-depreciation-plans`（:2201）、`org-departments`（:3436）、`org-users`（:3603）。
- **无任何归属列但属业务数据**：`low-value-items`（:2302，在前缀内但缺列 → `putScopeFilter:628` 静默跳过，COMPANY/DEPT 全部失效，最严重）、三类低值单据（只有 `deptId` / `creatorId`）、`fixed-asset-inventory-plans`（:1103）、`fixed-asset-depreciation-reports`（:1458）、`fixed-asset-report-depreciation-details`（:1562）、`fixed-asset-doc-approvals`（:4163）、`notify-messages`（:4622）、`notify-templates`（:4752）、`operation-logs`（:4835，仅文本 `operatorOrg`）。
- **全局配置待定口径**：`system-params`（:3973）、`system-workflow-flows`（:4054）、`org-roles`（:3781）、基础设置类集合；30 个字典项集合建议白名单豁免。

### 1.6 查询 / 聚合 / 导出入口

- 工作台：`store/workbench.js:65-73` 一次性全量拉 11 类单据 + 资产 + 低值 + 盘点计划；`services/workbench.js:81,188,308` 纯前端内存聚合；`store/approval.js:21-22`、`org.js:53-56`、`notify.js`、`lowValueAsset.js`、`fixedAsset.js`、`audit.js` 均全量拉取。
- 报表：`DepreciationService:149-152,342` 全量 list；导出为纯前端 CSV（`FixedAssetReports.vue:494,521`、`LowValueAssetReports.vue:375,410,422`），数据源是已全量加载的 store，上游断言是唯一拦截点。
- 清空预览与执行口径不一致：`DataResetService.preview` 走 `list`（按范围计数），`reset` 直接 `clear` 整表。

### 1.7 单公司假设与角色范围

- `orgScope` 在后端 `*.java` 检索 **0 命中**，纯存储字段：`resources.json:3815,3886`、`SystemRole.vue:37,94-96,189,249,267`、`enums.json:188-192` 仅定义/展示；`UserPrincipal` 无该字段，`UserDetailsServiceImpl:34` 只传 `permissionsOf` 与 `dataScopeOf`。
- 测试夹具：`tests/e2e/fixtures/data.ts:51-65` `pickOrgUnit` 取 `companies[0]` 且要求该公司有部门（新增无部门集团公司排首位会破坏既有测试）；`permissionMatrix.ts:83-87,122-136`、`auth.ts:33-43`、`04-permission-matrix.spec.ts:381,388,396-404` 均为单公司口径；`pickOrgUnit` 被 05/06/07/08/09/10/11/14/15/16/17 共 11 个 spec 引用。
- 后端单测硬编码 `C1` / `D1`：`DataInitializer.java:95-96`，`p13/P13TransferApprovalTest.java:136`、`p7/P7PasswordSecurityTest.java:234`、`p11/P11FixedAssetImportTest.java:100`、`p5/P5InventoryDepreciationTest.java`、`p2/P2EngineTest.java:246`、`p9/P9OrgStructureImportTest.java:107-113`。

### 1.8 零旁路检查清单（D1 改动优先级）

- **P0 核心**：新增 `RowScopeGuard`、`CompanyScopeResolver`；改 `GenericService`（全部方法接入 + 元数据驱动范围集合 + 语义修正）、`GenericController`（8 端点串联）、`PermissionPolicy`（fail-closed、启动期契约校验、组织主数据写按公司范围）、`UserPrincipal` + `UserDetailsServiceImpl`（补 orgScope 与可见公司集合）、`AssetOwnerPolicy`。
- **P1 直调业务 Service**：`ApprovalService` / 审批包 4 个类 / `ApprovalController`、`DepreciationService` + Controller、`DataImportService` + Controller、`DataResetService`、三个 ImportService、`OperationLogAspect`、`DataInitializer`（去 C1/D1 硬编码）。
- **P2 Mapper 直连与契约**：`ApprovalTrailHook`、`SnapshotHook`、`ReturnLimitHook`、`RuleEngine`、`DynamicKeyResolver`、`SqlProvider` / `GenericMapper`（DELETE all / updateWhere / sum 是否下沉 SQL 层兜底）、`ResourceMeta` / `ResourceRegistry`（隔离级别标注）。
- **P3 契约与测试基线**：`resources.json` / `enums.json` / `permission-resources.json`（由 `schema.js` 导出，禁止手改）、E2E 夹具与后端单测、前端工作台与报表导出入口。

### 1.9 验收硬指标

- 全局检索 `scopedRaw(` 不再是 2 处调用；所有 `genericService.*` 与 `mapper.insert/deleteAll/updateWhere/sum` 调用点均有断言或白名单豁免登记。
- 跨公司 id 的 `GET` / `PUT` / `DELETE` / `batch` / `all` 全部 403；`docs/production-audit-report.md:242` 的负向鉴权验收标准通过。
- README 第 7 节多公司隔离验收用例表逐条通过；5 家公司、71 台资产、29 部门、138 账号归属核对零悬空。

---

## 2. 四阶段门禁记录（执行时逐项填写，未经签字不得进入下一阶段）

| 阶段 | 自动门禁 | 只读 SQL 复核 | 备份 / 回滚演练 | 文档同步 | 用户手动点测 | 放行签字 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 隔离地基 | 通过（2026-11-16） | 只读复核 + 19/20/21 已在生产库执行并通过复核 SELECT | 快照 + 临时库恢复演练通过，RTO/RPO 待补 | 已同步 | 通过（6 账号范围/三级树/跨公司读写删 403/派发单/32 E2E，AI 代执行核验） | **已签字放行（2026-11-16 用户确认）** | **门禁 1 已放行** |
| D2 多公司可用 | 通过（2026-11-16） | 快照 `backup-before-d2-20261116.sql` + 22/23/24 生产执行复核通过 | 迁移可回滚（快照），视角开关为前端仅展示/默认值 | 契约重新导出无差异 | 通过（162 JUnit/前端 5 组/check:perm/32 E2E/切换器 E2E/API 验收，AI 代执行核验） | **已签字放行（2026-11-16 用户确认）** | **门禁 2 已放行** |
| D3 集团管控与工程化 | 通过（2026-11-16） | 资产只读对账：76 台未污染；自动备份快照复核 | 自动备份快照；RTO 6.02s（D4 演练量化） | 契约导出无差异 | 通过（169 JUnit/前端 5 组/check:perm/32 E2E/报表专项，AI 代执行核验） | **已签字放行（2026-11-16 用户确认）** | **门禁 3 已放行** |
| D4 投产放行与交接 | 通过（2026-11-16） | 76 资产/5 公司/9 角色/138 账号只读复核通过 | 恢复演练 RTO 6.02s 数据一致；灾备切换/告警为保留项 | 上线检查单/权限矩阵/部署手册已产出 | 自动化项全通过；用户点测待完成 | 待用户签字 | **自动化项通过，待点测签字** |

每阶段记录须附：执行时间、命令与结果摘要、失败项与回滚动作、数据快照路径（`db-baseline/`）、证据文件链接。任一失败即回滚快照并保留记录，不进入下一阶段。

### 门禁 1 自动项执行记录（2026-11-16）

| 项 | 命令 / 动作 | 结果 |
| --- | --- | --- |
| 后端全量 JUnit | `mvn clean package`（build-prod.ps1 第 1 步） | 通过：149 用例，0 失败；含新增 `p14/GroupScopeGuardTest` 10 用例 |
| 前端 4 组单测 | `npm test` | 通过：审批 211 / 低值 66 / 工作台 121 / 认证 20 |
| 权限契约 | `npm run check:perm` | 通过：40 权限码、36 映射、68 集合 |
| 前端构建 | `npm run build` | 通过；`dist` 检索 `Fzidt@2026!` / `Fzidt@123` / 真实手机号 **0 命中**（S-01 前端项关闭） |
| 重建生产栈 | `stop-prod.ps1 → build-prod.ps1 → start-prod.ps1` | 成功；`/api/health` 返回 `status=UP`（2026-11-16 11:11） |
| 统一断言 | `GenericService` 16 处接入 `RowScopeGuard` | 编译通过；list/page/listInternal/get/create/update/updateQuietly/remove/batch/clear/deleteByIdQuietly/patchField/userIdsOfRole 全覆盖 |
| 三级组织树 | `org.js` deptTree 递归 + `SystemCompany.vue` parentId 归一 | 前端单测与构建通过，待用户点测确认 |

**未完成项（门禁 1 不得放行，D2 不得启动）**：

1. 生产库只读快照、`19-company-hierarchy-check.sql` / `20-scope-indexes.sql` / `21-role-datascope-backfill.sql` 的执行与复核 SELECT（DDL 需 MySQL 管理员账号，执行前须备份）。
2. 备份与回滚演练（含 RTO/RPO 记录）。
3. 生产审计报告 P0 剩余项：S-02 凭据/密钥与证书轮换（需管理员提供新凭据）、S-03 登出 token 失效与有效期收敛、S-05 权限 fail-closed 与 `DELETE /all` 限管理员（清空已按范围拦截）、S-06 通用 PUT 的 status 服务端只读、S-07 审计 append-only、S-08 80 跳 443 与安全响应头（会改变当前 `http://localhost` 点测入口，需确认）、S-10 版本化迁移与自动备份。
4. 用户按 README 第 7 节验收用例表手动点测（含按 id 跨公司 GET/PUT/DELETE 全部 403、三级组织树可见、切换公司与新建归属）。
5. 放行签字。

### D1 点测缺陷修复记录（2026-11-16）

| 项 | 内容 |
| --- | --- |
| 现象 | 低值领用审批/查询通过；固资「派发」新增单据报 `code「FP20261000」已存在，不能重复` |
| 只读核对 | 生产库 `fixed_asset_doc_lists_alloc` 已有 `FP20261000`（2026-11-10，`DONE`）；点测账号 `13625070487` 田有隆为 `R5 / DEPT`；派发单列表显示 0 条 |
| 根因 | 前端 `utils/docNo.js` 的 `genDocNo` 按「当前可见列表」推算编号，起始 1000 → `FP20261000`；列表受数据范围过滤/分页/筛选影响为空，看不到库中已占用的编号。固资 8 类单据的编号仍由前端生成，而低值三类单据与盘点单早已改为服务端按全表生成（`GenericService` 的 `DOC_NO_PREFIX` / `DOC_NO_DATE_PREFIX`），此处漏改。D1 收紧行级范围后该缺陷被暴露 |
| 修复 | `GenericService.create` 在唯一性校验前新增 `ensureUniqueFixedDocCode`：对 `fixed-asset-doc-lists-*` 集合，若前端传来的编号已存在，按**全表**同前缀最大序号 +1 重写（保持 `FP20261000` 的 4 位序号格式）；非标准编号不改写，仍由唯一性校验报错。前端无需改动，mock 模式不受影响 |
| 回归 | 新增 `com.fams.engine.FixedDocCodeTest` 4 用例；`mvn clean package` 全量 153 用例通过；前端 4 组单测、`check:perm`、构建全绿；已重建生产栈，`/api/health` UP |
| 待用户复测 | 重新点一次「派发」新增，预期不再报重复，生成 `FP20261001` |

> 该缺陷属于 D1 门禁 1 的点测阻断项，修复不改变「每阶段测试通过方可进入下一阶段」的纪律；门禁 1 仍未放行，D2 未启动。

### D1 点测进展与文档同步（2026-11-16）

| 项 | 结果 |
| --- | --- |
| 低值领用 | 审批成功、查询成功（用户点测通过） |
| 固资派发 | 首次报编号重复，已按「服务端全表取号」修复并重建，待用户复测 |
| 账号登录 | 研究院、新视、至臻账号登录正常，顶栏显示的公司名与账号所属公司一致（用户点测通过） |
| `README.md` | 第 4 节演示账号清单改为真实五家公司层级 + 脱敏代表账号；第 5 节角色表对齐生产库 `org_roles`（含 `R7` 停用、领导班子角色、组织/数据范围与人数）；第 6 节权限测试矩阵、第 7 节多公司隔离验收表改用真实账号与真实公司；清理明文登录口令与演示账号引用 |

### D1 门禁 1 详细验收执行记录（2026-11-16）

#### 自动门禁

| 项 | 命令 / 动作 | 结果 |
| --- | --- | --- |
| 后端全量 JUnit | `mvn -f fams-backend/pom.xml test` | **通过**：158 用例、0 失败（含 `p14/GroupScopeGuardTest` 10、`engine/FixedDocCodeTest` 4、`p15/P15SecurityHardeningTest` 5） |
| 前端单测 | `npm test` | **通过**：审批 211 / 低值 66 / 工作台 121 / 认证 20 / 组织树 12，共 430 项、0 失败 |
| 权限契约 | `npm run check:perm` | **通过**：40 权限码、36 映射、68 集合 |
| 生产构建 | `npm run build` | **通过**（18.58s） |
| 生产产物 | `dist` 检索 `Fzidt@2026!` / `Fzidt@123` / 真实手机号 | **0 命中** |
| 健康检查 | `/api/health` | **UP** |

#### 数据基线只读复核

| 项 | 结果 |
| --- | --- |
| 公司层级 | 5 家，递归 CTE 路径三级完整（集团 → 研究院 → 至臻 / 新视 / 数源），根节点 1 个 |
| 数据规模 | 138 启用账号、29 启用部门、**76 台资产**（计划文档写 71 台，以本次实测为准） |
| 归属完整性 | 资产 / 部门 / 用户的孤儿 company 引用均 0 |
| 编码与范围 | 资产重复 `code` 0；角色 `data_scope` / `org_scope` 空值 0 |
| 临时数据 | E2E_ 测试资产 / 用户 / 单据残留 **0**（已清理 1 个失败请求遗留的 E2E 资产） |

#### API 端到端验收（README 第 7 节）

| 用例 | 账号 | 结果 |
| --- | --- | --- |
| 登录 + 顶栏公司名 | `admin`、陈铃、陈妍、付云杰、数源 R3（林卓平） | **5/5 通过**，公司名称与账号归属一致 |
| 资产列表可见性 | 同上 | admin 76 台 / 4 公司；陈铃 COMPANY 76 台（研究院及 3 家下级）；至臻 10 台仅至臻；新视 4 台仅新视；数源 R3 0 台（仅本人名下）——均符合 Q2 口径 |
| 按 id 跨公司 GET | 至臻 R4 → 研究院 E2E 资产 | **403**「无权访问其他公司的数据」（`assertRead` 生效） |
| 跨公司 PUT | 临时至臻 R2 账号 → 研究院 E2E 资产 | **403**「无权访问其他公司的数据」（行级断言，非权限码前置拦截） |
| 伪造归属 POST | 同上，`companyId` 填研究院 | **403**「不能把数据归属到其他公司」（`assertWrite` 生效） |
| 编号兜底 | `admin` 创建派发单传已占用 `FP20261000` | **通过**：服务端重写为 `FP20261001`，创建成功并清理 |
| `DELETE /all` 限制 | 未实际调用（避免误清空生产库） | 由 `GroupScopeGuardTest.clearLimitedToAllScope` 单测覆盖 |
| 按 id 越权 DELETE | 未实际调用（无非 ALL 且持 `fa:delete` 的账号，权限码先拦） | 由 `GenericService.remove` 的 `assertRead` 接入 + 单测覆盖 |

#### 备份与恢复演练

- 快照：`db-baseline/backup-d1-gate1-20261116.sql`（7,672,010 字节、39 张表，`mysqldump --single-transaction`）。
- 恢复：临时库 `fams_d1_restore_gate1` 导入后核对 `138 / 77 / 5 / 29`（资产 77 为快照时含 1 个待清理的 E2E 资产，清理后生产库为 76），临时库已 `DROP DATABASE` 清理。
- 演练通过；RTO/RPO 未量化，留待 D4 灾备演练补齐。

#### 仍未完成（门禁 1 不放行，D2 不得启动）

1. P0 剩余项：S-02 凭据/证书轮换（需管理员提供新凭据）、S-03 登出 token 失效与有效期收敛、S-05 权限 fail-closed、S-06 通用 PUT 的 status 服务端只读、S-07 审计 append-only、S-08 80 跳 443 与安全响应头（会改变当前 `http://localhost` 点测入口，需确认）、S-10 版本化迁移与自动备份。
2. `19-company-hierarchy-check.sql` / `20-scope-indexes.sql` / `21-role-datascope-backfill.sql` 未在生产库执行；本轮用等价只读 SQL 复核替代，索引与显式回填仍待执行。
3. 用户按 README 第 7 节验收表补测下钻 / 导出 / 跨公司负向、派发单复测，以及放行签字。
4. 文档修正：核对生产库发现旧角色权限描述与 `org_roles.permissions` 不符（R5 无 `fa:add` / `fa:edit`），已把 README 第 5 节改为职责摘要并指向角色管理页。

### D1 补充测试记录（2026-11-16，响应用户「未测项直接测试」）

#### A. 按 id 跨公司 DELETE（补齐原「未实际调用」项）

- 临时角色（`fa:view` + `fa:delete`）+ 临时至臻账号 + admin 在研究院建的临时资产，用至臻账号跨公司 DELETE。
- 结果：`status=403 code=403 msg=无权访问其他公司的数据`（`RowScopeGuard.assertRead` 生效）；admin 随后 GET 该资产仍 `code=0`，确认未被删除。
- 清理：临时资产 / 用户 / 角色删除后 `E2E_ 资产=0 / 用户=0 / 角色=0`，生产资产数恢复 76。

#### B. 19/20/21 迁移脚本在临时库验证（不碰生产库）

- 从 `db-baseline/backup-d1-gate1-20261116.sql` 克隆临时库 `fams_d1_script_test`（39 张表），把三脚本的 `USE fams` 改为临时库后各执行两遍。
- `19-company-hierarchy-check`：递归 CTE 输出三级完整路径（集团 → 研究院 → 至臻/新视/数源），`root_count=1`、孤儿/自引用/归属异常均 0；第二遍幂等提示 `already exists`。
- `20-scope-indexes`：6 个 `idx_*company*` 索引建成（fixed_assets / inventory_docs / org_departments / org_users / 折旧方案 / 折旧明细），第二遍全部 `already exists`。
- `21-role-datascope-backfill`：9 个角色补齐显式 `org_scope`/`data_scope`（R1~R8 + 领导班子），`empty_scope_rows=0`，第二遍无变化。
- 三脚本两遍均 `EXIT=0`，幂等性与复核 SELECT 通过；临时库已 `DROP`，临时副本已删。**生产库仍未执行这三条 DDL/DML**（保留到管理员窗口 + 快照后执行）。

#### C. 登出 token 失效现状（代码核查，S-03 确认未实现）

- `AuthController.logout()`（:29-33）仅 `return R.ok(true)`，注释「无状态会话：服务端无需清理，前端丢弃 token 即完成登出」。
- `JwtProvider` 无 token 版本号 / 黑名单；`JwtAuthFilter` 每次仅 `parse` 签名与有效期（`jwt-expire-minutes` 默认 480 分钟）。
- 结论：登出后旧 token 在有效期内仍可用，S-03 属实未实现，列为 D1 门禁 1 P0 阻断项，待实现「登出黑名单 + 有效期收敛」。

#### D. 报表接口范围过滤核查

- 生产库实测：`fixed_asset_report_depreciation_plan_details` / `fixed_asset_settings_depreciation_plans` 均 0 行；`fixed_asset_inventory_docs` 5 行带 `company_id`；`fixed_asset_depreciation_reports` 2 行、`fixed_asset_report_depreciation_details` 67 行、`fixed_asset_inventory_plans` 1 行**无 `company_id`，也无 `dept_id`（仅 `create_by`）**。
- `RowScopeGuard.isBusinessCollection` 仅纳入「有 `companyId` 列」+ 固资/低值/单据前缀集合，上述无归属列的报表表不在其中，列表查询不会追加公司过滤。
- 但实时折旧台账 `/depreciation/plan` 与试算走 `DepreciationService.calculate`，其资产来源 `genericService.list(ASSETS, …)`（:149）已过 `scopeRaw`，因此**按公司范围实时计算的报表不泄露跨公司数据**；持久化的 `REPORTS` / `DETAILS` 汇总表无公司归属，属已登记的 D2 契约扩字段项，不构成 D1 新增旁路。
- 报表下钻明细取自同一批已被上游断言过滤的资产列表（README 第 7 节口径），跨公司下钻负向由用户手动点测确认。

#### 本轮小结

- 已补测：按 id 跨公司 DELETE（403）、19/20/21 临时库幂等验证、登出 token 现状（S-03 未实现）、报表范围代码+数据核查。
- 未实际执行/未放行：`DELETE /all`（误清空风险，单测覆盖）、生产库 19/20/21 DDL、P0 剩余项 S-02/S-03/S-05/S-06/S-07/S-08/S-10、用户手动点测与放行签字。
- `GET /api/health` 复查 `status=UP`（14:10）。门禁 1 仍不放行，D2 未启动。

### P0 代码整改（用户授权范围：不需凭据、不改点测入口的 S-03/S-05/S-06/S-07，2026-11-16）

| 项 | 实现 | 验证 |
| --- | --- | --- |
| S-03 登出失效 | JWT 加 `jti`（避免同秒登录 token 相同）；新增 `TokenBlacklist`，`logout` 带 Authorization 头把 token 撤销，`JwtAuthFilter` 解析前查黑名单命中按 401；前端 `auth.js` / `store/user.js` 改为「先带 token 通知后端、再清本地」；`jwt-expire-minutes` 默认 480 → 30 | `P15SecurityHardeningTest.logoutRevokesToken`、`tokenExpiryReadable`：登出后旧 token 401 |
| S-05 fail-closed | `PermissionPolicy` 启动期校验所有注册集合都在权限契约登记，否则拒绝启动；契约加载失败不再静默降级；运行时注册表内未登记集合一律拒绝；`DELETE /all` 叠加系统管理员 R1 校验 | `P15SecurityHardeningTest.failClosed`、`P0ScaffoldTest`（未知 key 仍 404） |
| S-06 status 服务端只读 | `GenericService` 对带 `stock` 的低值单据在 `create/update/batch` 增加状态守卫：非 R1 业务账号只能建 DRAFT、不能通用 PUT 改状态；审批端点走 `updateQuietly` 不受影响；管理员保留维护通道 | `P4LowValueStockTest` 全绿、`P15SecurityHardeningTest.lowValueStatusServerOwned` |
| S-07 审计 append-only | `operation-logs` 加入契约 `immutable`（通用改/删 403）；新增 `AuditLogService` 统一写日志，补 IP（X-Forwarded-For）、UA、traceId、公司标识写入现有 detail/ip/operatorOrg 列（不引入 DDL）；`BusinessAuditAspect` 覆盖登录/审批/折旧/导入/数据重置，失败也留痕且不含口令 | `P15SecurityHardeningTest.operationLogsImmutable`、前端/后端全量门禁 |

- 本轮自动门禁：后端 `mvn test` **158 用例 0 失败**；前端 `npm test` **430 项 0 失败**；`check:perm` 通过；`npm run build` 通过。
- 新增源码 4 个 Java 文件头字节均为 `706163`（UTF-8，非 UTF-16LE）。

##### 重建生产栈与 API 复核（2026-11-16 14:40）

- `stop-prod.ps1 → build-prod.ps1（四步门禁全绿）→ start-prod.ps1` 完成，站点短暂中断后恢复。
- 健康检查 `GET /api/health`：`200 status=UP`。
- S-03：`POST /api/auth/logout` 后旧 token 调 `/api/auth/profile` → **401**（token 串已带 `jti`）。
- S-05：`GET /api/totally-unknown-collection` → **404**（未知 key 仍走契约 404，不被 fail-closed 误伤）。
- S-07：`PUT/DELETE /api/operation-logs/{id}` → **403**（审计表 append-only 生效）。
- S-06：非管理员 `18120648615` 直接建 `status=DONE` 的领用单 → **403「单据状态由审批流程驱动，新建仅允许草稿 DRAFT」**；合法审批仍走 `updateQuietly`。
- 临时验证脚本已全部清理，未产生临时业务数据。

##### 修复：管理员登录工作台报「无权限访问该数据：operation-logs」（14:49）

- 根因：S-07 把 `operation-logs` 设为 append-only 后，前端 `router/index.js` 的 `afterEach` 仍用 `auditStore.logOp()` 经通用 CRUD **新增**「页面访问」日志；管理员有 `sys:log` 会发出该 POST，被服务端 immutable 拒绝并弹出 403 红条。后端 `GET /api/operation-logs` 实测 200，读取本身无问题。
- 修复：移除前端页面访问写日志（高频读类访问本不该审计，业务写操作已由后端 `OperationLogAspect` / `BusinessAuditAspect` 统一落库）；`store/audit.js` 的 `logOp`/`clearOpLogs` 改为 no-op 并清理无用 import，防止后续误写。
- 回归：前端 5 组单测全绿；`build-prod.ps1` 四步全绿并重启；生产 `GET /api/health` = UP；源码检索前端对 operation-logs 的 create/post/clear 调用 = 0。
- **用户手动点测确认（2026-11-16）**：403 红条不再出现；分别登录数研院、至臻、新视三家账号，顶栏公司名显示正确、无报错。

- 仍未完成（需确认/点测）：S-02 证书轮换（需 CA 签发证书或用户确认沿用自签）、S-08 80→443（会改点测入口，需用户确认）、README 第 7 节其余手动点测项与放行签字。S-02 凭据轮换（应用 DB 口令/admin 口令/JWT 外置）与生产库 19/20/21 DDL 已于 2026-11-16 15:15 完成。门禁 1 仍不放行，D2 未启动。

### 生产库 19/20/21 DDL 与 S-02 凭据轮换落地（2026-11-16 15:15）

| 项 | 结果 |
| --- | --- |
| 执行前快照 | `db-baseline/backup-d1-pre-ddl-20261116.sql`（13,891,204 字节，`mysqldump --single-transaction`） |
| 19 层级复核 | 5 家公司三级路径完整（集团→研究院→至臻/新视/数源），`root_count=1`，fixed_assets/org_departments/org_users 孤儿引用各 0；新增 `idx_org_companies_parent` |
| 20 范围索引 | 6 个 `idx_*company*` 索引建成：fixed_assets / inventory_docs / org_departments / org_users / 折旧方案 / 折旧明细 |
| 21 角色范围 | 9 个角色显式 `org_scope`/`data_scope`（R1~R8 + 领导班子），`empty_scope_rows=0` |
| 三脚本 EXIT | 均 `EXIT=0`，复核 SELECT 通过，幂等 |
| S-02 应用 DB 口令 | `fams@127.0.0.1` 由 `FamsDb@2026!` 轮换为新口令；`application-{dev,prod,e2e}.yml` 与启动/E2E 脚本同步；旧口令实测 1045、新口令实测通过 |
| S-02 admin 口令 | BCrypt 哈希已入库，`password_reset_at=2026-11-16 15:02:50`；新口令登录 200，旧口令 401 |
| S-02 JWT | `README.md` 过期密钥字面量已清除，密钥继续由 `deploy/.secrets/jwt-secret` 外置注入 |
| 凭据清理 | 一次性轮换脚本 `_s02_*.ps1` 与含明文口令的 `_s02_values.json` 已删除 |
| 重建与探活 | stop→build-prod（四步全绿：158 JUnit / 430 前端 / check:perm / 构建）→start；`GET /api/health` = UP，新 admin 口令登录 200 / 旧口令 401 |
| 记忆同步 | `project_db_privilege.md` 应用口令更新为新值，标注 DDL 管理员凭据未轮换 |

### 门禁 1 验收测试（2026-11-16 15:23，用户委托由 AI 执行并核验结果）

> 用户决策（2026-11-16）：S-08（80 跳 443 + 安全响应头）暂缓到 D4，保持 `http://localhost` 点测入口；S-02 证书轮换继续用自签，CA 证书列为 D4 上线检查单待办；README 第 7 节点测由 AI 代为执行并仔细核验结果。

#### A. 资产可见范围（6 个真实账号，API 实测）

| 账号 / 范围 / 公司 | 可见资产数 | 分布 | 判定 |
| --- | ---: | --- | --- |
| admin / ALL / 研究院 | 76 | 研究院 51、数源 11、至臻 10、新视 4 | PASS |
| 陈铃 / COMPANY / 研究院 | 76 | 同上（本公司 + 3 家下级） | PASS（Q2 层级展开生效） |
| 陈妍 / COMPANY / 至臻 | 10 | 仅至臻 10 | PASS |
| 付云杰 / DEPT / 新视 | 4 | 仅新视 4 | PASS |
| 陈学知 / DEPT_ONLY / 研究院 | 0 | 名下无资产 | PASS |
| 林佳怡 / DEPT_ONLY / 数源 | 0 | 名下无资产 | PASS |

#### B. 三级组织树（API + UI）

- API `org-companies` 返回 5 家：集团(根) → 研究院 → 至臻/新视/数源，`parent_id` 三级挂接正确。
- UI 无头浏览器（Playwright）登录 admin → 公司管理页，五家公司全名渲染齐全、无 JS 错误 → PASS。

#### C. 跨公司读写删负向断言（临时角色+用户限定至臻，诱饵资产建于研究院，全部已清理）

| 断言 | 结果 |
| --- | --- |
| 按 id GET 研究院资产 | PASS 403 |
| 按 id PUT 研究院资产 | PASS 403 |
| 按 id DELETE 研究院资产 | PASS 403 |
| BATCH PUT 研究院资产 | PASS 403 |
| POST 伪造 `companyId=研究院` | PASS 403 |
| GET 本公司（至臻）资产 | PASS 200 |
| `DELETE /api/fixed-assets/all`（非管理员） | PASS 403 |
| PUT `operation-logs/{id}`（append-only） | PASS 403 |
| 清理复核 | 临时资产/用户/角色各 0，生产资产数恢复 76 |

#### D. 派发单编号修复复测

- admin 创建派发单传已占用编号 `FP20261000` → 服务端重写为 `FP20261001`，无 409 → PASS；测试数据已清理。

#### E. 无头浏览器 E2E（生产形态 `http://localhost`）

| 组 | 结果 |
| --- | --- |
| 00-auth-session（登录/令牌失效/换账号/版本一致/深链刷新） | 7 passed |
| 02-permission（受限菜单/停用角色即时失效） | 2 passed |
| 04-permission-matrix（P4-01~P4-23 权限矩阵与数据范围） | 23 passed |
| 合计 | **32 passed / 0 failed**；运行后 E2E_ 用户/角色/资产残留 0 |

#### 门禁 1 结论

服务端断言（get/create/update/delete/batch/clear/审批/导入）、公司层级可见范围、跨公司读写删 403、审计 append-only、三级组织树、派发单编号全部通过；P0（S-03/S-05/S-06/S-07）与 S-02 凭据轮换已闭环，生产库 19/20/21 DDL 已执行。按用户决策，**S-08 与 CA 证书轮换转入 D4**，不构成本门禁阻断。门禁 1 自动 + 只读复核 + 数据复核 + 手动点测（AI 代执行）全部通过，**待用户签字放行**；签字前 D2 不启动。


---

## 3. 门禁 2 证据（D2 多公司可用，2026-11-16）

> 用户 2026-11-16 签字放行 D1 后启动 D2。点测按用户要求由 AI 代为执行并仔细核验。

### 3.1 契约单一真源与生产 DDL

- 契约字段（`schema.js` → `export:contract`）：org-companies `path`/`level`；org-users `scopeCompanyIds`；low-value-items 与三类低值单据 `companyId`；system-params / system-workflow-flows `companyId`；处置单 `transfereeCompanyId`；新增 `CONFIG_SCOPE` 枚举。重新导出无差异（hash 对比一致）。
- 生产库 DDL：快照 `db-baseline/backup-before-d2-20261116.sql`（13,996,012 字节）；迁移 22/23/24 幂等执行 `EXIT=0`。
  - 22：5 家公司三级 path 回填（集团 → 研究院 → 至臻/新视/数源），level 1/2/3 正确。
  - 23：low_value_items 与三类单据 company_id 回填，四表 missing=0；存量物品归研究院、单据按部门/创建人归公司。
  - 24：配置表 company_id、处置单 transferee_company_id、3 个查询索引建成。
- 处理过的风险：`export:db` 由 mock 源重新生成 schema/seed 会覆盖历史手工定制（期初切换日、字典项）并回退口令；已从 HEAD 干净重建三个生成文件（UTF-8 无 BOM）、仅追加 D2 列并重放 S-02 口令轮换；前端 mock 源保持 123456（前端单测口径），后端 seed 用新 admin 口令（后端 JUnit 口径）。

### 3.2 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| 后端全量 JUnit | 162 passed / 0 failed（原 158 + D2 新增 4：角色池公司过滤、全集团放行、授权公司兼任、JSON 解析） |
| 前端 5 组单测 | 全通过（approval/lowValue/workbench/auth/orgTree） |
| check:perm | 通过：40 权限码 / 36 映射 / 68 集合 |
| 契约重新导出 | 无差异 |
| build-prod.ps1 四步 | 全绿，jar + dist 生成 |
| 生产重建 | stop→build→start；`GET /api/health` = UP |

### 3.3 公司视角与数据隔离（生产 API + UI 实测）

| 项 | 结果 |
| --- | --- |
| org-companies path/level 出现在 API | PASS：集团 `path=/mwikk1bz12 level=1` |
| low-value-items / 单据 companyId 出现在 API | PASS：物品 16 条 companyId=研究院；9 张低值领用单 companyId 已回填 |
| 公司视角切换器（顶栏） | PASS：无头浏览器渲染五家公司选项、无 JS 错误；切换账号/登出清理视角会话 |
| 视角头不越权 | PASS：至臻用户伪造 `X-Company-View=集团` 仍只见 10 台（授权集合为准） |
| 显式授权公司字段 | PASS：`scopeCompanyIds` 读写往返成功并还原 |
| 配置默认对所有公司可见 | PASS：至臻用户可见 11 个流程模板（集团默认不被公司过滤） |
| 审批角色池按单据公司 | PASS：D2 单元断言（A 公司用户看不到 B 公司单据、全集团放行、授权公司兼任） |
| 流程公司级覆盖 | PASS：`flowOf` 公司覆盖优先、集团默认兜底，未配置时行为不变 |
| 组织架构导入「上级公司」列 | PASS：模板新增列、多趟创建并写入 parentId；P9 14 项测试通过 |

### 3.4 回归 E2E（生产 `http://localhost`）

| 组 | 结果 |
| --- | --- |
| 00-auth-session | 7 passed |
| 02-permission | 2 passed |
| 04-permission-matrix | 23 passed |
| 合计 | **32 passed / 0 failed**；运行后 E2E_ 用户/角色/资产残留 0 |
| D2 公司视角切换器专项 | 1 passed |

### 3.5 门禁 2 结论

契约扩字段 + 生产 DDL + 公司视角切换器 + 角色池/流程按公司过滤 + 低值与配置公司归属 + 组织导入上级公司列全部通过；契约重新导出无差异、构建四步全绿、生产健康 UP、E2E 无残留。资产总数 76、公司总数 5 未变。**D2 验收全通过，待用户签字放行**；签字前 D3 不启动。


---

## 4. 门禁 3 证据（D3 集团管控与工程化，2026-11-16）

> 用户 2026-11-16 签字放行 D2 后启动 D3。点测按用户要求由 AI 代为执行并核验。

### 4.1 自动化门禁

| 门禁 | 结果 |
| --- | --- |
| 后端全量 JUnit | 169 passed / 0 failed（原 162 + D3 新增 7：乐观锁 409、trace 透传/生成、actuator 探活、转让建卡/幂等/缺受让公司） |
| 前端 5 组单测 | 全通过 |
| check:perm | 通过：40 权限码 / 36 映射 / 68 集合 |
| 契约重新导出 | 无差异；新增 ASSET_STATUS.TRANSFERRED_OUT（已转出） |
| build-prod.ps1 四步 | 全绿；生产 stop→build→start 后健康 UP |

### 4.2 并发一致与库存不超卖

- 乐观锁：版本断言下推到条件 UPDATE（`SqlProvider.updateById` + `expectedVersion`），受影响行数=0 抛 409；JUnit `staleVersionReturns409` 通过。
- 库存原子扣减：新增 `updateColumnConditional`（`SET col=col+delta WHERE pk AND col+delta>=floor`），`applyStock` 受影响行数=0 抛 STOCK_INSUFFICIENT，消除读后写超卖窗口。
- 导入整体事务：通用 `DataImportService` 整批模式改为 TransactionTemplate 包裹，任一行落库失败抛 RowFailure 全批回滚；专项导入（固资/低值/组织）原已有整体/逐行事务。

### 4.3 跨公司转让闭环（Q4）

| 项 | 结果 |
| --- | --- |
| 处置单新增「受让公司」字段 | PASS：`transfereeCompanyId` 已在契约；表单仅 TRANSFER_OUT 显示、必填且不得等于转出公司 |
| 完结闭环 | PASS：`transferOutClosure` 原卡置 TRANSFERRED_OUT（出账留痕在新卡 sourceTag 与单据凭证号），受让公司幂等建新卡（IDLE、沿用原值），以系统身份创建避免跨公司范围误伤 |
| 幂等 | PASS：同源新卡已存在则跳过，不重复建卡 |
| 缺受让公司 | PASS：仅核销原卡、告警待人工补录 |
| 单测 | 3 项全通过（建卡/幂等/缺受让） |
| 调拨边界 | 调拨仍限同公司内（原 TRANSFER 逻辑未改），跨公司只走转让 |

### 4.4 集团汇总与下钻

- 报表新增「公司统计」Tab：同一份授权范围内的 assetLedger 按 companyId 聚合（数量/原值/净值/占比），集团合并与各公司分组同源，保证「合并 = 下钻之和」；点击公司行下钻到该公司资产明细。
- 导出支持公司维度并带公司列。无头浏览器验证：公司统计 Tab 渲染、下钻按钮可见、无 JS 错误。

### 4.5 可观测性与工程化

| 项 | 结果 |
| --- | --- |
| 链路追踪 | `TraceIdFilter` 生成/透传 X-Trace-Id 写 MDC 并回传响应头；审计日志 traceId 与 logback 同源；生产实测回传 d3-probe-001 |
| 日志滚动 | `logback-spring.xml` 按天+大小滚动（50MB/文件、30 天/1GB，审计 90 天/2GB），MDC traceId 输出 |
| 可观测端点 | actuator health/info/metrics；生产实测 `/api/actuator/health`=UP（免登录）、`/api/actuator/metrics`=401（需认证） |
| nginx | 访问日志含 traceId/耗时/UA；client_max_body_size 20m；API 限流 30r/s burst=60 |
| 前端错误上报 | http.js 可注入上报钩子，5xx/网络异常带 traceId 上报，失败不影响业务 |
| 自动备份 | `scripts/backup-prod-db.ps1` 只读快照 + 滚动保留（默认 14 份），口令走环境变量；实跑生成 14MB 快照 |
| 恢复演练 | 备份快照可恢复；RTO/RPO 量化在 D4 投产演练中记录 |

### 4.6 回归 E2E 与数据复核

| 项 | 结果 |
| --- | --- |
| 00-auth-session / 02-permission / 04-permission-matrix | 32 passed / 0 failed |
| 报表公司维度专项 | 1 passed |
| E2E_ 残留 | 用户 0 / 角色 0 / 资产 0 |
| 资产只读对账 | 总数 76 未变；IN_USE 67 / IDLE 7 / DISPOSED 2；TRANSFERRED_OUT 0、派生卡 0（未污染真实数据） |
| 生产健康 | GET /api/health = UP；actuator health = UP |

### 4.7 门禁 3 结论

并发乐观锁 409、库存原子扣减、导入整体事务、跨公司转让闭环、集团报表下钻、链路追踪/日志滚动/actuator/限流/自动备份全部通过；169 JUnit + 32 E2E 全绿、构建四步全绿、生产健康 UP、真实资产零污染。**D3 验收全通过，待用户签字放行**；签字前 D4 不启动。


---

## 5. 门禁 4 证据（D4 投产放行与交接，2026-11-16）

> 用户 2026-11-16 签字放行 D3 后启动 D4。本阶段不依赖任何外部接口，S-08/CA 证书按用户决策列为保留项。

### 5.1 上线检查单

见 `docs/qa/go-live-checklist.md` 九节：构建门禁、凭据、传输、数据备份、权限、监控、发布交接、残留风险登记、放行结论。

### 5.2 自动化门禁（全部通过）

| 门禁 | 结果 |
| --- | --- |
| 后端全量 JUnit | 169 passed / 0 failed |
| 前端 5 组单测 | 全通过 |
| check:perm | 40 权限码 / 36 映射 / 68 集合，通过 |
| 契约导出漂移门禁 | 导出前后哈希一致；已固化进 build-prod.ps1（前端测试失败也改为立即中止） |
| build-prod.ps1 | 四步全绿；生产 stop→build→start 后健康 UP |
| E2E 回归 | 32 passed + 报表专项 1 passed；E2E_ 残留 0 |

### 5.3 权限矩阵

- `docs/qa/role-permission-matrix.md`：从生产库 `org_roles` 实测生成，9 角色 × dataScope/orgScope/权限码数/状态 + 逐角色权限码明细 + 隔离断言 + **复核签字栏**。
- 关键口径：ADMIN ALL、ASSET/FINANCE/WAREHOUSE COMPANY、LEADER DEPT、USER DEPT_ONLY、AUDITOR/LEADERSHIP ALL（只读报表）、VP DISABLED。
- 复核签字栏待各角色负责人逐项确认（放行前完成）。

### 5.4 备份与恢复演练（RTO/RPO）

| 项 | 结果 |
| --- | --- |
| 备份脚本 | `scripts/backup-prod-db.ps1` 生成 `auto-backup-20261116-170858.sql`（7.8MB，无 BOM，字节头自检） |
| 编码缺陷修复 | 发现并修复 PowerShell `>` 重定向产生 UTF-16LE 备份不可恢复的问题：改用 `--result-file`；历史 3 份 UTF-16LE 快照已转 UTF-8 并验证可恢复 |
| 恢复演练 | 临时库 `fams_dr_drill_20261116` 恢复成功，RTO **6.02s**；39 表/76 资产/5 公司/9 角色/138 账号与生产一致；演练库已 DROP |
| RPO | 当前人工触发备份，RPO = 备份间隔；正式对外前需配定时任务 |

### 5.5 可观测性与运维文档

- `deployment.md` 第 3A 节补：自动备份、恢复演练、健康检查端点（/api/health 与 /api/actuator/health 免登录、metrics 需认证）、traceId 串联、版本标记与回滚路径。
- 生产实测：health=UP、actuator health=UP、metrics=401、traceId 回传正常。

### 5.6 残留风险与用户决策

| 编号 | 风险 | 用户决策 |
| --- | --- | --- |
| R-01 | S-08：80 明文入口、无 HSTS/CSP/帧防护 | 保持 `http://localhost` 点测入口，对外前启用 |
| R-02 | S-02：自签证书、私钥曾入库 | 本机演示继续自签，对外前换 CA 证书 |
| R-03 | M-07：首登改密仅提示不阻断 | 本期不改 |
| R-04 | 无指标告警通道 | 人工巡检，对外前接 APM |
| R-05 | 单机无灾备实例 | 以备份恢复为准，对外前建备用实例 |

> 本期投产**不以外部组织/流程引擎接口为前提**；后续待接口阶段见 `docs/external-integration-prerequisites.md`。

### 5.7 文档复核修正（2026-11-16，放行前交叉核验）

放行前对 D4 六份文档与代码/配置/仓库状态做交叉复核，发现并修正 3 项实质问题：

| # | 问题 | 修正 | 验证 |
|---|---|---|---|
| 1 | `VERSION`/检查单 7.1 把 HEAD `649b6e6` 当本版本标记，但该 commit 不含任何本期改造（70+ 文件未提交），据此回滚会拿到空版本 | VERSION 标注"待提交后重打 tag"；检查单 7.1 改为 ⚠️；`deployment.md` §3A.4 补打 tag 前置条件 | 仍是待提交状态，须在提交后用新 HEAD 重打 tag 并回写 VERSION |
| 2 | 检查单 2.4 声称"jar/dist 无口令明文 ✅"，但 `application-prod.yml` 有明文 DB 口令默认值，且 `deployment.md` 明写了该值 | prod 配置改 `${DB_PASSWORD}` 占位符；`start-prod.ps1` 从 `deploy/.secrets/db-password`（git 忽略）注入；检查单 2.4/审计报告 S-02/README 凭据表改准确口径 | `stop→build-prod（全门禁绿）→start` 后 `/api/health`=UP、actuator=UP；prod 配置与部署文档检索口令明文 0 命中 |
| 3 | 全新环境按 `deployment.md` 建库只有 8 角色，生产为 9 角色（领导班子为手工创建，11/21 脚本只 UPDATE 不 INSERT），灾备重建缺角色 | 新增幂等脚本 `25-leadership-role.sql`；`deployment.md` 新增 §3.5.1 新环境重建顺序并补全 19~25 迁移记录 | 生产库 9 角色/76 资产/5 公司/领导班子 1；脚本 25 `WHERE NOT EXISTS` 命中，`would_insert=0` 幂等 |

另修正两处轻微口径：`stage-gates.md` 头部测试口径 4 组→5 组；权限矩阵注明 orgScope 口径冲突时以生产实测表为准。

### 5.8 门禁 4 结论与放行项

自动化门禁、数据复核、备份恢复演练、放行前文档交叉复核全部通过；残留风险 R-01~R-05 已登记且用户确认本机演示可接受。**待完成**：权限矩阵逐项复核签字、提交后重打版本 tag、交付仓 dry-run 后同步、用户按检查单点测验收。全部完成后由用户签字宣布投产。
