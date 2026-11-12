# EAM-FAMS 生产级系统审查报告

| 项 | 内容 |
|---|---|
| 审查日期 | 2026-11-11 |
| 审查对象 | `f:/work/EAM-FAMS`（Spring Boot 2.7.18 + Vue3 + MySQL 8 + nginx，前后端分离） |
| 审查基准 | 真实生产环境：对外可达、含真实客户组织数据的多用户企业系统 |
| 审查方法 | 静态代码/配置/构建产物核验；文档声明与实际实现双向比对；契约与权限数据实测；git 跟踪状态核对 |
| 审查结论 | 业务规则、审批链、测试与文档完备度较高；但以生产标准衡量，**当前不宜对不可信网络开放**，需先完成 P0 整改 |

> **路径约定**：本文所有路径均相对仓库根 `f:/work/EAM-FAMS`。
> **审查边界**：未执行动态渗透测试、未连接生产库、未运行自动化浏览器测试（点测由用户手动完成）。结论基于静态证据；个别可利用性推断已在文中标明需点测复核。
> **规模实测**：后端 main 69 个 Java 类 / 17 个测试文件 / 139 个 `@Test`；前端 76 个 js+vue 文件 / 4 组自研测试（207 断言）；E2E 23 个 spec / 204 用例；契约 68 个集合、36 条权限规则；数据库 39 张表。

### 已尊重的既有决策（不作为缺陷推翻）

- `version` 乐观锁：body 不带 `version` 放行、带则比对不一致返 409；
- 盘点派生单据走独立事务、失败只告警，不推翻审批结论；
- E2E 直接跑生产库，清空重导由人工执行，禁用自动清库；
- 低值资产不补盘点 / 报废模块；
- 后端 `contract/*.json` 由前端 `schema.js` 导出生成，禁止手改。

下文仅指出这些口径下**仍缺失的保障**，不要求推翻决策本身。

---

## 一、审查框架（8 维度 × 检查项）

| # | 维度 | 检查项 |
|---|---|---|
| 1 | 整体架构与模块划分 | ①分层与包职责边界 ②实体/DTO/类型安全 ③God class 与方法复杂度 ④契约驱动机制与单一真源 ⑤前后端/双数据层边界 ⑥部署拓扑与网络边界 ⑦模块依赖方向与环 ⑧跨域生成链（前端脚本写后端资源） |
| 2 | 依赖与耦合 | ①依赖清单与 BOM 锁定 ②框架/JDK 生命周期 ③依赖漏洞扫描与 SBOM ④包级循环依赖 ⑤多真源（权限/schema/校验/导出）⑥环境切换耦合 ⑦外部服务依赖 ⑧漂移检测手段 |
| 3 | 可扩展性与性能 | ①水平扩展能力（进程内状态）②连接池与超时 ③分页与全表扫描 ④批量/导入/导出的 N+1 ⑤缓存/异步/限流 ⑥大文件内存占用 ⑦前端分包与首屏 ⑧单号生成并发 |
| 4 | 代码规范与可维护性 | ①类型系统 ②Lint/格式化门禁 ③文件/方法长度 ④重复实现 ⑤魔法值/状态枚举 ⑥异常吞噬与静默降级 ⑦技术债标记与兼容 hack ⑧文档与代码一致性 |
| 5 | 安全性与权限控制 | ①认证与口令存储 ②口令策略与首登改密 ③token 生命周期/注销 ④服务端权限码（非展示层）⑤行级越权（增查改删清空）⑥免鉴权面与 fail-open ⑦凭据/密钥/证书管理 ⑧注入/XSS/CSRF/CORS/上传 ⑨传输层与安全响应头 ⑩审计日志防篡改 ⑪依赖 CVE |
| 6 | 数据一致性与错误处理 | ①事务边界 ②跨表写失败补偿 ③乐观锁原子性 ④库存条件更新/超卖 ⑤状态机不可绕过 ⑥幂等与 DB 唯一约束 ⑦schema 一致性与版本化迁移 ⑧异常映射与信息泄漏 ⑨前后端错误处理 ⑩入参类型校验 |
| 7 | 测试覆盖与 CI/CD | ①分层用例与核心类覆盖 ②覆盖率门禁有效性 ③负向/越权用例 ④测试与生产环境一致性 ⑤CI job 与静态检查 ⑥发布门禁（失败即中止）⑦备份/回滚/版本标记 ⑧E2E 数据卫生 ⑨部署自动化 |
| 8 | 日志监控与可观测性 | ①日志配置/级别/滚动/容量 ②traceId/MDC ③请求耗时与入出参 ④审计覆盖与不可篡改 ⑤健康检查与指标 ⑥告警/APM/链路追踪 ⑦前端错误上报 ⑧网关访问日志 ⑨备份与恢复演练 |

