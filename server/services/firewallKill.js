import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { normalizeMac } from './arpTable.js';
import { logAudit } from '../storage/auditLogStore.js';
import { releaseMitmForDevice } from '../utils/mitmRelease.js';

const execAsync = promisify(exec);

function ruleName(ip, direction) {
  return `SKYS_KILL_${direction}_${ip.replace(/\./g, '_')}`;
}

export class FirewallKill {
  constructor() {
    this.active = new Map();
  }

  isActive(macAddress) {
    return this.active.has(normalizeMac(macAddress));
  }

  getActive() {
    return Array.from(this.active.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      startedAt: data.startedAt
    }));
  }

  async start(macAddress, ipAddress) {
    if (process.platform !== 'win32') {
      throw new Error('Full firewall kill requires Windows');
    }

    const mac = normalizeMac(macAddress);
    if (this.active.has(mac)) {
      return { success: true, message: 'Firewall kill already active' };
    }

    await releaseMitmForDevice(mac, ipAddress);

    try {
      await execAsync(
        `netsh advfirewall firewall add rule name="${ruleName(ipAddress, 'OUT')}" dir=out action=block remoteip=${ipAddress} enable=yes`,
        { windowsHide: true }
      );
      await execAsync(
        `netsh advfirewall firewall add rule name="${ruleName(ipAddress, 'IN')}" dir=in action=block remoteip=${ipAddress} enable=yes`,
        { windowsHide: true }
      );
    } catch (error) {
      throw new Error(`Firewall kill failed — run as Administrator: ${error.message}`);
    }

    this.active.set(mac, { ipAddress, startedAt: Date.now() });
    logAudit('firewall_kill_start', { mac, ip: ipAddress });
    logger.info(`Firewall kill active for ${ipAddress} (${mac})`);
    return { success: true, message: `Full kill active — all traffic blocked for ${ipAddress}` };
  }

  async stop(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.active.get(mac);
    const ip = ipAddress || entry?.ipAddress;
    if (!entry && !ip) {
      return { success: true, message: 'Firewall kill not active' };
    }

    if (process.platform === 'win32' && ip) {
      try {
        await execAsync(`netsh advfirewall firewall delete rule name="${ruleName(ip, 'OUT')}"`, {
          windowsHide: true
        });
        await execAsync(`netsh advfirewall firewall delete rule name="${ruleName(ip, 'IN')}"`, {
          windowsHide: true
        });
      } catch {
        // ignore
      }
    }

    this.active.delete(mac);
    logAudit('firewall_kill_stop', { mac, ip });
    return { success: true, message: 'Firewall kill removed' };
  }

  stopAll() {
    for (const [mac, entry] of this.active.entries()) {
      this.stop(mac, entry.ipAddress).catch(() => null);
    }
  }
}

export const firewallKill = new FirewallKill();
