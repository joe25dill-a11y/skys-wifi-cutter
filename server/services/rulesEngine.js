import { getRules } from '../storage/rulesStore.js';
import { deviceController } from './deviceController.js';
import { lagController } from './lagController.js';
import { logAudit } from '../storage/auditLogStore.js';
import logger from '../utils/logger.js';

const cooldownMs = 60_000;
const lastFired = new Map();

/**
 * Evaluate automation rules against per-device bandwidth samples.
 * Rule shape: { id, enabled, mac, condition: 'above_mbps'|'below_mbps', thresholdMbps, action: 'cut'|'lag'|'uncut', lagMs? }
 */
export async function evaluateAutomationRules(perDevice = []) {
  const { rules } = await getRules();
  const active = rules.filter((r) => r.enabled && r.mac && r.condition && r.action);
  if (active.length === 0) return [];

  const fired = [];

  for (const rule of active) {
    const sample = perDevice.find(
      (d) => String(d.mac || '').toUpperCase() === String(rule.mac).toUpperCase()
    );
    if (!sample) continue;

    const mbps = Math.max(sample.upload ?? 0, sample.download ?? 0);
    let match = false;
    if (rule.condition === 'above_mbps' && mbps >= Number(rule.thresholdMbps)) match = true;
    if (rule.condition === 'below_mbps' && mbps <= Number(rule.thresholdMbps)) match = true;
    if (!match) continue;

    const key = `${rule.id}:${rule.action}`;
    const last = lastFired.get(key) || 0;
    if (Date.now() - last < cooldownMs) continue;

    try {
      const mac = rule.mac;
      const ip = sample.ip || sample.ip_address;
      if (!ip) continue;

      if (rule.action === 'cut') {
        await deviceController.blockDevice(mac, ip);
        logAudit('rule_cut', { mac, detail: { ruleId: rule.id, mbps } });
      } else if (rule.action === 'uncut') {
        await deviceController.unblockDevice(mac, ip);
        logAudit('rule_uncut', { mac, detail: { ruleId: rule.id, mbps } });
      } else if (rule.action === 'lag') {
        const lagMs = Number(rule.lagMs) || 150;
        await lagController.applyLag(mac, ip, lagMs, lagMs);
        logAudit('rule_lag', { mac, detail: { ruleId: rule.id, lagMs, mbps } });
      }
      lastFired.set(key, Date.now());
      fired.push({ ruleId: rule.id, action: rule.action, mac: rule.mac, mbps });
    } catch (error) {
      logger.warn(`Rule ${rule.id} failed: ${error.message}`);
    }
  }

  return fired;
}
