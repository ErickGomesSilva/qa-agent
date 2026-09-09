# Atalhos do Menu Iniciar (Windows). Chamado por scripts/install.mjs
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BinDir = Join-Path $Root "bin"
$DisplayName = "QA Agent"

function New-StartMenuShortcut {
  param([string]$Name, [string]$Target, [string]$Description)
  $programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$DisplayName"
  New-Item -ItemType Directory -Force -Path $programs | Out-Null
  $lnk = Join-Path $programs "$Name.lnk"
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($lnk)
  $s.TargetPath = $Target
  $s.WorkingDirectory = $Root
  $s.Description = $Description
  $s.Save()
}

$cmd = Join-Path $BinDir "qaagent.cmd"
New-StartMenuShortcut -Name $DisplayName -Target $cmd -Description "$DisplayName - interface TUI (F1-F9)"
New-StartMenuShortcut -Name "$DisplayName (auditoria)" -Target (Join-Path $BinDir "qaagent-audit.cmd") -Description "Auditoria de cobertura sem Playwright"
New-StartMenuShortcut -Name "$DisplayName (aprofundar stubs)" -Target (Join-Path $BinDir "qaagent-deepen.cmd") -Description "Agente reescreve specs @rascunho"
New-StartMenuShortcut -Name "$DisplayName (desbloquear massa)" -Target (Join-Path $BinDir "qaagent-unblock.cmd") -Description "Tenta desbloquear CAs @massa"
New-StartMenuShortcut -Name "$DisplayName (gerar massa)" -Target (Join-Path $BinDir "qaagent-massa.cmd") -Description "Gera scripts/massa/dados.json em runtime"
New-StartMenuShortcut -Name "$DisplayName (jornada no navegador)" -Target (Join-Path $BinDir "qaagent-tour.cmd") -Description "Simula uso real no Chromium (headed)"
New-StartMenuShortcut -Name "$DisplayName (resumos)" -Target (Join-Path $BinDir "qaagent-reports.cmd") -Description "Lista relatorios COBERTURA-RESUMO"
New-StartMenuShortcut -Name "$DisplayName (k6 carga)" -Target (Join-Path $BinDir "qaagent-k6.cmd") -Description "Smoke/carga HTTP com Grafana k6"
