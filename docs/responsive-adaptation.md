# 响应式适配改造 · 设备与断点分析（阶段一）

> 本文是本次多端适配的**唯一规划真源**：断点取值、设备矩阵、分阶段顺序与验收口径都以本文为准。
> 生成日期：2026-11-18。适用范围：`fams-frontend` 全部 21 个路由页及公共组件、弹窗、抽屉。
> 决策变更：本文件正式取代 `docs/design-system.md` §7 旧口径「B 端以 ≥1024px 为主战场，不做完整移动端」。

---

## 1. 现状盘点（改造前基线）

只读盘点范围：`fams-frontend/src` 下全部 `.vue/.css/.js`。

| 项 | 实测值 |
| --- | --- |
| `@media` 规则 | 14 条 / 8 个文件；`global.css` 6 条，其余分布在工作台、组织页、登录页、帮助抽屉 |
| 宽度断点字面量 | `1440 / 1280 / 1200 / 1100 / 1024 / 900`，共 6 档，**最小 900px** |
| 高度断点字面量 | `800 / 720`，共 2 档 |
| 特性查询 | 仅 `prefers-reduced-motion: reduce` 1 条；无 `orientation`、无 `min-width`、无组合条件 |
| `el-dialog` 固定宽度 | **41 处 / 18 个页面**，值域 `460 ~ 1180px`，`1080px` 3 处、`1180px` 1 处 |
| `el-table-column` 数值宽度 | **503 列**，`width` 最大 380、`min-width` 最大 320；`fixed="right"` 操作列 31 处（最大 380px） |
| 内联 `style="width:NNNpx"` | 91 处 / 17 文件 |
| `label-width="NNNpx"` | 36 处 / 16 文件，值域 `80~140px` |
| `el-col :span` | 23 处固定值（8/9/12/15/16/24），**无 `:xs/:sm/:md/:lg/:xl`** |
| `el-drawer` | 2 处（`HelpCenter` 78%、`FixedAssetManagement` 资产详情 60%） |
| E2E 视口 | 固定 `1440×900`（`playwright.config.ts:53/63`、`tests/e2e/fixtures/env.ts:23`），无设备仿真 project |
| 已有 P0 基线 | `index.html:5` viewport meta；`global.css:979-1000` 栅格降级；`global.css:1087-1097` 弹窗限宽 + body 独立滚动 |

**结论**：现有能力集中在「≥1024px 的窄桌面」，`<900px` 完全空白；主要溢出来源是固定 px 弹窗、固定表格列宽与内联 width，而非布局框架本身。`.el-dialog` 有窄屏兜底，`.el-drawer` **没有**。

---

## 2. 主流设备矩阵

所有尺寸均为 **CSS 逻辑像素**（浏览器 `innerWidth × innerHeight`）；物理分辨率与 DPR 仅说明等价关系，不作为断点依据。

### 2.1 PC / 笔记本（横屏为主）

| 场景 | CSS 视口 | 物理分辨率 / 缩放 | DPR | 命中档 |
| --- | --- | --- | --- | --- |
| 低分笔记本、平板键盘模式 | 1366×768 | 1366×768 @100% | 1 | `xl` + `short` |
| **既有 E2E 视觉基线** | **1440×900** | 1440×900 / 2880×1800 @200% | 1 / 2 | `xl` |
| Windows 125% 缩放 | 1536×864 | 1920×1080 @125% | 1.25 | `xl` |
| FHD 桌面 | 1920×1080 | 1920×1080 | 1 | `xxl` |
| 2K / QHD | 2560×1440 | 2560×1440 / 5120×2880 | 1 / 2 | `xxl` |
| 4K UHD（缩放后） | 1920×1080 ~ 2560×1440 | 3840×2160 @150~200% | 1.5 / 2 | `xxl` |
| 分屏 / 半屏窗口 | 683~960 × 640~900 | — | — | `md` / `lg` + `short` |

`xxl` 档由 `.main-content` 现有的 `max-width:1600px` 限宽居中，不随分辨率无限拉宽表格。

### 2.2 平板（横竖屏都必须覆盖）

