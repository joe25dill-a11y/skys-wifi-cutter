import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDataDir } from '../utils/paths.js';
import { normalizeMac } from '../services/arpTable.js';

const FILE = path.join(getDataDir(), 'device-groups.json');

async function ensure() {
  await fs.mkdir(getDataDir(), { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(
      FILE,
      JSON.stringify({ groups: [{ id: 'favorites', name: 'Favorites', macs: [], builtin: true }] }, null, 2)
    );
  }
}

export async function getGroups() {
  await ensure();
  const data = JSON.parse(await fs.readFile(FILE, 'utf8'));
  return data.groups || [];
}

async function saveGroups(groups) {
  await ensure();
  await fs.writeFile(FILE, JSON.stringify({ groups }, null, 2));
}

export async function createGroup(name) {
  const groups = await getGroups();
  const group = { id: randomUUID(), name: name.slice(0, 40), macs: [] };
  groups.push(group);
  await saveGroups(groups);
  return group;
}

export async function updateGroup(id, patch) {
  const groups = await getGroups();
  const index = groups.findIndex((g) => g.id === id);
  if (index === -1) return null;
  if (patch.name) groups[index].name = String(patch.name).slice(0, 40);
  if (Array.isArray(patch.macs)) {
    groups[index].macs = [...new Set(patch.macs.map(normalizeMac))];
  }
  await saveGroups(groups);
  return groups[index];
}

export async function deleteGroup(id) {
  const groups = (await getGroups()).filter((g) => g.id !== id || g.builtin);
  await saveGroups(groups);
  return { success: true };
}

export async function addMacToGroup(groupId, mac) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  const normalized = normalizeMac(mac);
  if (!group.macs.includes(normalized)) {
    group.macs.push(normalized);
  }
  await saveGroups(groups);
  return group;
}

export async function removeMacFromGroup(groupId, mac) {
  const groups = await getGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) return null;
  group.macs = group.macs.filter((m) => m !== normalizeMac(mac));
  await saveGroups(groups);
  return group;
}
