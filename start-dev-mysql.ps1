$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# 0) 确保本机 MySQL 服务已启动（后端 dev profile 连 127.0.0.1:3306/fams）
Write-Host 'Checking MySQL service (MySQL80) on port 3306...'
$mysqlUp = netstat -ano | Select-String ':3306' | Select-String 'LISTENING'
if (-not $mysqlUp) {
    Write-Host '  MySQL not listening. Trying to start service MySQL80 (needs Administrator)...'
    try {
        Start-Service -Name 'MySQL80' -ErrorAction Stop
        Start-Sleep -Seconds 3
        Write-Host '  MySQL80 started.'
    } catch {
        Write-Host '  [WARN] Could not auto-start MySQL80. Start it manually (services.msc, or `net start MySQL80` as Admin), then re-run this script.'
    }
} else {
    Write-Host '  MySQL is up.'
}

# 1) 定位内置 Node（给前端用，本机未配全局 PATH 时用）
$nodeBase = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
$nodeDir = Get-ChildItem -Directory $nodeBase -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
if (-not $nodeDir) {
    Write-Host '[ERROR] Bundled Node not found:' $nodeBase
    Write-Host '        Please install Node under .workbuddy, or add node to PATH, then retry.'
    Read-Host 'Press Enter to exit'
    exit 1
}
$env:Path = "$nodeDir;$env:Path"

# 2) 启动后端（dev profile = MySQL 模式）与前端
Write-Host 'Starting backend (mvn spring-boot:run -Dspring-boot.run.profiles=dev) and frontend (npm run dev)...'

# 后端：dev profile 连 MySQL。数据库/账号在 application-dev.yml 中：
#   url      = jdbc:mysql://127.0.0.1:3306/fams?...
#   username = root
#   password = 123456   （默认值；改密码请直接改 application-dev.yml，
#                        不要用 `mvn -DDB_PASSWORD=xxx`，spring-boot:run 会 fork 新 JVM 导致 -D 不透传）
Start-Process -FilePath 'mvn.cmd' -ArgumentList 'spring-boot:run', '-Dspring-boot.run.profiles=dev' -WorkingDirectory (Join-Path $root 'fams-backend') -WindowStyle Normal
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory (Join-Path $root 'fams-frontend') -WindowStyle Normal

Write-Host 'Done. Backend on MySQL needs ~20-40s (first run downloads deps).'
Write-Host 'DB: mysql://127.0.0.1:3306/fams   user=root   password=123456'
Write-Host 'Open http://localhost:5174 after the backend window shows "Started".'
Write-Host 'NOTE: The `fams` database must already exist with schema+data loaded (see README section 2).'
