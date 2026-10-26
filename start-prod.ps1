$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host 'Ensuring MySQL80 service...'
$mysqlSvc = Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
if ($mysqlSvc -and ($mysqlSvc.Status -ne 'Running')) { Start-Service -Name 'MySQL80' -ErrorAction SilentlyContinue; Start-Sleep -Seconds 3 }
if (-not $mysqlSvc) { Write-Host 'WARN: MySQL80 service not found' } else { Write-Host 'MySQL is up.' }
$pids = netstat -ano | Select-String ':8080' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null; Write-Host ('killed 8080 ' + $p) }
Start-Sleep -Seconds 2
$java = 'java'
if ($env:JAVA_HOME) { $java = Join-Path $env:JAVA_HOME 'bin/java.exe' }
$jar = Join-Path $root 'fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar'
Write-Host ('Starting backend jar: ' + $jar)
Start-Process -FilePath $java -ArgumentList '-jar', $jar, '--spring.profiles.active=prod' -WorkingDirectory (Join-Path $root 'fams-backend') -WindowStyle Normal
$nginxDir = Join-Path $root 'deploy/nginx'
$nginx = Join-Path $nginxDir 'nginx.exe'
Write-Host 'Starting nginx'
Start-Process -FilePath $nginx -WorkingDirectory $nginxDir -WindowStyle Normal
Write-Host 'Done. Open https://localhost'
