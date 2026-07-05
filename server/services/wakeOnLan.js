import dgram from 'dgram';
import { normalizeMac } from './arpTable.js';
import { logAudit } from '../storage/auditLogStore.js';

export function sendWakeOnLan(macAddress, { ipAddress = '255.255.255.255', port = 9 } = {}) {
  const mac = normalizeMac(macAddress);
  const parts = mac.split(':');
  if (parts.length !== 6) {
    throw new Error('Invalid MAC address for Wake-on-LAN');
  }

  const macBytes = Buffer.from(parts.map((p) => parseInt(p, 16)));
  const packet = Buffer.alloc(6 + macBytes.length * 16);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i += 1) {
    macBytes.copy(packet, 6 + i * macBytes.length);
  }

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(() => {
      try {
        socket.setBroadcast(true);
      } catch {
        // optional
      }
      socket.send(packet, 0, packet.length, port, ipAddress, (err) => {
        socket.close();
        if (err) reject(err);
        else {
          logAudit('wake_on_lan', { mac, ip: ipAddress });
          resolve({ success: true, message: `Wake-on-LAN magic packet sent to ${mac}` });
        }
      });
    });
  });
}
