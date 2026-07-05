param(
    [string]$Version = '2.2.2'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $ProjectRoot 'runtime\windivert'
$CacheDir = Join-Path $ProjectRoot 'runtime\.cache'
$NativeDir = Join-Path $ProjectRoot 'runtime\native'

New-Item -ItemType Directory -Force -Path $OutDir, $CacheDir, $NativeDir | Out-Null

$zipName = "WinDivert-$Version-A.zip"
$zipPath = Join-Path $CacheDir $zipName
$url = "https://github.com/basil00/WinDivert/releases/download/v$Version/$zipName"

if (-not (Test-Path $zipPath)) {
    Write-Host "Downloading WinDivert $Version..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath -UseBasicParsing
} else {
    Write-Host "Using cached $zipName"
}

$extractDir = Join-Path $CacheDir "WinDivert-$Version-A"
if (-not (Test-Path $extractDir)) {
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
}

$dll = Get-ChildItem -Path $extractDir -Recurse -Filter 'WinDivert.dll' |
    Where-Object { $_.DirectoryName -match '\\x64$' } |
    Select-Object -First 1

if (-not $dll) {
    throw "WinDivert.dll not found in $extractDir"
}

$sys = Join-Path $dll.DirectoryName 'WinDivert64.sys'
$doc = Get-ChildItem -Path $extractDir -Recurse -Filter 'LICENSE' | Select-Object -First 1

Copy-Item -Force $dll.FullName (Join-Path $OutDir 'WinDivert.dll')
Copy-Item -Force $sys (Join-Path $OutDir 'WinDivert64.sys')
if ($doc) {
    Copy-Item -Force $doc.FullName (Join-Path $OutDir 'LICENSE')
}

# Native meter loads WinDivert from its own directory at runtime.
Copy-Item -Force $dll.FullName (Join-Path $NativeDir 'WinDivert.dll')
Copy-Item -Force $sys (Join-Path $NativeDir 'WinDivert64.sys')

Write-Host "WinDivert bundle ready:"
Write-Host "  $OutDir"
Write-Host "  (also copied beside SkysNativeMeter.exe)"
