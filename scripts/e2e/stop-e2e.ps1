# Stop the isolated E2E stack. Only touches ports 18080 and 4173.
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
$ErrorActionPreference = 'Continue'
foreach ($port in 18080, 4173) {
    # \s after the port so 4173 does not match 41730.
    $pids = netstat -ano | Select-String (':' + $port + '\s') | Select-String 'LISTENING' |
        ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
    if (-not $pids) { Write-Host ('no listener on ' + $port); continue }
    foreach ($p in $pids) {
        taskkill /PID $p /T /F 2>$null | Out-Null
        Write-Host ('killed ' + $port + ' pid ' + $p)
    }
}
Write-Host 'e2e stack stopped'
