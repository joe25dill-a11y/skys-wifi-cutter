import fs from 'fs/promises';
import path from 'path';
import { getDataDir } from '../utils/paths.js';
import { validatePassword, validateSSID } from '../utils/validation.js';
import { generateHotspotPassword, isWeakPassword } from '../utils/hotspotPassword.js';

const FILE = path.join(getDataDir(), 'app-settings.json');

function buildDefaults() {
  return {
    bandwidthAlertMbps: 50,
    bandwidthAlertsEnabled: true,
    newDeviceAlertsEnabled: true,
    compactDeviceList: false,
    remoteControlEnabled: false,
    remotePin: '',
    lastAlertAt: null,
    minimizeToTrayOnClose: true,
    stopHotspotOnQuit: true,
    preferWinDivertForHotspot: true,
    powerSaverMode: false,
    livePollMs: 12000,
    defaultHotspotSsid: 'Xbox-LagControl',
    defaultHotspotPassword: generateHotspotPassword(12),
    gamingModeLagMs: 120,
    gamingModePulseIntervalSec: 30
  };
}

const BOOLEAN_KEYS = new Set([
  'bandwidthAlertsEnabled',
  'newDeviceAlertsEnabled',
  'compactDeviceList',
  'remoteControlEnabled',
  'minimizeToTrayOnClose',
  'stopHotspotOnQuit',
  'preferWinDivertForHotspot',
  'powerSaverMode'
]);

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function sanitizePatch(patch = {}, defaults = buildDefaults()) {
  const out = {};

  for (const key of BOOLEAN_KEYS) {
    if (key in patch) out[key] = Boolean(patch[key]);
  }

  if ('bandwidthAlertMbps' in patch) {
    out.bandwidthAlertMbps = clampInt(patch.bandwidthAlertMbps, 1, 10_000, defaults.bandwidthAlertMbps);
  }
  if ('livePollMs' in patch) {
    out.livePollMs = clampInt(patch.livePollMs, 5000, 60_000, defaults.livePollMs);
  }
  if ('gamingModeLagMs' in patch) {
    out.gamingModeLagMs = clampInt(patch.gamingModeLagMs, 50, 500, defaults.gamingModeLagMs);
  }
  if ('gamingModePulseIntervalSec' in patch) {
    out.gamingModePulseIntervalSec = clampInt(
      patch.gamingModePulseIntervalSec,
      10,
      120,
      defaults.gamingModePulseIntervalSec
    );
  }
  if ('remotePin' in patch) {
    const pin = String(patch.remotePin ?? '').trim();
    out.remotePin = pin.length >= 4 ? pin.slice(0, 32) : '';
  }
  if ('defaultHotspotSsid' in patch && patch.defaultHotspotSsid) {
    try {
      out.defaultHotspotSsid = validateSSID(String(patch.defaultHotspotSsid));
    } catch {
      // keep previous value
    }
  }
  if ('defaultHotspotPassword' in patch && patch.defaultHotspotPassword) {
    try {
      out.defaultHotspotPassword = validatePassword(String(patch.defaultHotspotPassword), 8);
    } catch {
      // keep previous value
    }
  }
  if ('lastAlertAt' in patch) {
    out.lastAlertAt = patch.lastAlertAt;
  }

  return out;
}

async function ensure() {
  await fs.mkdir(getDataDir(), { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, JSON.stringify(buildDefaults(), null, 2));
  }
}

export async function getSettings() {
  await ensure();
  const defaults = buildDefaults();
  const raw = JSON.parse(await fs.readFile(FILE, 'utf8'));
  let merged = { ...defaults, ...raw };

  // Upgrade old installs that still use a weak default password.
  if (isWeakPassword(merged.defaultHotspotPassword)) {
    merged = {
      ...merged,
      defaultHotspotPassword: generateHotspotPassword(12),
      passwordRotatedAt: new Date().toISOString()
    };
    await fs.writeFile(FILE, JSON.stringify(merged, null, 2));
  }

  try {
    return { ...merged, ...sanitizePatch(merged, defaults) };
  } catch {
    return { ...defaults };
  }
}

export async function updateSettings(patch) {
  const current = await getSettings();
  const safe = sanitizePatch(patch, current);
  const next = { ...current, ...safe, updatedAt: new Date().toISOString() };
  await fs.writeFile(FILE, JSON.stringify(next, null, 2));
  return next;
}
