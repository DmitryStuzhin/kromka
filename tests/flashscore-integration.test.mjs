import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const serverScript = path.join(projectRoot, 'server.mjs');
const DYNAMO_ID = 'cmr7uolsy8mghrx06jog9s5dt';
const ZENIT_ID = 'cmr7uolst8mgfrx06mqhdh3qs';

async function freePort() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

async function startMock(handler) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

async function startApp(t, env) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverScript], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), GOAL_API_KEY: '', API_FOOTBALL_API_KEY: '', RPL_FLASHSCORE_ENABLED: 'true', RPL_FLASHSCORE_AUTOSTART: 'false', ...env },
    stdio: 'ignore'
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    try { if ((await fetch(`${baseUrl}/api/status`)).ok) return baseUrl; } catch { /* wait for listen */ }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('server did not become ready');
}

function goalStandings() {
  const ids = [DYNAMO_ID, ZENIT_ID, 'cmr7uolsu8mggrx06zkk540w9', 'cmr7uolsb8mg6rx06bm79bwbe', 'cmr7uolso8mgcrx06cn6sa9ix', 'cmr7uolt08mgjrx06xj1x745j', 'cmr7uolsf8mg8rx06mricgkwz', 'cmr7uolt88mglrx06dkah1bw7', 'cmr7uolso8mgbrx06e5bwsovt', 'cmr7uolt48mgkrx06mtepmfuh', 'cmr7uolsy8mgirx06lps95sxi', 'cmr7uolsb8mg7rx06aps282s2', 'cmr7uolte8mgprx06586mvsut', 'cmr7uolsj8mg9rx06lps3j1ye', 'cmr7uop9q8nosrx06j3ktdh8n', 'cmr7uopea8ns6rx06dhawawlh'];
  return { data: ids.map((id, index) => ({ team: { id, name: index ? `Клуб ${index + 1}` : 'Динамо Москва' }, overallLeaguePlayed: 1, overallLeagueW: index ? 0 : 1, overallLeagueD: 0, overallLeagueL: index ? 1 : 0, overallLeagueGF: index ? 0 : 3, overallLeagueGA: index ? 3 : 0, overallLeaguePTS: index ? 0 : 3 })) };
}

function goalFixture(id = 'goalfixture1') {
  return {
    id, homeTeamId: DYNAMO_ID, awayTeamId: ZENIT_ID,
    homeTeam: { id: DYNAMO_ID, name: 'Динамо Москва' }, awayTeam: { id: ZENIT_ID, name: 'Зенит' },
    kickoffUtc: '2026-11-10T19:00:00+03:00', matchStatus: 'FINISHED', homeScore: 3, awayScore: 2
  };
}

function completeFlashscoreSeason() {
  const teams = ['din', 'zen', 'spa', 'cska', 'kra', 'ore', 'bal', 'dmx', 'ros', 'rub', 'kry', 'loko', 'akh', 'akr', 'fak', 'rod'];
  return Array.from({ length: 240 }, (_, index) => ({
    id: `FS${String(index + 1).padStart(6, '0')}`, h: teams[index % teams.length], a: teams[(index + 1) % teams.length],
    d: '2026-11-10', t: '19:00', r: 14, st: 3, live: false, hg: 1, ag: 0
  }));
}

function flashscoreHandler({ unavailable = false, emptyMatchData = false, completeSeason = false } = {}) {
  return (req, res) => {
    if (unavailable) return json(res, 503, { error: 'mock unavailable' });
    if (req.url === '/health') return json(res, 200, { ok: true, version: '6.0' });
    if (req.url === '/api/season' && completeSeason) return json(res, 200, { stage: 'stage-2026', count: 240, matches: completeFlashscoreSeason() });
    if (req.url === '/api/season') return json(res, 200, { stage: 'stage-2026', count: 2, matches: [
      { id: 'FS123456', h: 'din', a: 'zen', d: '2026-11-10', t: '19:00', r: 14, st: 3, live: false, hg: 3, ag: 2 },
      { id: 'FS123457', h: 'din', a: 'zen', d: '2026-11-20', t: '20:00', r: 15, st: 1, live: false, hg: null, ag: null }
    ] });
    if (req.url === '/api/squads') return json(res, 200, { players: [
      { id: 'ivan-petrov/AbCd1234', n: 'Иван Петров', t: 'din', p: 'FW', no: 10, age: 21 },
      { id: 'zenit-player/AbCd1235', n: 'Павел Сидоров', t: 'zen', p: 'GK', no: 1, age: 24 }
    ] });
    if (req.url === '/api/match/FS123456') return json(res, 200, emptyMatchData ? { ev: null, g: [], st: [], li: null } : {
      ev: [[1, '55', [[1, 'Гол', 'ivan-petrov/AbCd1234']]]],
      g: ['Игра'], st: [[0, 'Владение', '60%', '40%']], li: null
    });
    return json(res, 404, { error: 'not found' });
  };
}

