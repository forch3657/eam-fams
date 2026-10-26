$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$nginxDir = Join-Path $root 'deploy/nginx'

Write-Host 'Stopping nginx...'
& (Join-Path $nginxDir 'nginx.exe') -s stop 2>$null
Start-Sleep -Seconds 1

$pids = netstat -ano | Select-String ':8080' | Select-String 'LISTENING' | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
if ($pids) { foreach ($p in $pids) { taskkill /PID $p /T /F 2>$null; Write-Host ("killed 8080 pid " + $p) } } else { Write-Host 'no 8080 listener' }
Write-Host 'done'
