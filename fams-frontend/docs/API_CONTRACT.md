# 资产管理系统 接口契约（API Contract）

> 本文件**完整覆盖**前后端协作所需的全部约定：31 个集合的字段定义、端点与响应信封、错误码、
> 业务规则（删除保护 / 库存联动 / 退库限额）、乐观锁、认证方式、32 个枚举、36 个权限码、验收清单。
>
> 前端 `src/services/contract/schema.js` 是本契约的**机器可读副本**（同一份定义，供 mock 引擎与
> 契约校验运行时使用）。第 4 节的字段表由该文件直接导出生成，两者不会脱节。
>
> 后端按本契约提供接口后，前端仅需修改 `.env` 即可切换，业务代码零改动。

---

## 1. 总则

| 项 | 约定 |
| --- | --- |
| 根路径 | `VITE_API_BASE_URL`，例如 `http://localhost:8080/api` |
| 认证 | `Authorization: Bearer <token>`（token 存于 sessionStorage） |
| 编码 | UTF-8，`Content-Type: application/json` |
| 时间 | **ISO 8601**（如 `2026-09-18T10:22:31` 或带时区 `...Z`），禁止使用 `2026-09-18 10:22:31` 这类空格分隔格式 |
| 金额 | 数值类型（不做字符串化），前端负责千分位格式化 |
| 枚举 | **只传编码**（如 `IDLE`），文案由前端 `labelOf()` 映射；枚举表见第 7 节 |
| 外键 | 一律存**主键 id**（如 `companyId`），不存名称快照 |

### 1.1 统一响应信封

```json
{ "code": 0, "message": "ok", "data": <任意> }
```

- `code = 0` 表示成功；非 0 表示失败，前端直接抛 `ApiError(code, message)`。
- `data` 为业务数据（对象 / 数组 / 布尔 / 分页对象）。

### 1.2 列表与分页

| 场景 | 请求 | `data` 结构 |
| --- | --- | --- |
| 列表（不过滤分页） | `GET /{key}` | `Row[]` |
| 分页列表 | `GET /{key}/page` | `{ rows: Row[], total: number, page: number, pageSize: number }` |

分页/排序/过滤参数（query string）：

| 参数 | 说明 |
| --- | --- |
| `keyword` | 关键字，服务端在契约声明的 `query.keyword` 字段内做包含匹配 |
| `<字段名>` | 精确过滤；同名参数多次出现表示 IN 查询 |
| `sortBy` / `sortOrder` | 排序字段与方向（`asc` / `desc`，默认 `desc`） |
| `page` / `pageSize` | 第几页（从 1 开始）/ 每页条数 |

### 1.3 通用端点

| 方法 | 路径 | 说明 | `data` |
| --- | --- | --- | --- |
| GET | `/{key}` | 列表查询 | `Row[]` |
| GET | `/{key}/page` | 分页查询 | `{ rows, total, page, pageSize }` |
| GET | `/{key}/{id}` | 详情 | `Row` |
| POST | `/{key}` | 新增（body 为实体，不含 id） | `Row`（含服务端生成的 id） |
| PUT | `/{key}/{id}` | 更新（**body 为整行**，见下） | `Row` |
| DELETE | `/{key}/{id}` | 删除 | `true` |
| PUT | `/{key}/batch` | 批量保存（body 为 `Row[]`，按主键 upsert） | `Row[]` |
| DELETE | `/{key}/all` | 清空集合 | `true` |

> `id` 由**服务端生成**，前端不再自行拼装。删除失败时按第 2 节错误码返回，前端直接提示 `message`。

#### PUT 语义：**全量替换**，不是稀疏 merge

前端调用 `update` 时传的是**整行对象**（不是补丁），请以**全量替换**实现：
body 里出现什么字段，库里就存什么字段；**body 里没有的字段应被清空**。
若按 merge 实现，前端在本地删掉的字段将永远清不掉（例如清空某行的 `remark`）。

PUT body 里可能自带 `id`，请**以路径段 `{id}` 为准**，忽略 body 内的 id。

#### 乐观锁 `version`（必须实现）

所有 `audit: true` 的集合都带 `version` 字段：

| 时机 | 服务端行为 |
| --- | --- |
| 新增 | `version = 1` |
| 更新 | `version += 1` |
| 更新时比对 | body 携带 `version` 时，与库里当前值比对；**不一致返回 409**，文案形如「数据已被他人修改（当前版本 N，你基于版本 M），请刷新后重试」 |
| body 未携带 `version` | 视为不参与并发控制，**放行**（兼容只改部分字段的调用） |

`PUT /{key}/batch` 同样按此规则逐行比对。

#### 审计字段（服务端维护）

`createTime` / `createBy` / `updateTime` / `updateBy` / `version` 由服务端写入，前端不传也接受（传了以服务端为准）。
时间一律 **ISO 8601**（`2026-09-18T10:22:31.000Z`），不接受 `2026-09-18 10:22:31` 空格格式。

