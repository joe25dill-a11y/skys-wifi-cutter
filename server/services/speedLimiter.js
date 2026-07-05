import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '../utils/logger.js';
import { getScriptsDir } from '../utils/paths.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { getNativeEnginePath, runNativeRestore } from '../utils/nativeEngine.js';
import { arpSpoofer } from './arpSpoofer.js';
import { networkScanner } from './networkScanner.js';
import { attachMitmParser } from './mitmMeter.js';
import { normalizeMac } from './arpTable.js';

const execAsync = promisify(exec);
const SCRIPTS_DIR = getScriptsDir();
const THROTTLE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_throttle.py');
const RESTORE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_restore.py');

const UNLIMITED_KBPS = 900_000;

export class SpeedLimiter {
  constructor() {
    this.activeLimits = new Map();
    this.ifaceName = null;
  }

  isUnlimited(uploadKbps, downloadKbps) {
    return uploadKbps >= UNLIMITED_KBPS && downloadKbps >= UNLIMITED_KBPS;
  }

  async enableForwarding(iface) {
    if (!iface || process.platform !== 'win32') return;
    try {
      await execAsync(
        `netsh interface ipv4 set interface "${iface}" forwarding=enabled`,
        { windowsHide: true }
      );
      this.ifaceName = iface;
    } catch (error) {
      logger.warn(`Could not enable IP forwarding on ${iface}: ${error.message}`);
    }
  }

  async startLimit(macAddress, ipAddress, uploadKbps, downloadKbps, iface) {
    if (this.isUnlimited(uploadKbps, downloadKbps)) {
      return this.stopLimit(macAddress, ipAddress);
    }

    const mac = normalizeMac(macAddress);
    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore it before applying a speed limit');
    }
    const { oneWayKill } = await import('./oneWayKill.js');
    if (oneWayKill.isActive(mac)) {
      throw new Error('One-way kill active — stop it before speed limiting');
    }
    const { dnsHijack } = await import('./dnsHijack.js');
    if (dnsHijack.isActive(mac)) {
      throw new Error('DNS block active — remove before speed limiting');
    }
    const { portBlocker } = await import('./portBlocker.js');
    if (portBlocker.isBlocking(mac)) {
      throw new Error('Port block active — remove before speed limiting');
    }
    const { lagSwitch } = await import('./lagSwitch.js');
    if (lagSwitch.isActive(mac)) {
      throw new Error('Lag active — stop lag before speed limiting');
    }

    const existing = this.activeLimits.get(mac);
    if (
      existing &&
      existing.uploadKbps === uploadKbps &&
      existing.downloadKbps === downloadKbps
    ) {
      return { success: true, message: 'Speed limit already active', engine: existing.engine };
    }

    if (existing) {
      await this.stopLimit(mac, ipAddress);
    }

    const gatewayIp = await arpSpoofer.getGatewayIp();
    if (!gatewayIp) {
      throw new Error('Could not detect gateway IP');
    }

    let localIp = '';
    try {
      const networkInfo = await networkScanner.getLocalNetworkInfo();
      localIp = networkInfo.ip;
    } catch {
      // optional
    }

    await this.enableForwarding(iface);

    const nativePath = getNativeEnginePath();
    let child;
    let engine = 'python';

    if (nativePath) {
      engine = 'native';
      child = spawn(
        nativePath,
        [
          'throttle',
          ipAddress,
          mac,
          gatewayIp,
          iface || '',
          localIp || '',
          String(uploadKbps),
          String(downloadKbps)
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    } else {
      const python = await resolvePython();
      if (!python?.command) {
        throw new Error('Native engine or Python + Scapy required for speed limiting');
      }
      child = spawn(
        python.command,
        [
          THROTTLE_SCRIPT,
          ipAddress,
          mac,
          gatewayIp,
          String(uploadKbps),
          String(downloadKbps),
          iface,
          localIp
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    }

    attachMitmParser(child);
    child.stdout.on('data', (data) => {
      logger.info(`[Throttle:${engine}] ${data.toString().trim()}`);
    });
    child.stderr.on('data', (data) => {
      logger.warn(`[Throttle:${engine}] ${data.toString().trim()}`);
    });

    child.on('exit', (code) => {
      if (this.activeLimits.get(mac)?.process === child) {
        this.activeLimits.delete(mac);
        this.restoreArp(mac, ipAddress, gatewayIp).catch(() => null);
        if (code && code !== 0) {
          logger.error(`[Throttle:${engine}] Process exited ${code} for ${mac}`);
        }
      }
    });

    this.activeLimits.set(mac, {
      process: child,
      ipAddress,
      uploadKbps,
      downloadKbps,
      gatewayIp,
      engine,
      startedAt: Date.now()
    });

    logger.info(`Speed limit ${mac} (${engine}): up ${uploadKbps} / down ${downloadKbps} kbit`);

    return {
      success: true,
      engine,
      message: `Limited to ${uploadKbps} kbps up / ${downloadKbps} kbps down (${engine})`
    };
  }

  async stopLimit(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.activeLimits.get(mac);
    if (!entry) {
      return { success: true, message: 'No active speed limit' };
    }

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], {
          windowsHide: true
        });
      }
    } catch (error) {
      logger.warn(`Failed to stop throttle for ${mac}: ${error.message}`);
    }

    this.activeLimits.delete(mac);
    await this.restoreArp(mac, ipAddress || entry.ipAddress, entry.gatewayIp);
    return { success: true, message: 'Speed limit removed' };
  }

  async restoreArp(macAddress, ipAddress, gatewayIp) {
    if (!ipAddress || !gatewayIp) return;

    let networkInfo = null;
    try {
      networkInfo = await networkScanner.getLocalNetworkInfo();
    } catch {
      // optional
    }

    const restored = await runNativeRestore(
      ipAddress,
      macAddress,
      gatewayIp,
      networkInfo?.interface,
      networkInfo?.ip
    );
    if (restored) return;

    const python = await resolvePython();
    if (!python?.command) return;

    try {
      await execAsync(
        `${quoteExecutable(python.command)} "${RESTORE_SCRIPT}" ${ipAddress} ${macAddress} ${gatewayIp}`,
        { windowsHide: true }
      );
    } catch (error) {
      logger.warn(`ARP restore after throttle failed for ${macAddress}: ${error.message}`);
    }
  }

  isLimited(macAddress) {
    return this.activeLimits.has(normalizeMac(macAddress));
  }

  getActiveLimits() {
    return Array.from(this.activeLimits.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      uploadKbps: data.uploadKbps,
      downloadKbps: data.downloadKbps,
      engine: data.engine,
      startedAt: data.startedAt
    }));
  }

  stopAll() {
    for (const [mac, data] of this.activeLimits.entries()) {
      this.stopLimit(mac, data.ipAddress);
    }
  }
}

export const speedLimiter = new SpeedLimiter();
