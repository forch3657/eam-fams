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
2. **按顺序执行建库脚本**（在 `fams-backend/sql/` 下）：
   - `sql/01-schema/00-schema.sql` —— 建表
   - `sql/02-seed/` —— 基础主数据（公司/部门/用户/角色/字典等）
   - `sql/03-demo/` —— 演示业务数据
3. **脚本已同步的修复（务必确认已带入）**：
   - 三张表的 `enabled` 列已为 **`BOOLEAN`**（折旧方案、流程配置、消息模板）。**不要改回 `TINYINT(1)`** —— 否则后端回读成 `0/1`，前端 `el-switch` 严格比较 `true` 失败，启停开关会「看似没启用」并反复弹回。`sql/01-schema/00-schema.sql` 与 `db/schema.sql`（H2 用）这两份都要保持 `BOOLEAN`。
   - seed 中的 `1/0` 对 `BOOLEAN` 列兼容，无需改动。

> 关键点：本项目有两套 schema —— 联调用的 `fams-backend/src/main/resources/db/schema.sql`（H2）和部署用的 `fams-backend/sql/01-schema/00-schema.sql`（MySQL）。改表结构时**两处都要同步**。

---

## 3. 冒烟回归清单（MySQL 部署后必做）

切到 MySQL 后，JDBC 的 `tinyint/bool` 映射与 H2 可能有差异，至少跑一遍以下回归：

- [ ] **登录**：`admin / Fzidt@123` 及各演示账号均能登录，无「未登录或登录已失效」横幅
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
- 后端：`mvn package -DskipTests` → `fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar`；`prod` profile 在 `application-prod.yml`（外部化 `JWT_SECRET`、CORS 收紧到 `https://localhost`、关 `sql.init`）。**改了 `application-prod.yml` 后必须重新 `mvn package`**（jar 在构建时把配置打进去）。
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