| 设备 | 竖屏 CSS | 横屏 CSS | 物理分辨率 | DPR | 竖/横命中档 |
| --- | --- | --- | --- | --- | --- |
| iPad mini / 旧 iPad | 768×1024 | 1024×768 | 1536×2048 | 2 | `md` / `lg` |
| iPad 10.2 / 10.9 | 810×1080 | 1080×810 | 1620×2160 / 1640×2360 | 2 | `md` / `lg` |
| iPad Air 11" | 820×1180 | 1180×820 | 1640×2360 | 2 | `md` / `lg` |
| iPad Pro 11" | 834×1194 | 1194×834 | 1668×2388 | 2 | `md` / `lg` |
| iPad Pro 12.9" | 1024×1366 | 1366×1024 | 2048×2732 | 2 | `lg` / `xl` |
| 安卓平板 10" | 800×1280 | 1280×800 | 1200×1920 / 1600×2560 | 1.5 / 2 | `md` / `xl` |
| 折叠屏展开内屏 | 717×1080 | 1080×717 | 1812×2176 | ~2.5 | `md` / `lg` |

平板关键特征：**竖屏宽度 768~834 恰好落在旧断点的最小档 900px 之下**，是此前完全未覆盖的空白区；横屏高度 768~834 会触发 `short` 高度档。

### 2.3 手机（竖屏 + 横屏）

| 设备 | 竖屏 CSS | 横屏 CSS | 物理分辨率 | DPR | 竖/横命中档 |
| --- | --- | --- | --- | --- | --- |
| 安卓小屏 / 入门机 | 360×800 | 800×360 | 1080×2400 | 3 | `xs` / `md` + `veryShort` |
| iPhone SE | 375×667 | 667×375 | 750×1334 | 2 | `xs` / `sm` + `veryShort` |
| 安卓主流 | 393×873 | 873×393 | 1080×2412 | ~2.7 | `xs` / `md` + `veryShort` |
| iPhone 13/14/15 | 390×844 | 844×390 | 1170×2532 | 3 | `xs` / `md` + `veryShort` |
| iPhone Pro Max | 430×932 | 932×430 | 1290×2796 | 3 | `xs` / `md` + `veryShort` |
| 安卓大屏 | 412×915 | 915×412 | 1440×3200 | ~3.5 | `xs` / `md` + `veryShort` |
| 折叠屏外屏 | 344×742 | 742×360 | 720×1680 / 948×2136 | 2~3 | `xs` / `sm` + `veryShort` |

手机横屏高度 **360~430px**，比旧的高度断点 720/800 矮一半以上：弹窗、底部操作条、分页器必须按 `veryShort` 单独收敛，否则「确定/取消」会被挤出可视区。

### 2.4 安全区、缩放与矮屏

- **安全区**：刘海机型竖屏 `top ≈ 47~59px`、`bottom ≈ 34px`；横屏 `left/right ≈ 44~59px`、`bottom ≈ 21~24px`。`index.html` 补 `viewport-fit=cover` 后用 `env(safe-area-inset-*)` 避让，作用于顶栏、抽屉、底部操作条、弹窗 footer。
- **动态工具栏**：移动端浏览器地址栏收起/展开会使 `100vh` 与实际可视高度不一致；布局容器沿用现有 `100dvh` 优先的写法（`global.css:18-21`），弹窗与固定底栏用 `100dvh` 口径。
- **系统字体/缩放**：不禁用缩放（不允许 `maximum-scale=1`、`user-scalable=no`）；断点按 CSS 像素而非物理像素，天然兼容 200% 缩放与 DPR 2/3。
- **矮屏场景**：手机横屏（≤500px 高）、1366×768 笔记本、`max-height:800px` 的分屏窗口共三类；`short=800` 用于弹窗与工作台紧凑，`veryShort=500` 用于手机横屏的底部操作条与分页收敛。

### 2.5 设备矩阵 → 代表巡检视口

自动化巡检取 16 个代表视口覆盖上述所有档位与横竖屏组合（`tests/responsive/fixtures/viewports.ts`，由 `breakpoints.spec.ts` 断言档位可复算、不漂移）：

