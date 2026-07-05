import { normalizeMac } from '../services/arpTable.js';
import { portBlocker } from '../services/portBlocker.js';
import { dnsHijack } from '../services/dnsHijack.js';
import { oneWayKill } from '../services/oneWayKill.js';
import { speedLimiter } from '../services/speedLimiter.js';
import { lagSwitch } from '../services/lagSwitch.js';

import { firewallKill } from '../services/firewallKill.js';

/** Stop per-device MITM rules before starting a conflicting action (cut, etc.). */
export async function releaseMitmForDevice(macAddress, ipAddress) {
  const mac = normalizeMac(macAddress);

  if (firewallKill.isActive(mac)) {
    await firewallKill.stop(mac, ipAddress);
  }
  if (portBlocker.isBlocking(mac)) {
    await portBlocker.stop(mac, ipAddress);
  }
  if (dnsHijack.isActive(mac)) {
    await dnsHijack.stop(mac, ipAddress);
    const { deviceStore } = await import('../storage/deviceStore.js');
    await deviceStore.setDnsBlocked(mac, false);
  }
  if (oneWayKill.isActive(mac)) {
    await oneWayKill.stop(mac, ipAddress);
  }
  if (speedLimiter.isLimited(mac)) {
    await speedLimiter.stopLimit(mac, ipAddress);
  }
  if (lagSwitch.isActive(mac)) {
    await lagSwitch.stopLag(mac, ipAddress);
  }
}

export function stopAllMitm() {
  const stops = [
    Promise.resolve(dnsHijack.stopAll()),
    Promise.resolve(portBlocker.stopAll()),
    Promise.resolve(oneWayKill.stopAll()),
    Promise.resolve(lagSwitch.stopAll()),
    Promise.resolve(speedLimiter.stopAll()),
    Promise.resolve(firewallKill.stopAll())
  ];
  return Promise.allSettled(stops);
}
