# contract-driven-enterprise-app

一个可复用、可分发的开发 skill：把 `EAM-FAMS`（经营性资产管理系统）反向归纳出的工程规约，结合业界公开的权威实践，固化成 AI 编码助手在这类项目中可直接加载的知识与工作流。

**不是**项目文档副本，**不是**代码生成器。它回答的是：改一个字段应该先动哪个文件、状态与库存由谁结算、审批链怎么解析、分期怎么验收、发布前必须过哪些门禁、以及那些「测试全绿但数据悄悄错了」的坑。

## 归纳来源

对 `f:/work/EAM-FAMS` 全仓反向梳理，提炼出 8 个可迁移环节：

1. 前端 `schema.js` 作为契约单一真源，脚本导出 JSON 给后端通用引擎
2. 元数据驱动通用 CRUD（Controller/Service/Mapper/SqlProvider + Hook + 少量专用模块）
3. mock / api 双实现共用同一门面，环境变量切换
4. 横切不变量显式化（RBAC + 数据范围、状态机、纵向审批、库存三段、乐观锁）
5. `.codebuddy/plans/*.md` 分期计划即规格，每期独立验收
6. 唯一构建入口 + CI 三 job + 覆盖率阈值 + 权限漂移检查 + E2E 分期
7. 逃逸缺陷台账与回灌规则
8. 编码、权限、部署方面的防错约定

外部资料用于校准判断，逐条出处与映射见 `references/sources.md`。

## 目录

```
contract-driven-enterprise-app/
├── SKILL.md                      必需：frontmatter + 工作流 + 资源导航（<5k words）
├── README.md                     本文件，面向人的安装与维护说明
├── references/                   按需加载的详细知识
│   ├── architecture.md
│   ├── domain-invariants.md
│   ├── delivery-workflow.md
│   ├── quality-gates.md
│   ├── gotchas.md
│   └── sources.md
├── assets/                       输出用模板
│   ├── phase-plan-template.md
│   ├── acceptance-checklist.md
│   ├── defect-ledger-template.md
│   └── preflight-config.example.json
└── scripts/
    └── preflight.mjs             发布前静态门禁（Node 18+，零依赖，只读）
```

## 安装

本文件夹自包含，可整体拷贝或压缩分发。要让 CodeBuddy / Claude Code 自动发现，放到 skills 目录：

- 项目级（团队共享）：`<仓库>/.codebuddy/skills/contract-driven-enterprise-app/`
- 用户级（跨项目）：`~/.codebuddy/skills/contract-driven-enterprise-app/`

PowerShell 一键安装到当前项目：

```powershell
Copy-Item -Recurse -Force 'f:\work\EAM-FAMS\skills\contract-driven-enterprise-app' 'f:\work\EAM-FAMS\.codebuddy\skills\contract-driven-enterprise-app'
```

安装后由 `SKILL.md` 的 `description` 决定触发；无需注册，也不改动现有前后端代码。

## 使用

- 直接提出这类需求即会自动触发：新增台账字段、改审批链、改在途口径、写分期计划、做后端交付验收、发布前检查。
- 也可显式要求「按 contract-driven-enterprise-app 的规约做」。
- 首次在新仓库使用时，先确认架构同构（契约导出 + 通用引擎 + 前后端分离）；不同构的项目只取用 `domain-invariants.md` 与 `delivery-workflow.md` 的判断准则，不要照搬路径与命令。

手动跑静态门禁（本机 Node 不在 PATH，使用预装运行时）：

```powershell
$node = "$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2-6\node.exe"
& $node 'f:\work\EAM-FAMS\skills\contract-driven-enterprise-app\scripts\preflight.mjs' --root 'f:\work\EAM-FAMS'
```

退出码 0 表示无 ERROR；WARN 需人工判断；`--json` 供 CI 消费；`--config` 指向 `assets/preflight-config.example.json` 的副本以适配其它仓库。

## 维护

- 出现新的非显然失败点 → 追加 `references/gotchas.md`，按「现象 → 根因 → 处理」写。
- 出现新的业务口径裁决 → 更新 `references/domain-invariants.md`，注明日期与理由。
- 不要把模型本来就会的常识、也不要把整个项目文档复制进 SKILL.md；细节一律放 `references/`，按需加载。
- 分发前可用 skill-creator 的 `package_skill.py` 校验 frontmatter 与目录结构（需 Python 3；本机若无 Python，手工核对 `name`/`description` 即可）。
