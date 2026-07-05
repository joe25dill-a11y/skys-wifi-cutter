import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import logger from './logger.js';
import { firewallKill } from '../services/firewallKill.js';
import { networkDefense } from '../services/networkDefense.js';
import { windivertHotspot } from '../services/windivertHotspot.js';

const execAsync = promisify(exec);

function installRoots() {
  const roots = new Set();
  for (const value of [
    process.env.RESOURCES_PATH,
    process.env.BUNDLED_PYTHON,
    process.env.NATIVE_METER,
    process.env.NATIVE_ENGINE
  ]) {
    if (!value) continue;
    roots.add(path.dirname(value));
    roots.add(path.dirname(path.dirname(value)));
  }
  return [...roots].filter(Boolean);
}

export async function removeHotspotFirewallRules() {
  if (process.platform !== 'win32') return;
  for (const name of ['FREEZE_HOTSPOT_OUT', 'FREEZE_HOTSPOT_IN']) {
    try {
      await execAsync(`netsh advfirewall firewall delete rule name="${name}"`, { windowsHide: true });
    } catch {
      // rule may not exist
    }
  }
  try {
    const ps = `
      Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'FREEZE_HOTSPOT_*' } |
        ForEach-Object { Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue }
    `;
    await execAsync(`powershell -NoProfile -Command "${ps.replace(/\s+/g, ' ')}"`, {
      windowsHide: true,
      timeout: 15000
    });
  } catch {
    // ignore
  }
}

export async function removeSkysFirewallKillRules() {
  if (process.platform !== 'win32') return;
  try {
    const ps = `
      Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -like 'SKYS_KILL_*' } |
        ForEach-Object { Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue }
    `;
    await execAsync(`powershell -NoProfile -Command "${ps.replace(/\s+/g, ' ')}"`, {
      windowsHide: true,
      timeout: 15000
    });
  } catch {
    // fallback: active kills tracked in memory
    firewallKill.stopAll();
  }
}

export async function killBundledChildProcesses() {
  if (process.platform !== 'win32') return;

  const roots = installRoots();
  if (roots.length === 0) return;

  const rootPatterns = roots.map((r) => r.replace(/\\/g, '\\\\').replace(/'/g, "''"));
  const filter = rootPatterns.map((r) => `$_.ExecutablePath -like '${r}*'`).join(' -or ');

  const ps = `
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
      Where-Object {
        $_.ExecutablePath -and (
          ${filter}
        )
      } |
      ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      }
  `;

  try {
    await execAsync(`powershell -NoProfile -Command "${ps.replace(/\s+/g, ' ')}"`, {
      windowsHide: true,
      timeout: 20000
    });
  } catch (error) {
    logger.warn(`Bundled process cleanup: ${error.message}`);
  }
}

export async function runFullRuntimeCleanup({ hotspotController, deviceController, settings = {} }) {
  try {
    if (hotspotController?.forceCleanup) {
      await hotspotController.forceCleanup({ settings });
    }
  } catch (error) {
    logger.warn(`Hotspot cleanup: ${error.message}`);
  }

  try {
    await networkDefense.disable();
  } catch {
    // ignore
  }

  try {
    if (deviceController?.clearAllRules) {
      await deviceController.clearAllRules();
    }
  } catch (error) {
    logger.warn(`Rule cleanup: ${error.message}`);
  }

  await removeHotspotFirewallRules();
  await windivertHotspot.stopAll().catch(() => null);
  await removeSkysFirewallKillRules();
  await killBundledChildProcesses();
}