注意部分集合存在同名业务字段（如低值入库单的 `settleTime`），请勿与 `updateTime` 混淆。

#### 认证端点

| 方法 | 路径 | body / 说明 | `data` |
| --- | --- | --- | --- |
| POST | `/auth/login` | `{ username, password }` | `{ token, user }` |
| POST | `/auth/logout` | — | `true` |
| GET | `/auth/profile` | 用 token 换当前用户 | `user` |

- 前端把 `token` 存 `sessionStorage`，每次请求带 `Authorization: Bearer {token}`。
- 任何接口返回 **401**，前端会清空本地会话并跳登录页（已实现，见 `src/router/index.js`）。
- `user` 至少包含：`id` / `username` / `name` / `roleIds` / `companyId` / `deptId`；前端按 `roleIds` 从**本地缓存的角色权限**做按钮级鉴权，因此后端还需提供角色与权限的查询能力（见 `org-roles`）。
- mock 模式下登录不走网络，但仍签发 token，用于保证链路一致。

---

## 2. 错误码

| code | 含义 | 前端处理 |
| --- | --- | --- |
| 0 | 成功 | — |
| 400 | 请求参数有误 | 提示 message |
| 401 | 未登录 / 登录失效 | 跳转登录 |
| 403 | 无权限 | 提示 message |
| 404 | 数据不存在 | 提示 message |
| 409 | 数据冲突（唯一性） | 提示 message |
| 422 | 数据校验未通过，`details` 含字段级错误 | 提示 message |
| 500 | 服务异常 | 提示 message |
| 1001 | 库存不足 | 提示 message |
| 1002 | 存在下级数据，不能删除 | 提示 message |
| 1003 | 已被其他数据引用，不能删除 | 提示 message |
| 1004 | 数据重复 | 提示 message |
| 1005 | 关联数据不存在（外键校验失败） | 提示 message |
| 1006 | 数量超出可退范围 | 提示 message |

---

## 3. 集合清单

`{key}` 即上表中的路径片段。

| key | 中文名 | 主键 |
| --- | --- | --- |
| `fixed-assets` | 固定资产台账 | `id` |
| `fixed-asset-inventory-plans` | 盘点计划 | `id` |
| `fixed-asset-inventory-docs` | 盘点单据 | `id` |
| `fixed-asset-depreciation-schemes` | 折旧方案 | `id` |
| `fixed-asset-depreciation-reports` | 折旧报表 | `id` |
| `fixed-asset-doc-lists-{biz}` | 单据列表（biz: inbound/alloc/back/borrow/transfer/repair/change/dispose），固定资产五类单据统一走这套 | `id` |
| `fixed-asset-settings-locations` | 存放位置 | `code` |
| `fixed-asset-settings-location-options` | 位置候选项 | `code` |
| `fixed-asset-settings-categories` | 资产分类（树） | `id` |
| `fixed-asset-settings-depreciation-rules` | 折旧规则 | `name` |
| `fixed-asset-settings-depreciation-plans` | 折旧方案（设置） | `id` |
| `fixed-asset-report-depreciation-details` | 折旧明细 | `id` |
| `fixed-asset-report-depreciation-plan-details` | 折旧计划明细 | `id` |
| `low-value-items` | 低值资产台账 | `id` |
| `low-value-inbound` | 低值资产入库单 | `id` |
| `low-value-requisition` | 低值资产领用单 | `id` |
| `low-value-return` | 低值资产退库单 | `id` |
| `low-value-settings-locations` | 低值资产存放位置 | `id` |
| `org-companies` | 公司 | `id` |
| `org-departments` | 部门 | `id` |
| `org-users` | 用户 | `id` |
| `org-roles` | 角色 | `id` |
| `system-dict-types` | 数据字典类型 | `code` |
| `system-dict-types-{code}-items` | 字典项 | `id` |
| `system-params` | 系统参数 | `id` |
| `system-workflow-flows` | 全局工作流程 | `id` |
| `system-terminal-devices` | 盘点终端 | `code` |
| `system-terminal-abnormal` | 盘点终端异常记录 | `recordNo` |
| `notify-messages` | 站内消息 | `id` |
| `notify-templates` | 消息模板 | `key` |
| `operation-logs` | 操作日志 | `id` |

---

## 4. 核心实体字段

> 类型：`string` / `number` / `boolean` / `date(ISO)` / `enum` / `array` / `ref(外键)`。
> 标记 `*` 为必填，`唯一` 表示需做唯一性校验。

### 4.1 `fixed-assets` 固定资产

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键，服务端生成 |
| `code` * | string | 资产编号，唯一 |
| `name` * | string | 资产名称 |
| `category` * | enum | 分类编码，见 `ASSET_CATEGORY` |
| `brand` / `model` | string | 品牌 / 型号 |
| `companyId` | ref | → `org-companies` |
| `deptId` | ref | → `org-departments` |
| `userId` | ref | → `org-users`（使用人） |
| `location` | string | 存放位置 |
| `purchaseDate` / `inboundDate` | date | 采购日期 / 入库日期 |
| `amount` / `original` / `net` | number | 金额 / 原值 / 净值 |
| `status` * | enum | 资产状态，见 `ASSET_STATUS` |
| `depreciate` | boolean | 是否计提折旧 |
| `purchaseMode` | enum | `PURCHASE_MODE` |
| `leaseMonths` | number | 租赁/折旧月数 |
| `createBy`/`createTime`/`updateBy`/`updateTime`/`version` | — | 审计字段，服务端维护 |

