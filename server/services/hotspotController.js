import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { resolvePython, quoteExecutable } from '../utils/pythonRuntime.js';
import { getScriptsDir } from '../utils/paths.js';
import { normalizeMac } from './arpTable.js';
import { windivertHotspot } from './windivertHotspot.js';
import { getSettings } from '../storage/appSettingsStore.js';
import { generateHotspotPassword } from '../utils/hotspotPassword.js';

const execAsync = promisify(exec);
const SCRIPTS_DIR = getScriptsDir();
const HOTSPOT_GATEWAY_IP = '192.168.137.1';

function ipRuleSuffix(ip) {
  return String(ip).replace(/\./g, '_');
}

export const SSID_PRESETS = [
  { id: 'xbox', label: 'Xbox Lag Control', ssid: 'Xbox-LagControl' },
  { id: 'gaming', label: 'Gaming Hub', ssid: 'Gaming-Hub' },
  { id: 'guest', label: 'Guest Network', ssid: 'Skys-Guest' },
  { id: 'stream', label: 'Stream Test', ssid: 'Stream-Test' }
];

export class HotspotController {
  constructor() {
    this.isActive = false;
    this.isTrafficBlocked = false;
    this.platform = process.platform;
    this.connectedDevices = new Map();
    this.ssid = 'Xbox-LagControl';
    this.password = generateHotspotPassword(12);
    this.interface = null;
    this.blockedPacketQueue = [];
    this.constantLagActive = false;
    this.constantLagMs = 150;
    this.constantLagTimer = null;
    this.constantLagTargets = new Map();
    this.bandwidthCap = null;
    this.bandwidthCapTargets = new Map();
    this._capabilityCache = null;
    this._capabilityCacheAt = 0;
    this._clientsCache = [];
    this._clientsCacheAt = 0;
    this._windowsStateCache = null;
    this._windowsStateCacheAt = 0;
    this.frozenTargetIps = [];
    this.selectedTargetMacs = [];
    this.freezeEngine = null;
    this.constantLagEngine = null;
    this._gamingPulseTimer = null;
    this.gamingModeActive = false;
    this._hotspotStartedAt = 0;
  }

  async shouldUseWinDivert() {
    const settings = await getSettings();
    if (settings.preferWinDivertForHotspot === false) {
      return false;
    }
    return windivertHotspot.hasBundle();
  }

  async tryWinDivertAvailable() {
    if (!(await this.shouldUseWinDivert())) {
      return false;
    }
    return windivertHotspot.isAvailable();
  }

  normalizeClientList(rows) {
    return rows
      .map((row) => ({
        ip: row.IPAddress || row.ip,
        mac: String(row.LinkLayerAddress || row.mac || '')
          .trim()
          .replace(/-/g, ':')
          .toUpperCase(),
        state: row.State || row.state || 'Unknown',
        isHost: (row.IPAddress || row.ip) === HOTSPOT_GATEWAY_IP,
        connected_at: new Date().toISOString()
      }))
      .filter(
        (d) =>
          d.mac &&
          d.ip &&
          d.mac !== '00:00:00:00:00:00' &&
          d.ip !== HOTSPOT_GATEWAY_IP &&
          !d.isHost
      );
  }

  async resolveTargetClients(targetMacs = null) {
    const clients =
      this._clientsCache.length > 0 ? this._clientsCache : await this.getConnectedDevices();
    if (!targetMacs || targetMacs.length === 0) {
      return clients;
    }
    const wanted = new Set(targetMacs.map((m) => normalizeMac(m)));
    return clients.filter((c) => wanted.has(normalizeMac(c.mac)));
  }

  setSelectedTargets(targetMacs = []) {
    this.selectedTargetMacs = [...new Set(targetMacs.map((m) => normalizeMac(m)))];
    return this.selectedTargetMacs;
  }

