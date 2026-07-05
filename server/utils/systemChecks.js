import { execSync } from 'child_process';
import { checkNativeMeter, getNativeMeterPath } from './nativeRuntime.js';
import {
  checkNpcapInstalled,
  checkScapy,
  checkWinrtHotspot,
  resolvePython
} from './pythonRuntime.js';

const CHECKS_CACHE_MS = 5 * 60_000;
let checksCache = null;
let checksCacheAt = 0;
let checksInFlight = null;

export function checkAdminElevation() {
  if (process.platform === 'win32') {
    try {
      execSync('net session', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  return process.getuid?.() === 0;
}

async function computeSystemChecks() {
  const python = await resolvePython();
  const scapy = await checkScapy(python);
  const winrtHotspot = await checkWinrtHotspot(python);
  const npcap = checkNpcapInstalled();
  const isAdmin = checkAdminElevation();
  const nativeMeterPath = getNativeMeterPath();
  const nativeMeter = nativeMeterPath ? true : await checkNativeMeter();

  const warnings = [];
  if (!python) {
    warnings.push('Python runtime missing from install — reinstall Skys WiFi Cutter');
  } else if (!scapy) {
    warnings.push('Scapy missing from bundled runtime — reinstall Skys WiFi Cutter');
  } else if (!winrtHotspot && process.platform === 'win32') {
    warnings.push('Hotspot runtime missing — reinstall Skys WiFi Cutter');
  }
  if (!isAdmin) {
    warnings.push('Not running as Administrator — cut/block, metering, and hotspot may fail');
  }
  if (process.platform === 'win32' && !npcap) {
    warnings.push('Packet capture driver missing — reinstall Skys WiFi Cutter to install Npcap');
  }
  if (!nativeMeter && process.platform === 'win32') {
    warnings.push('Native C# engine not found — cut/meter/DNS will use Python fallback');
  }
  if (nativeMeter && !python) {
    warnings.push('Hotspot requires Python runtime — cut/meter/DNS use native engine');
  }

  const flowReady = Boolean(npcap && isAdmin && (nativeMeter || (python && scapy)));
  let flowBlockReason = null;
  if (!npcap) flowBlockReason = 'Npcap not installed';
  else if (!isAdmin) flowBlockReason = 'Run as Administrator for per-device bandwidth';
  else if (!nativeMeter && !python) flowBlockReason = 'Native meter or Python runtime missing';
  else if (!nativeMeter && !scapy) flowBlockReason = 'Native meter unavailable and Scapy missing';

  return {
    python: python?.command ?? null,
    pythonVersion: python?.version ?? null,
    pythonBundled: Boolean(python?.bundled),
    scapy,
    winrtHotspot,
    npcap,
    isAdmin,
    platform: process.platform,
    cutReady: Boolean(npcap && isAdmin && (nativeMeter || (python && scapy))),
    nativeMeter,
    nativeMeterPath,
    flowReady,
    flowBlockReason,
    hotspotReady: Boolean(python && winrtHotspot && isAdmin),
    warnings
  };
}

export async function getSystemChecks(force = false) {
  const now = Date.now();
  if (!force && checksCache && now - checksCacheAt < CHECKS_CACHE_MS) {
    return checksCache;
  }

  if (!force && checksInFlight) {
    return checksInFlight;
  }

  checksInFlight = computeSystemChecks()
    .then((result) => {
      checksCache = result;
      checksCacheAt = Date.now();
      return result;
    })
    .finally(() => {
      checksInFlight = null;
    });

  return checksInFlight;
}
