## 用户需求

新增一个"工作台"模块，作为登录后的默认首页，把审批待办、库存预警、经营概览聚合到一屏，并让所有功能开关可由组织架构 → 角色管理配置。

已确认的四项决策：

1. **工作台作为登录默认首页**（根路由重定向到工作台）。
2. **不做独立审批中心页面**，待办只以工作台卡片呈现，卡片内可直接完成通过/驳回。
3. **消息中心是否对普通用户开放不硬编码**，改为由组织架构 → 角色管理的权限码配置决定（管理员勾选/取消勾选即可改变开放范围）；工作台所有功能一律权限码驱动。
4. **先写规划存档再开工**：第一件事产出 `fams-frontend/docs/WORKBENCH_PLAN.md`。

## 产品概述

工作台是"按角色聚合的个人首页"：**我的待办 + 我的预警 + 我的资产 + 全局概览**四块内容按权限动态组合，点击直达处理现场。它不重复造报表、列表和消息中心，只做"聚合 + 直达"，解决当前"登录无落点、待办散落在 10 个 tab、预警藏在报表里、消息到不了人"四个问题。

## 核心功能

### A 区 我的待办（P0）

- **待我审批**：跨 11 类业务（8 类固资单据 + 盘点 + 低值领用/退库）自动聚合，判定"当前审批环节的审批角色 ∈ 当前用户角色"；卡片显示单据号、业务类型、当前环节、金额/数量、提交人、停留时长（超期标红），可直接在卡片内"通过/驳回"（驳回强制填意见），也可"去处理"跳到对应单据页。
- **我发起的**：待提交 / 审批中 / 被驳回（置顶高亮，支持重新提交与撤销）。
- **我已处理**：近期我通过或驳回的单据，可回看审批轨迹。
- **顶部待办红点**：顶栏铃铛显示待我审批数量。

### B 区 预警中心（P0）

低值低库存、严重低库存、库存被审批占用、盘点到期倒计时、单据审批滞留超时、驳回后未重新提交、资产长期处于派发/借出/处置中。每条预警给出级别（严重/一般）、原因说明与处理入口。

### C 区 概览看板（P1）

- 资产总览：总数、原值、净值、状态分布、分类 Top5、闲置资产数。
- 低值总览：物品种类、库存金额、预警数、在途审批量。
- 审批时效：近 7 天提交/通过/驳回量、平均审批时长、各环节平均耗时。
- 每张卡片带"查看更多"跳对应报表页。

### D 区 我的消息与快捷入口（P1/P2）

- "我的消息"卡片与顶栏铃铛：可见范围由角色权限码决定（普通用户是否开放由管理员在角色管理中勾选），只读与本人相关的消息。
- 快捷入口：按权限显示新建入库/派发/借出/盘点/领用等按钮。
- 审批动作可触发站内消息提醒（新增审批待办模板）。

### 视觉与交互效果

顶部为问候语 + 角色/公司信息 + 四个待办/预警/概览计数胶囊；主体为"待办 → 预警 → 概览"自上而下的卡片栅格，卡片内表格紧凑可扫读，待办行左侧以色条区分状态（待审=蓝、驳回=红、超期=橙）；空态给出明确引导（如"当前没有需要你审批的单据"）；审批操作在卡片内就地完成并即时刷新计数。

## 一、技术栈与约束

- **前端**：Vue 3 `<script setup>` + Element Plus + Pinia + Vite（沿用现有项目技术栈，不引入新组件库）
- **状态与数据**：现有契约驱动 mock 引擎（`src/services/mock`）+ `dataService` 统一读写；后端切换时把聚合层换成服务端接口即可
- **样式**：沿用 `src/styles/global.css` 的 CSS 变量（`--c-primary #1668DC`、`--c-danger #D93026`、`--c-warning #E8912A`、`--bd #E2E8F0`、`--bg-page #F0F2F5`）与既有栅格类（`grid-4 / grid-3 / grid-2 / grid-auto`）
- **硬约束**：

