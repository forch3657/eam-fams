# E2E 运行手册（P0 基础设施 + L0 用例）

## 1. 测试拓扑

默认直接打生产形态；隔离栈保留但不启用（两者用同一份 dist 与 jar，测试结论等价）。
被测环境由 `E2E_BASE_URL` 决定，未设置时为 `http://localhost`。

```text
默认：生产形态
Playwright Chromium (1440x900, workers=1)
   └─ http://localhost → nginx(80/443) → dist + /api → 8080(Spring Boot) → MySQL fams
        └─ e2e-artifacts/<runId>/  逐步截图 + trace + 失败视频
              └─ playwright-report/  HTML 报告（9323 端口回放）

可选（当前未启用）：隔离栈
   http://127.0.0.1:4173（vite preview: dist） → /api 反代 → 18080（e2e profile） → MySQL fams_e2e
```

- 生产栈是 `443/80 → nginx → dist + 8080`；隔离栈是 `4173 → 18080`。
  启动/停止脚本只操作 `18080 / 4173`，但生产形态下用例本身走 `http://localhost` → nginx → 8080。
- **当前默认被测环境是生产形态** `http://localhost`（`playwright.config.ts` 未设 `E2E_BASE_URL` 时即为此地址）。
  L0 全量可在生产上直接跑：写操作只有「`E2E_` 前缀的临时角色/用户」，`afterAll` 逆序删除，
  跑完可用下面的 SQL 复核清零：
  ```sql
  SELECT COUNT(*) FROM org_roles WHERE code LIKE 'E2E!_%' ESCAPE '!';
  SELECT COUNT(*) FROM org_users WHERE username LIKE 'e2e!_%' ESCAPE '!' OR name LIKE 'E2E!_%' ESCAPE '!';
  ```
- 隔离栈（18080 + 4173 + `fams_e2e`）当前**不启用**：按项目约定不建测试库，测试直接写生产库。
  相关脚本（`e2e:db:setup` / `e2e:stack:*`）保留但不作为前置条件；未建库前不要启动 e2e 后端，
  它会因连不上 `fams_e2e` 直接退出。
- 测试产生的数据由**人工**在跑完后清空并重导（`/system/data-import` → 「清空全部业务数据」），
  E2E 代码与脚本不会自动清空任何业务数据。详见第 7 节。

## 2. 环境准备（一次性）

| 依赖 | 说明 |
| --- | --- |
| Node | 本机未进 PATH，用 `%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-6` |
| MySQL 客户端 | `mysql` / `mysqldump` 需在 PATH（`scripts/e2e/*.ps1` 依赖） |
| Playwright 浏览器 | `ms-playwright` 缓存已装；配置里 `channel=chromium` |
| 测试库 | `fams_e2e`，应用账号 `fams`@`127.0.0.1` 在该库内需 DDL 权限（仅隔离栈需要） |

> 下面 ①–③ 仅隔离栈需要；按当前约定不建 `fams_e2e`，生产模式整节跳过。

```powershell
# ① 建库 + 授权 + 首次导入基线（需 MySQL 管理员口令，交互式输入，不落盘）
npm run e2e:db:setup

# ①' 非交互（CI / 自动化）：口令放环境变量，命令行走 MYSQL_PWD，不出现在进程列表
$env:MYSQL_ADMIN_PWD = '<管理员口令>'
powershell -ExecutionPolicy Bypass -File scripts/e2e/setup-e2e-db.ps1
Remove-Item Env:MYSQL_ADMIN_PWD

# ② 从生产库导基线（可在需要刷新测试数据时重跑）
npm run e2e:db:dump

# ③ 重置测试库（DROP + 重放基线，秒级，可反复执行）
npm run e2e:db:reset
```

- 管理员脚本等价于执行 `scripts/e2e/init-e2e-db.sql`，但会顺带把 `db-baseline/e2e-baseline.sql` 灌进 `fams_e2e`。
- **这一步无法用应用账号替代**：`fams`@`127.0.0.1` 只有 `fams.*` 的 `SELECT/INSERT/UPDATE/DELETE`，没有 `CREATE DATABASE`，因此建库必须由管理员执行一次。
- 授权对象必须是 `fams`@`127.0.0.1`（本机账号实际 host）。写成 `fams`@`localhost` 会新建一个空口令账号，测试栈仍然连不上。
- 测试库排序规则固定 `utf8mb4_general_ci`，与生产库 `fams` 一致；不要改成 `0900_ai_ci`，否则排序/比较差异会让结论失真。

