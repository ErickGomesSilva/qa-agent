@echo off
setlocal
cd /d "%~dp0"
node "%~dp0desinstalar.mjs" %*
exit /b %ERRORLEVEL%
