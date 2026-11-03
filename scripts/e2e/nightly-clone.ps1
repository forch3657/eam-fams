# Nightly data-shape regression on a read-only clone of the production database.
# ASCII-only: PowerShell 5.1 reads .ps1 without BOM as ANSI.
#
# Why: P2-3 requires running L4 (real data shapes) nightly WITHOUT touching the
# production database. This script dumps prod with --single-transaction, loads it
# into a throwaway clone (fams_nightly), boots the isolated E2E stack on
# 18080/4173 against that clone, runs the L4 specs, and writes a quality brief.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/e2e/nightly-clone.ps1
#   powershell ... -nightly-clone.ps1 -SkipClone          # reuse existing clone
#   $env:MYSQL_ADMIN_PWD='...'; powershell ...            # non-interactive admin pwd
#
# Prerequisites: mysql/mysqldump in PATH, fams-backend jar built (build-prod.ps1),
# fams-frontend dist built. Ports 18080/4173 must be free; 80/8080 are untouched.
param(
    [string]$ProdDb = $(if ($env:DB_NAME) { $env:DB_NAME } else { 'fams' }),
    [string]$CloneDb = 'fams_nightly',
    [string]$AdminUser = 'root',
    [string]$AdminHost = '127.0.0.1',
    [int]$Port = 3306,
    [switch]$SkipClone,
    [switch]$SkipStackStop
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition))
$scriptsDir = Join-Path $root 'scripts/e2e'
$runId = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$outDir = Join-Path $root ('e2e-artifacts/nightly/' + $runId)
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

# node/npm are usually absent from PATH on this machine (workbuddy ships them)
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    $nodeRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
    if (Test-Path $nodeRoot) {
        $latest = Get-ChildItem -Path $nodeRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($latest) { $env:Path = $latest.FullName + ';' + $env:Path }
    }
}

$mysql = (Get-Command mysql -ErrorAction SilentlyContinue)
$mysqldump = (Get-Command mysqldump -ErrorAction SilentlyContinue)
if (-not $mysql) { throw 'mysql client not found in PATH' }
if (-not $mysqldump) { throw 'mysqldump not found in PATH' }

$jar = Join-Path $root 'fams-backend/target/fams-backend-1.0.0-SNAPSHOT.jar'
if (-not (Test-Path $jar)) { throw ('jar missing: ' + $jar + '  (run build-prod.ps1 first)') }
$distIndex = Join-Path $root 'fams-frontend/dist/index.html'
if (-not (Test-Path $distIndex)) { throw ('dist missing: ' + $distIndex + '  (run build-prod.ps1 first)') }

$appUser = if ($env:DB_USER) { $env:DB_USER } else { 'fams' }
$appPwd = if ($env:DB_PASSWORD) { $env:DB_PASSWORD } else { 'FamsDb@2026!' }
# The application account only has DML; creating/dropping the clone needs an admin.
# Keep the password in MYSQL_ADMIN_PWD for unattended runs; the fallback is the
# local dev admin account documented in docs/qa (change it before real deployment).
$adminPwd = if ($env:MYSQL_ADMIN_PWD) { $env:MYSQL_ADMIN_PWD } else { 'Fzidt@123' }

