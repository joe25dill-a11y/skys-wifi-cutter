import fs from 'fs/promises';
import path from 'path';
import { getDataDir } from '../utils/paths.js';

const FILE = path.join(getDataDir(), 'automation-rules.json');

const DEFAULTS = { rules: [] };

async function ensure() {
  await fs.mkdir(getDataDir(), { recursive: true });
  try {
    await fs.access(FILE);
  } catch {
    await fs.writeFile(FILE, JSON.stringify(DEFAULTS, null, 2));
  }
}

export async function getRules() {
  await ensure();
  const raw = JSON.parse(await fs.readFile(FILE, 'utf8'));
  return { ...DEFAULTS, ...raw };
}

export async function saveRules(rules) {
  const payload = { rules, updatedAt: new Date().toISOString() };
  await fs.writeFile(FILE, JSON.stringify(payload, null, 2));
  return payload;
}

export async function addRule(rule) {
  const { rules } = await getRules();
  const id = rule.id || `rule_${Date.now()}`;
  const next = [...rules, { ...rule, id, enabled: rule.enabled !== false }];
  await saveRules(next);
  return next;
}

export async function updateRule(id, patch) {
  const { rules } = await getRules();
  const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
  await saveRules(next);
  return next;
}

export async function deleteRule(id) {
  const { rules } = await getRules();
  const next = rules.filter((r) => r.id !== id);
  await saveRules(next);
  return next;
}
