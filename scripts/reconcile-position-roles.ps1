<#
.SYNOPSIS
  Reconcile org-users.roleIds vs PRIMARY position role_ids; optionally fix.

.DESCRIPTION
  Backend resolves permissions/data-scope from CURRENT POSITION roleIds
  (UserDetailsServiceImpl), which overrides the user row on login. Historical
  data has roles assigned via "Role Management -> Assign Members" written only
  to org-users, never synced to the position table (3 real incidents).

  POLICY (conservative UNION, never remove):
  - Target = primary position role_ids := UNION(org-users.roleIds, primary role_ids).
    Add missing roles, KEEP extra roles already on the position. Never delete:
    e.g. a leadership role may exist only on the position (imported data) and
    overwriting from the user row would silently revoke it.
  - ONLY primary position (is_primary=1) is synced. Secondary positions
    (is_primary=0) keep their own roles: one person / multiple positions means
    different roles in different companies; must NOT be overwritten.
  - Skip: no primary position (login falls back to user row), disabled user,
    disabled position, user with no roles.

  Default = dry-run (report only). Use -Apply to execute UPDATEs.

.PARAMETER Apply
  Execute the fixes (default: report only).

.PARAMETER Password
  MySQL root password. Defaults to $env:MYSQL_ADMIN_PWD; if neither is set the
  script exits with an error (never hard-code credentials in the repo).

.EXAMPLE
  .\reconcile-position-roles.ps1
  .\reconcile-position-roles.ps1 -Apply
#>
param(
  [switch]$Apply,
  [string]$Password = $env:MYSQL_ADMIN_PWD
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Password)) {
  throw "MySQL admin password not provided. Set `$env:MYSQL_ADMIN_PWD or pass -Password.
NEVER hard-code the DB password in this script (it is pushed to a public repo)."
}
$mysql = 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe'
if (-not (Test-Path $mysql)) { throw "mysql not found: $mysql" }
$env:MYSQL_PWD = $Password

function Invoke-Sql([string]$sql) {
  $out = & $mysql -uroot --default-character-set=utf8mb4 -B -N -e $sql fams 2>&1
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $out" }
  return $out
}

function Parse-Roles($raw) {
  if ($null -eq $raw -or $raw -eq '' -or $raw -eq 'NULL') { return @() }
  try {
    $v = $raw | ConvertFrom-Json
    if ($v -is [array]) { return @($v | ForEach-Object { [string]$_ }) }
    return @([string]$v)
  } catch {
    return @(($raw.Trim('[', ']') -split ',') | ForEach-Object { $_.Trim().Trim('"') } | Where-Object { $_ })
  }
}

function Same-Set([string[]]$a, [string[]]$b) {
  if ($a.Count -ne $b.Count) { return $false }
  return ((@($a | Sort-Object) -join '|') -eq (@($b | Sort-Object) -join '|'))
}

# true if every role in $need is present in $have (superset check)
function Contains-All([string[]]$have, [string[]]$need) {
  foreach ($r in $need) { if ($have -notcontains $r) { return $false } }
  return $true
}

# ---------- 1. load data ----------
$userRows = @()
foreach ($line in (Invoke-Sql "SELECT id, IFNULL(username,''), IFNULL(name,''), IFNULL(role_ids,''), IFNULL(status,'') FROM org_users ORDER BY name")) {
  $f = $line -split "`t", 5
  if ($f.Count -ge 5) {
    $userRows += [pscustomobject]@{
      Id = $f[0]; Username = $f[1]; Name = $f[2]
      Roles = @(Parse-Roles $f[3]); Status = $f[4]
    }
  }
}

$posRows = @()
foreach ($line in (Invoke-Sql "SELECT id, IFNULL(user_id,''), IFNULL(role_ids,''), IFNULL(is_primary,0), IFNULL(status,''), IFNULL(position,''), IFNULL(company_id,'') FROM org_user_positions ORDER BY user_id, is_primary DESC, sort")) {
  $f = $line -split "`t", 7
  if ($f.Count -ge 7) {
    $posRows += [pscustomobject]@{
      Id = $f[0]; UserId = $f[1]; Roles = @(Parse-Roles $f[2])
      IsPrimary = ($f[3] -eq '1'); Status = $f[4]; Position = $f[5]; Company = $f[6]
    }
  }
}

Write-Host "=== Scale ==="
Write-Host ("Users {0}, positions {1} (primary {2})" -f $userRows.Count, $posRows.Count, @($posRows | Where-Object IsPrimary).Count)

