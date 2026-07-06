# Public download checklist (website / GitHub)



Use this before posting the installer for strangers to download.



## Ready now (v4.8.0)



- [x] Version bump to 4.8.0 (package.json, WhatsNew, download page, README badge)

- [x] GitHub Pages deploy workflow (`website/` via `.github/workflows/pages.yml`)

- [x] Download page — install walkthrough cards (SmartScreen, admin, setup wizard)

- [x] Download page — GitHub Issues feedback + Discord/email placeholders

- [x] Remote panel QR code (free API, no npm dep)

- [x] Hotspot advanced accordion (pulse, cap, gaming mode)

- [x] Electron quit dialog when hotspot active

- [x] Lag switch syncs from health · custom ghost pulse params in UI

- [x] Schedule `lastRunAt` + missed-slot hints

- [x] Rules in settings backup/import · per-rule enable/disable toggle

- [x] Device badges: 1WAY, FIREWALL, port preset label

- [x] Tools tab sticky section nav

- [x] Setup wizard cutReady check · “Show setup again” in Settings

- [x] Update banner — skip version + check again

- [x] Restored-cuts banner on startup · admin chip → troubleshoot

- [x] Settings live reload in Dashboard when saved from Tools

- [x] Release script kills Skys WiFi Cutter / SkysNativeMeter before build

- [x] SHA256 placeholder: `website/Skys-WiFi-Cutter-v4.8.0-sha256.txt`



## Previous (v4.7.0)



- [x] Accident-proof Cut All — modal with device count, type CUT to confirm, 5s undo toast

- [x] Confirm dialogs for kick, firewall kill, one-way kill, new-device cut, panic stop

- [x] Speed limit remove wired to `POST /api/devices/:mac/remove-speed-limit`

- [x] Schedule edit via PATCH + next-run hints

- [x] Real meter countdown (from refresh-bandwidth secondsLeft)

- [x] Remote panel — PC LAN IP, copy link, restart reminder

- [x] Tray menu — Restore All + Panic Stop

- [x] Group rename via PATCH; defense/remote chips in status bar

- [x] Friendlier audit timeline labels (schedule_group_cut, etc.)



## Before you post publicly



1. **Tag and release** — push tag `v4.8.0` or run `npm run github:release`

   - File: `Skys.WiFi.Cutter.Setup.exe`

   - Checksum: `Skys-WiFi-Cutter-v4.8.0-sha256.txt`



2. **Enable GitHub Pages** (repo Settings → Pages → GitHub Actions)



3. **Optional but recommended**

   - [ ] Code signing certificate (removes most SmartScreen warnings)

   - [ ] Full `electron-updater` silent updates (banner opens direct download today)

   - [ ] Discord / email for feedback linked on download page (placeholder HTML ready)



4. **Legal**

   - Download page must state: **own network only**, educational/authorized use

   - You already have this in README and setup wizard



## What to tell downloaders



```

Windows 10/11 x64 only

Right-click installer → Run as administrator

If SmartScreen appears: More info → Run anyway

Use only on WiFi/LAN you own

Optional: enable Tools → Remote for phone control at http://<PC-IP>:3001/remote

Scan the QR code in Tools → Remote from your phone (same WiFi)

```



## GitHub release



See **`GITHUB_RELEASE.md`** for step-by-step instructions (Git + `gh` CLI required on your PC).



Quick command after installing Git and GitHub CLI:



```powershell

npm run github:release

```



## Honest limits (disclose on website)



- Unsigned installer (SmartScreen)

- Hotspot needs Wi‑Fi adapter with Mobile Hotspot support

- Some routers resist ARP cut (guest network / AP isolation)

- Manual update download (banner links to installer; no silent auto-update)

- Port block and lag switch cannot run on the same device at once

- Windows only (x64)



## Verdict



**OK for a public beta download page** if you host the installer and set expectations (SmartScreen, admin, own network).  

**Not yet** a polished commercial release without code signing and silent auto-update.

