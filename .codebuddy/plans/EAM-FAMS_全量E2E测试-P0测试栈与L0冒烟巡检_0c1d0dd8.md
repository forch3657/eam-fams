---
name: EAM-FAMS 全量E2E测试-P0测试栈与L0冒烟巡检
overview: 先落地独立测试栈（fams_e2e 库 + e2e profile 后端 + Playwright 基础设施），再交付 L0 冒烟与全页面巡检 12 条用例：逐步截图、trace、HTML 报告可在 IDE 内置浏览器打开，作为后续按模块铺用例的基座。
todos:
  - id: e2e-stack
    content: 搭建 fams_e2e 测试栈：e2e profile、启动停止脚本、基线与重置 SQL
    status: completed
  - id: e2e-fixtures
    content: 实现 env/auth/artifacts/net/data 五个 fixture 与 Playwright 配置改造
    status: completed
    dependencies:
      - e2e-stack
  - id: e2e-version
    content: vite 构建注入版本标记，供部署态一致性断言
    status: completed
    dependencies:
      - e2e-stack
  - id: l0-auth-session
    content: 编写登录、401、账号切换、版本与刷新持久化用例
    status: completed
    dependencies:
      - e2e-fixtures
      - e2e-version
  - id: l0-crawl
    content: 用 [skill:playwright-cli] 校验选择器，编写 20 路由与 40 页签巡检
    status: completed
    dependencies:
      - e2e-fixtures
  - id: l0-permission
    content: 编写临时角色/用户、停用角色失效与权限兜底用例
    status: completed
    dependencies:
      - e2e-fixtures
  - id: l0-docs
    content: 跑通全量并产出用例台账、运行手册与报告查看说明
    status: completed
    dependencies:
      - l0-auth-session
      - l0-crawl
      - l0-permission
---

## 产品概述
针对已完成全量回归的 EAM-FAMS，按「权限 P4 → 固定资产 P1 → 低值 P2 → 审批 P3」的模块顺序修复 10 项已知缺陷，使 8 条被 `fixme` 跳过的用例全部转绿，并在 D10 完成一次无跳过的全量回归。

## 核心交付
- 权限模块：停用账号不能登录；停用后存量 token 立即失效；角色数据范围 `SELF/DEPT/COMPANY` 真正生效。
- 固定资产：审批中的单据禁止通过接口修改或删除；派发、退库、借出、变更审批通过后，资产状态与使用人随单据同步。
- 低值资产：已生效单据不能通过同状态更新绕过数量守卫；审批完结后结算时间正确落库。
- 审批中心：非管理员审批角色能看到本人待办；审批轨迹只读、不可篡改或删除；加签、转办、抄送在需求确认后补齐。
- 验收效果：E2E 由 138 passed / 8 skipped 提升为 146 passed / 0 skipped，`E2E_` 临时数据残留为 0，缺陷登记表逐项更新为已修复。

## 执行约束
按 D1–D10 相对排期推进，每项任务完成即更新缺陷状态并保留回归证据，不做与缺陷无关的重构。

## 技术栈
- 后端：Spring Boot + MyBatis-Plus 通用引擎，核心扩展点为 `GenericService`、`PermissionPolicy`、`HookRegistry`。
- 前端：Vue3 + Pinia，涉及 `views/workbench/Workbench.vue`、`store/approval.js`。
- 测试：Playwright E2E（`tests/e2e/`）与 JUnit 集成测试（`fams-backend/src/test/java`）。
- 数据：MySQL 8 生产库，本次不新增表、不新增列，复用已有 `data_scope`、`org_scope` 字段。

## 实施策略
按模块串行推进，每模块内「改代码 → 后端测试 → 定向 E2E → 移除 fixme → 缺陷表标记」。风险从低到高排列：先做认证与状态守卫这类单点校验，再做数据范围与台账联动这类跨层改动，最后处理需要产品确认的审批协作能力。

## 逐项修复方案

