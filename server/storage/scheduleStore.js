import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { getDataDir } from '../utils/paths.js';

const FILE = path.join(getDataDir(), 'schedules.json');

async function ensure() {
  await fs.mkdir(getDataDir(), { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, '[]', 'utf8');
  }
}

export async function getSchedules() {
  await ensure();
  return JSON.parse(await fs.readFile(FILE, 'utf8'));
}

export async function saveSchedules(schedules) {
  await ensure();
  await fs.writeFile(FILE, JSON.stringify(schedules, null, 2), 'utf8');
}

export async function addSchedule(rule) {
  const schedules = await getSchedules();
  const entry = {
    id: randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...rule
  };
  schedules.push(entry);
  await saveSchedules(schedules);
  return entry;
}

export async function updateSchedule(id, patch) {
  const schedules = await getSchedules();
  const index = schedules.findIndex((s) => s.id === id);
  if (index === -1) return null;
  schedules[index] = { ...schedules[index], ...patch, updatedAt: new Date().toISOString() };
  await saveSchedules(schedules);
  return schedules[index];
}

export async function deleteSchedule(id) {
  const schedules = (await getSchedules()).filter((s) => s.id !== id);
  await saveSchedules(schedules);
  return { success: true };
}
