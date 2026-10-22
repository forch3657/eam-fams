@echo off
REM 运行 fams-frontend 前端工程（绕过 PowerShell 执行策略）
REM 用法：
REM   run.bat           启动 dev 服务器
REM   run.bat install   强制重装依赖后启动
REM   run.bat build     构建生产包
REM   run.bat preview   预览构建产物
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
