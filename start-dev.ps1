$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Node is not on system PATH; locate the bundled runtime (.workbuddy node versions dir, pick the last one).
$nodeBase = Join-Path $env:USERPROFILE '.workbuddy\binaries\node\versions'
$nodeDir = Get-ChildItem -Directory $nodeBase -ErrorAction SilentlyContinue | Select-Object -Last 1 -ExpandProperty FullName
if (-not $nodeDir) {
    Write-Host '[ERROR] Bundled Node not found:' $nodeBase
    Write-Host '        Please install Node under .workbuddy, or add node to PATH, then retry.'
    Read-Host 'Press Enter to exit'
    exit 1
}
$env:Path = "$nodeDir;$env:Path"

Write-Host 'Starting backend (mvn spring-boot:run) and frontend (npm run dev) in separate windows...'

# Each service runs in its own window; closing the window stops that service.
Start-Process -FilePath 'mvn.cmd' -ArgumentList 'spring-boot:run' -WorkingDirectory (Join-Path $root 'fams-backend') -WindowStyle Normal
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory (Join-Path $root 'fams-frontend') -WindowStyle Normal

Write-Host 'Done. Backend needs ~20-40s to start (Maven downloads deps on first run).'
Write-Host 'Open http://localhost:5174 after the backend window shows "Started".'
