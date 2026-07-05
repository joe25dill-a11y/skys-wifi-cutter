import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
).version;

const UPDATE_CHECK_URL =
  process.env.UPDATE_CHECK_URL ||
  'https://api.github.com/repos/joe25dill-a11y/skys-wifi-cutter/releases/latest';

export async function checkForUpdates() {
  const currentVersion = APP_VERSION;

  if (!UPDATE_CHECK_URL) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      note: 'You have the latest installed build'
    };
  }

  try {
    const response = await fetch(UPDATE_CHECK_URL, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Skys-WiFi-Cutter' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return {
        currentVersion,
        updateAvailable: false,
        checkedAt: new Date().toISOString(),
        note: 'Update check unavailable'
      };
    }

    const release = await response.json();
    const latestVersion = String(release.tag_name || release.name || '')
      .replace(/^v/i, '')
      .trim();
    const updateAvailable = Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0);

    return {
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      updateAvailable,
      releaseUrl: release.html_url || null,
      releaseNotes: release.body?.slice(0, 500) || null,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      currentVersion,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      note: error.message
    };
  }
}

function compareVersions(a, b) {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
