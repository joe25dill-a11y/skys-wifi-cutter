import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function scanWifiNetworks() {
  if (process.platform !== 'win32') {
    return {
      supported: false,
      networks: [],
      channels: [],
      message: 'WiFi analyzer is Windows-only in this build'
    };
  }

  try {
    const { stdout } = await execAsync('netsh wlan show networks mode=bssid', {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    });

    const networks = [];
    let current = null;

    for (const line of stdout.split('\n')) {
      const trimmed = line.trim();
      const ssidMatch = trimmed.match(/^SSID \d+ : (.*)$/);
      if (ssidMatch) {
        if (current) networks.push(current);
        current = {
          ssid: ssidMatch[1] || '(hidden)',
          bssid: null,
          channel: null,
          signal: null,
          band: null,
          auth: null
        };
        continue;
      }
      if (!current) continue;

      const bssid = trimmed.match(/^BSSID \d+\s+:\s+(.+)$/i);
      if (bssid) {
        current.bssid = bssid[1].trim();
        continue;
      }
      const signal = trimmed.match(/^Signal\s+:\s+(\d+)%/i);
      if (signal) {
        current.signal = Number(signal[1]);
        continue;
      }
      const channel = trimmed.match(/^Channel\s+:\s+(\d+)/i);
      if (channel) {
        current.channel = Number(channel[1]);
        current.band = current.channel > 14 ? '5 GHz' : '2.4 GHz';
        networks.push({ ...current });
        current = { ...current, bssid: null, channel: null, signal: null };
      }
      const auth = trimmed.match(/^Authentication\s+:\s+(.+)$/i);
      if (auth) current.auth = auth[1].trim();
    }
    if (current?.channel) networks.push(current);

    const channelMap = new Map();
    for (const n of networks) {
      if (!n.channel) continue;
      const entry = channelMap.get(n.channel) || { channel: n.channel, band: n.band, count: 0, maxSignal: 0 };
      entry.count += 1;
      entry.maxSignal = Math.max(entry.maxSignal, n.signal || 0);
      channelMap.set(n.channel, entry);
    }

    const channels = Array.from(channelMap.values()).sort((a, b) => a.channel - b.channel);
    const best = [...channels].sort((a, b) => a.count - b.count || b.maxSignal - a.maxSignal)[0];

    return {
      supported: true,
      networks: networks.filter((n) => n.channel),
      channels,
      recommendation: best
        ? `Channel ${best.channel} looks least crowded (${best.count} network(s))`
        : 'Scan again while WiFi adapter is on',
      scannedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      supported: true,
      networks: [],
      channels: [],
      error: error.message,
      message: 'Enable WiFi on this PC and run as Administrator'
    };
  }
}
