import { spawn } from 'child_process';
import path from 'path';
import logger from '../utils/logger.js';
import { getScriptsDir } from '../utils/paths.js';
import { resolvePython } from '../utils/pythonRuntime.js';
import { networkScanner } from './networkScanner.js';
import { networkDefense } from './networkDefense.js';

const SCRIPT = path.join(getScriptsDir(), 'arp_watch.py');

let process = null;
let alerts = [];
let ready = false;
let lastError = null;

function pushAlert(alert) {
  alerts = [
    {
      type: 'arp_attack',
      message: alert.detail || alert.message || 'Possible ARP spoof on your LAN',
      senderMac: alert.senderMac,
      victimIp: alert.victimIp,
      kind: alert.kind,
      at: new Date().toISOString()
    },
    ...alerts
  ].slice(0, 20);
  logger.warn(`ARP attack alert: ${alert.detail || alert.kind}`);
}

export function getArpAttackAlerts() {
  return alerts;
}

export function clearArpAttackAlerts() {
  alerts = [];
}

export function getArpMonitorStatus() {
  return {
    active: Boolean(process && !process.killed),
    ready,
    lastError,
    alertCount: alerts.length
  };
}

export async function startArpAttackMonitor() {
  if (process && !process.killed) return true;

  if (process.platform !== 'win32') {
    lastError = 'ARP monitor is Windows-only';
    return false;
  }

  let networkInfo;
  try {
    networkInfo = await networkScanner.getLocalNetworkInfo();
  } catch (error) {
    lastError = error.message;
    return false;
  }

  let gatewayMac = networkDefense.gatewayMac;
  let gatewayIp = networkDefense.gatewayIp;
  if (!gatewayIp || !gatewayMac) {
    try {
      const g = await networkDefense.resolveGateway();
      gatewayIp = g.ip;
      gatewayMac = g.mac;
    } catch {
      gatewayIp = gatewayIp || '';
      gatewayMac = gatewayMac || '';
    }
  }

  const python = await resolvePython();
  if (!python?.command) {
    lastError = 'Python/Scapy not available for ARP monitor';
    return false;
  }

  alerts = [];
  ready = false;
  lastError = null;

  const args = [
    SCRIPT,
    networkInfo.interface,
    networkInfo.ip,
    gatewayIp,
    gatewayMac || ''
  ];

  const child = spawn(python.command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  process = child;

  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === 'ready') {
          ready = true;
        } else if (msg.type === 'alert') {
          pushAlert(msg);
        } else if (msg.type === 'error') {
          lastError = msg.message;
        }
      } catch {
        // ignore non-json
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) lastError = text.slice(0, 200);
  });

  child.on('exit', (code) => {
    process = null;
    ready = false;
    if (code && code !== 0) {
      lastError = lastError || `ARP monitor exited (${code})`;
    }
  });

  return true;
}

export function stopArpAttackMonitor() {
  if (process && !process.killed) {
    process.kill('SIGTERM');
  }
  process = null;
  ready = false;
}
