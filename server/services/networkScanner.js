import { exec } from 'child_process';
import { promisify } from 'util';
import dns from 'dns/promises';
import { createRequire } from 'node:module';
import si from 'systeminformation';
import { Netmask } from 'netmask';

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const ouiData = require('oui-data');

import { resolveHostnamesBulk, probeDevicePorts } from './deviceProbe.js';

export class NetworkScanner {
  constructor() {
    this.isScanning = false;
    this.hostnameCache = new Map();
    this.vendorCache = new Map();
    this._networkInfoCache = null;
    this._networkInfoCacheAt = 0;
  }

  async getLocalNetworkInfo(force = false) {
    const now = Date.now();
    if (!force && this._networkInfoCache && now - this._networkInfoCacheAt < 15_000) {
      return this._networkInfoCache;
    }

    const networkInterfaces = await si.networkInterfaces();
    const defaultInterface = networkInterfaces.find(
      (iface) => iface.default && iface.ip4 && !iface.internal
    );

    if (!defaultInterface) {
      throw new Error('No active network interface found');
    }

    const info = {
      ip: defaultInterface.ip4,
      subnet: defaultInterface.ip4subnet,
      interface: defaultInterface.iface,
      mac: defaultInterface.mac
    };
    this._networkInfoCache = info;
    this._networkInfoCacheAt = Date.now();
    return info;
  }

  getDeviceManufacturer(macAddress) {
    try {
      const oui = macAddress.replace(/[^0-9a-f]/gi, '').toUpperCase().substring(0, 6);
      if (this.vendorCache.has(oui)) {
        return this.vendorCache.get(oui);
      }
      const vendor = ouiData[oui];
      const label = vendor ? vendor.split('\n')[0].trim() : 'Unknown';
      this.vendorCache.set(oui, label);
      return label;
    } catch {
      return 'Unknown';
    }
  }

  cleanHostname(raw) {
    if (!raw) {
      return null;
    }
    const name = raw.split('.')[0].trim();
    if (!name || name === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(name)) {
      return null;
    }
    return name;
  }

  async resolveHostnameDns(ip) {
    try {
      const names = await dns.reverse(ip);
      return this.cleanHostname(names[0]);
    } catch {
      return null;
    }
  }

  async resolveHostnameNetbios(ip) {
    if (process.platform !== 'win32') {
      return null;
    }

    try {
      const { stdout } = await execAsync(`nbtstat -A ${ip}`, { timeout: 3000 });
      const lines = stdout.split('\n');
      for (const line of lines) {
        const unique = line.match(/^\s*([^\s<]+)\s+<00>\s+UNIQUE/i);
        if (unique) {
          return this.cleanHostname(unique[1]);
        }
      }
    } catch {
      // ignore
    }

    return null;
  }

  async resolveHostname(ip) {
    if (this.hostnameCache.has(ip)) {
      return this.hostnameCache.get(ip);
    }

    const dnsName = await this.resolveHostnameDns(ip);
    if (dnsName) {
      this.hostnameCache.set(ip, dnsName);
      return dnsName;
    }

    const netbiosName = await this.resolveHostnameNetbios(ip);
    if (netbiosName) {
      this.hostnameCache.set(ip, netbiosName);
      return netbiosName;
    }

    this.hostnameCache.set(ip, ip);
    return ip;
  }

  buildDisplayName(ip, hostname, manufacturer) {
    if (hostname && hostname !== ip) {
      return hostname;
    }
    if (manufacturer && manufacturer !== 'Unknown') {
      return `${manufacturer} (${ip})`;
    }
    return ip;
  }

  buildNetmask(networkInfo) {
    return new Netmask(`${networkInfo.ip}/${networkInfo.subnet}`);
  }

  getScanRange(networkInfo) {
    return this.buildNetmask(networkInfo).toString();
  }

  getHostsToScan(networkInfo) {
    const prefix = networkInfo.ip.split('.').slice(0, 3).join('.');
    const fallbackHosts = Array.from({ length: 254 }, (_, i) => `${prefix}.${i + 1}`);

    try {
      const block = this.buildNetmask(networkInfo);
      const hosts = [];

      if (typeof block.forEach === 'function') {
        block.forEach((ip) => hosts.push(ip));
      } else if (typeof block.toArray === 'function') {
        return block.toArray().slice(0, 512);
      } else {
        return fallbackHosts;
      }

      if (hosts.length > 512) {
        return fallbackHosts;
      }

      return hosts.length > 0 ? hosts : fallbackHosts;
    } catch (error) {
      console.warn('[NetworkScanner] Host range fallback:', error.message);
      return fallbackHosts;
    }
  }