**分级标准**

- **严重**：无需特殊条件即可造成账号接管、越权读写/清空、账实不符、凭据泄露、审计失效或数据不可恢复。
- **一般**：在并发、规模、故障或变更场景下放大为生产事故，或质量/运维保障存在系统性缺口。
- **建议**：工程化与长期可维护性改进，不直接导致事故。

---

## 二、按框架逐维度审查

### 1. 整体架构与模块划分

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 分层与包职责 | 部分：`common/config/contract/engine/hook/rule/security/imports/module.*` 清晰，但无 `entity/repository/dto`，全程 `Map<String,Object>` | 建议 | `fams-backend/src/main/java/com/fams/engine/GenericService.java:107-111`、`engine/RowCodec.java:59-73` |
| God class | 不符合：2 个超大类、4 个 >1000 行前端组件 | 一般 | `module/approval/ApprovalService.java:1-1322`、`engine/GenericService.java:1-1060`、`fams-frontend/src/views/fixed-asset/FixedAssetManagement.vue:1-3021` |
| 契约单一真源 | 部分：生成链成立，但后端启动强依赖前端产物；契约未声明字段静默丢弃 | 一般 | `contract/ResourceDefinitionLoader.java:26-27,63`、`engine/RowCodec.java:23,59-72`、`fams-frontend/tools/export-contract.mjs:16,86-107` |
| 双数据层 | 不符合：mock 与 http 两套实现并存，且默认回落 mock | 一般 | `fams-frontend/src/services/index.js:6-9,25`、`services/mock/index.js`、`services/http.js` |
| 部署拓扑 | 不符合：80 明文与 443 等价对外、后端仅回环监听 | 严重 | `deploy/nginx/conf/nginx.conf:13-16,38-44,48-54`、`fams-backend/src/main/resources/application-prod.yml:4-7` |
| 包级循环 | 部分：`engine↔rule`、`engine↔hook↔approval` 成环，靠手工规避 Bean 环 | 建议 | `engine/GenericService.java:8-10`、`rule/RuleEngine.java:8-11`、`hook/ApprovalTrailHook.java:30-31` |

### 2. 依赖与耦合

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 版本锁定 | 部分：仅 parent BOM + 2 个属性，POI 版本散落 | 建议 | `fams-backend/pom.xml:11-16,25-31,112-117` |
| 框架生命周期 | 不符合：Spring Boot 2.7.18（2.7 线终版）+ JDK 8 | 一般 | `fams-backend/pom.xml:8-10,25`、`.github/workflows/ci.yml:21` |
| 依赖审计 | 不符合：无 OWASP/Snyk/Trivy/SBOM，CI 显式 `--no-audit` | 一般 | `fams-backend/pom.xml:122-208`、`.github/workflows/ci.yml:26,48,90,114` |
| 多真源 | 不符合：权限≥6 处、schema 3 处、CSV 导出≥4 份 | 一般 | `engine/PermissionPolicy.java:38-165`、`contract/permission-resources.json`、`fams-frontend/src/config/permissions.js`、`sql/01-schema/00-schema.sql:1`、`resources/db/schema.sql:42`、`deploy/sql/mysql/schema.sql:42` |
| 契约漂移 | 已实证：导出曾抹掉 8 个字段致静默丢数据 | 一般 | `docs/qa/escaped-defects.md:44`（BUG-026）、`README.md:234` |

### 3. 可扩展性与性能

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 水平扩展 | 不符合：登录锁定、权限映射均为进程内 `ConcurrentHashMap`，无共享状态 | 一般 | `security/LoginAttemptService.java:14-15,27`、`engine/PermissionPolicy.java:17,171` |
| 连接池 | 不符合：无 Hikari/超时显式配置 | 建议 | `application-*.yml` 全量无 `hikari` 段 |
| 分页/扫描 | 部分：SQL LIMIT 有，但 list 上限 2000、唯一性/数组包含拉 5000 行内存比对 | 一般 | `engine/QueryAssembler.java:31-39,43-59`、`rule/RuleEngine.java:37-38,164-182` |
| 批量/导入 | 不符合：逐行 `create`、每字段一次 count、Excel 全量载入内存、无流式导出 | 一般 | `imports/DataImportService.java:105-138`、`imports/ImportFileParser.java:139`、`rule/RuleEngine.java:75-103` |
| 单号并发 | 不符合：`max+1` 无唯一索引保护 | 一般 | `engine/GenericService.java:828-844`、三处 schema 无 `UNIQUE` |
| 缓存/异步/限流 | 不符合：无 `@Cacheable`/Redis、`@Async`、接口级限流 | 一般 | 全 main 检索 0 命中（`LoginAttemptService` 仅账号级锁定） |
| 前端首屏 | 不符合：全量引入 Element Plus、无 `manualChunks`/体积门禁 | 一般 | `fams-frontend/src/main.js:3-5`、`fams-frontend/vite.config.js:55-83` |