### 4.2 业务单据（inbound / dispatch / borrow / change / dispose）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键 |
| `code` * | string | 单据编号，唯一 |
| `assetId` * | ref | → `fixed-assets`（**不再冗余 assetNo / assetName**） |
| `deptId` / `userId` | ref | 关联部门 / 人员 |
| `status` * | enum | 见 `INBOUND_STATUS` / `DISPATCH_STATUS` / `BORROW_STATUS` / `DISPOSE_STATUS` |
| 业务字段 | — | `quantity`/`purchasePrice`/`supplier`/`inboundDate`、`dispatchDate`/`location`、`borrowDate`/`expectedReturnDate`/`actualReturnDate`、`changeType`/`changeReason`/`changeDate`、`disposeType`/`disposeReason`/`residualValue`/`disposeDate` |

### 4.3 `low-value-items` 低值物品

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` / `code` * | string | 主键 / 物品编码（唯一） |
| `category` * | enum | `LOW_VALUE_CATEGORY`（字典：低值资产类别，存编码） |
| `name` * | string | 物品名称 |
| `spec` / `unit` | string | 规格型号 / 单位 |
| `price` / `stock` / `safetyStock` | number | 单价 / 库存 / 安全库存 |
| `location` | string | 存放位置 |
| `status` * | enum | `LOW_VALUE_ITEM_STATUS` |

### 4.4 低值资产单据（inbound / requisition / return）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `docNo` * | string | 单据编号（唯一） |
| `itemId` * | ref | → `low-value-items` |
| `category` | enum | 类别编码（`LOW_VALUE_CATEGORY`） |
| `itemName`/`categoryName`/`spec`/`unit` | string | **办理当时快照**，后续改价改名不影响历史单据 |
| `quantity` * / `price` / `amount` | number | 数量 / 单价 / 金额 |
| `deptId` | ref | 领用/退库部门 |
| `receiver` / `returner` / `supplier` | string | 经办相关（文本快照） |
| `inboundDate` / `requisitionDate` / `returnDate` | date | 业务日期 |

### 4.5 组织架构（companies / departments / users / roles）

| 实体 | 关键字段 |
| --- | --- |
| `org-companies` | `code*`(唯一) `name*`(唯一) `shortName` `parentId`(自关联) `type` `creditCode` `legalPerson` `contact` `phone` `address` `status*`(ENABLE_STATUS) `sort` |
| `org-departments` | `code*`(唯一) `name*` `parentId`(自关联) `companyId*` `leader` `headcount` `phone` `status*` `sort` |
| `org-users` | `username*`(唯一) `name*` `companyId*` `deptId` `position` `roleIds[]` `phone` `email` `status*` `createdAt` `lastLoginAt` `passwordResetAt` |
| `org-roles` | `code*`(唯一) `name*`(唯一) `orgScope` `dataScope` `status*` `sort` `remark` `permissions[]` |

### 4.6 `fixed-asset-doc-approvals` 审批记录（审批轨迹）

> 一条记录 = 单据在某个环节上的一次动作。前端工作台的「我的待办 / 审批时效」完全依赖此表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `docKey` * | string | 单据集合标识（如 `low-value-requisition`） |
| `docId` * | string | 单据 id |
| `docCode` | string | 单据编号（冗余，便于检索） |
| `bizType` * | enum | `BUSINESS_TYPE` |
| `flowId` | ref | → `system-workflow-flows` |
| `flowCode` | string | 流程编码（冗余） |
| `stepKey` / `stepName` | string | 环节标识 / 环节名称 |
| `result` * | enum | `APPROVE_RESULT`：`SUBMIT`/`AGREE`/`REJECT`/`REVOKE` |
| `comment` | string | 审批意见（驳回时必填） |
| `approverId` | ref | → `org-users` |
| `approverName` / `approverRoleName` | string | 审批人 / 角色名（文本快照） |
| `time` | date | 动作时间（ISO 8601） |

### 4.7 `system-workflow-flows` 工作流程

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `code` * | string | 流程编码（唯一） |
| `name` * | string | 流程名称 |
| `bizType` * | enum | `BUSINESS_TYPE` |
| `initiator` | string | 发起人角色名（冗余） |
| `initiatorRoleId` | ref | → `org-roles` |
| `enabled` | boolean | 是否启用 |
| `steps` | array | 审批环节数组，**元素结构见下** |

`steps[]` 元素（审批引擎的核心输入，后端需单独建模）：

| 字段 | 说明 |
| --- | --- |
| `key` | 环节标识（与审批记录的 `stepKey` 对应） |
| `name` | 环节名称 |
| `approverRoleId` | 审批角色 id → `org-roles` |
| `approver` | 审批人（冗余展示） |
| `mode` | enum `APPROVE_MODE`：`ANY` 任一通过 / `SEQUENCE` 依次 / `ALL` 全部通过 |
| `conditionType` | enum `APPROVE_CONDITION`：`NONE` 无条件 / `AMOUNT_GT` 金额大于 / `HAS_DIFF` 存在差异 |
| `conditionValue` | 条件阈值（`AMOUNT_GT` 时为金额） |
| `condition` | 条件说明（冗余） |

### 4.8 其余集合字段定义

以下 21 个集合的字段表由 `src/services/contract/schema.js` 直接导出生成，涵盖 8 张固定资产业务单据、盘点计划/单据、折旧相关 4 张表、设置类 5 张表、以及字典项、系统参数、终端 2 张表、消息 2 张表与操作日志。

#### `fixed-asset-doc-lists-{biz}` 固定资产业务单据（8 张表共用同一结构）

`biz` 取值：`inbound` 入库 / `alloc` 派发 / `back` 退库 / `borrow` 借出 / `transfer` 调拨 / `repair` 维修 / `change` 变更 / `dispose` 处置。
八张表结构完全相同，差异体现在 `status` 所用的状态枚举上（见第 7 节）。

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `code` \* | string | **必填**、唯一 |
| `name` \* | string | **必填** |
| `companyId` | ref → `org-companies` | — |
| `assetId` | ref → `fixed-assets` | — |
| `creatorId` | ref → `org-users` | — |
| `createTime` | date（ISO 8601） | **业务字段**，与下方审计字段同名但含义不同 |
| `finishTime` | date（ISO 8601） | — |
| `remark` | string | — |
| `status` \* | enum `DOC_STATUS` | **必填** |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `system-dict-types-{code}-items` 字典项（每个字典类型一张表）

`{code}` 为字典类型编码（见 7.1）。`value` 即枚举编码，**不可修改**（改动等价于改契约）。

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `label` \* | string | **必填** |
| `value` \* | string | **必填** |
| `sort` | number | — |
| `status` \* | enum `ENABLE_STATUS` | **必填** |
| `remark` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-inventory-plans`　盘点计划

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `planNo` \* | string | **必填**、唯一 |
| `planName` \* | string | **必填** |
| `scope` | string | — |
| `counter` | string | — |
| `planDate` | date（ISO 8601） | — |
| `status` \* | enum `DOC_STATUS` | **必填** |
| `items` | array（元素结构见 4.9） | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-inventory-docs`　盘点单据

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `docNo` \* | string | **必填**、唯一 |
| `name` \* | string | **必填** |
| `companyId` | ref → `org-companies` | — |
| `applicant` | string | — |
| `creatorId` | ref → `org-users` | — |
| `scope` | string | — |
| `assetTypes` | array（元素结构见 4.9） | — |
| `createTime` | date（ISO 8601） | **业务字段**，与下方审计字段同名但含义不同 |
| `finishTime` | date（ISO 8601） | — |
| `remark` | string | — |
| `status` \* | enum `DOC_STATUS` | **必填** |
| `items` | array（元素结构见 4.9） | — |
| `counters` | array（元素结构见 4.9） | — |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-depreciation-schemes`　折旧方案

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `schemeNo` \* | string | **必填**、唯一 |
| `schemeName` \* | string | **必填** |
| `method` \* | enum `DEPRECIATION_METHOD` | **必填** |
| `years` | number | — |
| `residualRate` | number | — |
| `monthlyRate` | number | — |
| `applicableCategory` | string | — |
| `enabled` | boolean | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-depreciation-reports`　折旧报表

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `period` \* | string | **必填**、唯一 |
| `openingValue` | number | — |
| `periodDepreciation` | number | — |
| `accumulated` | number | — |
| `closingNet` | number | — |
| `assetCount` | number | — |
| `operator` | string | — |
| `runDate` | date（ISO 8601） | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-settings-locations`　存放位置

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `code` \* | string | **必填**、唯一、主键（服务端生成） |
| `name` \* | string | **必填** |
| `parentName` | string | — |
| `manager` | string | — |
| `assetCount` | number | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-settings-location-options`　位置候选项

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `code` \* | string | **必填**、唯一、主键（服务端生成） |
| `name` \* | string | **必填** |

#### `fixed-asset-settings-categories`　资产分类

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `code` \* | string | **必填**、唯一 |
| `name` \* | string | **必填** |
| `parentCode` | string | — |
| `parentName` | string | — |
| `depreciationMethod` | enum `DEPRECIATION_METHOD` | — |
| `usefulLife` | number | — |
| `assetCount` | number | — |
| `status` \* | enum `ENABLE_STATUS` | **必填** |
| `children` | array（元素结构见 4.9） | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-settings-depreciation-rules`　折旧规则

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `name` \* | string | **必填**、唯一、主键（服务端生成） |
| `method` \* | enum `DEPRECIATION_METHOD` | **必填** |
| `usefulLife` | number | — |
| `residualRate` | number | — |
| `description` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-settings-depreciation-plans`　折旧方案（设置）

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `companyId` | ref → `org-companies` | — |
| `name` \* | string | **必填**、唯一 |
| `method` | enum `DEPRECIATION_METHOD` | — |
| `assetTypes` | array（元素结构见 4.9） | — |
| `residualRate` | number | — |
| `calcTime` | enum `CALC_TIME` | — |
| `monthlyDay` | number | — |
| `purchaseMode` | enum `PURCHASE_MODE` | — |
| `remark` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-report-depreciation-details`　折旧明细

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `assetId` | ref → `fixed-assets` | — |
| `name` | string | — |
| `originalValue` | number | — |
| `depreciationMethod` | enum `DEPRECIATION_METHOD` | — |
| `usefulLife` | number | — |
| `accumulatedDepreciation` | number | — |
| `netValue` | number | — |
| `depreciationRate` | number | — |
| `purchaseDate` | date（ISO 8601） | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `fixed-asset-report-depreciation-plan-details`　折旧计划明细

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `planName` | string | — |
| `assetId` | ref → `fixed-assets` | — |
| `assetName` | string | — |
| `assetType` | enum `ASSET_CATEGORY` | — |
| `companyId` | ref → `org-companies` | — |
| `original` | number | — |
| `residualRate` | number | — |
| `totalLife` | number | — |
| `usedLife` | number | — |
| `depDate` | date（ISO 8601） | — |
| `finished` | boolean | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `low-value-settings-locations`　低值资产存放位置

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `code` \* | string | **必填**、唯一 |
| `name` \* | string | **必填** |
| `parentCode` | string | — |
| `parentName` | string | — |
| `manager` | string | — |
| `itemCount` | number | — |
| `status` \* | enum `ENABLE_STATUS` | **必填** |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `system-dict-types`　数据字典类型

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `code` \* | string | **必填**、唯一、主键（服务端生成） |
| `name` \* | string | **必填** |
| `count` | number | — |
| `status` \* | enum `ENABLE_STATUS` | **必填** |
| `remark` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `system-params`　系统参数

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `name` \* | string | **必填** |
| `key` \* | string | **必填**、唯一 |
| `value` | string | — |
| `type` | enum `PARAM_TYPE` | — |
| `remark` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `system-terminal-devices`　盘点终端

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `code` \* | string | **必填**、唯一、主键（服务端生成） |
| `name` \* | string | **必填** |
| `type` \* | enum `DEVICE_TYPE` | **必填** |
| `location` | string | — |
| `bindUserId` | ref → `org-users` | — |
| `status` \* | enum `DEVICE_STATUS` | **必填** |
| `lastActive` | date（ISO 8601） | — |
| `vendor` | string | — |
| `model` | string | — |
| `sn` | string | — |
| `ip` | string | — |
| `installDate` | date（ISO 8601） | — |
| `maintainer` | string | — |
| `maintainerPhone` | string | — |
| `remark` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `system-terminal-abnormal`　终端异常记录

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `recordNo` \* | string | **必填**、唯一、主键（服务端生成） |
| `deviceCode` \* | ref → `system-terminal-devices` | **必填** |
| `operatorId` | ref → `org-users` | — |
| `type` \* | enum `DEVICE_ABNORMAL_TYPE` | **必填** |
| `detail` | string | — |
| `affectedCount` | number | — |
| `handled` | boolean | — |
| `handleResult` | string | — |
| `createTime` | date（ISO 8601） | **业务字段**，与下方审计字段同名但含义不同 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `notify-messages`　站内消息

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `time` | date（ISO 8601） | — |
| `type` | string | — |
| `level` | string | — |
| `title` \* | string | **必填** |
| `content` | string | — |
| `target` | string | — |
| `channel` | string | — |
| `bizType` | string | — |
| `bizId` | string | — |
| `route` | string | — |
| `read` | boolean | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `notify-templates`　消息模板

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `key` \* | string | **必填**、唯一、主键（服务端生成） |
| `scene` | string | — |
| `channel` | string | — |
| `title` | string | — |
| `content` | string | — |
| `enabled` | boolean | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

