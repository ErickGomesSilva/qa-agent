# Bootstrap: baixa o QA Agent do GitHub e roda o instalador local.
# Uso remoto (uma linha, PowerShell):
#   irm https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.ps1 | iex
#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Repo = if ($env:QA_AGENT_REPO) { $env:QA_AGENT_REPO } else { "ErickGomesSilva/qa-agent" }
$Branch = if ($env:QA_AGENT_BRANCH) { $env:QA_AGENT_BRANCH } else { "main" }
$InstallDir = if ($env:QA_AGENT_HOME) {
  $env:QA_AGENT_HOME
} else {
  Join-Path $env:LOCALAPPDATA "qa-agent"
}

function Write-Info([string]$Msg) { Write-Host $Msg }

function Fail([string]$Msg) {
  Write-Error $Msg
  exit 1
}

function Test-NodeOk {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { return $false }
  try {
    $raw = (& node -p "process.versions.node").Trim()
    $v = [version]$raw
    return $v -ge [version]"22.13.0"
  } catch {
    return $false
  }
}

function Sync-Tree([string]$Src, [string]$Dest) {
  if (-not (Test-Path $Dest)) {
    New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  }
  $exclude = @("node_modules", ".env", "data")
  Get-ChildItem -LiteralPath $Src -Force | ForEach-Object {
    if ($exclude -contains $_.Name) { return }
    $target = Join-Path $Dest $_.Name
    if ($_.PSIsContainer) {
      if (Test-Path $target) { Remove-Item -Recurse -Force $target }
      Copy-Item -LiteralPath $_.FullName -Destination $target -Recurse -Force
    } else {
      Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
  }
  Get-ChildItem -LiteralPath $Dest -Force | ForEach-Object {
    if ($exclude -contains $_.Name) { return }
    $srcItem = Join-Path $Src $_.Name
    if (-not (Test-Path $srcItem)) {
      Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Download-And-Sync {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("qa-agent-" + [guid]::NewGuid().ToString("n"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  try {
    $zip = Join-Path $tmp "qa-agent.zip"
    $url = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
    Write-Info "Baixando $Repo ($Branch)..."
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
    $extracted = Get-ChildItem -LiteralPath $tmp -Directory |
      Where-Object { Test-Path (Join-Path $_.FullName "instalar.mjs") } |
      Select-Object -First 1
    if (-not $extracted) { Fail "Pacote invalido (instalar.mjs ausente)." }
    Sync-Tree -Src $extracted.FullName -Dest $InstallDir
  } finally {
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
  }
}

Write-Info "QA Agent — instalador remoto (Windows)"
Write-Info "Pasta de instalacao: $InstallDir"
Write-Info ""

if (-not (Test-NodeOk)) {
  Fail "Node.js >= 22.13 e obrigatorio. Instale em https://nodejs.org e rode de novo."
}

if (Test-Path (Join-Path $InstallDir "instalar.mjs")) {
  Write-Info "Instalacao existente — atualizando codigo (preserva .env e data/)..."
} else {
  Write-Info "Primeira instalacao..."
}

Download-And-Sync

Push-Location $InstallDir
try {
  & node (Join-Path $InstallDir "instalar.mjs")
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
