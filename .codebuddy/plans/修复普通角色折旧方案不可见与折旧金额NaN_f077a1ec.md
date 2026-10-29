---
name: 修复普通角色折旧方案不可见与折旧金额NaN
overview: 普通业务角色（如同时挂「资产使用人+仓管员」的陈铃）进入资产管理-折旧页时，折旧方案列表为空、台账全部显示「未配置」且累计折旧为 ¥NaN；管理员账号正常。根因是折旧方案/设置方案的读接口要求 fa:depreciation / fa:edit，而这些角色只有 fa:view；叠加前端未处理「无方案 + 入库日期为空」导致 NaN。需在权限策略上按「配置只读、执行受控」放行，并加固前端折旧计算。
todos:
  - id: fix-permission-policy
    content: 在 PermissionPolicy 中为折旧方案、设置折旧方案、设置折旧规则追加精确只读规则（fa:view），保留写删与计提的 fa:depreciation / fa:edit 限制，并在 P2EngineTest 补充权限断言
    status: completed
  - id: harden-depreciation-calc
    content: 修复 FixedAssetManagement 的折旧计算与展示：入库日期无效时月数归零、金额有限性兜底、金额格式化、计提按钮补 can('fa:depreciation')
    status: completed
    dependencies:
      - fix-permission-policy
  - id: fix-use-collection-error
    content: 为 useCollection 的 load/loadPage 增加异常捕获与 error 状态，使 403 不再静默表现为空列表
    status: completed
  - id: build-and-verify
    content: 执行 stop-prod、build-prod、start-prod，并用陈铃账号验证三个折旧只读接口返回 200、管理员数据不变、写入仍被拒绝
    status: completed
    dependencies:
      - fix-permission-policy
      - harden-depreciation-calc
      - fix-use-collection-error
---

## 产品概述

固定资产管理系统中，同一套折旧数据在不同角色下展示不一致：管理员能看到已配置的折旧方案，普通业务角色（资产使用人 / 仓管员）进入「资产管理 → 折旧」时方案列表为空、台账全部标记「未配置」，且累计折旧与 KPI 出现 ¥NaN。

## 核心问题

- 折旧方案配置表对普通角色显示「暂无数据」，而管理员显示 4 条已配置方案
- 资产折旧台账每行折旧方案为红色「未配置」，月折旧额 ¥0、累计折旧 ¥NaN
- 顶部 KPI 出现 ¥NaN，本月计提显示 ¥0
- 「计提本月折旧」按钮对无折旧权限的账号仍然可见
- 台账「入库日期」为空时金额计算进一步恶化

## 期望结果

- 具备资产查看权限的角色（fa:view）可正常读取折旧方案与折旧设置中的方案/规则，折旧页展示与管理员一致
- 折旧方案的增删改、计提折旧动作仍严格限制给具备折旧权限的角色
- 缺失方案、缺失入库日期等异常数据下金额显示为 0 或占位符，不出现 NaN
- 无计提权限的账号看不到「计提本月折旧」按钮
- 管理员现有行为保持不变

## 根因分析

### 1. 后端权限策略覆盖过宽（主因）

`fams-backend/src/main/java/com/fams/engine/PermissionPolicy.java` 采用「精确匹配优先，否则最长前缀匹配」：

```java
READ.put("fixed-asset-depreciation", new String[]{"fa:depreciation"});
READ.put("fixed-asset-settings", new String[]{"fa:edit"});
```

因此三个只读接口被错误地要求管理权限：

| 接口 | 命中前缀 | 实际要求 | 应要求 |
| --- | --- | --- | --- |
| `fixed-asset-depreciation-schemes` | `fixed-asset-depreciation` | fa:depreciation | fa:view |
| `fixed-asset-settings-depreciation-plans` | `fixed-asset-settings` | fa:edit | fa:view |
| `fixed-asset-settings-depreciation-rules` | `fixed-asset-settings` | fa:edit | fa:view |


