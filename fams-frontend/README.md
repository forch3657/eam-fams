# 资产管理系统（fams-frontend）

从经营性资产管理系统中抽离出来的**固定资产 + 低值资产**独立前端工程，可单独开发、单独运行。侧边栏顺序：固定资产 → 低值资产 → 组织架构 → 系统管理。

## 接口契约与 mock 切换

数据层采用**契约驱动（Contract-First）**：先定义契约，mock 引擎与 HTTP 适配层都从同一份契约派生行为，二者方法签名、返回结构、错误模型完全一致。

```
视图 / store  →  dataService（统一门面）  →  mock 引擎   （VITE_USE_MOCK=true）
                                        →  HTTP 适配层 （VITE_USE_MOCK=false）
                        ↑
                  src/services/contract/（单一真源：字段/枚举/查询能力/业务规则）
```

- **契约定义**：`src/services/contract/schema.js`（约 40 个集合的字段、类型、枚举、外键、查询能力、业务规则）
- **枚举编码**：`src/constants/enums.js`（编码 → 文案，含 `labelOf()` / `optionsOf()`）
- **错误模型**：`src/services/errors.js`（`ApiError` + 错误码）
- **统一门面**：`src/services/index.js`（`list` / `page` / `get` / `create` / `update` / `remove` / `batch` / `clear`）
- **种子数据**：`src/services/mock/seed/`（全部演示数据集中在此，视图与 store 不含任何 mock 代码）
- **对外文档**：[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)（交后端按此实现）

### 切换到真实后端

```bash
# .env
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://your-backend/api
```

改完重启即可，**业务代码零改动**。返回体规范为 `{ code, message, data }`，列表分页返回 `data: { rows, total }`。

### 数据语义约定

- 外键存 **id**（`companyId` / `deptId` / `userId` / `assetId` / `itemId`），不存名称
- 状态存 **枚举编码**（`IDLE` / `ENABLED` / `DONE`），展示用 `labelOf()`
- 时间存 **ISO 8601**（`2026-09-18T10:22:31`），展示用 `formatDateTime()`
- 含审计字段 `createBy` / `createTime` / `updateBy` / `updateTime` / `version`
- 主键由**服务端**生成，前端不再自行拼装

### 注意事项

- mock 数据落在 localStorage，键为 `fams-mock-db-v10`；数据模型变更后旧键已失效，无需手动清理（如需重置：控制台执行 `localStorage.removeItem('fams-mock-db-v10')` 后刷新）。
- 开发期若种子数据与契约不符，控制台会打印 `[契约校验]` 告警，便于在切后端前发现字段/枚举问题。
- 可通过 `VITE_MOCK_LATENCY`（毫秒）与 `VITE_MOCK_ERROR_RATE`（0~1）模拟网络延迟与随机故障，演练 loading 与错误分支。

## 启动

本机 Node 不在 PATH，工程根目录提供了启动脚本 `run.bat` / `run.ps1`，会自动加载预装 Node 运行时、按需安装依赖并启动。

```powershell
cd f:/work/EAM-FAMS/fams-frontend
.\run.bat            # 启动 dev 服务器 -> http://localhost:5174/
.\run.bat install    # 强制重新安装依赖后启动（依赖异常/首次克隆后）
.\run.bat build      # 构建生产包
.\run.bat preview    # 预览构建产物
```

脚本行为：

- 自动把预装 Node（`$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2-6`）加入 PATH，无需手动配置。
- `node_modules` 不存在时自动执行 `npm install`；`run.bat install` 可强制重装。
- `run.bat` 以 `powershell -ExecutionPolicy Bypass` 运行 `run.ps1`，双击即可，不受系统执行策略限制。
- 也可用 `.\run.ps1`（支持 `-Install` / `-Build` / `-Preview` 参数）直接运行。

如需手动启动（不使用脚本）：

```powershell
$env:Path = "$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2-6;$env:Path"
cd f:/work/EAM-FAMS/fams-frontend
npm install
npm run dev     # http://localhost:5174/
```

演示账号：`admin / 123456`（系统管理员）、`asset / 123456`（资产管理员）。

## 功能范围

