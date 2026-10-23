# 资产管理系统 接口契约（API Contract）

> 本文件是前后端**唯一真源**。前端 `src/services/contract/schema.js` 中的契约定义与本文件一致，
> mock 引擎与 HTTP 适配层均按此实现。后端按本契约提供接口后，前端仅需修改 `.env` 即可切换，业务代码零改动。
>
> 生成依据：`src/services/contract/schema.js`（实体字段/查询能力/业务规则）、`src/constants/enums.js`（枚举编码）。

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
| PUT | `/{key}/{id}` | 更新（body 为补丁） | `Row` |
| DELETE | `/{key}/{id}` | 删除 | `true` |
| PUT | `/{key}/batch` | 批量保存（body 为 `Row[]`，按主键 upsert） | `Row[]` |
| DELETE | `/{key}/all` | 清空集合 | `true` |

> `id` 由**服务端生成**，前端不再自行拼装。删除失败时按第 2 节错误码返回，前端直接提示 `message`。

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
| `org-users` | `username*`(唯一) `name*` `companyId*` `deptId` `position` `roleIds[]` `phone` `email` `status*` `createdAt` `lastLoginAt` |
| `org-roles` | `code*`(唯一) `name*`(唯一) `orgScope` `dataScope` `status*` `sort` `remark` `permissions[]` |

---

## 5. 业务规则（服务端必须实现）

| 规则 | 适用 | 错误码 |
| --- | --- | --- |
| 唯一性校验 | `code`/`name`/`username`/`key` 等契约声明的唯一字段 | 409 |
| 外键引用完整性 | 所有 `ref` 字段指向的记录必须存在 | 1005 |
| 资产删除保护 | 存在派发/借出/处置单据的资产不能删除 | 1003 |
| 公司删除保护 | 有子公司 / 部门 / 用户的公司不能删除 | 1002 / 1003 |
| 部门删除保护 | 有子部门或人员的部门不能删除 | 1002 / 1003 |
| 角色删除保护 | 已关联用户的角色不能删除 | 1003 |
| 类别/位置删除保护 | 仍被物品引用的类别、位置不能删除 | 1003 |
| 分类删除保护 | 有子分类的分类不能删除 | 1002 |
| 低值物品删除保护 | 仍有库存或已产生单据的物品不能删除 | 1003 |
| **库存联动** | 入库 `stock += qty`；领用 `stock -= qty`（不足报 1001）；退库 `stock += qty` | 1001 |
| **退库限额** | 退库数量 ≤「已领未退」= 领用总量 − 退库总量 | 1006 |
| 单据删除回退库存 | 删除入库/领用/退库单据时，反向回退库存 | — |

> 前端 mock 引擎已按上述规则实现（`src/services/mock/rules.js`），签约后以服务端为准，前端不再重复校验。

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
| `INVENTORY_COUNTER_STATUS` | COUNTING 盘点中 / DONE 已完成 |
| `DEPRECIATION_METHOD` | STRAIGHT_LINE 年限平均法 / DOUBLE_DECLINE 双倍余额递减法 / SUM_YEARS 年数总和法 / WORKLOAD 工作量法 |
| `CALC_TIME` | MONTHLY 按月计提 / QUARTERLY 按季计提 / YEARLY 按年计提 |
| `BUSINESS_TYPE` | INBOUND 入库 / REQUISITION 领用 / RETURN 退库 / DISPATCH 派发 / BORROW 借出 / DISPOSE 处置 / INVENTORY 盘点 / CHANGE 变更 |
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

## 8. 验收清单（后端交付时逐项核对）

- [ ] 所有接口返回统一信封 `{ code, message, data }`
- [ ] 列表支持 `keyword` / 字段过滤 / `sortBy` / `sortOrder`；分页接口返回 `{ rows, total }`
- [ ] 时间字段为 ISO 8601；枚举字段返回编码
- [ ] 主键由服务端生成并返回
- [ ] 唯一性、外键、删除保护、库存联动、退库限额按第 5 节实现并返回对应 code
- [ ] 提供 `PUT /{key}/batch` 与 `DELETE /{key}/all`
- [ ] 前端配置 `.env` 后可完整跑通：资产台账 / 入库 / 派发 / 借出 / 变更 / 处置 / 盘点 / 折旧，低值资产入库 / 领用 / 退库，组织架构四页
