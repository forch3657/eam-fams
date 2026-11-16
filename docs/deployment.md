# 部署手册：建库、迁移、账号权限

面向运维与交接。本文只讲数据库侧：账号与权限、首次建库、结构变更（DDL）、故障排查。
开发联调（H2、vite dev）见 `README.md` 第 1 节；生产拓扑、nginx、构建与启停见 `README.md` 第 8 节。

适用环境：MySQL 8.0（本机验证版本 8.0.44），字符集 `utf8mb4` / `utf8mb4_general_ci`。

---

## 1. 账号与权限

### 1.1 两类账号的分工

| 账号 | Host | 用途 | 权限 | 口令来源 |
|---|---|---|---|---|
| `fams` | `127.0.0.1` | 应用运行时连接（dev / prod） | `fams.*` 的 `SELECT, INSERT, UPDATE, DELETE, EXECUTE` | prod：环境变量 `DB_PASSWORD`（由 `start-prod.ps1` 从 `deploy/.secrets/db-password` 注入，文件已 gitignore）；dev：见 `application-dev.yml`。口令值不写入任何仓库文件 |
| `root` | `localhost` | 仅建库与 DDL（加列、索引、建表） | `*.*` 全权限 | 不写入仓库：`deploy/.secrets/db-admin.txt`（已被 `.gitignore` 忽略），或环境变量 `MYSQL_ADMIN_PWD` |

规则：

- 应用**只用** `fams`，不要用 `root` 跑服务；`fams` 没有 DDL 权限，`ALTER TABLE` 会报 `ERROR 1142`。
- 调试期建的 `root@127.0.0.1` 已收回，管理员账号只允许 `localhost` 登录。
- 生产环境另建专属 DBA 账号，不要沿用本机 `root`。
- 确认账号实际的 host（host 写错会静默新建一个连不上的账号）：

```sql
SELECT user, host, plugin FROM mysql.user WHERE user IN ('fams','root');
```

本机实测结果：`fams@127.0.0.1`、`root@localhost`，均为 `mysql_native_password`。

### 1.2 `fams` 账号（最小权限）

已有环境的授权应如下，可直接核对：

```sql
SHOW GRANTS FOR 'fams'@'127.0.0.1';
-- GRANT USAGE ON *.* TO `fams`@`127.0.0.1`
-- GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `fams`.* TO `fams`@`127.0.0.1`
```

新环境创建（由管理员执行，口令用占位符替换，不要提交到仓库）：

```sql
CREATE USER 'fams'@'127.0.0.1' IDENTIFIED BY '<强口令>';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON `fams`.* TO 'fams'@'127.0.0.1';
FLUSH PRIVILEGES;
```

> ⚠️ 应用连接串写的是 `127.0.0.1`，因此必须建 `fams@127.0.0.1`。只建 `fams@localhost` 时应用仍然连不上（`scripts/e2e/init-e2e-db.sql` 的注释里记录过这个坑）。

### 1.3 管理员口令的存放与使用

- 本机管理员口令存于 `deploy/.secrets/db-admin.txt`，该目录在 `.gitignore` 中，**不要**复制到 README、docs、脚本或提交到 git。
- 执行 DDL 时从环境变量注入，避免口令出现在命令历史与进程列表：

```powershell
# 方式一：密码管理器/CI 注入 MYSQL_ADMIN_PWD
$env:MYSQL_PWD = $env:MYSQL_ADMIN_PWD

# 方式二：从本地密钥文件读取（仅本机）
$env:MYSQL_PWD = (Select-String -Path deploy/.secrets/db-admin.txt -Pattern '^password=').Line.Split('=')[1]

Remove-Item Env:MYSQL_PWD   # 用完立即清除
```

不要把管理员口令写进任何受版本管理的文件（README、docs、脚本、SQL 注释），也不要用 `mysql -p明文`。

### 1.4 应用账号口令变更

