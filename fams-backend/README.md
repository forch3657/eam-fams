# fams-backend（服务端）

固定资产 + 低值资产管理系统后端，内网仓库：
`https://git.ds.fidt/im/third-party/EamFamsSv.git`
（前端仓：`https://git.ds.fidt/im/third-party/EamFamsWeb.git`）

## 技术栈

| 项 | 版本 / 说明 |
|---|---|
| JDK | 1.8 |
| Spring Boot | 2.7.18（Spring Security + JWT） |
| 构建 | Maven 3.8；本仓**不含** Maven Wrapper，需本机安装 `mvn` |
| 持久层 | MyBatis-Plus 3.5.3.2；MySQL 8（dev / prod）、H2 内存库（h2，本地联调） |
| 其它 | jjwt 0.11.5、Apache POI 5.2.5（数据导入）、Lombok、JaCoCo |

## 目录约定（重要）

两个仓库需克隆到同一父目录，且目录名保持旧名：

```text
workspace/
├── fams-backend/    # git clone https://git.ds.fidt/im/third-party/EamFamsSv.git fams-backend
└── fams-frontend/   # git clone https://git.ds.fidt/im/third-party/EamFamsWeb.git fams-frontend
```

前端 `npm run export:contract` 会写入 `../fams-backend/src/main/resources/contract`；
一键构建 / 部署脚本也按这两个目录名定位。若改名，需同步修改脚本。

## 启动

```bash
mvn spring-boot:run                                  # 默认 h2 profile：自动建表 + 灌演示数据，重启即重置
mvn spring-boot:run -Dspring-boot.run.profiles=dev  # MySQL profile：须先建库（见下）
```

服务 `http://localhost:8080`，接口统一前缀 `/api`（登录 `/api/auth/login`）。

## 数据库初始化

`dev` / `prod` 的 `spring.sql.init.mode=never`，后端**不会自动建表**。首次部署须按顺序执行
`deploy-kit/deploy/sql/mysql/schema.sql`（建表）→ `baseline-data.sql`（根公司 / 部门 / 管理员 / 角色 / 数据字典，不可省略）。
`sql/` 为开发期迁移脚本，`src/main/resources/db/` 为 H2 用的 schema + seed。

## 部署包（deploy-kit）

生产部署所需的脚本、建库 SQL、nginx 配置与部署手册都在本仓 `deploy-kit/` 目录，
把内容复制到工作区根目录后即可使用（详见 `deploy-kit/README.md`）：

```powershell
cd workspace
robocopy .\fams-backend\deploy-kit . /E
```

`deploy-kit` 是「工作区根目录」的镜像，内含 `build-prod.ps1`、`start-prod.ps1` / `.bat`、
`stop-prod.ps1` / `.bat`、`deploy/sql/mysql/`、`deploy/nginx/conf/`、`docs/deployment.md`。
nginx 二进制、自签证书私钥、JWT 密钥与 MySQL 管理员口令**未入库**，需自备（详见该目录 README）。

> E2E 测试与 CI 配置不属于部署必需，未随本次交接推送。

## 配置与凭据

- `application.yml` 默认激活 `h2`；`application-h2.yml` / `-dev.yml` / `-prod.yml` 为各环境配置。
- `dev` / `prod` 中 `DB_URL` / `DB_USER` / `DB_PASSWORD` 是本机演示默认值，正式部署请用环境变量覆盖。
- `prod` 的 `jwt-secret: ${JWT_SECRET}` 必须用环境变量注入强密钥（HS256 要求 ≥ 32 字符）。
- 应用登录初始口令、数据库管理员口令、内网账号口令**不写入仓库**，向项目管理员索取。

## 构建 / 测试

```bash
mvn test           # 接口/集成测试（H2）+ JaCoCo 覆盖率门禁（整体 ≥75%、security ≥70%、engine ≥78%）
mvn clean package  # 产物 target/fams-backend-1.0.0-SNAPSHOT.jar
```

禁止 `mvn package -DskipTests`：历史上正是它掩盖了口令加密相关测试的红灯。

## 契约单一真源

`src/main/resources/contract/*.json` 由前端 `npm run export:contract` 生成
（来源：`fams-frontend/src/services/contract/schema.js`、`constants/enums.js`、`config/permissions.js`），
**禁止手改**。前端 schema / 枚举 / 权限树变更后需重新导出，并同时提交前后端两个仓库。

## 后续升级计划

摘自项目《后续升级计划 20261112》：

1. 实现多公司管理
2. 对接人员的组织架构调整，接口对接工作联系陈国；人员组织架构信息予以保留，对接角色的权限需重新梳理与调整（后续待接口阶段，本期不实施）
3. 对接流程引擎（提供流程给杜娟配置）— 接口对接：术欢
4. 对接 PC 端，迁入柳讯
5. 完善移动端，迁入柳讯移动端
6. 柳讯移动端完善扫码盘点与查询功能
7. 调研 UHF RFID 标签打印机与手持设备，升级 RFID 扫码盘点功能
