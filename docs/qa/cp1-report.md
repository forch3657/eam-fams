# CP1 检查点报告（测试体系整改 P1）

- 检查点：CP1-A / CP1-B / CP1-C（计划 2026-11-06 ~ 11-10，实际 2026-11-03 完成）
- 执行环境：本机生产栈 `http://localhost`（nginx 80 → 后端 8080 → MySQL `fams`）
- 结论：**P1 全部完成；权限契约、构建期校验、版本一致性、状态机矩阵均有可复跑的证据**

## 一、交付物与证据

| 优先级 | 交付物 | 文件 | 验收证据 |
| --- | --- | --- | --- |
| P1-1 | 资源→权限码契约 | `fams-backend/src/main/resources/contract/permission-resources.json`、`engine/PermissionPolicy.java` | 启动日志 `[permission] 权限契约已加载：read=21 write=30 delete=30 immutable=1`；`P12PermissionContractTest` 7 用例通过 |
| P1-2 | 构建期权限校验 | `fams-frontend/tools/check-permissions.mjs`、`npm run check:perm` | `build-prod.ps1` 第 3/4 步执行通过；构建脚本对非法权限码直接失败 |
| P1-3 | 版本一致性 | `HealthController#version`、`services/versionCheck.js`、`App.vue` 顶部横幅、`vite.config.js` | `GET /api/version` 匿名返回 `{"version":"1.0.0","startedAt":...}`；`[SMK-05]`、`[SMK-07]` 通过（7/7） |
| P1-4 | 单据状态机矩阵 | `tests/e2e/15-doc-state-machine.spec.ts` | `[P7-01]`~`[P7-04]` 通过：非法迁移一律拒绝、库存不变量成立 |

## 二、关键设计

### 1. 契约是唯一事实来源

```json
{
  "version": 1,
  "immutable": ["fixed-asset-doc-approvals"],
  "rules": [
    { "resource": "fixed-assets", "read": ["fa:view"], "write": ["fa:add", "fa:edit"], "delete": ["fa:delete"] }
  ]
}
```

- 匹配规则：精确 key 优先，其次最长前缀；未登记的字段表示「仅需登录」。
- `immutable` 集合拒绝写操作（审批留痕不可篡改）。
- `PermissionPolicy` 启动加载，缺失资源打告警日志，不静默放行。

### 2. 构建期拦截前后端口径漂移

`check:perm` 扫描 `can('...')`、路由 `meta.permission`、`PERMISSION_TREE`，校验三件事：

1. 出现的码必须在 `contract/permissions.json` 中定义；
2. 契约里的资源映射覆盖全部受控集合；
3. 种子角色的权限码都在契约内。

任一不满足即中断构建，避免「前端有按钮、后端没码」再次逃逸。

### 3. 版本一致性只挡「旧包」

- 后端 `/api/version` 返回语义版本 + 启动时间；前端启动比对 `meta[name=app-version]`；
- 另有 `/version.txt` 构建号，比对浏览器里跑的是不是旧包（`[SMK-05]`）；
- 不一致时顶部横幅提示「系统已更新，请刷新」；dev 模式不启用，避免热更新反复打扰。

### 4. 状态机矩阵按「状态 × 动作」穷举

`[P7-01]`~`[P7-04]` 覆盖 `DRAFT/PROCESSING/DONE/REVOKED × submit/approve/reject/revoke/delete`，
每条非法迁移同时断言：HTTP 状态、单据状态不变、轨迹不新增、库存 `stock`/`reserved` 守恒。

## 三、验收结果

| 验收项 | 目标 | 实际 |
| --- | --- | --- |
| 后端单测 | 全绿 | 116 passed / 0 failed（`mvn clean package`） |
| 契约加载 | 无未知资源 | 启动日志 read=21 write=30 delete=30 immutable=1 |
| `check:perm` | 构建期可拦截 | 构建流程第 3 步通过；写入非法码即失败 |
| 版本一致性 | 不一致 3 秒内提示 | `[SMK-05]`、`[SMK-07]` 通过 |
| 状态机矩阵 | 非法迁移全部断言 | `[P7-01]`~`[P7-04]` 通过 |

## 四、遗留与边界

- 契约当前覆盖后端受控集合；新增集合必须同步契约，否则 `check:perm` 在第 2 项失败。
- 版本横幅只在生产构建出现，联调时看不到属预期行为。
- 状态机矩阵目前覆盖低值领用、固资派发、低值入库三类；新增单据类型需补对应 `[P7-xx]`。
