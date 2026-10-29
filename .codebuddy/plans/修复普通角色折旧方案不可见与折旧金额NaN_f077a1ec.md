---
name: 修复普通角色折旧方案不可见与折旧金额NaN
overview: 普通业务角色（如同时挂「资产使用人+仓管员」的陈铃）进入资产管理-折旧页时，折旧方案列表为空、台账全部显示「未配置」且累计折旧为 ¥NaN；管理员账号正常。根因是折旧方案/设置方案的读接口要求 fa:depreciation / fa:edit，而这些角色只有 fa:view；叠加前端未处理「无方案 + 入库日期为空」导致 NaN。需在权限策略上按「配置只读、执行受控」放行，并加固前端折旧计算。
todos:
  - id: add-permission-codes
    content: 新增 fa:settings/lv:settings 权限码并打通权限树、菜单、路由三处前端入口
    status: pending
  - id: tighten-backend-policy
    content: 调整 PermissionPolicy：基础配置写删改用新码，读保持业务可用，保留折旧方案读的精确项
    status: pending
    dependencies:
      - add-permission-codes
  - id: update-role-data
    content: 更新生产库、seed.sql、mock 种子与接口文档中的角色授权，仅 R1/R2 获得新码
    status: pending
    dependencies:
      - add-permission-codes
  - id: add-permission-tests
    content: 在 P2EngineTest 补充基础配置读写权限断言并跑通全量测试
    status: pending
    dependencies:
      - tighten-backend-policy
  - id: deploy-and-verify
    content: 重新构建部署生产栈，用各角色账号验证菜单、路由与接口口径一致
    status: pending
    dependencies:
      - update-role-data
      - add-permission-tests
---

## 产品概述

固定资产基础设置与低值资产基础设置目前没有独立权限项，任何拥有台账查看权限（`fa:view` / `lv:view`）的角色都能看到入口并进入页面修改配置，权限范围过宽。

## 核心问题

- 角色管理的权限树中缺少「固定资产基础设置」「低值资产基础设置」两个可勾选项，管理员无法单独授权或收回
- 前端菜单与路由用 `fa:view` / `lv:view` 控制基础设置入口，资产使用人、审计员、仓管员等角色也能进入
- 后端资源鉴权与前端入口规则不一致：固定资产基础设置读要求 `fa:edit`，低值基础设置读写仅要求 `lv:view` / `lv:edit`

## 期望结果

- 新增两个独立权限码，纳入角色权限配置，可在角色管理中按角色勾选
- 默认只授予系统管理员与资产管理员，其余六个角色一律不授予
- 未授权角色在菜单中看不到「基础设置」，直接访问路由被拦截，调用写接口返回 403
- 低值物品表单的「存放位置」下拉依赖基础配置数据，读权限保持不影响业务
- 折旧台账依赖的折旧方案/规则读取权限不得回退

## 技术栈

沿用现有栈：Vue 3 + Element Plus + Pinia（前端）、Spring Boot + MyBatis-Plus（后端）、MySQL。不引入新依赖。

## 实现方案

### 1. 权限码设计

新增两个权限码，语义为「进入基础设置页 + 维护该模块基础数据」：

| 权限码 | 名称 | 适用模块 |
| --- | --- | --- |
| `fa:settings` | 固定资产基础设置 | 分类、存放位置、位置候选项、折旧规则、折旧方案 |
| `lv:settings` | 低值资产基础设置 | 低值存放位置 |


### 2. 前端打通

- `config/permissions.js`：在「固定资产」组末尾加 `fa:settings`，在「低值资产」组末尾加 `lv:settings`。角色管理的权限树直接消费 `PERMISSION_TREE`，加完即出现在勾选面板。
- `layouts/MainLayout.vue`：两处「基础设置」菜单项的 `can('fa:view')` / `can('lv:view')` 改为 `can('fa:settings')` / `can('lv:settings')`；同时把这两个码加入对应 `groupVisible([...])` 列表，避免「只授了 settings 却看不到分组」的边界情况。
- `router/index.js`：`/fixed-asset-settings` 的 `meta.permission` 改为 `fa:settings`，`/low-value-asset-settings` 改为 `lv:settings`。路由守卫已有 `can()` 校验与兜底路径，无需改守卫逻辑。

### 3. 后端资源鉴权收敛

`PermissionPolicy.java`：

