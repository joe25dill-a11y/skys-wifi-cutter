import { startServer, shutdown } from '../server/index.js';
import { resetRemoteAuthForTests } from '../server/middleware/remoteAuth.js';

const failures = [];
const warnings = [];

async function hit(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

async function expectStatus(url, options, expectedStatus) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => ({}));
  if (r.status !== expectedStatus) {
    throw new Error(`expected ${expectedStatus}, got ${r.status} ${body.error || ''}`);
  }
  return body;
}

async function main() {
  console.log('API audit\n');
  const { port } = await startServer(3098);
  const base = `http://127.0.0.1:${port}/api`;

  const get = async (path, headers = {}) => {
    const r = await fetch(`${base}${path}`, { headers });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} → ${r.status} ${body.error || ''}`);
    return body;
  };

  const post = async (path, data = {}, headers = {}) => {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data)
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} → ${r.status} ${body.error || body.message || ''}`);
    return body;
  };

  const patch = async (path, data) => {
    const r = await fetch(`${base}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} → ${r.status} ${body.error || ''}`);
    return body;
  };

  await hit('GET /health', () => get('/health'));
  await hit('GET /devices', () => get('/devices'));
  await hit('GET /bandwidth', () => get('/bandwidth'));
  await hit('GET /settings', () => get('/settings'));
  await hit('GET /diagnostics', () => get('/diagnostics'));
  await hit('GET /diagnostics/cut-troubleshoot', () => get('/diagnostics/cut-troubleshoot'));
  await hit('GET /hotspot/status', () => get('/hotspot/status'));
  await hit('GET /hotspot/capability', () => get('/hotspot/capability'));
  await hit('GET /alerts', () => get('/alerts'));
  await hit('GET /audit', () => get('/audit'));
  await hit('GET /rules', () => get('/rules'));
  await hit('GET /groups', () => get('/groups'));
  await hit('GET /game-presets', () => get('/game-presets'));
  await hit('GET /dns-block/presets', () => get('/dns-block/presets'));
  await hit('GET /port-block/presets', () => get('/port-block/presets'));
  await hit('GET /defense/status', () => get('/defense/status'));
  await hit('GET /app/update-check', () => get('/app/update-check'));

  await hit('PATCH /settings', async () => {
    const s = await patch('/settings', { powerSaverMode: false, compactDeviceList: false });
    if (s.powerSaverMode !== false) throw new Error('settings patch not applied');
    if ('remotePinHash' in s || 'remotePin' in s) throw new Error('settings must not expose PIN hash');
    if (typeof s.remotePinSet !== 'boolean') throw new Error('remotePinSet missing');
  });

  await hit('POST /hotspot/targets', () => post('/hotspot/targets', { targetMacs: [] }));

  await hit('GET /network', async () => {
    try {
      await get('/network');
    } catch (e) {
      if (e.message.includes('No active network')) {
        warnings.push('network info unavailable in sandbox');
        return;
      }
      throw e;
    }
  });

  await hit('Remote: enable + hash PIN', async () => {
    await patch('/settings', { remoteControlEnabled: true, remotePin: '9876' });
    const s = await get('/settings');
    if (!s.remotePinSet) throw new Error('remotePinSet should be true after setting PIN');
  });

  await hit('GET /remote/status without PIN → 401', async () => {
    await expectStatus(`${base}/remote/status`, {}, 401);
  });

  await hit('GET /remote/status wrong PIN → 401', async () => {
    await expectStatus(`${base}/remote/status`, { headers: { 'X-Remote-Pin': '0000' } }, 401);
  });

  await hit('GET /remote/status valid PIN → 200', async () => {
    await get('/remote/status', { 'X-Remote-Pin': '9876' });
  });

  await hit('GET /remote/devices valid PIN → 200', async () => {
    const data = await get('/remote/devices', { 'X-Remote-Pin': '9876' });
    if (!Array.isArray(data.devices)) throw new Error('devices array missing');
  });

  await hit('Remote: rate limit after failed PINs', async () => {
    resetRemoteAuthForTests();
    for (let i = 0; i < 5; i += 1) {
      await expectStatus(`${base}/remote/status`, { headers: { 'X-Remote-Pin': 'bad' } }, 401);
    }
    await expectStatus(`${base}/remote/status`, { headers: { 'X-Remote-Pin': 'bad' } }, 429);
    resetRemoteAuthForTests();
  });

  await hit('Remote: disable after tests', async () => {
    await patch('/settings', { remoteControlEnabled: false });
  });

  await shutdown();
  console.log('');
  if (warnings.length) warnings.forEach((w) => console.log(`  ⚠ ${w}`));
  if (failures.length) {
    console.error(`FAILED (${failures.length})`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log('All API audit checks passed.');
}

main().catch(async (e) => {
  console.error(e);
  await shutdown();
  process.exit(1);
});
