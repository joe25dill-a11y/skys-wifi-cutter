import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { networkScanner } from './services/networkScanner.js';
import { bandwidthMonitor } from './services/bandwidthMonitor.js';
import { flowTracker } from './services/flowTracker.js';
import { lagSwitch } from './services/lagSwitch.js';
import { deviceController } from './services/deviceController.js';
import { lagController } from './services/lagController.js';
import { hotspotController } from './services/hotspotController.js';
import { arpSpoofer } from './services/arpSpoofer.js';
import { networkDefense, startGatewayDriftMonitor, getGatewayDriftAlerts } from './services/networkDefense.js';
import { deviceStore } from './storage/deviceStore.js';
import { appendBandwidthSample, getBandwidthHistory, getDeviceUsageHistory, getTopDevicesUsage } from './storage/bandwidthHistoryStore.js';
import {
  getSchedules,
  addSchedule,
  updateSchedule,
  deleteSchedule
} from './storage/scheduleStore.js';
import { ruleScheduler } from './services/scheduler.js';
import { mitmMeter } from './services/mitmMeter.js';
import { scanWifiNetworks } from './services/wifiAnalyzer.js';
import { getArpMaps, invalidateArpCache } from './services/arpTable.js';
import { resolvePerDeviceBandwidth } from './services/bandwidthResolver.js';
import { ensureFlowTrackerRunning } from './services/flowBootstrap.js';
import { deviceMeter } from './services/deviceMeter.js';
import { dnsHijack } from './services/dnsHijack.js';
import { portBlocker } from './services/portBlocker.js';
import { oneWayKill } from './services/oneWayKill.js';
import { PORT_BLOCK_PRESETS } from './services/portBlockPresets.js';
import { DNS_BLOCK_PRESETS } from './services/dnsBlockPresets.js';
import { checkForUpdates } from './services/updateChecker.js';
import { runNativeKick } from './utils/nativeEngine.js';
import { runInternetSpeedTest } from './services/speedTest.js';
import { normalizeMac } from './services/arpTable.js';
import { logAudit, getAuditLog, clearAuditLog } from './storage/auditLogStore.js';
import { getSettings, updateSettings, maskSettingsForClient } from './storage/appSettingsStore.js';
import { generateHotspotPassword } from './utils/hotspotPassword.js';
import {
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  addMacToGroup,
  removeMacFromGroup
} from './storage/deviceGroupsStore.js';
import { firewallKill } from './services/firewallKill.js';
import { sendWakeOnLan } from './services/wakeOnLan.js';
import { exportAppData, importAppData } from './services/settingsExport.js';
import { evaluateBandwidthAlerts, getLastAlerts } from './services/bandwidthAlerts.js';
import { startMitmMonitor, stopMitmMonitor, getMitmIssues } from './services/mitmMonitor.js';
import { evaluateAutomationRules } from './services/rulesEngine.js';
import { getRules, addRule, deleteRule } from './storage/rulesStore.js';
import { getGamePresets, getGamePreset } from './services/gamePresets.js';
import { requireRemotePin } from './middleware/remoteAuth.js';
import { runCutTroubleshoot } from './services/cutTroubleshoot.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { getSystemChecks } from './utils/systemChecks.js';
import logger from './utils/logger.js';
import { getDistDir, getLogsDir } from './utils/paths.js';
import { runFullRuntimeCleanup } from './utils/runtimeCleanup.js';
import {
  validateMAC,
  validateIP,
  validateSSID,
  validatePassword,
  validateLagValue,
  validateBandwidth,
  ValidationError
} from './utils/validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;
const APP_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
).version;
const isProduction = process.env.NODE_ENV === 'production';

function isLocalRequest(req) {
  const ip = String(req.socket?.remoteAddress || req.ip || '');
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.endsWith('127.0.0.1')
  );
}

async function resolveListenHost() {
  if (process.env.HOST) return process.env.HOST;
  try {
    const settings = await getSettings();
    if (settings.remoteControlEnabled) return '0.0.0.0';
  } catch {
    // fall through
  }
  // Default: localhost only so LAN peers cannot hit cut/block APIs.
  return '127.0.0.1';
}
function parseTargetMacs(body) {
  if (body?.targetMacs == null) return null;
  if (!Array.isArray(body.targetMacs)) {
    throw new ValidationError('targetMacs must be an array', 'targetMacs');
  }
  return body.targetMacs.map((m) => validateMAC(m));
}
let bandwidthHistoryTimer = null;

function buildPerDeviceBandwidth(devices, arpMaps) {
  return resolvePerDeviceBandwidth(
    devices,
    flowTracker.getRatesByIpMap(),
    mitmMeter.getRatesByIpMap(),
    arpMaps,
    mitmMeter.getRatesByMacMap(),
    deviceMeter.getMeteringMacs()
  );
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.ELECTRON_APP
      ? true
      : process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again later'
});

app.use('/api/', limiter);

// Non-remote APIs are localhost-only. Remote routes use PIN auth separately.
app.use('/api/', (req, res, next) => {
  const url = req.originalUrl || req.url || '';
  if (url.includes('/api/remote/') || url.startsWith('/remote/')) {
    return next();
  }
  if (isLocalRequest(req)) return next();
  return res.status(403).json({
    error:
      'Local access only. Enable Remote Control in Tools → Remote, restart the app, then use /api/remote/* with your PIN.'
  });
});

arpSpoofer.setOnCutExit(async (macAddress) => {
  logger.warn(`ARP cut process ended unexpectedly for ${macAddress}`);
  deviceController.blockedDevices.delete(macAddress);
  await deviceStore.resetStatusIfBlocked(macAddress);
});

