# Public download checklist (website / GitHub)

Use this before posting the installer for strangers to download.

## Ready now (v4.7.0)

- [x] Accident-proof Cut All — modal with device count, type CUT to confirm, 5s undo toast
- [x] Confirm dialogs for kick, firewall kill, one-way kill, new-device cut, panic stop
- [x] Speed limit remove wired to `POST /api/devices/:mac/remove-speed-limit`
- [x] Schedule edit via PATCH + next-run hints
- [x] Real meter countdown (from refresh-bandwidth secondsLeft)
- [x] Remote panel — PC LAN IP, copy link, restart reminder
- [x] Tray menu — Restore All + Panic Stop
- [x] Group rename via PATCH; defense/remote chips in status bar
- [x] Friendlier audit timeline labels (schedule_group_cut, etc.)

## Previous (v4.6.1)

- [x] App starts without sqlite crash (JSON fallback + electron rebuild in installer)
- [x] Cut/block API bound to localhost (remote opt-in + PIN + rate limit)
- [x] Setup wizard + health strip (Admin, Npcap, cut ready)
- [x] Diagnostics → Copy feedback report + GitHub Issues link
- [x] Device groups UI — assign/remove MACs, cut/restore group
- [x] Schedule panel — all action types, day picker, enable/disable
- [x] Update banner links to direct installer download from GitHub release
- [x] Update checker falls back when `/releases/latest` is missing or prerelease-only
- [x] `website/download.html` with direct download URL + install/SmartScreen steps
- [x] SHA256 checksum attached to releases
- [x] Strong hotspot passwords (no `12345678` default)
- [x] Tray tip on first close (X hides to tray)
- [x] Mobile remote page — `http://<PC-IP>:3001/remote` (opt-in, PIN hashed)
- [x] Gateway MAC drift alerts
- [x] Cut troubleshooting wizard (AP isolation, subnet self-test)
- [x] Game presets — device picker, active-block status, remove block, confirm dialog, optional lag mode
- [x] Automation rules show device names; friendlier API error messages
- [x] Smoke + API audit scripts pass
- [x] GitHub Pages deploy workflow (`.github/workflows/pages.yml`)

## Before you post publicly

1. **Tag and release** — push tag `v4.7.0` or run `npm run github:release`
   - File: `Skys.WiFi.Cutter.Setup.exe`
   - Checksum: `Skys-WiFi-Cutter-v4.7.0-sha256.txt`

2. **Enable GitHub Pages** (repo Settings → Pages → GitHub Actions)

3. **Optional but recommended**
   - [ ] Code signing certificate (removes most SmartScreen warnings)
   - [ ] Full `electron-updater` silent updates (banner opens direct download today)
   - [ ] Discord / email for feedback linked on download page

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
