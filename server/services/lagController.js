import { exec } from 'child_process';
import { promisify } from 'util';
import { lagSwitch } from './lagSwitch.js';
import { networkScanner } from './networkScanner.js';

const execAsync = promisify(exec);

export class LagController {
  constructor() {
    this.activeLags = new Map();
    this.platform = process.platform;
  }

  async applyLag(macAddress, ipAddress, outgoingMs, incomingMs, uploadKbps = 0, downloadKbps = 0) {
    try {
      if (this.platform === 'linux') {
        await this.applyLagLinux(ipAddress, outgoingMs, incomingMs);
      } else if (this.platform === 'win32' || this.platform === 'darwin') {
        const networkInfo = await networkScanner.getLocalNetworkInfo();
        await lagSwitch.startLag(
          macAddress,
          ipAddress,
          outgoingMs,
          incomingMs,
          networkInfo.interface,
          uploadKbps,
          downloadKbps
        );
      } else {
        throw new Error(`Unsupported platform: ${this.platform}`);
      }

      this.activeLags.set(macAddress, {
        outgoingMs,
        incomingMs,
        uploadKbps,
        downloadKbps,
        appliedAt: Date.now()
      });

      return { success: true, message: 'Lag switch applied' };
    } catch (error) {
      console.error('Error applying lag:', error);
      throw error;
    }
  }

  async removeLag(macAddress, ipAddress) {
    try {
      if (!this.activeLags.has(macAddress) && !lagSwitch.isActive(macAddress)) {
        return { success: true, message: 'No lag switch active' };
      }

      if (this.platform === 'linux') {
        await this.removeLagLinux(ipAddress);
      } else if (this.platform === 'win32' || this.platform === 'darwin') {
        await lagSwitch.stopLag(macAddress, ipAddress);
      }

      this.activeLags.delete(macAddress);
      return { success: true, message: 'Lag switch removed' };
    } catch (error) {
      console.error('Error removing lag:', error);
      throw error;
    }
  }

  async applyLagLinux(ipAddress, outgoingMs, incomingMs) {
    try {
      const interface_name = await this.getActiveInterface();

      await execAsync(`sudo tc qdisc del dev ${interface_name} root 2>/dev/null || true`);

      if (outgoingMs > 0) {
        await execAsync(`sudo tc qdisc add dev ${interface_name} root handle 1: prio`);
        await execAsync(
          `sudo tc qdisc add dev ${interface_name} parent 1:3 handle 30: netem delay ${outgoingMs}ms`
        );
        await execAsync(
          `sudo tc filter add dev ${interface_name} protocol ip parent 1:0 prio 3 u32 match ip dst ${ipAddress} flowid 1:3`
        );
      }

      if (incomingMs > 0) {
        await execAsync(`sudo tc qdisc add dev ${interface_name} handle ffff: ingress`);
        await execAsync(
          `sudo tc filter add dev ${interface_name} parent ffff: protocol ip prio 1 u32 match ip src ${ipAddress} police rate 1mbit burst 10k drop`
        );
      }
    } catch (error) {
      console.warn('Linux lag control requires root/sudo privileges');
      throw error;
    }
  }

  async removeLagLinux(ipAddress) {
    try {
      const interface_name = await this.getActiveInterface();
      await execAsync(`sudo tc qdisc del dev ${interface_name} root 2>/dev/null || true`);
      await execAsync(`sudo tc qdisc del dev ${interface_name} ingress 2>/dev/null || true`);
    } catch (error) {
      console.warn('Error removing Linux lag control:', error.message);
    }
  }

  async getActiveInterface() {
    try {
      if (this.platform === 'linux') {
        const { stdout } = await execAsync(
          `ip route | grep default | awk '{print $5}' | head -n1`
        );
        return stdout.trim() || 'eth0';
      }
      return 'eth0';
    } catch {
      return 'eth0';
    }
  }

  async triggerLagSpike(macAddress, ipAddress, durationMs) {
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    if (this.platform === 'win32' || this.platform === 'darwin') {
      return lagSwitch.triggerPulse(macAddress, ipAddress, networkInfo.interface, {
        incomingMs: Math.min(durationMs, 2000),
        outgoingMs: 0,
        freezeMs: Math.max(100, Math.min(durationMs, 1500)),
        unfreezeMs: 120,
        count: 4
      });
    }

    try {
      await this.applyLag(macAddress, ipAddress, durationMs, durationMs);
      setTimeout(async () => {
        try {
          await this.removeLag(macAddress, ipAddress);
        } catch (error) {
          console.error('Error ending lag spike:', error);
        }
      }, durationMs + 100);

      return { success: true, message: `Lag spike triggered for ${durationMs}ms` };
    } catch (error) {
      console.error('Error triggering lag spike:', error);
      throw error;
    }
  }

  async triggerGhostPulse(macAddress, ipAddress, options = {}) {
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    return lagSwitch.triggerPulse(macAddress, ipAddress, networkInfo.interface, {
      incomingMs: options.incomingMs ?? 1200,
      outgoingMs: options.outgoingMs ?? 0,
      freezeMs: options.freezeMs ?? 250,
      unfreezeMs: options.unfreezeMs ?? 100,
      count: options.count ?? 8
    });
  }

  getActiveLags() {
    const fromSwitch = lagSwitch.getActiveLags();
    if (fromSwitch.length > 0) {
      return fromSwitch;
    }
    return Array.from(this.activeLags.entries()).map(([mac, data]) => ({
      mac,
      ...data
    }));
  }

  hasActiveLag(macAddress) {
    return this.activeLags.has(macAddress) || lagSwitch.isActive(macAddress);
  }

  async clearAllLags() {
    try {
      if (this.platform === 'linux') {
        const interface_name = await this.getActiveInterface();
        await execAsync(`sudo tc qdisc del dev ${interface_name} root 2>/dev/null || true`);
        await execAsync(`sudo tc qdisc del dev ${interface_name} ingress 2>/dev/null || true`);
      } else {
        lagSwitch.stopAll();
      }

      this.activeLags.clear();
      return { success: true, message: 'All lag switches cleared' };
    } catch (error) {
      console.error('Error clearing all lags:', error);
      throw error;
    }
  }
}

export const lagController = new LagController();
