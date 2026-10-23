# 工作台模块规划（WORKBENCH PLAN）

> 状态：已确认，进入实施。本文档为工作台模块的设计与验收依据，实施进度见文末「实施状态」。
> 归档时间：2026-10-23　适用版本：EAM-FAMS 前端（fams-frontend）

---

## 一、背景与目标

项目已有**审批链**（系统管理 → 流程配置驱动）与**库存预警**（低值资产安全库存），但两者都散落在各业务页面里，缺少一个"从哪看、从哪干"的聚合入口。

目标：新增**工作台**模块，作为登录后的默认首页，按角色聚合「我的待办 + 我的预警 + 我的资产 + 全局概览」，并让每一个可见/可用功能都能通过**组织架构 → 角色管理**的权限勾选来控制开放范围。

---

## 二、已确认决策

| 编号 | 决策 |
|---|---|
| D1 | **工作台作为登录默认首页**：根路由 `/` 重定向到 `/workbench`，侧边栏「工作台」置顶 |
| D2 | **待办只放工作台卡片**：不单独建「审批中心」页面；卡片内直接通过/驳回，也可跳转对应业务列表 |
| D3 | **权限一律走角色管理**：工作台各卡片、「我的消息」、预警的开放范围由权限码决定，管理员在「组织架构 → 角色管理」勾选/取消勾选即生效，不在代码里硬编码 |
| D4 | **实施顺序**：先写本规划文档存档，再动工 |

---

## 三、现状分析

| 痛点 | 现状 |
|---|---|
| 登录无落点 | 根路由固定重定向 `/fixed-assets`，所有人看到同一页，与角色无关 |
| 待办散落 | 8 类固资单据面板 + 低值领用/退库 + 盘点单，共 10 处入口，需逐个 tab 巡查 |
| 预警散落 | 低值库存预警只在低值报表；`sys.inventory.remind.days`（盘点提前提醒）参数存在但无处消费；借出到期无数据源 |
| 消息到不了人 | 消息中心挂「系统管理」下、需 `sys:message` 权限，资产使用人（R3）无此权限 |
| 缺"我的视角" | 资产总额/净值/状态分布只有报表页有，且是报表视角 |

---

## 四、模块设计

### 4.1 信息架构

```
工作台 /workbench
├── 我的待办        （待我审批 / 我发起的 / 我已处理）
├── 预警中心        （低值库存 / 库存占用 / 盘点到期 / 单据滞留 / 驳回未重提）
├── 概览看板        （资产总览 / 低值总览 / 审批时效）
└── 我的消息 + 快捷入口
```

### 4.2 A 区：我的待办（P0）

- **待我审批**：跨 11 类业务（8 类固资单据 + 低值领用 + 低值退库 + 盘点），判定条件为「当前环节审批角色 ∈ 当前用户角色」，复用 `services/approval.js` 的 `effectiveSteps` / `currentStep` / `canApprove`，**不自造审批判定**。
  - 展示：单据号、业务类型、当前环节、金额/数量、提交人、停留时长（超期标红）
  - 操作：卡片内「通过 / 驳回」（复用 `runApproval` + `DocApprovalDialog`），或「去处理」跳转对应业务列表 tab
- **我发起的**：待提交（DRAFT）/ 审批中（PROCESSING）/ **被驳回（REJECTED，置顶高亮）**
- **我已处理**：近 30 天内我通过/驳回的单据，可回看审批轨迹
- **待办红点**：顶栏徽标显示待我审批数量

### 4.3 B 区：预警中心（P0）

| 预警 | 判定规则 | 数据源 |
|---|---|---|
| 低值低库存 / 严重低库存 | `stock ≤ safetyStock` / `≤ safetyStock × sys.lowvalue.safetyRatio` | 低值台账 |
| 库存被审批占用 | `reserved > 0` | 低值台账 |
| 盘点到期倒计时 | `planDate − 今天 ≤ sys.inventory.remind.days` | `fixed-asset-inventory-plans` |
| 单据滞留超时 | 审批中停留 > `sys.approval.timeout.days` | `fixed-asset-doc-approvals` |
| 驳回未重提 | REJECTED 后超 3 天未重新提交 | 单据状态 |

