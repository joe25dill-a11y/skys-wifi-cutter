import si from 'systeminformation';

export class BandwidthMonitor {
  constructor() {
    this.previousStats = new Map();
    this.primed = false;
  }

  async getDefaultInterfaceName() {
    try {
      const interfaces = await si.networkInterfaces();
      const defaultInterface = interfaces.find(
        (iface) => iface.default && iface.ip4 && !iface.internal
      );
      return defaultInterface?.iface ?? null;
    } catch {
      return null;
    }
  }

  findActiveInterface(stats, preferredName = null) {
    if (preferredName) {
      const preferred = stats.find((stat) => stat.iface === preferredName);
      if (preferred) {
        return preferred;
      }
    }

    return (
      stats.find(
        (stat) =>
          !stat.iface.includes('lo') &&
          !stat.iface.toLowerCase().includes('loopback') &&
          (stat.operstate === 'up' || stat.operstate === 'unknown') &&
          stat.rx_bytes > 0
      ) ||
      stats.find(
        (stat) =>
          !stat.iface.includes('lo') &&
          !stat.iface.toLowerCase().includes('loopback') &&
          stat.operstate !== 'down'
      )
    );
  }

  async getNetworkStats() {
    try {
      return await si.networkStats();
    } catch (error) {
      console.error('Error getting network stats:', error);
      return [];
    }
  }

  async calculateBandwidth(currentStats, interfaceName) {
    const previous = this.previousStats.get(interfaceName);

    if (!previous) {
      this.previousStats.set(interfaceName, {
        rx_bytes: currentStats.rx_bytes,
        tx_bytes: currentStats.tx_bytes,
        timestamp: Date.now()
      });
      return { download: 0, upload: 0, priming: true };
    }

    const timeDiff = (Date.now() - previous.timestamp) / 1000;
    if (timeDiff <= 0) {
      return { download: 0, upload: 0, priming: false };
    }

    const rxDiff = Math.max(0, currentStats.rx_bytes - previous.rx_bytes);
    const txDiff = Math.max(0, currentStats.tx_bytes - previous.tx_bytes);

    const downloadMbps = (rxDiff * 8) / (timeDiff * 1024 * 1024);
    const uploadMbps = (txDiff * 8) / (timeDiff * 1024 * 1024);

    this.previousStats.set(interfaceName, {
      rx_bytes: currentStats.rx_bytes,
      tx_bytes: currentStats.tx_bytes,
      timestamp: Date.now()
    });

    return {
      download: Math.max(0, Number(downloadMbps.toFixed(2))),
      upload: Math.max(0, Number(uploadMbps.toFixed(2))),
      priming: false
    };
  }

  async prime() {
    if (this.primed) {
      return;
    }

    const stats = await this.getNetworkStats();
    const preferred = await this.getDefaultInterfaceName();
    const activeInterface = this.findActiveInterface(stats, preferred);
    if (activeInterface) {
      await this.calculateBandwidth(activeInterface, activeInterface.iface);
    }
    this.primed = true;
  }

  async getTotalBandwidth() {
    try {
      const stats = await this.getNetworkStats();
      const preferred = await this.getDefaultInterfaceName();
      const activeInterface = this.findActiveInterface(stats, preferred);

      if (!activeInterface) {
        return { download: 0, upload: 0, interface: preferred, priming: true };
      }

      const bandwidth = await this.calculateBandwidth(
        activeInterface,
        activeInterface.iface
      );

      return {
        download: bandwidth.download,
        upload: bandwidth.upload,
        interface: activeInterface.iface,
        priming: bandwidth.priming
      };
    } catch (error) {
      console.error('Error getting total bandwidth:', error);
      return { download: 0, upload: 0, interface: null, priming: false };
    }
  }
}

export const bandwidthMonitor = new BandwidthMonitor();
