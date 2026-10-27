# EAM-FAMS 本地联调与上线流程

固定资产管理 + 低值耗材管理系统。前后端分离：Spring Boot 后端 + Vue3 前端（Element Plus）。

---

## 1. 本地联调（H2 内存库）

### 启动 / 停止

双击 `start-dev.bat` 即可一键启动（bat 仅做中文提示与执行策略绕过，实际逻辑在 `start-dev.ps1`）。它会开两个独立窗口：

| 服务 | 地址 | 说明 |
|---|---|---|
| 后端 | http://localhost:8080 | `mvn spring-boot:run`，H2 内存库，自动建表 + 灌演示数据 |
| 前端 | http://localhost:5174 | `npm run dev`（Vite） |

- **登录账号**：`admin / Fzidt@123`（全员统一强初始口令 `Fzidt@123`；19 个演示账号口令均已 BCrypt 化，可在后端启动日志中查看）
- **停止**：双击 `stop-dev.bat`（按监听端口 8080/5174 精准结束，不会误杀其他 java/node），或直接关掉那两个窗口

> 脚本会自动定位 `.workbuddy` 下的预装 Node，无需手动配 PATH。
> 首次启动 Maven 会下载依赖（约 1 分钟），之后很快。

### H2 联调要点

- **H2 是内存库**：每次重启后端，数据都会从 `db/schema.sql` + `db/seed.sql` 重建。因此任何对这两份脚本的改动（建表、灌数）**必须重启后端**才会生效。
- 前端用 vite 热更新，改完前端代码**刷新浏览器**（建议 Ctrl+F5）即可，无需重启。
- 后端启动日志若报 SQL 编码/字段类型相关错误，先确认 `application-h2.yml` 里 `spring.sql.init.encoding: utf-8` 已配置（否则中文数据会整体乱码）。

### 后端联调验证（可选）

不依赖浏览器，直接调接口确认后端健康：

```powershell
# 登录
$body = @{username='admin';password='Fzidt@123'} | ConvertTo-Json
$r = Invoke-RestMethod -Uri http://localhost:8080/api/auth/login -Method POST -ContentType 'application/json' -Body $body
$token = $r.data.token
# 带 token 取数据
Invoke-RestMethod -Uri "http://localhost:8080/api/fixed-assets?pageSize=3" -Headers @{Authorization="Bearer $token"}
```

---

### 用 MySQL 联调（一键切 MySQL）

上面是 H2 内存库联调；如果你想直接连本机真实 MySQL 调试，用另一套脚本即可，无需改任何配置：

双击 **`start-dev-mysql.bat`**（逻辑在 `start-dev-mysql.ps1`）。它会：

1. 检查本机 MySQL 服务（`MySQL80`）是否已监听 `3306`；未启动则自动拉起（需管理员权限，失败会提示你手动启动）。
2. 启动后端 **`mvn spring-boot:run -Dspring-boot.run.profiles=dev`**（dev = MySQL 模式）与前端 `npm run dev`，同样开两个独立窗口。

| 项 | 值 |
|---|---|
| 数据库地址 | `jdbc:mysql://127.0.0.1:3306/fams` |
| 数据库名 | `fams` |
| 用户名 | `fams`（专用最小权限账号，仅授权 `fams.*`） |
| 密码 | `FamsDb@2026!`（在 `application-dev.yml` 中为默认值；已收回调试期建的 `root@127.0.0.1` 全权限账户） |
| 连接参数 | `useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai`（适配 MySQL 8 的 `caching_sha2_password`） |

> ⚠️ **前置条件**：`start-dev-mysql.bat` **不会自动建库建表**。必须先按下面第 2 节把 `fams` 库建好、灌入 schema+数据，否则后端起不来（Hikari 连不上 / 表不存在）。
>
> 切换回 H2 联调：停掉服务（双击 `stop-dev.bat`），再双击 `start-dev.bat` 即可。两套脚本共用 `stop-dev.bat`（按 8080/5174 端口精准结束）。
>
> 改数据库密码：直接改 `fams-backend/src/main/resources/application-dev.yml` 里的 `password: ${DB_PASSWORD:FamsDb@2026!}` 默认值，**不要用** `mvn -DDB_PASSWORD=xxx`——`spring-boot:run` 会 fork 新 JVM，命令行 `-D` 不一定透传，导致仍用默认值。

---

## 2. 上 MySQL 前清单

