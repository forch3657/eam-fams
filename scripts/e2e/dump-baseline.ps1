# Dump the production schema+data as the E2E baseline snapshot.
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/e2e/dump-baseline.ps1
# Output: db-baseline/e2e-baseline.sql
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))
$outDir = Join-Path $root 'db-baseline'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
$out = Join-Path $outDir 'e2e-baseline.sql'

$mysqldump = (Get-Command mysqldump -ErrorAction SilentlyContinue)
if (-not $mysqldump) { throw 'mysqldump not found in PATH' }

$user = if ($env:DB_USER) { $env:DB_USER } else { 'fams' }
$pwd = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'FamsDb@2026!' }
$db = if ($env:DB_NAME) { $env:DB_NAME } else { 'fams' }

Write-Host ("Dumping " + $db + " -> " + $out)
& $mysqldump.Source --host=127.0.0.1 --port=3306 --user=$user "--password=$pwd" `
    --default-character-set=utf8mb4 --single-transaction --no-tablespaces --skip-lock-tables `
    --set-gtid-purged=OFF --skip-triggers --skip-routines --add-drop-table `
    --result-file=$out $db
if ($LASTEXITCODE -ne 0) { throw ("mysqldump failed with exit code " + $LASTEXITCODE) }

$size = (Get-Item $out).Length
Write-Host ("OK baseline written, " + [math]::Round($size / 1KB, 1) + " KB")