#### `operation-logs`　操作日志

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 主键（服务端生成） |
| `time` | date（ISO 8601） | — |
| `module` | string | — |
| `action` | string | — |
| `target` | string | — |
| `result` | string | — |
| `detail` | string | — |
| `ip` | string | — |
| `operator` | string | — |
| `operatorOrg` | string | — |
| `createTime` / `updateTime` | date（ISO 8601） | 服务端维护 |
| `createBy` / `updateBy` | string | 服务端维护 |
| `version` | number | 乐观锁，服务端维护（见第 3 节） |

---

### 4.9 嵌套数组说明

以下字段在契约里声明为 `array`，但其**元素结构不在顶层字段表中**，后端需单独建模：

| 集合 | 字段 | 元素要点 |
| --- | --- | --- |
| `fixed-asset-inventory-plans` / `-docs` | `items[]` | `itemStatus` 取 `INVENTORY_ITEM_STATUS`（`UNCHECKED`/`CHECKED`/`LOSS`/`ABNORMAL`）；`result` 取 `INVENTORY_RESULT`（`UNCHECKED`/`MATCHED`/`SURPLUS`/`LOSS`）；另含资产快照 `assetNo`/`assetName`/`assetStatus` |
| `fixed-asset-inventory-plans` / `-docs` | `counters[]` | `status` 取 `INVENTORY_COUNTER_STATUS`（`COUNTING`/`DONE`） |
| `fixed-asset-settings-depreciation-plans` | `assetTypes[]` | `ASSET_CATEGORY` 编码数组 |
| `org-users` | `roleIds[]` | `org-roles` 主键数组 |
| `org-roles` | `permissions[]` | 权限码字符串数组（完整清单见 7.3） |
| `system-workflow-flows` | `steps[]` | 见 4.7 |