### 4. 代码规范与可维护性

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 类型系统 | 不符合：前端纯 JS，无 TS/tsconfig | 一般 | `fams-frontend/package.json:6-29`、src 下 `*.ts` 0 文件 |
| Lint 门禁 | 不符合：无 ESLint/Prettier/format/lint 脚本，CI 亦未跑 | 一般 | `fams-frontend/package.json:6-17,26-29`、`.github/workflows/ci.yml:49-54` |
| 测试框架 | 部分：自研 loader 把 `.vue` 替换为空模块，无法测组件/路由守卫 | 一般 | `fams-frontend/.test-loader.mjs:8-14,36-41`、`fams-frontend/package.json:10` |
| 异常吞噬 | 部分：32 处 `.catch(() => {})`，后端 JSON 解析失败静默降级 | 一般 | `FixedAssetManagement.vue:1219,1221,1224,1682,2587`、`engine/RowCodec.java:138-151`、`engine/GenericService.java:960` |
| 技术债 | 部分：无 TODO，但「从备注正则反解 planId」「兼容旧码」大量活跃 hack | 建议 | `module/approval/ApprovalService.java:101-104,253,1206`、`engine/PermissionPolicy.java:64`、`rule/RuleEngine.java:37-38` |
| 正面项 | 符合：统一 `@Slf4j`，无 `System.out`/空 catch，注释解释「为什么」 | — | 后端 main 精确检索 0 命中 |

### 5. 安全性与权限控制

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 口令存储 | 符合：BCrypt、响应脱敏、登录失败锁定、停用即时生效 | — | `config/SecurityBeansConfig.java:18-21`、`module/auth/AuthService.java:59-68`、`engine/GenericService.java:251-256` |
| 登录页公示凭据 | **不符合：未登录即可见真实人名/手机号账号与初始口令，且已进入生产 `dist`** | **严重** | `fams-frontend/src/views/Login.vue:65-75`、`fams-frontend/dist/assets/Login-y7d4cQ-u.js`、`tests/e2e/fixtures/realOrg.ts:27-29`、`tests/e2e/fixtures/env.ts:13` |
| 凭据/证书管理 | **不符合：DB 口令、JWT 默认密钥、seed 口令明文入库；TLS 私钥已被 git 跟踪** | **严重** | `application-prod.yml:17`、`application.yml:36`、`application-h2.yml:25-26`、`resources/db/seed.sql:36`、`deploy/.secrets/db-admin.txt:3-5`、`deploy/certs/localhost.key`（`git ls-files` 确认）、`.gitignore:1-2` |
| token 生命周期 | **不符合：登出空实现、无黑名单/jti/版本号，480 分钟内可重放** | **严重** | `module/auth/AuthController.java:29-33`、`security/JwtProvider.java:24-48`、`application.yml:37` |
| 行级越权 | **不符合：`scopedRaw` 仅 `list/page` 使用，detail/update/delete/batch/clear 无范围校验** | **严重** | `engine/GenericService.java:109,132,141-148,263-265,367-369,402-430,434-439`、`engine/SqlProvider.java:42-52,112-125` |
| 权限 fail-open | **不符合：未登记集合默认仅需登录；实测 2 个集合写/删完全无规则，`DELETE /all` 无保护** | **严重** | `engine/PermissionPolicy.java:247-274,199-204`、`contract/permission-resources.json:17-25`、`engine/GenericController.java:98-102`、`engine/GenericService.java:433-439`（68 集合 / 36 规则，前缀匹配后 `fixed-asset-report-depreciation-details`、`fixed-asset-report-depreciation-plan-details` 无写删规则） |
| 审计防篡改 | **不符合：`sys:log` 同一权限码可写/删日志，登录/审批/导入/折旧端点不在切面内** | **严重** | `module/system/OperationLogAspect.java:39-40,56,109-124`、`contract/permission-resources.json:196-199`、`module/auth/AuthController.java`、`module/approval/ApprovalController.java`、`imports/DataImportController.java` |
| 传输层 | **不符合：80 明文主入口不跳转、无 HSTS/CSP/X-Frame-Options/cipher/大小限制** | **严重** | `deploy/nginx/conf/nginx.conf:13-16,48-54`（全 conf `add_header` 仅 2 条 `Cache-Control`） |
| 上传校验 | 不符合：仅扩展名分流，无大小/魔数/行数上限 | 一般 | `imports/DataImportController.java:56-65`、`imports/ImportFileParser.java:31-41`、nginx 无 `client_max_body_size` |
| 暴力破解 | 部分：账号级 5 次/30 分钟，无 captcha、无 IP 级限流且进程内不共享 | 一般 | `security/LoginAttemptService.java:27-48`、`module/auth/LoginRequest.java:13-17`、nginx 无 `limit_req` |
| 首登改密 | 不符合：明文口令迁移后不强制改密，超期仅提示不阻断 | 一般 | `security/DataInitializer.java:59-79`、`security/PasswordPolicy.java:52-58` |
| 注入类 | 符合：值全参数化、标识符白名单；无 `v-html`/`innerHTML`；CSRF 因 Bearer 头不可利用 | — | `engine/SqlProvider.java:25-33,112-125`、`contract/Ident.java:16-31`、`engine/QueryAssembler.java:71-99` |
| CSV 公式注入 | 不符合：导出仅转义双引号，未处理 `= + - @` | 一般 | `LowValueAssetManagement.vue:871`、`FixedAssetReports.vue:497` |
| 前端回落 mock | 不符合：构建变量缺失即回落 mock，明文比对口令、签发伪 token | 一般 | `fams-frontend/src/services/index.js:6-9`、`store/user.js:100`、`services/auth.js:33-35` |

