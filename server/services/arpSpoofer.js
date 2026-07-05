import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '../utils/logger.js';
import { getScriptsDir } from '../utils/paths.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import {
  getNativeEnginePath,
  runNativeRestore
} from '../utils/nativeEngine.js';
import { networkScanner } from './networkScanner.js';
import { normalizeMac } from './arpTable.js';

const execAsync = promisify(exec);
const SCRIPTS_DIR = getScriptsDir();
const SPOOF_SCRIPT = path.join(SCRIPTS_DIR, 'arp_spoof.py');
const RESTORE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_restore.py');

export class ArpSpoofer {
  constructor() {
    this.activeCuts = new Map();
    this.gatewayIp = null;
    this.pythonCommand = null;
    this.onCutExit = null;
    this.lastNetwork = { iface: null, localIp: null };
  }

  setOnCutExit(callback) {
    this.onCutExit = callback;
  }

  async detectPython() {
    if (this.pythonCommand) {
      return this.pythonCommand;
    }

    const python = await resolvePython();
    this.pythonCommand = python?.command ?? null;
    return this.pythonCommand;
  }

  async resolveNetworkContext() {
    try {
      const info = await networkScanner.getLocalNetworkInfo();
      this.lastNetwork = { iface: info.interface, localIp: info.ip };
      return this.lastNetwork;
    } catch {
      return this.lastNetwork;
    }
  }

  async getGatewayIp() {
    if (this.gatewayIp) {
      return this.gatewayIp;
    }

    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix \'0.0.0.0/0\' | Sort-Object RouteMetric | Select-Object -First 1).NextHop"'
      );
      this.gatewayIp = stdout.trim();
      return this.gatewayIp;
    }

    const { stdout } = await execAsync(
      "ip route | awk '/default/ {print $3; exit}'"
    );
    this.gatewayIp = stdout.trim();
    return this.gatewayIp;
  }

  async startCut(macAddress, ipAddress) {
    const mac = normalizeMac(macAddress);
    if (this.activeCuts.has(mac)) {
      return { success: true, message: 'Device already cut', engine: this.activeCuts.get(mac).engine };
    }

    const gatewayIp = await this.getGatewayIp();
    if (!gatewayIp) {
      throw new Error('Could not detect your router/gateway IP');
    }

    const { iface, localIp } = await this.resolveNetworkContext();
    const nativePath = getNativeEnginePath();
    let child;
    let engine = 'python';

    if (nativePath) {
      engine = 'native';
      child = spawn(
        nativePath,
        ['cut', ipAddress, mac, gatewayIp, iface || '', localIp || ''],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    } else {
      const python = await this.detectPython();
      if (!python) {
        throw new Error(
          'Native engine or Python required for cutting devices. Run as Administrator.'
        );
      }
      child = spawn(python, [SPOOF_SCRIPT, ipAddress, mac, gatewayIp], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });
    }

    child.stdout.on('data', (data) => {
      logger.info(`[ARP:${engine}] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      logger.warn(`[ARP:${engine}] ${data.toString().trim()}`);
    });

    child.on('exit', (code) => {
      if (this.activeCuts.get(mac)?.process === child) {
        this.activeCuts.delete(mac);
        if (this.onCutExit) {
          this.onCutExit(mac, code);
        }
      }
      if (code && code !== 0) {
        logger.error(`[ARP:${engine}] Cut process exited ${code} for ${mac}`);
      }
    });

    this.activeCuts.set(mac, {
      process: child,
      ipAddress,
      gatewayIp,
      iface,
      localIp,
      engine,
      startedAt: Date.now()
    });

    logger.info(`Started ${engine} ARP cut for ${ipAddress} (${mac}) via gateway ${gatewayIp}`);
    return { success: true, message: 'Device cut from network', engine };
  }

  async stopCut(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.activeCuts.get(mac);
    if (!entry) {
      if (ipAddress) {
        await this.restoreArp(mac, ipAddress);
      }
      return { success: true, message: 'Device not cut' };
    }

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], {
          windowsHide: true
        });
      }
    } catch (error) {
      logger.warn(`Failed to stop ARP spoof for ${mac}: ${error.message}`);
    }

    this.activeCuts.delete(mac);
    await this.restoreArp(mac, ipAddress || entry.ipAddress, entry.gatewayIp, entry.iface, entry.localIp);
    logger.info(`Stopped ARP cut for ${mac}`);
    return { success: true, message: 'Device restored', engine: entry.engine };
  }

  async restoreArp(macAddress, ipAddress, gatewayIp = null, iface = null, localIp = null) {
    if (!ipAddress) return;

    const gateway = gatewayIp || (await this.getGatewayIp());
    const ctx = iface ? { iface, localIp } : await this.resolveNetworkContext();

    const restored = await runNativeRestore(
      ipAddress,
      macAddress,
      gateway,
      iface || ctx.iface,
      localIp || ctx.localIp
    );
    if (restored) return;

    const python = await this.detectPython();
    if (!python) return;

    try {
      await execAsync(
        `${quoteExecutable(python)} "${RESTORE_SCRIPT}" ${ipAddress} ${macAddress} ${gateway}`,
        { windowsHide: true }
      );
    } catch (error) {
      logger.warn(`ARP restore failed for ${macAddress}: ${error.message}`);
    }
  }

  async restorePersistedCuts(blockedDevices) {
    for (const device of blockedDevices) {
      try {
        await this.startCut(device.mac_address, device.ip_address);
        logger.info(`Restored cut for ${device.mac_address}`);
      } catch (error) {
        logger.warn(`Could not restore cut for ${device.mac_address}: ${error.message}`);
      }
    }
  }

  isCut(macAddress) {
    return this.activeCuts.has(normalizeMac(macAddress));
  }

  getActiveCuts() {
    return Array.from(this.activeCuts.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      gatewayIp: data.gatewayIp,
      engine: data.engine,
      startedAt: data.startedAt
    }));
  }

  stopAll() {
    const stops = [];
    for (const [mac, data] of this.activeCuts.entries()) {
      stops.push(this.stopCut(mac, data.ipAddress));
    }
    return Promise.allSettled(stops);
  }
}

export const arpSpoofer = new ArpSpoofer();
