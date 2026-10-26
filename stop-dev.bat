@echo off
echo 正在停止 EAM-FAMS 本地服务（按监听端口 8080 / 5174 定位进程）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5174" ^| findstr "LISTENING"') do taskkill /PID %%a /T /F >nul 2>&1
echo 完成。若窗口未自动关闭，请手动关闭。
