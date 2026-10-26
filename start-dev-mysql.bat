@echo off
REM EAM-FAMS 本地联调用 MySQL 一键启动（双击即可）。
REM 中文说明在本文件内，实际启动逻辑在 start-dev-mysql.ps1（绕过 PowerShell 执行策略）。
echo ============================================================
echo  EAM-FAMS 本地联调一键启动（MySQL 模式）
echo    后端  : http://localhost:8080   (dev profile, 连本机 MySQL)
echo    前端  : http://localhost:5174
echo    数据库: mysql://127.0.0.1:3306/fams   user=fams   password=FamsDb@2026!
echo    登录  : admin / Fzidt@123
echo    前置  : 需先按 README 第 2 节建好 fams 库（脚本不会自动建库）
echo    停止  : 运行 stop-dev.bat，或直接关闭两个服务窗口
echo ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev-mysql.ps1"