1. 审批判定一律复用 `src/services/approval.js`（`getFlow/effectiveSteps/currentStep/canApprove/approvalsOf/runApproval`），工作台**不得自造审批语义**
2. 可见性/开关全部由权限码驱动，权限码必须登记到 `src/config/permissions.js` 的 `PERMISSION_TREE`，否则角色管理里无法勾选
3. 数据层只存枚举编码，展示层用 `labelOf`
4. 不新增集合（审批记录已在 `fixed-asset-doc-approvals`，预警全为派生数据）

## 二、实现方案

### 2.1 前置改造：业务类型注册表（关键解耦点）

当前"业务类型 → 单据集合/页面"的映射散落在 `approval.js`（`DOC_BIZ_TYPE`）、`FixedAssetDocList.vue`、`FixedAssetManagement.vue`（盘点独立集合）、`LowValueAssetManagement.vue`（`LV_BIZ`）四处，工作台要遍历 11 类单据必须先收敛。

在 `src/services/approval.js` 新增并导出 `BIZ_DOC_REGISTRY`（业务类型 → 单据 docKey、集合 key、显示名、所属模块、跳转路由与 tab），并补 `DOC_BIZ_TYPE.return = 'LV_RETURN'`（低值退库；固资退库 docKey 是 `back`，二者不冲突，`approvalsOf` 依赖 docKey 唯一性，注册表内 docKey 互不重复）。`FixedAssetDocList.vue`、`LowValueAssetManagement.vue` 中的本地映射改为引用注册表，消除硬编码漂移。

### 2.2 聚合层 `src/services/workbench.js`（只读，不落库）

三个纯函数 + 一个加载器，职责与现有 `services/approval.js` 同级：

- `loadWorkbenchDocs()`：`Promise.all` 并发拉取 11 个集合（8 个 `fixed-asset-doc-lists-*` + `fixed-asset-inventory-docs` + `low-value-requisition` + `low-value-return`），返回按业务类型分组的文档数组。
- `myTodos({ user, org, flows, approvals, docs, assets })`：逐单据复用审批引擎求当前环节，产出三组——`pending`（待我审批）、`mine`（我发起的，DRAFT/PROCESSING/REJECTED）、`done`（我已处理，近 N 天）。
- `buildAlerts({ org, docs, approvals, items, plans, params })`：产出预警数组（级别、类型、标题、说明、跳转地址）。
- `buildOverview({ assets, lowValue, approvals })`：产出资产/低值/审批时效指标。

**性能要点**：审批记录按 `docId` 建 `Map` 索引（避免每单据重复 `filter` 全表，复杂度从 O(单据数×记录数) 降到 O(记录数)）；派生结果在 store 内用 `computed` 缓存；集合只加载一次并缓存，审批动作后按受影响集合增量刷新。

### 2.3 状态层 `src/store/workbench.js`

集中持有 `docs / alerts / overview / loading / loaded`，对外暴露 `load(force)`、`refreshAfterApproval(bizType, docId)`、`todoCount`（顶栏红点）、`pendingList / myList / doneList`。避免多个子组件各自拉数据。

### 2.4 待办判定与卡片内审批

- 判定：单据 → `getFlow(bizType, flows)` → `effectiveSteps(flow, ctx)` → `currentStep(steps, records, org)` → `canApprove(cur.step, user, org)`。`ctx` 构造：固资单据取关联资产 `original` 作金额、盘点单据按明细 `LOSS/ABNORMAL` 判 `hasDiff`、低值单据取 `amount`（与 `FixedAssetDocList.ctxOf` / `FixedAssetManagement.invCtx` / 低值页 `ctxOf` 三处口径一致，聚合层统一实现）。
- 卡片内审批：复用 `DocApprovalDialog.vue`（props `modelValue/doc/docKey/bizType/ctx`，emit `act{action, comment}`），`saveDoc` 回调直接 `dataService.update(注册表集合, doc.id, next)`——引擎按状态迁移自动结算库存（低值单据），无需与各页面本地 store 耦合；工作台自身数据在动作成功后按受影响集合增量刷新。
- **深链**：工作台"去处理"跳转 `/fixed-assets?tab=dispose&sub=dispose`、`/low-value-assets?tab=requisition`；两个页面 `onMounted` 读 `route.query` 定位 tab（`activeTab / dispatchSub / disposeSub / inventorySub`），实现"从工作台直达现场"。

