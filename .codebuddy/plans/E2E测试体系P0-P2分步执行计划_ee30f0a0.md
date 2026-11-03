---
name: E2E测试体系P0-P2分步执行计划
overview: 针对「全量 E2E 全绿、用户一测即错」的结构性缺陷，按 P0/P1/P2 三批落地五层测试体系：真实角色权限矩阵、默认拒绝的网络守卫、UI 主操作巡检、契约单一事实来源、状态机与数据形态回归，并明确每步责任角色、时间窗口、验收标准与风险应对。
todos:
  - id: p0-defect-baseline
    content: 建立逃逸缺陷台账并登记本轮四个问题及对应用例
    status: completed
  - id: p0-guard-exact
    content: 改造 net.ts 为请求级豁免并移除整页 403 放行
    status: completed
    dependencies:
      - p0-defect-baseline
  - id: p0-prefetch-noise
    content: 主布局与工作台按权限懒加载，消除业务角色首屏 403
    status: completed
    dependencies:
      - p0-guard-exact
  - id: p0-clean-allowlist
    content: 清理六份 spec 的 403 豁免并逐条写明理由
    status: completed
    dependencies:
      - p0-prefetch-noise
  - id: p0-role-matrix
    content: 新增真实角色×资源×方法权限矩阵用例
    status: completed
    dependencies:
      - p0-clean-allowlist
  - id: p0-primary-actions
    content: 新增低值三类与固资派发、借出主操作巡检
    status: completed
    dependencies:
      - p0-role-matrix
  - id: p0-persona-journeys
    content: 新增资产使用人、部门主管、仓管员三条端到端旅程
    status: completed
    dependencies:
      - p0-primary-actions
  - id: p0-regression
    content: 用 [skill:playwright-cli] 跑全量回归并输出 CP0 报告
    status: completed
    dependencies:
      - p0-persona-journeys
  - id: p1-permission-contract
    content: 新增资源权限契约并改造 PermissionPolicy 加载
    status: completed
    dependencies:
      - p0-regression
  - id: p1-check-perm
    content: 新增 check:perm 脚本并接入构建流程
    status: completed
    dependencies:
      - p1-permission-contract
  - id: p1-version-guard
    content: 新增版本接口、刷新横幅与 SMK-07 用例
    status: completed
    dependencies:
      - p1-permission-contract
  - id: p1-state-machine
    content: 新增单据状态机矩阵与库存不变量断言
    status: completed
    dependencies:
      - p1-permission-contract
  - id: p2-ledger-fixture
    content: 新增期初台账夹具与数据形态闭环用例
    status: completed
    dependencies:
      - p1-state-machine
  - id: p2-asset-detail-real
    content: 资产详情移除演示数据并改按 assetId 聚合
    status: completed
    dependencies:
      - p2-ledger-fixture
  - id: p2-nightly-metrics
    content: 新增生产库副本夜间任务与质量指标简报
    status: completed
    dependencies:
      - p2-asset-detail-real
---

## 用户需求

将测试体系整改的 P0 / P1 / P2 事项转化为可直接执行的分步计划，并满足以下交付要求：

- 每项任务包含：目标与优先级、执行步骤与先后顺序、责任角色、时间/里程碑、资源与依赖、完成标准与验收方式、风险与应对。
- 按优先级分批推进，明确 P0 的紧急处理时间窗口。
- 每个阶段设置检查点，用于跟踪进度并调整后续步骤。

## 背景与目标

当前 149 条 E2E 全部通过，但用户手工点击「低值资产 → 新增领用」即报「无权限访问该数据：low-value-requisition」，「已有草稿提交审批」也不通，说明测试路径与真实使用路径脱节。

整改目标：

- 用真实角色、真实权限集、真实数据形态驱动测试，覆盖「建单 → 提交 → 审批 → 完结」完整链路。
- 未预期的 4xx 一律判失败，不再用整页 403 豁免掩盖问题。
- 每个页面至少有一条「主操作可执行」用例，每个真实角色至少一条端到端旅程。
- 建立权限单一事实来源与客户端版本一致性机制，杜绝前后端口径漂移与旧包误测。

