import { dnsHijack } from './dnsHijack.js';
import { portBlocker } from './portBlocker.js';
import { oneWayKill } from './oneWayKill.js';
import { speedLimiter } from './speedLimiter.js';
import { lagSwitch } from './lagSwitch.js';
import { firewallKill } from './firewallKill.js';

const WATCHERS = [
  { name: 'dns', getActive: () => dnsHijack.getActiveBlocks(), isActive: (mac) => dnsHijack.isActive(mac) },
  { name: 'port', getActive: () => portBlocker.getActiveBlocks(), isActive: (mac) => portBlocker.isBlocking(mac) },
  { name: 'oneway', getActive: () => oneWayKill.getActiveMacs().map((mac) => ({ mac })), isActive: (mac) => oneWayKill.isActive(mac) },
  { name: 'speed', getActive: () => speedLimiter.getActiveLimits(), isActive: (mac) => speedLimiter.isLimited(mac) },
  { name: 'lag', getActive: () => lagSwitch.getActiveLags(), isActive: (mac) => lagSwitch.isActive(mac) },
  { name: 'firewall', getActive: () => firewallKill.getActive(), isActive: (mac) => firewallKill.isActive(mac) }
];

let timer = null;
let lastIssues = [];

export function startMitmMonitor() {
  if (timer) return;
  timer = setInterval(() => {
    const issues = [];
    for (const watcher of WATCHERS) {
      for (const entry of watcher.getActive()) {
        const mac = entry.mac;
        if (!mac) continue;
        const processAlive = entry.process && !entry.process.killed && entry.process.exitCode == null;
        if (entry.process && !processAlive) {
          issues.push({ type: watcher.name, mac, message: `${watcher.name} stopped unexpectedly for ${mac}` });
        }
      }
    }
    lastIssues = issues;
  }, 5000);
}

export function getMitmIssues() {
  return lastIssues;
}

export function stopMitmMonitor() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