`1366×768`、`1440×900`、`1920×1080`、`2560×1440`、`1366×640`（矮屏 PC）、`768×1024`（平板竖）、`1024×768`（平板横）、`1024×1366`（大平板竖）、`1366×1024`（大平板横）、`360×800`（小手机竖）、`390×844`（主流手机竖）、`430×932`（大手机竖）、`344×742`（折叠外屏竖）、`667×375`（小手机横，`sm` 档）、`844×390`（手机横）、`932×430`（大手机横）。

---

## 3. 统一断点分级表（单一真源）

**JS 侧**常量在 `src/constants/breakpoints.js`，**CSS 侧**字面量集中在 `src/styles/global.css` 顶部的断点注释块。CSS 自定义属性不能用于 `@media` 条件，故采用「同一份数值、两处书写」的双轨，由 `tests/responsive/breakpoints.spec.ts` 做一致性断言防止漂移。

| 档位 | 宽度区间（CSS px） | 典型设备 | 设备分类 | 导航 | 数据区 | 分栏 |
| --- | --- | --- | --- | --- | --- | --- |
| `xs` | `[0, 576)` | 手机竖屏、折叠外屏 | `phone` | 抽屉 | 卡片列表 | 单列 |
| `sm` | `[576, 768)` | 手机横屏、大屏手机 | `phone` | 抽屉 | 卡片列表 | 单列 |
| `md` | `[768, 1024)` | 平板竖屏、分屏窗口 | `tablet` | 图标侧栏（64px） | 表格 + 横向滚动 / 精简列 | 单列 |
| `lg` | `[1024, 1280)` | 平板横屏、小窗口 | `tablet` | 可折叠侧栏 | 表格 | 两列降级 |
| `xl` | `[1280, 1600)` | 1366/1440/1536 桌面 | `desktop` | 完整侧栏（200px） | 表格（现状不变） | 现状不变 |
| `xxl` | `≥1600` | 1920/2K/4K | `desktop` | 完整侧栏 | 表格 + 内容限宽 1600px 居中 | 现状不变 |

| 高度档 | 条件 | 处理 |
| --- | --- | --- |
| `short` | `max-height: 800px` | 弹窗 `margin-top:4vh`、工作台数字与卡片紧凑、抽屉内容区压缩（归并旧 720/800 两档） |
| `veryShort` | `max-height: 500px` | 手机横屏：底部操作条单行化、弹窗 body 更高占比、分页仅保留上下页、表格/卡片密度收紧 |

**设备分类口径**（`useBreakpoint` 导出）：

- `isPhone = width < 768`（`xs` + `sm`）→ **完整移动体验**：抽屉导航、卡片列表、折叠筛选、近全屏弹窗、底部操作条。
- `isTablet = 768 <= width < 1024`（`md`）→ 保留侧栏但自动折叠为图标栏；分栏降级、栅格重排、页签紧凑。
- `isDesktop = width >= 1024` → **桌面零回归**，DOM/样式/交互维持现状。
- `isMobile = width < 1024` → 非桌面统称，仅用于少量公共开关。
- `orientation` 由 `matchMedia('(orientation: landscape)')` 给出；横竖屏切换**不重排已输入的表单**（不销毁重建 DOM）。经 R4 核查本项目无图表库，不涉及图表重绘。

**与既有字面量的归并映射**

| 旧值 | 新归属 | 处理方式 |
| --- | --- | --- |
| `1440px` | `xl` 内 | `.grid-4/3` 降 2 列保留，改写为统一档注释下的规则 |
| `1280px` | `xl` 下边界 | padding / 顶栏间距、`OverviewPanel` 两列 |
| `1200px` | `lg` 内 | `.org-split` 单列、左右分栏配置降级 |
| `1100px` | `lg` 内 | padding、分页精简、`.metric-row` |
| `1024px` | `lg` 下边界 | `Login.vue` 品牌栏收起 |
| `900px` | `md` 内 | `HelpCenter` 抽屉近全屏 |
| `800px` / `720px` 高 | `short` | 统一为 800 一档，工作台紧凑规则并入 |
| 新 `768 / 576 / 500` | `xs/sm/veryShort` | 本次新增，覆盖手机与手机横屏 |