## 范围

- P0（紧急）：收紧守卫、真实角色权限矩阵、主操作巡检、真实角色旅程。
- P1：权限映射契约化与校验脚本、版本一致性、单据状态机矩阵。
- P2：期初数据形态回归、资产详情真实记录、夜间生产副本与质量指标。

## 一、总体策略与判定口径

整改不是「再加用例」，而是更换判定标准：**真实角色 + 真实数据 + 默认拒绝**。测试分层与依赖关系如下：

```mermaid
flowchart LR
  P0A[P0-1 缺陷基线] --> P0B[P0-2 守卫精确化]
  P0B --> P0C[P0-3 预取噪声治理]
  P0C --> P0D[P0-4 真实角色权限矩阵]
  P0D --> P0E[P0-5 主操作 dry-run]
  P0E --> P0F[P0-6 人设旅程]
  P0F --> CP0[CP0 全量回归与评审]
  CP0 --> P1A[P1 权限契约化]
  P1A --> P1B[P1 版本一致性]
  P1B --> P1C[P1 状态机矩阵]
  P1C --> CP1[CP1 阶段评审]
  CP1 --> P2A[P2 期初数据形态]
  P2A --> P2B[P2 资产详情真实记录]
  P2B --> P2C[P2 夜间副本与指标]
```

统一验收口径：

- 全量套件 `0 failed`，且「未预期 4xx/5xx = 0」。
- 新增用例必须使用真实种子角色（`ROLE_USER` / `ROLE_LEADER` / `ROLE_WAREHOUSE` / `ROLE_ASSET` / `ROLE_FINANCE`），admin 仅用于造数与清理。
- 所有 E2E 数据使用 `E2E_` 前缀并在 `afterAll` 清理；禁止自动清空业务数据。

## 二、P0：紧急处理（时间窗 2026-11-02 15:00 至 11-04 18:00）

### P0-1 建立逃逸缺陷基线（优先级最高，30 分钟）

- 目标：把本轮手工发现的缺陷固化为可追踪条目，作为整改验收基准。
- 步骤：

1. 新建 `docs/qa/escaped-defects.md`，登记「新增领用 403」「草稿提交失败」「假借出/假维修状态」「资产详情假单据」四条。
2. 每条记录：现象、根因、发现方式、对应用例编号、责任人、状态。
3. 在 `README.md` 增加缺陷回灌规则：手工发现的问题当天必须转为 `[BUG-xxx]` 用例。

- 责任角色：测试负责人（登记与验收）、AI 编码代理（整理）。
- 依赖：无。
- 完成标准：四条缺陷均有根因与用例编号，且能对应到后续新增 spec。
- 验收：文档评审通过，条目与 P0-4/P0-6 用例一一对应。

### P0-2 守卫精确化：取消整页 403 放行（优先级最高，2 小时）

- 目标：让权限错误不再被测试主动吞掉。
- 步骤：

1. 改造 `tests/e2e/fixtures/net.ts`：新增 `allowRequest(pattern, reason)`，按「方法 + URL」精确豁免；移除或废弃 `allowStatus` 整页放行。
2. 逐个替换现有 9 处 `allowStatus: [403]`（`02-permission`、`04-permission-matrix`、`07-low-value-flow`、`08-approval-center`、`09-workbench-reports`、`11-approval-collab`）。
3. 每处豁免必须写明原因（例如 `ROLE_LEADER` 无 `org:user` 读权限）。
4. `assertClean()` 增加提示：列出未豁免的 URL，便于定位。

- 责任角色：AI 编码代理（改造）、测试负责人（复核豁免理由）。
- 依赖：P0-1 完成。
- 完成标准：代码中不再存在整页 `allowStatus: [403]`；所有豁免精确到 URL。
- 验收：`grep allowStatus` 仅剩 401/409 等业务负例；全量套件可运行。

### P0-3 预取噪声治理：消除无权资源的启动请求（优先级高，3 小时）

- 目标：从源头消除业务角色登录后大量 403，避免测试靠豁免掩盖。
- 步骤：

