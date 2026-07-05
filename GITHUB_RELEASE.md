# GitHub release setup

Git and GitHub CLI were **not** available in the build environment, so use this guide on your PC.

## 1. Install tools (one time)

Open PowerShell **as yourself** (not admin required):

```powershell
winget install Git.Git
winget install GitHub.cli
```

Close and reopen PowerShell, then log in:

```powershell
gh auth login
```

Choose: GitHub.com → HTTPS → Login with browser.

## 2. Automatic release (recommended)

From the **project** folder:

```powershell
cd "C:\Users\WhyUH\OneDrive\Desktop\project-bolt-sb1- like netcut\project"
powershell -ExecutionPolicy Bypass -File scripts\github-release.ps1
```

Optional: use your own repo name:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\github-release.ps1 -Owner YOUR_GITHUB_USERNAME -Repo skys-wifi-cutter
```

If you already built the installer:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\github-release.ps1 -SkipBuild
```

This will:
- `git init` + first commit (if needed)
- Create public repo `skys-wifi-cutter` on your GitHub
- Push code
- Create release **v4.4.0** with `Skys WiFi Cutter Setup 4.4.0.exe` attached

## 3. Manual release (no script)

```powershell
cd "C:\Users\WhyUH\OneDrive\Desktop\project-bolt-sb1- like netcut\project"
git init -b main
git add .
git commit -m "Skys WiFi Cutter v4.4.0"
gh repo create skys-wifi-cutter --public --source=. --push

$exe = "$env:LOCALAPPDATA\SkysWiFiCutterBuild\Skys WiFi Cutter Setup 4.4.0.exe"
gh release create v4.4.0 $exe --title "Skys WiFi Cutter v4.4.0" --notes "Windows beta — run as Administrator"
```

## 4. Future releases

After code changes:

```powershell
# bump version in package.json, then:
git add .
git commit -m "Release v4.4.1"
git tag v4.4.1
git push origin main --tags
```

GitHub Actions (`.github/workflows/release.yml`) will build the installer and attach it when you push a `v*` tag.

## 5. Website download link

After release, set your download page to:

```
https://github.com/YOUR_USERNAME/skys-wifi-cutter/releases/latest/download/Skys%20WiFi%20Cutter%20Setup%204.4.0.exe
```

Or use `/releases/latest` in `website/download.html` and link to the releases page.

## 6. In-app updates

`server/services/updateChecker.js` expects:

```
https://api.github.com/repos/YOUR_USERNAME/skys-wifi-cutter/releases/latest
```

Set env `UPDATE_CHECK_URL` at build time, or edit that file with your real `owner/repo` before building.
