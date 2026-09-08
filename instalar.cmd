@echo off
title QA Agent v1.1 - instalador
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar.ps1"
if errorlevel 1 pause