1. 排查 `MainLayout.vue` 与工作台初始化逻辑，识别日志、消息、模板、系统参数、字典类型的预取。
2. 按权限懒加载：无对应权限码时不发起请求；有权限时再加载。
3. 复核业务必需读权限：`org-users`、`system-dict`、`low-value-settings` 等若业务表单依赖，改为「持有任一相关业务码即可读」，由前后端负责人共同确认。
4. 以 `ROLE_LEADER`、`ROLE_USER`、`ROLE_WAREHOUSE` 登录，检查 Network 无 4xx、Console 无 ApiError。

- 责任角色：前端负责人（预取改造）、后端负责人（读权限口径）、AI 编码代理（执行）。
- 依赖：P0-2 完成。
- 完成标准：三类业务角色登录工作台与低值页面时，无未豁免 403。
- 验收：新增断言「业务角色首屏无 4xx」通过；P3/P5 相关用例回归通过。
- 风险：裁剪过度会导致下拉为空，需保留「业务必需读」白名单。

### P0-4 真实角色权限矩阵（优先级最高，4 小时）

- 目标：用种子角色真实权限集替代手挑权限，自动发现前后端口径漂移。
- 步骤：

1. 新增 `tests/e2e/fixtures/permissionMatrix.ts`：定义资源清单（集合 key × 方法 × 所需码）与角色来源（通过 `/api/org-roles` 读取真实 `permissions`）。
2. 新增 `tests/e2e/12-role-permission-matrix.spec.ts`：

    - 对每个种子角色 × 每个资源 × GET/POST/PUT/DELETE 调接口。
    - 有码：不得返回 403（允许 422 参数校验）；无码：必须返回 403。
    - 对关键页面抽样断言：按钮可见性与权限码一致。

3. 覆盖低值领用/入库/退库、固资 5 类单据、组织与系统资源。

- 责任角色：AI 编码代理（实现）、测试负责人（矩阵口径确认）、业务代表（角色权限确认）。
- 依赖：P0-3 完成（避免噪声干扰）。
- 完成标准：矩阵覆盖全部资源×方法；种子角色全部纳入。
- 验收：矩阵全绿；人为把 `lv:requisition` 从后端移除可立即变红（反向验证一次）。

### P0-5 主操作 dry-run 巡检（优先级高，3 小时）

- 目标：把「页面能打开」升级为「主操作能执行」。
- 步骤：

1. 新增 `tests/e2e/13-primary-action-smoke.spec.ts`，声明式配置 `primaryActions`：页面、按钮、弹窗标题、必填默认值。
2. 首批覆盖：低值新增入库/领用/退库、固资派发/借出。
3. 每个动作执行「点击 → 弹窗可见 → 校验默认值 → 取消」，监听 4xx 与「无权限」toast。
4. 逐步补充其他模块主操作。

- 责任角色：AI 编码代理、测试负责人（动作清单）。
- 依赖：P0-3、P0-4。
- 完成标准：5 个主操作全部纳入；任一操作返回 4xx 即失败。
- 验收：低值新增领用在 `ROLE_LEADER` 下通过；人为回滚权限修复可复现失败。

### P0-6 真实角色人设旅程（优先级最高，4 小时）

- 目标：每个角色至少一条「建单 → 提交 → 审批 → 完结」端到端。
- 步骤：

1. 新增 `tests/e2e/14-persona-journeys.spec.ts`。
2. 旅程一：`ROLE_USER` 建领用 → 提交 → `ROLE_LEADER` 审 → `ROLE_WAREHOUSE` 审 → 完结，校验库存与轨迹。
3. 旅程二：`ROLE_LEADER` 建派发 → 提交 → 资产管理员审 → 完结，校验资产状态与使用人。
4. 旅程三：`ROLE_WAREHOUSE` 建入库 → 完结 → 库存回补。
5. 全部通过界面点击，admin 仅用于造数与清理。

- 责任角色：AI 编码代理、测试负责人（旅程设计）、业务代表（流程确认）。
- 依赖：P0-4、P0-5。
- 完成标准：3 条旅程全绿，且不依赖 admin 执行业务动作。
- 验收：旅程截图进入报告；任一环节权限不符即失败。

### P0 检查点