联调稳定、准备部署到真实 MySQL 时，按以下清单操作（**先上 SQL 再测**，因为部分功能依赖 schema；不要拿旧 SQL 建库测出假结果）：

1. **切换 profile（本地联调用脚本，部署改 yaml）**：
   - **本地联调**：直接双击 `start-dev-mysql.bat`，脚本已用 `-Dspring-boot.run.profiles=dev` 启动后端（dev = MySQL 模式，`spring.sql.init.mode` 为 `never`，由你手动执行下面的 SQL），**无需改 `application.yml`**。
   - **正式部署**：把后端 `application.yml` 的默认激活 profile 改成 `dev`。
   - `application-dev.yml` 里连接串已带 `characterEncoding=utf8` 与 `allowPublicKeyRetrieval=true`（适配 MySQL 8 的 `caching_sha2_password`），默认账号 `fams`、密码 `FamsDb@2026!`（改密码直接改 yaml 默认值；不要用 `mvn -DDB_PASSWORD=xxx`，`spring-boot:run` 会 fork 新 JVM 导致 `-D` 不透传）。
   - 若后端连不上 MySQL，多半是 `MySQL80` 服务未启动（脚本已尝试自动拉起）或账号口令与库不匹配；`fams`@`127.0.0.1` 专用最小权限账号已在初始化时建好，无需补建 root。
2. **按顺序执行建库脚本**（在 `deploy/sql/mysql/` 下，MySQL 直接可执行）：
   - `deploy/sql/mysql/schema.sql` —— 建表（`DROP TABLE IF EXISTS` + `CREATE TABLE`，可重复执行）
   - `deploy/sql/mysql/baseline-data.sql` —— 最小基础数据：根公司 `C1` / 根部门 `D1`、系统管理员 `U1`、角色预设 `R1~R8`，以及**全部数据字典**（字典为枚举校验与下拉选项所必需，不可省略）
   - 需要演示业务数据：再执行 `fams-backend/src/main/resources/db/seed.sql`

   > ⚠️ `prod` / `dev` profile 的 `spring.sql.init.mode` 均为 `never`，**不会自动建表**。
   > 必须先执行上面两个脚本（或人工确认库已初始化），否则后端起不来（Hikari 连不上 / 表不存在）。
   > 其中管理员口令 `Fzidt@123` 以明文写入，应用首次启动时会由 `DataInitializer` 自动迁移为 BCrypt。

3. **脚本已同步的修复（务必确认已带入）**：
   - 三张表的 `enabled` 列已为 **`BOOLEAN`**（折旧方案、流程配置、消息模板）。**不要改回 `TINYINT(1)`** —— 否则后端回读成 `0/1`，前端 `el-switch` 严格比较 `true` 失败，启停开关会「看似没启用」并反复弹回。`deploy/sql/mysql/schema.sql` 与 `fams-backend/src/main/resources/db/schema.sql`（H2 用）这两份都要保持 `BOOLEAN`。
   - seed 中的 `1/0` 对 `BOOLEAN` 列兼容，无需改动。

> 关键点：本项目有两套同源 schema —— H2 联调用的 `fams-backend/src/main/resources/db/schema.sql`（源），与部署用的 `deploy/sql/mysql/schema.sql`（前者改动后需同步过去）。改表结构时**两处都要同步**。

### 批量导入客户真实数据

上面的 baseline 只含"系统能跑起来"的最小集。**客户的公司 / 部门 / 人员 / 资产等真实业务数据，请统一通过「数据导入」（系统管理 → 数据导入）批量灌入**，不要手工写 SQL：

- **权限**：菜单与页面需要 `sys:import`；某个资源能否导入，由<u>该资源的写权限</u>决定（能新增单条即可批量导入）。`R1 系统管理员`已内置该权限，其它角色在「角色管理」勾选即可。

  > 升级部署提示：既有库若要补授该权限，可执行
  > `UPDATE org_roles SET permissions = REPLACE(permissions, ']', ',"sys:import"]') WHERE id='R1' AND permissions NOT LIKE '%sys:import%';`
  > （更推荐直接在「角色管理」界面勾选，避免手工改 JSON 出错。）

