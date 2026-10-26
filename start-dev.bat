@echo off
REM EAM-FAMS 本地联调一键启动（双击即可）。
REM 中文说明在本文件内，实际启动逻辑在 start-dev.ps1（绕过 PowerShell 执行策略）。
echo ============================================================
echo  EAM-FAMS 本地联调一键启动
echo    后端  : http://localhost:8080   (H2 内存库, 自动建表+演示数据)
echo    前端  : http://localhost:5174
echo    登录  : admin / 123456
echo    停止  : 运行 stop-dev.bat，或直接关闭两个服务窗口
echo ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1"