1. 用管理员执行 `ALTER USER 'fams'@'127.0.0.1' IDENTIFIED BY '<新口令>';`
2. dev：修改 `application-dev.yml` 的默认值；prod：更新本地 `deploy/.secrets/db-password`（该文件被 gitignore，不入库），配置侧的 `application-prod.yml` 只保留 `${DB_PASSWORD}` 占位符、无明文默认值。
3. 重启后端；生产形态改了配置后必须重新执行 `build-prod.ps1`（配置会打进 jar），再 `start-prod.ps1`（从口令文件注入 `DB_PASSWORD`）。

> 本地 `mvn spring-boot:run` 场景不要用 `-DDB_PASSWORD=xxx`：`spring-boot:run` 会 fork 新 JVM，命令行 `-D` 不一定透传，结果仍用默认值。

---

## 2. 首次建库

### 2.1 创建数据库

由管理员执行：

```sql
CREATE DATABASE IF NOT EXISTS `fams`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
```

排序规则固定用 `utf8mb4_general_ci`，不要换成 `utf8mb4_0900_ai_ci`：排序与比较结果会不同，同一份数据在不同库上跑出的报表/查询结论会不一致。

### 2.2 脚本执行顺序

| 顺序 | 脚本 | 内容 | 说明 |
|---|---|---|---|
| 1 | `deploy/sql/mysql/schema.sql` | 建表（39 张） | `DROP TABLE IF EXISTS` + `CREATE TABLE`，可重复执行 |
| 2 | `deploy/sql/mysql/baseline-data.sql` | 最小基础数据：根公司 `C1`、根部门 `D1`、系统管理员 `U1`、角色 `R1~R8`、全部数据字典 | 字典是枚举校验与下拉选项的必需项，不可省略 |
| 3（可选） | `fams-backend/src/main/resources/db/seed.sql` | 演示业务数据 | 仅测试/演示环境使用，生产不要执行 |

> ⚠️ `schema.sql` 里是 `DROP TABLE IF EXISTS`，**重复执行等于清空业务数据**。只在首次初始化或确认可清库时使用。
>
> ⚠️ `dev` / `prod` 的 `spring.sql.init.mode` 都是 `never`，后端**不会**自动建表。没执行上面脚本就启动，会因 Hikari 连不上或表不存在而失败。
>
> 管理员 `U1` 的初始口令在 `baseline-data.sql` 中保留演示明文，应用首次启动时由 `DataInitializer` 自动迁移为 BCrypt；**当前生产 admin 口令已轮换，见根目录 `README.md` 第 8 节「凭据轮换记录」**，正式发布前必须再次替换。

### 2.3 执行命令（PowerShell）

```powershell
$env:MYSQL_PWD = $env:MYSQL_ADMIN_PWD
$root = 'f:/work/EAM-FAMS'

mysql -h 127.0.0.1 -u root --default-character-set=utf8mb4 `
  -e "SOURCE $root/deploy/sql/mysql/schema.sql;"

mysql -h 127.0.0.1 -u root --default-character-set=utf8mb4 `
  -e "SOURCE $root/deploy/sql/mysql/baseline-data.sql;"

Remove-Item Env:MYSQL_PWD
```

注意事项：

- PowerShell 不支持 `mysql -u root -p < xxx.sql` 的 `<` 重定向，必须用 `-e "SOURCE <绝对路径>;"`。
- `SOURCE` 用绝对路径，避免受当前工作目录影响。
- 必须带 `--default-character-set=utf8mb4`，否则中文数据可能乱码。

### 2.4 验证建库结果

```powershell
$env:MYSQL_PWD = $env:MYSQL_ADMIN_PWD
mysql -h 127.0.0.1 -u root -N --default-character-set=utf8mb4 `
  -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='fams';"