### 6. 数据一致性与错误处理

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 状态机绕过 | **不符合：通用 PUT 可把低值单据 `DRAFT→DONE`，直接结算库存并释放预占，跳过整条审批链** | **严重** | `engine/GenericController.java:75-80`、`engine/GenericService.java:272,319-348,360,860-890`、`engine/RowCodec.java:59-73`、`contract/resources.json`（`low-value-requisition.stock.settleOn=DONE`、`status` 为契约可写列；`assertDocMutable` 只守卫固资单据与盘点单） |
| 乐观锁原子性 | **不符合：读-比对-写非 CAS，`UPDATE` 无条件；`patchField`/`updateColumn`/`createIndependent` 旁路** | **严重** | `engine/GenericService.java:745-779,670-698`、`engine/SqlProvider.java:84-94,112-125`、`engine/GenericMapper.java:43` |
| 库存原子性 | **不符合：Java 端算好值后无条件 UPDATE，仅靠 `FOR UPDATE`；DB 无 CHECK/UNIQUE 兜底** | **严重** | `engine/GenericService.java:902-915,930-943`、`engine/SqlProvider.java:84-94` |
| DB 约束 | **不符合：39 张表仅主键，「必填/唯一/外键」写在 COMMENT 里；单号/重复归还仅代码判重** | **严重** | `sql/01-schema/00-schema.sql:8-11`、`deploy/sql/mysql/schema.sql:29-30`、`rule/RuleEngine.java:75-88`；同秒撞号已实证 `docs/qa/escaped-defects.md:30` |
| schema 与迁移 | **不符合：3 处 schema 类型漂移（TEXT vs LONGTEXT）；初始化脚本含 39 处 `DROP TABLE`；无 Flyway/Liquibase/版本表** | **严重** | `deploy/sql/mysql/schema.sql:42` vs `resources/db/schema.sql:42` vs `sql/01-schema/00-schema.sql:45`、`docs/deployment.md:242-249,263`、`fams-backend/pom.xml:34-118` |
| 派生单据补偿 | 部分（保留决策）：失败只 warn，缺补偿任务/对账，可产出「已完结但台账或处置单缺失」 | 一般 | `module/approval/ApprovalService.java:193-195,324,1083-1096,1190-1193`、`module/approval/ApprovalTrailWriter.java:68-73` |
| 导入事务 | 部分：三个专用导入用 `TransactionTemplate`，通用导入无整体事务、写入失败部分落库 | 一般 | `imports/FixedAssetImportService.java:210-227` vs `imports/DataImportService.java:105-138` |
| 异常处理 | 符合性良好：10 类异常统一信封、不回传堆栈/SQL；前端 401/403/5xx/超时有全局兜底 | — | `common/GlobalExceptionHandler.java:35-97,125-135`、`fams-frontend/src/services/http.js:91-122`、`fams-frontend/src/main.js:30` |
| 错误码语义 | 部分：业务码 1001~1006 走 HTTP 200 | 建议 | `common/GlobalExceptionHandler.java:125-135` |
| 类型校验 | 不符合：前端严格校验，后端按契约类型强转，服务端 `RuleEngine` 无 type 校验 | 一般 | `fams-frontend/src/services/contract/validate.js:40-56` vs `engine/RowCodec.java:77-95`、`rule/RuleEngine.java:51-73` |

