param(
    [string]$PythonVersion = '3.12.8',
    [string]$NpcapVersion = '1.80'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $ProjectRoot 'runtime'
$PythonDir = Join-Path $RuntimeRoot 'python'
$NpcapDir = Join-Path $RuntimeRoot 'npcap'
$CacheDir = Join-Path $RuntimeRoot '.cache'

New-Item -ItemType Directory -Force -Path $PythonDir, $NpcapDir, $CacheDir | Out-Null

function Download-File {
    param([string]$Url, [string]$Destination)
    if (Test-Path $Destination) {
        Write-Host "Using cached $(Split-Path -Leaf $Destination)"
        return
    }
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
}

$embedZip = Join-Path $CacheDir "python-$PythonVersion-embed-amd64.zip"
$embedUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
Download-File -Url $embedUrl -Destination $embedZip

Write-Host 'Extracting portable Python...'
if (Test-Path $PythonDir) {
    Remove-Item $PythonDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PythonDir | Out-Null
Expand-Archive -Path $embedZip -DestinationPath $PythonDir -Force

$sitePackages = Join-Path $PythonDir 'Lib\site-packages'
New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null

$pthFile = Get-ChildItem $PythonDir -Filter 'python*._pth' | Select-Object -First 1
if ($null -eq $pthFile) {
    throw 'Could not find python ._pth file in embeddable package'
}

$zipFile = Get-ChildItem $PythonDir -Filter 'python*.zip' | Select-Object -First 1
if ($null -eq $zipFile) {
    throw 'Could not find python embed zip file'
}

@"
$($zipFile.Name)
.
Lib\site-packages

import site
"@ | Set-Content -Path $pthFile.FullName -Encoding ascii

$getPip = Join-Path $CacheDir 'get-pip.py'
Download-File -Url 'https://bootstrap.pypa.io/get-pip.py' -Destination $getPip

$pythonExe = Join-Path $PythonDir 'python.exe'
Write-Host 'Installing pip into portable Python...'
& $pythonExe $getPip --no-warn-script-location | Out-Null

Write-Host 'Installing Scapy + WinRT packages into portable Python...'
& $pythonExe -m pip install --no-warn-script-location `
    scapy `
    winrt-Windows.Networking.NetworkOperators `
    winrt-Windows.Networking.Connectivity `
    winrt-Windows.Foundation | Out-Null

& $pythonExe -c "import scapy; from winrt.windows.networking.networkoperators import NetworkOperatorTetheringManager; print('OK bundled python', scapy.__version__)"

$npcapInstaller = Join-Path $NpcapDir 'npcap-installer.exe'
$npcapUrl = "https://npcap.com/dist/npcap-$NpcapVersion.exe"
Download-File -Url $npcapUrl -Destination $npcapInstaller

Write-Host "Runtime bundle ready:"
Write-Host "  Python: $pythonExe"
Write-Host "  Npcap:  $npcapInstaller"
