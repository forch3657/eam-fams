# 资料来源与反向归纳映射

本 skill = 项目反向归纳（事实与裁决口径） + 业界公开实践（方法论校准）。冲突时以仓库现状与用户裁决为准，资料不覆盖口径。

## 一、业界资料（已核实链接）

| 资料 | 要点 | 在本 skill 中如何落地 |
| --- | --- | --- |
| Thariq Shihipar, *Lessons from building Claude Code: How we use skills*, Anthropic, 2026-06-03 — https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills | 内部数百个 skill 归为九类；「不要陈述显而易见的内容」；**Gotchas 是最高信号内容**；把整个文件夹当作上下文工程与渐进式披露；给出目标与约束而非逐步遥控（avoid railroading）；`description` 写给模型、描述何时触发、带触发词；优先提供脚本而不是让模型重写样板；用 config 文件承载环境相关设置；随使用持续追加踩坑 | `SKILL.md` 保持精简、第三人称触发式 description、资源导航表、按任务选路径而非固定脚本；`references/gotchas.md` 独立成篇并可追加；`scripts/preflight.mjs` 固化确定性检查 |
| *Skill authoring best practices*, Claude Platform — https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | 目录按领域组织便于发现；references 放详尽资料不占上下文；确定性操作优先写脚本；明确写出执行意图；MCP 工具用全限定名（本 skill 未使用 MCP） | `references/` 按架构/领域/交付/门禁/踩坑/来源分文件；脚本给出明确命令行与退出码 |
| *Agent Skills* 开放格式说明 — https://skill.md/ | skill 是含 `SKILL.md` 的文件夹，最少需要 `name`/`description`，可捆绑 scripts、references、assets | 目录结构与 frontmatter 遵循该格式 |
| 官方示例 skills — https://github.com/anthropics/skills ；文档 — https://code.claude.com/docs/en/skills | skill 的实例与配置参考（含 frontmatter 字段说明） | 结构对齐；本 skill 不引入额外 frontmatter 字段以保持兼容 |
| Martin Fowler, *Consumer-Driven Contracts: A Service Evolution Pattern* — https://martinfowler.com/articles/consumerDrivenContracts.html （中文版 https://martinfowler.com.cn/articles/consumerDrivenContracts.html） | 契约表达消费者期望，提供者在生命周期内断言这些期望；契约应以可重复的自动化方式在每次构建中被检查 | 契约单一真源 + 构建期漂移检查（见 `architecture.md`、`quality-gates.md`） |
| *Contract & Schema-First Design*, CodeSparring — https://www.codesparring.dev/learn/system-design/foundations/sd-l1-contract-design | 契约是机器可读 schema 而非 wiki 文档；从它生成 stub/校验/文档；附加式非破坏演进、tolerant reader、枚举闭集、显式类型；CI 中契约测试拦破坏性变更；协调成本按 N² 增长而契约测试按 N 增长 | `architecture.md` 的演进准则与「CI 拦漂移」；`delivery-workflow.md` 把契约写进分期规格 |
| Fowler, *Optimistic Offline Lock* (PoEAA catalog) — https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html | 业务事务跨多个系统事务时，靠提交前冲突检测 + 回滚防止丢失更新；校验与更新须在同一系统事务内 | `domain-invariants.md` 的 version/409 一节 |
| Chris Richardson, *Pattern: Saga*, microservices.io — https://microservices.io/patterns/data/saga.html | 长事务拆成一系列本地事务，失败靠补偿事务撤销；**缺乏隔离**，必须显式设计对策（如语义锁/待定状态） | `domain-invariants.md` 的派生单据独立事务、库存预占（语义锁思路）、完结失败不推翻终审 |

## 二、项目反向归纳映射

