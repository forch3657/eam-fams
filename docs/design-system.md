# 设计系统与易用性基线

> 适用范围：`fams-frontend`（Vue 3 + Element Plus 2.9）。本文件是视觉/交互改动的单一说明入口。
> 建立于 2026-11-06 的 UI/UX 分阶段优化；基线证据见 `e2e-artifacts/ui-baseline/`。

## 1. 设计原则（美观与易用的平衡）

本系统是**日均高频操作的审批/台账系统**（部门主管、财务、仓管、审计、资产管理员、系统管理员），不是展示型产品。取舍顺序固定：

1. **任务效率 > 视觉表现**：表单、表格、审批弹窗里，装饰让位于「少一次点击、少一次滚动」。
2. **一致性 > 单点惊艳**：统一 token 带来的秩序感就是最有效的美观提升。
3. **色彩只承担语义**：主色 = 可操作，状态色 = 状态，中性色 = 其余；不引入渐变/插画/大色块。
4. **密度可配置**：默认紧凑，提供舒适/紧凑档（尚未实现，见 §8）。
5. **动效只解释状态变化**：≤150ms，遵循 `prefers-reduced-motion`，审批链路不加拖沓动画。
6. **对比度、焦点、键盘路径是硬约束**，不为任何视觉效果让步。

场景取舍：登录页、工作台概览、空态可多一点品牌表达；表格、表单、审批弹窗一律效率优先。

## 2. 设计 Token

唯一真源：`fams-frontend/src/styles/global.css` 的 `:root`（文件由 `src/main.js` 在 Element Plus 样式之后引入，**顺序不能变**）。

| 组 | 变量 | 说明 |
|---|---|---|
| 品牌 | `--c-primary` `#1668DC`、`--c-primary-dark` `#0E4DA4`、`--c-primary-light` `#E8F2FF`、`--c-accent` | 主色仅用于主按钮/链接/选中态；深蓝顶栏 |
| 功能 | `--c-success` / `--c-warning` / `--c-danger` / `--c-info` | 与 Element Plus 语义色对齐 |
| 文字 | `--t-main` `#0F172A`、`--t-sub` `#475569`、`--t-weak` `#617188` | `--t-weak` 为 P0 调整值：白底 4.97:1、表头底 4.63:1，均达 WCAG AA |
| 背景 | `--bg-page` `#F0F2F5`、`--bg-card` `#FFFFFF`、`--bg-th` `#F5F7FA`、`--bg-subtle` `#F8FAFC`、`--bg-hover` | `--bg-subtle` 为 P2 新增的卡片内分区层 |
| 边框 | `--bd` `#E2E8F0`、`--bd-split` `#EEF2F7`、`--bd-strong` `#CBD5E1` | `--bd-strong` 用于需强调的分隔线 |
| 间距 | `--sp-1` 4px … `--sp-6` 24px | 4px 阶梯；区块间 16、卡片内 12~16、表单行 8、表格行 10 |
| 字号 | `--fs-xs` 12 … `--fs-xl` 24 | 正文 14px，辅助字不小于 13px，中文行高 1.5 |
| 圆角/阴影 | `--r-sm/md/lg`、`--shadow` | 卡片统一 |
| 布局 | `--h-top` 56px、`--w-side` 200px、`--content-px`、`--card-hd-h` | `MainLayout` 的 `el-aside` 宽度仍需 JS 传值，见 §8 |
| 字体 | `--font-sans` / `--font-num` / `--font-mono` | 金额/数字用 `--font-num` + `tabular-nums` 右对齐 |

校验工具：`node e2e-artifacts/ui-baseline/contrast.mjs`（输出当前与候选色的 WCAG 对比度）。

## 3. 语义真源（禁止各页重复定义）

| 用途 | 真源 | 说明 |
|---|---|---|
| 单据状态色 / 文案 | `src/utils/status.js` | `statusType()`、`statusLabel()`；含 `DOC_STATUS_TYPE` |
| 审批结果色 / 文案 | `src/utils/status.js` | `approveResultType()`、`approveResultLabel()`；含 `WITHDRAW/VOID/TERMINATE` |
| 设备状态色 | `src/utils/status.js` | `deviceStatusType()` |
| 金额 / 日期 | `src/utils/format.js` | `formatMoney(v, decimals)`、`formatDate(Time)`；禁止页面内 `toLocaleString()` 直写 |
| 枚举 / 字典文案 | `src/constants/enums.js` → `contract/*.json` | 后端契约由 `npm run export:contract` 导出，**禁止只手改后端契约** |
| 路由标题 / 面包屑 | `src/router/index.js` 的 `meta.title` | `AppBreadcrumb` 直接读 `route.matched` |
| 权限码 | `src/config/permissions.js` | 菜单与按钮鉴权 |

## 4. 组件与布局约定