- **组织架构：一张表导入（默认推荐）**
  `系统管理 → 数据导入` 默认进入「组织架构导入」，客户只维护**一张中文表**，一次上传即可建好公司 / 部门 / 人员：

  | 公司名称 | 公司编码 | 部门名称 | 上级部门 | 姓名 | 登录账号 | 初始口令 | 岗位 | 手机 | 邮箱 | 角色 | 状态 |
  |---|---|---|---|---|---|---|---|---|---|---|---|

  - **行粒度决定建什么**：只填 `公司名称` → 只建公司；再加 `部门名称` → 建公司 + 部门；再加 `姓名 / 登录账号 / 初始口令` → 建公司 + 部门 + 人员。
  - **无需填写任何内部主键**：公司按「名称（或编码）」匹配，部门按「公司 + 部门名称」匹配，同一公司/部门出现多行只创建一次（幂等复用）。
  - **自动编码**：`公司编码` 留空生成 `GS-0001` 形式；部门编码统一自动生成 `BM-0001` 形式，均保证唯一。
  - **上级部门**可任意顺序出现（后端按层级多趟处理），但必须在本文件或系统中已存在于**同一公司**；留空为一级部门。
  - **角色**可填编码（`ROLE_ADMIN`）或名称（`系统管理员`），多个用 `|` 分隔；**状态**默认 `ENABLED`，也可填 `启用/停用`。
  - **登录账号全局唯一**：重复即判该行失败，**绝不覆盖已有账号的口令**。
  - **口令合规**：沿用系统口令策略（≥8 位、含字母/数字/符号中两类、不得与账号相同），落库自动 BCrypt。
  - **结果分级报告**：新建公司 / 复用公司 / 新建部门 / 复用部门 / 新建用户，失败行带**真实表格行号**。
  - 接口：`GET /api/data-import/org-template`、`POST /api/data-import/org-upload?abortOnError=`。该模式会同时写公司/部门/用户三张表，因此需要 `org:company`、`org:dept`、`org:user` 三项写权限。

- **按资源导入（高级模式）**：资产、低值、字典等其它数据仍按资源分别导入，用法见下。
  - **用法**：选择资源 → 下载模板 → **在示例行下方追加数据** → 上传导入。
    模板共三行：第 1 行为字段名（表头，导入解析依赖此行，不要改）；第 2/3 行为「说明 / 示例」，以 `#` 开头，**导入时自动跳过，无需删除**。
    说明行已标注每个字段的**类型 / 必填 / 唯一 / 枚举可选值 / 引用目标主键**（例如 `status` 会写明「可选值 ENABLED/DISABLED」），示例行给出可直接照抄的取值样式。
  - **两种校验模式**（两种导入方式共用）：
    - *整批校验*（默认，推荐）：任一行不合法则**整批拒绝、不落库**，并逐行给出行号与失败原因；
    - *跳过错误行*：合法行照常写入，失败行单独记录（结果标记 `PARTIAL`）。
  - **支持格式**：`.csv`、`.xlsx`、`.xls`。日期建议写 `yyyy-MM-dd` 或 `yyyy-MM-dd HH:mm:ss`；枚举列填**字典值**（如 `ENABLED`），引用列填**目标记录主键**（如 `companyId` 填 `C1`）。
  - **推荐顺序**：组织架构用上面的单表模式一次导完；资产等业务数据再按资源导入（引用列会校验目标记录是否存在，先建被引用方才能通过校验）。
  - **实现要点**：两种模式复用同一套解析（`ImportFileParser`）与落库链路（`RowCodec` 类型转换 / `RuleEngine` 必填·唯一·引用校验 / `GenericService.create`），因此密码加密、审计戳、业务钩子、库存联动等规则全部生效，不会绕开任何校验。

---

## 3. 冒烟回归清单（MySQL 部署后必做）

切到 MySQL 后，JDBC 的 `tinyint/bool` 映射与 H2 可能有差异，至少跑一遍以下回归：

- [ ] **登录**：`admin / Fzidt@123` 及各演示账号均能登录，无「未登录或登录已失效」横幅
- [ ] **组织架构单表导入**：`系统管理 → 数据导入`（默认「组织架构导入」）下载模板 → 在示例行下方追加一行「公司 + 部门 + 人员」→ 导入成功，组织架构树可见该公司/部门/人员；同一文件重复导入不产生重复公司/部门，人员行提示「登录账号已存在」
- [ ] **中文显示**：资产名、用户名、品牌、预警文案等中文正常（无「鑱旀兂」类乱码）
- [ ] **折旧方案启停**：`固定资产 → 资产管理 → 折旧管理`，拨动「启用」开关 → 提示「已启用/已停用」，**刷新页面后状态保持**（验证 `BOOLEAN` 在 MySQL 下也生效）
- [ ] **领用 / 退库代申请**：`新增领用 / 新增退库` 打开后默认预填「本人 + 本部门」；先选部门、领用人下拉自动过滤该部门人员；可改选他人代申请
- [ ] **审批流**：抽查一张单据提交审批 → 审批人能看到并处理

