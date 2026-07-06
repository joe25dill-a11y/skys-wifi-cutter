import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../utils/logger.js';
import { networkScanner } from './networkScanner.js';

const execAsync = promisify(exec);

function normalizeMac(mac) {
  return String(mac || '')
    .toUpperCase()
    .replace(/-/g, ':');
}

function randomMac() {
  const bytes = new Uint8Array(6);
  for (let i = 0; i < 6; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[0] = (bytes[0] & 0xfe) | 0x02; // locally administered
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(':')
    .toUpperCase();
}

async function ps(script) {
  const { stdout } = await execAsync(
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`,
    { windowsHide: true, timeout: 30_000 }
  );
  return stdout.trim();
}

export async function listNetworkAdapters() {
  if (process.platform !== 'win32') {
    return { adapters: [], platform: process.platform, note: 'MAC tools are Windows-only' };
  }

  const raw = await ps(
    "Get-NetAdapter | Where-Object { $_.MacAddress } | Select-Object Name, InterfaceDescription, MacAddress, Status, MediaType | ConvertTo-Json -Compress"
  );

  let parsed = [];
  try {
    const data = JSON.parse(raw || '[]');
    parsed = Array.isArray(data) ? data : [data];
  } catch {
    parsed = [];
  }

  return {
    adapters: parsed.map((a) => ({
      name: a.Name,
      description: a.InterfaceDescription,
      mac: normalizeMac(String(a.MacAddress || '').replace(/(.{2})(?=.)/g, '$1:')),
      status: a.Status,
      mediaType: a.MediaType
    }))
  };
}

export async function setAdapterMac(adapterName, mac) {
  if (process.platform !== 'win32') {
    throw new Error('MAC spoofing is Windows-only');
  }
  if (!adapterName || !mac) {
    throw new Error('Adapter name and MAC required');
  }

  const macFlat = mac.replace(/:/g, '').replace(/-/g, '');
  if (!/^[0-9A-Fa-f]{12}$/.test(macFlat)) {
    throw new Error('Invalid MAC format');
  }

  await ps(
    `$a = Get-NetAdapter -Name '${adapterName.replace(/'/g, "''")}' -ErrorAction Stop; ` +
      `$a | Set-NetAdapter -MacAddress '${macFlat}' -Confirm:$false; ` +
      `Disable-NetAdapter -Name $a.Name -Confirm:$false; Start-Sleep -Seconds 2; ` +
      `Enable-NetAdapter -Name $a.Name -Confirm:$false`
  );

  logger.info(`MAC changed on ${adapterName} -> ${normalizeMac(macFlat)}`);
  return {
    success: true,
    adapter: adapterName,
    mac: normalizeMac(macFlat),
    message: 'MAC updated — adapter was restarted. Reconnect WiFi/Ethernet if needed.'
  };
}

export async function randomizeAdapterMac(adapterName) {
  return setAdapterMac(adapterName, randomMac());
}

export async function getVpnStatus() {
  if (process.platform !== 'win32') {
    return { connections: [], tunAdapters: [], platform: process.platform };
  }

  let connections = [];
  let tunAdapters = [];

  try {
    const raw = await ps(
      "Get-VpnConnection -ErrorAction SilentlyContinue | Select-Object Name, ServerAddress, ConnectionStatus, TunnelType | ConvertTo-Json -Compress"
    );
    if (raw) {
      const data = JSON.parse(raw);
      connections = (Array.isArray(data) ? data : [data]).map((c) => ({
        name: c.Name,
        server: c.ServerAddress,
        status: c.ConnectionStatus,
        tunnelType: c.TunnelType
      }));
    }
  } catch {
    // no VPN profiles
  }

  try {
    const raw = await ps(
      "Get-NetAdapter | Where-Object { $_.InterfaceDescription -match 'WireGuard|TAP|TUN|OpenVPN|Wintun|VPN|Nord|Express|Proton|Mullvad|Surfshark' } | Select-Object Name, InterfaceDescription, Status, MacAddress | ConvertTo-Json -Compress"
    );
    if (raw) {
      const data = JSON.parse(raw);
      tunAdapters = (Array.isArray(data) ? data : [data]).map((a) => ({
        name: a.Name,
        description: a.InterfaceDescription,
        status: a.Status,
        mac: normalizeMac(String(a.MacAddress || '').replace(/(.{2})(?=.)/g, '$1:'))
      }));
    }
  } catch {
    // ignore
  }

  return { connections, tunAdapters };
}

export async function connectVpn(name) {
  if (process.platform !== 'win32') throw new Error('VPN control is Windows-only');
  await execAsync(`rasdial "${name.replace(/"/g, '')}"`, { windowsHide: true, timeout: 60_000 });
  return { success: true, message: `Connected to ${name}` };
}

export async function disconnectVpn(name) {
  if (process.platform !== 'win32') throw new Error('VPN control is Windows-only');
  await execAsync(`rasdial "${name.replace(/"/g, '')}" /DISCONNECT`, { windowsHide: true, timeout: 30_000 });
  return { success: true, message: `Disconnected ${name}` };
}

export async function getIdentitySummary() {
  let localIp = null;
  try {
    const info = await networkScanner.getLocalNetworkInfo();
    localIp = info.ip;
  } catch {
    // ignore
  }
  const [adapters, vpn] = await Promise.all([listNetworkAdapters(), getVpnStatus()]);
  const vpnActive =
    vpn.connections.some((c) => String(c.status).toLowerCase() === 'connected') ||
    vpn.tunAdapters.some((a) => String(a.status).toLowerCase() === 'up');

  return {
    localIp,
    vpnActive,
    adapters: adapters.adapters,
    vpn
  };
}
