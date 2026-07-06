import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_VERSION = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
).version;

const GITHUB_REPO = 'joe25dill-a11y/skys-wifi-cutter';
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'Skys-WiFi-Cutter'
};
const UPDATE_CHECK_URL =
  process.env.UPDATE_CHECK_URL ||
  `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

function findInstallerAsset(assets) {
  if (!Array.isArray(assets)) return null;
  return (
    assets.find((a) => a.name?.endsWith('.exe') && /setup/i.test(a.name)) ||
    assets.find((a) => a.name?.endsWith('.exe')) ||
    null
  );
}

function parseReleaseVersion(release) {
  return String(release?.tag_name || release?.name || '')
    .replace(/^v/i, '')
    .trim();
}

function releaseFromPayload(release, currentVersion) {
  const latestVersion = parseReleaseVersion(release);
  const updateAvailable = Boolean(
    latestVersion && compareVersions(latestVersion, currentVersion) > 0
  );
  const installer = findInstallerAsset(release.assets);
  const downloadUrl = installer?.browser_download_url || null;

  return {
    currentVersion,
    latestVersion: latestVersion || currentVersion,
    updateAvailable,
    releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
    downloadUrl,
    releaseNotes: release.body?.slice(0, 500) || null,
    checkedAt: new Date().toISOString()
  };
}

async function fetchLatestRelease(currentVersion) {
  const response = await fetch(UPDATE_CHECK_URL, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(8000)
  });

  if (response.ok) {
    const release = await response.json();
    if (!release.draft && !release.prerelease) {
      return releaseFromPayload(release, currentVersion);
    }
  }

  const listResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
    {
      headers: GITHUB_HEADERS,
      signal: AbortSignal.timeout(8000)
    }
  );

  if (!listResponse.ok) {
    return {
      currentVersion,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      note: 'Update check unavailable'
    };
  }

  const releases = await listResponse.json();
  const newest = releases.find((r) => !r.draft && !r.prerelease);
  if (!newest) {
    return {
      currentVersion,
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      note: 'No published releases found'
    };
  }

  return releaseFromPayload(newest, currentVersion);
}

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
    return await fetchLatestRelease(currentVersion);
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