---

## 4. 演示账号清单

> 所有账号初始口令均为 **`Fzidt@123`**（seed 中明文，后端启动时会以 BCrypt 重新哈希落库）。
> 权限由 `组织架构 → 角色管理` 中的角色决定；同一个账号可绑定多个角色（seed 中均为单角色）。

| 用户名 | 姓名 | 角色 | 部门 · 职位 | 状态 |
|---|---|---|---|---|
| `admin` | 系统管理员 | R1 系统管理员 | C1·D1 信息中心主任 | 启用 |
| `zhangwei` | 张伟 | R2 资产管理员 | C1·D1 技术部经理 | 启用 |
| `lina` | 李娜 | R4 财务管理员 | C1·D2 财务主管 | 启用 |
| `wangqiang` | 王强 | R3 资产使用人 | C1·D3 行政专员 | 启用 |
| `liuyang` | 刘洋 | R3 资产使用人 | C1·D4 运营专员 | 启用 |
| `hexin` | 何欣 | R3 资产使用人 | C1·D5 市场专员 | 启用 |
| `chengang` | 陈刚 | R5 部门主管 | C1·D6 生产主管 | 启用 |
| `fengtao` | 冯涛 | R5 部门主管 | C1·D7 仓储主管 | 启用 |
| `gaoxiang` | 高翔 | R2 资产管理员 | C1·D102 运维组长 | 启用 |
| `zhoujing` | 周静 | R2 资产管理员 | C2·D8 资产主管 | 启用 |
| `zhengkai` | 郑凯 | R4 财务管理员 | C2·D9 财务专员 | 启用 |
| `wudi` | 吴迪 | R5 部门主管 | C3·D10 业务经理 | 启用 |
| `chenjing` | 陈静 | R6 审计员 | C3·D11 风控专员 | 启用 |
| `zhaomin` | 赵敏 | R5 部门主管 | C4·D12 工程部主管 | 启用 |
| `zhoufang` | 周芳 | R3 资产使用人 | C4·D13 采购专员 | 启用 |
| `sunlei` | 孙磊 | R3 资产使用人 | C5·D14 后勤专员 | **停用** |
| `asset` | 资产管理员 | R2 资产管理员 | C1·D1 资产管理岗 | 启用 |
| `fuzong` | 马文远 | R7 分管副总 | C1·D1 分管副总 | 启用 |
| `cangguan` | 孟海涛 | R8 仓管员 | C1·D7 仓管员 | 启用 |

> 公司：C1 华信科技、C2 云顶、C3 恒信、C4 中天、C5 华信（后勤）。
> `sunlei` 为停用账号，**应登录失败**（提示「账号已停用」）。

---

## 5. 权限码说明

权限体系分两层：

- **菜单/路由级**：左侧菜单与路由用 `meta.permission` 控制可见性（如 `fa:view` 控制「资产管理」菜单）。
- **按钮/操作级**：页面内操作按钮用 `v-if="can('xxx')"` 控制（如 `fa:depreciation` 控制折旧管理编辑按钮）。

权限码在 `fams-frontend/src/config/permissions.js` 的 `PERMISSION_TREE` 中定义，角色在「组织架构 → 角色管理」勾选叶子节点即生效。

### 权限码总表（模块 → 码 → 说明）

