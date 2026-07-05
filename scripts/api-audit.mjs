import { startServer, shutdown } from '../server/index.js';

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

async function main() {
  console.log('API audit\n');
  const { port } = await startServer(3098);
  const base = `http://127.0.0.1:${port}/api`;

  const get = async (path) => {
    const r = await fetch(`${base}${path}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${path} → ${r.status} ${body.error || ''}`);
    return body;
  };

  const post = async (path, data = {}) => {
    const r = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
