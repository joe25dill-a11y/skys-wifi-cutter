import fs from 'fs';
import path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function getBundledPythonPath() {
  if (process.env.BUNDLED_PYTHON && fs.existsSync(process.env.BUNDLED_PYTHON)) {
    return process.env.BUNDLED_PYTHON;
  }

  const resourcesPath = process.env.RESOURCES_PATH;
  if (resourcesPath) {
    const candidate = path.join(resourcesPath, 'python', 'python.exe');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function quoteExecutable(command) {
  if (!command) {
    return '';
  }
  return command.includes(' ') || command.includes('\\') ? `"${command}"` : command;
}

export async function resolvePython() {
  const bundled = getBundledPythonPath();
  if (bundled) {
    try {
      const { stdout } = await execAsync(`"${bundled}" --version`);
      return { command: bundled, version: stdout.trim(), bundled: true };
    } catch {
      // fall through to system python
    }
  }

  for (const cmd of ['py', 'python', 'python3']) {
    try {
      const { stdout } = await execAsync(`${cmd} --version`);
      return { command: cmd, version: stdout.trim(), bundled: false };
    } catch {
      // try next
    }
  }

  return null;
}

export async function checkScapy(pythonInfo) {
  if (!pythonInfo?.command) {
    return false;
  }

  try {
    await execAsync(`${quoteExecutable(pythonInfo.command)} -c "import scapy; print(scapy.__version__)"`);
    return true;
  } catch {
    return false;
  }
}

export async function checkWinrtHotspot(pythonInfo) {
  if (!pythonInfo?.command || process.platform !== 'win32') {
    return false;
  }

  try {
    await execAsync(
      `${quoteExecutable(pythonInfo.command)} -c "from winrt.windows.networking.networkoperators import NetworkOperatorTetheringManager"`
    );
    return true;
  } catch {
    return false;
  }
}

export function checkNpcapInstalled() {
  if (process.platform !== 'win32') {
    return true;
  }

  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const wpcapPaths = [
    path.join(systemRoot, 'System32', 'Npcap', 'wpcap.dll'),
    path.join(systemRoot, 'SysWOW64', 'Npcap', 'wpcap.dll'),
    path.join(systemRoot, 'System32', 'wpcap.dll'),
    path.join(systemRoot, 'SysWOW64', 'wpcap.dll')
  ];

  if (wpcapPaths.some((dll) => fs.existsSync(dll))) {
    return true;
  }

  const packetPaths = [
    path.join(systemRoot, 'System32', 'Packet.dll'),
    path.join(systemRoot, 'SysWOW64', 'Packet.dll')
  ];

  if (packetPaths.some((dll) => fs.existsSync(dll))) {
    return true;
  }

  for (const regKey of ['HKLM\\SOFTWARE\\Npcap', 'HKLM\\SOFTWARE\\WOW6432Node\\Npcap', 'HKLM\\SOFTWARE\\WinPcap']) {
    try {
      const output = execSync(`reg query "${regKey}"`, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      if (/Installed|Version/i.test(output)) {
        return true;
      }
    } catch {
      // try next key
    }
  }

  return false;
}

export async function ensureNpcapInstalled() {
  if (process.platform !== 'win32' || checkNpcapInstalled()) {
    return { ok: true, alreadyInstalled: true };
  }

  const resourcesPath = process.env.RESOURCES_PATH;
  if (!resourcesPath) {
    return { ok: false, reason: 'resources path missing' };
  }

  const installer = path.join(resourcesPath, 'npcap', 'npcap-installer.exe');
  if (!fs.existsSync(installer)) {
    return { ok: false, reason: 'npcap installer missing' };
  }

  try {
    await execAsync(
      `"${installer}" /S /winpcap_mode=yes /loopback_support=yes /admin_only=no`,
      { timeout: 120000 }
    );
  } catch (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: checkNpcapInstalled(), alreadyInstalled: false };
}