| 模块 | 权限码 | 说明 |
|---|---|---|
| 工作台 | `wm:view` | 工作台访问 |
| | `wm:todo` | 我的待办 |
| | `wm:alert` | 预警中心 |
| | `wm:overview` | 概览看板 |
| | `wm:message` | 我的消息 |
| 固定资产 | `fa:view` | 资产台账 / 基础设置查看 |
| | `fa:add` | 资产新增 |
| | `fa:edit` | 资产编辑 |
| | `fa:delete` | 资产删除 |
| | `fa:export` | 台账导出 |
| | `fa:inbound` | 入库 / 验收 |
| | `fa:dispatch` | 派发 / 退库 |
| | `fa:borrow` | 借出使用 |
| | `fa:change` | 资产变更 |
| | `fa:dispose` | 资产处置 |
| | `fa:inventory` | 资产盘点 |
| | `fa:depreciation` | 折旧管理 |
| | `fa:report` | 资产报表 |
| 低值资产 | `lv:view` | 库存台账 / 基础设置查看 |
| | `lv:edit` | 物品维护 |
| | `lv:export` | 台账导出 |
| | `lv:inbound` | 入库办理 |
| | `lv:requisition` | 领用办理 |
| | `lv:return` | 退库办理 |
| | `lv:report` | 资产报表 |
| 组织架构 | `org:company` | 公司管理 |
| | `org:dept` | 部门管理 |
| | `org:user` | 用户管理 |
| | `org:role` | 角色管理 |
| 系统管理 | `sys:dict` | 数据字典 |
| | `sys:log` | 操作日志 |
| | `sys:workflow` | 流程配置 |
| | `sys:params` | 系统参数 |
| | `sys:message` | 消息中心 |
| | `sys:template` | 消息模板 |
| | `sys:terminal` | 盘点终端 |

### 角色 → 关键权限映射

| 角色 | 核心权限 | 数据范围 |
|---|---|---|
| R1 系统管理员 | 全部模块 | 全集团（ALL） |
| R2 资产管理员 | `fa:*` 除 `fa:delete`；`lv:*` 出入库与维护 | 本公司（COMPANY） |
| R3 资产使用人 | `fa:view`、`lv:view`、`lv:requisition`、`lv:return` | 本部门（DEPT_ONLY） |
| R4 财务管理员 | `fa:view/export/depreciation/report`、`sys:log` | 本公司（COMPANY） |
| R5 部门主管 | `fa:view/edit/dispatch/borrow/inventory`、`fa:report`、`lv:requisition` | 本部门（DEPT） |
| R6 审计员 | 只读：`fa:view/report`、`lv:view/report`、`sys:log` | 全集团（ALL） |
| R7 分管副总 | `fa:view/edit/dispose/report`（大额处置审批环节） | 全集团（ALL） |
| R8 仓管员 | `fa:view`、`lv:inbound/requisition/return` | 本公司（COMPANY） |

> **数据范围**说明：`ALL/GROUP`=全集团可见；`COMPANY`=仅本公司数据；`DEPT/DEPT_ONLY`=仅本人所在部门。
> ⚠️ **当前状态**：权限码（菜单/按钮）已生效，但行级数据隔离**尚未在后端实现**——`data_scope` 字段暂未参与查询过滤，详见第 7 节。列表查询与导出目前不做公司/部门隔离。

---

## 6. 账号 / 权限测试用例

部署或改动权限逻辑后，按下列矩阵抽样验证（H2 与 MySQL 通用）：

| 测试账号（角色） | 登录后预期 | 关键验证点 |
|---|---|---|
| `admin`（R1） | 左侧菜单全开，含「系统管理」全部项 | 折旧方案开关可改并持久化；可维护角色权限 |
| `zhangwei`（R2） | 资产管理全功能（**无**删除）；低值出入库 | 看不到「系统管理」菜单（无 `org:*`/`sys:*`） |
| `lina`（R4） | 仅「折旧管理 / 资产报表 / 操作日志」等财务相关 | 无 `fa:add`，「新增资产」按钮不可见；无资产新增入口 |
| `wangqiang`（R3） | 仅固定资产台账查看 + 低值领用/退库 | **新增领用**默认预填「王强 + 行政部(D3)」；可改选他人代申请；左侧无财务/系统菜单 |
| `chengang`/`fengtao`（R5） | 本部门资产编辑、派发、盘点 | 数据范围限定本部门；可见「预警中心」 |
| `chenjing`（R6） | 全部只读 | 所有新增/编辑/删除按钮均隐藏；可见「概览看板」 |
| `fuzong`（R7） | 处置相关 | 处置审批环节可处理大额资产处置单 |
| `cangguan`（R8） | 低值入库/领用/退库 | 低值出入库办理入口可见，固定资产新增不可见 |
| `sunlei`（R3，停用） | **登录失败** | 提示「账号已停用」，不进入系统 |
| 用 `wangqiang` 测试代申请 | 改「领用部门」→ 领用人下拉自动过滤该部门人员 | 选非本部门的人被阻断；换部门后已选人清空 |

