# Start the isolated E2E stack: backend on 18080 + vite preview on 4173.
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/e2e/start-e2e.ps1
# Stop:   scripts/e2e/stop-e2e.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))

# npm/node may be absent from PATH (this machine ships node via workbuddy).
# Resolve npm.cmd to a full path: Start-Process does not always honour PATH
# lookups here (a broken shim earlier in PATH makes it fail with exit 1 and no log).
$nodeBin = $null
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $nodeRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
    if (Test-Path $nodeRoot) {
        $latest = Get-ChildItem -Path $nodeRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($latest) { $nodeBin = $latest.FullName; $env:Path = $nodeBin + ';' + $env:Path }
    }
}
$npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (-not $npmCmd -and $nodeBin) {
    $candidate = Join-Path $nodeBin 'npm.cmd'
    if (Test-Path $candidate) { $npmCmd = $candidate }
}
if (-not $npmCmd) { Write-Host 'X npm.cmd not found (install Node or set PATH)'; exit 1 }
Write-Host ('Using npm: ' + $npmCmd)

# --- 1. fams_e2e must exist (never fall back to the production database) ---
$mysql = (Get-Command mysql -ErrorAction SilentlyContinue)
if (-not $mysql) { Write-Host 'X mysql client not found in PATH'; exit 1 }
$dbUser = if ($env:DB_USER) { $env:DB_USER } else { 'fams' }
$dbPwd = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'FamsDb@2026!' }
$dbName = if ($env:DB_TEST_NAME) { $env:DB_TEST_NAME } else { 'fams_e2e' }
# MYSQL_PWD instead of --password: keeps the credential out of the process list.
$env:MYSQL_PWD = $dbPwd
& $mysql.Source --host=127.0.0.1 --port=3306 --user=$dbUser --database=$dbName -e "SELECT 1" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ('X database ' + $dbName + ' is not reachable. Run scripts/e2e/init-e2e-db.sql as MySQL admin first.')
    exit 1
}

# --- 2. stop leftovers (only 18080 / 4173, never 8080) ---
# Pattern ends with \s so 4173 never matches 41730 / 41731.
foreach ($port in 18080, 4173) {
    $pids = netstat -ano | Select-String (':' + $port + '\s') | Select-String 'LISTENING' |
        ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null | Out-Null }
}
Start-Sleep -Seconds 1

# --- 3. JWT secret (shared with prod so the same token format is used) ---
$secretDir = Join-Path $root 'deploy/.secrets'
$secretFile = Join-Path $secretDir 'jwt-secret'
if (-not (Test-Path $secretFile)) {
    if (-not (Test-Path $secretDir)) { New-Item -ItemType Directory -Path $secretDir -Force | Out-Null }
    $bytes = New-Object byte[] 48
    (New-Object System.Security.Cryptography.RNGCryptoServiceProvider).GetBytes($bytes)
    $hex = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    Set-Content -Path $secretFile -Value $hex -Encoding ASCII
}
$env:JWT_SECRET = (Get-Content -Path $secretFile -Raw).Trim()
$env:VITE_PROXY_TARGET = 'http://127.0.0.1:18080'
$env:SERVER_PORT = '18080'

# --- 4. backend jar ---
$jar = Join-Path $root 'fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { Write-Host ('X jar missing: ' + $jar + '  (run build-prod.ps1 first)'); exit 1 }
$java = 'java'
if ($env:JAVA_HOME) { $java = Join-Path $env:JAVA_HOME 'bin/java.exe' }

# The e2e profile file lives in src/main/resources. A jar built before the profile
# was added does NOT contain it, and Spring would then fall back to application.yml
# (profile h2, port 8080) -> either binds production or dies on a port clash.
# Passing the resources directory as an additional config location keeps this
# script working with an older jar, while remaining harmless once the jar includes it.
$resDir = Join-Path $root 'fams-backend/src/main/resources'
$e2eYml = Join-Path $resDir 'application-e2e.yml'
if (-not (Test-Path $e2eYml)) { Write-Host ('X missing e2e profile: ' + $e2eYml); exit 1 }
$configArg = '--spring.config.additional-location=file:' + ($resDir.Replace('\', '/')) + '/'

$logDir = Join-Path $root 'e2e-artifacts/logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$beLog = Join-Path $logDir 'backend.log'
$beErr = Join-Path $logDir 'backend.err.log'

Write-Host ('Starting backend e2e profile: ' + $jar)
Start-Process -FilePath $java `
    -ArgumentList '-jar', $jar, '--spring.profiles.active=e2e', $configArg `
    -WorkingDirectory (Join-Path $root 'fams-backend') -WindowStyle Hidden `
    -RedirectStandardOutput $beLog -RedirectStandardError $beErr

$backendOk = $false
for ($i = 0; $i -lt 90; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:18080/api/health' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $backendOk = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $backendOk) {
    Write-Host 'X backend did not become healthy on 18080. Last backend log lines:'
    if (Test-Path $beLog) { Get-Content $beLog -Tail 30 | ForEach-Object { Write-Host ('  ' + $_) } }
    if (Test-Path $beErr) { Get-Content $beErr -Tail 30 | ForEach-Object { Write-Host ('  ' + $_) } }
    exit 1
}
Write-Host 'Backend healthy on http://127.0.0.1:18080'

# --- 5. frontend preview (serves dist, proxies /api to 18080) ---
$fe = Join-Path $root 'fams-frontend'
$feLog = Join-Path $logDir 'preview.log'
Write-Host 'Starting vite preview on 127.0.0.1:4173'
# --host 127.0.0.1 is required: without it vite preview binds to "localhost",
# which resolves to ::1 on this machine and makes http://127.0.0.1:4173 refuse
# connections -- the stack would look broken even though preview is running.
Start-Process -FilePath $npmCmd -ArgumentList 'run', 'preview', '--', '--port', '4173', '--strictPort', '--host', '127.0.0.1' `
    -WorkingDirectory $fe -WindowStyle Hidden `
    -RedirectStandardOutput $feLog -RedirectStandardError (Join-Path $logDir 'preview.err.log')

$frontOk = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $frontOk = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
}
if (-not $frontOk) {
    Write-Host 'X vite preview did not start on 4173. Last preview log lines:'
    if (Test-Path $feLog) { Get-Content $feLog -Tail 20 | ForEach-Object { Write-Host ('  ' + $_) } }
    $feErr = Join-Path $logDir 'preview.err.log'
    if (Test-Path $feErr) { Get-Content $feErr -Tail 20 | ForEach-Object { Write-Host ('  ' + $_) } }
    exit 1
}

# version.txt proves the served dist is a build produced by vite.config.js's
# buildVersionPlugin; SMK-05 asserts it equals the meta tag in index.html.
try {
    $ver = (Invoke-WebRequest -Uri 'http://127.0.0.1:4173/version.txt' -UseBasicParsing -TimeoutSec 3).Content.Trim()
    Write-Host ('Frontend build version: ' + $ver)
} catch {
    Write-Host '! version.txt missing on 4173 (dist built before the version plugin?)'
}

Write-Host ''
Write-Host 'E2E stack ready:'
Write-Host '  app      http://127.0.0.1:4173'
Write-Host '  api      http://127.0.0.1:18080/api'
Write-Host ('  database ' + $dbName)