---

## 5. 业务规则（服务端必须实现）

| 规则 | 适用 | 错误码 |
| --- | --- | --- |
| 唯一性校验 | `code`/`name`/`username`/`key` 等契约声明的唯一字段 | 409 |
| 外键引用完整性 | 所有 `ref` 字段指向的记录必须存在 | 1005 |
| 资产删除保护 | 存在**任意一类**业务单据（8 类：入库/派发/退库/借出/调拨/维修/变更/处置）的资产不能删除 | 1003 |
| 公司删除保护 | 有子公司 / 部门 / 用户的公司不能删除 | 1002 / 1003 |
| 部门删除保护 | 有子部门或人员的部门不能删除 | 1002 / 1003 |
| 角色删除保护 | 已关联用户的角色不能删除 | 1003 |
| **用户删除保护** | 用户是资产使用人 / 单据创建人 / 审批人 / 已绑定终端时不能删除 | 1003 |
| 位置删除保护 | 仍被物品或资产引用的位置不能删除（**按 name 匹配**，见下方说明） | 1003 |
| 分类删除保护 | 有子分类的分类不能删除 | 1002 |
| 低值物品删除保护 | 仍有库存 / 仍有审批占用 / 已产生入库·领用·退库单据的物品不能删除 | 1003 |
| **终端删除保护** | 已产生异常记录的盘点终端不能删除 | 1003 |
| **流程删除保护** | 已产生审批记录的工作流程不能删除（且流程 code 唯一） | 1003 |
| **字典类型删除** | 必须**级联删除**其字典项集合 `system-dict-types-{code}-items`，否则产生孤儿数据 | — |
| **库存联动** | 入库 `stock += qty`；领用 `stock -= qty`（不足报 1001）；退库 `stock += qty` | 1001 |
| **退库限额** | 退库数量 ≤「已领未退」= 领用总量 − 退库总量 | 1006 |
| 单据删除回退库存 | 删除入库/领用/退库单据时，反向回退库存 | — |

