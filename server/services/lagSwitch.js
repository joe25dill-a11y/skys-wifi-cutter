import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '../utils/logger.js';
import { getScriptsDir } from '../utils/paths.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { getNativeEnginePath, runNativeRestore } from '../utils/nativeEngine.js';
import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { networkScanner } from './networkScanner.js';
import { attachMitmParser } from './mitmMeter.js';
import { normalizeMac } from './arpTable.js';

const execAsync = promisify(exec);
const SCRIPTS_DIR = getScriptsDir();
const LAG_SCRIPT = path.join(SCRIPTS_DIR, 'arp_lag.py');
const PULSE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_lag_pulse.py');
const RESTORE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_restore.py');

export class LagSwitch {
  constructor() {
    this.activeLags = new Map();
    this.pulseProcesses = new Map();
    this.ifaceName = null;
  }

  async enableForwarding(iface) {
    if (!iface || process.platform !== 'win32') {
      return;
    }
    try {
      await execAsync(
        `netsh interface ipv4 set interface "${iface}" forwarding=enabled`,
        { windowsHide: true }
      );
      this.ifaceName = iface;
    } catch (error) {
      logger.warn(`Could not enable IP forwarding: ${error.message}`);
    }
  }

  resolveMode(outgoingMs, incomingMs) {
    if (outgoingMs > 0 && incomingMs > 0) return 'all';
    if (incomingMs > 0) return 'incoming';
    if (outgoingMs > 0) return 'outgoing';
    return 'all';
  }

  async startLag(macAddress, ipAddress, outgoingMs, incomingMs, iface, uploadKbps = 0, downloadKbps = 0) {
    const mac = normalizeMac(macAddress);

    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore before lag switch');
    }
    if (speedLimiter.isLimited(mac)) {
      throw new Error('Speed limit active — remove it before lag switch');
    }
    const { dnsHijack } = await import('./dnsHijack.js');
    if (dnsHijack.isActive(mac)) {
      throw new Error('DNS block active — remove before lag switch');
    }
    const { portBlocker } = await import('./portBlocker.js');
    if (portBlocker.isBlocking(mac)) {
      throw new Error('Port block active — remove before lag switch');
    }
    const { oneWayKill } = await import('./oneWayKill.js');
    if (oneWayKill.isActive(mac)) {
      throw new Error('One-way kill active — stop it before lag switch');
    }

    await this.stopLag(mac, ipAddress);

    const gatewayIp = await arpSpoofer.getGatewayIp();
    const mode = this.resolveMode(outgoingMs, incomingMs);

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
          'lag',
          ipAddress,
          mac,
          gatewayIp,
          iface || '',
          localIp || '',
          String(outgoingMs),
          String(incomingMs),
          mode,
          String(uploadKbps),
          String(downloadKbps)
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    } else {
      const python = await resolvePython();
      if (!python?.command) {
        throw new Error('Native engine or Python + Scapy required for lag switch');
      }
      child = spawn(
        python.command,
        [
          LAG_SCRIPT,
          ipAddress,
          mac,
          gatewayIp,
          iface,
          String(outgoingMs),
          String(incomingMs),
          mode,
          String(uploadKbps),
          String(downloadKbps)
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    }

    attachMitmParser(child);
    child.stdout.on('data', (d) => logger.info(`[Lag:${engine}] ${d.toString().trim()}`));
    child.stderr.on('data', (d) => logger.warn(`[Lag:${engine}] ${d.toString().trim()}`));

    child.on('exit', (code) => {
      if (this.activeLags.get(mac)?.process === child) {
        this.activeLags.delete(mac);
        this.restoreArp(mac, ipAddress, gatewayIp).catch(() => null);
        if (code && code !== 0) {
          logger.error(`[Lag:${engine}] exited ${code} for ${mac}`);
        }
      }
    });

    this.activeLags.set(mac, {
      process: child,
      ipAddress,
      outgoingMs,
      incomingMs,
      uploadKbps,
      downloadKbps,
      mode,
      gatewayIp,
      engine,
      startedAt: Date.now()
    });

    return {
      success: true,
      engine,
      message: `Lag on (${engine}) — ${incomingMs}ms in / ${outgoingMs}ms out`
    };
  }

  async stopLag(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.activeLags.get(mac);
    if (!entry) {
      return { success: true, message: 'No lag switch active' };
    }

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], {
          windowsHide: true
        });
      }
    } catch (error) {
      logger.warn(`Failed to stop lag for ${mac}: ${error.message}`);
    }

    this.activeLags.delete(mac);
    await this.restoreArp(mac, ipAddress || entry.ipAddress, entry.gatewayIp);
    return { success: true, message: 'Lag switch off' };
  }

  async triggerPulse(
    macAddress,
    ipAddress,
    iface,
    { incomingMs = 800, outgoingMs = 0, freezeMs = 200, unfreezeMs = 100, count = 6 } = {}
  ) {
    const mac = normalizeMac(macAddress);

    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore before pulse lag');
    }

    await this.stopLag(mac, ipAddress);

    const gatewayIp = await arpSpoofer.getGatewayIp();
    await this.enableForwarding(iface);

    let localIp = '';
    try {
      const networkInfo = await networkScanner.getLocalNetworkInfo();
      localIp = networkInfo.ip;
    } catch {
      // optional
    }

    const nativePath = getNativeEnginePath();
    let child;
    let engine = 'python';

    if (nativePath) {
      engine = 'native';
      child = spawn(
        nativePath,
        [
          'pulse',
          ipAddress,
          mac,
          gatewayIp,
          iface || '',
          localIp || '',
          String(incomingMs),
          String(outgoingMs),
          String(freezeMs),
          String(unfreezeMs),
          String(count)
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    } else {
      const python = await resolvePython();
      if (!python?.command) {
        throw new Error('Native engine or Python + Scapy required for ghost pulse');
      }
      child = spawn(
        python.command,
        [
          PULSE_SCRIPT,
          ipAddress,
          mac,
          gatewayIp,
          iface,
          String(incomingMs),
          String(outgoingMs),
          String(freezeMs),
          String(unfreezeMs),
          String(count)
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
      );
    }

    child.stdout.on('data', (d) => logger.info(`[LagPulse:${engine}] ${d.toString().trim()}`));

    child.on('exit', () => {
      this.pulseProcesses.delete(mac);
      this.restoreArp(mac, ipAddress, gatewayIp).catch(() => null);
    });

    this.pulseProcesses.set(mac, child);

    return {
      success: true,
      engine,
      message: `Ghost pulse (${engine}) — ${count}x, ${incomingMs}ms incoming lag`
    };
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
      logger.warn(`ARP restore after lag failed: ${error.message}`);
    }
  }

  isActive(macAddress) {
    return this.activeLags.has(normalizeMac(macAddress));
  }

  getActiveLags() {
    return Array.from(this.activeLags.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      outgoingMs: data.outgoingMs,
      incomingMs: data.incomingMs,
      uploadKbps: data.uploadKbps,
      downloadKbps: data.downloadKbps,
      mode: data.mode,
      engine: data.engine,
      startedAt: data.startedAt
    }));
  }

  stopAll() {
    for (const [mac, data] of this.activeLags.entries()) {
      this.stopLag(mac, data.ipAddress);
    }
    for (const [mac, proc] of this.pulseProcesses.entries()) {
      try {
        proc.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.pulseProcesses.delete(mac);
    }
  }
}

export const lagSwitch = new LagSwitch();