陈铃角色为 R3 资产使用人 + R8 仓管员，权限集合为 `fa:view, lv:view, lv:requisition, lv:return, wm:view, wm:todo, wm:alert, wm:message`，不含 `fa:depreciation` 与 `fa:edit`，三个请求全部 403。`useCollection.load()` 无 catch，页面只拿到空数组，台账匹配不到方案。

### 2. 前端计算缺少异常兜底（次因）

`FixedAssetManagement.vue` 中 `monthsSince()` 直接 `new Date(inboundDate)`，入库日期为空时得到 Invalid Date，`months` 变为 NaN；随后 `0 * NaN = NaN`，再经 `Math.min(NaN, 0)` 使累计折旧与 KPI 汇总全部变 NaN。

### 3. 按钮权限缺失

「计提本月折旧」按钮未加 `can('fa:depreciation')` 判断，而「新增折旧方案」已有该判断。

## 技术方案

按「配置只读、执行受控」原则收敛权限粒度，并加固前端数值计算，不改变现有架构。

### 后端：精确 key 覆盖前缀规则

在 `PermissionPolicy` 静态块中紧随通用前缀规则之后追加精确项（`lookup` 已实现精确优先，无需改判定逻辑）：

```java
// 折旧配置属于基础字典：能看资产台账即可读；写/计提仍走 fa:depreciation / fa:edit
READ.put("fixed-asset-depreciation-schemes", new String[]{"fa:view"});
READ.put("fixed-asset-settings-depreciation-plans", new String[]{"fa:view"});
READ.put("fixed-asset-settings-depreciation-rules", new String[]{"fa:view"});
```

保持不变：`fixed-asset-depreciation-reports`（仍 fa:depreciation）、`fixed-asset-settings` 的 WRITE/DELETE（仍 fa:edit）、`fixed-asset-depreciation` 的 WRITE/DELETE（仍 fa:depreciation）。

### 前端：数值与展示兜底

- `monthsSince()` 对无效日期返回 0（`Number.isNaN(start.getTime())` 判断）
- `depreciationLedger` 用 `Number.isFinite` 兜底 `monthly / accumulated / net`，方案缺失或年限为 0 时归零，避免除零与 NaN 传播
- `depreciationSummary`、`accumulatedThrough` 同步做有限数校验
- 模板金额列改用统一的金额格式化函数，空值/非有限数显示 0 或 `—`
- 「计提本月折旧」按钮补 `v-if="can('fa:depreciation')"`

### 可观测性

`useCollection.load()` 捕获异常，记录 `error` 并在控制台告警，避免权限/网络问题再次以「静默空列表」形式呈现为业务数据缺失。

### 性能与影响面

- 权限表为内存 Map 查找，O(1)，无性能影响
- 前端仅在既有 computed 内增加数值校验，无额外请求
- 不改动接口契约与数据库结构，管理员行为不变

## 目录结构

```
fams-backend/
├── src/main/java/com/fams/engine/
│   └── PermissionPolicy.java                    # [MODIFY] 追加折旧方案/设置方案/设置规则的精确 READ 规则，读降为 fa:view；写删与计提保持原权限
└── src/test/java/com/fams/p2/
    └── P2EngineTest.java                        # [MODIFY] 补充权限断言：R3 可读折旧方案与设置方案，但不可新增/删除；R2 仍可写

fams-frontend/
├── src/views/fixed-asset/
│   └── FixedAssetManagement.vue                 # [MODIFY] monthsSince 无效日期归零；折旧台账/KPI 数值有限性兜底；金额格式化；计提按钮补权限判断
└── src/composables/
    └── useCollection.js                         # [MODIFY] load/loadPage 捕获异常，暴露 error 状态并告警，避免 403 静默成空列表
```

## 验证方式

1. 后端全量测试通过（当前基线 107 个用例）
2. `stop-prod.ps1 → build-prod.ps1 → start-prod.ps1` 重新部署
3. 接口验证：陈铃 token 请求三个只读接口应返回 200 且方案 4 条 / 计划 11 条 / 规则 5 条
4. 权限回归：陈铃新增或删除折旧方案仍应 403；管理员仍可正常读写
5. 页面由用户手动点测：折旧方案表有数据、台账显示方案名称、无 ¥NaN、无权限账号看不到计提按钮