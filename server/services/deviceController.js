import { arpSpoofer } from './arpSpoofer.js';
import { speedLimiter } from './speedLimiter.js';
import { deviceStore } from '../storage/deviceStore.js';
import logger from '../utils/logger.js';
import { networkScanner } from './networkScanner.js';
import { normalizeMac } from './arpTable.js';
import { releaseMitmForDevice, stopAllMitm } from '../utils/mitmRelease.js';

export class DeviceController {
  constructor() {
    this.blockedDevices = new Set();
  }

  async blockDevice(macAddress, ipAddress) {
    const mac = normalizeMac(macAddress);
    await releaseMitmForDevice(mac, ipAddress);

    if (this.blockedDevices.has(mac)) {
      return { success: true, message: 'Device already blocked' };
    }

    await arpSpoofer.startCut(mac, ipAddress);
    this.blockedDevices.add(mac);
    logger.info(`Device blocked (ARP cut): ${mac} (${ipAddress})`);
    return { success: true, message: 'Device cut from network' };
  }

  async unblockDevice(macAddress, ipAddress) {
    const mac = normalizeMac(macAddress);
    await arpSpoofer.stopCut(mac, ipAddress);
    this.blockedDevices.delete(mac);
    logger.info(`Device unblocked: ${mac}`);
    return { success: true, message: 'Device restored to network' };
  }

  async limitDeviceBandwidth(macAddress, ipAddress, uploadKbps, downloadKbps) {
    if (speedLimiter.isUnlimited(uploadKbps, downloadKbps)) {
      return speedLimiter.stopLimit(macAddress, ipAddress);
    }

    if (process.platform === 'win32' || process.platform === 'darwin') {
      const mac = normalizeMac(macAddress);
      if (this.blockedDevices.has(mac)) {
        throw new Error('Device is cut — restore it before limiting speed');
      }

      const networkInfo = await networkScanner.getLocalNetworkInfo();
      return speedLimiter.startLimit(
        mac,
        ipAddress,
        uploadKbps,
        downloadKbps,
        networkInfo.interface
      );
    }

    if (process.platform !== 'linux') {
      const error = new Error('Speed limiting requires Windows/macOS MITM or Linux tc.');
      error.statusCode = 501;
      throw error;
    }

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout } = await execAsync(
        "ip route | awk '/default/ {print $5; exit}'"
      );
      const interfaceName = stdout.trim() || 'eth0';

      await execAsync(
        `sudo tc qdisc add dev ${interfaceName} root handle 1: htb default 30`
      ).catch(() => null);
      await execAsync(
        `sudo tc class add dev ${interfaceName} parent 1: classid 1:1 htb rate ${uploadKbps}kbit`
      );
      await execAsync(
        `sudo tc filter add dev ${interfaceName} protocol ip parent 1:0 prio 1 u32 match ip dst ${ipAddress} flowid 1:1`
      );

      return {
        success: true,
        message: `Upload limited to ${uploadKbps} kbps (download limit ${downloadKbps} kbps noted)`
      };
    } catch (error) {
      throw new Error(`Bandwidth limiting failed: ${error.message}`);
    }
  }

  syncBlockedFromStore(devices) {
    for (const device of devices) {
      if (device.status === 'blocked') {
        this.blockedDevices.add(normalizeMac(device.mac_address));
      }
    }
  }

  async cutAll(devices, excludeMac = null) {
    let count = 0;
    const exclude = excludeMac ? normalizeMac(excludeMac) : null;

    for (const device of devices) {
      const mac = normalizeMac(device.mac_address);
      if (mac === exclude || device.status === 'blocked') {
        continue;
      }
      await this.blockDevice(mac, device.ip_address);
      await deviceStore.updateStatus(mac, 'blocked');
      count += 1;
    }
    return { success: true, count, message: `Cut ${count} device(s)` };
  }

  async restoreAll(devices) {
    let count = 0;
    for (const device of devices) {
      if (device.status !== 'blocked') {
        continue;
      }
      const mac = normalizeMac(device.mac_address);
      await this.unblockDevice(mac, device.ip_address);
      await deviceStore.updateStatus(mac, 'allowed');
      count += 1;
    }
    return { success: true, count, message: `Restored ${count} device(s)` };
  }

  async bulkCut(macs = []) {
    let count = 0;
    for (const rawMac of macs) {
      const mac = normalizeMac(rawMac);
      const device = await deviceStore.getByMac(mac);
      if (!device || device.status === 'blocked') continue;
      await this.blockDevice(mac, device.ip_address);
      await deviceStore.updateStatus(mac, 'blocked');
      count += 1;
    }
    return { success: true, count, message: `Cut ${count} device(s)` };
  }

  async bulkRestore(macs = []) {
    let count = 0;
    for (const rawMac of macs) {
      const mac = normalizeMac(rawMac);
      const device = await deviceStore.getByMac(mac);
      if (!device || device.status !== 'blocked') continue;
      await this.unblockDevice(mac, device.ip_address);
      await deviceStore.updateStatus(mac, 'allowed');
      count += 1;
    }
    return { success: true, count, message: `Restored ${count} device(s)` };
  }

  getBlockedDevices() {
    return Array.from(this.blockedDevices);
  }

  isDeviceBlocked(macAddress) {
    return this.blockedDevices.has(normalizeMac(macAddress));
  }

  async removeSpeedLimit(macAddress, ipAddress) {
    return speedLimiter.stopLimit(macAddress, ipAddress);
  }

  getActiveSpeedLimits() {
    return speedLimiter.getActiveLimits();
  }

  async clearAllRules() {
    await stopAllMitm();
    await arpSpoofer.stopAll();
    this.blockedDevices.clear();
    return { success: true, message: 'All rules cleared' };
  }
}

export const deviceController = new DeviceController();
