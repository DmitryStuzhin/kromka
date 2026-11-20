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
    kickoffUtc: '2026-11-10T19:00:00+03:00', matchRound: 'Round 14', matchStatus: 'FINISHED', homeScore: 3, awayScore: 2
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
      { id: 'FS123456', h: 'din', a: 'zen', d: '2026-11-10', t: '19:00', r: null, st: 3, live: false, hg: 3, ag: 2 },
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
  assert.equal(season.fixtures.data[0].matchRound, 14);
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
  assert.equal(lineups.prediction, undefined);

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

test('forecast recovers precise roles from remembered historical fixture IDs and formations', async t => {
  const nextYear = new Date().getUTCFullYear() + 1;
  const kickoff = `${nextYear}-03-01T19:00:00+03:00`;
  const prior = { ...goalFixture('past-roles'), kickoffUtc: `${nextYear}-02-01T19:00:00+03:00`, homeTeamSystem:'5-3-2', awayTeamSystem:'4-4-2' };
  const future = { ...goalFixture('future-roles'), kickoffUtc:kickoff, matchStatus:'SCHEDULED' };
  const players=Array.from({length:11},(_,i)=>({id:`player-${i}/AbCd${String(i).padStart(4,'0')}`,n:`Футболист ${i}`,t:'din',p:i?'DF':'GK',no:i+1,age:24,lg:[11,900-i]}));
  const visited=[];
  const flashscore=await startMock((req,res)=>{
    if(req.url==='/api/squads')return json(res,200,{players});
    return flashscoreHandler({unavailable:true})(req,res);
  });
  const goal=await startMock((req,res)=>{
    const url=new URL(req.url,'http://goal.test');
    if(url.pathname==='/v1/fixtures')return json(res,200,{data:[prior,future]});
    if(url.pathname==='/v1/fixtures/past-roles/lineups') {
      visited.push(url.pathname);
      return json(res,200,{data:{home:{startingLineups:players.map((p,i)=>({name:p.n,number:p.no,lineupPosition:String(i+1)}))},away:{}}});
    }
    if(url.pathname==='/v1/fixtures/future-roles/lineups')return json(res,200,{data:{home:{},away:{}}});
    return goalHandler()(req,res);
  });
  t.after(()=>{flashscore.server.close();goal.server.close();});
  const baseUrl=await startApp(t,{GOAL_API_KEY:'test-key',GOAL_API_BASE:`${goal.url}/v1`,RPL_FLASHSCORE_PROXY_URL:flashscore.url});
  await fetch(`${baseUrl}/api/rpl?season=${nextYear-1}`);
  const response=await fetch(`${baseUrl}/api/fixtures/future-roles/lineups`);
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.ok(visited.length>0);
  assert.equal(payload.prediction.home.formation,'5-3-2');
  assert.equal(payload.prediction.home.positionHistoryMatches,1);
  assert.equal(payload.prediction.home.startingLineups[1].tacticalRole,'RWB');
  assert.equal(payload.prediction.home.startingLineups[2].tacticalRole,'RCB');
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

test('player profile keeps league and all-competition totals separate and rejects players from another club', async (t) => {
  const id = 'ivan-petrov/AbCd1234';
  let detailRequests = 0;
  const flashscore = await startMock((req, res) => {
    if (req.url === '/api/squads') return json(res, 200, { players: [
      { id, n: 'Иван Петров', t: 'din', p: 'FW', no: 10, lg: [4, 110, 1, null, 0, 0], tot: [6, 230, 2, 1, 1, 0] }
    ] });
    if (req.url === `/api/player/${id}`) {
      detailRequests++;
      return json(res, 200, { id, n: 'Иван Петров', img: 'real-photo.png', career: [{ category: 'league', season: '2025/2026', played: 20 }] });
    }
    return json(res, 404, { error: 'not found' });
  });
  t.after(() => flashscore.server.close());
  const base = await startApp(t, { RPL_FLASHSCORE_PROXY_URL: flashscore.url });
  const request = (team, query) => fetch(`${base}/api/teams/${team}/player?${new URLSearchParams(query)}`);
  const response = await request(DYNAMO_ID, { id });
  assert.equal(response.status, 200);
  const profile = await response.json();
  assert.deepEqual(profile.league, { played: 4, minutes: 110, goals: 1, assists: null, yellow: 0, red: 0 });
  assert.deepEqual(profile.all, { played: 6, minutes: 230, goals: 2, assists: 1, yellow: 1, red: 0 });
  assert.equal(profile.photo, `/api/player-portraits/${id}`);
  assert.equal(profile.career[0].played, 20);
  assert.equal((await request(ZENIT_ID, { id })).status, 404);
  assert.equal((await request(DYNAMO_ID, { id: 'goal-id', name: 'Петров Иван', number: '10' })).status, 200);
  assert.equal(detailRequests, 1);
});

for (const standingsUnavailable of [false, true]) {
  test(`today's missing live fixture supplements the primary calendar${standingsUnavailable ? ' even if standings fail' : ''}`, async t => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const live = {
      id: 'rostov-live', homeTeamId: 'cmr7uolsy8mgirx06lps95sxi', awayTeamId: 'cmr7uolt48mgkrx06mtepmfuh',
      homeTeam: { id: 'cmr7uolsy8mgirx06lps95sxi', name: 'Rostov' }, awayTeam: { id: 'cmr7uolt48mgkrx06mtepmfuh', name: 'Krylya Sovetov' },
      kickoffUtc: `${today}T16:30:00Z`, matchStatus: 'LIVE', matchLive: '1', matchMinute: '86', homeTeamScore: '2', awayTeamScore: '0', matchRound: '15'
    };
    const fallback = goalHandler();
    const goal = await startMock((req, res) => {
      const url = new URL(req.url, 'http://goal.test');
      if (url.pathname === '/v1/fixtures' && url.searchParams.get('from') === url.searchParams.get('to')) return json(res, 200, { data: [live] });
      if (url.pathname.endsWith('/standings') && standingsUnavailable) return json(res, 503, { error: 'unavailable' });
      if (url.pathname === '/v1/fixtures/rostov-live/events') return json(res, 200, { data: [{ minute: '14', type: 'goal', player: { name: 'Olusegun' } }] });
      return fallback(req, res);
    });
    const flashscore = await startMock(flashscoreHandler());
    t.after(() => { goal.server.close(); flashscore.server.close(); });
    const base = await startApp(t, { GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`, RPL_FLASHSCORE_PROXY_URL: flashscore.url });
    const response = await fetch(`${base}/api/rpl?season=2026`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.fixtures.data.length, 3, 'shared historical match must not be duplicated');
    assert.equal(payload.fixtures.data.filter(row => row.goalFixtureId === 'goalfixture1').length, 1);
    const match = payload.fixtures.data.find(row => row.id === 'rostov-live');
    assert.equal(match.matchStatus, 'LIVE');
    assert.equal(match.matchMinute, '86');
    assert.equal(match.homeTeamScore, '2');
    assert.equal(match.awayTeamScore, '0');
    assert.equal(match.provider, 'GOAL API');
    assert.equal(payload.standingsProvider, standingsUnavailable ? 'Flashscore' : 'GOAL API');
    const events = await fetch(`${base}/api/fixtures/rostov-live/events`);
    assert.equal(events.status, 200, 'supplemental match details must be accessible');
    assert.equal((await events.json()).data[0].player.name, 'Olusegun');
  });
}

test('fresh daily scores override stale season rows without changing the primary fixture ID', async t => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const historical = { ...goalFixture('goal-live'), kickoffUtc: `${today}T19:00:00+03:00`, matchStatus: 'LIVE', homeScore: 1, awayScore: 0, matchMinute: '10' };
  const fallback = goalHandler();
  const goal = await startMock((req, res) => {
    const url = new URL(req.url, 'http://goal.test');
    if (url.pathname === '/v1/fixtures') {
      const current = url.searchParams.get('from') === url.searchParams.get('to');
      return json(res, 200, { data: [{ ...historical, ...(current ? { homeScore: 2, matchMinute: '90+' } : {}) }] });
    }
    return fallback(req, res);
  });
  const flashscore = await startMock((req, res) => req.url === '/api/season' ? json(res, 200, { matches: [
    { id: 'FS123456', h: 'din', a: 'zen', d: today, t: '19:00', r: 15, st: 1, live: false, hg: null, ag: null }
  ] }) : flashscoreHandler()(req, res));
  t.after(() => { goal.server.close(); flashscore.server.close(); });
  const base = await startApp(t, { GOAL_API_KEY: 'test-key', GOAL_API_BASE: `${goal.url}/v1`, RPL_FLASHSCORE_PROXY_URL: flashscore.url });
  const { fixtures } = await (await fetch(`${base}/api/rpl?season=2026`)).json();
  assert.equal(fixtures.data.length, 1);
  assert.equal(fixtures.data[0].id, 'FS123456');
  assert.equal(fixtures.data[0].goalFixtureId, 'goal-live');
  assert.equal(fixtures.data[0].matchStatus, 'LIVE');
  assert.equal(fixtures.data[0].matchMinute, '90+');
  assert.equal(fixtures.data[0].homeScore, 2);
  assert.equal(fixtures.data[0].awayScore, 0);
});

test('chronology supplements a goals-only endpoint with cards and substitutions from the full fixture', async t => {
  const score = { id:'g1',time:'55',type:'GOAL',homeScorer:'I. Petrov',homeScorerId:'111',score:'1 - 0' };
  const fallback = goalHandler();
  const goal = await startMock((req,res) => {
    const url = new URL(req.url,'http://goal.test');
    if(url.pathname === '/v1/fixtures/goalfixture1/events') return json(res,200,{data:[score],grouped:{goals:[score],cards:[]}});
    if(url.pathname === '/v1/fixtures/goalfixture1') return json(res,200,{data:{...goalFixture(),events:[score],
      cards:[{time:'62',card:'yellow card',homeFault:'I. Petrov',homePlayerId:'111'}],
      substitutions:[{time:'67',team:'home',substitution:'S. Ivanov | I. Petrov',substitutionPlayerId:'222 | 111'}],
      lineups:[{team:'home',playerKey:'111',lineupPlayer:'Ivan Petrov',lineupNumber:'10'}]
    }});
    return fallback(req,res);
  });
  const flashscore = await startMock(flashscoreHandler({emptyMatchData:true}));
  t.after(()=>{goal.server.close();flashscore.server.close();});
  const base=await startApp(t,{GOAL_API_KEY:'test-key',GOAL_API_BASE:`${goal.url}/v1`,RPL_FLASHSCORE_PROXY_URL:flashscore.url});
  await fetch(`${base}/api/rpl?season=2026`);
  const response=await fetch(`${base}/api/fixtures/FS123456/events`);
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.data.length,3,'goal from both endpoints is included once');
  assert.equal(payload.data[0].player.name,'Иван Петров');
  const card=payload.data.find(row=>row.card);
  assert.equal(card.player.name,'Иван Петров');
  assert.equal(card.team.id,DYNAMO_ID);
  const substitution=payload.data.find(row=>row.substitution);
  assert.equal(substitution.playerIn.name,'Иван Петров');
  assert.equal(substitution.team.id,DYNAMO_ID);
});
