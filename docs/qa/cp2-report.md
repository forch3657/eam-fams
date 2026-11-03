# CP2 检查点报告（测试体系整改 P2）

- 检查点：CP2-A / CP2-B / CP2-C（计划 2026-11-13 ~ 11-20，实际 2026-11-03 完成）
- 执行环境：生产栈 `http://localhost`（只读用例）+ 生产库只读副本 `fams_nightly`（数据形态回归）
- 结论：**P2 全部完成；期初数据闭环 4/4、资产详情真实记录、夜间副本回归连续两次全绿**

## 一、交付物

| 优先级 | 交付物 | 文件 | 验收证据 |
| --- | --- | --- | --- |
| P2-1 | 期初台账夹具与闭环 | `tests/e2e/fixtures/seed-ledger.csv`、`tests/e2e/16-imported-ledger-closure.spec.ts` | `[P8-01]`~`[P8-04]` 4/4 通过：三种状态与使用人落库、幂等、缺列/错位列拒绝 |
| P2-2 | 资产详情真实记录 | `fams-frontend/src/views/fixed-asset/FixedAssetManagement.vue` | `[P8-02]` 无单据显示「期初导入，暂无关联单据」且无演示单号；`[P8-03]` 新建派发单后详情立即出现真实单号 |
| P2-3 | 夜间副本回归与指标 | `scripts/e2e/nightly-clone.ps1`、`scripts/e2e/nightly-report.mjs`、`npm run e2e:nightly` | 连续两次运行（`2026-11-03-115516`、`2026-11-03-140020`）22/22 通过，0 flaky，未预期 4xx = 0 |

## 二、期初数据形态（P2-1 / P2-2）

### 夹具约束

- 固定 `tests/e2e/fixtures/seed-ledger.csv`，UTF-8 **BOM**；Excel 另存成 GBK 会掉列，用例在读取时校验 BOM 与表头顺序。
- 公司/部门/使用人用占位符（`__COMPANY__`、`__DEPT__`、`__USER1__`…），运行时替换成当前库真实主数据，同一份夹具可在任何环境重复导入。
- 覆盖三种真实期初状态：`IN_USE`（使用中）、`BORROWED`（借出中）、`REPAIRING`（维修中），均无历史单据。

### 业务决策

期初台账允许「有状态、无单据」：历史数据本来就查不到来源单据。系统在此基础上保证两条：

1. 详情页**不伪造**单据，空态明确写「期初导入，暂无关联单据」；
2. 新建单据后，详情按 `assetId` 聚合真实单据并立即出现该单号。

### 实现要点

`FixedAssetManagement.vue` 打开详情时，并行拉取 7 类单据集合（派发/退库/借出/维修/调拨/变更/处置），按 `assetId` 过滤，盘点记录从盘点计划的 `items` 中匹配；单个集合失败按「无记录」处理，不整页空白。

## 三、夜间副本回归（P2-3）

### 流程

```text
mysqldump --single-transaction (只读,不加锁)
  → DROP/CREATE fams_nightly + GRANT 给应用账号
  → 应用账号导入快照
  → start-e2e.ps1：后端 18080（e2e profile, DB_URL 指向副本）+ vite preview 4173
  → playwright 跑 12/13/14/16（22 条，--retries=1）
  → nightly-report.mjs 生成简报
  → stop-e2e.ps1
```

- 生产栈（nginx 80 / 后端 8080 / 库 `fams`）全程不动，副本用完保留便于排查。
- 管理员口令走 `MYSQL_ADMIN_PWD`；应用账号只有 DML，因此建库/授权必须用管理员账号。
- 无人值守：`schtasks` 每天 02:30 触发，脚本失败时退出码非 0。

### 指标口径

| 指标 | 定义 | 达标线 |
| --- | --- | --- |
| 未预期 4xx/5xx | 失败信息里 `状态码 方法 路径` 去重计数 | 0 |
| 权限矩阵覆盖率 | `12-role-permission-matrix` 通过数 / 总数 | 100% |
| 角色旅程覆盖率 | `14-persona-journeys` 通过旅程数 / 3 | 100% |
| 逃逸缺陷回灌率 | 台账中有对应用例的条目 / 全部条目 | 100% |

### 连续两次运行结果

| runId | 用例 | 失败 | flaky | 未预期 4xx | 矩阵 | 旅程 | 回灌 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-11-03-115516` | 22 | 0 | 0 | 0 | 100% | 100% | 100% |
| `2026-11-03-140020` | 22 | 0 | 0 | 0 | 100% | 100% | 100% |

简报路径：`e2e-artifacts/nightly/<runId>/report.md`（原始结果 `playwright.json` 同目录）。

## 四、本轮由新用例发现并修复的问题

| 现象 | 根因 | 处理 |
| --- | --- | --- |
| `[P5-02]` 资产管理员列表里找不到刚建的单 | 单据列表按编号排序且分页，历史数据一多新单不在首屏 | 用例改为「填单号 → 查询」再操作（真实用户路径），`14-persona-journeys` 增加 `filterByDocNo` |
| `[P8-04]` 断言「列顺序错乱应报缺列」不成立 | 导入按表头名匹配，调换列序不会缺列，而是行值整体错位被枚举校验拦下 | 用例拆成三条：无 BOM 不得打乱、缺列必须点名、列名错位必须拒绝 |
| `[P5-18]` 消息中心未读数偶发为 0 | KPI 来自 notify store 异步加载，首帧读到初始值 | 断言改为 `expect.poll` 等待真实值 |
| 夜间栈永远起不来（`X backend did not become healthy`） | `start-e2e.ps1` 探活打裸 `/health`，SecurityConfig 只放行 `/api/health`，返回 401 | 探活改 `/api/health`，失败时打印最后一次错误 |
| `X vite preview did not start` | `npm.cmd` 依赖 PATH 解析，嵌套调用时解析失败且无日志 | 解析 npm 绝对路径后再 `Start-Process`；失败时回显 preview 日志 |

## 五、验收结果

| 验收项 | 目标 | 实际 |
| --- | --- | --- |
| 全量 E2E | 0 failed | **180 passed / 0 failed**（24.9 分钟，2026-11-03） |
| 期初闭环用例 | 全绿 | `[P8-01]`~`[P8-04]` 4/4 |
| 资产详情 | 无演示数据残留 | 代码中无硬编码单号；空态与真实单据两条用例通过 |
| 夜间任务 | 连续两次无人值守跑通 | 两次均 22/22，0 flaky，0 未预期 4xx |
| 质量简报 | 自动生成、可追溯 | `report.md` + `playwright.json` 按 runId 归档 |

## 六、边界与后续

- 财务角色暂无独立 UI 旅程，其全链路（处置金额超 5 万 → 部门主管 → 财务复核 → 完结）由 `[P1-28]` 在接口层覆盖；若要 UI 旅程，可在 `14-persona-journeys` 补 `[P5-04]`。
- 副本库 `fams_nightly` 不自动删除，便于复盘；长期运行需定期清理或改为每日重建（当前脚本每次运行都会 DROP/CREATE）。
- 夜间任务只跑 L4 四份用例；全量 180 条仍在发布前由 `build-prod.ps1` + 全量 E2E 把关。
