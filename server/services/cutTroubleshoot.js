import { exec } from 'child_process';
import { promisify } from 'util';
import { Netmask } from 'netmask';
import { networkScanner } from './networkScanner.js';
import { networkDefense } from './networkDefense.js';
import { getSystemChecks } from '../utils/systemChecks.js';

const execAsync = promisify(exec);

export async function runCutTroubleshoot() {
  const checks = await getSystemChecks();
  const suggestions = [];
  let gatewayReachable = false;
  let sameSubnet = true;
  let gatewayIp = null;
  let localIp = null;

  try {
    const net = await networkScanner.getLocalNetworkInfo();
    localIp = net.ip;
    const gateway = await networkDefense.resolveGateway();
    gatewayIp = gateway.ip;

    const block = new Netmask(net.ip, net.subnet);
    sameSubnet = block.contains(gatewayIp);
    if (!sameSubnet) {
      suggestions.push('PC and gateway are on different subnets — ARP cuts may not reach targets.');
    }

    try {
      if (process.platform === 'win32') {
        await execAsync(`ping -n 1 -w 2000 ${gatewayIp}`);
      } else {
        await execAsync(`ping -c 1 -W 2 ${gatewayIp}`);
      }
      gatewayReachable = true;
    } catch {
      gatewayReachable = false;
      suggestions.push('Gateway not responding to ping — reboot router or reconnect WiFi.');
    }
  } catch (err) {
    suggestions.push(`Network detection failed: ${err.message}`);
  }

  if (!checks.isAdmin) {
    suggestions.push('Run as Administrator — cut/lag need elevated privileges.');
  }
  if (!checks.npcap) {
    suggestions.push('Npcap missing — reinstall and reboot once.');
  }
  if (!checks.cutReady) {
    suggestions.push('Cut engine not ready — check native engine and Npcap in Diagnostics.');
  }

  if (gatewayReachable && sameSubnet && checks.cutReady) {
    suggestions.push(
      'If cut fails on WiFi only, check router AP/client isolation or guest-network settings.',
      'Mesh WiFi with IoT isolation may block LAN ARP — connect PC and target to the same AP.',
      'Try Ethernet on the PC while the target stays on WiFi to rule out isolation.'
    );
  } else {
    suggestions.push(
      'Guest networks often block LAN management — use your main WiFi SSID.',
      'Corporate or school WiFi blocks MITM — use only on home networks you own.'
    );
  }

  return {
    admin: Boolean(checks.isAdmin),
    npcapReady: Boolean(checks.npcap),
    cutReady: Boolean(checks.cutReady),
    gatewayReachable,
    sameSubnet,
    gatewayIp,
    localIp,
    suggestions: suggestions.slice(0, 8)
  };
}
