import { getGroups } from '../storage/deviceGroupsStore.js';
import { getSettings, maskSettingsForClient } from '../storage/appSettingsStore.js';
import { getSchedules } from '../storage/scheduleStore.js';
import { deviceStore } from '../storage/deviceStore.js';
import { updateSettings } from '../storage/appSettingsStore.js';
import { saveSchedules } from '../storage/scheduleStore.js';
import fs from 'fs/promises';
import path from 'path';
import { getDataDir } from '../utils/paths.js';

export async function exportAppData() {
  const devices = await deviceStore.getAll();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: maskSettingsForClient(await getSettings()),
    groups: await getGroups(),
    schedules: await getSchedules(),
    devices: devices.map((d) => ({
      mac_address: d.mac_address,
      name: d.name,
      custom_name: d.custom_name,
      notes: d.notes,
      is_favorite: d.is_favorite,
      device_type: d.device_type
    }))
  };
}

export async function importAppData(payload) {
  if (!payload || payload.version !== 1) {
    throw new Error('Invalid or unsupported backup format');
  }

  if (payload.settings) {
    await updateSettings(payload.settings);
  }

  if (Array.isArray(payload.groups)) {
    const file = path.join(getDataDir(), 'device-groups.json');
    await fs.mkdir(getDataDir(), { recursive: true });
    await fs.writeFile(file, JSON.stringify({ groups: payload.groups }, null, 2));
  }

  if (Array.isArray(payload.schedules)) {
    await saveSchedules(payload.schedules);
  }

  if (Array.isArray(payload.devices)) {
    for (const row of payload.devices) {
      if (row.mac_address && row.notes != null) {
        await deviceStore.updateNotes(row.mac_address, row.notes);
      }
      if (row.mac_address && row.name) {
        await deviceStore.rename(row.mac_address, row.name);
      }
      if (row.mac_address && row.is_favorite) {
        await deviceStore.setFavorite(row.mac_address, true);
      }
    }
  }

  return { success: true, message: 'Settings imported successfully' };
}