### 2.5 权限与路由（决策 3 的落点）

新增 `PERMISSION_TREE` 分组"工作台"，权限码：

| 权限码 | 含义 | 默认授权（角色管理可改） |
| --- | --- | --- |
| `wb:todo` | 查看我的待办 | R1~R8 全部 |
| `wb:approval` | 在待办卡片内审批 | R1~R8 全部 |
| `wb:alert` | 查看预警中心 | R1、R2、R4 |
| `wb:overview` | 查看概览看板 | R1、R2、R4 |
| `wb:message` | 查看我的消息（消息中心对普通用户是否开放） | 仅 R1（管理员在角色管理里勾选后即对相应角色开放） |


- 路由 `/workbench` 不设 `meta.permission`（全员可进），卡片与顶栏铃铛按 `userStore.can()` 显隐；根路由 `redirect` 改 `/workbench`，`FALLBACK_ROUTES` 首位加 `/workbench`（无任何权限的用户也有落点）。
- 侧边栏"工作台"置顶（`el-menu-item index="/workbench"`，图标 `HomeFilled`），不设权限码门槛。
- 顶栏新增铃铛 + 未读/待办徽标（`el-badge`），点击展开消息与待办下拉；铃铛可见性由 `wb:todo` / `wb:message` 决定。

### 2.6 预警参数与消息模板（种子）

`SEED_PARAMS` 新增：`sys.approval.timeout.days=3`（审批滞留超时）、`sys.alert.rejected.days=3`（驳回未重提）、`sys.workbench.done.days=30`（我已处理回看天数）；`SEED_NOTIFY_TEMPLATES` 新增 `approval_todo`（审批待办提醒）。`services/sysParams.js` 顶部注释同步补"已接入的参数"。因新增种子，`services/mock/index.js` 存储键 **v8 → v9**（旧键自动失效并按最新种子重建）。

### 2.7 消息下沉（决策 3）

工作台"我的消息"卡片只读展示与当前用户相关的消息（`target` 为 `all` 或本人公司），`wb:message` 控制可见性；原「系统管理 → 消息中心」页面与 `sys:message` 权限保持不变（管理视角全量消息）。审批动作推送站内信采用**回调注入**：`runApproval` 增加可选 `onEvent(event)` 参数（submit/approve/reject/revoke/settle），由视图层决定是否 `notify.sendByTemplate`，避免 `services` 层反向依赖 store。

### 2.8 页面结构（避免重复建设）

工作台只做聚合与直达：卡片"查看更多"跳 `/fixed-assets`（资产报表）、`/low-value-assets`（低值报表）；待办"去处理"跳对应单据 tab；消息"查看业务"复用 `notifyMessages.route` 字段跳转。

## 三、架构设计

```mermaid
graph TD
    A[MainLayout 顶栏铃铛 + 侧边栏工作台] --> B[/workbench 路由]
    B --> C[views/workbench/Workbench.vue]
    C --> D[store/workbench.js 集中加载与派生]
    D --> E[services/workbench.js 聚合层]
    E --> F[services/approval.js 审批引擎复用]
    E --> G[store/fixedAsset.js / store/lowValueAsset.js / store/notify.js]
    E --> H[services/mock dataService 11 个集合]
    C --> I[components/TodoPanel / AlertPanel / OverviewPanel / MyMessages]
    I --> J[DocApprovalDialog 卡片内审批]
    J --> F
    F --> H
    K[config/permissions.js 新增工作台权限码] --> C
    K --> A
    L[组织架构 角色管理 勾选权限码] --> K
    style B fill:#1668DC,color:#fff
    style E fill:#E8F2FF
    style F fill:#E8F2FF
```

## 四、目录结构

### 目录结构摘要

新增规划文档 1 份、工作台聚合服务与 store 各 1 个、工作台视图目录 1 组（页面 + 4 个子组件）；修改审批引擎（注册表与事件回调）、路由、布局、权限树、种子与系统参数、两个业务页面的深链定位。**不新增任何数据集合**。

