#Requires -Version 5.1
<#
.SYNOPSIS
  One-way publish: local monorepo -> GitHub + two internal GitLab repos.

.USAGE
  powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1
  powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1 -Apply
  powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1 -Apply -Message "add report export"
  powershell -ExecutionPolicy Bypass -File scripts\publish\sync-repos.ps1 -Apply -Only backend -SkipGitHub

.NOTES
  - Default is a DRY RUN. Nothing is pushed without -Apply.
  - Config lives in sync-repos.config.json next to this file.
  - MUST stay ASCII-only: PowerShell 5.1 reads BOM-less .ps1 files as ANSI.
  - Never pushes to a protected branch unless the config explicitly says so.
#>
[CmdletBinding()]
param(
    [switch]$Apply,
    [switch]$SkipGitHub,
    [ValidateSet('all', 'backend', 'frontend')]
    [string]$Only = 'all',
    [string]$Message = ''
)

$ErrorActionPreference = 'Continue'

# Git emits UTF-8 paths. PowerShell 5.1 decodes native stdout as ANSI by default,
# which corrupts Chinese file names and makes the delete-list mismatch.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$root       = (Resolve-Path (Join-Path $scriptDir '..\..')).Path
$configPath = Join-Path $scriptDir 'sync-repos.config.json'
if (-not (Test-Path -LiteralPath $configPath)) { throw "Config not found: $configPath" }
$cfg = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$cacheRoot = Join-Path $root $cfg.cacheDir
$sslArgs = @()
if (-not $cfg.sslVerify) { $sslArgs = @('-c', 'http.sslVerify=false') }

function Say($s)  { Write-Host $s }
function Step($s) { Write-Host "`n=== $s ===" -ForegroundColor Cyan }
function Warn($s) { Write-Host "  WARN: $s" -ForegroundColor Yellow }
function Die($s)  { throw $s }
function Norm($p) { return ($p -replace '\\', '/') }

function GitCode($repo, $Arguments, [switch]$Show) {
    $out = & git -C $repo @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($Show -and $out) { $out | ForEach-Object { Write-Host "    $_" } }
    return $code
}

