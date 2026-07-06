import logger from '../utils/logger.js';
import { getSchedules } from '../storage/scheduleStore.js';
import { getGroups } from '../storage/deviceGroupsStore.js';
import { deviceStore } from '../storage/deviceStore.js';
import { deviceController } from './deviceController.js';
import { lagController } from './lagController.js';
import { dnsHijack } from './dnsHijack.js';
import { portBlocker } from './portBlocker.js';
import { firewallKill } from './firewallKill.js';
import { logAudit } from '../storage/auditLogStore.js';
import { normalizeMac } from './arpTable.js';

export class RuleScheduler {
  constructor() {
    this.timer = null;
    this.lastFired = new Map();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick().catch((e) => logger.warn(e.message)), 60_000);
    logger.info('Schedule engine started');
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  shouldRunNow(rule) {
    if (!rule.enabled) return false;
    const now = new Date();
    const day = now.getDay();
    const days = rule.days ?? [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(day)) return false;

    const [h, m] = String(rule.time || '00:00').split(':').map(Number);
    if (now.getHours() !== h || now.getMinutes() !== m) return false;

    const key = `${rule.id}-${now.toDateString()}-${h}:${m}`;
    if (this.lastFired.get(rule.id) === key) return false;
    this.lastFired.set(rule.id, key);
    return true;
  }

  async tick() {
    const rules = await getSchedules();
    const devices = await deviceStore.getAll();
    const groups = await getGroups();

    for (const rule of rules) {
      if (!this.shouldRunNow(rule)) continue;

      try {
        if (rule.action === 'group_cut' || rule.action === 'group_restore') {
          const group = groups.find((g) => g.id === rule.groupId);
          if (!group) continue;
          let count = 0;
          for (const mac of group.macs) {
            const device = devices.find((d) => normalizeMac(d.mac_address) === normalizeMac(mac));
            if (!device) continue;
            if (rule.action === 'group_cut') {
              await deviceController.blockDevice(device.mac_address, device.ip_address);
              await deviceStore.updateStatus(device.mac_address, 'blocked');
            } else {
              await deviceController.unblockDevice(device.mac_address, device.ip_address);
              await deviceStore.updateStatus(device.mac_address, 'allowed');
            }
            count += 1;
          }
          logAudit(rule.action === 'group_cut' ? 'schedule_group_cut' : 'schedule_group_restore', {
            detail: { groupId: group.id, count }
          });
          logger.info(`Schedule ${rule.action} ${group.name} (${count})`);
          continue;
        }

        const device = devices.find((d) => d.mac_address === rule.mac);
        if (!device) continue;

        if (rule.action === 'cut') {
          await deviceController.blockDevice(device.mac_address, device.ip_address);
          await deviceStore.updateStatus(device.mac_address, 'blocked');
          logAudit('schedule_cut', { mac: device.mac_address, ip: device.ip_address });
          logger.info(`Schedule cut ${device.name}`);
        } else if (rule.action === 'restore') {
          await deviceController.unblockDevice(device.mac_address, device.ip_address);
          await deviceStore.updateStatus(device.mac_address, 'allowed');
          logAudit('schedule_restore', { mac: device.mac_address, ip: device.ip_address });
          logger.info(`Schedule restore ${device.name}`);
        } else if (rule.action === 'lag') {
          const lagMs = Number(rule.lagMs) || 150;
          await lagController.applyLag(device.mac_address, device.ip_address, lagMs, lagMs);
          logAudit('schedule_lag', {
            mac: device.mac_address,
            ip: device.ip_address,
            detail: { lagMs }
          });
          logger.info(`Schedule lag ${device.name} (${lagMs}ms)`);
        } else if (rule.action === 'limit' && rule.uploadKbps && rule.downloadKbps) {
          await deviceController.limitDeviceBandwidth(
            device.mac_address,
            device.ip_address,
            rule.uploadKbps,
            rule.downloadKbps
          );
          logAudit('schedule_limit', {
            mac: device.mac_address,
            ip: device.ip_address,
            detail: { uploadKbps: rule.uploadKbps, downloadKbps: rule.downloadKbps }
          });
          logger.info(`Schedule limit ${device.name}`);
        } else if (rule.action === 'dns_block') {
          await dnsHijack.start(device.mac_address, device.ip_address, {
            preset: rule.preset || 'full',
            domains: rule.domains
          });
          await deviceStore.setDnsBlocked(device.mac_address, true);
          logAudit('schedule_dns_block', { mac: device.mac_address, ip: device.ip_address, detail: { preset: rule.preset } });
          logger.info(`Schedule DNS block ${device.name}`);
        } else if (rule.action === 'port_block') {
          await portBlocker.start(device.mac_address, device.ip_address, {
            preset: rule.preset || 'gaming',
            ports: rule.ports
          });
          logAudit('schedule_port_block', { mac: device.mac_address, ip: device.ip_address, detail: { preset: rule.preset } });
          logger.info(`Schedule port block ${device.name}`);
        } else if (rule.action === 'firewall_kill') {
          await firewallKill.start(device.mac_address, device.ip_address);
          logAudit('schedule_firewall_kill', { mac: device.mac_address, ip: device.ip_address });
          logger.info(`Schedule firewall kill ${device.name}`);
        }
      } catch (error) {
        logger.warn(`Schedule ${rule.id} failed: ${error.message}`);
      }
    }
  }
}

export const ruleScheduler = new RuleScheduler();
