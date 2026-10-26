---
name: fams-backend-phased-plan
overview: 基于 API_CONTRACT.md 的 Spring Boot 后端分期开发方案：MySQL 8 + MyBatis-Plus + 元数据驱动通用 CRUD，共 7 期，每期自带可独立运行的测试（H2 内存库）与验收口径。
todos:
  - id: p0-scaffold
    content: 搭建 Spring Boot 2.7.18 骨架，实现统一信封、错误码、全局异常与 CORS
    status: completed
  - id: p1-auth
    content: 实现 Spring Security+JWT 认证、密码策略、5 次失败锁定与 36 个权限码
    status: completed
    dependencies:
      - p0-scaffold
  - id: p2-engine
    content: 实现元数据驱动通用 CRUD 引擎（8 端点）并落地组织架构四集合
    status: completed
    dependencies:
      - p1-auth
  - id: p3-fixed-asset
    content: 实现固定资产台账、8 类业务单据与审批轨迹及删除保护
    status: completed
    dependencies:
      - p2-engine
  - id: p4-low-value
    content: 实现低值资产台账与单据，含库存三段结算、退库限额与快照保护
    status: completed
    dependencies:
      - p2-engine
  - id: p5-inventory-depreciation
    content: 实现盘点计划单据与四种折旧方法的折旧方案、报表与明细
    status: completed
    dependencies:
      - p3-fixed-asset
  - id: p6-system
    content: 实现字典动态端点、系统参数、流程配置、终端、消息中心与操作日志
    status: completed
    dependencies:
      - p1-auth
  - id: p7-delivery
    content: 完成联调加固、SQL 脚本与 PDMan 文档、演示数据导出及验收清单核对
    status: completed
    dependencies:
      - p3-fixed-asset
      - p4-low-value
      - p5-inventory-depreciation
      - p6-system
---

## 用户需求

基于 `fams-frontend/docs/API_CONTRACT.md` 从零开发后端（`fams-backend/` 目录当前为空），要求产出**可分阶段开发、每阶段可独立测试**的规划。

## 产品概述

资产管理系统（固定资产 + 低值耗材）的后端服务：按契约提供 31 个集合的通用 CRUD、认证鉴权（RBAC）、业务规则校验（唯一性/外键/删除保护/库存联动/退库限额/乐观锁），使前端仅改 `.env` 即可从 mock 切到真实接口，业务代码零改动。

## 核心功能

- **统一契约内核**：所有接口返回 `{ code, message, data }`；时间 ISO 8601；枚举只返回编码；金额为数值；主键由服务端生成
- **通用 CRUD 引擎（元数据驱动）**：一份集合元数据 + 一套通用 Controller/Service，自动为每个集合提供 8 个端点（`/{key}`、`/{key}/page`、`/{key}/{id}`、POST/PUT/DELETE、`PUT /{key}/batch`、`DELETE /{key}/all`）；支持 keyword 模糊匹配、字段精确过滤（多值 = IN）、`sortBy/sortOrder`、`page/pageSize`
- **认证与授权**：Spring Security + JWT；`/auth/login`、`/auth/logout`、`/auth/profile`；`profile` 必须含 `roleIds`（缺失会导致前端菜单全部不可见）
- **业务规则引擎**：唯一性 409、外键 1005、各类删除保护 1002/1003、库存不足 1001、退库超限 1006、乐观锁冲突 409（带版本文案）、字典类型删除级联
- **库存三段结算**：DRAFT 不动 / PROCESSING 领用单预占 reserved / DONE 结算 stock / REJECTED·REVOKED 释放预占 / 删除按状态反向回退，且 `checkProtect` 必须在回退之前执行
- **支撑模块**：盘点、折旧（4 种方法）、报表、系统参数、流程配置、盘点终端、站内消息、操作日志
- **交付合规**：`sql` 目录建表脚本 + PDMan 设计文件；生产禁用 API 文档；移除或限制 Actuator

## 约束（已与用户确认）