| 缺陷 | 根因（已核实） | 修改点与方案 | 主要风险 |
|---|---|---|---|
| P4-D1 停用仍可登录 | `AuthService.login` 只校验密码 | 密码通过后读取 `org_users.status`，非 `ENABLED` 统一返回 401「用户名或密码错误」，不签发 token，保持防账号枚举 | 提示语不能泄露账号状态 |
| P4-D2 存量 token 不失效 | `UserDetailsServiceImpl` 不校验 status | 加载主体时校验状态，非启用抛异常；`JwtAuthFilter` 已有 catch 并清空上下文，后续请求自然 401 | 不能抛成 500；登录锁定逻辑不受影响 |
| P4-D3 dataScope 未落地 | `GenericService.list` 无范围过滤 | `UserPrincipal` 补充 `dataScope/orgScope/companyId/deptId`；`GenericService.list` 按资源声明的范围字段注入条件：`SELF` 用创建人/使用人，`DEPT` 用部门，`COMPANY` 用公司；仅对显式声明范围的业务资源生效，默认 `ALL` 保持兼容 | 影响面最大，必须在 SQL 层过滤，禁止内存全量后再筛 |
| P1-D1 审批中单据可改删 | `GenericService.update/delete` 不校验状态 | 对单据集合（`fixed-asset-doc-lists-`、`low-value-` 前缀）增加守卫：当前状态为 `PROCESSING` 时 PUT/DELETE 返回 409；`DONE` 保留现有库存回退语义（P2-13 依赖）；`updateQuietly` 绕过守卫供审批内部使用 | 不能误伤主数据与配置类集合 |
| P1-D2 审批不联动台账 | `ApprovalService.act` 只改单据状态 | 新增 `hook/AssetLinkageHook`：`DISPATCH` 置 `IN_USE` 并写使用人/部门，`BACK` 置 `IDLE`，`BORROW` 置 `BORROWED`，`CHANGE` 更新部门/位置；与审批同一事务，用 `updateQuietly` 写入并保证幂等 | 需要按 bizType 精确分支，避免退库误清使用人 |
| P2-D1 同状态改数量绕过守卫 | `applyStockOnStatusChange` 同状态直接 return | 去掉提前返回：状态不变且数量变化时，`DONE`/`PROCESSING` 返回 409；状态变化时保留「先校验可用量、再回补/扣减」的原顺序；`DRAFT` 编辑不受影响 | 与 P2-12、P2-13 的现有语义对齐 |
| P2-D2 settleTime 为空 | `ApprovalService` 统一写 `finishTime` | 按契约元数据判断集合是否有 `settleTime`：低值单据写 `settleTime`，固定资产单据写 `finishTime`，两者都存在时同时写 | 不能写不存在的列 |
| P3-D1 审批人待办恒空 | `PermissionPolicy` 只给管理员读流程与用户 | 方案 A（推荐）：为 `system-workflow`、`org-users` 的 READ 增加审批角色可用的权限码组合，并在 `approvalStore.load` 增加独立 catch，避免单点 403 拖垮 `Promise.all`；若不允许放开用户读取，则改为专用 `GET /api/approvals/todo` 接口 | 放开 `org-users` 读存在敏感字段泄露风险，需限定返回字段或走专用接口 |
| P3-D2 轨迹可篡改删除 | 轨迹集合未在 `PermissionPolicy` 登记 | 登记 `fixed-asset-doc-approvals`：READ 放行已登录用户，WRITE/DELETE 返回 403；`ApprovalTrailWriter` 内部直写 mapper，不经策略 | E2E `afterAll` 依赖 DELETE 轨迹清理，需同步改为管理员清理脚本，否则会残留 |
| P3-D3 加签/转办/抄送缺失 | `ApprovalService.act` 仅支持四个动作 | 先与产品确认范围与数据模型；确认后新增动作与抄送表；未确认则只产出接口与表结构设计，代码保持现状（未知动作继续 400） | 唯一外部阻塞项，不能自行扩大范围 |

## 排期与产出

| 编号 | 任务 | 时间 | 依赖 | 预期产出 |
|---|---|---|---|---|
| 1 | P4 三项修复 + 定向回归 | D1–D2 | 无 | P4-19/20/21 转绿，`04-permission-matrix` 全绿 |
| 2 | P1-D1 状态守卫 + 定向回归 | D3 | 任务 1 | P1-16 转绿，单据状态用例无回归 |
| 3 | P1-D2 台账联动 + 定向回归 | D4 | 任务 2 | P1-20 转绿，P1-15/21/22/23 通过 |
| 4 | P2-D1、P2-D2 修复 + 定向回归 | D5–D6 | 任务 3 | P2-22 转绿，低值 21 条全绿 |
| 5 | P3-D1、P3-D2 修复 + 定向回归 | D7–D8 | 任务 4 | P3-14/15 转绿，审批 15 条全绿 |
| 6 | P3-D3 需求确认与实现/降级 | D9 | 任务 5 | 确认则新增动作与用例；未确认则出设计文档 |
| 7 | 全量 E2E + 文档收口 | D10 | 任务 6 | 146 passed / 0 skipped，缺陷表与验收记录更新 |

