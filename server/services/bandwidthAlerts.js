import { getSettings, updateSettings } from '../storage/appSettingsStore.js';

let lastAlerts = [];

export async function evaluateBandwidthAlerts(devicesBandwidth = []) {
  const settings = await getSettings();
  if (!settings.bandwidthAlertsEnabled) {
    lastAlerts = [];
    return [];
  }

  const threshold = Number(settings.bandwidthAlertMbps) || 50;
  const alerts = [];

  for (const device of devicesBandwidth) {
    const maxMbps = Math.max(device.upload || 0, device.download || 0);
    if (maxMbps >= threshold) {
      alerts.push({
        type: 'bandwidth',
        mac: device.mac,
        name: device.name,
        mbps: maxMbps,
        message: `${device.name || device.mac} using ${maxMbps.toFixed(1)} Mbps (threshold ${threshold})`
      });
    }
  }

  if (alerts.length > 0) {
    await updateSettings({ lastAlertAt: new Date().toISOString() });
  }

  lastAlerts = alerts;
  return alerts;
}

export function getLastAlerts() {
  return lastAlerts;
}