- 持久层：MySQL 8 + MyBatis-Plus（Spring Boot 2.7.18，JDK8 兼容）
- CRUD 策略：元数据驱动通用 CRUD，业务规则以钩子按集合注入
- 阶段测试库：H2 内存库（MySQL 模式），零外部依赖
- 初始数据：把前端 mock 演示数据导出成 SQL，联调时与 mock 模式数字完全对齐

## 技术栈

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 框架 | Spring Boot 2.7.18 | 最后一个完整支持 JDK8 的版本线，满足部门规范 |
| 语言 / 构建 | JDK 8 + Maven 3.8 | 部门规范强制 |
| 安全 | Spring Security + JWT（jjwt 0.11.5，Java8 可用） | 部门规范强制 |
| 持久层 | MyBatis-Plus 3.5.x + MySQL 8.0（mysql-connector-j 8.0.33） | 用户选定 |
| 测试库 | H2 2.1.214（`MODE=MySQL`） | 用户选定，零外部依赖，`@SpringBootTest` 直接跑 |
| 测试 | JUnit5 + MockMvc + AssertJ | 阶段内可独立运行 |
| 校验 | spring-boot-starter-validation（javax）+ Jackson | 422 需返回字段级 `details` |
| 规范 | 阿里巴巴 Java 开发手册（P3C 插件） | 部门规范强制 |
| 接口文档 | Knife4j（**仅 dev/test profile 装配**） | 规范要求生产禁用 |


## 实现思路

**核心判断：契约高度同构（31 个集合 × 8 个端点，参数语义完全一致），不应手写 31 套 Controller/Service。**

采用「**元数据注册 + 通用引擎 + 钩子注入**」三层结构：

```mermaid
mermaid
flowchart TB
    A["HTTP /api/{key}/..."] --> B["ResourceRegistry<br/>key -> ResourceMeta 白名单"]
    B --> C["GenericController<br/>8 个通用端点"]
    C --> D["GenericService<br/>查询装配/分页/审计/乐观锁"]
    D --> E["RuleEngine<br/>唯一性/外键/删除保护/校验"]
    D --> F["ResourceHook SPI<br/>按集合注入业务规则"]
    E --> G["GenericMapper.xml<br/>动态 SQL（标识符仅取自元数据）"]
    F --> G
    G --> H[("MySQL 8")]
```

- **元数据**：`ResourceMeta { key, table, pkField, idGenerated, audit, uniqueFields, refFields, keywordFields, enumFields, arrayFields, hookBean }`
- **行模型用 `Map<String,Object>`**，数组字段用 JSON 列（MySQL 8 `json`），避免 31 个实体类与嵌套数组的冗余映射；这也与契约"字段表由 schema 导出、可能演进"的现实相符
- **业务规则用钩子挂**：`beforeCreate / beforeUpdate / checkDelete / afterDelete / afterSettle`，契约第 5 节的每条规则对应一个钩子实现，按集合注册
- **标识符安全**：SQL 里 `${table}`/`${column}` 只能取自元数据白名单，绝不使用请求参数原文；值一律 `#{}` 占位

**关于 MyBatis-Plus 的定位（需要说清的取舍）**：MP 的 `BaseMapper<T>` 是实体驱动，无法直接套在"运行时才知道表名"的通用集合上。因此：**MP 负责工程基建**（分页插件 `PaginationInnerInterceptor`、乐观锁 `OptimisticLockerInnerInterceptor` 的配套约定、代码规范），**通用 CRUD 走一个白名单动态 SQL 的 Mapper**。这样既保留用户选定的 MP 技术栈与分页能力，又不牺牲元数据驱动的初衷。

## 分期方案（每期自带独立测试）