function IsPrefix($rel, $prefixes) {
    $n = Norm $rel
    foreach ($p in @($prefixes)) {
        if ($n.StartsWith($p, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
    }
    return $false
}

function IsExcluded($rel, $config) {
    $parts = (Norm $rel) -split '/'
    foreach ($d in @($config.excludeDirs)) {
        if ($parts -contains $d) { return $true }
    }
    $leaf = $parts[-1]
    foreach ($p in @($config.excludeFiles)) {
        if ($leaf -like $p) { return $true }
    }
    return $false
}

function IsForbidden($rel, $patterns) {
    $parts = (Norm $rel) -split '/'
    $leaf = $parts[-1]
    foreach ($p in @($patterns)) {
        if ($leaf -like $p) { return $true }
    }
    return $false
}

Step 'Preflight'
$rootHead = (& git -C $root rev-parse --short HEAD).Trim()
if ($LASTEXITCODE -ne 0) { Die "Not a git repo: $root" }
$branch = (& git -C $root rev-parse --abbrev-ref HEAD).Trim()
$mode = if ($Apply) { 'APPLY' } else { 'DRY RUN' }
Say "  root       : $root"
Say "  branch     : $branch @ $rootHead"
Say "  mode       : $mode"
if ($branch -ne $cfg.rootBranch) { Die "Expected branch '$($cfg.rootBranch)', got '$branch'." }

$dirty = @(& git -C $root status --porcelain --untracked-files=no)
if ($dirty.Count -gt 0) {
    if ($Apply) {
        Die "Tracked changes are not committed. Commit first so GitHub and internal repos receive identical content."
    }
    Warn "Tracked changes are not committed (dry-run allowed). Commit before using -Apply."
    $dirty | Select-Object -First 5 | ForEach-Object { Write-Host "    $_" }
}

$targets = @($cfg.targets | Where-Object { $Only -eq 'all' -or $_.name -eq $Only })
if ($targets.Count -eq 0) { Die "No target matched -Only '$Only'." }

foreach ($t in $targets) {
    $srcDir = Join-Path $root $t.sourceDir
    if (-not (Test-Path -LiteralPath $srcDir)) { Die "Missing source dir: $srcDir" }
    Get-ChildItem -LiteralPath $srcDir -Recurse -File -Force -ErrorAction Stop | ForEach-Object {
        $rel = $_.FullName.Substring($srcDir.Length + 1)
        if (-not (IsExcluded $rel $cfg) -and (IsForbidden $rel $cfg.forbidden)) {
            Die "Forbidden file in source tree: $($t.sourceDir)/$(Norm $rel)"
        }
    }
}
Say '  source scan: OK'

Step 'Cache repositories'
if (-not (Test-Path -LiteralPath $cacheRoot)) {
    New-Item -ItemType Directory -Path $cacheRoot -Force | Out-Null
}
$gitUser  = (& git -C $root config user.name)
$gitEmail = (& git -C $root config user.email)
if (-not $gitUser)  { $gitUser  = $cfg.commitUser }
if (-not $gitEmail) { $gitEmail = $cfg.commitEmail }

foreach ($t in $targets) {
    $cache = Join-Path $cacheRoot $t.name
    if (-not (Test-Path -LiteralPath (Join-Path $cache '.git'))) {
        Say "  cloning $($t.name) -> $cache"
        $cloneArgs = @($sslArgs + @('clone', '-b', $t.branch, $t.url, $cache))
        if ((GitCode $root $cloneArgs -Show) -ne 0) { Die "clone failed for $($t.name)" }
    }
    else {
        Say "  refreshing $($t.name)"
        if ((GitCode $cache @($sslArgs + @('fetch', 'origin', '--quiet'))) -ne 0) { Die "fetch failed for $($t.name)" }
        if ((GitCode $cache @('checkout', '--quiet', $t.branch)) -ne 0) { Die "checkout failed for $($t.name)" }
        if ((GitCode $cache @($sslArgs + @('pull', '--ff-only', '--quiet', 'origin', $t.branch))) -ne 0) {
            Die "pull failed for $($t.name); inspect the cache manually: $cache"
        }
    }
    GitCode $cache @('config', 'user.name', $gitUser) | Out-Null
    GitCode $cache @('config', 'user.email', $gitEmail) | Out-Null
    GitCode $cache @('config', 'core.quotepath', 'false') | Out-Null
    Say "  $($t.name): branch $($t.branch)"
}

Step 'Plan'
$plans = @()
foreach ($t in $targets) {
    $srcDir = Join-Path $root $t.sourceDir
    $cache  = Join-Path $cacheRoot $t.name

    $srcFiles = @(Get-ChildItem -LiteralPath $srcDir -Recurse -File -Force -ErrorAction Stop |
        ForEach-Object { $_.FullName.Substring($srcDir.Length + 1) } |
        Where-Object { -not (IsExcluded $_ $cfg) })

    $dstFiles  = @(& git -C $cache ls-files | ForEach-Object { Norm $_ })
    $deletable = @($dstFiles | Where-Object { -not (IsPrefix $_ @($t.keepInTarget)) })

    $srcSet = @{}
    foreach ($s in $srcFiles) { $srcSet[(Norm $s)] = $true }
    $toDelete = @($deletable | Where-Object { -not $srcSet.ContainsKey($_) })

    $badDelete = @($toDelete | Where-Object { IsPrefix $_ @($cfg.protectedInTarget) })
    if ($badDelete.Count -gt 0) {
        Die "Refusing to delete protected files in $($t.name): $($badDelete -join ', '). Source list may be incomplete."
    }

    $mirrorChanges = @()
    foreach ($m in @($t.mirrors)) {
        $from = Join-Path $root ((Norm $m.from) -replace '/', '\')
        $to   = Join-Path $cache ((Norm $m.to) -replace '/', '\')
        if (-not (Test-Path -LiteralPath $from)) { Die "Mirror source missing: $from" }
        $changed = $true
        if (Test-Path -LiteralPath $to) {
            $enc = [System.Text.Encoding]::UTF8
            $v1 = [IO.File]::ReadAllText($from, $enc) -replace "`r`n", "`n"
            $v2 = [IO.File]::ReadAllText($to, $enc) -replace "`r`n", "`n"
            $changed = ($v1 -ne $v2)
        }
        if ($changed) { $mirrorChanges += $m.to }
    }

    $plans += [pscustomobject]@{
        Target = $t; Cache = $cache; SrcDir = $srcDir
        SrcFiles = $srcFiles; ToDelete = $toDelete; MirrorChanges = $mirrorChanges
    }

    Say "  [$($t.name)] branch=$($t.branch) source=$($srcFiles.Count) files"
    Say "    delete from target : $($toDelete.Count)"
    if ($toDelete.Count -gt 0) {
        $toDelete | Select-Object -First 8 | ForEach-Object { Write-Host "      - $_" }
    }
    Say "    deploy-kit mirrors : $($mirrorChanges.Count) changed"
    if ($mirrorChanges.Count -gt 0) {
        $mirrorChanges | Select-Object -First 8 | ForEach-Object { Write-Host "      ~ $_" }
    }
}

if (-not $Apply) {
    Step 'DRY RUN complete'
    Say '  Nothing was pushed. Review the plan above, then re-run with -Apply.'
    exit 0
}

Step 'Publish'
if (-not $SkipGitHub) {
    Say "  pushing GitHub $($cfg.githubRemote)/$($cfg.rootBranch) ..."
    if ((GitCode $root @('push', $cfg.githubRemote, $cfg.rootBranch) -Show) -ne 0) {
        Die 'GitHub push failed; internal repos were NOT touched.'
    }
    Say '  GitHub push: OK'
}
else {
    Warn 'GitHub push skipped (-SkipGitHub)'
}

$msg = if ($Message) { $Message } else { 'publish snapshot' }
$commitMsg = "sync: $rootHead $msg"

foreach ($p in $plans) {
    $t = $p.Target
    $cache = $p.Cache
    Say "  [$($t.name)] applying ..."

    if ($p.ToDelete.Count -gt 0) {
        $rmPaths = @($p.ToDelete | ForEach-Object { Norm $_ })
        if ((GitCode $cache (@('rm', '--quiet', '--') + $rmPaths)) -ne 0) {
            Die "git rm failed for $($t.name)"
        }
    }

    foreach ($rel in $p.SrcFiles) {
        $from = Join-Path $p.SrcDir $rel
        $to   = Join-Path $cache $rel
        $dir  = Split-Path -Parent $to
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Copy-Item -LiteralPath $from -Destination $to -Force -ErrorAction Stop
    }

    foreach ($m in @($t.mirrors)) {
        $from = Join-Path $root ((Norm $m.from) -replace '/', '\')
        $to   = Join-Path $cache ((Norm $m.to) -replace '/', '\')
        $dir  = Split-Path -Parent $to
        if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Copy-Item -LiteralPath $from -Destination $to -Force -ErrorAction Stop
    }

    if ((GitCode $cache @('add', '-A')) -ne 0) { Die "git add failed for $($t.name)" }

    $staged = @(& git -C $cache diff --cached --name-only)
    $bad = @($staged | Where-Object { IsForbidden $_ $cfg.forbidden })
    if ($bad.Count -gt 0) { Die "Forbidden files staged in $($t.name): $($bad -join ', ')" }

    if ($staged.Count -eq 0) {
        Say "  [$($t.name)] no changes, skipped"
        continue
    }

    if ((GitCode $cache @('commit', '-m', $commitMsg)) -ne 0) { Die "commit failed for $($t.name)" }
    $pushArgs = @($sslArgs + @('push', 'origin', 'HEAD'))
    if ((GitCode $cache $pushArgs -Show) -ne 0) { Die "push failed for $($t.name)" }
    $head = (& git -C $cache rev-parse --short HEAD).Trim()
    Say "  [$($t.name)] pushed $head ($($staged.Count) files)"
}

Step 'Done'
Say "  root commit : $rootHead"
Say "  targets     : $($plans.Count)"