## 3. 启动 / 停止服务

生产形态不需要本节；生产栈用 `start-prod.ps1` / `stop-prod.ps1` 起停。下列脚本只服务隔离栈
（4173/18080 + `fams_e2e`），当前未启用。

```powershell
npm run e2e:stack:start   # 后端 18080（e2e profile）+ preview 4173，带 /health 等待
npm run e2e:stack:stop    # 只按 18080 / 4173 精准停，不影响生产 8080/nginx
```

`build-prod.ps1` 生成的 jar、`npm run build` 生成的 dist 都会被直接复用，
所以跑测试前必须先构建，否则测的是旧包（版本标记用例会直接判红）。

## 4. 跑用例

```powershell
# 全量 L0（生产形态，默认地址）
npm run e2e

# 全量 L0（隔离栈，当前未启用；需先建 fams_e2e）
$env:E2E_BASE_URL = 'http://127.0.0.1:4173'
npm run e2e

# 冒烟：登录/会话 + 折旧台账 + 领用默认值 + 权限 + 容错
npm run e2e:smoke

# 全页面巡检（19 条路由 + 页内全部页签，约 2.5 分钟）
npm run e2e:crawl

# P4 权限矩阵（菜单/路由/接口 403/角色停用即时性/删除保护，约 1 分钟）
npm run e2e:p4

# P1 固定资产（入账/单据状态机/条件环节/盘点/折旧执行，约 2 分钟）
npm run e2e:p1

# P2 低值资产（入库/领用/退库/库存预占与回补，约 2 分钟）
npm run e2e:p2

# 逐步演示：桌面会弹出真实浏览器，期间不要操作鼠标键盘
npm run e2e:headed -- --grep "领用"
```

- 命令行不要加 `--reporter=list`：它会覆盖 `playwright.config.ts` 里的 html reporter，
  本轮就不会更新 `playwright-report/`（现象是报告时间戳还是上一轮的）。
  需要看进度时用 `npm run e2e -- --reporter=list,html` 显式保留 html。
- 生产形态连跑多轮不会互相污染：临时角色/用户在 `afterAll` 删除，截图按 `E2E_RUN_ID` 分目录。
- `SMK-02` 每次运行会给 `admin` 记 1 次登录失败，其他用例登录成功会清零计数，
  所以不会累积到 5 次锁定阈值；不要单独循环压这条用例。

常用环境变量：

| 变量 | 默认 | 用途 |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost` | 被测地址；隔离栈填 `http://127.0.0.1:4173` |
| `E2E_USERNAME` / `E2E_PASSWORD` | `admin` / `Fzidt@123` | 管理员账号 |
| `E2E_RUN_ID` | 启动时间戳 | 产物目录名，复跑覆盖时手动指定 |
| `E2E_CHANNEL` | `chromium` | 本机缺 headless shell 时用完整 chromium |

## 5. 产物与报告

```text
e2e-artifacts/<runId>/
├── SMK-01/01-登录后工作台.png      逐步截图（按用例编号分目录）
├── CRAWL-02/03-页签-调拨.png       巡检时每个页签一张
└── raw/<用例名>-chromium/          Playwright 原始产物：trace.zip、video.webm、失败截图
playwright-report/                   HTML 报告（截图已 attach，可逐步回看）
```

```powershell
npm run e2e:report   # http://127.0.0.1:9323，可直接在内置浏览器打开
```

- `trace.zip` 含 DOM 快照与全部网络请求：`npx playwright show-trace <path>`。
- 失败用例默认保留视频（`video: retain-on-failure`）；`trace: on` 全量开启。

## 6. 常见故障

