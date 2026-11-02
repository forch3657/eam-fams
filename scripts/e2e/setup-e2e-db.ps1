# One-shot setup for the isolated E2E database (fams_e2e).
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/e2e/setup-e2e-db.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/e2e/setup-e2e-db.ps1 -AdminUser root
#   $env:MYSQL_ADMIN_PWD='...'; powershell ... -File scripts/e2e/setup-e2e-db.ps1   # non-interactive
#
# Steps:
#   1. ask for the MySQL admin password (never written to disk)
#   2. create fams_e2e + GRANT ALL to 'fams'@'127.0.0.1'
#   3. load db-baseline/e2e-baseline.sql as the application account
#   4. verify the app account can open fams_e2e
param(
    [string]$AdminUser = 'root',
    [string]$AdminHost = '127.0.0.1',
    [int]$Port = 3306
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))
$initSql = Join-Path $root 'scripts/e2e/init-e2e-db.sql'
$baseline = Join-Path $root 'db-baseline/e2e-baseline.sql'
if (-not (Test-Path $baseline)) { throw ('baseline missing: ' + $baseline + '  (run npm run e2e:db:dump)') }

$mysql = (Get-Command mysql -ErrorAction SilentlyContinue)
if (-not $mysql) { throw 'mysql client not found in PATH' }

$appUser = if ($env:DB_USER) { $env:DB_USER } else { 'fams' }
$appPwd = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'FamsDb@2026!' }
$dbName = if ($env:DB_TEST_NAME) { $env:DB_TEST_NAME } else { 'fams_e2e' }

# --- 1. admin password (masked input, or MYSQL_ADMIN_PWD for automation) ---
if ($env:MYSQL_ADMIN_PWD) {
    $adminPwd = $env:MYSQL_ADMIN_PWD
    Write-Host ('Using admin password from MYSQL_ADMIN_PWD for ' + $AdminUser + '@' + $AdminHost)
} else {
    $secure = Read-Host -AsSecureString ('MySQL admin password for ' + $AdminUser + '@' + $AdminHost)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $adminPwd = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

# Avoid --password=... on the command line: it leaks through the process list.
$env:MYSQL_PWD = $adminPwd

# --- 2. create database + grant ---
Write-Host ('[1/4] creating ' + $dbName + ' and granting to ' + $appUser + '@127.0.0.1 ...')
$initSqlPath = $initSql.Replace('\', '/')
& $mysql.Source --host=$AdminHost --port=$Port --user=$AdminUser --default-character-set=utf8mb4 `
    -e ("SOURCE " + $initSqlPath + ";")
if ($LASTEXITCODE -ne 0) { throw ('init failed with exit code ' + $LASTEXITCODE) }

# --- 3. load baseline as the application account ---
$env:MYSQL_PWD = $appPwd
Write-Host ('[2/4] loading baseline into ' + $dbName + ' ...')
$baselinePath = $baseline.Replace('\', '/')
& $mysql.Source --host=127.0.0.1 --port=$Port --user=$appUser --default-character-set=utf8mb4 `
    -e ("USE ``" + $dbName + "``; SOURCE " + $baselinePath + ";")
if ($LASTEXITCODE -ne 0) { throw ('baseline import failed with exit code ' + $LASTEXITCODE) }

# --- 4. verify ---
Write-Host '[3/4] verifying app account access ...'
& $mysql.Source --host=127.0.0.1 --port=$Port --user=$appUser --database=$dbName -N `
    -e "SELECT CONCAT('tables=', COUNT(*)) FROM information_schema.tables WHERE table_schema = DATABASE();"
if ($LASTEXITCODE -ne 0) { throw ('verify failed with exit code ' + $LASTEXITCODE) }

Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue
Write-Host '[4/4] OK e2e database ready'
Write-Host ('  database ' + $dbName + '  account ' + $appUser + '@127.0.0.1')