# ---------- 2. classify ----------
$toFix = @()
$skipNoPrimary = @()
$skipDisabledPos = @()
$skipDisabledUser = @()
$skipNoRoles = @()
$consistent = 0
$secondaryKept = 0

foreach ($u in $userRows) {
  $mine = @($posRows | Where-Object { $_.UserId -eq $u.Id })
  $primary = @($mine | Where-Object { $_.IsPrimary } | Select-Object -First 1)
  $secondary = @($mine | Where-Object { -not $_.IsPrimary })
  $secondaryKept += $secondary.Count

  if ($primary.Count -eq 0) { $skipNoPrimary += $u; continue }
  if ($u.Status -ne 'ENABLED') { $skipDisabledUser += $u; continue }
  if ($primary[0].Status -ne 'ENABLED') { $skipDisabledPos += $u; continue }
  if ($u.Roles.Count -eq 0) { $skipNoRoles += $u; continue }

  # consistent = user roles are fully covered by primary position (position may keep extra roles)
  if (Contains-All $primary[0].Roles $u.Roles) { $consistent++; continue }

  $merged = @($u.Roles + $primary[0].Roles | Sort-Object -Unique)
  $toFix += [pscustomobject]@{
    User = $u; Pos = $primary[0]; SecondaryCount = $secondary.Count; Merged = $merged
  }
}

Write-Host ""
Write-Host "=== Reconciliation ==="
Write-Host ("Consistent: {0}" -f $consistent)
Write-Host ("[TO FIX] primary missing some user roles: {0}" -f $toFix.Count)
Write-Host ("Skip-no-primary: {0} (login uses user row)" -f $skipNoPrimary.Count)
Write-Host ("Skip-disabled-user: {0}" -f $skipDisabledUser.Count)
Write-Host ("Skip-disabled-primary-position: {0}" -f $skipDisabledPos.Count)
Write-Host ("Skip-user-no-roles: {0} (avoid clearing)" -f $skipNoRoles.Count)
Write-Host ("Secondary positions {0}: kept as-is, excluded" -f $secondaryKept)

if ($toFix.Count -gt 0) {
  Write-Host ""
  Write-Host "=== To-fix detail (union: add user roles, keep position extras) ==="
  Write-Host ("{0,-12} {1,-13} {2,-22} {3,-22} {4,-26} {5}" -f 'Name', 'Username', 'User roles', 'Primary now', 'Will set (UNION)', 'Secondary#')
  foreach ($x in $toFix) {
    Write-Host ("{0,-12} {1,-13} {2,-22} {3,-22} {4,-26} {5}" -f `
      $x.User.Name, $x.User.Username, ($x.User.Roles -join ','), ($x.Pos.Roles -join ','), ($x.Merged -join ','), $x.SecondaryCount)
  }
}

# ---------- 3. apply ----------
if (-not $Apply) {
  Write-Host ""
  Write-Host "(dry-run: no data changed. Add -Apply to execute.)"
  exit 0
}

if ($toFix.Count -eq 0) { Write-Host "Nothing to fix."; exit 0 }

Write-Host ""
Write-Host "=== Applying ==="
foreach ($x in $toFix) {
  $json = ($x.Merged | ForEach-Object { "'$_'" }) -join ','
  $sql = "UPDATE fams.org_user_positions SET role_ids=JSON_ARRAY($json) WHERE id='$($x.Pos.Id)' AND is_primary=1;"
  Invoke-Sql $sql | Out-Null
  Write-Host ("  fixed {0} / {1}: [{2}] -> [{3}]" -f $x.User.Name, $x.Pos.Id, ($x.Pos.Roles -join ','), ($x.Merged -join ','))
}

# ---------- 4. verify ----------
Write-Host ""
Write-Host "=== Verify ==="
$remain = 0
foreach ($x in $toFix) {
  $raw = (Invoke-Sql "SELECT IFNULL(role_ids,'') FROM fams.org_user_positions WHERE id='$($x.Pos.Id)';") | Select-Object -First 1
  $now = @(Parse-Roles $raw)
  # verify: union target reached AND every user-role is present on the primary position
  $missing = @($x.User.Roles | Where-Object { $now -notcontains $_ })
  if (-not (Same-Set $x.Merged $now) -or $missing.Count -gt 0) {
    $remain++
    Write-Host ("  !! STILL MISMATCH {0} / {1}: [{2}] missing=[{3}]" -f $x.User.Name, $x.Pos.Id, ($now -join ','), ($missing -join ','))
  }
}
if ($remain -eq 0) { Write-Host "Verify OK: all consistent." } else { Write-Host ("Verify FAILED: {0} still mismatched" -f $remain) }
