import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function getNativeEnginePath() {
  if (process.env.NATIVE_METER && fs.existsSync(process.env.NATIVE_METER)) {
    return process.env.NATIVE_METER;
  }

  if (process.env.NATIVE_ENGINE && fs.existsSync(process.env.NATIVE_ENGINE)) {
    return process.env.NATIVE_ENGINE;
  }

  const resourcesPath = process.env.RESOURCES_PATH;
  if (resourcesPath) {
    const candidate = path.join(resourcesPath, 'native', 'SkysNativeMeter.exe');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const devCandidate = path.join(process.cwd(), 'runtime', 'native', 'SkysNativeMeter.exe');
  if (fs.existsSync(devCandidate)) {
    return devCandidate;
  }

  return null;
}

export const getNativeMeterPath = getNativeEnginePath;

export async function checkNativeEngine() {
  if (process.platform !== 'win32') {
    return false;
  }

  const enginePath = getNativeEnginePath();
  if (!enginePath) {
    return false;
  }

  try {
    await execAsync(`"${enginePath}" help`, { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return fs.existsSync(enginePath);
  }
}

export const checkNativeMeter = checkNativeEngine;

export function quoteExecutable(command) {
  if (!command) return '';
  return command.includes(' ') || command.includes('\\') ? `"${command}"` : command;
}

export async function runNativeRestore(ipAddress, macAddress, gatewayIp, iface, localIp) {
  const enginePath = getNativeEnginePath();
  if (!enginePath || !ipAddress || !gatewayIp) {
    return false;
  }

  try {
    await execAsync(
      `"${enginePath}" restore ${ipAddress} ${macAddress} ${gatewayIp} "${iface || ''}" ${localIp || ''}`,
      { windowsHide: true, timeout: 10000 }
    );
    return true;
  } catch {
    return false;
  }
}

export async function runNativeKick(ipAddress, macAddress, gatewayIp, iface, localIp) {
  const enginePath = getNativeEnginePath();
  if (!enginePath) {
    throw new Error('Native engine required for kick');
  }

  await execAsync(
    `"${enginePath}" kick ${ipAddress} ${macAddress} ${gatewayIp} "${iface || ''}" ${localIp || ''}`,
    { windowsHide: true, timeout: 15000 }
  );
}