Remove-Item Env:MYSQL_PWD
```

预期 39。再启动后端确认真实连通：

```powershell
(Invoke-WebRequest -Uri 'http://127.0.0.1:8080/api/health' -UseBasicParsing).Content
# {"code":0,"message":"ok","data":{"status":"UP",...}}
```

用错误密码请求 `/api/auth/login`，返回业务错误「用户名或密码错误」而不是 500，说明数据库连接与表结构均正常。

### 2.5 应用连接参数

`application-dev.yml` / `application-prod.yml` 的连接串：

```
jdbc:mysql://127.0.0.1:3306/fams?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai
```

- `characterEncoding=utf8` + 客户端 `--default-character-set=utf8mb4` 共同保证中文不乱码。
- `allowPublicKeyRetrieval=true` 适配 MySQL 8 的认证插件。
- `serverTimezone=Asia/Shanghai` 与 Jackson 时区保持一致。

---

## 3. 结构变更（DDL 迁移）

### 3.1 铁律

1. 迁移脚本只做**加法**（新增列 / 新增索引），并保证**可重复执行**；不改历史脚本。
2. 统一放 `fams-backend/sql/04-maintenance/`，命名 `YYYY-MM-DD-<用途>.sql`。
3. 必须用**管理员账号**执行（`fams` 会报 `ERROR 1142`）。
4. 执行后同步**三处** schema（见 3.3），否则新环境建库会缺列。
5. 最后才改契约与前端 schema（见 3.4）——顺序反了会因列不存在直接 500。
6. 重启后端验证（生产形态必须 `stop-prod` → `build-prod` → `start-prod`）。

### 3.2 执行

```powershell
$env:MYSQL_PWD = $env:MYSQL_ADMIN_PWD

mysql -h 127.0.0.1 -u root --default-character-set=utf8mb4 `
  -e "USE fams; SOURCE f:/work/EAM-FAMS/fams-backend/sql/04-maintenance/<脚本>.sql;"

# 核对列是否生效
mysql -h 127.0.0.1 -u root -N -e `
  "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema='fams' AND table_name='<表名>' ORDER BY ORDINAL_POSITION;"