| 路由 | 页面 | 内容 |
| --- | --- | --- |
| `/fixed-assets` | 资产管理 | 固定资产、入库/验收、派发/退库、借出使用、资产变更、资产处置、资产盘点、折旧管理 |
| `/fixed-asset-reports` | 资产报表 | 分类/位置/部门/使用人统计、折旧明细与导出 |
| `/fixed-asset-settings` | 基础设置 | 位置、分类、折旧规则、折旧方案、审批流程 |
| `/low-value-assets` | 低值资产管理 | 库存台账（类别/关键字筛选、低库存预警、导出）、入库、领用、退库 |
| `/low-value-asset-reports` | 低值资产报表 | 类别统计、部门领用统计、出入库汇总与导出 |
| `/low-value-asset-settings` | 低值资产基础设置 | 存放位置、审批流程（只读引用全局流程，低值资产不计提折旧，无折旧页签）；**物品类别在「数据字典」维护** |
| `/system/company` | 公司管理 | 公司层级树（集团→子公司）、公司增删改、启停用、删除保护 |
| `/system/dept` | 部门管理 | 公司→部门→子部门树、部门增删改、启停用、部门人员维护 |
| `/system/user` | 用户管理 | 统一用户主数据、公司/部门/角色归属、重置密码、启停用 |
| `/system/role` | 角色管理 | 角色增删改、启停用、按真实模块的权限树配置 |
| `/system/dict` | 数据字典 | **业务枚举的统一维护入口**：字典类型/字典项，改动即时作用于全站文案 |
| `/system/log` | 操作日志 | 页面访问与业务操作留痕 |
| `/system/workflow` | 流程配置 | 全局审批流程与环节编排（资产/低值模块的审批设置页只读引用） |
| `/system/params` | 系统参数 | 系统内置/自定义参数（编号前缀、库存预警比例、盘点提醒天数等已被业务消费） |
| `/system/message-center` | 消息中心 | 站内消息、未读提醒 |
| `/system/message-template` | 消息模板 | 模板维护与变量渲染（变量为资产域：asset/assetNo/billNo/dept/user 等） |
| `/system/terminal` | 盘点终端 | 盘点终端台账（PDA/扫码枪/平板）、终端异常登记 |

## 目录结构

```
src/
├── main.js / App.vue          入口
├── router/index.js            登录 + 工作台 + 18 条业务路由（含登录守卫、401 拦截）
├── layouts/MainLayout.vue     侧边栏（工作台 / 固定资产 / 低值资产 / 组织架构 / 系统管理）+ 顶栏 + 页签栏
├── views/Login.vue            轻量登录页（token 存 sessionStorage，登录后跳工作台）
├── views/fixed-asset/         固定资产业务页面（台账 / 单据 / 报表 / 基础设置）
├── views/low-value-asset/     低值资产三个业务页面
├── views/system/              组织架构（公司/部门/用户/角色）与系统管理页面
├── config/permissions.js      权限树定义（固定资产/低值资产/组织架构/系统管理）
├── store/
│   ├── user.js                登录/登出
│   ├── app.js                 侧边栏折叠、页签栈
│   ├── fixedAsset.js          资产与六类业务单据
│   ├── lowValueAsset.js       低值资产物品、入库/领用/退库单据、基础设置与报表统计
│   └── org.js                 组织架构主数据：公司/部门/用户/角色的唯一数据源
│   ├── notify.js              消息中心与消息模板
│   └── audit.js               操作日志
├── composables/useCollection.js  集合读写封装（load/add/update/remove/save）
└── services/
    ├── index.js               数据服务出口：按 .env 在 mock / HTTP 间切换
    ├── http.js                fetch 封装（baseURL、超时、统一错误）
    ├── collections.js         集合 key 常量
    └── mock/
        ├── index.js           内存版 CRUD
        ├── seed/asset.js      固定资产类种子数据
        ├── seed/lowValueAsset.js  低值资产种子数据（物品、单据、位置；类别取字典编码）
        └── seed/org.js        组织架构主数据种子（公司、部门、用户、角色）
```

## 组织架构主数据

公司、部门、用户、角色统一由 `store/org.js` 维护，是**唯一数据源**：资产模块的公司、部门下拉一律取自这里，不再各页硬编码。

| 集合 | 关键字段 |
| --- | --- |
| `org-companies` | code、name、shortName、parentId（集团→子公司）、type、creditCode、legalPerson、contact、phone、address、status、sort |
| `org-departments` | code、name、parentId、companyId、leader、headcount（编制）、phone、status、sort |
| `org-users` | username、name、companyId、deptId、position、roleIds[]、phone、email、status、createdAt、lastLoginAt |
| `org-roles` | code、name、orgScope、dataScope、status、remark、permissions[] |