### 7. 测试覆盖与 CI/CD

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 分层与数量 | 符合（较完备）：139 后端 / 207 前端断言 / 204 E2E，缺陷回灌台账 36 条 | — | `fams-backend/src/test/java/com/fams/p0..p13`、`docs/qa/escaped-defects.md` |
| 覆盖率门禁 | 部分：jacoco 0.75/0.70/0.78 绑 `test` 阶段、无排除包，但阈值按实测下调且大包无独立门槛 | 建议 | `fams-backend/pom.xml:135-203` |
| 负向鉴权用例 | 不符合：无「无 token/过期/篡改 token 401」断言，仅 5 处 4xx 断言 | 一般 | `p1/P1AuthTest.java:28,82,93,113`、`p3/P3ApprovalTrailTest.java:166` |
| 环境一致性 | **不符合：dev/CI/单测全 H2 自动建表，prod MySQL 手工迁移；已多次掩盖生产 500** | 一般（高优先） | `src/test/resources/application-test.yml:4,10-13`、`.github/workflows/ci.yml:78`、`application-prod.yml:15-21`、`docs/e2e/test-plan-p1-p5.md:372`、`docs/deployment.md:242`、`README.md:57-58` |
| 发布门禁 | 不符合：前端单测失败仍产 dist 后才退出；CI 无 lint/类型检查/安全扫描 | 一般 | `build-prod.ps1:35-39,58-61`（与 `README.md:518` 承诺不符）、`.github/workflows/ci.yml:46-54` |
| 备份/回滚 | 不符合：无自动备份、无版本标记、无回滚分支；迁移「只做加法」无 down | 一般 | `start-prod.ps1:25-34`、`build-prod.ps1`、`docs/deployment.md:244-249`、`docs/e2e/runbook.md:161-173`（手工） |
| E2E 数据卫生 | 部分（保留决策）：默认 `baseURL=http://localhost` 直跑生产库，人工清库重导；已写入 4975 条日志级数据 | 一般 | `playwright.config.ts:14`、`docs/e2e/runbook.md:154-183`、`docs/e2e/real-org-verification.md` |
| 部署自动化 | 不符合：无 Docker/k8s/蓝绿灰度/部署 job，Windows 进程窗口式启动 | 建议 | `.github/workflows/ci.yml`（仅 3 个测试 job）、`start-prod.ps1:27-34` |
| 文档漂移 | 部分：README 称 18 个 spec / 131 用例，实测 23 / 139 | 建议 | `README.md:462-467` |

### 8. 日志监控与可观测性

| 检查项 | 判定 | 等级 | 定位依据 |
|---|---|---|---|
| 日志配置 | 不符合：无 logback/log4j2 配置，仅 `logging.level`，无滚动/容量/格式 | 一般 | 全库 `*logback*` 0 命中；`application-prod.yml:38-41` |
| 链路标识 | 不符合：无 MDC/traceId/requestId，无请求耗时与入出参记录 | 一般 | `fams-backend` 中 `MDC\|traceId\|actuator` 0 命中；`security/JwtAuthFilter.java:49` |
| 指标/告警 | 不符合：无 actuator/Micrometer/Prometheus，仅自研 `/api/health`，nginx 未探活 | 一般 | `fams-backend/pom.xml:34-118`、`module/health/HealthController.java:30-44`、`deploy/nginx/conf/nginx.conf:1-84` |
| 前端错误上报 | 不符合：无 `window.onerror`/`unhandledrejection`/Sentry，仅本地 toast | 一般 | `fams-frontend` 全量检索 0 命中；`services/http.js:98-122` 仅本地兜底 |
| 网关日志 | 不符合：nginx 无 `access_log`/`error_log`/`log_format`/logrotate | 一般 | `deploy/nginx/conf/nginx.conf:1-84` |
| 审计覆盖 | 不符合：仅通用 CRUD 写操作，无 IP/UA/参数，失败日志写 `ex.getMessage()` | 严重 | `module/system/OperationLogAspect.java:56,109-124`、`fams-frontend/src/views/system/SystemLog.vue:19,53`（前端有 `ip` 列但后端从不写） |

---

## 三、问题清单

### 严重（10 项）