> **不使用 Element Plus `el-col` 的 `:xs/:sm/:md/:lg/:xl` props**：其内置断点是 `768/992/1200/1920`，与本文六档不一致，混用会产生两套口径。所有响应式分栏统一由本文的 CSS 断点 + `useBreakpoint` 分支实现。

---

## 4. 各档布局策略

| 部位 | 桌面 `xl/xxl` | 平板 `md/lg` | 手机 `xs/sm` |
| --- | --- | --- | --- |
| 侧栏 | 完整 200px / 手动折叠 64px | 自动折叠为 64px 图标栏，可临时展开 | 隐藏，改 `el-drawer` 抽屉，含遮罩与焦点管理 |
| 顶栏 | 现状 | 徽标与间距收紧，页签紧凑 | 汉堡入口 + 标题 + 主操作；**公司视角与岗位切换必须可达**（收纳进抽屉/账户面板） |
| 面包屑 / 页签 | 现状 | 单行省略 | 页签横向滚动、面包屑单行省略 |
| 筛选区 | inline 多列 | 两列 | 折叠面板，展开后单列全宽，label 上置 |
| 数据区 | `el-table`（列宽/fixed/权限原样） | `el-table` + 横向滚动 / 隐藏次要列 | `MobileRecordList` 卡片列表，与桌面表格互斥渲染 |
| 弹窗 | 固定 px 宽度（现状） | 限宽 + body 滚动 | 近全屏，`header/footer` 固定、`body` 独立滚动（沿用 P0 基线），确定/取消始终可见 |
| 分页 | 现状 | 隐藏每页条数/跳页 | 仅保留上下页与总数，贴底不遮挡卡片 |
| 主操作 | 页面内按钮 | 页面内按钮 | `MobileActionBar` 底部固定条，含安全区留白 |
| 触控 | — | — | 点击区域 ≥44px；`prefers-reduced-motion` 下关闭动效 |
| 图表 | 现状 | 无图表库，不适用 | 无图表库，不适用 |

**不可破坏的既有口径**：工作台「概览 → 行动条 → 待办」层级与 `wm:*` 权限收敛（待办只放卡片、`wm:overview` 区分领导/审批人）；顶栏公司视角含下级子树、页面公司筛选仅本级、两者可叠加；一人多岗时当前岗位定权限；卡片字段与状态标签必须与桌面表格一致；不新增任何调试浮标或尺寸指示器；可访问性基线（`:focus-visible`、图标按钮 `aria-label`、`installA11y` 的 label 关联）覆盖新增控件。

---

## 5. 分阶段适配规划（严格按序执行）

每个阶段结束必须通过该阶段门禁，未通过不进入下一阶段。

| 阶段 | 内容 | 交付物 | 阶段门禁 |
| --- | --- | --- | --- |
| **R0 设备与断点分析**（本文） | 盘点现状、设备矩阵、断点分级、规划 | `docs/responsive-adaptation.md`；`docs/design-system.md` §7/§8/§9 修订；`docs/qa/stage-gates.md` 追加 R 系列门禁 | 文档落盘且断点取值与 `breakpoints.js` 设计一致，旧「不做完整移动端」决策已删除 |
| **R1 断点基座** | `constants/breakpoints.js`、`composables/useBreakpoint.js`、`index.html` 补 `viewport-fit=cover`、`global.css` 顶部断点块与全局规则、`store/app.js` 设备态 | 单一真源常量 + 全局 CSS 规则（栅格、弹窗/抽屉、内联宽度、label、分页、安全区、触控） | 断点一致性断言通过；桌面 1440×900 smoke 无变化 |
| **R2 骨架与公共组件** | `SidebarMenu.vue`、`MobileNavDrawer.vue`、`MainLayout.vue`、`TagsView/AppBreadcrumb/HelpCenter` | 手机抽屉导航 + 精简顶栏；平板自动折叠 | 抽屉开合/焦点/遮罩断言；公司视角与岗位切换在手机可达；桌面 DOM 与截图无变化 |
| **R3 通用移动组件** | `MobileRecordList.vue`、`MobileFilterPanel.vue`、`MobileActionBar.vue` | 列配置 schema + 卡片/筛选/底部操作条 | 组件级断言；至少 1 个真实页面接入并跑通 |
| **R4 全量页面接入** | 按模块顺序：登录/403 → 工作台(含 4 panel) → 固定资产(含 2 非路由组件) → 低值资产 → 组织架构 → 系统管理 | 21 路由页 + `FixedAssetDocList`/`DocApprovalDialog` 全部接入 | 逐模块多视口巡检；`code-explorer` 覆盖清单核对无遗漏；桌面表格列/权限/深链逻辑未改 |
| **R5 多视口巡检** | `playwright.responsive.config.ts`、`tests/responsive/{viewports.ts,layout-matrix.spec.ts,breakpoints.spec.ts}`、根 `package.json` 加 `e2e:responsive` | 独立巡检 project + 设备矩阵断言 + 截图归档 | 16 视口 × 21 路由矩阵全绿；横竖屏切换稳定；截图写入 `e2e-artifacts/<runId>/` |
| **R6 回归与发布** | 桌面 1440×900 基线回归、`build-prod.ps1` 四道门禁、重建生产栈、文档收口 | 验收清单与证据 | 存量 E2E/单测/契约哈希全绿；生产健康 UP；§9 验收清单更新 |

