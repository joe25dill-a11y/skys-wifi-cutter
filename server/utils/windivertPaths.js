import fs from 'fs';
import path from 'path';

export function getWinDivertDir() {
  if (process.env.WINDIVERT_PATH && fs.existsSync(process.env.WINDIVERT_PATH)) {
    return process.env.WINDIVERT_PATH;
  }

  const roots = new Set();
  for (const value of [process.env.RESOURCES_PATH, process.env.NATIVE_METER, process.env.NATIVE_ENGINE]) {
    if (!value) continue;
    roots.add(path.dirname(value));
    roots.add(path.join(path.dirname(value), 'windivert'));
  }

  roots.add(path.join(process.cwd(), 'runtime', 'windivert'));
  roots.add(path.join(process.cwd(), 'runtime', 'native'));

  for (const dir of roots) {
    const dll = path.join(dir, 'WinDivert.dll');
    const sys = path.join(dir, 'WinDivert64.sys');
    if (fs.existsSync(dll) && fs.existsSync(sys)) {
      return dir;
    }
  }

  return null;
}

export function getWinDivertEnv() {
  const dir = getWinDivertDir();
  return dir ? { WINDIVERT_PATH: dir } : {};
}
