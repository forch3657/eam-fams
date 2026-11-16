# 角色—权限—数据范围矩阵（生产实测快照）

| 项 | 内容 |
|---|---|
| 生成日期 | 2026-11-16 |
| 数据来源 | 生产库 `fams.org_roles`，`SELECT code,name,data_scope,org_scope,permissions,status` |
| 用途 | D4 投产放行：权限矩阵复核签字的基线；与 `contract/permission-resources.json` 的 fail-closed 规则配套 |
| 口径 | `dataScope`：ALL=全集团 / COMPANY=本公司及下级+显式授权 / DEPT=本部门及下级 / DEPT_ONLY=仅本部门精确匹配；`orgScope` 参与判定。本表为生产库实测值，`21-role-datascope-backfill.sql` 的 CASE 默认值（如把 LEADERSHIP 归 GROUP）仅用于补空值、不覆盖既有配置，**口径冲突时以本表为准** |

## 角色总览

| 角色编码 | 角色名 | dataScope | orgScope | 权限码数 | 状态 |
|---|---|---|---|---:|---|
| ROLE_ADMIN | 系统管理员 | 全集团 (ALL) | 集团 (GROUP) | 40 | ENABLED |
| ROLE_ASSET | 资产管理员 | 本公司及以下 (COMPANY) | 本公司及以下 (COMPANY) | 27 | ENABLED |
| ROLE_AUDITOR | 审计员 | 全集团 (ALL) | 集团 (GROUP) | 10 | ENABLED |
| ROLE_FINANCE | 财务管理员 | 本公司及以下 (COMPANY) | 本公司及以下 (COMPANY) | 11 | ENABLED |
| ROLE_LEADER | 部门主管 | 本部门及以下 (DEPT) | 本部门及以下 (DEPT) | 17 | ENABLED |
| ROLE_LEADERSHIP | 领导班子 | 全集团 (ALL) | 本公司及以下 (COMPANY) | 11 | ENABLED |
| ROLE_USER | 资产使用人 | 仅本部门 (DEPT_ONLY) | 本部门及以下 (DEPT) | 13 | ENABLED |
| ROLE_VP | 分管副总 | 全集团 (ALL) | 集团 (GROUP) | 8 | DISABLED |
| ROLE_WAREHOUSE | 仓管员 | 本公司及以下 (COMPANY) | 本公司及以下 (COMPANY) | 12 | ENABLED |

## 逐角色权限码

### ROLE_ADMIN — 系统管理员

dataScope=ALL / orgScope=GROUP / 状态=ENABLED

fa:view, fa:add, fa:edit, fa:delete, fa:export, fa:inbound, fa:dispatch, fa:borrow, fa:change, fa:dispose, fa:repair, fa:inventory, fa:depreciation, fa:report, fa:settings, lv:view, lv:edit, lv:export, lv:inbound, lv:requisition, lv:return, lv:report, lv:settings, wm:view, wm:todo, wm:alert, wm:overview, wm:message, org:company, org:dept, org:user, org:role, sys:dict, sys:log, sys:workflow, sys:params, sys:message, sys:template, sys:terminal, sys:import

### ROLE_ASSET — 资产管理员

dataScope=COMPANY / orgScope=COMPANY / 状态=ENABLED

fa:view, fa:add, fa:edit, fa:export, fa:inbound, fa:dispatch, fa:borrow, fa:change, fa:dispose, fa:repair, fa:inventory, fa:depreciation, fa:report, fa:settings, lv:view, lv:edit, lv:export, lv:inbound, lv:requisition, lv:return, lv:report, lv:settings, wm:view, wm:todo, wm:alert, wm:overview, wm:message

### ROLE_AUDITOR — 审计员

dataScope=ALL / orgScope=GROUP / 状态=ENABLED

fa:view, fa:export, fa:report, lv:view, lv:report, sys:log, wm:view, wm:todo, wm:overview, wm:message

### ROLE_FINANCE — 财务管理员

dataScope=COMPANY / orgScope=COMPANY / 状态=ENABLED

fa:view, fa:export, fa:depreciation, fa:report, lv:view, lv:report, sys:log, wm:view, wm:todo, wm:overview, wm:message

### ROLE_LEADER — 部门主管

dataScope=DEPT / orgScope=DEPT / 状态=ENABLED

wm:view, wm:todo, wm:alert, wm:message, fa:view, fa:inbound, fa:dispatch, fa:borrow, fa:change, fa:dispose, fa:repair, fa:report, lv:view, lv:inbound, lv:requisition, lv:return, lv:report

### ROLE_LEADERSHIP — 领导班子

dataScope=ALL / orgScope=COMPANY / 状态=ENABLED

wm:view, wm:todo, wm:alert, wm:overview, wm:message, fa:view, fa:export, fa:report, lv:view, lv:export, lv:report

### ROLE_USER — 资产使用人

dataScope=DEPT_ONLY / orgScope=DEPT / 状态=ENABLED

wm:view, wm:todo, wm:message, fa:view, fa:borrow, fa:change, fa:repair, fa:report, lv:view, lv:inbound, lv:requisition, lv:return, lv:report

### ROLE_VP — 分管副总

dataScope=ALL / orgScope=GROUP / 状态=DISABLED

fa:view, fa:report, lv:view, lv:report, wm:view, wm:todo, wm:overview, wm:message

### ROLE_WAREHOUSE — 仓管员

dataScope=COMPANY / orgScope=COMPANY / 状态=ENABLED

fa:view, fa:inbound, fa:report, lv:view, lv:inbound, lv:requisition, lv:return, lv:report, wm:view, wm:todo, wm:alert, wm:message

## 关键隔离断言（已在门禁 1/2 实测）

- 系统管理员 `ALL`：可见 76 台（研究院51/数源11/至臻10/新视4）。
- 资产管理员 `COMPANY`（研究院）：可见 76 台（本公司+3 家下级）；`COMPANY`（至臻）：仅 10 台。
- 资产使用人 `DEPT_ONLY`：名下无资产则 0 台；见门禁 1 第 A 节。
- 按 id 跨公司 GET/PUT/DELETE/BATCH/伪造公司 POST 全 403；非管理员 `DELETE /all` 403；审计表改删 403。
- `ROLE_VP` 当前为 DISABLED，不参与授权；如启用需重新复核其 ALL 范围。

## 复核签字

| 角色 | 数据范围确认 | 权限码确认 | 复核人 | 日期 |
|---|---|---|---|---|
| ROLE_ADMIN | ☐ | ☐ |  |  |
| ROLE_ASSET | ☐ | ☐ |  |  |
| ROLE_AUDITOR | ☐ | ☐ |  |  |
| ROLE_FINANCE | ☐ | ☐ |  |  |
| ROLE_LEADER | ☐ | ☐ |  |  |
| ROLE_LEADERSHIP | ☐ | ☐ |  |  |
| ROLE_USER | ☐ | ☐ |  |  |
| ROLE_VP | ☐ | ☐ |  |  |
| ROLE_WAREHOUSE | ☐ | ☐ |  |  |
