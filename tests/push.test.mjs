import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { PushStore, PUSH_CONSENT, normalizePushFixture } from '../push-store.mjs';
import { createPushHandler } from '../push-http.mjs';
import { officialLineups, sendRuStore, pollPushFixtures } from '../push-worker.mjs';

const credentials = () => ({ id: randomUUID(), secret: randomBytes(32).toString('base64url') });
const input = { token: 'device-token-with-enough-characters', fixtureIds: ['match1'], teamIds: [], kinds: ['goal', 'start', 'finish', 'lineups'], consent: PUSH_CONSENT };
const now = 1800000000000;
const fixture = { id: 'match1', status: 'scheduled', homeScore: null, awayScore: null, kickoff: now + 3600_000, homeTeamId: 'home1', awayTeamId: 'away1', home: 'Зенит', away: 'Динамо' };
const config = { enabled: true, registration: true, project: 'test-project', serviceToken: 'secret' };

test('push credentials protect updates, reads, deletion and token ownership', () => {
  const store = new PushStore(':memory:'); const a = credentials(); const b = credentials();
  try {
    store.register(a.id, a.secret, input, now);
    assert.throws(() => store.register(a.id, b.secret, input, now), { status: 401 });
    assert.throws(() => store.preferences(a.id, b.secret), { status: 401 });
    assert.throws(() => store.remove(a.id, b.secret), { status: 401 });
    assert.throws(() => store.register(b.id, b.secret, input, now), { status: 409 });
    assert.throws(() => store.register(b.id, b.secret, { ...input, consent: false }, now), { status: 400 });
    assert.equal(store.preferences(a.id, a.secret).consent, PUSH_CONSENT);
    store.remove(a.id, a.secret); assert.equal(store.counts().devices, 0);
    assert.doesNotThrow(() => store.remove(a.id, a.secret)); // retry after a lost response
    assert.doesNotThrow(() => store.remove(b.id, b.secret)); // opt-out before registration completed
  } finally { store.close(); }
});

test('durable event baseline, transitions, score corrections, deduplication and outbox survive restart', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kromka-push-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const filename = path.join(dir, 'push.sqlite'); let store = new PushStore(filename); const a = credentials();
  store.register(a.id, a.secret, input, now);
  store.observe(fixture, { now }); assert.equal(store.counts().pending, 0);
  const live = { ...fixture, status: 'live', homeScore: 0, awayScore: 0 };
  store.observe(live, { now: now + 1000 });
  store.observe({ ...live, homeScore: 1 }, { now: now + 2000 });
  store.observe(live, { now: now + 3000 }); // VAR reverses the goal.
  store.observe({ ...live, homeScore: 1 }, { now: now + 4000 });
  assert.equal(store.counts().pending, 2);
  store.close(); store = new PushStore(filename);
  try {
    const first = store.claim(now + 5000); assert.equal(first.payload.kind, 'start');
    store.settle(first, 'sent', now + 5000);
    const goal = store.claim(now + 5000); assert.equal(goal.payload.kind, 'goal');
    assert.equal(store.claim(now + 5000), null);
    const recovered = store.claim(now + 66000); assert.equal(recovered.event_id, goal.event_id); // abandoned lease recovers.
    store.settle(goal, 'sent', now + 67000); // stale worker cannot settle the new lease.
    assert.equal(store.counts().pending, 1);
    store.settle(recovered, 'sent', now + 67000);
    store.observe({ ...live, status: 'finished', homeScore: 1 }, { now: now + 68000 });
    assert.equal(store.claim(now + 69000).payload.kind, 'finish');
    store.remove(a.id, a.secret); assert.equal(store.counts().pending, 0);
  } finally { store.close(); }
});

test('cold start, long outage, unknown scores and old pending messages never create stale goal alerts', () => {
  const store = new PushStore(':memory:'); const a = credentials();
  try {
    store.register(a.id, a.secret, input, now);
    const live = { ...fixture, status: 'live', homeScore: 2, awayScore: 1 };
    store.observe(live, { now });
    store.observe({ ...live, homeScore: 4 }, { now: now + 3600_000 });
    assert.equal(store.counts().pending, 0);
    store.observe({ ...live, homeScore: null }, { now: now + 3601_000 });
    store.observe({ ...live, homeScore: 5 }, { now: now + 3602_000 });
    assert.equal(store.counts().pending, 0);
    store.observe({ ...live, homeScore: 6 }, { now: now + 3603_000 });
    assert.equal(store.counts().pending, 1);
    assert.equal(store.claim(now + 5000_000), null);
    store.prune(now + 91 * 86400_000); assert.equal(store.counts().devices, 0);
  } finally { store.close(); }
});