```
fams-frontend/
├── docs/
│   └── WORKBENCH_PLAN.md                 # [NEW] 工作台规划存档（用户要求先落地）。内容：现状分析与痛点、定位与信息架构、四区功能清单、技术方案（注册表/聚合层/权限矩阵/分期）、权限矩阵表、实施分期与勾选状态、验收口径与点测路径。开工后随每期完成更新勾选状态
├── src/
│   ├── config/
│   │   └── permissions.js                # [MODIFY] 新增"工作台"权限分组：wb:todo / wb:approval / wb:alert / wb:overview / wb:message（角色管理权限弹窗依赖 PERMISSION_TREE 渲染，必须登记才能被勾选）
│   ├── services/
│   │   ├── approval.js                   # [MODIFY] 新增并导出 BIZ_DOC_REGISTRY（11 类业务 → docKey/集合 key/显示名/模块/跳转路由+tab）；DOC_BIZ_TYPE 补 'return'→'LV_RETURN'；runApproval 增加可选 onEvent(event) 回调用于审批事件通知（不在 services 层依赖 store）
│   │   ├── workbench.js                  # [NEW] 工作台聚合层（纯函数，只读）。导出 loadWorkbenchDocs()（Promise.all 并发拉 11 集合）/ myTodos()（待我审批·我发起的·我已处理，审批判定全部委托 approval.js）/ buildAlerts()（低值库存·盘点到期·审批滞留·驳回未重提·资产长期未处理）/ buildOverview()（资产·低值·审批时效）/ buildDocCtx()（统一金额与差异口径）。审批记录按 docId 建 Map 索引避免重复全表扫描
│   │   ├── sysParams.js                  # [MODIFY] 顶部"已接入的参数"注释补充 sys.approval.timeout.days / sys.alert.rejected.days / sys.workbench.done.days
│   │   ├── collections.js                # [CHECK] 确认无需新增集合（审批记录复用 docApprovals）
│   │   └── mock/
│   │       ├── index.js                  # [MODIFY] 存储键 v8 → v9（新增系统参数与消息模板种子，模型不兼容需重建）
│   │       └── seed/
│   │           ├── system.js             # [MODIFY] SEED_PARAMS 新增 3 个预警参数；SEED_NOTIFY_TEMPLATES 新增 approval_todo（审批待办提醒）模板
│   │           └── org.js                # [MODIFY] 角色种子默认授权：R1 全部 wb:*；R2 加 wb:alert/wb:overview；R4 加 wb:alert/wb:overview；R3/R5/R6/R7/R8 加 wb:todo/wb:approval；wb:message 默认仅 R1（普通角色由管理员在角色管理勾选后开放）
│   ├── store/
│   │   └── workbench.js                  # [NEW] 工作台状态中枢。持有 docs/alerts/overview/loaded/loading；load(force) 一次拉全量并缓存；refreshAfterApproval(bizType) 增量刷新受影响集合；派生 todoCount（顶栏红点）、pendingList/myList/doneList；对外不暴露原始集合细节
│   ├── router/
│   │   └── index.js                      # [MODIFY] 新增 /workbench 路由（meta 不设 permission，全员可进）；根路由 redirect 由 /fixed-assets 改 /workbench；FALLBACK_ROUTES 首位加 /workbench
│   ├── layouts/
│   │   └── MainLayout.vue                # [MODIFY] 侧边栏顶部新增"工作台"菜单项（HomeFilled 图标，不设权限码门槛）；顶部栏新增铃铛 el-badge（待办数 wb:todo / 未读消息数 wb:message），点击弹出待办与消息下拉，可直接跳工作台
│   └── views/
│       ├── workbench/
│       │   ├── Workbench.vue             # [NEW] 工作台主页面。顶部问候区（姓名/角色/公司 + 待办·预警·消息计数胶囊）；主区自上而下：待办区 → 预警区 → 概览区 → 我的消息 + 快捷入口；按 can() 显隐各区；卡片内审批复用 DocApprovalDialog；各卡片"查看更多/去处理"按注册表路由参数深链跳转
│       │   └── components/
│       │       ├── TodoPanel.vue         # [NEW] 待办面板（三个子块：待我审批/我发起的/我已处理）。表格紧凑可扫读，状态色条区分待审·驳回·超期；行内"通过/驳回"直接调 DocApprovalDialog，"去处理"按注册表深链；被驳回行置顶高亮并可"重新提交/撤销"
│       │       ├── AlertPanel.vue        # [NEW] 预警中心。按级别（严重/一般）分组，条目含类型标签、原因说明、发生时间与处理入口；空态引导用户到对应模块巡检
│       │       ├── OverviewPanel.vue     # [NEW] 概览看板。资产/低值/审批时效三组指标卡，资产状态分布用横向条形占比，审批时效用近 7 天迷你柱状；每组带"查看更多"跳对应报表页
│       │       └── MyMessages.vue        # [NEW] 我的消息（可见性由 wb:message 决定）。只读展示与本人相关消息（target=all 或本人公司），未读高亮、点击标记已读、有 route 则"查看业务"跳转；底部"全部已读"
│       ├── fixed-asset/
│       │   ├── FixedAssetManagement.vue  # [MODIFY] 支持深链定位：onMounted 读 route.query 的 tab/sub 设置 activeTab/dispatchSub/disposeSub/inventorySub（供工作台"去处理"直达对应单据页）
│       │   └── FixedAssetDocList.vue     # [MODIFY] 本地 bizType 映射改为引用 approval.js 的 BIZ_DOC_REGISTRY，消除硬编码（保持行为不变）
│       └── low-value-asset/
│           └── LowValueAssetManagement.vue # [MODIFY] 支持深链定位：onMounted 读 route.query.tab 设置 activeTab；LV_BIZ 改为引用 DOC_BIZ_TYPE（requisition→REQUISITION、return→LV_RETURN）
├── workbench.test.mjs                     # [NEW] 工作台自动化测试：注册表完整性（11 类业务都有启用流程、docKey 唯一、集合可读）/ 待我审批判定只含当前环节角色匹配单据 / 我发起的按 creatorId 过滤且 REJECTED 置顶 / 预警四类判定 / 概览指标 / 权限码显隐
├── approval.test.mjs                      # [MODIFY] 回归：新增注册表与业务类型数量的断言
└── package.json                           # [MODIFY] test 脚本串联 workbench.test.mjs
```

