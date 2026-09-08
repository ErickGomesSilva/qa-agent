@echo off
setlocal
set "ROOT=%~dp0.."
cd /d "%ROOT%"
node "%ROOT%\node_modules\tsx\dist\cli.mjs" "%ROOT%\src\tour-cli.ts" %*
exit /b %ERRORLEVEL%