每条预警包含：级别（严重/一般）、原因说明、处理入口跳转。

### 4.4 C 区：概览看板（P1）

- **资产总览**（`wm:overview`）：总数、原值、净值、状态分布、分类 Top5、闲置资产数
- **低值总览**：物品种类、库存金额、预警数、在途审批量
- **审批时效**：近 7 天提交/通过/驳回量、平均审批时长、各环节平均耗时
- 每张卡片带「查看更多」跳对应报表页，**不重复造报表**

### 4.5 D 区：我的消息与快捷入口（P1/P2）

- 快捷入口：新建入库/派发/借出/盘点/领用（按 `can()` 显示）
- **我的消息**（`wm:message`）：只读与本人相关的站内消息；开放范围由角色管理勾选决定。原「系统管理 → 消息中心」定位不变。

---

<!-- PART2 -->
## 五、技术方案

### 5.1 业务类型注册表（前提改造）

把散落的「业务类型 ↔ 单据集合」映射集中到 `services/approval.js`，导出 `BIZ_DOC_REGISTRY`：

| 业务类型 | docKey | 单据集合 |
|---|---|---|
| INBOUND | inbound | `fixed-asset-doc-lists-inbound` |
| DISPATCH | alloc | `fixed-asset-doc-lists-alloc` |
| RETURN | back | `fixed-asset-doc-lists-back` |
| BORROW | borrow | `fixed-asset-doc-lists-borrow` |
| TRANSFER | transfer | `fixed-asset-doc-lists-transfer` |
| REPAIR | repair | `fixed-asset-doc-lists-repair` |
| CHANGE | change | `fixed-asset-doc-lists-change` |
| DISPOSE | dispose | `fixed-asset-doc-lists-dispose` |
| INVENTORY | inventory | `fixed-asset-inventory-docs`（独立集合） |
| REQUISITION | requisition | `low-value-requisition` |
| LV_RETURN | return | `low-value-return` |

### 5.2 聚合层

新增 `services/workbench.js`（只读、不落库）：`myTodos()` / `alerts()` / `overview()`；由 `store/workbench.js` 承载加载与派生状态。

- 演示阶段：前端聚合（mock 数据量小）
- 接后端阶段：改为服务端聚合接口（`GET /workbench/todo|alerts|overview`）

### 5.3 权限设计（对应 D3）

新增权限组「工作台」，登记到 `config/permissions.js` 的 `PERMISSION_TREE`，角色管理里即可勾选：

| 权限码 | 含义 | 默认勾选角色 |
|---|---|---|
| `wm:view` | 工作台入口与页面访问 | 全部角色 |
| `wm:todo` | 我的待办（含卡片内审批） | R1 R2 R3 R5 R7 R8 |
| `wm:alert` | 预警中心 | R1 R2 R5 R8 |
| `wm:overview` | 概览看板 | R1 R2 R4 R6 R7 |
| `wm:message` | 我的消息 | 全部角色 |

规则：

- 路由 `/workbench` 的 `meta.permission = 'wm:view'`，无权限时由路由守卫落到有权限的页面（现有 `FALLBACK_ROUTES`）
- 卡片级显隐按 `userStore.can('wm:*')`，**不做代码硬编码**
- 管理员取消勾选即关闭对应功能，侧边栏入口同步消失

### 5.4 路由与入口

- 新增路由 `/workbench`（工作台），根路由 redirect 改为 `/workbench`
- 侧边栏第一项「工作台」（`wm:view`）
- 顶栏：待办徽标 + 消息铃铛（`wm:message`）
- 业务页面支持 `?tab=` 深链，待办「去处理」可直达对应 tab

---

## 六、实施分期

| 期次 | 内容 | 状态 |
|---|---|---|
| P0 | 工作台骨架 + 待我审批 / 我发起的 / 我已处理 + 顶栏待办红点 | ✅ 已完成 |
| P1 | 预警中心（低值库存、库存占用、盘点到期、单据滞留、驳回未重提） | ✅ 已完成 |
| P2 | 概览看板（资产 / 低值 / 审批时效）+ 深链定位 | ✅ 已完成 |
| P3 | 我的消息 + 审批结果站内信 | ✅ 已完成 |