## 五、关键代码结构

```js
// src/services/approval.js —— 业务类型注册表（工作台遍历与深链跳转的唯一依据）
export const BIZ_DOC_REGISTRY = [
  // bizType, docKey, collection, title, module(fa|lv), route, tab, sub
  { bizType: 'INBOUND', docKey: 'inbound', collection: 'fixed-asset-doc-lists-inbound', title: '入库', module: 'fa', route: '/fixed-assets', tab: 'inbound' },
  { bizType: 'DISPOSE', docKey: 'dispose', collection: 'fixed-asset-doc-lists-dispose', title: '处置', module: 'fa', route: '/fixed-assets', tab: 'dispose', sub: 'dispose' },
  { bizType: 'INVENTORY', docKey: 'inventory', collection: 'fixed-asset-inventory-docs', title: '盘点', module: 'fa', route: '/fixed-assets', tab: 'inventory', sub: 'docs' },
  { bizType: 'LV_RETURN', docKey: 'return', collection: 'low-value-return', title: '低值退库', module: 'lv', route: '/low-value-assets', tab: 'return' }
  // …共 11 条，docKey 互不重复
]

// src/services/workbench.js —— 聚合层对外接口（纯函数，只读）
export function buildDocCtx(doc, { assets })            // → { amount, hasDiff }：固资取关联资产 original；低值取 amount；盘点按明细判差异
export function myTodos({ user, org, flows, approvals, docs, assets })
                                                        // → { pending: [], mine: [], done: [] }（pending 判定全部委托 approval.js）
export function buildAlerts({ org, docs, approvals, items, plans, params })
                                                        // → [{ level: 'critical'|'warning', type, title, desc, route, tab }]
export function buildOverview({ assets, lowValue, approvals }) // → { asset: {}, lowValue: {}, approval: {} }
```

