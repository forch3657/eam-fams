# D3 备份自动化：生产库只读快照 + 保留最近 N 份，供回滚演练与事故恢复使用。
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/backup-prod-db.ps1 [-Keep 14]
# 说明：使用 MySQL 管理员账号（DDL 凭据），口令从环境变量 MYSQL_PWD 读取，不写入本文件。
param(
  [int]$Keep = 14,
  [string]$MysqlBin = 'C:\Users\fzidt0315\dev\mysql\mysql-8.0.44-winx64\bin\mysqldump.exe',
  [string]$HostName = '127.0.0.1',
  [string]$User = 'root',
  [string]$Database = 'fams'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dir = Join-Path $root 'db-baseline'
New-Item -ItemType Directory -Force -Path $dir | Out-Null

if (-not $env:MYSQL_PWD) {
  Write-Error '请先在环境变量 MYSQL_PWD 中设置 MySQL 管理员口令，切勿写入脚本文件'
  exit 1
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = Join-Path $dir "auto-backup-$stamp.sql"
Write-Output "[backup] dumping $Database -> $out"
# 必须用 mysqldump 原生 --result-file 写出原始字节。PowerShell 5.1 的 `>` 重定向
# 会把 stdout 当文本重编码成 UTF-16LE（FF FE BOM），mysql SOURCE 无法恢复。
& $MysqlBin -h $HostName -u $User --single-transaction --routines --triggers --default-character-set=utf8mb4 "--result-file=$out" $Database 2>$null
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out)) {
  Write-Error 'mysqldump 失败，请检查凭据与路径'
  exit 1
}
$size = (Get-Item $out).Length
# 自检：备份必须以 mysqldump 的注释头 "-- MySQL dump" 开头，绝不能是 UTF-16LE BOM(FF FE) 或 UTF-8 BOM(EF BB BF)
$head = [IO.File]::ReadAllBytes($out)[0..2]
if ($head[0] -eq 0xFF -or ($head[0] -eq 0xEF -and $head[1] -eq 0xBB)) {
  Remove-Item $out -Force
  Write-Error '备份文件被 BOM 污染，不可用于恢复，已删除。请检查 --result-file 是否被改写。'
  exit 1
}
Write-Output "[backup] done: $size bytes, header OK (no BOM)"

# 滚动清理：仅删除本脚本生成的 auto-backup-*，不碰人工快照（backup-*）
$backups = Get-ChildItem -Path $dir -Filter 'auto-backup-*.sql' | Sort-Object LastWriteTime -Descending
if ($backups.Count -gt $Keep) {
  $backups | Select-Object -Skip $Keep | ForEach-Object {
    Write-Output "[backup] remove old: $($_.Name)"
    Remove-Item $_.FullName -Force
  }
}
Write-Output "[backup] retained $([Math]::Min($backups.Count, $Keep)) snapshot(s)"