> **R4 实施口径（2026-11-18 落地）**：全库共 60+ 个 `el-table`（含弹窗/抽屉内的明细与预览表），逐页手写卡片分支会重复且易漏。实际采用「全局 CSS 卡片化 + 列名注入」：`global.css` 仅在 `<=767px` 把 `.el-table` 的视觉排布转为卡片，`utils/responsiveTable.js`（沿用 `utils/a11y.js` 的 MutationObserver 全局增强模式）把表头文字注入 `data-table-label` 供 `::before` 显示字段名。桌面 DOM 与 CSS 完全不变，21 个路由页一次性全覆盖；行点击、选择、状态标签、权限按钮仍是原组件行为，不产生第二份列配置，也不改任何页面的业务逻辑。
> 通用组件同时保留真实接入范式：`SystemLog.vue` 用 `MobileRecordList` 做组件级卡片分支，`SystemParams.vue` 用 `MobileFilterPanel` + `MobileActionBar` 做折叠筛选与底部固定操作。两者与桌面分支互斥渲染，DOM 不翻倍。

---

## 6. 设备 × 页面验证矩阵

页面组（覆盖 21 个路由 + 4 个非路由业务组件）：

| 组 | 页面 | 重点断言 |
| --- | --- | --- |
| G1 | `/login`、`/403` | 表单单列全宽、提交按钮 ≥44px 且键盘弹出后可见；品牌栏按档收起 |
| G2 | `/workbench` + `OverviewPanel/TodoPanel/AlertPanel/MessagePanel` | 概览 4/2/1 列降级；层级与 `wm:*` 收敛；待办只放卡片；`calcTableHeight` 在卡片分支不产出 0 高度 |
| G3 | `/fixed-assets`、`/fixed-asset-reports`、`/fixed-asset-settings` + `FixedAssetDocList`、`DocApprovalDialog` | 操作列 330/380px 不外溢；1180px/960px 弹窗近全屏；详情抽屉 60% 限宽 |
| G4 | `/low-value-assets`、`/low-value-asset-reports`、`/low-value-asset-settings` | 1080px 弹窗近全屏；卡片字段与库存/状态口径一致 |
| G5 | `/system/company`、`/system/dept`、`/system/user`、`/system/role` | `.org-split` 单列降级；960px 用户弹窗；左右树 + 表格可操作 |
| G6 | `/system/dict`、`/log`、`/workflow`、`/params`、`/message-center`、`/message-template`、`/terminal`、`/data-import` | 向导导入步骤按钮可见；`WorkflowConfig` 左右分栏降级；列表卡片化 |

**统一断言项**（每档视口 × 每组页面）：