> 提示：第 3 节「冒烟回归清单」中的「领用 / 退库代申请」可直接用 `wangqiang` 账号走通；「折旧方案启停」可用 `admin` 或 `zhangwei` 走通。

---

## 7. 数据范围过滤（跨公司 / 跨部门）—— 已知限制（单公司使用）

> **结论**：当前产品定位为**单公司使用**，行级数据隔离**不实现**。本节仅作已知限制存档，无需据此回归。如需支持多公司集团，再启动实现（见文末说明）。

### 现状（已核实后端代码）

- 角色 `org_roles.data_scope` 字段已定义（`ALL` / `COMPANY` / `DEPT` / `DEPT_ONLY`），但后端 `GenericService.list/page` 与 `QueryAssembler` **未读取当前登录用户的角色、也不按其数据范围追加 WHERE 条件**。
- 结果：**任何已登录用户都能看到全部公司、全部部门的数据**（资产管理台账、低值库存、报表导出均不隔离）。第 6 节的权限码控制的是「能不能看到菜单/按钮」，不控制「能看到哪些行」。
- 单公司场景下无影响：所有 seed 账号的业务数据默认归属同一家公司即可，无需隔离。

### 预期行为（实现后应达到）

| 数据范围 | 含义 | 应过滤字段 |
|---|---|---|
| `ALL` / `GROUP` | 全集团可见 | 不过滤 |
| `COMPANY` | 仅本公司 | `company_id` |
| `DEPT` / `DEPT_ONLY` | 仅本人所在部门 | `dept_id` |

### 验收测试用例（实现后据此回归）

| 测试账号（角色 / 范围 / 所属） | 操作 | 预期结果 |
|---|---|---|
| `zhoujing`（R2 / COMPANY / C2 云顶） | 资产管理台账 | 只看到 C2 资产，看不到 C1/C3/C4/C5 |
| `wangqiang`（R3 / DEPT_ONLY / C1·D3 行政部） | 固定资产台账 | 只看到 D3 名下资产；跨部门资产不可见 |
| `admin`（R1 / ALL / C1） | 任意台账 + 导出 | 全公司全部门可见、可导出 |
| `chenjing`（R6 / ALL / C3） | 资产报表导出 | 全量数据可导出 |

> ⚠️ 以上用例反映「多公司隔离」的**目标行为**，当前单公司模式下不强制验收。若后续要支持多公司集团，再实现行级过滤并据此回归。

---

## 8. 生产部署（本机企业级形态）

> 把系统跑成「类生产」形态：后端打 jar（`prod` profile）+ 前端静态化 + nginx 做 HTTPS 反向代理。与第 1 节的 dev 联调（H2 / vite dev）区分开。本机单公司演示可用；真正的多公司、等保、备份、审计见第 7 节与后续规划。

### 拓扑

```
浏览器 https://localhost
        │
        ▼
   nginx (:443, HTTPS)  ── /api 反代 ──▶  后端 jar (:8080, prod profile)
        │
        └── 静态托管前端 dist/
后端 jar(prod)  ──▶  MySQL(fams)，专用账号 fams@127.0.0.1（仅授权 fams.*）
```

### 凭据（部署时请改掉默认值）

| 项 | 默认值 | 说明 |
|---|---|---|
| 应用登录口令 | `Fzidt@123`（全员统一强口令） | 业务账号 `admin`/`zhangwei`/`wangqiang`/… 均用此登录 |
| 数据库账号 | `fams` @ `127.0.0.1` | 仅授权 `fams.*`，最小权限（已收回调试期建的 `root@127.0.0.1` 全权限） |
| 数据库口令 | `FamsDb@2026!` | 在 `application-dev.yml` / `application-prod.yml` 默认值 |
| JWT 密钥 | `FamsJwtProdKey@2026!kP9zQx7vB2mC8wE3rT5yU` | HS256 要求 ≥32 字符；用环境变量 `JWT_SECRET` 覆盖 |

### 一键启动 / 停止

- `start-prod.bat`：自动确保 `MySQL80` 服务运行 → 启动后端 jar（`prod`）→ 启动 nginx（HTTPS）。
- `stop-prod.bat`：停 nginx + 后端 jar。
- **首次部署前置**：先按第 2 节建好 `fams` 库（脚本不会自动建库）。
- 访问 `https://localhost`。自签证书浏览器会报安全警告，**点「继续 / 高级 → 继续」**即可（本机演示；正式环境换 CA 签发证书）。

