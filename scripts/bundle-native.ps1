param(
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ProjectDir = Join-Path $ProjectRoot 'native\SkysNativeMeter'
$OutputDir = Join-Path $ProjectRoot 'runtime\native'

if (-not (Test-Path $ProjectDir)) {
    throw "Native project not found at $ProjectDir"
}

Write-Host 'Building SkysNativeMeter (C# + SharpPcap)...'
dotnet publish $ProjectDir `
    -c $Configuration `
    -r win-x64 `
    --self-contained true `
    -p:PublishSingleFile=true `
    -o $OutputDir

$exe = Join-Path $OutputDir 'SkysNativeMeter.exe'
if (-not (Test-Path $exe)) {
    throw "Native meter build failed - $exe not found"
}

$windivertDir = Join-Path $ProjectRoot 'runtime\windivert'
if (Test-Path (Join-Path $windivertDir 'WinDivert.dll')) {
    Copy-Item -Force (Join-Path $windivertDir 'WinDivert.dll') (Join-Path $OutputDir 'WinDivert.dll')
    Copy-Item -Force (Join-Path $windivertDir 'WinDivert64.sys') (Join-Path $OutputDir 'WinDivert64.sys')
}

Write-Host "Native meter ready: $exe"
