import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from '../utils/logger.js';
import { getScriptsDir } from '../utils/paths.js';
import { quoteExecutable, resolvePython } from '../utils/pythonRuntime.js';
import { getNativeMeterPath } from '../utils/nativeRuntime.js';
import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { lagSwitch } from './lagSwitch.js';
import { attachMitmParser } from './mitmMeter.js';
import { getArpMaps, invalidateArpCache, normalizeMac } from './arpTable.js';

const execAsync = promisify(exec);
const SCRIPTS_DIR = getScriptsDir();
const PYTHON_METER_SCRIPT = path.join(SCRIPTS_DIR, 'arp_meter.py');
const RESTORE_SCRIPT = path.join(SCRIPTS_DIR, 'arp_restore.py');
const DEFAULT_SECONDS = 45;
const MAX_CONCURRENT_METERS = 3;

export class DeviceMeter {
  constructor() {
    this.active = new Map();
    this.ifaceName = null;
    this.lastIface = null;
    this.lastLocalIp = null;
  }

  isMetering(macAddress) {
    return this.active.has(normalizeMac(macAddress));
  }

  getMeteringMacs() {
    return Array.from(this.active.keys());
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

  resolveMeterCommand(mac, ipAddress, gatewayIp, iface, localIp) {
    const nativePath = getNativeMeterPath();
    if (nativePath) {
      return {
        engine: 'native',
        command: nativePath,
        args: ['meter', ipAddress, mac, gatewayIp, iface, localIp || '']
      };
    }

    return null;
  }

  async resolvePythonMeterCommand(mac, ipAddress, gatewayIp, iface, localIp) {
    const python = await resolvePython();
    if (!python?.command) {
      return null;
    }

    return {
      engine: 'python',
      command: python.command,
      args: [PYTHON_METER_SCRIPT, ipAddress, mac, gatewayIp, iface, localIp || '']
    };
  }

  async resolveLiveTarget(macAddress, ipAddress) {
    invalidateArpCache();
    const arpMaps = await getArpMaps();
    const mac = normalizeMac(macAddress);
    const liveIp = arpMaps.ipByMac.get(mac);
    const arpMac = arpMaps.macByIp.get(ipAddress);

    if (liveIp && arpMac && normalizeMac(arpMac) !== mac) {
      logger.warn(`IP ${ipAddress} ARP MAC ${arpMac} differs from device ${mac} — using live IP ${liveIp}`);
    }

    return {
      ip: liveIp || ipAddress,
      mac: arpMac && normalizeMac(arpMac) === mac ? arpMac : macAddress
    };
  }

  async wakeDeviceArp(ipAddress) {
    if (!ipAddress) return;
    try {
      const flag = process.platform === 'win32' ? '-n' : '-c';
      const wait = process.platform === 'win32' ? '-w' : '-W';
      const unit = process.platform === 'win32' ? '1000' : '1';
      await execAsync(`ping ${flag} 2 ${wait} ${unit} ${ipAddress}`, {
        windowsHide: true,
        timeout: 5000
      });
    } catch {
      // device may block ICMP — still try meter
    }
    invalidateArpCache();
    await getArpMaps();
  }

  async refreshDevice(
    macAddress,
    ipAddress,
    iface,
    localIp,
    durationSec = DEFAULT_SECONDS,
    options = {}
  ) {
    const { preferPython = false } = options;
    const mac = normalizeMac(macAddress);

    if (this.active.size >= MAX_CONCURRENT_METERS && !this.active.has(mac)) {
      throw new Error(`Max ${MAX_CONCURRENT_METERS} devices metering at once — wait for one to finish`);
    }

    if (arpSpoofer.isCut(mac)) {
      throw new Error('Device is cut — restore it before measuring bandwidth');
    }
    if (speedLimiter.isLimited(mac)) {
      throw new Error('Speed limit active — remove it before measuring');
    }
    if (lagSwitch.isActive(mac)) {
      throw new Error('Lag switch active — stop lag before measuring');
    }

    const existing = this.active.get(mac);
    if (existing) {
      existing.endsAt = Date.now() + durationSec * 1000;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => {
        this.stopMeter(mac, existing.ipAddress, existing.gatewayIp, existing.iface, existing.localIp).catch(
          () => null
        );
      }, durationSec * 1000);
      return {
        metering: true,
        engine: existing.engine,
        secondsLeft: durationSec,
        message: `Extended meter on ${existing.ipAddress} for ${durationSec}s — use the device now`
      };
    }

    const gatewayIp = await arpSpoofer.getGatewayIp();
    if (!gatewayIp) {
      throw new Error('Could not detect gateway IP');
    }

    await this.wakeDeviceArp(ipAddress);
    const target = await this.resolveLiveTarget(mac, ipAddress);

    await this.enableForwarding(iface);
    this.lastIface = iface;
    this.lastLocalIp = localIp;

    let meter = preferPython ? null : this.resolveMeterCommand(target.mac, target.ip, gatewayIp, iface, localIp);
    if (!meter) {
      meter = await this.resolvePythonMeterCommand(target.mac, target.ip, gatewayIp, iface, localIp);
    }
    if (!meter) {
      throw new Error('Native meter or Python + Scapy required for device bandwidth');
    }

    const child = spawn(meter.command, meter.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    attachMitmParser(child);

    let started = false;
    let startError = null;

    child.stdout?.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const msg = JSON.parse(line.trim());
          if (msg.type === 'started') started = true;
          if (msg.type === 'error') startError = msg.message || 'Meter failed to start';
        } catch {
          // ignore
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) logger.warn(`[Meter:${meter.engine}] ${text}`);
    });

    const endsAt = Date.now() + durationSec * 1000;
    const timer = setTimeout(() => {
      this.stopMeter(mac, target.ip, gatewayIp, iface, localIp).catch(() => null);
    }, durationSec * 1000);

    child.on('exit', (code) => {
      if (this.active.get(mac)?.process === child) {
        clearTimeout(timer);
        this.active.delete(mac);
        this.restoreArp(mac, target.ip, gatewayIp, iface, localIp).catch(() => null);
        if (code && code !== 0) {
          logger.warn(`[Meter:${meter.engine}] exited ${code} for ${mac}`);
        }
      }
    });

    this.active.set(mac, {
      process: child,
      ipAddress: target.ip,
      gatewayIp,
      endsAt,
      timer,
      engine: meter.engine,
      iface,
      localIp
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (!started && meter.engine === 'native' && !preferPython) {
      logger.warn(`Native meter did not start for ${mac} — retrying with Python`);
      await this.stopMeter(mac, target.ip, gatewayIp, iface, localIp);
      const pythonMeter = await this.resolvePythonMeterCommand(
        target.mac,
        target.ip,
        gatewayIp,
        iface,
        localIp
      );
      if (pythonMeter) {
        return this.refreshDevice(macAddress, target.ip, iface, localIp, durationSec, {
          preferPython: true
        });
      }
    }

    if (startError) {
      throw new Error(startError);
    }

    logger.info(
      `Started ${meter.engine} bandwidth meter for ${mac} (${target.ip}) for ${durationSec}s`
    );

    return {
      metering: true,
      engine: meter.engine,
      secondsLeft: durationSec,
      ip: target.ip,
      message: `Measuring ${target.ip} for ${durationSec}s (${meter.engine}) — browse/stream on that device now`
    };
  }

  async stopMeter(
    macAddress,
    ipAddress = null,
    gatewayIp = null,
    iface = null,
    localIp = null
  ) {
    const mac = normalizeMac(macAddress);
    const entry = this.active.get(mac);
    if (!entry) {
      return { success: true };
    }

    clearTimeout(entry.timer);

    try {
      entry.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(entry.process.pid), '/T', '/F'], {
          windowsHide: true
        });
      }
    } catch (error) {
      logger.warn(`Failed to stop meter for ${mac}: ${error.message}`);
    }

    this.active.delete(mac);
    await this.restoreArp(
      mac,
      ipAddress || entry.ipAddress,
      gatewayIp || entry.gatewayIp,
      iface || entry.iface || this.lastIface,
      localIp || entry.localIp || this.lastLocalIp
    );
    return { success: true };
  }

  async restoreArp(macAddress, ipAddress, gatewayIp, iface = null, localIp = null) {
    if (!ipAddress || !gatewayIp) return;

    const nativePath = getNativeMeterPath();
    const restoreIface = iface || this.lastIface || '';
    const restoreLocalIp = localIp || this.lastLocalIp || '';

    if (nativePath) {
      try {
        await execAsync(
          `"${nativePath}" restore ${ipAddress} ${macAddress} ${gatewayIp} "${restoreIface}" ${restoreLocalIp}`,
          { windowsHide: true, timeout: 10000 }
        );
        return;
      } catch (error) {
        logger.warn(`Native ARP restore failed: ${error.message}`);
      }
    }

    const python = await resolvePython();
    if (!python?.command) return;

    try {
      await execAsync(
        `${quoteExecutable(python.command)} "${RESTORE_SCRIPT}" ${ipAddress} ${macAddress} ${gatewayIp}`,
        { windowsHide: true }
      );
    } catch (error) {
      logger.warn(`ARP restore after meter failed: ${error.message}`);
    }
  }

  async pingDevice(ipAddress) {
    const nativePath = getNativeMeterPath();
    if (nativePath) {
      try {
        const { stdout } = await execAsync(`"${nativePath}" ping ${ipAddress}`, {
          windowsHide: true,
          timeout: 5000
        });
        const line = stdout.trim().split('\n').find((l) => l.startsWith('{'));
        if (line) {
          const msg = JSON.parse(line);
          return Boolean(msg.online);
        }
      } catch {
        // fall through
      }
    }

    const flag = process.platform === 'win32' ? '-n' : '-c';
    const wait = process.platform === 'win32' ? '-w' : '-W';
    const unit = process.platform === 'win32' ? '1000' : '1';
    try {
      await execAsync(`ping ${flag} 1 ${wait} ${unit} ${ipAddress}`, {
        windowsHide: true,
        timeout: 5000
      });
      return true;
    } catch {
      return false;
    }
  }

  stopAll() {
    for (const [mac, entry] of this.active.entries()) {
      this.stopMeter(mac, entry.ipAddress, entry.gatewayIp, entry.iface, entry.localIp).catch(
        () => null
      );
    }
  }
}

export const deviceMeter = new DeviceMeter();
