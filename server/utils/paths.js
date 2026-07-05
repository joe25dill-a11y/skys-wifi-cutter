import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

export function getScriptsDir() {
  return process.env.SCRIPTS_ROOT || path.join(PROJECT_ROOT, 'scripts');
}

export function getDataDir() {
  return process.env.DATA_ROOT || path.join(PROJECT_ROOT, 'data');
}

export function getLogsDir() {
  return process.env.LOGS_ROOT || path.join(PROJECT_ROOT, 'logs');
}

export function getDistDir() {
  return process.env.DIST_ROOT || path.join(PROJECT_ROOT, 'dist');
}
