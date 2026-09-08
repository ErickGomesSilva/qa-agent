# Instala o QA Agent no Windows (v1.1+): dependencias, Chromium, workspace e comandos no PATH.
# Nao precisa de administrador. Depois, abra um PowerShell NOVO.

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $Root "bin"
$DisplayName = "QA Agent"
$Command = "qaagent"

function Get-PackageVersion {
  $pkg = Join-Path $Root "package.json"
  if (-not (Test-Path $pkg)) { return "?" }
  try {
    $j = Get-Content $pkg -Raw | ConvertFrom-Json
    return [string]$j.version
  } catch {
    return "?"
  }
}

function Get-NodeVersion {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $null }
  $raw = (& node -p "process.versions.node").Trim()
  try { return [version]$raw } catch { return $null }
}

function Add-UserPath([string]$Dir) {
  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $current) { $current = "" }
  $parts = @($current -split ";" | Where-Object { $_ -and $_.Trim() })
  $normalized = $Dir.TrimEnd("\")
  $exists = $parts | Where-Object { $_.TrimEnd("\") -ieq $normalized }
  if ($exists) { return $false }
  $parts += $normalized
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
  $env:Path = "$normalized;$env:Path"
  return $true
}

function New-StartMenuShortcut {
  param(
    [string]$Name,
    [string]$Target,
    [string]$Args = "",
    [string]$Description
  )
  $programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$DisplayName"
  New-Item -ItemType Directory -Force -Path $programs | Out-Null
  $lnk = Join-Path $programs "$Name.lnk"
  $w = New-Object -ComObject WScript.Shell
  $s = $w.CreateShortcut($lnk)
  $s.TargetPath = $Target
  if ($Args) { $s.Arguments = $Args }
  $s.WorkingDirectory = $Root
  $s.Description = $Description
  $s.Save()
}

function New-StartMenuShortcuts {
  $cmd = Join-Path $BinDir "qaagent.cmd"
  New-StartMenuShortcut -Name $DisplayName -Target $cmd -Description "$DisplayName - interface TUI (F1-F8)"
  New-StartMenuShortcut -Name "$DisplayName (auditoria)" -Target (Join-Path $BinDir "qaagent-audit.cmd") -Description "Auditoria de cobertura sem Playwright"
  New-StartMenuShortcut -Name "$DisplayName (aprofundar stubs)" -Target (Join-Path $BinDir "qaagent-deepen.cmd") -Description "Agente reescreve specs @rascunho"
  New-StartMenuShortcut -Name "$DisplayName (desbloquear massa)" -Target (Join-Path $BinDir "qaagent-unblock.cmd") -Description "Tenta desbloquear CAs @massa"
  New-StartMenuShortcut -Name "$DisplayName (gerar massa)" -Target (Join-Path $BinDir "qaagent-massa.cmd") -Description "Gera scripts/massa/dados.json em runtime"
  New-StartMenuShortcut -Name "$DisplayName (jornada no navegador)" -Target (Join-Path $BinDir "qaagent-tour.cmd") -Description "Simula uso real no Chromium (headed)"
  New-StartMenuShortcut -Name "$DisplayName (resumos)" -Target (Join-Path $BinDir "qaagent-reports.cmd") -Description "Lista relatorios COBERTURA-RESUMO"
  New-StartMenuShortcut -Name "$DisplayName (k6 carga)" -Target (Join-Path $BinDir "qaagent-k6.cmd") -Description "Smoke/carga HTTP com Grafana k6"
}

$Version = Get-PackageVersion
Write-Host "$DisplayName v$Version - instalador"
Write-Host "Pasta: $Root"
Write-Host ""

$min = [version]"22.13.0"
$ver = Get-NodeVersion
if (-not $ver) {
  Write-Host "Node.js nao encontrado. Instale 22 LTS em https://nodejs.org e rode este instalador de novo."
  exit 1
}
if ($ver -lt $min) {
  Write-Host "Node.js $ver e antigo. Precisa de >= $min."
  exit 1
}
Write-Host "Node.js $ver ok"

Set-Location $Root

Write-Host "npm install..."
& npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Verificando TypeScript..."
& npm run typecheck
if ($LASTEXITCODE -ne 0) {
  Write-Host "AVISO: typecheck falhou. Instalacao continua; reporte o erro se qaagent nao abrir."
}

Write-Host "Sincronizando workspace (templates Playwright, auth, massa)..."
& node (Join-Path $Root "node_modules\tsx\dist\cli.mjs") (Join-Path $Root "src\post-install.ts")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Playwright Chromium (primeira vez pode demorar)..."
& npx --yes playwright install chromium
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$marker = Join-Path $Root "data\workspace\.chromium-ok"
New-Item -ItemType Directory -Force -Path (Split-Path $marker) | Out-Null
Set-Content -Path $marker -Value "$(Get-Date -Format o)" -Encoding utf8

$added = Add-UserPath $BinDir
New-StartMenuShortcuts

Write-Host ""
Write-Host "=== Instalacao concluida ==="
Write-Host ""
Write-Host "Comandos no PATH (pasta bin):"
Write-Host "  $Command                  Interface TUI (F1-F9)"
Write-Host "  $Command --plain          Modo texto"
Write-Host "  $Command --reconfigure    Refazer configuracao"
Write-Host "  qaagent-audit             Auditoria de cobertura (rapido)"
Write-Host "  qaagent-reports           Listar resumos COBERTURA-RESUMO"
Write-Host "  qaagent-k6                Smoke/carga HTTP (Grafana k6)"
Write-Host "  qaagent-deepen            Aprofundar specs @rascunho"
Write-Host "  qaagent-unblock           Desbloquear CAs @massa"
Write-Host "  qaagent-massa             Gerar massa (dados.json / dados.md)"
Write-Host "  qaagent-tour              Jornada no navegador (uso real)"
Write-Host ""
Write-Host "Flags extras no $Command --plain:"
Write-Host "  --audit-only   --deepen-stubs   --unblock-massa   --tour   --load-only"
Write-Host ""
Write-Host "k6 (opcional): winget install GrafanaLabs.k6  —  scripts em data/workspace/scripts/k6/"
Write-Host "  K6_ENABLED=true no .env roda k6 apos Playwright passar"
Write-Host ""
if ($added) {
  Write-Host "IMPORTANTE: feche ESTE terminal e abra um PowerShell NOVO para o PATH valer."
} else {
  Write-Host "O PATH ja tinha a pasta bin. Se acabou de atualizar, abra um terminal novo mesmo assim."
}
Write-Host ""
Write-Host "Primeira vez: $Command  ->  F1 chave, F2 modelo, F3 requisitos, F4 URL, F5 login, F8 rodada, F9 resumos"
Write-Host ""
Write-Host "Desinstalar so o comando: .\desinstalar.ps1"
Write-Host "(nao apaga .env nem data/)"
