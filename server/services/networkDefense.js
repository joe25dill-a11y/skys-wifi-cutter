import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';

const execAsync = promisify(exec);

export class NetworkDefense {
  constructor() {
    this.isActive = false;
    this.interval = null;
    this.gatewayIp = null;
    this.gatewayMac = null;
  }

  async resolveGateway() {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "(Get-NetRoute -DestinationPrefix \'0.0.0.0/0\' | Sort-Object RouteMetric | Select-Object -First 1).NextHop"'
      );
      this.gatewayIp = stdout.trim();
    } else {
      const { stdout } = await execAsync(
        "ip route | awk '/default/ {print $3; exit}'"
      );
      this.gatewayIp = stdout.trim();
    }

    if (!this.gatewayIp) {
      throw new Error('Could not detect gateway');
    }

    const { stdout } = await execAsync(`arp -a ${this.gatewayIp}`);
    const macMatch = stdout.match(/([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})/);
    if (!macMatch) {
      throw new Error('Could not resolve gateway MAC — ping your router first');
    }

    this.gatewayMac = macMatch[0].toUpperCase().replace(/-/g, ':');
    return { ip: this.gatewayIp, mac: this.gatewayMac };
  }

  async pinGatewayArp() {
    const gateway = await this.resolveGateway();

    if (process.platform === 'win32') {
      await execAsync(`arp -s ${gateway.ip} ${gateway.mac.replace(/:/g, '-')}`);
    } else {
      await execAsync(`sudo arp -s ${gateway.ip} ${gateway.mac}`);
    }

    logger.info(`Pinned gateway ARP: ${gateway.ip} -> ${gateway.mac}`);
    return gateway;
  }

  async unpinGatewayArp() {
    if (!this.gatewayIp) {
      return;
    }

    try {
      if (process.platform === 'win32') {
        await execAsync(`arp -d ${this.gatewayIp}`);
      } else {
        await execAsync(`sudo arp -d ${this.gatewayIp}`);
      }
    } catch (error) {
      logger.warn(`Failed to unpin gateway ARP: ${error.message}`);
    }
  }

  async enable() {
    if (this.isActive) {
      return { success: true, message: 'Defense already active' };
    }

    const gateway = await this.pinGatewayArp();

    // Re-pin every 30s — helps resist simple ARP spoof attacks on your PC.
    this.interval = setInterval(() => {
      this.pinGatewayArp().catch((err) => {
        logger.warn(`Defense refresh failed: ${err.message}`);
      });
    }, 30_000);

    this.isActive = true;
    return {
      success: true,
      message: 'Network defense enabled',
      gateway
    };
  }

  async disable() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    await this.unpinGatewayArp();
    this.isActive = false;
    return { success: true, message: 'Network defense disabled' };
  }

  getStatus() {
    return {
      isActive: this.isActive,
      gatewayIp: this.gatewayIp,
      gatewayMac: this.gatewayMac
    };
  }
}

export const networkDefense = new NetworkDefense();