| 期 | 内容 | 该期独立验收口径 |
| --- | --- | --- |
| **P0 骨架** | 工程结构、统一信封、错误码枚举、全局异常处理、CORS、健康检查 | 启动即通：`/api/health` 返回信封；任意异常映射为规范 `code`；5174 预检通过 |
| **P1 认证鉴权** | Security+JWT、BCrypt、登录失败锁定、密码策略、权限码模型 | 登录成功/失败提示一致/5 次锁 30 分钟（Clock 注入做时间旅行）/弱密码拒绝/无 token 与篡改 token 401 |
| **P2 通用引擎 + 组织架构** | 8 端点引擎、查询装配、审计、乐观锁、校验；`org-*` 四集合落地 | 引擎参数组合单测 + 四集合集成测试 + 删除保护（有子部门/有用户）+ 版本冲突 409 |
| **P3 固定资产** | 台账、8 类单据、审批轨迹 | 建单→审批→轨迹齐全；删被引用资产 1003；PUT 全量替换（缺字段被清空） |
| **P4 低值资产** | 台账、入库/领用/退库、库存三段结算 | 状态机全路径；边界（正好够/差 1/超退 1006）；并发领用不超卖；返回 `stock/reserved` |
| **P5 盘点与折旧** | 盘点计划/单据、折旧方案/报表/明细、折旧计算 | 4 种折旧法固定数值案例断言（含最后一年尾差） |
| **P6 系统管理** | 字典动态端点、参数、流程、终端、消息、日志 AOP | 动态路由（`system-dict-types-*`）可用；级联删除无孤儿；操作日志落库 |
| **P7 联调交付** | CORS/文档禁用/Actuator 处理、SQL 脚本、PDMan、演示数据、验收清单 | 前端 `.env` 切后端，逐页与 mock 数字一致 |


**每期可独立测试的保证**：P0-P1 只依赖 2 张表（`org_users`/`org_roles` + 登录尝试表）；P2 起每期只新增自身集合的表与钩子，引擎不变；任何一期跑测试都不需要后续期的代码。

## 关键实现要点（防回归）

**容易踩坑、必须按契约实现的点：**

1. **PUT = 全量替换**，不是 merge：body 缺失字段要写空；`{id}` 以路径段为准，忽略 body 内 id
2. **乐观锁**：body 带 `version` 才比对（不带则放行）；冲突返回 **409**，文案含「当前版本 N，你基于版本 M」；`PUT /batch` 逐行比对
3. **删除顺序**：`checkProtect` 必须在库存回退**之前** —— 否则出现「报 1003 但库存已回退」的脏数据
4. **低值快照五字段**（`itemName/categoryName/spec/unit/price`）**禁止**按 `itemId` 实时关联取值
5. **位置按 name 引用**（非 id），删除保护按 name 比对
6. **`fixed-asset-doc-lists` 是前缀不是集合**：8 个 biz 各一个集合，**不要建 `fixed-asset-doc-lists` 表**
7. **`fixed-asset-doc-approvals` 必须实现**：它不在 31 个集合表里，但前端工作台待办/审批时效完全依赖它
8. **主键字段名不统一**：多数 `id`，但 locations/location-options/dict-types/terminal-devices 为 `code`，depreciation-rules 为 `name`，terminal-abnormal 为 `recordNo`，notify-templates 为 `key` → 元数据必须声明 `pkField`，`PUT/DELETE/{id}` 按声明走，不要硬编码 `id`
9. **枚举校验白名单 = 内置枚举 ∪ 启用中的字典项**：字典允许新增编码，白名单要能动态扩展，不得写死
10. **`profile` 缺 `roleIds` = 灾难**：前端所有菜单消失，P1 必须有断言覆盖

**性能要点：**

- 动态 SQL 只按元数据字段白名单装配，`keyword` 仅在契约声明的 `keywordFields` 上做 `LIKE`，禁止全字段扫描
- 分页走 MP 分页插件（count + limit）；`GET /{key}` 无分页场景需限制返回上限，避免 31 集合全表拖垮
- 删除保护校验走 `SELECT COUNT(1) ... LIMIT 1` 存在性判断，不做全量加载
- 库存变更（stock/reserved）必须单行 `UPDATE ... WHERE id = ? AND version = ?` 带条件更新或用行锁，防并发超卖

**日志与安全：**

