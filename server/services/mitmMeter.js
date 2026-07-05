export class MitmMeter {
  constructor() {
    this.ratesByIp = new Map();
    this.ratesByMac = new Map();
  }

  update(ip, upload, download, mac = null) {
    const entry = {
      upload: Number(upload) || 0,
      download: Number(download) || 0,
      updatedAt: Date.now(),
      ip: ip || null,
      mac: mac || null
    };
    if (ip) {
      this.ratesByIp.set(ip, entry);
    }
    if (mac) {
      this.ratesByMac.set(String(mac).toUpperCase().replace(/-/g, ':'), entry);
    }
  }

  getRateForDevice(device, arpIpByMac) {
    const mac = device.mac_address.toUpperCase().replace(/-/g, ':');
    const staleMs = 60_000;
    const now = Date.now();

    const candidates = [
      this.ratesByMac.get(mac),
      this.ratesByIp.get(arpIpByMac.get(mac)),
      this.ratesByIp.get(device.ip_address)
    ].filter(Boolean);

    let upload = 0;
    let download = 0;
    let fresh = false;

    for (const rates of candidates) {
      if (now - rates.updatedAt > staleMs) continue;
      fresh = true;
      upload = Math.max(upload, rates.upload);
      download = Math.max(download, rates.download);
    }

    return fresh ? { upload, download } : null;
  }

  getRatesList(devices = []) {
    const staleMs = 60_000;
    const now = Date.now();
    return devices
      .map((device) => {
        const mac = device.mac_address.toUpperCase().replace(/-/g, ':');
        const rates =
          this.ratesByMac.get(mac) || this.ratesByIp.get(device.ip_address);
        if (!rates || now - rates.updatedAt > staleMs) {
          return null;
        }
        return {
          ip: rates.ip || device.ip_address,
          mac: device.mac_address,
          name: device.name,
          upload: rates.upload,
          download: rates.download,
          source: 'mitm'
        };
      })
      .filter(Boolean);
  }

  getRatesByIpMap() {
    return this.ratesByIp;
  }

  getRatesByMacMap() {
    return this.ratesByMac;
  }

  clear(ip, mac = null) {
    if (ip) this.ratesByIp.delete(ip);
    if (mac) {
      this.ratesByMac.delete(String(mac).toUpperCase().replace(/-/g, ':'));
    }
  }
}

export const mitmMeter = new MitmMeter();

export function attachMitmParser(child) {
  child.stdout?.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('{')) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'traffic' && msg.ip) {
          mitmMeter.update(msg.ip, msg.upload, msg.download, msg.mac);
        }
      } catch {
        // ignore non-json
      }
    }
  });
}
