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
$failed = $false

# npm/node may be absent from PATH (this machine ships node via workbuddy)
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    $nodeRoot = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
    if (Test-Path $nodeRoot) {
        $latest = Get-ChildItem -Path $nodeRoot -Directory -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($latest) { $env:Path = $latest.FullName + ';' + $env:Path }
    }
}

Write-Host '=== [1/3] Backend: full test suite + package (no jar unless tests pass) ==='
Set-Location (Join-Path $root 'fams-backend')
mvn clean package
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Backend tests failed. Build aborted (do NOT bypass with -DskipTests).'
    Set-Location $root
    exit 1
}

Write-Host '=== [2/3] Frontend: unit tests ==='
Set-Location (Join-Path $root 'fams-frontend')
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host '! Frontend unit tests failed. Must be green before release.'
    $failed = $true
}

Write-Host '=== [3/3] Frontend: production bundle ==='
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host 'X Frontend build failed.'
    Set-Location $root
    exit 1
}

Set-Location $root
if ($failed) {
    Write-Host 'Build finished, but frontend unit tests are red. Fix them before release.'
    exit 1
}
Write-Host 'OK Build succeeded: jar and dist are produced only after tests pass.'
Write-Host '   Next: run start-prod.ps1 to publish.'
