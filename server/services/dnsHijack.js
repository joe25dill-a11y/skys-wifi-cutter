import { spawn } from 'child_process';
import logger from '../utils/logger.js';
import { getNativeEnginePath, runNativeRestore } from '../utils/nativeEngine.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { lagSwitch } from './lagSwitch.js';
import { networkScanner } from './networkScanner.js';
import { normalizeMac } from './arpTable.js';
import { resolveBlockedDomains } from './dnsBlockPresets.js';
import path from 'path';
import { getScriptsDir } from '../utils/paths.js';

const RESTORE_SCRIPT = path.join(getScriptsDir(), 'arp_restore.py');

export class DnsHijack {
  constructor() {
    this.active = new Map();
  }

  isActive(macAddress) {
    return this.active.has(normalizeMac(macAddress));
  }

  getActiveMacs() {
    return Array.from(this.active.keys());
  }

  getActiveBlocks() {
    return Array.from(this.active.entries()).map(([mac, data]) => ({
      mac,
      ipAddress: data.ipAddress,
      preset: data.preset,
      label: data.label,
      domains: data.domains,
      selective: data.selective,
      startedAt: data.startedAt
    }));
  }

  async start(macAddress, ipAddress, options = {}) {
    const mac = normalizeMac(macAddress);

    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore before DNS lock');
    }
    if (speedLimiter.isLimited(mac)) {
      throw new Error('Speed limit active — remove before DNS lock');
    }
    if (lagSwitch.isActive(mac)) {
      throw new Error('Lag active — stop lag before DNS lock');
    }
    const { oneWayKill } = await import('./oneWayKill.js');
    if (oneWayKill.isActive(mac)) {
      throw new Error('One-way kill active — stop it before DNS lock');
    }

    const resolved = resolveBlockedDomains(options);
    const existing = this.active.get(mac);
    if (
      existing &&
      existing.preset === resolved.preset &&
      JSON.stringify(existing.domains) === JSON.stringify(resolved.domains)
    ) {
      return {
        success: true,
        message: 'DNS block already active',
        engine: 'native',
        ...resolved
      };
    }

    if (existing) {
      await this.stop(mac, ipAddress);
    }

    const nativePath = getNativeEnginePath();
    if (!nativePath) {
      throw new Error('Native engine required for DNS lock (Npcap + admin)');
    }

    const gatewayIp = await arpSpoofer.getGatewayIp();
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    const domainsArg = resolved.domains.join(',');
    const modeArg = resolved.whitelist ? 'whitelist' : 'block';

    const child = spawn(
      nativePath,
      [
        'dnsblock',
        ipAddress,
        mac,
        gatewayIp,
        networkInfo.interface || '',
        networkInfo.ip || '',
        domainsArg,
        modeArg
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logger.warn(`[DNS:${mac}] ${text}`);
    });

    child.on('exit', (code) => {
      if (this.active.get(mac)?.process === child) {
        this.active.delete(mac);
        this.restoreArp(mac, ipAddress, gatewayIp, networkInfo.interface, networkInfo.ip).catch(
          () => null
        );
        if (code && code !== 0) {
          logger.warn(`[DNS] exited ${code} for ${mac}`);
        }
      }
    });

    this.active.set(mac, {
      process: child,
      ipAddress,
      gatewayIp,
      iface: networkInfo.interface,
      localIp: networkInfo.ip,
      preset: resolved.preset,
      label: resolved.label,
      domains: resolved.domains,
      selective: resolved.selective,
      whitelist: resolved.whitelist,
      engine: 'native',
      startedAt: Date.now()
    });

    const message = resolved.selective
      ? `DNS filter active — blocking ${resolved.label}`
      : 'Full DNS lock active — browsing blocked on that device';

    logger.info(`DNS block started for ${ipAddress} (${mac}) preset=${resolved.preset}`);
    return { success: true, message, engine: 'native', ...resolved };
  }

  async stop(macAddress, ipAddress = null) {
    const mac = normalizeMac(macAddress);
    const entry = this.active.get(mac);
    if (!entry) {
      return { success: true, message: 'DNS lock not active' };
    }

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], { windowsHide: true });
      }
    } catch (error) {
      logger.warn(`Failed to stop DNS lock for ${mac}: ${error.message}`);
    }

    this.active.delete(mac);
    await this.restoreArp(
      mac,
      ipAddress || entry.ipAddress,
      entry.gatewayIp,
      entry.iface,
      entry.localIp
    );
    return { success: true, message: 'DNS lock removed' };
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
      logger.warn(`ARP restore after DNS lock failed: ${error.message}`);
    }
  }

  stopAll() {
    for (const [mac, entry] of this.active.entries()) {
      this.stop(mac, entry.ipAddress).catch(() => null);
    }
  }
}

export const dnsHijack = new DnsHijack();