Remove-Item Env:MYSQL_PWD
```

### 3.3 三处 schema 必须同步

| 文件 | 用途 |
|---|---|
| `deploy/sql/mysql/schema.sql` | MySQL 部署建表 |
| `fams-backend/src/main/resources/db/schema.sql` | H2 内存库（本地默认联调 / 单测） |
| `fams-backend/sql/01-schema/00-schema.sql` | 基线建表脚本 |

### 3.4 契约与前端 schema

表结构变更后，若字段要暴露给通用 CRUD 引擎，**只改前端 schema，再导出后端契约**：

1. `fams-frontend/src/services/contract/schema.js` —— **唯一真源**（字段、表名映射、引用、删除保护）。
2. `cd fams-frontend && npm run export:contract` —— 生成 `fams-backend/src/main/resources/contract/`
   下的 `resources.json`（集合契约）、`enums.json`（枚举白名单）、`permissions.json`（权限码）。
3. 枚举同理：先改 `fams-frontend/src/constants/enums.js`，再导出 `enums.json`；
   只改后端契约会在下次导出时被**原样覆盖抹掉**。

原因：通用引擎会**丢弃契约未声明的字段**；反过来，契约声明了但库里没有列，查询/写入会直接 500（P5-D1 就是这么暴露的）。

> 历史坑（2026-11-04）：`fixed-asset-report-depreciation-plan-details` 的 8 个补列字段与
> `fixed-asset-doc-approvals.targetUserId` 当时只手工加进了后端 `resources.json`，
> 前端 schema 没同步；一次 `npm run export:contract` 就把这两处声明冲掉了，
> 折旧计划明细落库开始丢字段、审批协作的转办/加签判定读不到目标人。
> 现在这两个集合的字段已补回前端 schema（契约与 schema 恢复一致），
> **今后禁止只改后端 `resources.json`**。

### 3.5 已有迁移记录

| 脚本 | 内容 | 状态 |
|---|---|---|
| `2026-10-29-depreciation-config.sql` | 折旧配置对齐真实资产：清空非租赁资产的 `lease_months`、按 8 个资产分类重建分类设置 | 已执行 |
| `2026-10-29-depreciation-reset.sql` | 折旧口径重置：补齐明细展示字段、计提周期统一按月、修正公司编码、清空历史计提供重算 | 已执行 |
| `2026-10-29-depreciation-settings-fix.sql` | 折旧设置修复：规则补齐 8 个分类、清空互相冲突的演示计划 | 已执行 |
| `2026-10-30-fix-plan-details-columns.sql` | 折旧方案明细表补 8 列（17 → 25 列），修复 `plan-details` 与清空预览 500 | 2026-11-02 已在生产库执行 |
| `06-auditor-wm-todo.sql` | 审计员（R6）补 `wm:todo`，使审计抽查确认在工作台可见 | 2026-11-04 已执行 |
| `07-inventory-closure.sql` | 资产状态字典新增「待入库 / 待核销 / 已核销」3 项 | 2026-11-04 已执行 |
| `08-inventory-disposal.sql` | 盘点异常处理去向字典（`REPAIR` / `CHANGE` / `EXPLAINED`） | 2026-11-04 已执行 |
| `09-borrow-return.sql` | 仅 `fixed_asset_doc_lists_borrow` 加归还日期/备注/登记人/是否已归还 4 列 | 2026-11-04 已执行 |
| `10-asset-source-tag.sql` | `fixed_assets` 加 `source_tag`，承载「期初导入」标注 | 2026-11-04 已执行 |
| `11-role-permissions.sql` | 8 个内置角色权限基线校准：新增 `fa:repair`、收回部门主管执行权、补齐财务/审计/仓管审批权；等价管理员在角色管理页配置 | 2026-11-05 已通过管理员 API 落生产库，脚本供重部署复跑 |
| `12-approve-result-dict.sql` | 审批结果字典补 `WITHDRAW` / `VOID` / `TERMINATE` 三项，供「系统管理 → 数据字典」展示与维护 | 2026-11-06 已在生产库执行（`INSERT IGNORE` 幂等） |
| `19-company-hierarchy-check.sql` | 公司三级层级复核 + `org_companies.parent` 索引 | D1 已执行 |
| `20-scope-indexes.sql` | 6 个 `idx_*company*` 范围查询索引 | D1 已执行 |
| `21-role-datascope-backfill.sql` | 9 角色显式 `org_scope`/`data_scope`（只补空值） | D1 已执行 |
| `22-user-company-scope.sql` | 用户授权公司集合与组织层级字段 | D2 已执行 |
| `23-low-value-company.sql` | 低值台账与三类单据 `company_id` 加列回填 | D2 已执行 |
| `24-company-scope-columns.sql` | 配置公司覆盖列、处置单受让公司字段与索引 | D2 已执行 |
| `25-leadership-role.sql` | 幂等补齐第 9 个角色 `ROLE_LEADERSHIP`（新环境重建必需，见 §3.5.1） | D4 新增，供新环境执行 |

> `12-approve-result-dict.sql` 只补运行期字典项：`EnumCatalog.allowed()` = 内置 `contract/enums.json` ∪ 运行期字典，
> `label()` 只查内置，因此功能不依赖字典项；三个新结果码已由
> `npm run export:contract` 写入 `enums.json`。但本轮同时改了 `schema.js` 的 `releaseOn`，
> 属于**契约语义变更**，必须按 §3.4 顺序导出并重建生产栈。

> `11-role-permissions.sql` 是纯 DML 校准，不改表结构、不需重建 jar；
> 但 `fa:repair` 权限码来自 `fams-frontend/src/config/permissions.js`，
> 已由 `npm run export:contract` 导出到 `permissions.json`，并同步 `permission-resources.json` 与 `PermissionPolicy`。
> 用管理员 API 改角色权限时，PowerShell 5.1 必须显式按 UTF-8 字节发送中文 `name` / `remark`，
> 否则会变成 `?????` 并触发名称唯一键 409。

> 08/09/10 涉及**契约字段新增**，务必按 §3.4 的顺序：先改
> `fams-frontend/src/services/contract/schema.js` → `npm run export:contract` → 再执行迁移脚本 →
> 最后 `stop-prod.ps1` / `build-prod.ps1` / `start-prod.ps1` 重建生产栈。
> 顺序颠倒会出现「契约声明了字段但库里没列」导致读写 500。

### 3.5.1 新环境完整重建顺序（灾备 / 全新部署必读）

只按第 2 节建库（schema + baseline-data）**不足以复现生产基线**：`baseline-data.sql` 只含 R1~R8 共 8 个内置角色，生产实测是 9 个——第 9 个 `ROLE_LEADERSHIP`（领导班子，id `mvu9z81n35`）是历史上管理员手工创建的自定义角色，11/21 脚本只 `UPDATE`/补空值、从不 `INSERT`。漏掉它会导致领导班子审批人配置与流程解析失效，且与 `docs/qa/role-permission-matrix.md` 的 9 角色矩阵不符。

全新环境按以下顺序重建（均用管理员账号，执行前先做 `mysqldump --single-transaction` 快照）：

1. 第 2 节：`schema.sql` → `baseline-data.sql`（8 个内置角色 + 字典；**不要**执行 seed.sql 演示数据）。
2. 历史 DML 校准：`06` ~ `12`（其中 `11` 此时 UPDATE 不到领导班子，属正常，由第 4 步补齐）。
3. 集团化 DDL/DML：`19` → `20` → `21` → `22` → `23` → `24`（均为加法型、幂等可重复执行）。
4. **`25-leadership-role.sql`**：幂等插入领导班子角色（11 个权限码、`org_scope=COMPANY`、`data_scope=ALL`）。
5. 复核 SELECT：应返回 **9 角色 / 5 公司 / 76 资产 / 138 账号**（数据规模以日常备份为准，角色与公司数固定）；核对 `org_roles` 无空 `org_scope`/`data_scope`。
6. 命令行外置注入 `DB_PASSWORD`（见 §1.4）、`JWT_SECRET`（由 `start-prod.ps1` 生成），再 `build-prod.ps1` → `start-prod.ps1`。

> 已运行中的生产库无需执行 25（角色已存在，`WHERE NOT EXISTS` 会跳过）；该脚本是为灾备重建准备的。

### 3.6 回滚

本项目的迁移策略是只做加法，不写 down 脚本。需要撤销时：

1. 另写一个新脚本（新日期），做反向变更；
2. 保留原脚本不动，避免重复执行时状态不确定。

---

## 3A. 备份、恢复演练与版本标记（D4）

### 3A.1 自动备份

```powershell
$env:MYSQL_PWD = <管理员口令>   # 不要写入脚本或命令历史
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/backup-prod-db.ps1 -Keep 14
Remove-Item Env:MYSQL_PWD
```

- 输出到 `db-baseline/auto-backup-<时间戳>.sql`，保留最近 14 份，不删人工 `backup-*` 快照。
- **必须使用 mysqldump 原生 `--result-file`**：PowerShell 5.1 的 `>` 重定向会把输出重编码为 UTF-16LE（`FF FE` BOM），mysql 无法恢复。脚本已内置字节头自检，发现 BOM 立即删除备份并报错。
- 恢复用 mysql 直接 `SOURCE`：`mysql -u root -e "SOURCE <绝对路径>/auto-backup-xxx.sql;" <目标库>`。不要把备份内容经 PowerShell 管道传给 mysql（同样会编码损坏）。

### 3A.2 恢复演练（本次实测）

| 项 | 结果 |
|---|---|
| 快照 | `auto-backup-20261116-170858.sql`（7.8MB，无 BOM） |
| 演练库 | `fams_dr_drill_20261116`（临时，演练后已 DROP） |
| RTO | **6.02 秒**（39 张表恢复完成） |
| 数据对比 | 演练库与生产库一致：39 表 / 76 资产 / 5 公司 / 9 角色 / 138 账号 |
| RPO | 取决于备份间隔；当前为人工触发，正式对外前需配定时任务 |

### 3A.3 健康检查和可观测端点

| 端点 | 用途 | 认证 |
|---|---|---|
| `GET /api/health` | 应用自研探活 | 免登录 |
| `GET /api/actuator/health` | Spring Boot 探活 | 免登录 |
| `GET /api/actuator/metrics` | Micrometer 指标 | 需 Bearer token |
| nginx 访问日志 | `deploy/nginx/logs/access.log`，含 traceId/耗时/UA/IP | — |

traceId 由 `TraceIdFilter` 生成或从请求头 `X-Trace-Id` 透传，写入 MDC 与审计日志，经响应头回传；前端 5xx/网络异常上报携带同一 traceId，可跨前后端串联。

### 3A.4 版本标记与回滚

- 发布时在交付仓打 tag：`v<年月日>-<阶段>`，记录 `git rev-parse --short HEAD` 与 `build-prod.ps1` 构建时间，写入 `docs/qa/go-live-checklist.md` 第 7 节。**打 tag 前必须确认本期改动已全部提交**：以未包含改造的 HEAD 打 tag 会导致回滚拿到空版本；`VERSION` 中标注"待提交后重打"时即为该前置条件未满足。
- 回滚路径：① 用 `stop-prod.ps1` 停栈；② 从上一个 jar/dist 版本或交付仓 tag 恢复产物；③ 若涉及 DDL，用更晚日期的新脚本做反向变更（不改写历史脚本）；④ 必要时用 `db-baseline/` 快照恢复数据库；⑤ `start-prod.ps1` 重启并核对 `/api/health`。
- 生产栈重建顺序固定：`stop-prod.ps1` → `build-prod.ps1` → `start-prod.ps1`；期间站点短暂不可用。

---

## 4. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| `ERROR 1142 (42000) ALTER command denied` | 用了 `fams` 应用账号 | 换管理员账号执行 DDL（第 1 节） |
| `ERROR 1045 Access denied` | 口令不对，或账号 host 不匹配（`localhost` vs `127.0.0.1`） | 核对 `mysql.user`；管理员口令见 `deploy/.secrets/db-admin.txt` |
| 启动报 Hikari 连接失败 / `Table doesn't exist` | 未执行 `schema.sql` + `baseline-data.sql`，或 profile 用错 | 按第 2 节初始化；确认 `spring.sql.init.mode=never` 时不依赖自动建表 |
| 中文乱码 | 缺 `--default-character-set=utf8mb4`，或连接串缺 `characterEncoding` | 补参数；确认库/表 `utf8mb4` |
| 接口 500，日志 `Unknown column` | 迁移未执行，或契约字段多于实际列 | 执行迁移并同步三处 schema，再核对契约 |
| 启停开关「看似没启用」、保存后又弹回 | 三张表的 `enabled` 列被改成 `TINYINT(1)` | 必须为 `BOOLEAN`（折旧方案、流程配置、消息模板），前端 `el-switch` 严格比较 `true` |
| 重复执行建表脚本后业务数据消失 | `schema.sql` 含 `DROP TABLE IF EXISTS` | 生产禁止重跑；恢复走备份 |
| 导入 CSV 表头乱码/缺列 | Excel 另存把 UTF-8 转成 GBK | 导入文件必须 UTF-8 BOM，且不要用 Excel 另存 |

---

## 5. 交接检查清单

- [ ] `fams@127.0.0.1` 存在，权限恰好是 `fams.*` 的 DML + EXECUTE，无 DDL。
- [ ] `root@localhost` 口令已改强口令，存放在密码管理器或 `deploy/.secrets/db-admin.txt`，未提交仓库。
- [ ] `fams` 库为 `utf8mb4` / `utf8mb4_general_ci`，表数量 39。
- [ ] `baseline-data.sql` 已执行：`C1` / `D1` / `U1` / `R1~R8` 与字典齐全；新环境另已执行 19~25 迁移，`org_roles` 为 9 个角色（含 25 补齐的领导班子），见 §3.5.1。
- [ ] 应用连接串口令与库中一致，`/api/health` 返回 `UP`。
- [ ] 已执行的迁移脚本与 `sql/04-maintenance/` 一致，三处 schema 已同步。
- [ ] 生产环境默认管理员口令与数据库口令已轮换（当前值见根目录 `README.md` 第 8 节；正式发布前必须再次替换为组织凭据，不再沿用仓库内任何默认值）。
