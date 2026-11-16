# Production build: tests must pass before artifacts are produced.
#
# Why this exists: the project used to be packaged with `mvn package -DskipTests`.
# After the seed passwords were strengthened in phase 1, all 9 test classes went red
# but nobody noticed, because the build never ran them. This script makes "tests pass"
# a precondition for producing the jar/dist.
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads .ps1 without BOM as ANSI,
# so Chinese characters inside string literals get mangled and can break parsing.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# npm/node may be absent from PATH (this machine ships node via workbuddy)
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $nodeRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
    if (Test-Path $nodeRoot) {
        $latest = Get-ChildItem -Path $nodeRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($latest) { $env:Path = $latest.FullName + ';' + $env:Path }
    }
}

Write-Host '=== [1/4] Backend: full test suite + package (no jar unless tests pass) ==='
Set-Location (Join-Path $root 'fams-backend')
mvn clean package
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Backend tests failed. Build aborted (do NOT bypass with -DskipTests).'
    Set-Location $root
    exit 1
}

Write-Host '=== [2/4] Frontend: unit tests ==='
Set-Location (Join-Path $root 'fams-frontend')
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Frontend unit tests failed. Build aborted before producing dist.'
    Set-Location $root
    exit 1
}

Write-Host '=== [3/4] Frontend: permission + contract drift check ==='
npm run check:perm
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Permission contract drift. Build aborted (run npm run check:perm for details).'
    Set-Location $root
    exit 1
}
# D4: export contract from the single source (schema.js) and fail if the export
# CHANGEs the checked-in contract. Compare file hashes before/after -- comparing
# against HEAD would falsely fail while legitimate schema changes are uncommitted.
$contractDir = Join-Path $root 'fams-backend/src/main/resources/contract'
function Get-ContractHashes {
    Get-ChildItem -LiteralPath $contractDir -Filter '*.json' | Sort-Object Name | ForEach-Object {
        "$($_.Name)=$((Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash)"
    }
}
$beforeHashes = (Get-ContractHashes) -join ';'
npm run export:contract
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Contract export failed. Build aborted.'
    Set-Location $root
    exit 1
}
$afterHashes = (Get-ContractHashes) -join ';'
if ($beforeHashes -ne $afterHashes) {
    Write-Host 'X Contract drift detected: re-export changed backend contract files.'
    Write-Host '  Commit the freshly exported contract (or fix schema.js) and rebuild.'
    Set-Location $root
    exit 1
}

Write-Host '=== [4/4] Frontend: production bundle ==='
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Frontend build failed.'
    Set-Location $root
    exit 1
}

Set-Location $root
Write-Host 'OK Build succeeded: jar and dist are produced only after all gates pass.'
Write-Host '   Next: run start-prod.ps1 to publish.'
