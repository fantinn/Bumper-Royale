# Builds dist/bate-bate-itch.zip for an itch.io HTML5 upload (index.html at the zip root).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts/build-itch.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'bate-bate-itch.zip'
New-Item -ItemType Directory -Force $dist | Out-Null
if (Test-Path $zip) { Remove-Item $zip -Force }
$files = @('index.html') + (Get-ChildItem -Path $root -Filter '*.js' -File | ForEach-Object { $_.Name })
Compress-Archive -Path ($files | ForEach-Object { Join-Path $root $_ }) -DestinationPath $zip
Write-Host "Pronto: $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
Write-Host "Arquivos: $($files -join ', ')"