| 检查点 | 时间 | 内容 | 通过标准 | 不通过处理 |
| --- | --- | --- | --- | --- |
| CP0-A | 11-03 18:00 | 守卫精确化 + 预取治理 | 业务角色首屏 0 未豁免 4xx | 回退预取改造，先按 URL 白名单收敛 |
| CP0-B | 11-04 12:00 | 权限矩阵 + 主操作巡检 | 矩阵全绿，5 个主操作通过 | 缩小矩阵范围，优先保留低值/固资单据 |
| CP0-C | 11-04 18:00 | 人设旅程 + 全量回归 | 全量 0 failed，未预期 4xx=0 | 顺延 1 天，先保矩阵与旅程 |


紧急窗口说明：P0 必须在 11-04 18:00 前完成并出具回归报告；若资源不足，优先保 P0-2、P0-4、P0-6 三项。

## 三、P1：机制化（2026-11-05 至 11-10）

### P1-1 权限映射契约化（2 天）

- 目标：资源与权限码的映射从 Java 常量迁移到契约文件，前后端共用。
- 步骤：

1. 新增 `fams-backend/src/main/resources/contract/permission-resources.json`，结构为 `resource → {read, write, delete}`。
2. 改造 `PermissionPolicy` 启动加载该文件，保留默认兜底；增加未知资源的告警日志。
3. 将现有低值/固资按单据类型的映射迁入契约。

- 责任角色：后端负责人（契约评审）、AI 编码代理（实现）。
- 依赖：P0 完成。
- 完成标准：契约文件覆盖全部受控集合；后端单测覆盖加载与缺省逻辑。
- 验收：删除契约中一条映射，矩阵用例应失败。

### P1-2 check:perm 静态校验（1 天）

- 目标：前端出现但契约缺失、契约有但后端未实现的权限码，在构建期失败。
- 步骤：

1. 新增 `fams-frontend/tools/check-permissions.mjs`：扫描 `can('...')`、`meta.permission`、`PERMISSION_TREE`。
2. 校验三件事：码在 `contract/permissions.json`；映射覆盖所有集合；种子角色权限均在契约内。
3. 增加 `npm run check:perm`，接入 `build-prod.ps1`。

- 责任角色：AI 编码代理、前后端负责人（规则确认）。
- 依赖：P1-1。
- 完成标准：脚本可在 5 秒内完成；故意写入非法码可阻断构建。
- 验收：本地与构建脚本均执行通过。

### P1-3 版本一致性与刷新提示（1 天）

- 目标：杜绝「代码已修、浏览器跑旧包」。
- 步骤：

1. 后端新增 `/api/version` 返回构建版本（读取构建信息或版本文件）。
2. 前端启动比对 `meta[name=app-version]` 与接口版本，不一致时顶部提示「系统已更新，请刷新」。
3. 新增 `[SMK-07] 客户端版本一致性` 用例：模拟版本不一致时出现提示。
4. 仅生产构建启用，本地 dev 关闭。

- 责任角色：AI 编码代理、运维（发布核对）。
- 依赖：P1-1。
- 完成标准：版本不一致 3 秒内出现提示；线上版本与 `dist/version.txt` 一致。
- 验收：SMK-07 通过；发布检查单增加「强刷验证」项。

### P1-4 单据状态机矩阵与不变量（2 天）

- 目标：覆盖重复提交、非法状态迁移、撤销后重提等真实用户路径。
- 步骤：

1. 新增 `tests/e2e/15-doc-state-machine.spec.ts`。
2. 对每类单据跑 `DRAFT/PROCESSING/REJECTED/DONE/REVOKED × submit/approve/reject/revoke/delete`。
3. 断言状态码、单据状态、轨迹结果集合，以及库存不变量（`stock`、`reserved` 守恒）。

- 责任角色：AI 编码代理、测试负责人（矩阵设计）。
- 依赖：P1-1。
- 完成标准：覆盖 3 类以上单据；每个非法迁移均有明确断言。
- 验收：人为放开一次重复提交，矩阵必须失败。

### P1 检查点