app.get('/api/health', async (req, res) => {
  let networkInfo = null;
  try {
    networkInfo = await networkScanner.getLocalNetworkInfo();
  } catch {
    // ignore
  }

  const checks = await getSystemChecks();
  const isHealthy = checks.cutReady && checks.warnings.length === 0;

  res.json({
    status: isHealthy ? 'ok' : 'degraded',
    degradedReason: !checks.cutReady
      ? checks.flowBlockReason || 'Cut/limit features not ready'
      : checks.warnings[0] || null,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    platform: process.platform,
    network: networkInfo
      ? { ...networkInfo, mac: normalizeMac(networkInfo.mac) }
      : null,
    activeCuts: arpSpoofer.getActiveCuts().length,
    speedLimits: deviceController.getActiveSpeedLimits(),
    lagSwitches: lagController.getActiveLags(),
    dnsLocks: dnsHijack.getActiveMacs(),
    dnsBlocks: dnsHijack.getActiveBlocks(),
    portBlocks: portBlocker.getActiveBlocks(),
    oneWayKills: oneWayKill.getActiveMacs().map((mac) => ({ mac })),
    firewallKills: firewallKill.getActive(),
    flowTracking: flowTracker.getStatus(),
    defense: networkDefense.getStatus(),
    checks
  });
});

