import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { arpSpoofer } from './arpSpoofer.js';

const execAsync = promisify(exec);

let driftTimer = null;
let baselineGatewayMac = null;
let driftAlerts = [];
let localMacsCache = { macs: new Set(), at: 0 };

function normalizeMac(mac) {
  return String(mac || '')
    .toUpperCase()
    .replace(/-/g, ':');
}

async function getLocalMacs() {
  if (Date.now() - localMacsCache.at < 60_000) {
    return localMacsCache.macs;
  }

  const macs = new Set();
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-NetAdapter | Where-Object { $_.Status -eq \'Up\' -and $_.MacAddress } | ForEach-Object { $_.MacAddress }"',
        { windowsHide: true }
      );
      for (const line of stdout.split(/\r?\n/)) {
        const mac = normalizeMac(line.trim());
        if (mac.length >= 11) macs.add(mac);
      }
    } else {
      const { stdout } = await execAsync('ip link', { windowsHide: true });
      for (const line of stdout.split('\n')) {
        const match = line.match(/link\/\w+\s+([0-9a-f:]{11,17})/i);
        if (match) macs.add(normalizeMac(match[1]));
      }
    }
  } catch {
    // optional
  }

  localMacsCache = { macs, at: Date.now() };
  return macs;
}

function isLocalMac(mac, localMacs) {
  return localMacs.has(normalizeMac(mac));
}

async function isAppManipulatingNetwork() {
  if (arpSpoofer.getActiveCuts().length > 0) return true;

  try {
    const { deviceMeter } = await import('./deviceMeter.js');
    if (deviceMeter.getMeteringMacs().length > 0) return true;
  } catch {
    // ignore
  }

  try {
    const { lagController } = await import('./lagController.js');
    if (lagController.getActiveLags().length > 0) return true;
  } catch {
    // ignore
  }

  try {
    const { hotspotController } = await import('./hotspotController.js');
    const hs = await hotspotController.getStatus();
    if (hs.isTrafficBlocked || hs.constantLagActive || hs.gamingModeActive) return true;
  } catch {
    // ignore
  }

  return false;
}

export class NetworkDefense {
  constructor() {
    this.isActive = false;
    this.interval = null;
    this.gatewayIp = null;
    this.gatewayMac = null;
  }

  async resolveGateway() {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix \'0.0.0.0/0\' | Sort-Object RouteMetric | Select-Object -First 1).NextHop"'
      );
      this.gatewayIp = stdout.trim();
    } else {
      const { stdout } = await execAsync(
        "ip route | awk '/default/ {print $3; exit}'"
      );
      this.gatewayIp = stdout.trim();
    }

    if (!this.gatewayIp) {
      throw new Error('Could not detect gateway');
    }

    try {
      const flag = process.platform === 'win32' ? '-n' : '-c';
      const wait = process.platform === 'win32' ? '-w' : '-W';
      const unit = process.platform === 'win32' ? '1000' : '1';
      await execAsync(`ping ${flag} 1 ${wait} ${unit} ${this.gatewayIp}`, {
        windowsHide: true,
        timeout: 4000
      });
    } catch {
      // gateway may block ICMP
    }

    const { stdout } = await execAsync(`arp -a ${this.gatewayIp}`, { windowsHide: true });
    const macMatch = stdout.match(/([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})/);
    if (!macMatch) {
      throw new Error('Could not resolve gateway MAC — ping your router first');
    }

    this.gatewayMac = macMatch[0].toUpperCase().replace(/-/g, ':');
    return { ip: this.gatewayIp, mac: this.gatewayMac };
  }

  async pinGatewayArp() {
    const gateway = await this.resolveGateway();

    if (process.platform === 'win32') {
      await execAsync(`arp -s ${gateway.ip} ${gateway.mac.replace(/:/g, '-')}`);
    } else {
      await execAsync(`sudo arp -s ${gateway.ip} ${gateway.mac}`);
    }

    logger.info(`Pinned gateway ARP: ${gateway.ip} -> ${gateway.mac}`);
    return gateway;
  }

  async unpinGatewayArp() {
    if (!this.gatewayIp) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        await execAsync(`arp -d ${this.gatewayIp}`);
      } else {
        await execAsync(`sudo arp -d ${this.gatewayIp}`);
      }
    } catch (error) {
      logger.warn(`Failed to unpin gateway ARP: ${error.message}`);
    }
  }

  async enable() {
    if (this.isActive) {
      return { success: true, message: 'Defense already active' };
    }

    const gateway = await this.pinGatewayArp();

    // Re-pin every 30s — helps resist simple ARP spoof attacks on your PC.
    this.interval = setInterval(() => {
      this.pinGatewayArp().catch((err) => {
        logger.warn(`Defense refresh failed: ${err.message}`);
      });
    }, 30_000);

    this.isActive = true;
    return {
      success: true,
      message: 'Network defense enabled',
      gateway
    };
  }

  async disable() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    await this.unpinGatewayArp();
    this.isActive = false;
    return { success: true, message: 'Network defense disabled' };
  }

  getStatus() {
    return {
      isActive: this.isActive,
      gatewayIp: this.gatewayIp,
      gatewayMac: this.gatewayMac
    };
  }
}

export const networkDefense = new NetworkDefense();

export function startGatewayDriftMonitor() {
  if (driftTimer) return;
  driftTimer = setInterval(() => {
    networkDefense
      .resolveGateway()
      .then(async () => {
        const current = networkDefense.gatewayMac;
        if (!current) return;

        const localMacs = await getLocalMacs();

        if (await isAppManipulatingNetwork()) {
          driftAlerts = [];
          return;
        }

        // When we meter/cut, Windows ARP cache may show OUR MAC for the router — not an attack.
        if (isLocalMac(current, localMacs)) {
          driftAlerts = [];
          return;
        }

        if (!baselineGatewayMac) {
          baselineGatewayMac = current;
          return;
        }

        if (baselineGatewayMac === current) {
          driftAlerts = [];
          return;
        }

        if (isLocalMac(baselineGatewayMac, localMacs)) {
          baselineGatewayMac = current;
          driftAlerts = [];
          return;
        }

        driftAlerts = [
          {
            type: 'gateway_drift',
            message: `Router MAC changed (${baselineGatewayMac} → ${current}) — check your gateway if you did not change networks`,
            previousMac: baselineGatewayMac,
            currentMac: current
          }
        ];
        logger.warn(`Gateway MAC drift detected: ${baselineGatewayMac} -> ${current}`);
        arpSpoofer.invalidateGatewayCache();
        baselineGatewayMac = current;
      })
      .catch((err) => {
        logger.debug(`Gateway drift check failed: ${err.message}`);
      });
  }, 30_000);
}

export function clearGatewayDriftAlerts() {
  driftAlerts = [];
}

export function getGatewayDriftAlerts() {
  return driftAlerts;
}

export function stopGatewayDriftMonitor() {
  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
  }
}