- 页面四段式：**标题 › 筛选 › 数据 › 分页**；`.page-header` / `.filter-bar` / `.pager` 用全局样式。
- 主内容 `.main-content`：`padding: var(--sp-6)`，其直接子元素限宽 `1600px` 居中，超宽屏不出现超长行。
- 表格：表头 13px、操作列 `fixed="right"`、金额右对齐 + 等宽数字、状态用「颜色 + 文字」双编码。
- 弹窗：`max-width: calc(100vw - 32px)`、`max-height: calc(100vh - 64px)`；header/footer 固定、body 独立滚动，保证「确定/取消」始终可见。
- 页签：`TagsView` 支持键盘（`role=link` + `tabindex` + Enter/Space）；深链 `?tab=&sub=` 见 §8。
- 状态变化反馈 ≤120ms 过渡；危险操作二次确认。

## 5. 交互反馈

- `src/services/http.js`：统一信封、15s 超时、401 跳登录；**403 / 5xx / 网络 / 超时**由 `setErrorNotifier()` 注入的全局提示器给出可见反馈；400/409 业务错误仍由页面按上下文提示，避免重复弹窗。
- 并发的相同写请求复用同一 promise（`inFlightWrites`），防双击造成双写。
- `src/composables/useAsyncAction.js`：`{ loading, run }` 统一提交态、防重与结果提示；新页面接入，存量页面逐步迁移（§8）。
- 审批动作（`src/services/approval.js`）：失败统一转 `{ ok:false, message }`，成功后强制刷新审批轨迹，避免「点了没反应 / 界面停在上一环节」。

## 6. 可访问性基线（P0 硬约束）

- `:focus-visible` 全局 2px 焦点环，深蓝顶栏/侧栏用白色；**禁止 `outline:none`**。
- 正文/辅助字对比度 ≥ 4.5:1；图标按钮必须是 `button` + `aria-label`。
- `src/utils/a11y.js` 在挂载前注册 `MutationObserver`，把 `el-form-item` 的 label 与内部控件自动关联（含动态弹窗），并补 `aria-labelledby`。
- `@media (prefers-reduced-motion: reduce)` 下关闭动画与过渡。
- 验收：`Tab` 应能到达「折叠侧栏 / 待办徽标 / 消息徽标 / 页签 / 页签关闭 / 账户菜单」并看到焦点环。

## 7. 响应式

| 断点 | 处理 |
|---|---|
| ≥1600 | 内容限宽居中 |
| ≤1280 | 内容 padding 降至 `--sp-4`，顶栏间距收缩 |
| ≤1100 | padding `--sp-3`，分页器隐藏每页条数与跳页 |
| ≤800 高度 | 弹窗 `margin-top: 4vh`，配合 body 滚动保证按钮可见 |
| 全宽 | 弹窗限宽 `100vw - 32px` |

B 端以 ≥1024px 为主战场，**不做完整移动端**（见 §8）。

## 8. 已知遗留项（按优先级）

1. `MainLayout` 的 `el-aside` 宽度仍是 JS 硬编码 `200px/64px`，`--w-side` 未被使用；需抽共享布局常量。
2. `?tab=&sub=` 深链目前只有 `FixedAssetManagement`、`LowValueAssetManagement` 读取，`TodoPanel`/`AlertPanel` 写入；其余 `el-tabs` 页（约 9 处）尚未做双向同步，建议独立专项，不要逐页临摹。
3. `useAsyncAction` 已提供但存量页面尚未全量迁移；当前防重由 http 层兜底。
4. 「舒适 / 紧凑」密度档与用户偏好持久化未实现。
5. 深色主题已按计划删除死代码；若将来要做主题切换，需同时补入口与 Element Plus 全量变量。
6. 工作台行动条与待办卡片仍有较大空白、概览数字层级偏弱；建议在有人点测数据后再做一轮信息架构调整。
7. Element Plus `el-link underline` 等废弃 API 警告（固定资产页 31 条 console warnings），随组件库升级清理。

## 9. 验收清单

- [x] `npm run check:perm`、前端四个单测套件（199+66+125+20）、后端 `mvn test` 全绿
- [x] `read_lints` 无新增错误
- [x] `contrast.mjs`：`--t-weak` 白底 4.97、表头底 4.63，均 ≥4.5
- [x] 浏览器 `Tab` 焦点环可见、关键控件有 `aria-label`、23/30 表单项完成 `label[for]` 关联
- [x] 1024 / 1440 实测无横向溢出且弹窗按钮可见；1280 / 1920 由 CSS 断点与 `max-width` 保证（未逐一截图）
- [x] 全量 E2E：224 passed / 3 failed（227 条，34.6 分钟）；3 条逐条定位后单跑 3/3 通过，其中 1 条（`SMK-04`）是账户菜单改 click 触发后的真实回归，已同步修用例
- [x] 视觉截图与 `e2e-artifacts/ui-baseline/` 对比无意外错位（基线 / P0 / final 三组已归档）
- [x] 生产栈按 `stop-prod.ps1 → build-prod.ps1 → start-prod.ps1` 重建后验证