### 构建与关键目录

- 前端：`fams-frontend` 下 `.env.development`（dev 直连 8080）/ `.env.production`（`/api` 同源走 nginx）；`npm run build` 产物在 `dist/`。
- 后端：统一用根目录 `build-prod.ps1` 构建（**先跑全量测试，通过后才产出 jar**），产物 `fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar`；`prod` profile 在 `application-prod.yml`（外部化 `JWT_SECRET`、CORS 收紧到 `https://localhost`、关 `sql.init`）。**禁止 `mvn package -DskipTests`**：历史上正是它把 9 个测试类的红灯藏了很久（详见第 9 节）。改了 `application-prod.yml` 后必须重新构建（jar 在构建时把配置打进去）。
- nginx：`deploy/nginx/conf/nginx.conf`；证书 `deploy/certs/localhost.crt` + `localhost.key`（自签，SAN = `localhost` + `127.0.0.1`）。

### dev 联调 vs 生产形态

| 维度 | dev 联调 | 生产形态 |
|---|---|---|
| 后端 | `mvn spring-boot:run`（h2 / dev profile） | `java -jar`（prod profile） |
| 前端 | `npm run dev`（vite :5174） | `npm run build` 静态化由 nginx 托管 |
| 数据库 | H2 内存 / MySQL（专用 fams 账号） | MySQL（专用 fams 账号） |
| 协议 | http | https（自签证书） |
| 启动脚本 | `start-dev.bat` / `start-dev-mysql.bat` | `start-prod.bat` |

> 本机生产形态已端到端冒烟通过（HTTPS 登录、中文无乱码、折旧方案启停持久化、领用默认本人+部门过滤代申请、前端资源加载）。后续未覆盖项（按落地顺序）：数据范围隔离已定为单公司不实现（见第 7 节）；审批闭环、折旧合规口径、审计日志为后续阶段。

---

## 9. 测试体系与发布门禁

### 分层现状

| 层次 | 位置 | 数量 | 说明 |
|---|---|---|---|
| 接口/集成测试 | `fams-backend/src/test/java/com/fams/p0..p7` | 64 用例 | `@SpringBootTest + MockMvc + H2`，覆盖骨架、鉴权、通用引擎、审批、低值库存、折旧、系统管理与**口令安全回归** |
| 前端单元测试 | `fams-frontend/*.test.mjs` | 4 组 | 自研 runner（`npm run test`），验证 auth / 审批 / 低值 / 工作台的 store 与数据层 |
| E2E 端到端 | `tests/e2e/*.spec.ts` | 7 用例 | Playwright Test Runner，针对真实生产栈 `https://localhost` 验证关键点击流 |
| 覆盖率度量 | jacoco | 整体行覆盖约 79% | `security` ≥ 70%、`engine` ≥ 78% 才允许构建通过 |

> 关于快照测试：本系统**不引入** UI/响应快照。Element Plus 表格 + 中文数据 + 时间戳会让快照频繁抖动、维护成本高；
> 真正需要防的是业务规则回归（口令加密、响应脱敏、权限码、库存/状态流转），这些用行为断言更可靠。

### 怎么跑

```bash
# 1) 后端接口/集成测试（含覆盖率门禁）
cd fams-backend && mvn test

# 2) 前端单元测试
cd fams-frontend && npm run test

# 3) E2E（需生产栈在跑：start-prod.ps1）
npm run test:e2e                 # 根目录下
npm run test:e2e -- --headed     # 需要看界面时
npm run test:e2e:report          # 查看 HTML 报告
```

E2E 可通过环境变量切换目标，便于在 CI 的非 nginx 环境下运行：

```bash
E2E_BASE_URL=http://localhost:5174 npm run test:e2e   # 走 vite dev（/api 由 vite 代理）
E2E_CHANNEL=msedge npm run test:e2e                   # 本机未下载 chromium 时复用 Edge/Chrome
```

### 门禁规则

