# Startup script for fams-frontend
# Usage (PowerShell):
#   .\run.ps1            # start dev server
#   .\run.ps1 -Install  # force reinstall deps then start
#   .\run.ps1 -Build    # build for production
# Note: Node is NOT on PATH on this machine; we load the bundled runtime.

param(
    [switch]$Install,
    [switch]$Build,
    [switch]$Preview
)

# 1. Add bundled Node to PATH (memory: node not on PATH)
$nodeHome = "$env:USERPROFILE\.workbuddy\binaries\node\versions\22.22.2-6"
if (Test-Path $nodeHome) {
    $env:Path = "$nodeHome;$env:Path"
} else {
    Write-Warning "Bundled Node not found at: $nodeHome. Will try system node."
}

# 2. Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# 3. Check node / npm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is unavailable. Please check the bundled runtime path or install Node.js."
    exit 1
}
Write-Host "Using node: $(node -v)  npm: $(npm -v)" -ForegroundColor Cyan

# 4. Install deps (first time or with -Install)
if ($Install -or -not (Test-Path "$ScriptDir\node_modules")) {
    Write-Host "Installing dependencies (npm install) ..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Error "npm install failed."
        exit $LASTEXITCODE
    }
}

# 5. Run action
if ($Build) {
    Write-Host "Building (npm run build) ..." -ForegroundColor Green
    npm run build
} elseif ($Preview) {
    Write-Host "Previewing (npm run preview) ..." -ForegroundColor Green
    npm run preview
} else {
    Write-Host "Starting dev server (npm run dev) -> http://localhost:5174/" -ForegroundColor Green
    npm run dev
}