- `fixed-asset-settings` 前缀：`WRITE` / `DELETE` 由 `fa:edit` 改为 `fa:settings`
- `low-value-settings` 前缀：新增 `WRITE` / `DELETE` → `lv:settings`（此前落到 `low-value` 前缀的 `lv:edit`）
- 读权限保持宽松，避免打断既有业务读取：
- `fixed-asset-settings-*` 的 READ 由 `fa:edit` 调整为 `fa:view`
- `low-value-settings-*` 的 READ 继续走 `low-value` 前缀 = `lv:view`
- 上一轮已加的精确项 `fixed-asset-settings-depreciation-plans` / `-rules` READ = `fa:view` 必须保留，因为 `lookup()` 精确优先于前缀

调整后效果：能看台账的角色仍能读到配置数据（供下拉与折旧计算），但只有持 `fa:settings` / `lv:settings` 的角色能写入，且只有他们看得到菜单和页面。

### 4. 角色授权数据

- `R1` 系统管理员：追加 `fa:settings`、`lv:settings`（37 → 39）
- `R2` 资产管理员：追加 `fa:settings`、`lv:settings`（24 → 26）
- `R3` / `R4` / `R5` / `R6` / `R7` / `R8`：不授予
- 低值仓管员 `R8` 需要选存放位置，但读取走 `lv:view`，无需授予 `lv:settings`

数据需同步四处：生产库 `fams.org_roles`、`db/seed.sql`、`services/mock/seed/org.js`、`docs/API_CONTRACT.md`。`sql/03-demo/00-demo.sql` 经核查不含 `org_roles`，无需改动。

### 5. 测试

`P2EngineTest` 追加断言（Java 8，禁用 `Set.of`）：

- 仅持 `fa:view`：可读 `fixed-asset-settings-categories`，不可写
- 持 `fa:settings`：可写 `fixed-asset-settings-categories` / `-depreciation-plans`
- 持 `lv:view`：可读 `low-value-settings-locations`，不可写
- 持 `lv:settings`：可写 `low-value-settings-locations`
- 回归：`fixed-asset-depreciation-schemes` 的 GET 在 `fa:view` 下仍为 true

### 6. 性能与影响面

权限判断是内存 `HashMap` 查找，O(1)，无性能影响；不新增接口、不改数据结构；管理员现有行为不变。

## 实施注意事项

- `lookup()` 是「精确匹配优先、否则最长前缀」，新增前缀项时不要覆盖已有的精确项
- 生产库 `permissions` 是 TEXT 类型存 JSON 数组，用一次性 SQL 脚本以完整数组覆盖，保证可重复执行且不会重复追加
- 后端以 Java 8 编译，测试代码不得使用 `Set.of`
- 部署必须走 `stop-prod → build-prod（当前基线 108 个测试）→ start-prod`，否则旧 jar 不生效
- 改动后需复核 `LowValueAssetManagement.vue` 与 `FixedAssetManagement.vue` 的只读下拉仍能取到数据（`lowValueAsset.js` 的 `loadAll()` 无条件加载位置表）

## 目录结构

```
fams-frontend/
├── src/
│   ├── config/
│   │   └── permissions.js                       # [MODIFY] 固定资产组加 fa:settings、低值组加 lv:settings，角色管理权限树自动生效
│   ├── layouts/
│   │   └── MainLayout.vue                       # [MODIFY] 两处基础设置菜单改用新权限码；groupVisible 列表补入新码
│   ├── router/
│   │   └── index.js                             # [MODIFY] 两个基础设置路由的 meta.permission 改为 fa:settings / lv:settings
│   └── services/mock/seed/
│       └── org.js                               # [MODIFY] SEED_ROLES 中 R1、R2 的 permissions 追加两个新码，保证 mock 模式与单测一致
├── docs/
│   └── API_CONTRACT.md                          # [MODIFY] 权限码总数 36→38，权限分组表补两行说明

fams-backend/
├── src/main/java/com/fams/engine/
│   └── PermissionPolicy.java                    # [MODIFY] fixed-asset-settings 写删改 fa:settings、读改 fa:view；新增 low-value-settings 写删 lv:settings；保留折旧方案/规则读的精确项
├── src/main/resources/db/
│   └── seed.sql                                 # [MODIFY] R1、R2 的 permissions JSON 数组追加 fa:settings、lv:settings
├── src/test/java/com/fams/p2/
│   └── P2EngineTest.java                        # [MODIFY] 补充基础配置读写权限断言（Java 8 写法）
└── sql/04-permissions/
    └── 01-settings-permission.sql               # [NEW] 生产库一次性授权脚本：R1/R2 追加两个权限码，其余角色保持不变，可重复执行
```