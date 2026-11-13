import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { readFile } from 'node:fs/promises';
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
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/api/status`)).ok) return; } catch { /* wait for listen */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('server did not become ready');
}

test('GOAL live stream begins truthfully in idle state without exposing credentials', async (t) => {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), GOAL_API_KEY: '', API_FOOTBALL_API_KEY: '', RPL_FLASHSCORE_ENABLED: 'false', RPL_FLASHSCORE_AUTOSTART: 'false' },
    stdio: 'ignore'
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await waitForServer(child, baseUrl);

  const response = await fetch(`${baseUrl}/api/live-stream`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
  const reader = response.body.getReader();
  let text = '';
  while (!text.includes('event: state')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += new TextDecoder().decode(value);
  }
  const frame = text.match(/event: state\ndata: ([^\n]+)/);
  assert.ok(frame, 'server sends an initial state frame');
  const state = JSON.parse(frame[1]);
  assert.equal(state.provider, 'GOAL API');
  assert.equal(state.transport, 'WebSocket');
  assert.equal(state.state, 'idle');
  assert.equal(state.matchCount, 0);
  assert.equal(Object.hasOwn(state, 'apiKey'), false);
  await reader.cancel();
});

test('PWA accepts only known GOAL fixture updates and retains REST polling', async () => {
  const client = await readFile(path.join(projectRoot, 'goal-data.js'), 'utf8');
  const server = await readFile(serverScript, 'utf8');
  const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
  const worker = await readFile(path.join(projectRoot, 'service-worker.js'), 'utf8');
  assert.ok(client.includes("new EventSource('/api/live-stream')"));
  assert.ok(client.includes("update.provider !== 'GOAL API'"));
  assert.ok(client.includes('matches.find((entry) => String(entry.id) === String(update.fixtureId))'));
  assert.ok(server.includes("fixture.provider === 'Flashscore' && fixture.goalFixtureId === id"));
  assert.ok(server.includes('fixtureId: displayFixtureId'));
  assert.ok(client.includes('Number.isInteger(update.homeScore)') && client.includes('Number.isInteger(update.awayScore)'));
  assert.match(client, /setInterval\(\(\) => \{ if \(window\.isLiveData && document\.visibilityState === 'visible'\) refresh\(\{ quiet: true \}\).*5 \* 60 \* 1000\);/s);
  const clientUrl = html.match(/<script src="(\/goal-data\.js\?v=[^"]+)" defer>/)?.[1];
  assert.ok(clientUrl, 'index loads versioned client script');
  assert.ok(worker.includes(`'${clientUrl}'`), 'service worker precaches the same script version');
});