| 检查点 | 时间 | 内容 | 通过标准 |
| --- | --- | --- | --- |
| CP1-A | 11-06 18:00 | 契约文件 + check:perm | 构建期可拦截非法权限码 |
| CP1-B | 11-08 18:00 | 状态机矩阵 | 全部非法迁移断言通过 |
| CP1-C | 11-10 18:00 | 版本一致性 + 全量回归 | SMK-07 通过，全量 0 failed |


## 四、P2：数据形态与持续运行（2026-11-11 至 11-20）

### P2-1 期初数据形态回归（3 天）

- 目标：覆盖「使用中/借出中/维修中但无单据」的真实台账数据。
- 步骤：

1. 新增固定夹具 `tests/e2e/fixtures/seed-ledger.csv`（UTF-8 BOM，含三种状态与使用人）。
2. 新增 `tests/e2e/16-imported-ledger-closure.spec.ts`：导入 → 台账 → 详情 → 提交审批。
3. 断言：不产生假记录；`api` 模式下不出现硬编码演示单号；状态与单据一致。

- 责任角色：AI 编码代理、业务代表（数据样例确认）。
- 依赖：P1-4。
- 完成标准：夹具可重复导入且幂等；用例全绿。
- 验收：删除夹具中的 BOM 或改列顺序应给出明确失败提示。

### P2-2 资产详情真实记录（3 天，依赖产品修复）

- 目标：移除 `FixedAssetManagement.vue` 的 `assetRecordData`，改为按 `assetId` 查询真实单据。
- 步骤：

1. 按 `assetId` 聚合 8 类单据与盘点记录。
2. 无记录时显示「期初导入，暂无关联单据」。
3. 用例断言：真实单据出现、空态正确、无演示单号。

- 责任角色：前端负责人、AI 编码代理。
- 依赖：P2-1。
- 完成标准：代码中不存在硬编码单号；详情页数据与单据表一致。
- 验收：新建一张派发单后，对应资产详情立即出现该单号。

### P2-3 夜间生产副本与指标（2 天）

- 目标：在不动生产库的前提下跑数据形态回归，并量化质量。
- 步骤：

1. 新增 `scripts/e2e/nightly-clone.ps1`：`mysqldump` → 副本库 → 预览服务 → 跑 L4。
2. 统计指标：逃逸率、角色旅程覆盖率、权限矩阵覆盖率、未预期 4xx。
3. 每周五输出质量简报。

- 责任角色：运维（定时任务）、测试负责人（指标口径）。
- 依赖：P2-1、P2-2。
- 完成标准：夜间任务可无人值守完成；指标自动生成。
- 验收：连续两次夜间运行成功，报告可追溯。

### P2 检查点

| 检查点 | 时间 | 内容 | 通过标准 |
| --- | --- | --- | --- |
| CP2-A | 11-13 18:00 | 期初数据夹具 | 导入与断言全绿 |
| CP2-B | 11-18 18:00 | 资产详情真实记录 | 无演示数据残留 |
| CP2-C | 11-20 18:00 | 夜间任务与指标 | 无人值守跑通并产出简报 |


## 五、资源、依赖与风险

### 所需资源

- 运行环境：本机生产栈（nginx 80、后端 8080、MySQL `fams`），Node 预装路径与 Playwright CLI。
- 权限：MySQL root 仅用于建副本库；应用账号只有 DML。
- 人员：AI 编码代理（执行）、测试负责人（验收）、前端/后端负责人（契约与预取评审）、运维（版本与夜间任务）、业务代表（角色与流程确认）。

### 主要风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 收紧守卫导致历史用例大面积变红 | P0 延期 | 先建基线，按 URL 精确豁免，分批清零；保留 0.5 天缓冲 |
| 预取裁剪导致业务下拉为空 | 功能回归 | 保留「业务必需读」白名单；逐页回归低值/固资/工作台 |
| 真实角色配置被业务改动 | 矩阵误报 | 矩阵以 API 实时读取角色权限；失败时输出角色快照 |
| 测试数据污染生产库 | 数据风险 | 全部 `E2E_` 前缀 + afterAll 清理 + 每日 SQL 复核；P2 改用副本 |
| 版本横幅误报 | 干扰使用 | 仅生产构建启用；本地 dev 关闭；提供手动关闭入口 |
| 期初夹具被 Excel 改写 | 用例不稳定 | 固定 UTF-8 BOM；提交前校验表头与编码 |
| P0 时间不足 | 交付风险 | 优先级排序：P0-2、P0-4、P0-6 必保，其余顺延 1 天 |


