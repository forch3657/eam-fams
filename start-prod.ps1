$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host 'Ensuring MySQL80 service...'
$mysqlSvc = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
if ($mysqlSvc -and ($mysqlSvc.Status -ne 'Running')) { Start-Service -Name 'MySQL80' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }
if (-not $mysqlSvc) { Write-Host 'WARN: MySQL80 service not found' } else { Write-Host 'MySQL is up.' }
$pids = netstat -ano | Select-String ':8080' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null; Write-Host ('killed 8080 ' + $p) }
Start-Sleep -Seconds 2
# 生产 JWT 密钥：本地未提交文件读取；缺失则生成强随机密钥并持久化
# （避免每次重启令已签发令牌失效，且密钥不上库，由 .gitignore 排除）
$secretDir = Join-Path $root 'deploy/.secrets'
$secretFile = Join-Path $secretDir 'jwt-secret'
if (-not (Test-Path $secretFile)) {
    if (-not (Test-Path $secretDir)) { New-Item -ItemType Directory -Path $secretDir -Force | Out-Null }
    $bytes = New-Object byte[] 48
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $hex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    Set-Content -Path $secretFile -Value $hex -Encoding ASCII
    Write-Host 'Generated new JWT_SECRET (persisted locally, not committed)'
}
$env:JWT_SECRET = (Get-Content -Path $secretFile -Raw).Trim()
$java = 'java'
if ($env:JAVA_HOME) { $java = Join-Path $env:JAVA_HOME 'bin/java.exe' }
$jar = Join-Path $root 'fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar'
Write-Host ('Starting backend jar: ' + $jar)
Start-Process -FilePath $java -ArgumentList '-jar', $jar, '--spring.profiles.active=prod' -WorkingDirectory (Join-Path $root 'fams-backend') -WindowStyle Normal
$nginxDir = Join-Path $root 'deploy/nginx'
$nginx = Join-Path $nginxDir 'nginx.exe'
# 先强制结束所有已有 nginx 进程，再起一个干净的实例（避免依赖 pid 文件导致停不干净、多实例堆积）
Get-Process -Name nginx -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-Host 'Starting nginx'
Start-Process -FilePath $nginx -WorkingDirectory $nginxDir -WindowStyle Normal
Write-Host 'Done. Open https://localhost'