  async pingSweep(networkInfo) {
    const hosts = this.getHostsToScan(networkInfo);
    const batchSize = 40;

    console.log(
      `[NetworkScanner] Ping sweep on ${this.getScanRange(networkInfo)} (${hosts.length} hosts)`
    );

    for (let i = 0; i < hosts.length; i += batchSize) {
      const batch = hosts.slice(i, i + batchSize);
      await Promise.all(
        batch.map((ip) => {
          const command =
            process.platform === 'win32'
              ? `ping -n 1 -w 120 ${ip}`
              : `ping -c 1 -W 1 ${ip}`;
          return execAsync(command).catch(() => null);
        })
      );
    }
  }

  async scanArpTable(networkInfo = null) {
    const devices = [];
    const subnetBlock = networkInfo ? this.buildNetmask(networkInfo) : null;
    const { stdout } = await execAsync('arp -a');
    const lines = stdout.split('\n');

    for (const line of lines) {
      const ipMatch =
        line.match(/\((\d+\.\d+\.\d+\.\d+)\)/) ||
        line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+/);
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})/);

      if (!ipMatch || !macMatch) {
        continue;
      }

      const ip = ipMatch[1];
      const mac = macMatch[0].toUpperCase().replace(/-/g, ':');

      if (subnetBlock && !subnetBlock.contains(ip)) {
        continue;
      }

      if (mac === 'FF:FF:FF:FF:FF:FF' || mac.startsWith('00:00:00')) {
        continue;
      }

      const manufacturer = this.getDeviceManufacturer(mac);
      devices.push({
        ip_address: ip,
        mac_address: mac,
        manufacturer,
        hostname: ip
      });
    }

    // Resolve hostnames in parallel (batched).
    const batchSize = 15;
    for (let i = 0; i < devices.length; i += batchSize) {
      const batch = devices.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (device) => {
          const hostname = await this.resolveHostname(device.ip_address);
          device.hostname = hostname;
          device.display_name = this.buildDisplayName(
            device.ip_address,
            hostname,
            device.manufacturer
          );
        })
      );
    }

    return devices;
  }

  guessDeviceType(manufacturer, hostname) {
    const lower = `${manufacturer} ${hostname}`.toLowerCase();

    if (lower.includes('apple') || lower.includes('iphone') || lower.includes('ipad')) {
      return 'phone';
    }
    if (lower.includes('samsung') || lower.includes('android') || lower.includes('galaxy')) {
      return 'phone';
    }
    if (lower.includes('tv') || lower.includes('roku') || lower.includes('chromecast')) {
      return 'tv';
    }
    if (lower.includes('laptop') || lower.includes('macbook') || lower.includes('dell')) {
      return 'laptop';
    }
    if (lower.includes('xbox') || lower.includes('playstation') || lower.includes('nintendo')) {
      return 'console';
    }
    if (lower.includes('reolink') || lower.includes('camera') || lower.includes('hikvision')) {
      return 'camera';
    }
    if (lower.includes('amazon') || lower.includes('fire') || lower.includes('echo')) {
      return 'iot';
    }
    if (lower.includes('google') || lower.includes('nest') || lower.includes('chromecast')) {
      return 'iot';
    }
    if (lower.includes('tibro') || lower.includes('arris') || lower.includes('motorola')) {
      return 'router';
    }
    if (lower.includes('printer')) {
      return 'printer';
    }

    return 'unknown';
  }

  async scanNetwork(options = {}) {
    const deep = Boolean(options.deep);
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    this.isScanning = true;

    try {
      const networkInfo = await this.getLocalNetworkInfo();
      await this.pingSweep(networkInfo);
      const devices = await this.scanArpTable(networkInfo);

      const hostnameMap = await resolveHostnamesBulk(devices.map((d) => d.ip_address));
      for (const device of devices) {
        const resolved = hostnameMap.get(device.ip_address);
        if (resolved) {
          device.hostname = this.cleanHostname(resolved) || device.hostname;
          device.display_name = this.buildDisplayName(
            device.ip_address,
            device.hostname,
            device.manufacturer
          );
        }
      }

      if (deep) {
        const probeBatch = 8;
        for (let i = 0; i < devices.length; i += probeBatch) {
          const batch = devices.slice(i, i + probeBatch);
          await Promise.all(
            batch.map(async (device) => {
              device.open_ports = await probeDevicePorts(device.ip_address);
            })
          );
        }
      }

      return devices.map((device) => ({
        ...device,
        device_type: this.guessDeviceType(device.manufacturer, device.hostname),
        last_seen: new Date().toISOString(),
        status: 'allowed',
        is_online: true,
        open_ports: device.open_ports ?? []
      }));
    } finally {
      this.isScanning = false;
    }
  }
}

export const networkScanner = new NetworkScanner();
