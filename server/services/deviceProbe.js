import net from 'net';
import dns from 'dns/promises';

const COMMON_PORTS = [
  { port: 80, service: 'HTTP' },
  { port: 443, service: 'HTTPS' },
  { port: 445, service: 'SMB' },
  { port: 554, service: 'RTSP' },
  { port: 3074, service: 'Xbox' },
  { port: 5353, service: 'mDNS' },
  { port: 8009, service: 'Chromecast' },
  { port: 8443, service: 'HTTPS-Alt' }
];

function probePort(ip, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, ip);
  });
}

export async function probeDevicePorts(ipAddress, ports = COMMON_PORTS) {
  const results = await Promise.all(
    ports.map(async ({ port, service }) => {
      const open = await probePort(ipAddress, port);
      return open ? { port, service } : null;
    })
  );
  return results.filter(Boolean);
}

export async function resolveHostnamesBulk(ips) {
  const map = new Map();
  const batch = 12;
  for (let i = 0; i < ips.length; i += batch) {
    await Promise.all(
      ips.slice(i, i + batch).map(async (ip) => {
        try {
          const names = await dns.reverse(ip);
          const host = names[0]?.split('.')[0];
          if (host && host !== ip) {
            map.set(ip, host);
          }
        } catch {
          // ignore
        }
      })
    );
  }
  return map;
}
