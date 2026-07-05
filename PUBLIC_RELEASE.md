# Public download checklist (website / GitHub)

Use this before posting the installer for strangers to download.

## Ready now (v4.4.0)

- [x] App starts without sqlite crash (JSON fallback + electron rebuild in installer)
- [x] Cut/block API bound to localhost (remote opt-in + PIN)
- [x] Setup wizard + health strip (Admin, Npcap, cut ready)
- [x] Diagnostics → Copy feedback report
- [x] Strong hotspot passwords (no `12345678` default)
- [x] Tray tip on first close (X hides to tray)
- [x] Smoke + API audit scripts pass
- [x] `website/download.html` landing page template

## Before you post publicly

1. **Host the installer** — GitHub Releases, Cloudflare R2, or your web host  
   - File: `Skys WiFi Cutter Setup 4.4.0.exe`  
   - Update `website/download.html` `href` to the real URL

2. **Optional but recommended**
   - [ ] Code signing certificate (removes most SmartScreen warnings)
   - [ ] GitHub repo + `UPDATE_CHECK_URL` env or release tags for in-app updates
   - [ ] Discord / email for feedback linked on download page

3. **Legal**
   - Download page must state: **own network only**, educational/authorized use
   - You already have this in README and setup wizard

## What to tell downloaders

```
Windows 10/11 x64 only
Right-click installer → Run as administrator
If SmartScreen appears: More info → Run anyway
Use only on WiFi/LAN you own
```

## GitHub release

See **`GITHUB_RELEASE.md`** for step-by-step instructions (Git + `gh` CLI required on your PC).

Quick command after installing Git and GitHub CLI:

```powershell
npm run github:release
```

```powershell
Get-Process python*,electron,"Skys WiFi Cutter" -ErrorAction SilentlyContinue | Stop-Process -Force
cd project
npm run desktop:build
Copy-Item "$env:LOCALAPPDATA\SkysWiFiCutterBuild\Skys WiFi Cutter Setup 4.4.0.exe" ".\release\"
```

## Honest limits (disclose on website)

- Unsigned installer (SmartScreen)
- Hotspot needs Wi‑Fi adapter with Mobile Hotspot support
- Some routers resist ARP cut (guest network / AP isolation)
- No auto-update download yet (manual reinstall for new versions)
- Windows only (x64)

## Verdict

**OK for a public beta download page** if you host the installer and set expectations (SmartScreen, admin, own network).  
**Not yet** a polished commercial release without code signing and a real update channel.