| 现象 | 原因 / 处理 |
| --- | --- |
| 启动脚本报 `database fams_e2e is not reachable`（仅隔离栈） | 未执行 `init-e2e-db.sql`，或 `fams` 无该库权限（应用账号无建库权限，必须管理员执行一次） |
| 手动 `npm run preview` 后 `127.0.0.1:4173` 拒绝连接 | `vite preview` 默认只绑 `localhost`（本机解析为 `::1`）。用 `--host 127.0.0.1`；`start-e2e.ps1` 已带该参数 |
| `[SMK-05] 部署版本与本地构建一致` 失败 | 服务端 dist 落后于本地构建：重新 `npm run build`；隔离栈要重跑 `e2e:stack:start` |
| 巡检大面积 404 / 白屏 | preview 没代理到 18080：确认启动时 `VITE_PROXY_TARGET=http://127.0.0.1:18080` |
| 领用默认值断言「部门应预填」失败 | 账号没有部门（`org_users.dept_id` 为空）。用例应使用部门账号，不要依赖 admin 的归属 |
| 接口 401 直接跳登录 | token 存 sessionStorage，`seedSession` 未生效或跨 origin 注入；确认 BASE_URL 与页面同源 |
| 端口被旧进程占用 | `e2e:stack:stop` 后重试；脚本只杀 18080/4173 |
| 用例失败但页面看起来正常 | 看 `raw/.../error-context.md` 的 locator 报告，多半命中了隐藏页签里的同名元素 |

## 7. 数据卫生（生产库直跑）

本项目采用「**直接跑生产库 + 跑完由人工清空重导**」策略：不建 `fams_e2e`，也不依赖测试库隔离。

- 用例只写 `E2E_` 前缀的临时角色/用户（会话与权限用例），`afterAll` 逆序删除，
  正常跑完不留残留；删除失败也只是 `E2E_` 数据，可由人工清空时一并处理。
- **清空与重导是人工动作，E2E 代码与脚本绝不自动清空业务数据。**
  需要恢复干净数据时，由操作人按顺序执行：
  1. 先备份：`mysqldump -u fams -p fams > db-baseline/fams-YYYYMMDD.sql`；
  2. 打开 `/system/data-import` → 「清空全部业务数据」（`scope=all`：固定资产 8 类单据 →
     审批 → 盘点 → 折旧报表 → 台账 → 存放地点；低值退库 → 领用 → 入库 → 物品 → 位置；
     组织架构保留当前 `admin`，其公司/部门归属会被清空）。角色、参数、字典、流程、
     折旧规则、消息模板保留；
  3. 用 CSV 重新导入主数据与业务数据（必须 UTF-8 BOM，Excel 另存会转 GBK 丢行）；
  4. 重导后确认 `/health` 与 `/version.txt` 正常；`admin` 的公司/部门需重新指定，
     否则「领用默认值」用例会因账号无部门而失败。
- **为什么不用 SQL DROP 重建**：`fams`@`127.0.0.1` 只有 `fams.*` 的 DML，没有 DDL；
  `DROP/CREATE DATABASE` 需要管理员口令。应用内清空走 DELETE，单事务可回滚、无需 DBA。
- 说明：`db-baseline/e2e-baseline.sql` 是隔离栈用的基线 dump，生产模式不使用；
  生产重导以第 1 步新导出的备份 / 业务 CSV 为准。
- 巡检与折旧台账用例只读；只有权限与会话用例（SMK-04~08）会短暂写数据。
- **只清 E2E 残留、不动真实数据**：`fams-backend/sql/04-maintenance/05-cleanup-e2e-data.sql`
  按依赖顺序删掉 E2E 前缀的临时账号、单据、台账资产、审批轨迹、站内信与操作日志，
  可重复执行（删干净后再跑为 0 影响）。用于「只想清测试垃圾、不想整体清空重导」的场景：
  ```powershell
  & "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -uroot -pFzidt@123 -D fams `
    -e "source F:/work/EAM-FAMS/fams-backend/sql/04-maintenance/05-cleanup-e2e-data.sql"
  ```
  注意：删账号必须在删审批轨迹之后，否则会被「该用户已有审批记录，不能删除」拦下。
  2026-11-04 首次清理结果：删 19 账号 / 189 单据 / 189 资产 / 340 轨迹 / 38 站内信 / 4975 操作日志，
  真实数据（138 账号 / 71 资产 / 4 轨迹 / 18081 操作日志）保留。