| 编号 | 问题 | 影响 | 主要定位 |
|---|---|---|---|
| S-01 | 登录页公示真实账号/手机号与初始口令，且已进入生产 `dist` | 匿名获取管理员及全员口令，直接接管 | `Login.vue:65-75`、`dist/assets/Login-y7d4cQ-u.js`、`realOrg.ts:27-29` |
| S-02 | DB 口令/JWT 默认密钥/seed 口令/管理员口令明文入库；TLS 私钥被 git 跟踪 | 凭据泄露、可离线伪造 token | `application-prod.yml:17`、`application.yml:36`、`deploy/certs/localhost.key`、`.gitignore:1-2`、`runbook.md:179` |
| S-03 | 登出空实现、无 token 失效机制、有效期 480 分钟 | 盗取/离职/改密后仍可重放 8 小时 | `AuthController.java:29-33`、`JwtProvider.java:24-48` |
| S-04 | 按 id 的增查改删、批量、清空全部绕过行级数据范围 | 跨公司/跨部门水平越权 | `GenericService.java:109,132,141-148,263-265,367-369,434-439` |
| S-05 | 权限默认放行 + `DELETE /all` 无保护；2 个集合写/删仅需登录 | 任意登录用户可伪造/清空折旧明细 | `PermissionPolicy.java:271-274`、`permission-resources.json:17-25`、`GenericService.java:433-439` |
| S-06 | 通用 PUT 可绕过审批把低值单据改为 `DONE` 并结算库存 | 无审批领用/入库、账实不符 | `GenericController.java:75-80`、`GenericService.java:360,860-890`、`resources.json` |
| S-07 | 审计日志可被 `sys:log` 改写删除，登录/审批/导入/折旧无审计 | 违规操作可抹痕、无法追责 | `OperationLogAspect.java:56`、`permission-resources.json:196-199` |
| S-08 | 80 端口明文对外、无 HSTS/CSP/帧防护/cipher 约束、自签证书 | 局域网嗅探、点击劫持、中间人 | `nginx.conf:13-16,48-54` |
| S-09 | 乐观锁非原子、库存非条件更新、DB 无任何唯一/外键/检查约束 | 并发丢更新、超卖、撞单号 | `SqlProvider.java:84-94,112-125`、`GenericService.java:758-779,902-915`、`00-schema.sql:8-11` |
| S-10 | 三处 schema 漂移、无版本化迁移、初始化脚本含 39 处 `DROP TABLE` | 升级 500 / 误执行清空全库 | `deploy/sql/mysql/schema.sql:42`、`resources/db/schema.sql:42`、`00-schema.sql:6,45`、`deployment.md:244-249` |

### 一般（18 项）

| 编号 | 问题 | 主要定位 |
|---|---|---|
| M-01 | dev/CI/单测 H2 与生产 MySQL 不一致，已有多次生产 500 实证 | `application-test.yml:4`、`ci.yml:78`、`test-plan-p1-p5.md:372` |
| M-02 | E2E 默认直跑生产库（保留决策），缺备份/只读硬门禁 | `playwright.config.ts:14`、`runbook.md:154-183` |
| M-03 | 前端单测失败仍产出 dist 后才退出；CI 无 lint/类型/依赖审计 | `build-prod.ps1:35-39,58-61`、`ci.yml:48,90,114` |
| M-04 | 无自动备份、版本标记、回滚；发布即覆盖 jar/dist | `start-prod.ps1:25-34`、`build-prod.ps1` |
| M-05 | 上传无大小/内容/行数校验，Excel 全量入内存 | `DataImportController.java:56-65`、`ImportFileParser.java:31-41,139` |
| M-06 | 无 captcha/IP 限流，账号锁定仅进程内 | `LoginAttemptService.java:27-48`、`LoginRequest.java:13-17` |
| M-07 | 初始口令迁移后不强制改密、口令超期不阻断 | `DataInitializer.java:59-79`、`PasswordPolicy.java:52-58` |
| M-08 | 派生单据/审计写入失败只 warn，缺补偿任务与对账（保留独立事务决策） | `ApprovalService.java:1083-1096,1190-1193`、`ApprovalTrailWriter.java:68-73` |
| M-09 | 通用导入无整体事务，写入期失败部分落库 | `DataImportService.java:105-138` |
| M-10 | 无日志配置/traceId/请求日志/actuator/告警/前端错误上报/nginx 访问日志 | `application-prod.yml:38-41`、`pom.xml:34-118`、`nginx.conf:1-84` |
| M-11 | 无依赖漏洞扫描；Spring Boot 2.7.18 + JDK8 已停止主流支持 | `pom.xml:8-16,25`、`ci.yml:26` |
| M-12 | 2000 行 list 上限、5000 行内存扫描、逐行导入、无 Hikari/缓存/异步/限流 | `QueryAssembler.java:31-39`、`RuleEngine.java:37-38`、`DataImportService.java:125-135` |
| M-13 | 3021 行巨型组件、4 个 >1000 行文件、全量 Element Plus、无分包策略 | `FixedAssetManagement.vue`、`main.js:3-5`、`vite.config.js:55-83` |
| M-14 | 无 TS/ESLint，自研 loader 无法测组件，32 处静默 catch | `.test-loader.mjs:8-14`、`package.json:6-29`、`FixedAssetManagement.vue:1219` |
| M-15 | 权限≥6 处、schema 3 处、CSV 导出 4 份、状态字符串散落无枚举 | `PermissionPolicy.java:38-165`、`services/index.js:9`、`README.md:234` |
| M-16 | 前后端类型校验不一致（前端严格/后端强转）；负向鉴权用例缺失 | `validate.js:40-56`、`RowCodec.java:77-95`、`P1AuthTest.java:28` |
| M-17 | 审批动作、导入资源列表等端点仅需登录；`wm:todo` 场景完全跳过范围过滤 | `ApprovalController.java:27-33`、`DataImportController.java:40-43`、`GenericService.java:570-572,622-630` |
| M-18 | 前端误配即回落 mock 绕过后端鉴权；CSV 公式注入；生产默认 profile 为 h2 | `services/index.js:6-9`、`LowValueAssetManagement.vue:871`、`application.yml:15` |

