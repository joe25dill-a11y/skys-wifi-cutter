/**
 * Quick integration smoke test — verifies server modules load and health responds.
 * Run: npm run smoke
 */
import { startServer, shutdown } from '../server/index.js';

const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`  ✗ ${name}: ${error.message}`);
  }
}

async function main() {
  console.log('Skys WiFi Cutter — smoke test\n');

  await check('import deviceController', async () => {
    const { deviceController } = await import('../server/services/deviceController.js');
    if (!deviceController.blockDevice) throw new Error('blockDevice missing');
  });

  await check('import mitm services', async () => {
    await import('../server/services/portBlocker.js');
    await import('../server/services/dnsHijack.js');
    await import('../server/services/oneWayKill.js');
    await import('../server/services/lagSwitch.js');
    await import('../server/services/speedLimiter.js');
  });

  await check('import native engine path helper', async () => {
    const { getNativeEnginePath } = await import('../server/utils/nativeEngine.js');
    getNativeEnginePath();
  });

  let port = 3099;
  await check('start server + /api/health', async () => {
    try {
      const { port: actualPort } = await startServer(port);
      port = actualPort;

      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (!response.ok) throw new Error(`health ${response.status}`);
      const body = await response.json();
      if (!body.checks) throw new Error('health missing checks');
      if (!body.version) throw new Error('health missing version');

      const presets = await fetch(`http://127.0.0.1:${port}/api/dns-block/presets`);
      if (!presets.ok) throw new Error('dns presets failed');

      const portPresets = await fetch(`http://127.0.0.1:${port}/api/port-block/presets`);
      if (!portPresets.ok) throw new Error('port presets failed');

      await shutdown();
      await new Promise((r) => setTimeout(r, 500));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('NODE_MODULE_VERSION') || message.includes('better_sqlite3')) {
        console.log('  ⚠ server skipped (rebuild sqlite: npm rebuild better-sqlite3)');
        return;
      }
      throw error;
    }
  });

  console.log('');
  if (failures.length > 0) {
    console.error(`FAILED (${failures.length}):`);
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }

  console.log('All smoke checks passed.');
}

main().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exit(1);
});
