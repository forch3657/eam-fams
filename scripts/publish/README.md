# 仓库发布脚本（sync-repos）

把本地 monorepo 的代码**单向发布**到三处：GitHub `origin/main`、内网后端仓 `EamFamsSv`、内网前端仓 `EamFamsWeb`。

## 模型

| 角色 | 仓库 | 分支 | 说明 |
|---|---|---|---|
| 唯一开发源 | `F:/work/EAM-FAMS`（本地 monorepo） | `main` | 日常只在这里改代码 |
| 归档 | GitHub `forch3657/eam-fams.git` | `main` | 保留完整提交历史 |
| 交付产物 | 内网 `EamFamsSv.git` | `fams-import-20261112` | 后端仓，含 `deploy-kit/` |
| 交付产物 | 内网 `EamFamsWeb.git` | `fams-import-20261112` | 前端仓 |

内网两个仓是**拆分结构**（各自以 `fams-backend/` / `fams-frontend/` 的内容为根），
不是 monorepo，因此不能用 `git remote add` 直接推。脚本按目录做文件级快照同步。

## 用法

```powershell
# 1) 先提交本地改动（必须）
git add -A; git commit -m "feat: xxx"

# 2) 预览（默认，不推任何东西）
powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1

# 3) 确认计划后真正发布
powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1 -Apply -Message "feat: xxx"
```

| 参数 | 作用 |
|---|---|
| `-Apply` | 真正推送；不带则只做 dry-run |
| `-Message "..."` | 内网仓同步提交的说明（提交形如 `sync: <根仓短hash> <说明>`） |
| `-Only backend` / `-Only frontend` | 只发布某一个内网仓 |
| `-SkipGitHub` | 跳过 GitHub 推送，只发内网两仓 |

## 前置条件

- hosts 已映射 `172.21.21.203  git.ds.fidt`，且能访问内网 GitLab。
- Git 凭据管理器已保存内网与 GitHub 的凭据（首次 `git ls-remote` 弹窗输入，之后自动）。
- 内网 GitLab 使用自签证书，配置里 `sslVerify: false`；长期建议把公司根证书导入系统信任库后改为 `true`。
- **本地已跟踪文件必须全部提交**：`-Apply` 时会检查，有未提交的已跟踪改动会直接中止，
  否则 GitHub 推的是旧内容、内网同步的是新内容，两者不一致。
- 未跟踪的新文件会被同步（快照语义），但不会推到 GitHub；所以新文件请先 `git add` + `commit`。

## 配置文件

`sync-repos.config.json`（与脚本同目录），关键项：

| 项 | 说明 |
|---|---|
| `cacheDir` | 本地缓存目录，脚本会 clone/fetch 两个内网仓到这里（已被根 `.gitignore` 排除） |
| `rootBranch` / `githubRemote` | GitHub 推送目标 |
| `sslVerify` | 内网自签证书时设 `false` |
| `targets[].branch` | 内网仓推送分支。**当前是 `fams-import-20261112`，不是受保护的 `master`** |
| `targets[].keepInTarget` | 目标仓中永不删除的目录（后端仓的 `deploy-kit/`） |
| `targets[].mirrors` | 从根目录同步到 `deploy-kit/` 的文件（见下） |
| `excludeDirs` / `excludeFiles` | 同步时排除的产物与本地文件（`node_modules/`、`target/`、`dist/`、`.env`、`*.log`） |
| `forbidden` | 敏感文件名模式，命中即中止（私钥、JWT 密钥、DB 管理员口令、nginx.exe、日志） |
| `protectedInTarget` | 删除清单命中这些前缀时中止，防止源清单不完整误删交接文档 |

`master` 放开权限后，把两处 `branch` 改成 `master` 即可，脚本本身不硬编码分支。

## 安全机制

1. **默认 dry-run**，不写远端；`-Apply` 才推。
2. 失败即停：GitHub 推失败时**不会**继续推内网仓；任一内网仓失败立即中止。
3. 双重敏感文件拦截：同步前扫描源目录、提交前检查暂存清单，命中 `forbidden` 直接抛错。
4. `deploy-kit/` 只做增量镜像更新，永不整体删除；`README.md` / `.gitignore` 也在删除保护名单。
5. 删除清单会在计划阶段逐条列出，先看到"哪些文件会从内网仓移除"。
6. 无变更自动跳过，不产生空提交；全程不使用 `--force`。

## 维护缺口（重要）

`deploy-kit/` 是**交付适配版**，以下文件不会被脚本自动覆盖，改动后需手工同步到内网后端仓：

| 文件 | 原因 |
|---|---|
| `deploy/nginx/conf/nginx.conf` | 交付版改成了相对路径、只保留 HTTP 80（本地版是绝对路径 + 443） |
| `deploy/nginx/conf/nginx.conf.https.example` | 交付专用示例，本地没有 |
| `start-prod.bat` | 交付版把访问提示改成了 `http://localhost/` |
| `deploy-kit/README.md`、`deploy/certs/README.md` | 交付专用说明，本地没有 |

`mirrors` 已配置自动同步的安全文件：`build-prod.ps1`、`start-prod.ps1`、
`stop-prod.ps1`、`stop-prod.bat`、`deploy/sql/mysql/schema.sql`、
`deploy/sql/mysql/baseline-data.sql`、`docs/deployment.md`。
即本地改了建库 SQL 或部署手册，跑脚本会自动更新 `deploy-kit/` 里的副本。

> 特别注意：改了 `deploy/sql/mysql/schema.sql` 的表结构后务必跑一次发布，
> 否则接手方按 `deploy-kit` 里的旧 SQL 建库会缺表。

## 故障处理

- **clone/fetch 报 `SSL certificate problem`**：确认 `sslVerify: false`；长期请导入公司 CA 证书。
- **报 `Authentication failed`**：凭据管理器里的内网口令可能过期，运行
  `git ls-remote https://git.ds.fidt/im/third-party/EamFamsSv.git` 触发重新输入。
- **报 `pull failed ... inspect the cache`**：缓存仓有本地改动或历史分叉。
  备份后删除 `.publish-cache/<name>` 目录，脚本会重新 clone。
- **报 `protected files` 或 `Forbidden files staged`**：不要绕过，先检查源目录与配置；
  触发通常意味着本地文件被误删，或混入了凭据文件。
- **GitHub 推送失败**：内网仓不会被改动，处理完网络/凭据后重跑即可（脚本幂等，无变更会跳过）。

## 这个脚本不做的事

- 不合并 MR、不推 `master`、不强推。
- 不同步 E2E、CI、演示数据表格等非部署资产。
- 不做双向同步：内网仓被视为交付产物，**不要在上面直接改代码**，下次发布会被覆盖。
