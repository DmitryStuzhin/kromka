import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { PushStore, normalizePushFixture } from './push-store.mjs';
import { pushConfig, pushReady } from './push-http.mjs';

export function officialLineups(payload) {
  if (payload?.prediction || payload?.predicted || payload?.isPredicted) return false;
  const data = payload?.data || payload || {};
  return ['home', 'away'].every(side => {
    const team = data[side] || data[`${side}Team`] || {};
    const players = team.startingLineups || team.starting_lineups;
    return !team.predicted && Array.isArray(players) && players.length === 11;
  });
}

export async function sendRuStore(job, config, fetcher = fetch) {
  if (!pushReady(config)) return 'disabled';
  try {
    const { title, body, eventId, fixtureId, kind } = job.payload;
    const ttl = Math.max(1, Math.min(600, Math.floor((job.expires - Date.now()) / 1000)));
    const response = await fetcher(`https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(config.project)}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.serviceToken}`, 'Content-Type': 'application/json' },
      // Native rendering checks local opt-out and eventId before showing anything.
      body: JSON.stringify({ message: { token: job.token, data: { eventId, fixtureId, kind, title, body, homeTeamId: job.payload.homeTeamId || '', awayTeamId: job.payload.awayTeamId || '' }, android: { ttl: `${ttl}s` } } }),
      signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    if (response.ok) return 'sent';
    const status = (await response.json().catch(() => ({})))?.error?.status;
    if (['UNREGISTERED', 'NOT_FOUND'].includes(status)) return 'unregistered';
    if (response.status === 401 || response.status === 403) return 'credentials';
    if (response.status === 400) return 'invalid';
    return 'retry';
  } catch { return 'retry'; }
}

export async function pollPushFixtures(store, base, fetcher = fetch, now = Date.now()) {
  if (!store.counts().devices) return;
  const response = await fetcher(`${base}/api/rpl`, { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error('Sports polling unavailable');
  const payload = await response.json();
  if (!Array.isArray(payload?.fixtures?.data)) throw new Error('Invalid sports polling payload');
  const rows = payload.fixtures.data.map(normalizePushFixture).filter(Boolean);
  for (const fixture of rows) {
    if (!['goal', 'start', 'finish', 'lineups'].some(kind => store.interested(fixture, kind))) continue;
    let lineups = false;
    if (fixture.status === 'scheduled' && fixture.kickoff > now && fixture.kickoff - now <= 2 * 3600_000 && store.interested(fixture, 'lineups')) {
      const result = await fetcher(`${base}/api/fixtures/${encodeURIComponent(fixture.id)}/lineups`, { signal: AbortSignal.timeout(60000) });
      if (result.ok) lineups = officialLineups(await result.json());
    }
    store.observe(fixture, { lineups, now });
  }
}

export async function runPushWorker(config = pushConfig()) {
  const store = new PushStore(config.database);
  let stopped = false; let lastPoll = 0; let lastPrune = 0; let credentialsPaused = false;
  const stop = () => { stopped = true; };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const base = `http://127.0.0.1:${Number(process.env.PORT || 4173)}`;
  console.log(`Push worker started; delivery ${pushReady(config) ? 'enabled' : 'disabled'}`);
  try {
    while (!stopped) {
      const now = Date.now();
      if (now - lastPrune >= 3600_000) { store.prune(now); lastPrune = now; }
      if (pushReady(config) && !credentialsPaused) {
        if (now - lastPoll >= 30_000) {
          lastPoll = now;
          try { await pollPushFixtures(store, base); }
          catch { console.warn('Push sports poll failed; retaining previous baseline'); }
        }
        for (let n = 0; n < 50 && !stopped; n++) {
          const job = store.claim();
          if (!job) break;
          const outcome = await sendRuStore(job, config);
          store.settle(job, outcome);
          if (outcome === 'credentials') { credentialsPaused = true; console.error('Push credentials rejected; delivery paused until worker restart'); break; }
        }
      }
      if (!stopped) await delay(1000);
    }
  } finally { store.close(); process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPushWorker().catch(() => { console.error('Push worker stopped unexpectedly'); process.exitCode = 1; });