- 操作日志用 AOP 统一落 `operation-logs`，不散落各处
- 登录失败**不记录**是哪个环节错的（用户名不存在 / 密码错），统一提示「用户名或密码错误」
- 日志禁止输出密码、token 原文
- 生产 profile：Knife4j 不装配、Actuator 移除或仅内网 + 鉴权访问

## 目录结构

```
fams-backend/
├── pom.xml                          # [NEW] SB 2.7.18 / JDK8 / MP / JWT / H2(test)
├── sql/                             # [NEW] 建表脚本（部门规范要求的项目内 sql 目录）
│   ├── 01-schema/                   # 按阶段分文件：org / fixed-asset / low-value / inventory / system
│   ├── 02-seed/                     # 基线数据：管理员、32 枚举对应字典、角色权限
│   └── 03-demo/                     # 演示数据（由前端 mock 导出，与 mock 模式数字对齐）
├── docs/
│   └── pdman/                       # [NEW] 数据库设计文件 + 表结构说明
└── src/
├── main/java/com/.../fams/
│   ├── FamsApplication.java     # [NEW]
│   ├── common/
│   │   ├── R.java               # [NEW] 统一信封 { code, message, data }
│   │   ├── ErrorCode.java       # [NEW] 0/400/401/403/404/409/422/500/1001-1006
│   │   ├── ApiException.java    # [NEW] 业务异常（携带 code/details）
│   │   └── GlobalExceptionHandler.java  # [NEW] 全局兜底，统一输出信封
│   ├── config/
│   │   ├── SecurityConfig.java  # [NEW] Security + JWT 过滤器链，RBAC
│   │   ├── CorsConfig.java      # [NEW] 允许 http://localhost:5174
│   │   ├── MybatisPlusConfig.java  # [NEW] 分页插件
│ │   └── JacksonConfig.java     # [NEW] ISO 8601 时间序列化
│   ├── security/
│   │   ├── JwtProvider.java     # [NEW] 签发/校验
│   │   ├── JwtAuthFilter.java   # [NEW] Bearer 解析
│   │   └── LoginAttemptService.java  # [NEW] 失败 5 次锁 30 分钟
│   ├── contract/                # [NEW] 元数据内核
│   │   ├── ResourceMeta.java    # key/table/pkField/unique/ref/keyword/enum/array/hook
│   │   ├── ResourceRegistry.java  # 白名单注册与查找（含 doc-lists-{biz} 前缀解析）
│   │   └── ResourceDefinitionLoader.java  # 从 schema.js 等价定义加载 31 集合
│   ├── engine/                  # [NEW] 通用 CRUD 引擎
│   │   ├── GenericController.java   # 8 个端点
│   │   ├── GenericService.java      # Upsert/分页/审计/乐观锁
│   │   ├── QueryAssembler.java      # keyword/IN/sort/page → 动态条件
│   │   └── GenericMapper.java + GenericMapper.xml  # 白名单动态 SQL
│   ├── rule/                    # [NEW] 契约第 5 节规则
│   │   ├── RuleEngine.java
│   │   ├── UniqueRule.java / RefRule.java / EnumRule.java / RequiredRule.java
│   │   └── DeleteProtection.java    # 各类删除保护（含按 name 匹配位置）
│   ├── hook/                    # [NEW] 按集合注入的业务钩子
│   │   ├── ResourceHook.java    # SPI 接口
│   │   ├── AssetDeleteHook.java      # 资产删除保护（8 类单据）
│   │   ├── LowValueStockHook.java    # 库存三段结算 + 回退顺序
│   │   ├── ReturnLimitHook.java      # 退库限额 1006
│   │   ├── SnapshotHook.java         # 快照不可覆盖
│   │   └── DictCascadeHook.java      # 字典类型级联删除
│   └── module/                  # [NEW] 各期业务模块（org/fixedasset/lowvalue/...）
└── test/java/...                # [NEW] 按阶段分包，每期可单独运行
├── p1auth/  ├── p2engine/  ├── p3asset/
├── p4lowvalue/  ├── p5inventory/  └── p6system/