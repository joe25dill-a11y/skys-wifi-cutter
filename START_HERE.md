# NetCut Local

Free NetCut / Arcai-style network manager for your own LAN.

## Quick start — Desktop app (recommended)

**One double-click, no terminals:**

1. Install prerequisites once:
   ```powershell
   pip install scapy
   ```
   Install **Npcap** from https://npcap.com

2. Build the desktop app:
   ```powershell
   npm install
   npm run desktop:build
   ```

3. Run **`release\NetCut Local Setup *.exe`** — install and launch from desktop shortcut.

   The installer requests **Administrator** rights (required for cut/block).

**Test desktop without building installer:**
```powershell
npm run desktop
```

## Web mode (developers)

```powershell
npm run dev:all
```
Open http://localhost:5173 (backend must run as Administrator for cut/block).

## Features

| Feature | Status |
|---------|--------|
| LAN device scan | Yes |
| Hostname lookup (DNS + NetBIOS) | Yes |
| Big CUT / RESTORE buttons | Yes |
| Auto-scan every 30 seconds | Yes (toggle in UI) |
| Desktop .exe | Yes (`npm run desktop:build`) |
| ARP cut/block | Yes (Admin + Python + Npcap) |
| Total bandwidth | Yes |
| Hotspot freeze/pulse | Partial |

## Legal

Only use on networks you own or manage.