## 实施注意
1. 每轮后端改动后按 `stop-prod.ps1` → `build-prod.ps1` → `start-prod.ps1` 重启生产栈，仅跑 `mvn test` 不会产出新 jar，接口会 404。
2. 转绿方式是把 `test.fixme` 改回 `test`，并按修复后的真实行为校准断言：P4-19 需明确核对创建人或使用人字段；P3-14 需确认审批角色能读到流程与用户。
3. P3-D2 生效后，现有 E2E 的 `afterAll` 删除轨迹会 403，需同步改为管理员 SQL 清理或新增清理脚本，否则 `E2E_` 残留不为 0。
4. P1-D1 只拦 `PROCESSING`，不能拦 `DONE`，否则 P2-13「删除已完结领用单回补库存」会失败。
5. E2E 直连生产库，每轮跑完抽查 `org_users`、`org_roles`、`fixed_assets`、`low_value_items`、`fixed_asset_doc_approvals`、`system_workflow_flows` 的 `E2E_` 残留。
6. 全量回归优先无头执行以控制时长；需要观察时用 `--headed`，慢放由 `E2E_SLOWMO` 控制。

## 目录结构

```text
fams-backend/src/main/java/com/fams/
├── module/auth/AuthService.java                 # [MODIFY] 登录校验 status
├── security/UserDetailsServiceImpl.java         # [MODIFY] 加载主体校验 status
├── security/UserPrincipal.java                  # [MODIFY] 携带 dataScope/orgScope/company/dept
├── security/JwtAuthFilter.java                  # [MODIFY] 按需显式处理停用主体
├── engine/PermissionPolicy.java                 # [MODIFY] 流程/用户读权限、轨迹集合只读
├── engine/GenericService.java                   # [MODIFY] 状态守卫、dataScope 过滤、数量守卫
├── module/approval/ApprovalService.java         # [MODIFY] 时间字段、台账联动调用
├── module/approval/ApprovalTrailWriter.java     # [VERIFY] 内部写入是否绕过权限策略
└── hook/AssetLinkageHook.java                   # [NEW] 审批完结联动资产台账

fams-frontend/src/
├── views/workbench/Workbench.vue                # [MODIFY] 待办加载容错
└── store/approval.js                            # [MODIFY] 单请求失败不阻断整页

tests/e2e/
├── 04-permission-matrix.spec.ts                 # [MODIFY] 移除 P4-19/20/21 fixme
├── 05-fixed-asset-flow.spec.ts                  # [MODIFY] 移除 P1-16 fixme
├── 06-fixed-asset-advanced.spec.ts              # [MODIFY] 移除 P1-20 fixme
├── 07-low-value-flow.spec.ts                    # [MODIFY] 移除 P2-22 fixme、调整清理
└── 08-approval-center.spec.ts                   # [MODIFY] 移除 P3-14/15 fixme、调整轨迹清理

docs/e2e/test-plan-p1-p5.md                      # [MODIFY] 缺陷状态与验收记录
```

## 验收标准
- 8 条 `fixme` 全部转绿，全量结果 146 passed / 0 skipped / 0 failed。
- 10 项缺陷在登记表中改为「已修复（日期）」，P3-D3 若未确认则标注「待需求确认」并保留现状。
- 六类 `E2E_` 临时数据残留均为 0。
- 每模块定向回归通过后才进入下一模块，未通过不推进。

## Agent Extensions
### SubAgent
- **code-explorer**
  - Purpose: 在 P4-D3 与 P1-D2 改动前，排查 `GenericService.list`、`ApprovalService.act`、`updateQuietly` 的全部调用点与受影响集合，避免状态守卫和数据范围过滤误伤主数据、配置类资源与测试清理逻辑。
  - Expected outcome: 输出受影响调用点清单与需加白名单的资源集合，作为改代码前的边界依据。
### Skill
- **lsp-code-analysis**
  - Purpose: 定位 `UserPrincipal`、`applyStockOnStatusChange`、`ApprovalTrailWriter` 等符号的引用与实现，确认修改没有遗漏调用方。
  - Expected outcome: 给出符号引用清单与改动影响面，支撑逐项验收。
