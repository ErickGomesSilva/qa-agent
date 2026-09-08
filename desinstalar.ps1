# Remove o comando qaagent do PATH do usuario e o atalho do Menu Iniciar.
# Nao apaga a pasta do projeto, o .env nem data/.

#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $Root "bin"
$DisplayName = "QA Agent"

function Remove-UserPath([string]$Dir) {
  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($null -eq $current) { return }
  $normalized = $Dir.TrimEnd("\")
  $parts = @($current -split ";" | Where-Object { $_ -and ($_.TrimEnd("\") -ine $normalized) })
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
}

Remove-UserPath $BinDir

$programs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$DisplayName"
if (Test-Path $programs) {
  Remove-Item -Recurse -Force $programs
}

Write-Host "Comando qaagent removido do PATH. Abra um PowerShell novo."
Write-Host "O codigo em $Root, .env e data/ continuam no disco."
