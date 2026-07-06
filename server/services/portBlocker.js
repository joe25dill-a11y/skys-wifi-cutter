import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { filterNoisyPcapLog } from '../utils/logNoise.js';
import { getNativeEnginePath, runNativeRestore } from '../utils/nativeEngine.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { lagSwitch } from './lagSwitch.js';
import { dnsHijack } from './dnsHijack.js';
import { networkScanner } from './networkScanner.js';
import { normalizeMac } from './arpTable.js';
import { resolveBlockedPorts } from './portBlockPresets.js';
import path from 'path';
import { getScriptsDir } from '../utils/paths.js';

const RESTORE_SCRIPT = path.join(getScriptsDir(), 'arp_restore.py');

export class PortBlocker {
  constructor() {
    this.active = new Map();
  }

  isBlocking(macAddress) {
    return this.active.has(normalizeMac(macAddress));
  }

  getActiveBlocks() {
    return Array.from(this.active.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      ports: data.ports,
      preset: data.preset,
      label: data.label,
      dropped: data.dropped,
      startedAt: data.startedAt
    }));
  }

  async start(macAddress, ipAddress, options = {}) {
    const mac = normalizeMac(macAddress);

    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore before port blocking');
    }
    if (speedLimiter.isLimited(mac)) {
      throw new Error('Speed limit active — remove before port blocking');
    }
    if (lagSwitch.isActive(mac)) {
      throw new Error('Lag active — stop lag before port blocking');
    }
    if (dnsHijack.isActive(mac)) {
      throw new Error('DNS lock active — remove before port blocking');
    }
    const { oneWayKill } = await import('./oneWayKill.js');
    if (oneWayKill.isActive(mac)) {
      throw new Error('One-way kill active — stop it before port blocking');
    }

    const resolved = resolveBlockedPorts(options);
    const existing = this.active.get(mac);
    if (
      existing &&
      existing.preset === resolved.preset &&
      JSON.stringify(existing.ports) === JSON.stringify(resolved.ports)
    ) {
      return { success: true, message: 'Port block already active', ...resolved };
    }

    if (existing) {
      await this.stop(mac, ipAddress);
    }

    const nativePath = getNativeEnginePath();
    if (!nativePath) {
      throw new Error('Native engine required for port blocking (Npcap + admin)');
    }

    const gatewayIp = await arpSpoofer.getGatewayIp();
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    const portsArg = resolved.ports.join(',');

    const child = spawn(
      nativePath,
      [
        'portblock',
        ipAddress,
        mac,
        gatewayIp,
        networkInfo.interface || '',
        networkInfo.ip || '',
        portsArg
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    let startError = null;
    let started = false;

    const entry = {
      process: child,
      ipAddress,
      gatewayIp,
      iface: networkInfo.interface,
      localIp: networkInfo.ip,
      ports: resolved.ports,
      preset: resolved.preset,
      label: resolved.label,
      dropped: 0,
      startedAt: Date.now()
    };

    child.stdout?.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.type === 'started') started = true;
          if (msg.type === 'error') startError = msg.message || 'Port block failed';
          if (msg.type === 'portblock_stats' && typeof msg.dropped === 'number') {
            entry.dropped = msg.dropped;
          }
        } catch {
          // ignore
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = filterNoisyPcapLog(data.toString());
      if (text) logger.warn(`[PortBlock:${mac}] ${text}`);
    });

    const startup = await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, value) => {
        if (settled) return;
        settled = true;
        fn(value);
      };

      child.on('exit', (code) => {
        if (this.active.get(mac)?.process === child) {
          this.active.delete(mac);
          this.restoreArp(mac, ipAddress, gatewayIp, networkInfo.interface, networkInfo.ip).catch(
            () => null
          );
        }
        if (!settled && code) {
          done(
            reject,
            new Error(startError || `Port block failed to start (exit ${code})`)
          );
          return;
        }
        if (code && code !== 0) {
          logger.warn(`[PortBlock] exited ${code} for ${mac}`);
        }
      });

      setTimeout(() => {
        if (settled) return;
        if (startError) {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          done(reject, new Error(startError));
          return;
        }
        if (child.exitCode != null && child.exitCode !== 0) {
          done(reject, new Error(`Port block failed to start (exit ${child.exitCode})`));
          return;
        }
        if (!started) {
          try {
            child.kill('SIGTERM');
          } catch {
            // ignore
          }
          done(reject, new Error('Port block did not confirm start — check admin rights and Npcap'));
          return;
        }
        done(resolve, true);
      }, 1200);
    });

    if (!startup) {
      throw new Error('Port block failed to start');
    }

    this.active.set(mac, entry);
    logger.info(`Port block started for ${ipAddress} (${mac}): ${resolved.label}`);

    return {
      success: true,
      message: `Blocking ${resolved.ports.length} port(s) — ${resolved.label}`,
      ...resolved,
      engine: 'native'
    };
  }

  async stop(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.active.get(mac);
    if (!entry) {
      return { success: true, message: 'Port block not active' };
    }

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], { windowsHide: true });
      }
    } catch (error) {
      logger.warn(`Failed to stop port block for ${mac}: ${error.message}`);
    }

    this.active.delete(mac);
    await this.restoreArp(
      mac,
      ipAddress || entry.ipAddress,
      entry.gatewayIp,
      entry.iface,
      entry.localIp
    );

    return { success: true, message: 'Port block removed' };
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
    } catch (error) {
      logger.warn(`ARP restore after port block failed: ${error.message}`);
    }
  }

  stopAll() {
    for (const [mac, entry] of this.active.entries()) {
      this.stop(mac, entry.ipAddress).catch(() => null);
    }
  }
}

export const portBlocker = new PortBlocker();
