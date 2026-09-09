# Desinstalador QA Agent — delega para desinstalar.mjs
#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $Root "desinstalar.mjs") @args
exit $LASTEXITCODE
