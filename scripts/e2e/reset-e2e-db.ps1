# Reset fams_e2e from the baseline snapshot (fast, repeatable).
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/e2e/reset-e2e-db.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))
$baseline = Join-Path $root 'db-baseline/e2e-baseline.sql'
if (-not (Test-Path $baseline)) { throw ('baseline missing: ' + $baseline + '  (run dump-baseline.ps1 first)') }

$mysql = (Get-Command mysql -ErrorAction SilentlyContinue)
if (-not $mysql) { throw 'mysql client not found in PATH' }

$user = if ($env:DB_USER) { $env:DB_USER } else { 'fams' }
$pwd = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'FamsDb@2026!' }
$db = if ($env:DB_TEST_NAME) { $env:DB_TEST_NAME } else { 'fams_e2e' }

# MySQL on Windows has no access to PowerShell's '<' redirection; USE + SOURCE is the portable way.
# Paths must use forward slashes inside the SOURCE statement.
$baselineSqlPath = $baseline.Replace('\', '/')

Write-Host ('Resetting ' + $db + ' from baseline...')
# MYSQL_PWD instead of --password: keeps the credential out of the process list.
$env:MYSQL_PWD = $pwd
& $mysql.Source --host=127.0.0.1 --port=3306 --user=$user --default-character-set=utf8mb4 `
    -e ("DROP DATABASE IF EXISTS ``" + $db + "``; CREATE DATABASE ``" + $db + "`` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci; USE ``" + $db + "``; SOURCE " + $baselineSqlPath + ";")
if ($LASTEXITCODE -ne 0) { throw ("reset failed with exit code " + $LASTEXITCODE) }

& $mysql.Source --host=127.0.0.1 --port=3306 --user=$user --database=$db -N `
    -e "SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.tables WHERE table_schema = DATABASE();"
if ($LASTEXITCODE -ne 0) { throw ("verify failed with exit code " + $LASTEXITCODE) }
Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
Write-Host 'OK database reset'
