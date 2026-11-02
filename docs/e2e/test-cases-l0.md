# L0 用例台账（冒烟 + 全页面巡检）

> 适用版本：2026-10-30 全量运行通过（`37 passed`，串行，1440×900）。
> 判定口径统一为：**不白屏、不误跳登录/403、控制台无 error、`/api/` 无 4xx/5xx、界面数据与接口交叉一致**。

## 1. 冒烟主线（`tests/e2e/smoke.spec.ts`，6 条）

| 编号 | 场景 | 关键断言 | 数据副作用 |
| --- | --- | --- | --- |
| SMK-S1 | 登录后进入工作台 | 路由离开 `/login`、侧边菜单渲染、页面含「工作台」 | 无 |
| SMK-S2 | 折旧管理展示当期计提台账 | 页签 `aria-selected=true`；KPI 含「本期计提折旧」；接口 `/api/depreciation/plan?period=YYYY-MM` 首行资产编号在可见页签内可见；合计金额与接口一致 | 只读 |
| SMK-S3 | 折旧管理深链刷新保持 | `/fixed-assets?tab=depreciation` 刷新后页签不变、台账行仍在 | 只读 |
| SMK-S4 | 领用对话框默认预填「本人 + 本部门」 | 部门=账号所属部门（非占位）、领用人=本人姓名；部门成员数 > 0 | 建/删 1 个 `E2E_` 临时用户 |
| SMK-S5 | 领用人下拉默认列出本部门成员且含本人 | 下拉非空且包含本人 | 同上 |
| SMK-S6 | 切换部门后领用人清空 | 换部门后领用人为空；下拉成员全部属于新部门；不再含原部门人员 | 同上 |

要点：领用默认值必须用**有部门**的账号验证。`admin` 这类系统账号的 `dept_id` 可能为空，用它断言只会暴露数据漂移。
用例在 `beforeAll` 用管理员接口建临时账号（首个可用部门 + 管理员角色），`afterAll` 删除。

## 2. 登录与会话（`00-auth-session.spec.ts`，6 条）

| 编号 | 场景 | 关键断言 |
| --- | --- | --- |
| SMK-01 | 登录后主框架 | 菜单、标题、工作台卡片渲染 |
| SMK-02 | 错误密码登录被拒绝 | 停留在登录页并给出错误提示；放行 `/auth/login` 401 |
| SMK-03 | 令牌失效自动跳转 | 清空 token 后触发 401 → 回登录页，不出现死循环请求 |
| SMK-04 | 切换账号清空标签页 | 上一位用户的页签不残留 |
| SMK-05 | 部署版本一致 | 页面 `meta[name=app-version]` == 服务端 `/version.txt` == 本地 `dist/version.txt` |
| SMK-06 | 深链刷新保持会话 | 刷新后仍登录，URL 与页签保持 |

## 3. 全页面巡检（`01-route-crawl.spec.ts`，19 条）

路由清单与 `fams-frontend/src/router/index.js` 对齐：

| 编号 | 路由 | 页面 |
| --- | --- | --- |
| CRAWL-01 | `/workbench` | 工作台 |
| CRAWL-02 | `/fixed-assets` | 资产管理（7 个页签） |
| CRAWL-03 | `/fixed-asset-reports` | 资产报表 |
| CRAWL-04 | `/fixed-asset-settings` | 基础设置 |
| CRAWL-05 | `/low-value-assets` | 低值资产管理（3 个页签） |
| CRAWL-06 | `/low-value-asset-reports` | 低值资产报表 |
| CRAWL-07 | `/low-value-asset-settings` | 低值资产基础设置 |
| CRAWL-08 | `/system/company` | 公司管理 |
| CRAWL-09 | `/system/dept` | 部门管理 |
| CRAWL-10 | `/system/user` | 用户管理 |
| CRAWL-11 | `/system/role` | 角色管理 |
| CRAWL-12 | `/system/dict` | 数据字典 |
| CRAWL-13 | `/system/log` | 操作日志 |
| CRAWL-14 | `/system/workflow` | 流程配置 |
| CRAWL-15 | `/system/params` | 系统参数 |
| CRAWL-16 | `/system/message-center` | 消息中心 |
| CRAWL-17 | `/system/message-template` | 消息模板 |
| CRAWL-18 | `/system/terminal` | 盘点终端 |
| CRAWL-19 | `/system/data-import` | 数据导入 |

每条用例：直达路由 → 断言主框架与标题 → 逐个点击页面内可见页签（每个页签等接口静默后截图）→ `#app` 非空 → 守卫断言（接口/控制台/未捕获异常全为空）。
新增页面只需在 `ROUTES` 补一行，用例无需改动。

## 4. 权限与容错（`02-permission.spec.ts` + `03-resilience.spec.ts`，6 条）

| 编号 | 场景 | 关键断言 |
| --- | --- | --- |
| SMK-07 | 受限角色菜单与直链 | 只有 `wm:view` 的账号看不到「固定资产 / 系统管理」；直链被兜底回工作台 |
| SMK-08 | 角色停用立即失效 | 停用后重新登录落 403；恢复前不放行 |
| SMK-09 | 未知路由兜底 | 随机路径回落工作台，不白屏 |
| SMK-10 | 空数据空态 | 无数据的列表给出明确空态文案，不白屏 |
| SMK-11 | 关键页面连续刷新 | 工作台/资产管理/低值资产各刷新 3 次仍稳定 |
| SMK-12 | 新增用户必填校验 | 空表单提交被前端拦截，且不发出 `POST /api/org-users` |

## 5. 验收记录

| 日期 | 环境 | 结果 |
| --- | --- | --- |
| 2026-10-30 | 生产形态 `http://localhost`（nginx + dist@`a672955` + 8080） | `37 passed`，串行 5.1 分钟，产物 `e2e-artifacts/2026-10-30T13-00-10`（76 张步骤截图 + 37 份 trace） |
| 2026-10-30 | 生产形态（复跑校验） | `37 passed`，串行 5.1 分钟；`E2E_` 临时角色/用户已清零（SQL 复核 0 条），报告 `playwright-report/` |

产物：`e2e-artifacts/<runId>/`（逐步截图 + trace + 失败视频）、`playwright-report/`（HTML 回放）。

数据恢复口径：本轮直接跑生产库，不建 `fams_e2e`。用例只写 `E2E_` 前缀的临时角色/用户，
`afterAll` 逆序删除；**清空与重导由人工执行**（`/system/data-import` → 「清空全部业务数据」→ 重导 CSV），
E2E 代码与脚本不会自动清空任何业务数据。

## 6. 已知不在 L0 范围

- P1–P5 业务闭环（资产入账/派发/盘点全流程、低值领用退库闭环）；
  分期与用例清单见 [`test-plan-p1-p5.md`](./test-plan-p1-p5.md)（P4 权限矩阵已完成）；
- 主数据 CRUD 的完整字段矩阵与权限矩阵全量；
- 视觉基线（像素比对）；
- 并发与性能压测。
