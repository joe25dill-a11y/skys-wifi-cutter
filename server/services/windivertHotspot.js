import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import logger from '../utils/logger.js';
import { getNativeEnginePath } from '../utils/nativeEngine.js';
import { getWinDivertDir, getWinDivertEnv } from '../utils/windivertPaths.js';

const execAsync = promisify(exec);

class WinDivertHotspot {
  constructor() {
    this.blockProcess = null;
    this.lagProcess = null;
    this._available = null;
    this._availableAt = 0;
  }

  /** Fast file check — safe to call on every status poll. */
  hasBundle() {
    if (process.platform !== 'win32') return false;
    const dir = getWinDivertDir();
    const engine = getNativeEnginePath();
    return Boolean(dir && engine && fs.existsSync(engine));
  }

  /**
   * Heavy driver probe — only for freeze/lag actions, not status polling.
   * Result is cached for 30 minutes.
   */
  async isAvailable(force = false) {
    if (process.platform !== 'win32') return false;

    if (!this.hasBundle()) {
      this._available = false;
      this._availableAt = Date.now();
      return false;
    }

    const now = Date.now();
    if (!force && this._available !== null && now - this._availableAt < 30 * 60_000) {
      return this._available;
    }

    const engine = getNativeEnginePath();
    try {
      const env = { ...process.env, ...getWinDivertEnv() };
      await execAsync(`"${engine}" hotspot-check`, {
        windowsHide: true,
        timeout: 8000,
        env
      });
      this._available = true;
    } catch {
      this._available = false;
    }

    this._availableAt = now;
    return this._available;
  }

  spawnArgs(command, args) {
    const engine = getNativeEnginePath();
    if (!engine) {
      throw new Error('Native engine not found');
    }

    const env = { ...process.env, ...getWinDivertEnv() };
    const child = spawn(engine, [command, ...args], {
      windowsHide: true,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    child.stdout?.on('data', (chunk) => {
      const line = String(chunk).trim();
      if (line) logger.info(`[WinDivert] ${line}`);
    });
    child.stderr?.on('data', (chunk) => {
      const line = String(chunk).trim();
      if (line) logger.warn(`[WinDivert] ${line}`);
    });

    child.on('error', (error) => {
      logger.warn(`WinDivert process error: ${error.message}`);
    });

    return child;
  }

  async startBlock(ips = []) {
    await this.stopBlock();
    const list = [...new Set(ips.filter(Boolean))];
    if (list.length === 0) {
      throw new Error('No client IPs for WinDivert block');
    }

    this.blockProcess = this.spawnArgs('hotspot-block', [list.join(',')]);
    return { engine: 'windivert', targets: list };
  }

  async stopBlock() {
    if (!this.blockProcess) return;
    try {
      this.blockProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    this.blockProcess = null;
  }

  async startLag(ips = [], delayMs = 150, dropPercent = 0) {
    await this.stopLag();
    const list = [...new Set(ips.filter(Boolean))];
    if (list.length === 0) {
      throw new Error('No client IPs for WinDivert lag');
    }

    const drop = Math.max(0, Math.min(95, Number(dropPercent) || 0));
    this.lagProcess = this.spawnArgs('hotspot-lag', [
      list.join(','),
      String(delayMs),
      String(drop)
    ]);
    return { engine: 'windivert', delayMs, dropPercent: drop, targets: list };
  }

  async stopLag() {
    if (!this.lagProcess) return;
    try {
      this.lagProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    this.lagProcess = null;
  }

  async runPulse(ips = [], freezeMs = 150, unfreezeMs = 100, count = 5) {
    const engine = getNativeEnginePath();
    const list = [...new Set(ips.filter(Boolean))];
    if (!engine || list.length === 0) {
      throw new Error('WinDivert pulse requires target IPs');
    }

    const env = { ...process.env, ...getWinDivertEnv() };
    await execAsync(
      `"${engine}" hotspot-pulse ${list.join(',')} ${freezeMs} ${unfreezeMs} ${count}`,
      { windowsHide: true, timeout: 120_000, env }
    );
    return { engine: 'windivert', count };
  }

  async stopAll() {
    await this.stopBlock();
    await this.stopLag();
  }

  getStatus() {
    return {
      bundled: this.hasBundle(),
      verified: this._available,
      blockActive: Boolean(this.blockProcess),
      lagActive: Boolean(this.lagProcess),
      path: getWinDivertDir()
    };
  }
}

export const windivertHotspot = new WinDivertHotspot();
