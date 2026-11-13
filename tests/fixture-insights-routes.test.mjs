import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverScript = path.join(projectRoot, 'server.mjs');

async function freePort() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(child, baseUrl) {
  const deadline = Date.now() + 5000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/status`);
      if (response.ok) return;
      lastError = new Error(`health returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw lastError || new Error('server did not become ready');
}

test('event and statistics endpoints reject fixture IDs not previously loaded into the RPL allowlist', async (t) => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), GOAL_API_KEY: 'test-placeholder-only', API_FOOTBALL_API_KEY: '', RPL_FLASHSCORE_ENABLED: 'false', RPL_FLASHSCORE_AUTOSTART: 'false' },
    stdio: 'ignore'
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await waitForServer(child, baseUrl);

  for (const resource of ['events', 'statistics']) {
    const response = await fetch(`${baseUrl}/api/fixtures/not-loaded-rpl-fixture/${resource}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Unknown RPL fixture' });
  }
});