## 六、验收与度量

- 阶段验收：每个 CP 出具「用例清单 + 截图/报告路径 + 未预期 4xx 统计」。
- 终验标准：

1. 全量套件 0 failed，未预期 4xx = 0。
2. 5 个真实角色各至少 1 条端到端旅程。
3. 5 个页面主操作 dry-run 通过。
4. 权限矩阵覆盖率 100%，`check:perm` 接入构建。
5. 客户端版本不一致可见提示。

- 度量：逃逸率（手工发现缺陷 / 新增用例）、矩阵覆盖率、旅程覆盖率、未预期 4xx 数，按周跟踪。

## 七、涉及文件清单

```
docs/qa/
└── escaped-defects.md                         # [NEW] 逃逸缺陷台账与回灌规则
tests/e2e/
├── fixtures/net.ts                            # [MODIFY] 精确请求级豁免，移除整页 403 放行
├── fixtures/permissionMatrix.ts               # [NEW] 资源×方法×权限码矩阵与角色加载
├── fixtures/seed-ledger.csv                   # [NEW] 期初台账夹具（UTF-8 BOM）
├── 02-permission.spec.ts                      # [MODIFY] 移除 allowStatus 整页放行
├── 04-permission-matrix.spec.ts               # [MODIFY] 同上，保留合成角色用例
├── 07-low-value-flow.spec.ts                  # [MODIFY] 同上，保留 P2-23/P2-24
├── 08-approval-center.spec.ts                 # [MODIFY] 同上
├── 09-workbench-reports.spec.ts               # [MODIFY] 同上
├── 11-approval-collab.spec.ts                 # [MODIFY] 同上
├── 01-route-crawl.spec.ts                     # [MODIFY] 主操作 dry-run 接入或拆分
├── 00-auth-session.spec.ts                    # [MODIFY] 新增 SMK-07 版本一致性
├── 12-role-permission-matrix.spec.ts          # [NEW] 真实角色×资源×方法矩阵
├── 13-primary-action-smoke.spec.ts            # [NEW] 主操作打开/校验/取消
├── 14-persona-journeys.spec.ts                # [NEW] 三角色端到端旅程
├── 15-doc-state-machine.spec.ts               # [NEW] 状态×动作矩阵与不变量
└── 16-imported-ledger-closure.spec.ts         # [NEW] 期初数据闭环
fams-backend/src/main/
├── resources/contract/permission-resources.json # [NEW] 资源→权限码契约
└── java/com/fams/engine/PermissionPolicy.java  # [MODIFY] 启动加载契约，未知资源告警
fams-backend/src/main/java/com/fams/module/health/HealthController.java # [MODIFY] 增加 /version 或新增控制器
fams-frontend/src/
├── layouts/MainLayout.vue                     # [MODIFY] 按权限懒加载预取 + 版本横幅
├── views/fixed-asset/FixedAssetManagement.vue # [MODIFY] 移除 assetRecordData，改真实聚合
└── config/permissions.js                      # [MODIFY] 如有新增码同步登记
fams-frontend/tools/check-permissions.mjs      # [NEW] 权限码静态校验
fams-frontend/vite.config.js                   # [MODIFY] 注入 app-version
scripts/e2e/nightly-clone.ps1                  # [NEW] 生产库副本夜间回归
package.json                                   # [MODIFY] check:perm、e2e:p0/p1/p2、nightly
build-prod.ps1                                 # [MODIFY] 接入 check:perm
```

### Skill

- **playwright-cli**
- Purpose: 在 P0-5、P0-6、P1-4 阶段驱动真实浏览器点击与截图，产出可回放的验收证据。
- Expected outcome: 每个主操作与人设旅程均有逐步截图和 HTML 报告，作为检查点评审材料。