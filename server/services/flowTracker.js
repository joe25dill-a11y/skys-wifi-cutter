import { spawn } from 'child_process';
import path from 'path';
import logger from '../utils/logger.js';
import { filterNoisyPcapLog } from '../utils/logNoise.js';
import { getScriptsDir } from '../utils/paths.js';
import { resolvePython } from '../utils/pythonRuntime.js';

const SCRIPTS_DIR = getScriptsDir();
const FLOW_SCRIPT = path.join(SCRIPTS_DIR, 'flow_sniff.py');

export class FlowTracker {
  constructor() {
    this.process = null;
    this.ratesByIp = new Map();
    this.ready = false;
    this.lastError = null;
    this.networkInfo = null;
    this.readyWaiters = [];
  }

  isActive() {
    return Boolean(this.process && !this.process.killed);
  }

  waitForReady(timeoutMs = 8000) {
    if (this.ready) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.readyWaiters.indexOf(onReady);
        if (idx >= 0) this.readyWaiters.splice(idx, 1);
        resolve(false);
      }, timeoutMs);

      const onReady = (ready) => {
        clearTimeout(timer);
        resolve(ready);
      };
      this.readyWaiters.push(onReady);
    });
  }

  signalReady(ready) {
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) {
      waiter(ready);
    }
  }

  async start(networkInfo) {
    if (!networkInfo?.ip || !networkInfo?.subnet || !networkInfo?.interface) {
      this.lastError = 'No network interface for flow tracking';
      return false;
    }

    if (this.isActive()) {
      return true;
    }

    const python = await resolvePython();
    if (!python?.command) {
      this.lastError = 'Python not available for flow tracking';
      return false;
    }

    const cidr = this.toCidr(networkInfo.ip, networkInfo.subnet);
    if (!cidr) {
      this.lastError = 'Could not determine LAN subnet';
      return false;
    }

    this.networkInfo = networkInfo;
    this.ready = false;
    this.lastError = null;

    const child = spawn(
      python.command,
      [FLOW_SCRIPT, networkInfo.interface, networkInfo.ip, cidr],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );

    child.stdout.on('data', (data) => {
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'ready') {
            this.ready = true;
            this.signalReady(true);
            logger.info(`Flow tracker ready on ${msg.iface} (${msg.cidr})`);
          } else if (msg.type === 'rates' && msg.hosts) {
            const now = Date.now();
            for (const [ip, rates] of Object.entries(msg.hosts)) {
              this.ratesByIp.set(ip, {
                upload: Number(rates.upload) || 0,
                download: Number(rates.download) || 0,
                updatedAt: now
              });
            }
          }
        } catch {
          logger.debug(`[Flow] ${trimmed}`);
        }
      }
    });

    child.stderr.on('data', (data) => {
      const text = filterNoisyPcapLog(data.toString());
      if (text) {
        logger.warn(`[Flow] ${text}`);
        this.lastError = text;
      }
    });

    child.on('exit', (code) => {
      if (this.process === child) {
        this.process = null;
        this.ready = false;
        this.signalReady(false);
        if (code && code !== 0) {
          this.lastError = `Flow tracker exited with code ${code}`;
          logger.warn(this.lastError);
        }
      }
    });

    this.process = child;
    logger.info(`Started LAN flow tracker on ${networkInfo.interface}`);
    return true;
  }

  toCidr(ip, subnetMask) {
    if (subnetMask.includes('/')) {
      return subnetMask;
    }

    const maskParts = subnetMask.split('.').map(Number);
    if (maskParts.length !== 4 || maskParts.some((n) => Number.isNaN(n))) {
      return null;
    }

    const prefix = maskParts.reduce((bits, octet) => {
      let value = octet;
      while (value > 0) {
        bits += value & 1;
        value >>= 1;
      }
      return bits;
    }, 0);

    const ipParts = ip.split('.').map(Number);
    const network = ipParts.map((octet, i) => octet & maskParts[i]);
    return `${network.join('.')}/${prefix}`;
  }

  getRatesForDevices(devices = []) {
    const staleMs = 12_000;
    const now = Date.now();
    const byMac = {};

    for (const device of devices) {
      const rates = this.ratesByIp.get(device.ip_address);
      if (!rates || now - rates.updatedAt > staleMs) {
        byMac[device.mac_address] = { upload: 0, download: 0, stale: true };
        continue;
      }
      byMac[device.mac_address] = {
        upload: rates.upload,
        download: rates.download,
        stale: false
      };
    }

    return byMac;
  }

  getRatesByIpMap() {
    return this.ratesByIp;
  }

  getRatesList(devices = []) {
    const byMac = this.getRatesForDevices(devices);
    return devices.map((device) => ({
      ip: device.ip_address,
      mac: device.mac_address,
      name: device.name,
      upload: byMac[device.mac_address]?.upload ?? 0,
      download: byMac[device.mac_address]?.download ?? 0,
      source: 'flow'
    }));
  }

  getStatus() {
    return {
      active: this.isActive(),
      ready: this.ready,
      trackedHosts: this.ratesByIp.size,
      lastError: this.lastError
    };
  }

  stop() {
    if (!this.process) {
      return;
    }

    try {
      this.process.kill('SIGTERM');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', String(this.process.pid), '/T', '/F'], {
          windowsHide: true
        });
      }
    } catch (error) {
      logger.warn(`Failed to stop flow tracker: ${error.message}`);
    }

    this.process = null;
    this.ready = false;
    this.ratesByIp.clear();
  }
}

export const flowTracker = new FlowTracker();