- **`build-prod.ps1` 是唯一发布构建入口**：后端 `mvn clean package`（跑测试，不过不产 jar）→ 前端 `npm run test` → `npm run build`，任何一环失败即中止。
- **禁止 `-DskipTests`**：第 1 阶段改掉种子弱口令后，9 个测试类（50 个用例）全部变红，因为长期用 `-DskipTests` 打包而无人发现。恢复跑测试后顺手揪出两个真实缺陷：
  1. 通用引擎 `create` 对 `org-users` 的口令未走 `PasswordPolicy` + BCrypt → **新增用户口令明文落库**；
  2. 对外响应剔除 `password` 后，`DataInitializer` 靠 `list()` 读口令迁移的逻辑被饿死 → **全新部署口令保持明文且无法登录**。
  这两类问题如今由 `P7PasswordSecurityTest` 专门守卫。
- **CI**：`.github/workflows/ci.yml`，三条 job 串行把关——后端测试+覆盖率、前端测试+构建、Playwright E2E。
- **口令只允许一处定义**：后端测试用 `com.fams.TestAccounts`（对齐 `db/seed.sql`），E2E 用 `E2E_PASSWORD` 环境变量，避免再次出现"改了种子忘了改测试"。

### 踩过的坑（写用例时注意）

- token 存在 **`sessionStorage`**，`storageState` 无法跨 context 还原，所以 E2E 每个用例都在 `beforeEach` 里真实 UI 登录。
- Element Plus 的 `el-select` 选中值渲染在 `span`，`inputValue()` 恒为空，必须读 `.el-select` 的 `innerText`。
- 登录按钮文案是「登 录」（中间有空格），用正则 `/登\s*录/`。
- E2E 不要开 `video`（依赖 ffmpeg 二进制），用 `trace` + 失败截图足够。
- 折旧启停是写操作，`smoke.spec.ts` 的 `afterAll` 强制校验必须还原到原始状态，杜绝测试数据残留。

### CI E2E 拓扑的坑（第一次 CI 跑挂后定位的四个）

CI 的 E2E 不用 nginx/MySQL：后端 `h2` profile + 前端 vite dev（`/api` 同源代理），Playwright 打 `http://localhost:5174`。第一次上线时 E2E job 挂了（3m10s），排查出四个独立问题，都已修复并写死在 workflow 里：

1. **后端必须用 `h2` profile**，不要用 `test` profile + `-Dspring-boot.run.useTestClasspath=true` —— 后者在 CI 下不生效，导致 H2 没有 schema/seed（空库），启动即 `Table "ORG_USERS" not found`，健康检查卡满 180s 超时（这正是 3m10s 的来源）。`application-h2.yml` 在主资源里，自动建表灌种子，源码/jar 启动都可用。
2. **经 vite 代理后，后端看到的是跨域请求**：浏览器 `Origin: http://localhost:5174`、但代理把 Host 改成 `127.0.0.1:8080`，后端按跨域处理；若 CORS 不放行该 Origin，登录接口直接 403。`application-h2.yml` 已放行 `localhost:5174` 与 `127.0.0.1:5174`。因此 vite 不要绑 `127.0.0.1`（会制造 Origin 不匹配）。
3. **vite 加 `--port 5174 --strictPort`**：端口被占时 vite 默认会静默换端口（日志里 "Port 5174 is in use, trying another one"），等待循环就会白等；strictPort 让它直接失败，日志立刻可见。
4. **`login()` 必须直接 `goto('/login')`**：走 `/` 会经历 SPA 客户端重定向，瞬间 `isVisible()` 判定会误判为未登录而跳过填表，所有用例 31s 超时。

另外两条断言层面的经验：dev 模式浏览器自动请求 `favicon.ico` 缺失会报控制台错误（prod/nginx 不报），`afterEach` 需过滤 `Failed to load resource` 且不含 `/api/` 的消息；种子里存在**没有在职成员的部门**，切换过去后 `el-select` 显示「无数据」是合法状态，断言必须兼容（优先选有成员的部门来验证过滤语义）。

## 目录结构

```
EAM-FAMS/
├── start-dev.bat / start-dev.ps1   # 一键启动（H2 联调）
├── stop-dev.bat                    # 停止服务
├── fams-backend/
│   ├── src/main/resources/
│   │   ├── db/                     # H2 联调用 schema.sql + seed.sql
│   │   ├── sql/                    # 生产用 SQL：01-schema / 02-seed / 03-demo
│   │   ├── application-h2.yml      # H2 profile（sql.init.mode=always, encoding=utf-8）
│   │   ├── application-dev.yml     # MySQL profile（sql.init.mode=never）
│   │   └── application.yml         # 默认 profile 切换开关
└── fams-frontend/                  # Vue3 + Vite
```