> 前端 mock 引擎已按上述规则实现（`src/services/mock/rules.js`），签约后以服务端为准，前端不再重复校验。

#### 库存三段结算（状态驱动，服务端逻辑）

低值单据的 `status` 决定库存何时变动，三者必须严格一致：

| 状态 | 库存行为 |
| --- | --- |
| `DRAFT` 草稿 | **不动**库存 |
| `PROCESSING` 审批中 | 领用单**预占** `reserved += qty`（`stock` 不变，可用量 = `stock - reserved`）；入库/退库单不动作 |
| `DONE` 已完结 | 真正结算：`stock ± qty`，同时释放 `reserved` |
| `REJECTED` / `REVOKED` | 释放 `reserved`，不动 `stock` |
| 单据被删除 | 按删除时的状态**反向回退**（已结算的退回库存，审批中的释放预占） |

**顺序要求**：`checkProtect`（删除保护）必须在库存回退**之前**执行，否则会出现「报了 1003 但库存已回退」的脏数据。

> 前端「可用库存」=`stock - reserved` 是本地计算。若后端不返回这两个字段，前端可用量会算错。

#### 快照字段不可覆盖

低值单据（入库/领用/退库）带 `itemName` / `categoryName` / `spec` / `unit` / `price` 五个**快照字段**，
记录办理当时的物品信息。后端**不可按 `itemId` 实时关联取值**，否则物品改名/改价会污染历史单据。

#### 位置按 name 引用（非规范化设计）

`low-value-items.location` 与 `fixed-assets.location` 存的是**位置名称字符串**，不是位置 id。
删除位置时的保护规则因此是「按 name 比对」，后端需按此实现。

---

## 6. 前端切换方式

```bash
# .env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://your-backend/api
```