设计约定：

- 部门**不冗余**人员字段，在职人数由 `users.deptId` 统计，避免双写不一致。
- 删除保护：有子公司/部门/用户的公司、有子部门或人员的部门、有关联用户的角色，均禁止删除。
- 角色权限以权限编码（如 `fa:view`、`lv:requisition`）存储，权限树见 `config/permissions.js`。
- 权限**已实际生效**：路由级（`meta.permission` + 路由守卫）、菜单级（按权限过滤）、按钮级（`v-if="can('fa:add')"`）三层控制。
- 菜单分组内没有任何可见子项时整组隐藏；账号若所有页面都无权访问，路由守卫跳转到 `/403` 无权限提示页（而不是重新登录）。
- 登录账号通过 `roleId` 关联组织架构中的角色，权限取该角色勾选的权限编码；组织主数据未加载完成时先按全部放行，加载后自动收敛。
- 用户新增默认密码 `123456`，重置密码生成随机口令并回显给管理员。
- mock 数据落在 localStorage，旧版 `system-*` 集合已废弃；如浏览器残留旧数据，清空对应存储键即可。

## 低值资产模块

### 业务规则

- 库存联动：入库 `库存 += 数量`；领用 `库存 -= 数量`（不足时拒绝并提示）；退库 `库存 += 数量`。
- 退库校验：退库数量不得超过「已领未退数量」（领用总量 − 退库总量）。
- 金额按提交时的单价快照计算，后续改价不影响历史单据。
- 删除保护：仍有库存或已产生单据的物品不可删除；仍被物品引用的位置不可删除。
- 低库存预警：库存 ≤ 安全库存时在台账标记「预警」。

### 集合 key

| Key | 说明 |
| --- | --- |
| `low-value-items` | 低值资产台账（code、category、name、spec、unit、price、stock、safetyStock、location、status） |
| `low-value-inbound` | 入库单据（docNo、itemId、quantity、price、amount、supplier、inboundDate、operator） |
| `low-value-requisition` | 领用单据（docNo、itemId、quantity、amount、receiver、dept、requisitionDate、purpose） |
| `low-value-return` | 退库单据（docNo、itemId、quantity、returner、dept、returnDate、reason） |
| `low-value-settings-locations` | 存放位置设置 |
| `low-value-settings-approval-flows` | 审批流程设置（适用业务：入库 / 领用 / 退库） |

编号规则：物品编码 `DZ + 年份 + 序号`，单据编号 `RK / PY / TK + 年份 + 序号`（可留空自动生成）。

## 数据层：mock 与后端切换

页面与 store 只依赖 `services/index.js` 暴露的 `dataService`，界面代码不感知数据来源。

`.env`：

```
VITE_USE_MOCK=true      # true：内置 mock；false：调用后端接口
VITE_API_BASE_URL=      # 后端根地址，为空时自动回落 mock，避免误配白屏
```

切后端步骤：复制 `.env.example` 为 `.env`，设置 `VITE_USE_MOCK=false` 与 `VITE_API_BASE_URL=http://host/api` 即可，无需改业务代码。

后端需提供的 REST 接口（key 见 `src/services/collections.js`）：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/{key}` | 列表 |
| POST | `/{key}` | 新增，body 为行对象 |
| PUT | `/{key}/{id}` | 修改，body 为行对象 |
| DELETE | `/{key}/{id}` | 删除 |
| PUT | `/{key}/batch` | 整表回写（树形分类等批量改动） |

请求头自动带上 `Authorization: Bearer <sessionStorage.token>`；返回体支持裸数组或 `{ data: ... }`。

### 两条实现约定

- mock 与 HTTP 行为一致：读取返回深拷贝、写入只落库，页面/store 维护自己的响应式副本（避免同一条数据被插入两次）。
- 业务写入统一走 `useCollection().add/update/remove`；行内嵌套字段（如盘点明细、分类树、流程环节）就地修改后需调用 `update()` 或 `save()` 回写。
- mock 数据落 `localStorage`（键名 `fams-mock-db-v10`），刷新后仍保留改动；清空该键即可恢复种子数据。

## 与原系统的关系

- 原项目 `f:/work/FAMS` 未被修改，固定资产模块仍是其中一部分，两边可同时运行。
- 本工程剥离了审计留痕、GIS 地图、echarts 大屏等无关能力，依赖精简为 vue / vue-router / pinia / element-plus / icons / qrcode。
