# Instalador QA Agent — delega para instalar.mjs (Windows, Linux, macOS)
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $Root "instalar.mjs") @args
exit $LASTEXITCODE