Write-Host ('=== [1/5] cloning ' + $ProdDb + ' -> ' + $CloneDb + ' (read-only snapshot) ===')
if (-not $SkipClone) {
    $snapshot = Join-Path $outDir 'prod-snapshot.sql'
    $env:MYSQL_PWD = $appPwd
    & $mysqldump.Source --host=127.0.0.1 --port=$Port --user=$appUser `
        --default-character-set=utf8mb4 --single-transaction --no-tablespaces --skip-lock-tables `
        --set-gtid-purged=OFF --skip-triggers --skip-routines --add-drop-table `
        --result-file=$snapshot $ProdDb
    if ($LASTEXITCODE -ne 0) { throw ('mysqldump failed with exit code ' + $LASTEXITCODE) }
    Write-Host ('    snapshot ' + [math]::Round((Get-Item $snapshot).Length / 1KB, 1) + ' KB')

    $env:MYSQL_PWD = $adminPwd
    $ddl = 'DROP DATABASE IF EXISTS `' + $CloneDb + '`; ' +
           'CREATE DATABASE `' + $CloneDb + '` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; ' +
           "GRANT ALL PRIVILEGES ON ``" + $CloneDb + "``.* TO '" + $appUser + "'@'127.0.0.1'; FLUSH PRIVILEGES;"
    & $mysql.Source --host=$AdminHost --port=$Port --user=$AdminUser -e $ddl
    if ($LASTEXITCODE -ne 0) { throw ('clone database creation failed with exit code ' + $LASTEXITCODE) }

    $env:MYSQL_PWD = $appPwd
    $sourceSql = 'SOURCE ' + $snapshot.Replace('\', '/') + ';'
    & $mysql.Source --host=127.0.0.1 --port=$Port --user=$appUser --database=$CloneDb `
        --default-character-set=utf8mb4 -e $sourceSql
    if ($LASTEXITCODE -ne 0) { throw ('clone import failed with exit code ' + $LASTEXITCODE) }
    Write-Host '    clone loaded'
} else {
    Write-Host '    skipped (-SkipClone)'
}

$tableCount = (& $mysql.Source --host=127.0.0.1 --port=$Port --user=$appUser --database=$CloneDb -N `
    -e 'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();')
if ($LASTEXITCODE -ne 0) { throw ('clone ' + $CloneDb + ' is not reachable') }
if ([int]$tableCount -le 0) { throw ('clone ' + $CloneDb + ' has no tables') }
Write-Host ('    clone tables: ' + $tableCount)

Write-Host '=== [2/5] starting isolated E2E stack against the clone ==='
$env:DB_TEST_NAME = $CloneDb
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3306/' + $CloneDb +
    '?useUnicode=true&characterEncoding=utf8&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai'
& powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir 'start-e2e.ps1')
if ($LASTEXITCODE -ne 0) { throw ('E2E stack failed to start (exit ' + $LASTEXITCODE + ')') }
Write-Host '    stack ready on 18080 / 4173'

Write-Host '=== [3/5] running L4 data-shape regression ==='
$env:E2E_BASE_URL = 'http://127.0.0.1:4173'
$env:E2E_RUN_ID = 'nightly-' + $runId
$jsonOut = Join-Path $outDir 'playwright.json'
$env:PLAYWRIGHT_JSON_OUTPUT_NAME = $jsonOut
$consoleLog = Join-Path $outDir 'playwright.log'

$specs = @(
    'tests/e2e/16-imported-ledger-closure.spec.ts',
    'tests/e2e/14-persona-journeys.spec.ts',
    'tests/e2e/12-role-permission-matrix.spec.ts',
    'tests/e2e/13-primary-action-smoke.spec.ts'
)
& npx.cmd playwright test @specs --retries=1 --reporter=json 1> $consoleLog 2>&1
$testExit = $LASTEXITCODE
Write-Host ('    playwright exit code: ' + $testExit)

# A crashed run may leave the JSON empty; the report step then fails loudly.
Write-Host '=== [4/5] generating quality brief ==='
$env:NIGHTLY_RUN_ID = $runId
$nodeExe = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $nodeExe) { throw 'node.exe not found in PATH (needed to build the brief)' }
& $nodeExe (Join-Path $scriptsDir 'nightly-report.mjs') $jsonOut $outDir
$reportExit = $LASTEXITCODE

if (-not $SkipStackStop) {
    Write-Host '=== [5/5] stopping E2E stack ==='
    & powershell -ExecutionPolicy Bypass -File (Join-Path $scriptsDir 'stop-e2e.ps1') | Out-Host
} else {
    Write-Host '=== [5/5] stack left running (-SkipStackStop) ==='
}

Remove-Item Env:DB_URL, Env:DB_TEST_NAME, Env:E2E_BASE_URL, Env:PLAYWRIGHT_JSON_OUTPUT_NAME -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ('Artifacts: ' + $outDir)
Write-Host ('Brief:     ' + (Join-Path $outDir 'report.md'))
if ($testExit -ne 0 -or $reportExit -ne 0) { exit 1 }
Write-Host 'OK nightly regression finished'
