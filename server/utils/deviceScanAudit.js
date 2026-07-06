import { logAudit } from '../storage/auditLogStore.js';
import { normalizeMac } from '../services/arpTable.js';

/** Log first-seen, online, and offline transitions after a network scan. */
export function logScanDeviceEvents(beforeDevices, afterDevices) {
  const beforeMap = new Map(
    (beforeDevices || []).map((d) => [normalizeMac(d.mac_address), d])
  );

  for (const device of afterDevices || []) {
    const mac = normalizeMac(device.mac_address);
    const prev = beforeMap.get(mac);
    const ip = device.ip_address;

    if (!prev) {
      logAudit('device_discovered', { mac, ip, detail: { name: device.name } });
    } else if (prev.is_online === false && device.is_online !== false) {
      logAudit('device_online', { mac, ip });
    }
    beforeMap.delete(mac);
  }

  for (const [, prev] of beforeMap) {
    if (prev.is_online !== false) {
      logAudit('device_offline', {
        mac: normalizeMac(prev.mac_address),
        ip: prev.ip_address
      });
    }
  }
}
