# One-time GitHub setup + release
# Prerequisites: Git for Windows + GitHub CLI (gh)
#   winget install Git.Git
#   winget install GitHub.cli
#   gh auth login

param(
  [string]$Repo = "skys-wifi-cutter",
  [string]$Owner = "joe25dill-a11y",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Require-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing '$name'. Install with: winget install Git.Git  (and)  winget install GitHub.cli"
  }
}

Require-Command git
Require-Command gh

if (-not $Owner) {
  $Owner = (gh api user -q .login)
  Write-Host "Using GitHub user: $Owner"
}

$version = (Get-Content package.json | ConvertFrom-Json).version
$tag = "v$version"
$installerName = "Skys.WiFi.Cutter.Setup.exe"
$installerLocal = Join-Path $env:LOCALAPPDATA "SkysWiFiCutterBuild\$installerName"

if (-not $SkipBuild) {
  Write-Host "Building installer..."
  npm run desktop:build
}

if (-not (Test-Path $installerLocal)) {
  throw "Installer not found: $installerLocal`nRun: npm run desktop:build"
}

if (-not (Test-Path ".git")) {
  Write-Host "Initializing git repository..."
  git init -b main
  git add .
  git commit -m "Skys WiFi Cutter v$version — public beta"
}

$remoteUrl = "https://github.com/$Owner/$Repo.git"
$hasOrigin = git remote get-url origin 2>$null
if (-not $hasOrigin) {
  if (-not (gh repo view "$Owner/$Repo" 2>$null)) {
    Write-Host "Creating GitHub repo $Owner/$Repo ..."
    gh repo create $Repo --public --source=. --remote=origin --description "Free LAN network manager for Windows (NetCut-style)"
  } else {
    git remote add origin $remoteUrl
  }
}

Write-Host "Pushing to GitHub..."
git push -u origin main

Write-Host "Creating release $tag ..."
$notes = @"
## Skys WiFi Cutter v$version (Windows beta)

Free LAN network manager — scan, cut, lag switch, bandwidth, hotspot control.

### Install
1. Download **$installerName** below
2. Right-click → **Run as administrator**
3. If SmartScreen warns: **More info → Run anyway** (unsigned build)
4. Windows 10/11 **x64 only**

### Requirements
- Run as Administrator for cut/lag/hotspot
- Npcap installs automatically if needed
- Use **only on networks you own**

### Issues?
In the app: **Tools → Diagnostics → Copy feedback report**, then paste into a [GitHub issue](https://github.com/$Owner/$Repo/issues)
"@

$hash = (Get-FileHash $installerLocal -Algorithm SHA256).Hash.ToLower()
$checksumName = "Skys-WiFi-Cutter-v$version-sha256.txt"
$checksumPath = Join-Path $env:TEMP $checksumName
@(
  "Skys WiFi Cutter v$version SHA256 checksum",
  "",
  "File: $installerName",
  "SHA256: $hash"
) | Set-Content -Path $checksumPath -Encoding UTF8

$websiteChecksum = Join-Path $Root "website\$checksumName"
@(
  "Skys WiFi Cutter v$version SHA256 checksum",
  "",
  "File: $installerName",
  "SHA256: $hash"
) | Set-Content -Path $websiteChecksum -Encoding UTF8
Write-Host "Website checksum: $websiteChecksum"

Write-Host "SHA256: $hash"

if (gh release view $tag 2>$null) {
  gh release upload $tag $installerLocal $checksumPath --clobber
  Write-Host "Updated assets on existing release $tag"
} else {
  gh release create $tag $installerLocal $checksumPath --title "Skys WiFi Cutter v$version" --notes $notes --latest
}

Write-Host ""
Write-Host "Done! Release URL:"
gh release view $tag --web 2>$null
Write-Host "https://github.com/$Owner/$Repo/releases/tag/$tag"