| 参考项目中的事实 | 抽象出的可复用模式 | 落在 skill 的哪里 |
| --- | --- | --- |
| `schema.js` → `export-contract.mjs` → 后端 `contract/*.json` → 通用引擎 | 契约单一真源，产物不可手改 | `architecture.md` §1；`gotchas.md` A-1 |
| `engine/` 一套通用 CRUD + `hook/` + 三个专用模块 | 元数据驱动引擎，差异用规则/Hook/专用模块注入 | `architecture.md` §2 |
| `services/index.js` 门面 + mock 种子实现同一套业务规则 | 双实现门面，mock 不做简化版业务 | `architecture.md` §3 |
| 权限树 + `check-permissions.mjs` + 构建入口接入 | 权限码是契约的一部分，构建期拦漂移 | `architecture.md` §4；`quality-gates.md` §1 |
| `DOC_IN_FLIGHT_STATUS` / 终态留痕 / 三种撤销统一 `REVOKED` | 在途与终态分离，动作码不扩状态枚举 | `domain-invariants.md` §2 |
| 低值 `stock/reserved` 三段结算、统计只算 `DONE` | 审批驱动库存，预占与结算幂等 | `domain-invariants.md` §3 |
| `ApproverResolver` 按归属部门解析、缺配置 400 点名到人 | 纵向审批，错误可诊断 | `domain-invariants.md` §4 |
| 盘点完结派生用 `REQUIRES_NEW`、送审前置预检 | 派生独立事务，前置阻断 / 完结不阻断 | `domain-invariants.md` §5-6 |
| `.codebuddy/plans/*.md` 固定段落 + 每期独立验收 | 分期计划即规格 | `delivery-workflow.md` §2 |
| `escaped-defects.md` 当天登记 + 负向断言 + 逃逸率 | 缺陷回灌成用例，形成闭环 | `delivery-workflow.md` §4 |
| `build-prod.ps1` 唯一入口 + CI 三 job + JaCoCo 阈值 | 门禁前置，禁止绕过 | `quality-gates.md` §1-2 |
| E2E 分期顺序、`E2E_` 前缀、禁止自动清库、人工清空重导 | 验收可重复且数据安全 | `quality-gates.md` §4-5 |
| `stop → build → start`、jar 锁 `target`、版本标记 | 部署产物必须与源码一致 | `quality-gates.md` §3 |
| CSV BOM、`.ps1` ASCII-only、UTF-16LE、Node 不在 PATH、DML only | Windows 环境的防错约定 | `quality-gates.md` §6-7；`gotchas.md` E 组 |
| 老系统审计发现明文口令、零鉴权、captcha 未校验、登出 token 不失效、硬编码 Key、模板 SDK 残留 | 新系统必须一次做对的安全底线 | `domain-invariants.md` §9；`gotchas.md` C 组 |

## 三、业界通行但本项目未采用（不要生搬硬套）

- **Pact 式消费者驱动契约测试**：本项目前后端同仓、同一份 schema 生成，改用构建期静态漂移检查。多团队独立部署时才需要 Pact。
- **完整 Saga / 补偿事务 / Transactional Outbox**：本项目单库，用本地事务 + 独立事务派生 + 状态预占即可；不要为「看起来先进」引入消息编排。
- **Database per Service / 微服务拆分**：未采用，不要按服务边界拆库或拆 Controller。
- **Protobuf / GraphQL SDL / OpenAPI 作为契约格式**：本项目用前端 JS schema 导出 JSON，格式不重要，「单一真源 + CI 校验」才是核心。
- **完整 DDD / CQRS / Event Sourcing**：未采用；单据状态机与审批轨迹已满足审计需要。
- **自动化浏览器 E2E 作为每次改动的默认动作**：用户明确偏好日常改动手动点测，仅里程碑跑自动化。资料中的 verification skill 思路只在用户要求时启用。

## 四、使用原则

资料用于校准判断、解释「为什么这样定」，不作为改动现有口径的依据。任何与 `domain-invariants.md` 冲突的资料（例如「状态可以随意扩展编码」），以用户裁决和仓库现状为准；要改口径先走裁决流程。
