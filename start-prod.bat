@echo off
REM EAM-FAMS 生产形态一键启动（双击即可）。
REM 逻辑在 start-prod.ps1（绕过 PowerShell 执行策略）。
echo ============================================================
echo  EAM-FAMS 生产形态一键启动
echo    访问 : https://localhost   （自签证书，浏览器会有安全警告）
echo    后端 : java -jar（prod profile，连本机 MySQL fams 库）
echo    注意 : 数据库账号 fams / 应用口令 Fzidt@123（详见 README）
echo    停止 : 运行 stop-prod.bat
echo ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-prod.ps1"
