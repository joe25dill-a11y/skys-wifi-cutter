import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let cache = { ipByMac: new Map(), macByIp: new Map(), at: 0 };
const TTL_MS = 12_000;

export function invalidateArpCache() {
  cache.at = 0;
}

export function normalizeMac(mac) {
  return String(mac || '')
    .toUpperCase()
    .replace(/-/g, ':');
}

export async function getArpMaps() {
  if (Date.now() - cache.at < TTL_MS) {
    return { ipByMac: cache.ipByMac, macByIp: cache.macByIp };
  }

  const ipByMac = new Map();
  const macByIp = new Map();

  try {
    const { stdout } = await execAsync('arp -a', { windowsHide: true });
    for (const line of stdout.split('\n')) {
      const ipMatch =
        line.match(/\((\d+\.\d+\.\d+\.\d+)\)/) || line.match(/^\s*(\d+\.\d+\.\d+\.\d+)\s+/);
      const macMatch = line.match(/([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})/);
      if (!ipMatch || !macMatch) continue;

      const ip = ipMatch[1];
      const mac = normalizeMac(macMatch[0]);
      if (mac === 'FF:FF:FF:FF:FF:FF' || mac.startsWith('00:00:00')) continue;

      ipByMac.set(mac, ip);
      macByIp.set(ip, mac);
    }
  } catch {
    // keep previous cache on failure
    if (cache.ipByMac.size > 0) {
      return { ipByMac: cache.ipByMac, macByIp: cache.macByIp };
    }
  }

  cache = { ipByMac, macByIp, at: Date.now() };
  return { ipByMac, macByIp };
}