### 实际落地要点

- **默认首页**：根路由 `/` 与 `/:pathMatch(.*)*` 均重定向到 `/workbench`；`TagsView` 首页同步改为 `/workbench`
- **权限码**（登记在 `config/permissions.js` 的「工作台」分组，角色管理里可勾选）：
  `wm:view` 工作台访问 / `wm:todo` 我的待办 / `wm:alert` 预警中心 / `wm:overview` 概览看板 / `wm:message` 我的消息
- **角色默认授权**：R1 全部；R2 全部；R3 `view+todo+message`；R4 `view+overview+message`；R5 `view+todo+alert+message`；R6 `view+overview+message`；R7 `view+todo+overview+message`；R8 `view+todo+alert+message`
- **新增系统参数**：`sys.approval.timeout.days`（审批滞留超时天数，默认 5）、`sys.approval.reject.retryDays`（驳回重提期限，默认 3）
- **新增消息模板**：`approval_todo`（审批待办）、`approval_result`（审批结果通知）
- **深链**：固资页面支持 `?tab=&sub=`（如 `/fixed-assets?tab=dispose&sub=repair`），低值页面支持 `?tab=`（如 `/low-value-assets?tab=requisition`）
- **存储键**：升到 v9（旧数据自动失效并按最新种子重建，角色权限码才会生效）


---

## 七、风险与取舍

1. **审批判定不重复实现**：待办判定全部复用 `services/approval.js`，工作台只做聚合与展示。
2. **单据字段不足**：借出单无到期日、处置单无原因，逾期类预警暂缺数据源，后续可给 doc-lists 契约补 `dueDate`/`reason`/`urgency`。
3. **dataScope 尚未真正过滤**：工作台按当前用户公司/部门做演示口径过滤，真实范围过滤由后端承担。
4. **不重复建设**：工作台不做报表、不做列表、不做消息中心，只做「聚合 + 直达」。

---

## 八、验收口径

1. 登录后默认进入工作台，侧边栏第一项为「工作台」。
2. `chengang`（部门主管）登录：待我审批能看到自己环节的单据，卡片内可通过/驳回。
3. `wangqiang`（资产使用人）登录：待我审批为空，「我发起的」显示自己提交的单据，能看到被驳回高亮。
4. 取消某角色的 `wm:alert` 勾选后重新登录：该角色工作台不再出现预警中心。
5. 顶栏待办徽标数量与工作台「待我审批」条数一致。
6. 待办「去处理」能跳到对应业务列表并定位到对应 tab。
7. `npm test` 全部通过，`npx vite build` 通过。

---

## 九、涉及文件

| 文件 | 变更 |
|---|---|
| `docs/WORKBENCH_PLAN.md` | 本规划存档 |
| `src/services/approval.js` | 新增 `BIZ_DOC_REGISTRY`、补 `LV_RETURN` 映射 |
| `src/services/workbench.js` | 新增：待办/预警/概览聚合层 |
| `src/store/workbench.js` | 新增：工作台数据加载与派生状态 |
| `src/views/workbench/Workbench.vue` | 新增：工作台页面 |
| `src/views/workbench/components/*` | 新增：待办卡、预警卡、概览卡、消息卡 |
| `src/router/index.js` | 新增 `/workbench` 路由、默认重定向 |
| `src/layouts/MainLayout.vue` | 侧边栏置顶、顶栏徽标 |
| `src/config/permissions.js` | 新增「工作台」权限组 |
| `src/services/mock/seed/org.js` | 角色默认勾选工作台权限 |
| `src/services/mock/seed/system.js` | 新增系统参数（审批超时等）与消息模板 |
| `src/views/fixed-asset/*`、`src/views/low-value-asset/*` | 支持 `?tab=` 深链 |
| `workbench.test.mjs` | 新增：工作台聚合逻辑测试 |