## 六、实施要点

- **不重写审批语义**：待办"谁能审"必须与单据面板完全一致（同一 `currentStep` + `canApprove`），否则会出现"工作台能审、列表不能审"的不一致；因此 ctx 口径、注册表、按钮显隐三处必须共用同一实现。
- **权限码是唯一开关来源**：工作台不判断角色名（不写 `role.name === '仓管员'`），一律 `userStore.can('wb:xxx')`；角色开放范围由角色管理勾选，改完立即生效（`store/user.js` 的 `permissions` 是角色权限并集，实时计算）。
- **性能**：11 个集合并发加载一次并缓存；审批记录建 `docId` 索引；`computed` 缓存派生；顶栏红点读 store 派生值，不重复计算。真实后端接入时把 `loadWorkbenchDocs` 换成一次聚合接口即可，前端零改动。
- **爆炸半径控制**：只新增工作台相关文件与注册表/权限码/路由/菜单/顶部栏；单据面板与业务页面的改动仅限"引用注册表"与"读 query 定位 tab"，不改既有业务逻辑；存储键升版是唯一影响演示数据的地方（刷新自动重建）。
- **日志**：沿用 `router.afterEach` 的页面访问留痕（工作台访问自动记录），业务动作日志由 `store/audit.js` 既有机制处理，不额外打印。
- **构建与测试**：Node 需先设 `$env:Path = "$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2-6;$env:Path"`；`npx vite build` + `npm test` + `node .chkfn.cjs`（模板静态检查）；不跑浏览器自动化测试，由用户点测。

## 设计定位

桌面端（1440px+）业务工作台，沿用项目既有的 Element Plus + CSS 变量设计语言（`--c-primary #1668DC`、`--bg-page #F0F2F5`、`--bg-card #FFFFFF`、`--bd #E2E8F0`、`--r-md` 圆角），与现有资产/低值页面观感统一，不引入新组件库。

## 整体骨架（自上而下）

1. **页头区**：左侧"工作台"标题 + 副标题（当前公司 · 当前角色 · 数据截止时间）；右侧四个计数胶囊（待我审批 / 被驳回 / 预警 / 未读消息），胶囊为浅色底 + 强调色数字，预警与被驳回为红/橙色，可点击直接滚动到对应卡片。
2. **待办区**（首屏重点）：三张并列卡片——待我审批（主卡，占 2/3 宽）、我发起的、我已处理（各 1/3）。主卡表头含业务类型筛选与"仅看超期"开关；行左侧 4px 状态色条（待审蓝 / 超期橙 / 驳回红），行内右侧为"通过""驳回"文字按钮与"去处理"链接。
3. **预警区**：左右两栏——左为预警列表（按严重/一般分组，条目左侧圆点色标 + 类型标签 + 说明 + 时间），右为"处理建议"小卡（3 条以内的操作指引）。
4. **概览区**：三张指标卡横排（资产 / 低值 / 审批时效），每张由 2~4 个大数字 + 细分项构成，底部"查看更多 →"。资产状态分布用横向条形占比条（各状态取语义色），审批时效用近 7 天迷你柱状（提交/通过/驳回三色）。
5. **底部区**：左侧"我的消息"（未读加粗、点行标已读、右侧"查看业务"链接），右侧"快捷入口"宫格按钮（按权限显形）。

## 交互与动效

- 卡片入场 6px 上移 + 淡入（160ms ease-out），卡片 hover 抬升 2px 并加深阴影
- 待办行 hover 整行浅蓝底；审批成功后行以 240ms 淡出并从计数胶囊中扣减
- 预警严重项左侧 3px 红条 + 轻微脉冲提示（3s 一次，仅严重级）
- 数字变化用 200ms 数值滚动过渡；审批弹窗沿用既有 `DocApprovalDialog` 样式

## 响应式

≥1600px 三栏并排；1280~1600px 待办主卡与两个次卡纵向堆叠为两列；<1280px 全部单列，计数胶囊换行。侧边栏折叠时页头区保持两行内不溢出。