- `VITE_USE_MOCK=true` 或 `VITE_API_BASE_URL` 为空 → 使用内置 mock（离线演示）。
- 两者都配置正确 → 走真实接口，**业务代码无需任何修改**。
- mock 模式可选环境变量：`VITE_MOCK_LATENCY`（模拟网络延迟 ms）、`VITE_MOCK_ERROR_RATE`（随机故障概率 0~1），用于演练 loading 与错误分支。

> 开发服务器端口为 **5174**（见 `vite.config.js`），且未配置 proxy，
> 联调期请由后端开启 CORS 允许该来源。

---

## 7. 枚举编码表

| 枚举 | 编码 → 文案 |
| --- | --- |
| `ASSET_STATUS` | IDLE 空闲 / IN_USE 使用中 / DISPATCHING 派发中 / BORROWED 借出中 / REPAIRING 维修中 / DISPOSING 处置中 |
| `ASSET_CATEGORY` | ELECTRONIC 电子设备 / MACHINE 机械设备 / VEHICLE 运输设备 / FURNITURE 办公家具 / BUILDING 房屋建筑物 / SUPPLIES 办公用品 / MATERIAL 材料 / OTHER 其他设备 |
| `LOW_VALUE_CATEGORY` | OFFICE 办公用品 / WATER 水 / PPE 劳保用品 / PAPER 纸品 |
| `PURCHASE_MODE` | PURCHASE 购买 / LEASE 租赁 / SELF_BUILD 自建 / DONATION 受赠 |
| `ENABLE_STATUS` | ENABLED 启用 / DISABLED 停用 |
| `INBOUND_STATUS` | PENDING 待验收 / ACCEPTED 已验收 / STORED 已入库 |
| `DISPATCH_STATUS` | DISPATCHED 已派发 / RETURNED 已退库 |
| `BORROW_STATUS` | BORROWED 借出中 / OVERDUE 逾期 / RETURNED 已归还 |
| `DISPOSE_STATUS` | PROCESSING 处置中 / DONE 已完成 |
| `DISPOSE_TYPE` | SCRAP 报废 / SALE 变卖 / TRANSFER 调拨 / OTHER 其他 |
| `CHANGE_TYPE` | TRANSFER 调拨 / REPAIR 维修 / OTHER 其他 |
| `DOC_STATUS` | DRAFT 待提交 / PROCESSING 进行中 / REJECTED 已驳回 / REVOKED 已撤销 / DONE 已完结 |
| `LOW_VALUE_ITEM_STATUS` | NORMAL 正常 / LOW_STOCK 低库存 / DISABLED 停用 |
| `INVENTORY_ITEM_STATUS` | UNCHECKED 未盘 / CHECKED 已盘 / LOSS 盘亏 / ABNORMAL 异常 |
| `INVENTORY_RESULT` | UNCHECKED 未盘 / MATCHED 账实相符 / SURPLUS 盘盈 / LOSS 盘亏 |
| `INVENTORY_COUNTER_STATUS` | COUNTING 盘点中 / DONE 已完成 |
| `APPROVE_RESULT` | SUBMIT 提交 / AGREE 通过 / REJECT 驳回 / REVOKE 撤销 |
| `APPROVE_CONDITION` | NONE 无条件 / AMOUNT_GT 金额大于 / HAS_DIFF 存在差异 |
| `DEPRECIATION_METHOD` | STRAIGHT_LINE 年限平均法 / DOUBLE_DECLINE 双倍余额递减法 / SUM_YEARS 年数总和法 / WORKLOAD 工作量法 |
| `CALC_TIME` | MONTHLY 按月计提 / QUARTERLY 按季计提 / YEARLY 按年计提 |
| `BUSINESS_TYPE` | INBOUND 入库 / REQUISITION 领用 / **LV_RETURN 低值退库** / RETURN 退库 / DISPATCH 派发 / BORROW 借出 / TRANSFER 调拨 / REPAIR 维修 / DISPOSE 处置 / INVENTORY 盘点 / CHANGE 变更 |
| `APPROVE_MODE` | ANY 或签 / SEQUENCE 依次 / ALL 会签 |
| `DEVICE_STATUS` | ONLINE 在线 / OFFLINE 离线 / MAINTENANCE 维护中 / DISABLED 停用 |
| `DEVICE_TYPE` | PDA 手持盘点终端 / SCANNER 无线扫码枪 / TABLET 盘点平板 / FIXED 固定读码器 / OTHER 其他 |
| `DEVICE_ABNORMAL_TYPE` | UNAUTHORIZED_BIND 未授权绑定 / OUT_OF_SCOPE 越权盘点 / OFFLINE_UPLOAD 离线数据未上报 / TAMPERED 设备异常拆装 / DATA_ABNORMAL 盘点数据异常 / OTHER 其他 |
| `MESSAGE_LEVEL` | NORMAL 普通 / IMPORTANT 重要 / URGENT 紧急 |
| `PARAM_TYPE` | SYSTEM 系统内置 / CUSTOM 自定义 |
| `DATA_SCOPE` | ALL 全部数据 / COMPANY 本公司及以下 / DEPT 本部门及以下 / DEPT_ONLY 本部门 / SELF 仅本人 |
| `ORG_SCOPE` | GROUP 全集团 / COMPANY 本公司 / DEPT 本部门 |

