# Skys WiFi Cutter

### Free LAN network manager (NetCut / Arcai-style) for Windows

![Version](https://img.shields.io/badge/version-4.9.0-blue.svg) ![License](https://img.shields.io/badge/license-MIT-green.svg)

Desktop app for managing **your own** WiFi/LAN: device scan, ARP cut, lag switch, hotspot freeze, bandwidth monitor, port/DNS blocks, and more. Uses **Npcap** (LAN) + **WinDivert** (hotspot packet control) — no cloud, no subscription.

## Networking stack (Windows)

| Layer | Technology | Role |
|-------|------------|------|
| LAN cut / lag / throttle / DNS / port block | **Npcap** + native engine | ARP MITM — core NetCut-style features |
| Hotspot freeze (per-client) | **WinDivert** (preferred) or Windows Firewall fallback | Packet drop on selected `192.168.137.x` clients |
| Hotspot lag / pulse | **WinDivert** | Packet delay/drop on hotspot clients only |
| Not used | RawCap, eBPF-for-Windows | Capture-only or immature — do not replace Npcap |

## Requirements

- **Windows 10/11** (primary target)
- **Run as Administrator** for cut, lag, hotspot, firewall features
- **Npcap** (bundled with installer)
- **WinDivert** driver (bundled — loads on first hotspot packet action, Admin required)
- **Node.js 18+** for development only

## ⚠️ LEGAL NOTICE

**This software is for EDUCATIONAL and AUTHORIZED use ONLY.**

- ✅ Managing YOUR OWN network and devices
- ✅ Testing in controlled environments with permission
- ❌ Accessing networks you don't own (ILLEGAL)
- ❌ Interfering with others' internet without permission (ILLEGAL)

**Unauthorized network manipulation is a federal crime. Use responsibly.**

## Beta testers (Windows installer)

Share **`Skys WiFi Cutter Setup.exe`** (v4.8.0). Host using **`website/download.html`** — see **`PUBLIC_RELEASE.md`** for the full checklist.

1. Windows 10/11, **x64 only**
2. Right-click installer → **Run as administrator** (SmartScreen may warn — unsigned build)
3. Npcap installs automatically if missing; reboot if cut/scan fails after first install
4. Launch from Start Menu / Desktop (already requests Admin)
5. Complete the setup wizard, then **Scan**

**Expect to work:** device scan, cut/restore, lag, speed limit, bandwidth, hotspot start/stop, freeze clients, settings, diagnostics.

**Known limits:** unsigned installer (SmartScreen), no silent auto-update (manual download from banner), hotspot needs a Wi‑Fi adapter that supports Mobile Hotspot, some routers resist ARP cut, X closes to tray (hotspot stays until Stop/Quit).

**API safety:** cut/block APIs bind to **localhost only**. Remote phone control is **off** until enabled in Tools → Remote (PIN + restart).

## Why This Exists

Netcut and Arcai Router charge monthly/yearly fees for basic network management features that should be free. This tool provides the same capabilities at zero cost, with enterprise-grade security, empowering users to manage their own networks without paying for subscriptions.

## Features

### Network Control
- **Real-time Device Discovery** - Automatically scan and detect all devices on your network
- **Device Blocking/Allowing** - Control which devices can access your network
- **MAC Address Detection** - View MAC addresses and manufacturer information
- **Device Identification** - Automatic device type detection (phones, laptops, TVs, etc.)

### Bandwidth Management
- **Real-time Bandwidth Monitoring** - Track upload/download speeds per device
- **Speed Limiting** - Limit bandwidth for specific devices (Linux only)
- **Network Statistics** - View total network usage and trends
- **Live Updates** - Bandwidth data refreshes automatically

### Advanced Features
- **ARP Table Reading** - Real network device discovery via ARP protocol
- **Firewall Integration** - Works with iptables (Linux), Windows Firewall, and pfctl (macOS)
- **Device Manufacturer Lookup** - Identify device brands via OUI database
- **Network Interface Monitoring** - Track real network traffic statistics

### User Interface
- **Beautiful Dashboard** - Clean, modern interface
- **Dark Mode** - Eye-friendly theme switching
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Updates** - Live device and bandwidth monitoring
- **Search & Filter** - Quickly find specific devices

## Important Notice

This tool is designed for users to manage their OWN networks. Use cases include:
- Managing your home WiFi network
- Controlling your personal router
- Monitoring devices you own
- Setting up parental controls on your network
- Bandwidth management for your household

**Only use this on networks YOU own and operate.** Never use this tool to interfere with networks you don't own or have permission to manage.

## How It Works

Unlike cloud-based subscription services, this tool runs entirely on YOUR computer and manages YOUR network directly:

1. **Network Scanning** - Reads the ARP table to discover devices
2. **Device Control** - Uses system firewall rules (iptables/pfctl/Windows Firewall)
3. **Bandwidth Monitoring** - Reads network interface statistics
4. **Speed Limiting** - Implements traffic control (Linux tc/QoS)

No data leaves your network. No telemetry. No subscriptions. Complete privacy.

## Requirements

- **Node.js 18+** - Runtime environment
- **npm or yarn** - Package manager
- **Elevated privileges** - Administrator (Windows) for full features
- **Local SQLite** - device history, audit log, settings (no Supabase required)

## 🚀 Quick Installation

### 1. Clone & Install

```bash
git clone <repository-url>
cd project
npm install
```

### 2. Configure Environment (optional)

```bash
cp .env.example .env
```

Default settings work for local desktop use. Optional in `.env`:

```env
PORT=3001
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

### 3. Create Logs Directory

```bash
mkdir logs
```

Data (devices, settings, audit log) is stored locally in SQLite/JSON under the app data folder — **no Supabase or cloud database required**.

## Security (desktop app)

This is a **local-only** desktop app — no login, no cloud account, no JWT auth layer.

✅ **Local API**
- Cut/block APIs bind to **localhost** by default
- Remote phone control is **opt-in** with PIN (Tools → Remote)
- Failed remote PIN attempts are rate-limited

✅ **Input Validation**
- MAC/IP validation on all device endpoints
- Helmet.js security headers
- Rate limiting on API requests

✅ **Privacy**
- No telemetry, no subscriptions
- All data stays on your PC (local SQLite/JSON)

📖 **Legacy cloud docs:** [README_SECURITY.md](./README_SECURITY.md) describes an older Supabase/JWT design — **not used** by the current desktop build.

## Usage

### Start the Backend Server

**Linux/Mac (with full features):**
```bash
sudo npm run server
```

**Windows (as Administrator):**
```bash
npm run server
```

The backend runs on `http://localhost:3001`

### Start the Frontend

In a separate terminal:

```bash
npm run dev
```

The frontend runs on `http://localhost:5173`

### Access the Dashboard

Open your browser to `http://localhost:5173`

## Features Guide

### Device Discovery

Click **Refresh** to scan your network. The system will:
- Read the ARP table
- Detect all connected devices
- Identify device types and manufacturers
- Update the device list automatically

### Block/Allow Devices

Toggle the switch next to any device to block or allow network access. The system will:
- Add/remove firewall rules
- Update device status in real-time
- Show visual feedback

### Speed Control

Click the gauge icon next to any device to:
- Toggle unlimited/limited speed
- Set MB speed control (Mbits/sec or Kbits/sec)
- Set KB speed control (Mbits/sec or Kbits/sec)
- Apply traffic shaping rules

Note: Speed limiting requires Linux with elevated privileges.

### Lag Control (Gaming Feature)

Click the lightning bolt icon next to any device for lag control:
- **Outgoing lag** - Delay packets going OUT (0-1000ms)
- **Incoming lag** - Delay packets coming IN (0-1000ms)
- **Quick lag spikes** - One-click lag spikes (100ms, 250ms, 500ms)
- Perfect for creating lag compensation in games

This is the same feature as Arcai Router's lag switch, but FREE!

### Bandwidth Monitoring

The dashboard automatically shows:
- Per-device bandwidth usage
- Real-time upload/download speeds
- Network-wide statistics
- Historical trends

## Platform Support

| Feature | Linux | macOS | Windows |
|---------|-------|-------|---------|
| Device Discovery | ✅ | ✅ | ✅ |
| Device Blocking | ✅ | ✅ | ✅ |
| Bandwidth Monitor | ✅ | ✅ | ✅ |
| Speed Limiting | ✅ | ⚠️ | ⚠️ |
| Lag Control | ✅ | ✅ | ✅ |

## Elevated Privileges

For full functionality, run with elevated privileges:

**Linux:**
```bash
sudo npm run server
```

**macOS:**
```bash
sudo npm run server
```

**Windows (PowerShell as Administrator):**
```bash
npm run server
```

Without elevated privileges, you can still:
- View connected devices
- Monitor bandwidth
- Use the interface

But you cannot:
- Block/unblock devices
- Limit device speeds
- Modify firewall rules

## Comparison with Netcut/Arcai

| Feature | Netcut | Arcai Router | FREE Network Manager |
|---------|--------|--------------|---------------------|
| Cost | $5-10/month | $1-5/month | **FREE** |
| Device Blocking | ✅ | ✅ | ✅ |
| Bandwidth Monitor | ✅ | ✅ | ✅ |
| Speed Limiting | ✅ | ✅ | ✅ (Linux) |
| Lag Control | ❌ | ✅ | ✅ |
| Lag Spikes | ❌ | ✅ | ✅ |
| Network Scanning | ✅ | ✅ | ✅ |
| Dark Mode | ❌ | ❌ | ✅ |
| Open Source | ❌ | ❌ | ✅ |
| Privacy | Cloud-based | Cloud-based | **Local only** |
| No Telemetry | ❌ | ❌ | ✅ |
| Cross-platform | Windows | Windows | ✅ All |

## Technical Details

### Network Scanning
Uses native ARP table reading (`arp -a`) and OUI database for manufacturer identification.

### Device Blocking

**Linux:** `iptables` firewall rules
```bash
iptables -A FORWARD -m mac --mac-source <MAC> -j DROP
```

**Windows:** `netsh` firewall rules
```bash
netsh advfirewall firewall add rule name="Block_<MAC>" dir=in action=block remoteip=<IP>
```

**macOS:** `pfctl` packet filter
```bash
pfctl -t blocked_devices -T add <IP>
```

### Bandwidth Monitoring
Reads network interface statistics via `systeminformation` package, tracking:
- Bytes sent/received
- Packets transmitted
- Interface speed

### Speed Limiting (Linux)
Uses Linux Traffic Control (tc):
```bash
tc qdisc add dev eth0 root handle 1: htb default 30
tc class add dev eth0 parent 1: classid 1:1 htb rate <SPEED>kbit
```

## Troubleshooting

### "Permission denied" errors
Run with sudo (Linux/Mac) or as Administrator (Windows)

### Devices not appearing
- Make sure devices are actively communicating on the network
- Try pinging devices first
- Refresh the device list multiple times

### Blocking not working
- Verify you have elevated privileges
- Check firewall rules: `sudo iptables -L` (Linux)
- Ensure you're on the same network as the devices

### Speed limiting not working
- Speed limiting only works on Linux
- Requires root/sudo privileges
- Check if tc is installed: `which tc`

## Building for Production

```bash
npm run build
```

Built files will be in `dist/` directory.

## Contributing

This is a community project! Contributions welcome:
- Bug fixes
- New features
- Platform support
- Documentation
- Translations

## License

MIT License - Free to use, modify, and distribute.

## Disclaimer

This tool is provided for legitimate network management of networks you own. Users are responsible for complying with all applicable laws and regulations. Only use on networks and devices you own or have explicit permission to manage.

## Support

This is a free, community-maintained project. For issues and questions:
- Check the documentation
- Search existing issues
- Open a new issue with details

---

**Remember:** This tool is for managing YOUR network. Never use it to interfere with networks you don't own or have permission to manage. Network interference without authorization is illegal in most jurisdictions.

**Stop paying for basic network management. Take control of your network for FREE.**