  async startHotspot(ssid, password) {
    try {
      if (this.isActive) {
        return { success: false, message: 'Hotspot already active' };
      }

      if (this.platform === 'win32') {
        const windows = await this.getWindowsHotspotState(true);
        if (windows.active) {
          this.isActive = true;
          this._hotspotStartedAt = Date.now();
          if (windows.ssid) this.ssid = windows.ssid;
          return {
            success: true,
            message: 'Windows Mobile Hotspot already running — linked to app',
            ssid: this.ssid,
            password: this.password
          };
        }
      }

      this.ssid = ssid || this.ssid;
      this.password = password || this.password;

      if (this.platform === 'win32') {
        await this.startHotspotWindows();
        this._windowsStateCache = {
          active: true,
          ssid: this.ssid,
          operationalState: 'On',
          reliable: true
        };
        this._windowsStateCacheAt = Date.now();
      } else if (this.platform === 'linux') {
        await this.startHotspotLinux();
      } else if (this.platform === 'darwin') {
        await this.startHotspotMac();
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }

      this.isActive = true;
      this._hotspotStartedAt = Date.now();
      this._windowsStateCache = null;
      this._windowsStateCacheAt = 0;
      console.log(`✓ Hotspot "${this.ssid}" started successfully`);

      return {
        success: true,
        message: 'Hotspot started',
        ssid: this.ssid,
        password: this.password
      };
    } catch (error) {
      console.error('Error starting hotspot:', error);
      throw error;
    }
  }

  async stopHotspot() {
    try {
      if (this.isTrafficBlocked) {
        await this.unfreezeConnection().catch(() => null);
      }

      if (!this.isActive) {
        return { success: true, message: 'Hotspot not active in app' };
      }

      if (this.platform === 'win32') {
        await this.stopHotspotWindows();
      } else if (this.platform === 'linux') {
        await this.stopHotspotLinux();
      } else if (this.platform === 'darwin') {
        await this.stopHotspotMac();
      }

      this.isActive = false;
      this.isTrafficBlocked = false;
      this._windowsStateCache = null;
      this._windowsStateCacheAt = 0;
      this.connectedDevices.clear();
      this.blockedPacketQueue = [];
      await this.stopConstantLag();
      await this.clearBandwidthCap();

      console.log('✓ Hotspot stopped');
      return { success: true, message: 'Hotspot stopped' };
    } catch (error) {
      console.error('Error stopping hotspot:', error);
      throw error;
    }
  }

  async freezeConnection(durationMs = null, targetMacs = null) {
    try {
      if (!this.isActive) {
        throw new Error('Hotspot not active');
      }

      if (this.isTrafficBlocked) {
        return { success: false, message: 'Traffic already blocked' };
      }

      const targets = await this.resolveTargetClients(targetMacs ?? this.selectedTargetMacs);
      if (targets.length === 0) {
        throw new Error('No hotspot clients selected — connect a device or check client list');
      }

      if (this.platform === 'win32') {
        await this.blockTrafficWindows(targets.map((t) => t.ip));
      } else if (this.platform === 'linux') {
        await this.blockTrafficLinux();
      } else if (this.platform === 'darwin') {
        await this.blockTrafficMac();
      }

      this.isTrafficBlocked = true;
      this.frozenTargetIps = targets.map((t) => t.ip);
      console.log(`❄️  Connection FROZEN for ${targets.length} client(s)`);

      if (durationMs) {
        setTimeout(async () => {
          try {
            await this.unfreezeConnection();
          } catch (error) {
            console.error('Error auto-unfreezing:', error);
          }
        }, durationMs);
      }

      return {
        success: true,
        message: `Frozen ${targets.length} client(s)`,
        duration: durationMs,
        targets: targets.map((t) => ({ mac: t.mac, ip: t.ip }))
      };
    } catch (error) {
      console.error('Error freezing connection:', error);
      throw error;
    }
  }

  async unfreezeConnection() {
    try {
      if (!this.isActive) {
        throw new Error('Hotspot not active');
      }

      if (!this.isTrafficBlocked) {
        return { success: false, message: 'Traffic not blocked' };
      }

      if (this.platform === 'win32') {
        await this.unblockTrafficWindows();
      } else if (this.platform === 'linux') {
        await this.unblockTrafficLinux();
      } else if (this.platform === 'darwin') {
        await this.unblockTrafficMac();
      }

      this.isTrafficBlocked = false;
      this.blockedPacketQueue = [];
      console.log('✓ Connection UNFROZEN - traffic restored');

      return { success: true, message: 'Connection unfrozen' };
    } catch (error) {
      console.error('Error unfreezing connection:', error);
      throw error;
    }
  }

