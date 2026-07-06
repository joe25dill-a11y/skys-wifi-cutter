import { deviceController } from './deviceController.js';
import { deviceStore } from '../storage/deviceStore.js';
import { lagController } from './lagController.js';
import { hotspotController } from './hotspotController.js';
import { dnsHijack } from './dnsHijack.js';
import { networkScanner } from './networkScanner.js';
import { runFullRuntimeCleanup } from '../utils/runtimeCleanup.js';
import { getSettings } from '../storage/appSettingsStore.js';
import { logAudit } from '../storage/auditLogStore.js';
import { getGroups } from '../storage/deviceGroupsStore.js';

export const SCENES = [
  {
    id: 'focus',
    label: 'Focus',
    description: 'Cut every other device — keep internet for your PC only',
    icon: 'target'
  },
  {
    id: 'peace',
    label: 'Peace',
    description: 'Restore all cuts, lags, DNS blocks, and unfreeze hotspot',
    icon: 'peace'
  },
  {
    id: 'homework',
    label: 'Homework',
    description: 'Block social/media DNS on selected devices (pick devices in panel)',
    icon: 'book'
  },
  {
    id: 'gaming_host',
    label: 'Gaming host',
    description: '150ms lag on all other online devices — you stay smooth',
    icon: 'gamepad'
  },
  {
    id: 'guest_cap',
    label: 'Guest cap',
    description: '512 kbps cap on hotspot clients (starts hotspot shaping if active)',
    icon: 'wifi'
  }
];

export function getScenes() {
  return SCENES;
}

export async function applyScene(sceneId, options = {}) {
  const scene = SCENES.find((s) => s.id === sceneId);
  if (!scene) {
    throw new Error(`Unknown scene: ${sceneId}`);
  }

  const settings = await getSettings();
  const devices = await deviceStore.getAll();
  let localMac = null;
  try {
    const info = await networkScanner.getLocalNetworkInfo();
    localMac = info.mac?.toUpperCase().replace(/-/g, ':');
  } catch {
    // ignore
  }

  switch (sceneId) {
    case 'focus': {
      const result = await deviceController.cutAll(devices, localMac);
      logAudit('scene_focus', { detail: { count: result.count } });
      return { ...result, scene: sceneId, devices: await deviceStore.getAll() };
    }
    case 'peace': {
      await runFullRuntimeCleanup({
        hotspotController,
        deviceController,
        settings
      });
      logAudit('scene_peace');
      return {
        success: true,
        message: 'Peace mode — all cuts, lags, and blocks cleared',
        scene: sceneId,
        devices: await deviceStore.getAll()
      };
    }
    case 'homework': {
      const macs = await resolveTargetMacs(options, devices);
      if (macs.length === 0) {
        throw new Error('Select at least one device for Homework mode');
      }
      let applied = 0;
      for (const mac of macs) {
        const device = devices.find((d) => d.mac_address.toUpperCase() === mac.toUpperCase());
        if (!device?.ip_address) continue;
        try {
          await dnsHijack.start(mac, device.ip_address, { preset: 'social' });
          applied += 1;
        } catch {
          // continue
        }
      }
      logAudit('scene_homework', { detail: { macs, applied } });
      return {
        success: true,
        message: `Homework mode — social DNS blocked on ${applied} device(s)`,
        scene: sceneId,
        count: applied
      };
    }
    case 'gaming_host': {
      const lagMs = Number(options.lagMs) || settings.gamingModeLagMs || 150;
      let applied = 0;
      for (const device of devices) {
        const mac = device.mac_address.toUpperCase().replace(/-/g, ':');
        if (mac === localMac || !device.ip_address) continue;
        try {
          await lagController.applyLag(mac, device.ip_address, lagMs, lagMs);
          applied += 1;
        } catch {
          // continue
        }
      }
      logAudit('scene_gaming_host', { detail: { lagMs, applied } });
      return {
        success: true,
        message: `Gaming host — ${lagMs}ms lag on ${applied} other device(s)`,
        scene: sceneId,
        count: applied
      };
    }
    case 'guest_cap': {
      const hs = await hotspotController.getStatus();
      if (!hs.isActive) {
        throw new Error('Start Windows Mobile Hotspot first, then apply Guest cap');
      }
      await hotspotController.setBandwidthCap(512, 512, null);
      logAudit('scene_guest_cap', { detail: { kbps: 512 } });
      return {
        success: true,
        message: 'Guest cap — hotspot clients limited to 512 kbps',
        scene: sceneId
      };
    }
    default:
      throw new Error(`Scene not implemented: ${sceneId}`);
  }
}

async function resolveTargetMacs(options, devices) {
  if (Array.isArray(options.macs) && options.macs.length > 0) {
    return options.macs;
  }
  if (options.groupId) {
    const groups = await getGroups();
    const group = groups.find((g) => g.id === options.groupId);
    if (group?.macs?.length) return group.macs;
  }
  return devices.slice(0, 5).map((d) => d.mac_address);
}