test('official lineups only, subscription matching, heartbeat and changed preferences', () => {
  const store = new PushStore(':memory:'); const a = credentials();
  const starters = Array.from({ length: 11 }, (_, i) => ({ name: `Игрок ${i}` }));
  const payload = { data: { home: { startingLineups: starters }, away: { startingLineups: starters } } };
  try {
    assert.equal(officialLineups(payload), true);
    assert.equal(officialLineups({ ...payload, prediction: { home: {} } }), false);
    assert.equal(officialLineups({ data: { home: payload.data.home, away: {} } }), false);
    store.register(a.id, a.secret, { ...input, fixtureIds: [], teamIds: ['home1'] }, now);
    store.observe(fixture, { lineups: true, now });
    assert.equal(store.counts().pending, 1);
    store.observe(fixture, { lineups: true, now: now + 1000 });
    store.register(a.id, a.secret, { ...input, fixtureIds: [], teamIds: ['home1'] }, now + 2000);
    assert.equal(store.counts().pending, 1); // renewal does not discard unsent events.
    store.register(a.id, a.secret, { ...input, fixtureIds: [], teamIds: [] }, now + 3000);
    assert.equal(store.counts().pending, 0);
  } finally { store.close(); }
});

test('RuStore transport uses documented HTTPS body, retry policy and removes rejected device tokens', async () => {
  const store = new PushStore(':memory:'); const a = credentials();
  try {
    store.register(a.id, a.secret, input);
    const actualNow = Date.now(); store.observe({ ...fixture, kickoff: actualNow + 3600_000 }, { lineups: true, now: actualNow });
    const job = store.claim();
    assert.equal(await sendRuStore(job, config, async (url, options) => {
      assert.equal(url, 'https://vkpns.rustore.ru/v1/projects/test-project/messages:send');
      assert.equal(options.headers.Authorization, 'Bearer secret');
      const body = JSON.parse(options.body).message;
      assert.equal(body.token, input.token); assert.equal(body.notification, undefined);
      assert.equal(body.data.title, job.payload.title); assert.equal(body.data.body, job.payload.body);
      assert.equal(typeof body.data.eventId, 'string'); assert.match(body.android.ttl, /s$/);
      return new Response('{}', { status: 200 });
    }), 'sent');
    assert.equal(await sendRuStore(job, config, async () => new Response('{}', { status: 429 })), 'retry');
    assert.equal(await sendRuStore(job, config, async () => new Response('{}', { status: 403 })), 'credentials');
    const outcome = await sendRuStore(job, config, async () => new Response(JSON.stringify({ error: { status: 'NOT_FOUND' } }), { status: 404 }));
    store.settle(job, outcome); assert.equal(store.counts().devices, 0);
    assert.equal(await sendRuStore(job, { ...config, enabled: false }, () => { throw new Error('must not call'); }), 'disabled');
  } finally { store.close(); }
});

test('background polling observes matches without browser requests and never treats forecasts as official', async () => {
  const store = new PushStore(':memory:'); const a = credentials(); const calls = [];
  try {
    store.register(a.id, a.secret, input, now);
    await pollPushFixtures(store, 'http://127.0.0.1:4188', async url => {
      calls.push(url);
      return new Response(JSON.stringify(url.endsWith('/api/rpl') ? { fixtures: { data: [{ ...fixture, status: 'SCHEDULED', homeTeam: { name: 'Зенит' }, kickoffUtc: new Date(fixture.kickoff).toISOString() }] } } : { prediction: { home: {} } }));
    }, now);
    assert.equal(calls.length, 2); assert.equal(store.counts().pending, 0);
    assert.equal(normalizePushFixture({ id: 'bad/id' }), null);
    assert.equal(normalizePushFixture({ id: 'match1', homeScore: null }).homeScore, null);
  } finally { store.close(); }
});

test('push HTTP rejects foreign origins, unauthorized modifications and supports CORS and revocation when disabled', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'kromka-api-')); const settings = { ...config, database: path.join(dir, 'push.sqlite') };
  const handler = createPushHandler(settings);
  const server = http.createServer(async (req, res) => { res.setHeader('Access-Control-Allow-Origin', 'https://localhost'); await handler(req, res, new URL(req.url, 'http://localhost')); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); handler.close(); await rm(dir, { recursive: true, force: true }); });
  const a = credentials(); const url = `http://127.0.0.1:${server.address().port}/api/push/devices/${a.id}`;
  const options = { method: 'PUT', headers: { Origin: 'https://localhost', Authorization: `Bearer ${a.secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input) };
  assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://localhost' } })).status, 204);
  assert.equal((await fetch(url, options)).status, 200);
  assert.equal((await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${credentials().secret}` } })).status, 401);
  settings.registration = false;
  assert.equal((await fetch(url, options)).status, 503);
  assert.equal((await fetch(url, { method: 'DELETE', headers: options.headers })).status, 200);
});