  async pulseFreeze(count = 5, freezeMs = 150, unfreezeMs = 100, targetMacs = null) {
    try {
      if (!this.isActive) {
        throw new Error('Hotspot not active');
      }

      const targets = await this.resolveTargetClients(targetMacs ?? this.selectedTargetMacs);
      if (targets.length === 0) {
        throw new Error('No hotspot clients selected');
      }

      if (this.platform === 'win32' && (await this.tryWinDivertAvailable())) {
        console.log(`⚡ WinDivert pulse: ${count} pulses on ${targets.length} client(s)`);
        await windivertHotspot.runPulse(
          targets.map((t) => t.ip),
          freezeMs,
          unfreezeMs,
          count
        );
        console.log('✓ WinDivert pulse complete');
        return { success: true, message: `WinDivert pulse — ${count} spikes`, engine: 'windivert' };
      }

      console.log(`⚡ Starting pulse freeze: ${count} pulses`);

      for (let i = 0; i < count; i++) {
        await this.freezeConnection(null, targetMacs);
        await new Promise((resolve) => setTimeout(resolve, freezeMs));

        await this.unfreezeConnection();

        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, unfreezeMs));
        }
      }

      console.log('✓ Pulse freeze complete');
      return { success: true, message: `Completed ${count} freeze pulses` };
    } catch (error) {
      console.error('Error in pulse freeze:', error);
      throw error;
    }
  }

  async getWindowsCapability() {
    const now = Date.now();
    if (this._capabilityCache && now - this._capabilityCacheAt < 60_000) {
      return this._capabilityCache;
    }

    try {
      const script = path.join(SCRIPTS_DIR, 'hotspot_check.ps1');
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`,
        { timeout: 15000 }
      );
      const parsed = JSON.parse(stdout.trim());
      this._capabilityCache = parsed;
      this._capabilityCacheAt = now;
      return parsed;
    } catch (error) {
      const fallback = {
        isAdmin: false,
        hasWifi: false,
        hostedNetworkSupported: false,
        mobileHotspotAvailable: false,
        internetConnected: false,
        errors: [error.message]
      };
      this._capabilityCache = fallback;
      this._capabilityCacheAt = now;
      return fallback;
    }
  }

  async startHotspotWindows() {
    const python = await resolvePython();
    if (python?.command) {
      try {
        const script = path.join(SCRIPTS_DIR, 'hotspot_start.py');
        const { stdout, stderr } = await execAsync(
          `${quoteExecutable(python.command)} "${script}" --ssid "${this.ssid}" --password "${this.password}"`,
          { timeout: 60000 }
        );

        const output = (stdout || stderr || '').trim();
        console.log('[Windows] Hotspot start:', output);

        if (output.includes('OK:MOBILE_HOTSPOT')) {
          this.hotspotMode = 'mobile';
        } else if (output.includes('OK:HOSTED_NETWORK')) {
          this.hotspotMode = 'hosted';
        } else if (output.includes('OK:MOBILE_HOTSPOT_EXISTING')) {
          this.hotspotMode = 'mobile';
        } else {
          throw new Error(output || 'Hotspot start returned no confirmation');
        }

        this.interface = 'Local Area Connection* 9';
        return;
      } catch (error) {
        const msg = error.stderr || error.stdout || error.message || String(error);
        console.error('[Windows] Python hotspot error:', msg);
        throw this.formatHotspotError(msg);
      }
    }

    const script = path.join(SCRIPTS_DIR, 'hotspot_start.ps1');
    try {
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}" -Ssid "${this.ssid}" -Password "${this.password}"`,
        { timeout: 60000 }
      );

      const output = (stdout || stderr || '').trim();
      console.log('[Windows] Hotspot start (PS fallback):', output);

      if (output.includes('OK:MOBILE_HOTSPOT')) {
        this.hotspotMode = 'mobile';
      } else if (output.includes('OK:HOSTED_NETWORK')) {
        this.hotspotMode = 'hosted';
      } else {
        throw new Error(output || 'Hotspot start returned no confirmation');
      }

      this.interface = 'Local Area Connection* 9';
    } catch (error) {
      const msg = error.stderr || error.message || String(error);
      console.error('[Windows] Hotspot error:', msg);
      throw this.formatHotspotError(msg);
    }
  }

  formatHotspotError(msg) {
    if (msg.includes('ADMIN_REQUIRED') || msg.includes('access is denied')) {
      return new Error(
        'Must run as Administrator. Close the app, right-click PowerShell → Run as administrator, then npm run desktop'
      );
    }
    if (msg.includes('No module named') && msg.includes('winrt')) {
      return new Error(
        'Hotspot needs Python WinRT packages. Run: py -m pip install winrt-Windows.Networking.NetworkOperators winrt-Windows.Networking.Connectivity winrt-Windows.Foundation'
      );
    }
    if (msg.includes('HOTSPOT_UNSUPPORTED') || msg.includes('not available')) {
      return new Error(
        'Mobile Hotspot not supported on this PC. Enable it once in Windows Settings → Network & Internet → Mobile hotspot, then try again.'
      );
    }
    if (msg.includes('StartTethering')) {
      return new Error(
        'Windows blocked hotspot start. Open Settings → Mobile hotspot and turn it ON manually once, then try again.'
      );
    }

    return new Error(`Hotspot failed: ${msg.split('\n')[0]}`);
  }

  async stopHotspotWindows() {
    const python = await resolvePython();
    if (python?.command) {
      try {
        const script = path.join(SCRIPTS_DIR, 'hotspot_stop.py');
        await execAsync(`${quoteExecutable(python.command)} "${script}"`, { timeout: 30000 });
        console.log('[Windows] Mobile Hotspot stopped');
        return;
      } catch (error) {
        console.warn('Error stopping Windows hotspot (Python):', error.message);
      }
    }

    const script = path.join(SCRIPTS_DIR, 'hotspot_stop.ps1');
    try {
      await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`,
        { timeout: 30000 }
      );
      console.log('[Windows] Mobile Hotspot stopped');
    } catch (error) {
      console.warn('Error stopping Windows hotspot:', error.message);
    }
  }

  async blockTrafficWindows(targetIps = []) {
    try {
      const ips = [...new Set(targetIps.filter(Boolean))];
      if (ips.length === 0) {
        throw new Error('No client IPs to block');
      }

      if (await this.tryWinDivertAvailable()) {
        try {
          await windivertHotspot.startBlock(ips);
          this.frozenTargetIps = ips;
          this.freezeEngine = 'windivert';
          console.log(`❄️ WinDivert block active for ${ips.length} IP(s)`);
          return;
        } catch (error) {
          console.warn('WinDivert block failed, using firewall fallback:', error.message);
          await windivertHotspot.stopBlock().catch(() => null);
        }
      }

      for (const ip of ips) {
        const suffix = ipRuleSuffix(ip);
        await execAsync(
          `netsh advfirewall firewall add rule name="FREEZE_HOTSPOT_OUT_${suffix}" dir=out action=block remoteip=${ip} enable=yes`,
          { windowsHide: true }
        );
        await execAsync(
          `netsh advfirewall firewall add rule name="FREEZE_HOTSPOT_IN_${suffix}" dir=in action=block remoteip=${ip} enable=yes`,
          { windowsHide: true }
        );
      }
      this.frozenTargetIps = ips;
      this.freezeEngine = 'firewall';
    } catch (error) {
      throw new Error('Failed to block hotspot traffic');
    }
  }

  async unblockTrafficWindows() {
    try {
      if (this.freezeEngine === 'windivert') {
        await windivertHotspot.stopBlock();
        this.freezeEngine = null;
        this.frozenTargetIps = [];
        return;
      }

      const ips = this.frozenTargetIps?.length ? this.frozenTargetIps : [];
      for (const ip of ips) {
        const suffix = ipRuleSuffix(ip);
        await execAsync(`netsh advfirewall firewall delete rule name="FREEZE_HOTSPOT_OUT_${suffix}"`, {
          windowsHide: true
        }).catch(() => null);
        await execAsync(`netsh advfirewall firewall delete rule name="FREEZE_HOTSPOT_IN_${suffix}"`, {
          windowsHide: true
        }).catch(() => null);
      }
      await execAsync(`netsh advfirewall firewall delete rule name="FREEZE_HOTSPOT_OUT"`, {
        windowsHide: true
      }).catch(() => null);
      await execAsync(`netsh advfirewall firewall delete rule name="FREEZE_HOTSPOT_IN"`, {
        windowsHide: true
      }).catch(() => null);
      this.frozenTargetIps = [];
      this.freezeEngine = null;
    } catch (error) {
      console.warn('Error unblocking traffic:', error.message);
    }
  }

  async startHotspotLinux() {
    try {
      const interfaces = await this.getWirelessInterfaces();
      if (interfaces.length === 0) {
        throw new Error('No wireless interface found');
      }

      this.interface = interfaces[0];

      await execAsync(`sudo systemctl stop NetworkManager`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      await execAsync(`sudo ip link set ${this.interface} down`);
      await execAsync(`sudo ip addr flush dev ${this.interface}`);
      await execAsync(`sudo ip addr add 192.168.137.1/24 dev ${this.interface}`);
      await execAsync(`sudo ip link set ${this.interface} up`);

      const hostapdConf = `
interface=${this.interface}
driver=nl80211
ssid=${this.ssid}
hw_mode=g
channel=6
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=${this.password}
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
`;

      await execAsync(`echo "${hostapdConf}" | sudo tee /tmp/hostapd.conf`);

      await execAsync(`sudo hostapd -B /tmp/hostapd.conf`);

      await execAsync(`sudo sysctl -w net.ipv4.ip_forward=1`);

      await execAsync(`sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE`);
      await execAsync(`sudo iptables -A FORWARD -i ${this.interface} -o eth0 -j ACCEPT`);
      await execAsync(`sudo iptables -A FORWARD -i eth0 -o ${this.interface} -m state --state RELATED,ESTABLISHED -j ACCEPT`);

      console.log('[Linux] Hotspot configured');
    } catch (error) {
      console.error('Linux hotspot error:', error.message);
      throw new Error('Root privileges required for hotspot creation');
    }
  }

  async stopHotspotLinux() {
    try {
      await execAsync(`sudo killall hostapd 2>/dev/null || true`);
      await execAsync(`sudo systemctl start NetworkManager`);
      await execAsync(`sudo iptables -t nat -F`);
      await execAsync(`sudo iptables -F FORWARD`);
      console.log('[Linux] Hotspot stopped');
    } catch (error) {
      console.warn('Error stopping Linux hotspot:', error.message);
    }
  }

  async blockTrafficLinux() {
    try {
      await execAsync(`sudo iptables -A FORWARD -i ${this.interface} -j DROP`);
      await execAsync(`sudo iptables -A FORWARD -o ${this.interface} -j DROP`);
    } catch (error) {
      throw new Error('Failed to block traffic');
    }
  }

  async unblockTrafficLinux() {
    try {
      await execAsync(`sudo iptables -D FORWARD -i ${this.interface} -j DROP`);
      await execAsync(`sudo iptables -D FORWARD -o ${this.interface} -j DROP`);
    } catch (error) {
      console.warn('Error unblocking traffic:', error.message);
    }
  }

  async startHotspotMac() {
    try {
      const applescript = `
        tell application "System Events"
          tell process "SystemUIServer"
            tell (menu bar item 1 of menu bar 1 where description is "Wi-Fi")
              click
              click menu item "Create Network..." of menu 1
            end tell
          end tell
        end tell
      `;

      await execAsync(`osascript -e '${applescript}'`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('[macOS] Manual hotspot setup initiated');
      console.log('Note: Please configure the hotspot manually in System Preferences');

      this.interface = 'en0';
    } catch (error) {
      console.error('macOS hotspot error:', error.message);
      throw new Error('Hotspot creation requires manual configuration on macOS');
    }
  }

  async stopHotspotMac() {
    try {
      console.log('[macOS] Please disable Internet Sharing manually');
    } catch (error) {
      console.warn('Error stopping macOS hotspot:', error.message);
    }
  }

  async blockTrafficMac() {
    try {
      await execAsync(`sudo pfctl -e`);
      await execAsync(`echo "block drop quick on ${this.interface} all" | sudo pfctl -f -`);
    } catch (error) {
      throw new Error('Failed to block traffic');
    }
  }

  async unblockTrafficMac() {
    try {
      await execAsync(`sudo pfctl -F all`);
      await execAsync(`sudo pfctl -d`);
    } catch (error) {
      console.warn('Error unblocking traffic:', error.message);
    }
  }

  async startConstantLag(lagMs = 150, targetMacs = null) {
    if (!this.isActive) {
      throw new Error('Hotspot not active');
    }

    this.constantLagMs = Math.max(50, Math.min(2000, Number(lagMs) || 150));
    this.constantLagActive = true;

    const clients = await this.resolveTargetClients(targetMacs ?? this.selectedTargetMacs);
    const ips = clients.map((c) => c.ip).filter(Boolean);

    if (this.platform === 'win32' && ips.length > 0 && (await this.tryWinDivertAvailable())) {
      await this.stopConstantLag().catch(() => null);
      try {
        await windivertHotspot.startLag(ips, this.constantLagMs);
        this.constantLagEngine = 'windivert';
        for (const client of clients) {
          this.constantLagTargets.set(client.mac, { ip: client.ip });
        }
        return {
          success: true,
          message: `WinDivert constant lag — ${this.constantLagMs}ms on hotspot clients`,
          lagMs: this.constantLagMs,
          engine: 'windivert'
        };
      } catch (error) {
        console.warn('WinDivert lag failed, using ARP fallback:', error.message);
        await windivertHotspot.stopLag().catch(() => null);
        this.constantLagEngine = null;
      }
    }

    const apply = async () => {
      const liveClients = await this.resolveTargetClients(targetMacs ?? this.selectedTargetMacs);
      const { lagSwitch } = await import('./lagSwitch.js');
      const { networkScanner } = await import('./networkScanner.js');
      const net = await networkScanner.getLocalNetworkInfo();
      const activeMacs = new Set();

      for (const client of liveClients) {
        if (!client.mac || !client.ip) continue;
        activeMacs.add(client.mac);
        if (!lagSwitch.isActive(client.mac)) {
          try {
            await lagSwitch.startLag(
              client.mac,
              client.ip,
              this.constantLagMs,
              this.constantLagMs,
              net.interface
            );
            this.constantLagTargets.set(client.mac, { ip: client.ip });
          } catch (error) {
            console.warn(`Constant lag failed for ${client.mac}:`, error.message);
          }
        }
      }

      for (const [mac, data] of this.constantLagTargets.entries()) {
        if (!activeMacs.has(mac)) {
          await lagSwitch.stopLag(mac, data.ip).catch(() => null);
          this.constantLagTargets.delete(mac);
        }
      }
    };

    await apply();
    if (this.constantLagTimer) clearInterval(this.constantLagTimer);
    this.constantLagTimer = setInterval(() => apply().catch(() => null), 5000);

    return {
      success: true,
      message: `Constant lag active — ${this.constantLagMs}ms on hotspot clients`,
      lagMs: this.constantLagMs,
      engine: 'arp'
    };
  }

  async stopConstantLag() {
    this.constantLagActive = false;
    if (this.constantLagTimer) {
      clearInterval(this.constantLagTimer);
      this.constantLagTimer = null;
    }

    if (this.constantLagEngine === 'windivert') {
      await windivertHotspot.stopLag();
      this.constantLagEngine = null;
      this.constantLagTargets.clear();
      return { success: true, message: 'WinDivert constant lag stopped' };
    }

    const { lagSwitch } = await import('./lagSwitch.js');
    for (const [mac, data] of this.constantLagTargets.entries()) {
      await lagSwitch.stopLag(mac, data.ip).catch(() => null);
    }
    this.constantLagTargets.clear();
    this.constantLagEngine = null;

    return { success: true, message: 'Constant lag stopped' };
  }

  async setBandwidthCap(uploadKbps = 512, downloadKbps = 2048, targetMacs = null) {
    if (!this.isActive) {
      throw new Error('Hotspot not active');
    }

    this.bandwidthCap = {
      uploadKbps: Math.max(64, Number(uploadKbps) || 512),
      downloadKbps: Math.max(64, Number(downloadKbps) || 2048)
    };

    const clients = await this.resolveTargetClients(targetMacs ?? this.selectedTargetMacs);
    const { speedLimiter } = await import('./speedLimiter.js');
    const { networkScanner } = await import('./networkScanner.js');
    const net = await networkScanner.getLocalNetworkInfo();

    for (const client of clients) {
      if (!client.mac || !client.ip) continue;
      try {
        await speedLimiter.startLimit(
          client.mac,
          client.ip,
          this.bandwidthCap.uploadKbps,
          this.bandwidthCap.downloadKbps,
          net.interface
        );
        this.bandwidthCapTargets.set(client.mac, { ip: client.ip });
      } catch (error) {
        console.warn(`Bandwidth cap failed for ${client.mac}:`, error.message);
      }
    }

    return {
      success: true,
      message: `Hotspot cap set — ${this.bandwidthCap.uploadKbps}/${this.bandwidthCap.downloadKbps} Kbps`,
      ...this.bandwidthCap
    };
  }

  async clearBandwidthCap() {
    const { speedLimiter } = await import('./speedLimiter.js');
    for (const [mac, data] of this.bandwidthCapTargets.entries()) {
      await speedLimiter.stopLimit(mac, data.ip).catch(() => null);
    }
    this.bandwidthCapTargets.clear();
    this.bandwidthCap = null;
    return { success: true, message: 'Hotspot bandwidth cap removed' };
  }

  getSsidPresets() {
    return SSID_PRESETS;
  }

  async stopGamingMode() {
    if (this._gamingPulseTimer) {
      clearInterval(this._gamingPulseTimer);
      this._gamingPulseTimer = null;
    }
    this.gamingModeActive = false;
    await this.stopConstantLag().catch(() => null);
    return { success: true, message: 'Gaming mode stopped' };
  }

  async startGamingMode(targetMacs = null, options = {}) {
    if (!this.isActive) {
      throw new Error('Start hotspot first');
    }

    const settings = await getSettings();
    const lagMs = Math.max(50, Math.min(500, Number(options.lagMs ?? settings.gamingModeLagMs) || 120));
    const pulseIntervalSec = Math.max(
      10,
      Math.min(120, Number(options.pulseIntervalSec ?? settings.gamingModePulseIntervalSec) || 30)
    );
    const enablePulse = options.enablePulse !== false;

    await this.stopGamingMode().catch(() => null);

    const result = await this.startConstantLag(lagMs, targetMacs ?? this.selectedTargetMacs);
    this.gamingModeActive = true;

    if (enablePulse) {
      const macs = targetMacs ?? this.selectedTargetMacs;
      this._gamingPulseTimer = setInterval(() => {
        this.pulseFreeze(3, 150, 100, macs).catch(() => null);
      }, pulseIntervalSec * 1000);
    }

    return {
      success: true,
      message: `Gaming mode — ${lagMs}ms lag${enablePulse ? ` + pulse every ${pulseIntervalSec}s` : ''}`,
      lagMs,
      pulseIntervalSec,
      engine: this.constantLagEngine
    };
  }

  async applySsidPreset(presetId) {
    const preset = SSID_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error('Unknown SSID preset');
    }
    const settings = await getSettings();
    const password = settings.defaultHotspotPassword || generateHotspotPassword(12);
    this.ssid = preset.ssid;
    this.password = password;
    return { ...preset, password };
  }

  /** Best-effort cleanup on app exit or uninstall prep. */
  async forceCleanup(options = {}) {
    await this.stopGamingMode().catch(() => null);

    if (this.constantLagTimer) {
      clearInterval(this.constantLagTimer);
      this.constantLagTimer = null;
    }
    this.constantLagActive = false;

    await this.stopConstantLag().catch(() => null);
    await this.clearBandwidthCap().catch(() => null);

    if (this.platform === 'win32') {
      await this.unblockTrafficWindows().catch(() => null);
      await windivertHotspot.stopAll().catch(() => null);

      const settings = options.settings ?? (await getSettings().catch(() => ({})));
      const stopWindowsHotspot = options.stopWindowsHotspot ?? settings.stopHotspotOnQuit !== false;
      if (stopWindowsHotspot) {
        await this.stopHotspotWindows().catch(() => null);
      }
    } else if (this.isActive) {
      try {
        if (this.platform === 'linux') {
          await this.stopHotspotLinux();
        } else if (this.platform === 'darwin') {
          await this.stopHotspotMac();
        }
      } catch {
        // continue
      }
    }

    this.isActive = false;
    this.isTrafficBlocked = false;
    this.connectedDevices.clear();
    this.blockedPacketQueue = [];
    this.constantLagTargets.clear();
    this.bandwidthCapTargets.clear();
    this.bandwidthCap = null;
    this.freezeEngine = null;
    this.constantLagEngine = null;
  }

  async getWindowsHotspotState(force = false) {
    if (this.platform !== 'win32') {
      return { active: false, reliable: true };
    }

    const now = Date.now();
    if (!force && this._windowsStateCache && now - this._windowsStateCacheAt < 12_000) {
      return this._windowsStateCache;
    }

    try {
      const script = path.join(SCRIPTS_DIR, 'hotspot_state_fast.ps1');
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`,
        { timeout: 5000, windowsHide: true }
      );
      const parsed = JSON.parse(stdout.trim() || '{}');
      const state = {
        active: Boolean(parsed.active),
        ssid: parsed.ssid || null,
        operationalState: parsed.operationalState || (parsed.active ? 'On' : 'Off'),
        reliable: parsed.checked !== false
      };
      this._windowsStateCache = state;
      this._windowsStateCacheAt = now;
      return state;
    } catch (error) {
      console.warn('hotspot_state_fast.ps1 failed:', error.message);
      return {
        ...(this._windowsStateCache || { active: false, operationalState: 'unknown' }),
        reliable: false
      };
    }
  }

  async syncWindowsHotspotState() {
    if (this.platform !== 'win32') return;

    const windows = await this.getWindowsHotspotState();

    if (windows.active && !this.isActive) {
      this.isActive = true;
      if (windows.ssid) {
        this.ssid = windows.ssid;
      }
      return;
    }

    // Never tear down an active session on a failed/timeout state probe.
    if (!windows.reliable) {
      return;
    }

    // Windows can lag reporting "On" right after StartTethering.
    if (this._hotspotStartedAt && Date.now() - this._hotspotStartedAt < 90_000) {
      return;
    }

    if (!windows.active && this.isActive) {
      if (this.isTrafficBlocked) {
        await this.unblockTrafficWindows().catch(() => null);
      }
      await this.stopConstantLag().catch(() => null);
      await windivertHotspot.stopAll().catch(() => null);
      this.isActive = false;
      this.isTrafficBlocked = false;
      this._clientsCache = [];
      this._clientsCacheAt = 0;
    }
  }

  async getWirelessInterfaces() {
    try {
      const { stdout } = await execAsync(`iw dev | grep Interface | awk '{print $2}'`);
      return stdout.trim().split('\n').filter((i) => i);
    } catch {
      return [];
    }
  }

  async getConnectedDevices() {
    try {
      if (!this.isActive) {
        return [];
      }

      if (this.platform === 'win32') {
        try {
          const script = path.join(SCRIPTS_DIR, 'hotspot_clients.ps1');
          const { stdout } = await execAsync(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`,
            { timeout: 8000 }
          );
          const trimmed = stdout.trim();
          if (!trimmed) return [];

          const parsed = JSON.parse(trimmed);
          const rows = Array.isArray(parsed) ? parsed : [parsed];

          return this.normalizeClientList(rows);
        } catch {
          return [];
        }
      } else if (this.platform === 'linux') {
        const { stdout } = await execAsync(`sudo iw dev ${this.interface} station dump`);
        return this.parseConnectedDevicesLinux(stdout);
      }

      return [];
    } catch (error) {
      return [];
    }
  }

  parseConnectedDevicesWindows(output) {
    const devices = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/Station\s+(\S+)/);
      if (match) {
        devices.push({
          mac: match[1],
          connected_at: new Date().toISOString()
        });
      }
    }

    return devices;
  }

  parseConnectedDevicesLinux(output) {
    const devices = [];
    const stations = output.split('Station ');

    for (const station of stations) {
      const macMatch = station.match(/^(\S+)/);
      if (macMatch) {
        devices.push({
          mac: macMatch[1],
          connected_at: new Date().toISOString()
        });
      }
    }

    return devices;
  }

  async getStatus() {
    if (this.platform === 'win32') {
      await this.syncWindowsHotspotState();
    }

    const now = Date.now();
    let clients = this._clientsCache;
    const clientCacheMs = this.isTrafficBlocked || this.constantLagActive ? 8000 : 12_000;
    if (this.isActive && now - this._clientsCacheAt > clientCacheMs) {
      clients = await this.getConnectedDevices();
      this._clientsCache = clients;
      this._clientsCacheAt = now;
    } else if (!this.isActive) {
      clients = [];
      this._clientsCache = [];
      this._clientsCacheAt = now;
    }

    const windivertAvailable =
      this.platform === 'win32' ? windivertHotspot.hasBundle() : false;

    return {
      isActive: this.isActive,
      isTrafficBlocked: this.isTrafficBlocked,
      ssid: this.ssid,
      password: this.password,
      interface: this.interface,
      connectedDevices: clients.length,
      clients,
      hostIp: HOTSPOT_GATEWAY_IP,
      selectedTargetMacs: this.selectedTargetMacs,
      frozenTargetIps: this.frozenTargetIps,
      freezeEngine: this.freezeEngine,
      constantLagEngine: this.constantLagEngine,
      windivertAvailable,
      windowsHotspotActive: this._windowsStateCache?.active ?? null,
      windivert: windivertHotspot.getStatus(),
      constantLagActive: this.constantLagActive,
      constantLagMs: this.constantLagMs,
      gamingModeActive: this.gamingModeActive,
      bandwidthCap: this.bandwidthCap,
      ssidPresets: SSID_PRESETS,
      platform: this.platform
    };
  }
}

export const hotspotController = new HotspotController();