1. `document.documentElement.scrollWidth <= clientWidth + 1`（无横向溢出）。
2. 关键控件可见可点：主操作、查询/重置、分页上下页、抽屉入口。
3. 手机档显示卡片列表且不渲染 `el-table`；桌面/平板档显示 `el-table` 且不渲染卡片列表（互斥）。
4. 抽屉可打开、可关闭、遮罩存在、焦点回到触发按钮。
5. 弹窗 header/footer 固定，`确定/取消` 在视口内；`veryShort` 档同样成立。
6. 触控目标 ≥44px（手机档的按钮、页签、卡片操作）。
7. 横竖屏切换（`setViewportSize`）后无溢出、已输入表单值不丢失、无横向溢出。
8. 顶栏公司视角与岗位切换在手机档可达。
9. 桌面 `1440×900` 截图与既有基线一致（零回归）。

**巡检约束**：复用 `tests/e2e/fixtures/auth.ts` 的 `loginViaApi` + `seedSession`；只读导航与断言，**不清库、不写业务数据、不改权限矩阵、不建 `fams_e2e`**；串行 `workers:1` 访问生产形态 `http://localhost`；产物归档到 `e2e-artifacts/<runId>/`。

---

## 6.1 验收结论（2026-11-18）

| 项 | 结果 |
| --- | --- |
| 多视口巡检 | `npm run e2e:responsive` **24/24 全绿**：16 个代表视口各跑 21 条路由、4 条交互断言、4 条断点一致性断言 |
| 覆盖组合 | 16 视口 × 21 路由 = 336 次只读导航；另含抽屉开合/焦点、弹窗按钮可见、横竖屏切换、卡片与表格互斥、登录页按钮可见 |
| 桌面零回归 | `1440×900` 存量 E2E 子集 36/37 通过；唯一失败为 `/api/org-users?pageSize=500` 后端接口请求，非布局断言 |
| 构建与发布 | `build-prod.ps1` 四道门禁全绿（后端测试、前端单测、契约哈希、前端构建），生产栈重建后 `/api/health` UP |
| 实景补证 | `e2e-artifacts/live/`：手机工作台、导航抽屉（公司视角/权限菜单/退出）、卡片化列表（字段值、状态标签、操作按钮、底部操作条）、桌面参数页对比 |

**巡检中发现并修复的真实缺陷**（均由自动化断言或实景截图暴露，非纸面推断）：

1. `useBreakpoint` 首帧读取 `innerWidth` 时移动端 emulation / viewport meta 尚未解析完毕，偶发把手机判成桌面；补 `visualViewport` 监听 + 下一帧重读收敛。
2. EP 按所有列宽之和给表格容器写入 800+px inline width，卡片化后 `td` 仍按该宽度排版，右对齐的字段值被推到视口外裁掉；逐层压回 `100%` 宽度并把 `.cell` 的 flex basis 收为 `0%`。
3. `fixed="right"` 操作列的 sticky 偏移在卡片布局下未解除；补 `position: static` 并隐藏 EP 生成的 fixed 副本容器。
4. `.dict-layout`（`320px 1fr`）等页面级分栏在手机档未降级，整条父链被撑到 525px；补通用分栏单列降级与子项 `min-width: 0`。
5. 表格数据异步挂载导致列名注入偶发遗漏；注入器缩短节流并加下一帧补扫。

据此在巡检中加入**单元格几何可见性**断言（`getBoundingClientRect().right <= clientWidth`），因为仅检查 `textContent` 无法发现「文字仍在 DOM、但被裁到视口外」的缺陷。

---

## 7. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 逐页重写交互导致 224 条存量 E2E 大面积失败 | 桌面 DOM/class/权限/深链一律不动；移动分支用 `v-if="isPhone"` 新增，与桌面互斥；每阶段跑桌面 smoke |
| 双轨断点漂移 | 数值集中在 `breakpoints.js` 与 `global.css` 顶部注释块，`breakpoints.spec.ts` 断言一致 |
| 通用组件过度抽象 | 卡片列配置只覆盖共性；向导导入、盘点、左右分栏配置用 slot 扩展，不强行抽象 |
| 弹窗固定宽度 41 处逐改成本高 | 手机断点内用限定作用域的全局覆盖规则统一处理，不逐文件改 `width=` |
| 报表误用图表重绘钩子 | 经全库核查无 ECharts/图表库，不引入 resize 钩子；报表由统一断点栅格降级处理 |
| 抽屉/底部条遮挡内容 | 安全区 padding + 内容区 `padding-bottom` 预留；矮屏档单独收敛 |