### 7.1 枚举的在线维护（数据字典 = 枚举统一维护入口）

枚举的**编码**是契约的一部分（服务端与数据库按编码存取），**文案**可在运行期由「系统管理 > 数据字典」维护：

| 机制 | 说明 |
| --- | --- |
| 字典类型 | 每个可维护枚举对应一个字典类型，`code` 见 `system-dict-types`（如 `asset_status` → `ASSET_STATUS`） |
| 字典项 | 存于 `system-dict-types-{code}-items`，字段：`label` 文案 / `value` 编码 / `sort` / `status` / `remark` |
| 装载 | 前端启动与字典变更后装载至运行时覆盖表（`constants/enums.js` 的 `applyDictEnums`），`labelOf()/optionsOf()` 优先取字典文案 |
| 停用项 | `status=DISABLED` 的字典项不再出现在下拉选项中；已存储的历史数据仍按内置文案兜底 |
| 编码约束 | 字典项的 `value` 即枚举编码，**不可修改**（改动等价于改契约） |
| 新增项 | 字典页可**新增**字典项；新增编码与内置枚举并集构成契约校验的合法取值范围（后端需同步放行该编码） |

后端对接时：字典相关接口沿用 `system-dict-types` 与 `system-dict-types-{code}-items` 两类端点即可，前端无需改动。

### 7.2 全局审批流程

审批流程统一收敛到 `system-workflow-flows`（按 `bizType` 关联业务），资产模块与低值模块的"审批设置"页**只读引用**全局流程，不再各自维护一份：

- `bizType` 取 `BUSINESS_TYPE` 编码；资产侧为 `INBOUND/DISPATCH/BORROW/CHANGE/DISPOSE/INVENTORY`，低值侧为 `REQUISITION/RETURN`
- `steps` 为环节数组：`{ key, name, approver, mode(ANY/SEQUENCE/ALL), amountLimit, condition }`


---

### 7.3 权限码清单（RBAC）

前端采用**扁平权限码**模型：角色持有一组权限码，用户的权限为其所有角色权限码的**并集**。
前端只做「有 / 无」判断，不做层级推导。共 **36 个**叶子权限码，分 5 组：

| 分组 | 权限码 | 含义 |
| --- | --- | --- |
| 工作台 | `wm:view` `wm:todo` `wm:alert` `wm:overview` `wm:message` | 工作台访问 / 我的待办 / 预警中心 / 概览看板 / 我的消息 |
| 固定资产 | `fa:view` `fa:add` `fa:edit` `fa:delete` `fa:export` `fa:inbound` `fa:dispatch` `fa:borrow` `fa:change` `fa:dispose` `fa:inventory` `fa:depreciation` `fa:report` | 台账查看 / 新增 / 编辑 / 删除 / 导出 / 入库验收 / 派发退库 / 借出 / 变更 / 处置 / 盘点 / 折旧 / 报表 |
| 低值资产 | `lv:view` `lv:edit` `lv:export` `lv:inbound` `lv:requisition` `lv:return` `lv:report` | 台账查看 / 物品维护 / 导出 / 入库 / 领用 / 退库 / 报表 |
| 组织架构 | `org:company` `org:dept` `org:user` `org:role` | 公司 / 部门 / 用户 / 角色管理 |
| 系统管理 | `sys:dict` `sys:log` `sys:workflow` `sys:params` `sys:message` `sys:template` `sys:terminal` | 数据字典 / 操作日志 / 流程配置 / 系统参数 / 消息中心 / 消息模板 / 盘点终端 |

**存储方式**

- `org-roles.permissions[]` — 该角色被勾选的权限码数组
- `org-users.roleIds[]` — 用户所属角色；用户权限 = 各角色 `permissions` 的**并集**

> 后端必须保证 `GET /auth/profile` 返回的用户信息包含 `roleIds`，
> 否则前端无法计算权限，会表现为「菜单全部不可见」或「按钮全部隐藏」。

---
## 8. 验收清单（后端交付时逐项核对）

- [ ] 所有接口返回统一信封 `{ code, message, data }`
- [ ] 列表支持 `keyword` / 字段过滤 / `sortBy` / `sortOrder`；分页接口返回 `{ rows, total }`
- [ ] 时间字段为 ISO 8601；枚举字段返回编码
- [ ] 主键由服务端生成并返回
- [ ] 唯一性、外键、删除保护、库存联动、退库限额按第 5 节实现并返回对应 code
- [ ] 提供 `PUT /{key}/batch` 与 `DELETE /{key}/all`
- [ ] 前端配置 `.env` 后可完整跑通：资产台账 / 入库 / 派发 / 借出 / 变更 / 处置 / 盘点 / 折旧，低值资产入库 / 领用 / 退库，组织架构四页