app.get('/api/network', async (req, res, next) => {
  try {
    const info = await networkScanner.getLocalNetworkInfo();
    const range = networkScanner.getScanRange(info);
    res.json({ ...info, scanRange: range });
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices', async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    res.json(devices);
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices/export', async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = 'Name,IP,MAC,Status,Manufacturer,Type,Last Seen\n';
    const rows = devices
      .map((d) =>
        [
          escape(d.name),
          escape(d.ip_address),
          escape(d.mac_address),
          escape(d.status),
          escape(d.manufacturer),
          escape(d.device_type),
          escape(d.last_seen)
        ].join(',')
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="skys-wifi-cutter-devices.csv"');
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/refresh', async (req, res, next) => {
  try {
    const deep = Boolean(req.body?.deep);
    logger.info('Device scan requested', { deep });
    const scanned = await networkScanner.scanNetwork({ deep });
    const devices = await deviceStore.upsertFromScan(scanned);
    await ensureFlowTrackerRunning();
    logAudit('device_scan', { detail: { deep, count: scanned.length } });
    logger.info('Device scan completed', { count: scanned.length });
    res.json({ success: true, count: scanned.length, devices });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/quick-scan', async (req, res, next) => {
  try {
    invalidateArpCache();
    const scanned = await networkScanner.scanNetwork({ deep: false });
    const devices = await deviceStore.upsertFromScan(scanned);
    logAudit('quick_scan', { detail: { count: scanned.length } });
    res.json({ success: true, count: scanned.length, devices });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/refresh-bandwidth', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    let device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const arpMaps = await getArpMaps();
    const liveIp = arpMaps.ipByMac.get(normalizeMac(mac));
    if (liveIp && liveIp !== device.ip_address) {
      device = await deviceStore.updateIp(mac, liveIp);
    }

    const ip = validateIP(device.ip_address);
    const online = await deviceMeter.pingDevice(ip);
    if (online) {
      await deviceStore.markOnline(mac);
      device = (await deviceStore.getByMac(mac)) || device;
    }

    const durationSec = Math.min(90, Math.max(15, Number(req.body?.seconds) || 45));
    let meterResult = null;
    try {
      const networkInfo = await networkScanner.getLocalNetworkInfo();
      meterResult = await deviceMeter.refreshDevice(
        mac,
        ip,
        networkInfo.interface,
        networkInfo.ip,
        durationSec
      );
      if (meterResult?.ip && meterResult.ip !== device.ip_address) {
        device = (await deviceStore.updateIp(mac, meterResult.ip)) || device;
      }
    } catch (meterErr) {
      meterResult = { metering: false, message: meterErr.message };
    }

    await ensureFlowTrackerRunning();
    invalidateArpCache();
    const freshArpMaps = await getArpMaps();
    const devices = await deviceStore.getAll();
    const bandwidth = buildPerDeviceBandwidth(devices, freshArpMaps).find(
      (d) => normalizeMac(d.mac) === normalizeMac(mac)
    );

    res.json({
      success: true,
      device,
      bandwidth,
      online,
      metering: meterResult?.metering ?? false,
      engine: meterResult?.engine ?? null,
      secondsLeft: meterResult?.secondsLeft ?? 0,
      message:
        meterResult?.message ||
        (online
          ? 'Device refreshed'
          : 'Device not responding to ping — meter started anyway if possible')
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/meter-all', async (req, res, next) => {
  try {
    const durationSec = Math.min(90, Math.max(15, Number(req.body?.seconds) || 45));
    const devices = await deviceStore.getAll();
    const networkInfo = await networkScanner.getLocalNetworkInfo();
    const localMac = normalizeMac(networkInfo.mac);
    const targets = devices.filter(
      (d) => d.is_online !== false && normalizeMac(d.mac_address) !== localMac
    );

    const results = [];
    for (const device of targets.slice(0, 3)) {
      try {
        const result = await deviceMeter.refreshDevice(
          device.mac_address,
          device.ip_address,
          networkInfo.interface,
          networkInfo.ip,
          durationSec
        );
        results.push({ mac: device.mac_address, name: device.name, ...result });
      } catch (error) {
        results.push({ mac: device.mac_address, name: device.name, error: error.message });
      }
    }

    res.json({
      success: true,
      count: results.filter((r) => r.metering).length,
      total: targets.length,
      results,
      message: `Metering ${results.filter((r) => r.metering).length} online device(s) for ${durationSec}s`
    });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/devices/:mac/favorite', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const favorite = Boolean(req.body?.favorite);
    const updated = await deviceStore.setFavorite(mac, favorite);
    if (!updated) {
      throw new ValidationError('Device not found', 'mac');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/kick', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    const gatewayIp = await arpSpoofer.getGatewayIp();
    const networkInfo = await networkScanner.getLocalNetworkInfo();

    try {
      await runNativeKick(ip, mac, gatewayIp, networkInfo.interface, networkInfo.ip);
      res.json({ success: true, message: `${device.name} kicked off the network (ARP flush)` });
    } catch (kickErr) {
      await deviceController.blockDevice(mac, ip);
      await new Promise((r) => setTimeout(r, 2000));
      await deviceController.unblockDevice(mac, ip);
      res.json({
        success: true,
        message: `${device.name} kicked (fallback cut pulse)`,
        fallback: kickErr.message
      });
    }
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/dns-block', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const result = await dnsHijack.start(mac, validateIP(device.ip_address), {
      preset: req.body?.preset,
      domains: req.body?.domains
    });
    await deviceStore.setDnsBlocked(mac, true);
    res.json({ ...result, device: await deviceStore.getByMac(mac) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/dns-unblock', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const result = await dnsHijack.stop(mac, device.ip_address);
    await deviceStore.setDnsBlocked(mac, false);
    res.json({ ...result, device: await deviceStore.getByMac(mac) });
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices/:mac/usage', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    res.json(await getDeviceUsageHistory(mac, hours));
  } catch (err) {
    next(err);
  }
});

app.get('/api/bandwidth/top', async (req, res, next) => {
  try {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const limit = Math.min(25, Math.max(1, Number(req.query.limit) || 10));
    res.json({ hours, devices: await getTopDevicesUsage(hours, limit) });
  } catch (err) {
    next(err);
  }
});

app.get('/api/app/update-check', async (req, res, next) => {
  try {
    res.json(await checkForUpdates());
  } catch (err) {
    next(err);
  }
});

app.get('/api/port-block/presets', (req, res) => {
  res.json({
    presets: Object.entries(PORT_BLOCK_PRESETS).map(([id, value]) => ({
      id,
      label: value.label,
      ports: value.ports
    }))
  });
});

app.get('/api/dns-block/presets', (req, res) => {
  res.json({
    presets: Object.entries(DNS_BLOCK_PRESETS).map(([id, value]) => ({
      id,
      label: value.label,
      domainCount: value.domains.length,
      selective: id !== 'full'
    }))
  });
});

app.get('/api/devices/dns-blocks', (req, res) => {
  res.json({ blocks: dnsHijack.getActiveBlocks() });
});

app.get('/api/devices/port-blocks', (req, res) => {
  res.json({ blocks: portBlocker.getActiveBlocks() });
});

app.post('/api/devices/:mac/port-block', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const result = await portBlocker.start(mac, validateIP(device.ip_address), {
      preset: req.body?.preset,
      ports: req.body?.ports
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/game-preset', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }
    const preset = getGamePreset(req.body?.presetId);
    if (!preset) {
      throw new ValidationError('Unknown game preset', 'presetId');
    }
    const ip = validateIP(device.ip_address);
    const applyLag = Boolean(req.body?.applyLag);

    if (applyLag) {
      const lagMs = validateLagValue(preset.lagMs, 'lagMs');
      if (portBlocker.isBlocking(mac)) {
        await portBlocker.stop(mac, ip);
      }
      await lagController.applyLag(mac, ip, lagMs, lagMs);
      logAudit('game_preset', { mac, detail: { presetId: preset.id, lagMs, mode: 'lag' } });
      return res.json({
        success: true,
        message: `${preset.label} lag applied (${lagMs}ms)`
      });
    }

    if (lagSwitch.isActive(mac)) {
      await lagController.removeLag(mac, ip);
    }

    const result = await portBlocker.start(mac, ip, {
      ports: preset.ports,
      preset: preset.id,
      label: preset.label
    });
    logAudit('game_preset', { mac, detail: { presetId: preset.id, ports: preset.ports.length } });
    res.json({
      ...result,
      message: `${preset.label} ports blocked (${preset.ports.length} ports)`
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/game-presets', (req, res) => {
  res.json({ presets: getGamePresets() });
});

app.get('/api/rules', async (req, res, next) => {
  try {
    res.json(await getRules());
  } catch (err) {
    next(err);
  }
});

app.post('/api/rules', async (req, res, next) => {
  try {
    const mac = validateMAC(req.body.mac);
    const rules = await addRule({
      mac,
      condition: req.body.condition || 'above_mbps',
      thresholdMbps: Number(req.body.thresholdMbps) || 50,
      action: req.body.action || 'cut',
      lagMs: Number(req.body.lagMs) || 150,
      enabled: req.body.enabled !== false
    });
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/rules/:id', async (req, res, next) => {
  try {
    const rules = await deleteRule(req.params.id);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

app.get('/api/remote/status', requireRemotePin, async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    const hotspot = await hotspotController.getStatus();
    res.json({
      version: APP_VERSION,
      hotspotActive: hotspot.isActive,
      hotspotFrozen: hotspot.isTrafficBlocked,
      connectedClients: hotspot.connectedDevices,
      deviceCount: devices.length,
      cutCount: devices.filter((d) => d.status === 'blocked').length
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/remote/devices', requireRemotePin, async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    res.json({
      devices: devices.map((d) => ({
        mac: d.mac_address,
        name: d.name || d.custom_name || d.mac_address,
        ip: d.ip_address,
        status: d.status
      }))
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/remote/hotspot/freeze', requireRemotePin, async (req, res, next) => {
  try {
    const targetMacs = parseTargetMacs(req.body);
    await hotspotController.freezeConnection(null, targetMacs);
    logAudit('hotspot_freeze', { detail: { remote: true, targets: targetMacs } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/remote/hotspot/unfreeze', requireRemotePin, async (req, res, next) => {
  try {
    await hotspotController.unfreezeConnection();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/remote/devices/:mac/cut', requireRemotePin, async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) throw new ValidationError('Device not found', 'mac');
    await deviceController.blockDevice(mac, validateIP(device.ip_address));
    await deviceStore.updateStatus(mac, 'blocked');
    logAudit('cut', { mac, detail: { remote: true } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/remote/devices/:mac/restore', requireRemotePin, async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) throw new ValidationError('Device not found', 'mac');
    await deviceController.unblockDevice(mac, validateIP(device.ip_address));
    await deviceStore.updateStatus(mac, 'allowed');
    logAudit('uncut', { mac, detail: { remote: true } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/port-unblock', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    res.json(await portBlocker.stop(mac, device.ip_address));
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices/one-way-kills', (req, res) => {
  res.json({ kills: oneWayKill.getActiveMacs().map((mac) => ({ mac })) });
});

app.post('/api/devices/:mac/one-way-kill', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const result = await oneWayKill.start(mac, validateIP(device.ip_address));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/one-way-kill-stop', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    res.json(await oneWayKill.stop(mac, device.ip_address));
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/cut-all', async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    let excludeMac = null;
    try {
      const info = await networkScanner.getLocalNetworkInfo();
      excludeMac = info.mac?.toUpperCase().replace(/-/g, ':') || null;
    } catch {
      // ignore
    }
    const result = await deviceController.cutAll(devices, excludeMac);
    const updated = await deviceStore.getAll();
    res.json({ ...result, devices: updated });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/restore-all', async (req, res, next) => {
  try {
    const devices = await deviceStore.getAll();
    const result = await deviceController.restoreAll(devices);
    const updated = await deviceStore.getAll();
    res.json({ ...result, devices: updated });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/devices/:mac/notes', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const notes = String(req.body.notes ?? '').slice(0, 500);
    const updated = await deviceStore.updateNotes(mac, notes);
    if (!updated) {
      throw new ValidationError('Device not found', 'mac');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.get('/api/bandwidth/history', async (req, res, next) => {
  try {
    const hours = Math.min(168, Math.max(1, Number(req.query.hours) || 24));
    const history = await getBandwidthHistory(hours);
    res.json({ history, hours });
  } catch (err) {
    next(err);
  }
});

app.get('/api/schedules', async (req, res, next) => {
  try {
    res.json({ schedules: await getSchedules() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/schedules', async (req, res, next) => {
  try {
    const action = req.body.action;
    const validActions = [
      'cut',
      'restore',
      'limit',
      'lag',
      'dns_block',
      'port_block',
      'firewall_kill',
      'group_cut',
      'group_restore'
    ];
    if (!validActions.includes(action)) {
      throw new ValidationError('Invalid action', 'action');
    }

    const isGroupAction = action === 'group_cut' || action === 'group_restore';
    const rulePayload = {
      action,
      time: String(req.body.time || '22:00'),
      days: Array.isArray(req.body.days) ? req.body.days : [0, 1, 2, 3, 4, 5, 6],
      uploadKbps: req.body.uploadKbps,
      downloadKbps: req.body.downloadKbps,
      lagMs: req.body.lagMs,
      preset: req.body.preset ? String(req.body.preset).slice(0, 32) : undefined,
      domains: Array.isArray(req.body.domains) ? req.body.domains : undefined,
      ports: Array.isArray(req.body.ports) ? req.body.ports : undefined,
      enabled: req.body.enabled !== false,
      label: String(req.body.label || '').slice(0, 80)
    };

    if (isGroupAction) {
      const groupId = String(req.body.groupId || '').trim();
      if (!groupId) throw new ValidationError('groupId required for group actions', 'groupId');
      const groups = await getGroups();
      if (!groups.find((g) => g.id === groupId)) {
        throw new ValidationError('Group not found', 'groupId');
      }
      rulePayload.groupId = groupId;
    } else {
      rulePayload.mac = validateMAC(req.body.mac);
    }

    const rule = await addSchedule(rulePayload);
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

app.patch('/api/schedules/:id', async (req, res, next) => {
  try {
    const updated = await updateSchedule(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/schedules/:id', async (req, res, next) => {
  try {
    res.json(await deleteSchedule(req.params.id));
  } catch (err) {
    next(err);
  }
});

app.patch('/api/devices/:mac/rename', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const name = String(req.body.name || '').trim();
    if (!name || name.length > 64) {
      throw new ValidationError('Name must be 1-64 characters', 'name');
    }
    const updated = await deviceStore.rename(mac, name);
    if (!updated) {
      throw new ValidationError('Device not found', 'mac');
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.get('/api/defense/status', (req, res) => {
  res.json(networkDefense.getStatus());
});

app.post('/api/defense/enable', async (req, res, next) => {
  try {
    const result = await networkDefense.enable();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/defense/disable', async (req, res, next) => {
  try {
    const result = await networkDefense.disable();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/toggle', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    const newStatus = device.status === 'allowed' ? 'blocked' : 'allowed';

    if (newStatus === 'blocked') {
      await deviceController.blockDevice(mac, ip);
    } else {
      await deviceController.unblockDevice(mac, ip);
    }

    const updated = await deviceStore.updateStatus(mac, newStatus);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/limit-speed', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const uploadKbps = validateBandwidth(req.body.uploadKbps, 'uploadKbps');
    const downloadKbps = validateBandwidth(req.body.downloadKbps, 'downloadKbps');
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    const result = await deviceController.limitDeviceBandwidth(
      mac,
      ip,
      uploadKbps,
      downloadKbps
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/remove-speed-limit', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    const result = await deviceController.removeSpeedLimit(mac, ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices/speed-limits', async (req, res) => {
  res.json({ limits: deviceController.getActiveSpeedLimits() });
});

app.post('/api/devices/:mac/lag-control', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const outgoingMs = validateLagValue(req.body.outgoingMs, 'outgoingMs');
    const incomingMs = validateLagValue(req.body.incomingMs, 'incomingMs');
    const uploadKbps = req.body.uploadKbps != null
      ? validateBandwidth(req.body.uploadKbps, 'uploadKbps')
      : 0;
    const downloadKbps = req.body.downloadKbps != null
      ? validateBandwidth(req.body.downloadKbps, 'downloadKbps')
      : 0;
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    await lagController.applyLag(mac, ip, outgoingMs, incomingMs, uploadKbps, downloadKbps);
    res.json({ success: true, message: 'Lag switch applied' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/remove-lag', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    await lagController.removeLag(mac, ip);
    res.json({ success: true, message: 'Lag control removed successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/lag-spike', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const durationMs = validateLagValue(req.body.durationMs, 'durationMs');
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    await lagController.triggerLagSpike(mac, ip, durationMs);
    res.json({ success: true, message: `Lag spike triggered for ${durationMs}ms` });
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/ghost-pulse', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);

    if (!device) {
      throw new ValidationError('Device not found', 'mac');
    }

    const ip = validateIP(device.ip_address);
    const incomingMs = req.body.incomingMs
      ? validateLagValue(req.body.incomingMs, 'incomingMs')
      : 1200;
    const freezeMs = req.body.freezeMs ? validateLagValue(req.body.freezeMs, 'freezeMs') : 250;
    const count = req.body.count ? validateLagValue(req.body.count, 'count') : 8;

    const result = await lagController.triggerGhostPulse(mac, ip, {
      incomingMs,
      freezeMs,
      count
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/bandwidth/live', async (req, res, next) => {
  try {
    const total = await bandwidthMonitor.getTotalBandwidth();
    const devices = await deviceStore.getAll();
    const flowStatus = flowTracker.getStatus();
    const arpMaps = await getArpMaps();
    const perDeviceList = buildPerDeviceBandwidth(devices, arpMaps);
    const hasMitmData =
      mitmMeter.getRatesByIpMap().size > 0 || mitmMeter.getRatesByMacMap().size > 0;
    const hasAnyDeviceRate = perDeviceList.some((d) => d.upload > 0 || d.download > 0);
    const meteringMacs = deviceMeter.getMeteringMacs();
    const perDeviceActive =
      (flowStatus.active && flowStatus.ready && flowStatus.trackedHosts > 0) ||
      hasMitmData ||
      hasAnyDeviceRate ||
      meteringMacs.length > 0;

    res.json({
      total,
      perDevice: perDeviceActive,
      devices: perDeviceList,
      meteringMacs,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/bandwidth', async (req, res, next) => {
  try {
    await ensureFlowTrackerRunning();
    const total = await bandwidthMonitor.getTotalBandwidth();
    const devices = await deviceStore.getAll();
    const flowStatus = flowTracker.getStatus();
    const arpMaps = await getArpMaps();
    const perDeviceList = buildPerDeviceBandwidth(devices, arpMaps);
    const hasMitmData =
      mitmMeter.getRatesByIpMap().size > 0 || mitmMeter.getRatesByMacMap().size > 0;
    const hasAnyDeviceRate = perDeviceList.some((d) => d.upload > 0 || d.download > 0);
    const meteringMacs = deviceMeter.getMeteringMacs();
    const perDeviceActive =
      (flowStatus.active && flowStatus.ready && flowStatus.trackedHosts > 0) ||
      hasMitmData ||
      hasAnyDeviceRate ||
      meteringMacs.length > 0;

    res.json({
      total,
      perDevice: perDeviceActive,
      devices: perDeviceList,
      flowTracking: flowStatus,
      meteringMacs,
      note: meteringMacs.length
        ? `Metering ${meteringMacs.length} device(s) for ~45s — browse/stream on that device; Mbps updates every second.`
        : hasMitmData
          ? 'Recent per-device Mbps from live meter (native or Python MITM).'
          : perDeviceActive
            ? 'Passive mode often shows — on Wi‑Fi. Click device → ReTest, or Bandwidth → Meter.'
            : total.priming
              ? 'Measuring… wait a few seconds.'
              : flowStatus.lastError
                ? `Per-device tracking unavailable: ${flowStatus.lastError}`
                : 'Run as Administrator. Click Meter on a device row, or open device → ReTest.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/speedtest/run', async (req, res, next) => {
  try {
    res.json(await runInternetSpeedTest());
  } catch (err) {
    next(err);
  }
});

app.get('/api/wifi/scan', async (req, res, next) => {
  try {
    res.json(await scanWifiNetworks());
  } catch (err) {
    next(err);
  }
});

app.get('/api/hotspot/status', async (req, res, next) => {
  try {
    const status = await hotspotController.getStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

app.get('/api/hotspot/capability', async (req, res, next) => {
  try {
    if (process.platform !== 'win32') {
      return res.json({ platform: process.platform, message: 'Use Linux hostapd path' });
    }
    const capability = await hotspotController.getWindowsCapability();
    res.json(capability);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/start', async (req, res, next) => {
  try {
    const settings = await getSettings();
    const ssid = validateSSID(req.body.ssid || settings.defaultHotspotSsid);
    const password = validatePassword(req.body.password || settings.defaultHotspotPassword, 8);
    await hotspotController.startHotspot(ssid, password);
    res.json({ success: true, ssid, message: 'Hotspot started successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/stop', async (req, res, next) => {
  try {
    await hotspotController.stopHotspot();
    res.json({ success: true, message: 'Hotspot stopped successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/freeze', async (req, res, next) => {
  try {
    const durationMs = req.body.durationMs ? validateLagValue(req.body.durationMs) : null;
    const targetMacs = parseTargetMacs(req.body);
    const result = await hotspotController.freezeConnection(durationMs, targetMacs);
    logAudit('hotspot_freeze', { detail: { targets: targetMacs, durationMs } });
    res.json({ success: true, message: 'Connection frozen', ...result });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/unfreeze', async (req, res, next) => {
  try {
    await hotspotController.unfreezeConnection();
    res.json({ success: true, message: 'Connection unfrozen' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/pulse', async (req, res, next) => {
  try {
    const count = validateLagValue(req.body.count || 5, 'count');
    const freezeMs = validateLagValue(req.body.freezeMs || 150, 'freezeMs');
    const unfreezeMs = validateLagValue(req.body.unfreezeMs || 100, 'unfreezeMs');
    const targetMacs = parseTargetMacs(req.body);
    await hotspotController.pulseFreeze(count, freezeMs, unfreezeMs, targetMacs);
    logAudit('hotspot_pulse', { detail: { count, freezeMs, unfreezeMs, targets: targetMacs } });
    res.json({ success: true, message: 'Pulse completed' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/targets', async (req, res, next) => {
  try {
    const targetMacs = parseTargetMacs(req.body) ?? [];
    const selected = hotspotController.setSelectedTargets(targetMacs);
    res.json({ success: true, selectedTargetMacs: selected });
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/constant-lag/start', async (req, res, next) => {
  try {
    const lagMs = validateLagValue(req.body.lagMs || 150, 'lagMs');
    const targetMacs = parseTargetMacs(req.body);
    const result = await hotspotController.startConstantLag(lagMs, targetMacs);
    logAudit('hotspot_constant_lag_start', { detail: { lagMs, targets: targetMacs } });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/constant-lag/stop', async (req, res, next) => {
  try {
    const result = await hotspotController.stopConstantLag();
    logAudit('hotspot_constant_lag_stop');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/gaming-mode/start', async (req, res, next) => {
  try {
    const targetMacs = parseTargetMacs(req.body);
    const result = await hotspotController.startGamingMode(targetMacs, {
      lagMs: req.body.lagMs,
      pulseIntervalSec: req.body.pulseIntervalSec,
      enablePulse: req.body.enablePulse
    });
    logAudit('hotspot_gaming_mode_start', { detail: { targets: targetMacs } });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/gaming-mode/stop', async (req, res, next) => {
  try {
    const result = await hotspotController.stopGamingMode();
    logAudit('hotspot_gaming_mode_stop');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/bandwidth-cap', async (req, res, next) => {
  try {
    const uploadKbps = validateBandwidth(req.body.uploadKbps || 512, 'uploadKbps');
    const downloadKbps = validateBandwidth(req.body.downloadKbps || 2048, 'downloadKbps');
    const targetMacs = parseTargetMacs(req.body);
    const result = await hotspotController.setBandwidthCap(uploadKbps, downloadKbps, targetMacs);
    logAudit('hotspot_bandwidth_cap', { detail: { uploadKbps, downloadKbps, targets: targetMacs } });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/hotspot/bandwidth-cap/clear', async (req, res, next) => {
  try {
    const result = await hotspotController.clearBandwidthCap();
    logAudit('hotspot_bandwidth_cap_clear');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/hotspot/presets', (req, res) => {
  res.json({ presets: hotspotController.getSsidPresets() });
});

app.post('/api/hotspot/preset', async (req, res, next) => {
  try {
    const preset = await hotspotController.applySsidPreset(req.body.presetId);
    res.json({ success: true, preset });
  } catch (err) {
    next(err);
  }
});

app.get('/api/groups', async (req, res, next) => {
  try {
    res.json({ groups: await getGroups() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/groups', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ValidationError('Group name required', 'name');
    const group = await createGroup(name);
    res.json({ success: true, group });
  } catch (err) {
    next(err);
  }
});

app.patch('/api/groups/:id', async (req, res, next) => {
  try {
    const group = await updateGroup(req.params.id, req.body);
    if (!group) throw new ValidationError('Group not found', 'id');
    res.json({ success: true, group });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/groups/:id', async (req, res, next) => {
  try {
    await deleteGroup(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/groups/:id/macs', async (req, res, next) => {
  try {
    const mac = validateMAC(req.body.mac);
    const group = await addMacToGroup(req.params.id, mac);
    if (!group) throw new ValidationError('Group not found', 'id');
    res.json({ success: true, group });
  } catch (err) {
    next(err);
  }
});

app.delete('/api/groups/:id/macs/:mac', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const group = await removeMacFromGroup(req.params.id, mac);
    res.json({ success: true, group });
  } catch (err) {
    next(err);
  }
});

app.post('/api/groups/:id/cut-all', async (req, res, next) => {
  try {
    const groups = await getGroups();
    const group = groups.find((g) => g.id === req.params.id);
    if (!group) throw new ValidationError('Group not found', 'id');
    const devices = await deviceStore.getAll();
    let count = 0;
    for (const mac of group.macs) {
      const device = devices.find((d) => normalizeMac(d.mac_address) === normalizeMac(mac));
      if (!device) continue;
      await deviceController.blockDevice(device.mac_address, device.ip_address);
      await deviceStore.updateStatus(device.mac_address, 'blocked');
      count += 1;
    }
    logAudit('group_cut_all', { detail: { groupId: group.id, count } });
    res.json({ success: true, count, devices: await deviceStore.getAll() });
  } catch (err) {
    next(err);
  }
});

app.post('/api/groups/:id/restore-all', async (req, res, next) => {
  try {
    const groups = await getGroups();
    const group = groups.find((g) => g.id === req.params.id);
    if (!group) throw new ValidationError('Group not found', 'id');
    const devices = await deviceStore.getAll();
    let count = 0;
    for (const mac of group.macs) {
      const device = devices.find((d) => normalizeMac(d.mac_address) === normalizeMac(mac));
      if (!device) continue;
      await deviceController.unblockDevice(device.mac_address, device.ip_address);
      await deviceStore.updateStatus(device.mac_address, 'allowed');
      count += 1;
    }
    logAudit('group_restore_all', { detail: { groupId: group.id, count } });
    res.json({ success: true, count, devices: await deviceStore.getAll() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/audit', (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
  const hours = Math.min(720, parseInt(req.query.hours, 10) || 168);
  res.json({ entries: getAuditLog({ limit, hours }) });
});

app.delete('/api/audit', (req, res) => {
  res.json(clearAuditLog());
});

async function buildDiagnosticsPayload() {
  const [checks, hotspot] = await Promise.all([
    getSystemChecks(),
    hotspotController.getStatus()
  ]);
  return {
    version: APP_VERSION,
    checks,
    hotspot: {
      isActive: hotspot.isActive,
      windowsHotspotActive: hotspot.windowsHotspotActive,
      isTrafficBlocked: hotspot.isTrafficBlocked,
      freezeEngine: hotspot.freezeEngine,
      constantLagEngine: hotspot.constantLagEngine,
      gamingModeActive: hotspot.gamingModeActive,
      connectedDevices: hotspot.connectedDevices,
      windivert: hotspot.windivert
    },
    activeCuts: arpSpoofer.getActiveCuts().length,
    lagSwitches: lagController.getActiveLags().length,
    dnsBlocks: dnsHijack.getActiveBlocks().length,
    portBlocks: portBlocker.getActiveBlocks().length,
    defense: networkDefense.getStatus(),
    flowTracking: flowTracker.getStatus(),
    uptimeSec: Math.round(process.uptime())
  };
}

function readRecentLogTail(maxLines = 40) {
  try {
    const logPath = path.join(getLogsDir(), 'error.log');
    if (!existsSync(logPath)) return [];
    const text = readFileSync(logPath, 'utf8').trim();
    if (!text) return [];
    return text.split(/\r?\n/).slice(-maxLines);
  } catch {
    return [];
  }
}

app.get('/api/diagnostics/cut-troubleshoot', async (req, res, next) => {
  try {
    res.json(await runCutTroubleshoot());
  } catch (err) {
    next(err);
  }
});

app.get('/api/diagnostics', async (req, res, next) => {
  try {
    res.json(await buildDiagnosticsPayload());
  } catch (err) {
    next(err);
  }
});

app.get('/api/diagnostics/report', async (req, res, next) => {
  try {
    const data = await buildDiagnosticsPayload();
    const checks = data.checks || {};
    const hs = data.hotspot || {};
    const flow = data.flowTracking || {};
    const lines = [
      'Skys WiFi Cutter — feedback report',
      `Version: ${data.version}`,
      `Time: ${new Date().toISOString()}`,
      `Platform: ${process.platform} ${process.arch}`,
      `Uptime: ${data.uptimeSec}s`,
      '',
      'System',
      `- Admin: ${checks.isAdmin ? 'yes' : 'no'}`,
      `- Npcap: ${checks.npcap ? 'yes' : 'no'}`,
      `- Native meter: ${checks.nativeMeter ? 'yes' : 'no'}`,
      `- Cut ready: ${checks.cutReady ? 'yes' : 'no'}`,
      `- Hotspot ready: ${checks.hotspotReady ? 'yes' : 'no'}`,
      `- Python bundled: ${checks.pythonBundled ? 'yes' : 'no'}`,
      `- Scapy: ${checks.scapy ? 'yes' : 'no'}`,
      `- WinRT hotspot: ${checks.winrtHotspot ? 'yes' : 'no'}`,
      '',
      'Hotspot',
      `- Windows hotspot: ${hs.windowsHotspotActive == null ? 'unknown' : hs.windowsHotspotActive ? 'on' : 'off'}`,
      `- App linked: ${hs.isActive ? 'yes' : 'no'}`,
      `- Clients: ${hs.connectedDevices ?? 0}`,
      `- Freeze engine: ${hs.freezeEngine || 'none'}`,
      `- Lag engine: ${hs.constantLagEngine || 'none'}`,
      `- Gaming mode: ${hs.gamingModeActive ? 'on' : 'off'}`,
      `- WinDivert: ${hs.windivert?.bundled ? 'bundled' : 'missing'}`,
      '',
      'Active controls',
      `- Cuts: ${data.activeCuts}`,
      `- Lag: ${data.lagSwitches}`,
      `- DNS blocks: ${data.dnsBlocks}`,
      `- Port blocks: ${data.portBlocks}`,
      `- Flow tracking: ${flow.active ? 'active' : 'off'} (${flow.trackedHosts ?? 0} hosts)`,
      ''
    ];

    if (checks.warnings?.length) {
      lines.push('Warnings');
      for (const warning of checks.warnings) lines.push(`- ${warning}`);
      lines.push('');
    }

    const logTail = readRecentLogTail();
    if (logTail.length) {
      lines.push('Recent errors (tail)');
      lines.push(...logTail);
      lines.push('');
    }

    lines.push('Describe what you tried and what went wrong below:');
    lines.push('');

    res.type('text/plain').send(lines.join('\n'));
  } catch (err) {
    next(err);
  }
});

app.post('/api/settings/generate-hotspot-password', async (req, res, next) => {
  try {
    const password = generateHotspotPassword(12);
    const settings = await updateSettings({ defaultHotspotPassword: password });
    res.json({ password, settings: maskSettingsForClient(settings) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/diagnostics/panic', async (req, res, next) => {
  try {
    const settings = await getSettings();
    await runFullRuntimeCleanup({ hotspotController, deviceController, settings });
    logAudit('panic_stop_all');
    res.json({ success: true, message: 'All cuts, lags, hotspot controls, and WinDivert stopped' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/settings', async (req, res, next) => {
  try {
    res.json(maskSettingsForClient(await getSettings()));
  } catch (err) {
    next(err);
  }
});

app.patch('/api/settings', async (req, res, next) => {
  try {
    res.json(maskSettingsForClient(await updateSettings(req.body)));
  } catch (err) {
    next(err);
  }
});

app.get('/api/settings/export', async (req, res, next) => {
  try {
    res.json(await exportAppData());
  } catch (err) {
    next(err);
  }
});

app.post('/api/settings/import', async (req, res, next) => {
  try {
    const result = await importAppData(req.body);
    logAudit('settings_import');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/alerts', async (req, res, next) => {
  try {
    res.json({
      bandwidth: getLastAlerts(),
      mitm: [...getMitmIssues(), ...getGatewayDriftAlerts()]
    });
  } catch (err) {
    next(err);
  }
});

app.get('/api/devices/firewall-kills', (req, res) => {
  res.json({ active: firewallKill.getActive() });
});

app.post('/api/devices/:mac/firewall-kill', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    if (!device) throw new ValidationError('Device not found', 'mac');
    const result = await firewallKill.start(mac, device.ip_address);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/firewall-kill-stop', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const device = await deviceStore.getByMac(mac);
    const result = await firewallKill.stop(mac, device?.ip_address);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post('/api/devices/:mac/wake', async (req, res, next) => {
  try {
    const mac = validateMAC(req.params.mac);
    const result = await sendWakeOnLan(mac, {
      ipAddress: req.body.broadcastIp || '255.255.255.255',
      port: req.body.port || 9
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.get('/api/mitm/health', (req, res) => {
  res.json({ issues: getMitmIssues() });
});

const websiteDir = path.join(__dirname, '..', 'website');
app.get('/remote', (req, res) => {
  res.sendFile(path.join(websiteDir, 'remote.html'));
});
app.use('/website', express.static(websiteDir));

if (isProduction) {
  const distPath = getDistDir();
  logger.info(`Serving UI from ${distPath}`);
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (req, res, next) => {
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

async function bootstrap() {
  await bandwidthMonitor.prime();
  const devices = await deviceStore.getAll();
  deviceController.syncBlockedFromStore(devices);

  try {
    await ensureFlowTrackerRunning();
  } catch (error) {
    logger.warn(`Flow tracker not started: ${error.message}`);
  }

  ruleScheduler.start();
  startMitmMonitor();
  startGatewayDriftMonitor();

  bandwidthHistoryTimer = setInterval(async () => {
    try {
      const total = await bandwidthMonitor.getTotalBandwidth();
      if (total.priming) return;
      const devices = await deviceStore.getAll();
      const arpMaps = await getArpMaps();
      const perDevice = buildPerDeviceBandwidth(devices, arpMaps);
      await appendBandwidthSample({
        upload: total.upload,
        download: total.download,
        perDevice
      });
      await evaluateBandwidthAlerts(perDevice);
      await evaluateAutomationRules(perDevice);
    } catch {
      // ignore background sample errors
    }
  }, 5 * 60 * 1000);

  const blocked = devices.filter((d) => d.status === 'blocked');
  if (blocked.length > 0) {
    logger.info(`Restoring ${blocked.length} blocked device(s) from saved state`);
    await arpSpoofer.restorePersistedCuts(blocked);
  }
}

let activeServer = null;
let shuttingDown = false;

export async function startServer(port = PORT) {
  if (activeServer) {
    return { server: activeServer, port, shutdown };
  }

  await bootstrap();
  const host = await resolveListenHost();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      activeServer = server;
      logger.info(`Skys WiFi Cutter server running on http://${host}:${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      if (host === '127.0.0.1') {
        logger.info('API bound to localhost only (enable Remote Control for LAN access)');
      } else {
        logger.warn('API listening on all interfaces — remote control is enabled');
      }
      logger.info('Run as Administrator for device cut/block features');
      resolve({ server, port, host, shutdown });
    });

    server.on('error', reject);
  });
}

export async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutting down...');
  if (bandwidthHistoryTimer) {
    clearInterval(bandwidthHistoryTimer);
    bandwidthHistoryTimer = null;
  }
  ruleScheduler.stop();
  stopMitmMonitor();

  await runFullRuntimeCleanup({
    hotspotController,
    deviceController,
    settings: await getSettings().catch(() => ({}))
  });

  flowTracker.stop();
  deviceMeter.stopAll();

  await new Promise((resolve) => {
    if (!activeServer) {
      resolve();
      return;
    }
    activeServer.close(() => {
      activeServer = null;
      resolve();
    });
  });

  if (!process.env.ELECTRON_APP) {
    process.exit(0);
  }
}

const __filename = fileURLToPath(import.meta.url);
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  startServer(PORT).catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