### 建议（8 项）

| 编号 | 问题 | 主要定位 |
|---|---|---|
| L-01 | `Map<String,Object>` 无实体类型、2 个 God class、包级循环 | `GenericService.java:107-111`、`ApprovalService.java:1-1322` |
| L-02 | 权限双实现（static 表被 JSON 全量覆盖）、CORS 双配置 | `PermissionPolicy.java:38-165,199-204`、`config/CorsConfig.java:31-56` |
| L-03 | 活跃兼容 hack：正则从备注反解 `planId`、旧权限码并存 | `ApprovalService.java:101-104,253,1206` |
| L-04 | 无容器化/编排/灰度，窗口式进程启动、无 JVM 参数与守护 | `start-prod.ps1:27-34` |
| L-05 | CI action 浮动 major tag、`npm install` 非 `npm ci` | `ci.yml:18-20,48,114` |
| L-06 | 业务码 1001~1006 走 HTTP 200，REST 语义偏差 | `GlobalExceptionHandler.java:125-135` |
| L-07 | 覆盖率阈值按实测下调、大包无独立门槛、报告产物未归档 | `pom.xml:154-203`、`ci.yml:27-34` |
| L-08 | 文档统计漂移（18 spec/131 用例 vs 实测 23/139） | `README.md:462-467` |

---

## 四、风险评估

### 风险矩阵

| 风险链 | 组合项 | 可能性 | 影响 | 综合 |
|---|---|---|---|---|
| 匿名获取凭据 → 接管管理员 → 全库可读可改可清 | S-01 + S-02 + S-03 + M-06 + M-07 | 高 | 致命 | **极高** |
| 普通账号 → 按 id 越权/清空集合 → 抹除审计 | S-04 + S-05 + S-07 | 高 | 高 | **极高** |
| 普通账号 → 直接改单据状态 → 无审批出入库 → 账实不符 | S-06 + S-09 + M-08 | 中高 | 高 | **高** |
| 上线变更 → 契约/列漂移或误跑建表脚本 → 业务数据丢失 | S-10 + M-01 + M-04 | 中 | 致命 | **高** |
| 并发/故障 → 无日志无指标无告警、无备份回滚 | S-09 + M-10 + M-04 | 中 | 高 | **中高** |

### 现有防护基线（应保留）

Spring Security + BCrypt + 统一异常信封 + 参数化 SQL 与标识符白名单 + 服务端审批状态机与审批人点名复核 + `list/page` 行级过滤 + 契约字段白名单 + 三层测试与 jacoco 门禁 + 缺陷回灌台账（`docs/qa/escaped-defects.md`）。问题集中在**通用 CRUD 旁路、默认放行策略、凭据治理、运维保障**四处，而非全盘失守。

### 残余风险与假设

- 结论基于静态证据；未做动态验证（按约定不跑自动化浏览器测试）。S-06 的可利用性由「`status` 为契约可写列 + `settleOn=DONE` + 守卫只覆盖固资/盘点集合」三点代码链推断，建议在点测环境用一条 `PUT` 复核。
- 私钥入库经 `git ls-files` 确认；`deploy/.secrets/` 已被 `.gitignore` 排除，但文档/脚本中仍有明文口令。
- 生产库含真实组织数据（`docs/e2e/real-org-verification.md`、`docs/e2e/runbook.md:183-184` 记录 138 账号/71 资产），故上述安全问题按「已上线」而非「演示环境」定级。

---

## 五、改进优先级建议

### P0 — 上线前必须（建议 1~2 周内完成）