function goalHandler({ emptyLineups = false, fullHistory = false } = {}) {
  return (req, res) => {
    const url = new URL(req.url, 'http://goal.test');
    if (url.pathname === '/v1/fixtures') {
      if (!fullHistory) return json(res, 200, { data: [goalFixture()] });
      const offset = Number(url.searchParams.get('offset') || 0);
      return json(res, 200, { data: Array.from({ length: 100 }, (_, index) => goalFixture(`goalfixture${offset + index + 1}`)) });
    }
    if (url.pathname === '/v1/leagues/cmr77dvua00a4rx061d2jre7p/standings') return json(res, 200, goalStandings());
    if (url.pathname === `/v1/teams/${DYNAMO_ID}/players`) return json(res, 200, { data: [
      { id: 'goal-player-1', name: 'Иван Петров', number: 10, type: 'Forwards', age: 21, image: 'https://media.goal-api.com/players/ivan.png' },
      { id: 'goal-player-2', name: 'Сергей Иванов', number: 7, type: 'Midfielders', age: 25 }
    ] });
    if (url.pathname === '/v1/fixtures/goalfixture1/lineups') return json(res, 200, emptyLineups ? { data: { home: {}, away: {} } } : { data: {
      home: { formation: '4-3-3', startingLineups: [{ name: 'Иван Петров', number: 10, playerPosition: 'Forwards' }] },
      away: { formation: '4-4-2', startingLineups: [] }
    } });
    if (url.pathname === '/v1/fixtures/goalfixture1/events') return json(res, 200, { data: [{ minute: 55, type: 'Гол', player: { name: 'Иван Петров' } }] });
    if (url.pathname === '/v1/fixtures/goalfixture1/statistics') return json(res, 200, { data: [{ name: 'Владение', home: '61%', away: '39%' }] });
    return json(res, 404, { error: 'not found', path: url.pathname });
  };
}

test('Flashscore supplies fixtures and match data while GOAL supplies standings, live IDs, and missing roster/lineup fields', async (t) => {
  const flashscore = await startMock(flashscoreHandler());
  const goal = await startMock(goalHandler());
  t.after(() => { flashscore.server.close(); goal.server.close(); });
  const baseUrl = await startApp(t, {
    GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`,
    RPL_FLASHSCORE_PROXY_URL: flashscore.url
  });

  const status = await (await fetch(`${baseUrl}/api/status`)).json();
  assert.equal(status.provider, 'Flashscore');
  assert.equal(status.fallbackProvider, 'GOAL API');
  assert.equal(status.goalApiConfigured, true);

  const seasonResponse = await fetch(`${baseUrl}/api/rpl?season=2026`);
  assert.equal(seasonResponse.status, 200);
  const season = await seasonResponse.json();
  assert.equal(season.provider, 'Flashscore');
  assert.equal(season.standingsProvider, 'GOAL API');
  assert.equal(season.fixtures.data[0].id, 'FS123456');
  assert.equal(season.fixtures.data[0].goalFixtureId, 'goalfixture1');
  assert.equal(season.standings.data.length, 16);
  assert.equal(season.standings.data[0].overallLeaguePTS, 3);

  const eventResponse = await fetch(`${baseUrl}/api/fixtures/FS123456/events`);
  assert.equal(eventResponse.status, 200);
  const events = await eventResponse.json();
  assert.equal(events.provider, 'Flashscore');
  assert.match(events.data[0].description, /Иван Петров/);

  const lineupResponse = await fetch(`${baseUrl}/api/fixtures/FS123456/lineups`);
  assert.equal(lineupResponse.status, 200);
  const lineups = await lineupResponse.json();
  assert.equal(lineups.provider, 'GOAL API');
  assert.equal(lineups.data.home.startingLineups[0].name, 'Иван Петров');

  const rosterResponse = await fetch(`${baseUrl}/api/teams/${DYNAMO_ID}/players`);
  assert.equal(rosterResponse.status, 200);
  const roster = await rosterResponse.json();
  assert.equal(roster.provider, 'Flashscore');
  assert.equal(roster.data[0].portraitSource, 'GOAL API');
  assert.equal(roster.data[0].image, 'https://media.goal-api.com/players/ivan.png');
  assert.ok(roster.data.some((player) => player.name === 'Сергей Иванов' && player.number === 7));
});

test('GOAL fills match resources missing from Flashscore while keeping source labels', async (t) => {
  const flashscore = await startMock(flashscoreHandler({ emptyMatchData: true }));
  const goal = await startMock(goalHandler());
  t.after(() => { flashscore.server.close(); goal.server.close(); });
  const baseUrl = await startApp(t, {
    GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`,
    RPL_FLASHSCORE_PROXY_URL: flashscore.url
  });

  const seasonResponse = await fetch(`${baseUrl}/api/rpl?season=2026`);
  assert.equal(seasonResponse.status, 200);
  for (const resource of ['events', 'statistics']) {
    const response = await fetch(`${baseUrl}/api/fixtures/FS123456/${resource}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.provider, 'GOAL API');
    assert.equal(payload.data.length, 1);
  }
  const lineupsResponse = await fetch(`${baseUrl}/api/fixtures/FS123456/lineups`);
  assert.equal(lineupsResponse.status, 200);
  assert.equal((await lineupsResponse.json()).provider, 'GOAL API');
});

test('GOAL API remains the full fallback when the Flashscore proxy is unavailable', async (t) => {
  const flashscore = await startMock(flashscoreHandler({ unavailable: true }));
  const goal = await startMock(goalHandler());
  t.after(() => { flashscore.server.close(); goal.server.close(); });
  const baseUrl = await startApp(t, {
    GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`,
    RPL_FLASHSCORE_PROXY_URL: flashscore.url
  });

  const response = await fetch(`${baseUrl}/api/rpl?season=2026`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.provider, 'GOAL API');
  assert.equal(payload.fixtures.data[0].id, 'goalfixture1');
  assert.equal(payload.standings.data.length, 16);
});

test('supplemental GOAL pagination does not override Flashscore fixture-history completeness', async (t) => {
  const flashscore = await startMock(flashscoreHandler({ completeSeason: true }));
  const goal = await startMock(goalHandler({ fullHistory: true }));
  t.after(() => { flashscore.server.close(); goal.server.close(); });
  const baseUrl = await startApp(t, {
    GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`,
    RPL_FLASHSCORE_PROXY_URL: flashscore.url
  });

  const response = await fetch(`${baseUrl}/api/rpl?season=2026`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.provider, 'Flashscore');
  assert.equal(payload.fixtureHistoryComplete, true);
});