| 动作 | 对应问题 | 验收标准 |
|---|---|---|
| 移除登录页账号/口令展示；全量重置口令并强制首登改密；轮换 DB/JWT/管理员口令，私钥移出仓库并吊销重签 | S-01、S-02、M-07 | 生产 `dist` 全文无口令字面量；`git ls-files` 不含 `.key`；旧口令登录失败 |
| `logout` 落 token 黑名单或引入 `tokenVersion`/短时 access + refresh；有效期收敛至 ≤30 分钟 | S-03 | 登出后旧 token 调任意接口返回 401 |
| `detail/update/delete/batch/clear` 统一走范围校验（与 `list/page` 同一断言）；权限策略改 fail-closed（未登记即 403，启动期校验并拒绝启动）；`DELETE /all` 限管理员 | S-04、S-05、M-17 | 用 `wangqiang`/`zhoujing` 直调他人 id 的 GET/PUT/DELETE 全 403；`DELETE /all/{报表集合}` 403 |
| `status` 改为服务端只读，仅审批端点可写；对所有带 `stock` 的集合补状态迁移白名单 | S-06 | `PUT` 携带 `status` 返回 400/忽略；低值领用必须走完审批才扣库存 |
| 审计表改 append-only（后端拒绝写删）+ 把登录/审批/导入/折旧/重置纳入切面，补 IP/UA/traceId | S-07、M-10 | 持 `sys:log` 账号删日志 403；一次完整审批链可在日志中还原 |
| 80 强制 301 到 443，补 HSTS/CSP/X-Frame-Options/X-Content-Type-Options/cipher/client_max_body_size | S-08、M-05 | `http://host/` 跳转 HTTPS 且响应头齐全 |
| 引入 Flyway/Liquibase，初始化脚本与迁移脚本物理隔离并移除生产路径的 `DROP`；发布前自动备份 + 恢复演练 | S-10、M-04 | 空库/升级库各跑一次；有备份文件与恢复记录 |

### P1 — 1 个月内

- `UPDATE ... WHERE version = ?` + affected-rows 检查；库存改 `WHERE stock >= qty` 条件更新；补唯一索引与外键（保留「不带 version 放行」语义）。**S-09**
- 建补偿任务表/对账报表，覆盖盘点派生单据与审计写入失败（**不推翻独立事务决策**）。**M-08**
- CI/单测改用 MySQL 容器（Testcontainers），消除 H2 掩盖缺陷；补无 token/篡改 token/越权负向用例。**M-01、M-16**
- `build-prod.ps1` 前端测试失败即 `exit 1`；CI 补 `npm ci`、`npm audit`、lint、OWASP dependency-check；E2E 默认切隔离栈，直跑生产库需显式开关 + 强制备份校验（**不推翻人工清库口径**）。**M-02、M-03、M-11**
- 上传补 `MultipartFile` 大小/魔数/行数限制、流式解析；登录补 IP 限流与 captcha。**M-05、M-06**
- 补 logback（滚动+容量）、MDC traceId、actuator + Prometheus 指标、前端错误上报、nginx 访问日志与告警。**M-10**

### P2 — 1 季度

- 拆分 `ApprovalService`/`GenericService` 与 3021 行组件；引入 TypeScript + ESLint + Vitest，替换自研 loader；抽公共 CSV 导出/权限真源，用生成物校验收口。**M-13~M-15、L-01、L-02**
- 通用导入补整体事务；前后端校验统一到服务端契约类型校验；错误码改用标准 HTTP 状态。**M-09、M-16、L-06**
- 缓存/会话状态外置到 Redis，补接口限流与连接池显式配置，为水平扩展做准备。**M-12、L-08**

### P3 — 规划

容器化与编排、蓝绿/灰度发布、版本化契约与 API 文档、清除兼容 hack（含 remark 反解 planId）、APM/链路追踪、覆盖率按包设门槛、文档统计自动化。**L-03~L-07**

---

## 附录：核验方法与关键实测数据

| 核验项 | 方法 | 结果 |
|---|---|---|
| 源码/测试规模 | 递归统计 `*.java` / `*.js` / `*.vue` / `*.spec.ts` | main 69、test 17、前端 76、E2E spec 23 |
| 契约与权限覆盖 | 解析 `contract/resources.json` + `permission-resources.json`，模拟「精确优先 + 最长前缀」匹配 | 68 集合 / 36 规则；`fixed-asset-report-depreciation-details`、`fixed-asset-report-depreciation-plan-details` 无写/删规则 |
| 状态机可利用性 | 解析 `low-value-requisition` 契约 | `stock.settleOn=DONE`、`status` 为可写 enum，且不在 `assertDocMutable` 守卫集合内 |
| 生产凭据是否外泄 | 全文检索 + `git ls-files` | `dist/assets/Login-y7d4cQ-u.js` 含 `Fzidt@123`；`deploy/certs/localhost.key` 已被 git 跟踪 |
| 数据范围覆盖面 | 检索 `scopedRaw(` 调用点 | 仅 `list`（:109）与 `page`（:132），其余端点无 |
| 环境差异实证 | 对照缺陷台账与部署手册 | `test-plan-p1-p5.md:372`、`deployment.md:242` 记录契约/列漂移导致生产 500 |

> 本文件为静态审查报告，整改后请更新「问题清单」状态并补一轮点测复核；缺陷登记与用例回灌仍按 `docs/qa/escaped-defects.md` 的既有流程执行。
