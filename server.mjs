import http from 'node:http';
import './assets/goal-insights.js';
import { release, releaseIssues } from './release-config.mjs';
import { legalRoutes, renderLegalPage } from './legal-pages.mjs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLASH_TEAM_BY_GOAL_ID, flashscoreMatchEvents, flashscoreMatchLineups, flashscoreMatchStatistics, flashscoreRoster, flashscoreRosterById, flashscorePortraitPath, playerSeasonStats, flashscoreSeasonPayload, mostUsedFormations, predictFlashscoreLineup, predictPositionedLineup } from './flashscore-adapter.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4173);
const GOAL_API_KEY = process.env.GOAL_API_KEY || '';
const API_FOOTBALL_API_KEY = process.env.API_FOOTBALL_API_KEY || '';
const LEAGUE_ID = process.env.GOAL_RPL_LEAGUE_ID || 'cmr77dvua00a4rx061d2jre7p';
const API_BASE = process.env.GOAL_API_BASE || 'https://api.goal-api.com/v1';
const API_FOOTBALL_BASE = 'https://v3.football.api-sports.io';
const FLASHSCORE_ENABLED = process.env.RPL_FLASHSCORE_ENABLED !== 'false';
const FLASHSCORE_PROXY_URL = (process.env.RPL_FLASHSCORE_PROXY_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const FLASHSCORE_PROXY_AUTOSTART = process.env.RPL_FLASHSCORE_AUTOSTART !== 'false';
const FLASHSCORE_PROXY_PORT = Number(new URL(FLASHSCORE_PROXY_URL).port || 8765);
const SQUAD_CACHE_TTL = 7 * 24 * 60 * 60_000;
const PORTRAIT_CHECK_TTL = 7 * 24 * 60 * 60_000;
const API_FOOTBALL_DAILY_GUARD = 80;
const API_FOOTBALL_CACHE_PATH = path.join(process.env.KROMKA_CACHE_DIR || path.join(ROOT, '.cache'), 'api-football-squads.json');
const API_FOOTBALL_GENERIC_PHOTO_HASHES = new Set([
  // Verified generic gray silhouette returned for two distinct Dynamo squad player URLs.
  '2ff7d52a628fce5d954c58480dde4e47396db4bb405b7b7d6a6567134bf86422'
]);
const API_FOOTBALL_TEAM_IDS_BY_GOAL_ID = new Map([
  ['cmr7uolsy8mghrx06jog9s5dt', 1088], // Dynamo Moscow
  ['cmr7uolst8mgfrx06mqhdh3qs', 596],  // Zenit
  ['cmr7uolsu8mggrx06zkk540w9', 555],  // CSKA Moscow
  ['cmr7uolsb8mg6rx06bm79bwbe', 621],  // Krasnodar
  ['cmr7uolso8mgcrx06cn6sa9ix', 558],  // Spartak Moscow
  ['cmr7uolsy8mgirx06lps95sxi', 779],  // Rostov
  ['cmr7uolt88mglrx06dkah1bw7', 1080], // Orenburg
  ['cmr7uolt48mgkrx06mtepmfuh', 1079], // Krylia Sovetov
  ['cmr7uolso8mgbrx06e5bwsovt', 1083], // Rubin Kazan
  ['cmr7uolsf8mg8rx06mricgkwz', 2006], // Baltika
  ['cmr7uolt08mgjrx06xj1x745j', 6813], // Dynamo Makhachkala
  ['cmr7uopea8ns6rx06dhawawlh', 6822], // Rodina Moscow
  ['cmr7uolsj8mg9rx06lps3j1ye', 6786], // Akron
  ['cmr7uolsb8mg7rx06aps282s2', 597],  // Lokomotiv Moscow
  ['cmr7uolte8mgprx06586mvsut', 1085], // Akhmat Grozny
  ['cmr7uop9q8nosrx06j3ktdh8n', 1993]   // Fakel
]);
const cache = new Map();
const knownFixtures = new Map();
const knownTeams = new Set();
const apiFootballPendingSquads = new Map();
const apiFootballPendingPortraitChecks = new Map();
let persistentCache = { version: 1, teams: {}, portraitChecks: {}, dailyRequests: {} };
let persistentCacheLoad;
let persistentCacheWrite = Promise.resolve();
const liveStreamClients = new Set();
let flashscoreProxyProcess = null;
let flashscoreSquadsCache = { at: 0, players: [] };
let flashscoreSquadsPending;
const playerDetails = new Map();
const playerDetailPending = new Map();
const knownLineupPlayers = new Map();
const playerPhotos = new Map();
const positionalHistoryCache = new Map();
const positionalHistoryPending = new Map();
let goalLiveSocket = null;
let goalLiveFixtureIds = [];
let goalLiveFixtureKey = '';
let goalLiveGeneration = 0;
let goalLiveRetryTimer = null;
let goalLiveRetryAttempt = 0;
let goalLiveState = { provider: 'GOAL API', transport: 'WebSocket', state: 'idle', matchCount: 0, updatedAt: null };
const MIME = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.txt':'text/plain; charset=utf-8' };

function send(res, status, body, type = 'application/json; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function emitLiveStream(event, value) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(value)}\n\n`;
  for (const client of liveStreamClients) {
    try { client.write(frame); } catch { liveStreamClients.delete(client); }
  }
}
function setGoalLiveState(state, matchCount = goalLiveFixtureIds.length) {
  goalLiveState = { provider: 'GOAL API', transport: 'WebSocket', state, matchCount, updatedAt: new Date().toISOString() };
  emitLiveStream('state', goalLiveState);
}
function persistentObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
async function loadPersistentCache() {
  if (!persistentCacheLoad) {
    persistentCacheLoad = (async () => {
      try {
        const saved = JSON.parse(await readFile(API_FOOTBALL_CACHE_PATH, 'utf8'));
        persistentCache = {
          version: 1,
          teams: persistentObject(saved.teams),
          portraitChecks: persistentObject(saved.portraitChecks),
          dailyRequests: persistentObject(saved.dailyRequests)
        };
      } catch (error) {
        if (error.code !== 'ENOENT') console.warn('API-Football cache could not be read; starting empty.');
      }
    })();
  }
  await persistentCacheLoad;
}
function savePersistentCache() {
  const snapshot = JSON.stringify(persistentCache);
  const write = persistentCacheWrite.then(async () => {
    await mkdir(path.dirname(API_FOOTBALL_CACHE_PATH), { recursive: true });
    const temp = `${API_FOOTBALL_CACHE_PATH}.${process.pid}.tmp`;
    await writeFile(temp, snapshot, { mode: 0o600 });
    await rename(temp, API_FOOTBALL_CACHE_PATH);
  });
  persistentCacheWrite = write.catch((error) => console.warn('API-Football cache could not be saved:', error.message));
  return write;
}
async function reserveApiFootballRequest() {
  await loadPersistentCache();
  const today = new Date().toISOString().slice(0, 10);
  const used = Number(persistentCache.dailyRequests[today] || 0);
  if (used >= API_FOOTBALL_DAILY_GUARD) return false;
  persistentCache.dailyRequests[today] = used + 1;
  for (const day of Object.keys(persistentCache.dailyRequests)) if (day < today.slice(0, 8) + '01') delete persistentCache.dailyRequests[day];
  await savePersistentCache();
  return true;
}
async function goalGet(endpoint, ttl) {
  const entry = cache.get(endpoint);
  if (entry && Date.now() - entry.at < ttl) return entry.value;
  const response = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${GOAL_API_KEY}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const error = new Error(`GOAL API returned ${response.status}`); error.status = response.status; throw error; }
  const value = await response.json(); cache.set(endpoint, { at: Date.now(), value }); return value;
}
async function flashscoreGet(endpoint) {
  if (!FLASHSCORE_ENABLED) throw new Error('Flashscore proxy is disabled');
  const response = await fetch(`${FLASHSCORE_PROXY_URL}${endpoint}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Flashscore proxy returned ${response.status}`);
  return response.json();
}
async function flashscoreSquadPlayers() {
  if (flashscoreSquadsCache.players.length && Date.now() - flashscoreSquadsCache.at < 30 * 60_000) return flashscoreSquadsCache.players;
  if (!flashscoreSquadsPending) {
    flashscoreSquadsPending = flashscoreGet('/api/squads').then(payload => {
      if (!Array.isArray(payload?.players)) throw new Error('Flashscore proxy returned an invalid squads payload');
      flashscoreSquadsCache = { at: Date.now(), players: payload.players };
      return payload.players;
    }).finally(() => { flashscoreSquadsPending = null; });
  }
  return flashscoreSquadsPending;
}
function dateKeyOf(value) {
  const raw = String(value ?? '');
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function teamIdsOfFixture(item) {
  return {
    home: String(item?.homeTeamId || item?.home_team_id || teamIdOf(item?.homeTeam || item?.home_team || item?.teams?.home) || ''),
    away: String(item?.awayTeamId || item?.away_team_id || teamIdOf(item?.awayTeam || item?.away_team || item?.teams?.away) || '')
  };
}
function sameFixtureTeamsAndDay(first, second) {
  const a = teamIdsOfFixture(first), b = teamIdsOfFixture(second);
  if (!a.home || !a.away || a.home !== b.home || a.away !== b.away) return false;
  const day = item => dateKeyOf(item.kickoffUtc || item.kickoff_utc || item.matchDate || item.kickoff || item.date || '');
  const firstDay = day(first), secondDay = day(second);
  return Boolean(firstDay && secondDay && Math.abs(Date.parse(`${firstDay}T12:00:00Z`) - Date.parse(`${secondDay}T12:00:00Z`)) <= 86_400_000);
}
function mergeGoalFixtures(flashFixtures, goalFixtures, currentFixtures = []) {
  const rows = fixtureRowsOf(goalFixtures);
  for (const fixture of flashFixtures) {
    const candidates = rows.filter(goal => sameFixtureTeamsAndDay(fixture, goal));
    if (candidates.length === 1) {
      const goal = candidates[0];
      fixture.goalFixtureId = String(goal.id || goal.fixtureId || '');
      fixture.homeFormation = goal.homeTeamSystem || goal.homeFormation || fixture.homeFormation || '';
      fixture.awayFormation = goal.awayTeamSystem || goal.awayFormation || fixture.awayFormation || '';
      // Today's short-lived feed keeps scores and clocks fresh even when the season feed lags.
      const current = currentFixtures.find(row => String(row.id || row.fixtureId) === fixture.goalFixtureId);
      const status = current && goalStatusCategory(current.matchStatus || current.status);
      if (status) {
        fixture.matchStatus = status === 'finished' ? 'FINISHED' : 'LIVE';
        fixture.matchLive = status === 'live';
        fixture.matchMinute = goalClockMinute(current);
        fixture.matchElapsed = current.matchElapsed;
        fixture.matchPeriod = current.matchPeriod;
        const homeScore = goalScoreNumber(current.homeScore ?? current.homeTeamScore);
        const awayScore = goalScoreNumber(current.awayScore ?? current.awayTeamScore);
        if (homeScore !== null && awayScore !== null) Object.assign(fixture, { homeScore, awayScore });
      }
      if (fixture.matchRound == null) {
        const value = goal.matchRound ?? goal.round ?? goal.matchday ?? goal.week;
        const label = value && typeof value === 'object' ? value.number ?? value.matchday ?? value.round ?? value.name : value;
        const round = Number(String(label ?? '').trim().match(/^(?:(?:round|matchday|тур)\s*[-: ]?\s*)?(\d{1,2})$/iu)?.[1]);
        if (round >= 1 && round <= 30) fixture.matchRound = round;
      }
    }
  }
  // Keep primary IDs for existing matches; add fixtures absent from the primary calendar.
  for (const goal of rows) {
    const id = String(goal.id || goal.fixtureId || '');
    const teams = teamIdsOfFixture(goal);
    if (!id || !teams.home || !teams.away) continue;
    if (flashFixtures.some(fixture => String(fixture.id) === id || fixture.goalFixtureId === id || sameFixtureTeamsAndDay(fixture, goal))) continue;
    flashFixtures.push({ ...goal, provider: 'GOAL API' });
  }
}
function startFlashscoreProxy() {
  if (!FLASHSCORE_ENABLED || !FLASHSCORE_PROXY_AUTOSTART || flashscoreProxyProcess) return;
  let parsed;
  try { parsed = new URL(FLASHSCORE_PROXY_URL); } catch { return; }
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)) return;
  flashscoreProxyProcess = spawn(process.env.PYTHON || 'python3', [path.join(ROOT, 'flashscore_proxy.py'), '--host', '127.0.0.1', '--port', String(FLASHSCORE_PROXY_PORT)], { stdio: 'ignore' });
  flashscoreProxyProcess.on('error', (error) => console.warn('Flashscore proxy could not be started:', error.message));
  flashscoreProxyProcess.on('exit', (code) => { if (code && code !== 0) console.warn(`Flashscore proxy stopped with code ${code}`); });
}
function stopFlashscoreProxy() { if (flashscoreProxyProcess && flashscoreProxyProcess.exitCode === null) flashscoreProxyProcess.kill('SIGTERM'); }
process.once('exit', stopFlashscoreProxy);
function goalStatusCategory(value) {
  if (value && typeof value === 'object') value = [value.state, value.status, value.name, value.short, value.code, value.description, value.type?.name, value.type?.state].filter(Boolean).join(' ');
  const status = String(value ?? '').toUpperCase().replace(/[\s_-]+/g, ' ');
  if (/FINISHED|FULL TIME|COMPLETE|COMPLETED|ENDED|\bFT\b/.test(status)) return 'finished';
  if (/\bLIVE\b|IN PLAY|IN PROGRESS|\b1H\b|\b2H\b|\bHT\b|HALF TIME|FIRST HALF|SECOND HALF|EXTRA TIME|\bET\b|\bBT\b/.test(status)) return 'live';
  return '';
}
function goalMatchIsLive(item) {
  return item?.matchLive === true || item?.live === true || goalStatusCategory(item?.matchStatus || item?.match_status || item?.status || item?.state) === 'live';
}
function goalScoreNumber(value) {
  if (value && typeof value === 'object') value = value.value ?? value.current ?? value.score;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' && !/^\d{1,2}$/.test(String(value).trim())) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}
function goalClockMinute(data) { return globalThis.rplMatchInsights.matchClock(data); }
function applyGoalSocketMessage(message) {
  if (message?.type !== 'match_update') return;
  const data = message.data && typeof message.data === 'object' ? message.data : {};
  const id = String(message.matchId || message.match_id || data.matchId || data.match_id || data.fixtureId || data.fixture_id || data.id || data.fixture?.id || (goalLiveFixtureIds.length === 1 ? goalLiveFixtureIds[0] : ''));
  if (!id || !goalLiveFixtureIds.includes(id) || !knownFixtures.has(id)) return;
  const homeScore = goalScoreNumber(data.homeScore ?? data.homeTeamScore ?? data.match_hometeam_score ?? data.score?.home);
  const awayScore = goalScoreNumber(data.awayScore ?? data.awayTeamScore ?? data.match_awayteam_score ?? data.score?.away);
  const minute = goalClockMinute(data);
  const status = goalStatusCategory(data.status ?? data.matchStatus ?? data.match_status ?? data.fixtureStatus ?? data.state);
  if (homeScore === null && awayScore === null && !minute && !status) return;
  const flashscoreEntry = [...knownFixtures.entries()].find(([, fixture]) => fixture.provider === 'Flashscore' && fixture.goalFixtureId === id);
  const displayFixtureId = flashscoreEntry?.[0] || id;
  if (status) {
    const fixture = knownFixtures.get(id);
    knownFixtures.set(id, { ...fixture, status: status === 'finished' ? 'FINISHED' : 'LIVE' });
    if (flashscoreEntry) knownFixtures.set(displayFixtureId, { ...flashscoreEntry[1], status: status === 'finished' ? 'FINISHED' : 'LIVE' });
  }
  emitLiveStream('fixture', { fixtureId: displayFixtureId, provider: 'GOAL API', transport: 'WebSocket', homeScore, awayScore, minute, status, receivedAt: new Date().toISOString() });
}
function scheduleGoalSocketRetry(generation) {
  if (generation !== goalLiveGeneration || !goalLiveFixtureIds.length || goalLiveRetryTimer) return;
  const delays = [5_000, 15_000, 30_000, 60_000, 5 * 60_000, 15 * 60_000];
  const delay = delays[Math.min(goalLiveRetryAttempt, delays.length - 1)];
  goalLiveRetryAttempt += 1;
  goalLiveRetryTimer = setTimeout(() => {
    goalLiveRetryTimer = null;
    connectGoalLiveSocket(generation).catch((error) => {
      if (generation !== goalLiveGeneration) return;
      console.warn('GOAL live socket reconnect failed:', error.message);
      setGoalLiveState('reconnecting');
      scheduleGoalSocketRetry(generation);
    });
  }, delay);
}
async function connectGoalLiveSocket(generation) {
  if (generation !== goalLiveGeneration || !GOAL_API_KEY || !goalLiveFixtureIds.length) return;
  if (typeof WebSocket !== 'function') { setGoalLiveState('unavailable', 0); return; }
  const response = await fetch(`${API_BASE}/ws/token`, { method: 'POST', headers: { Authorization: `Bearer ${GOAL_API_KEY}` }, signal: AbortSignal.timeout(15000) });
  let payload = {};
  try { payload = await response.json(); } catch { /* handled as an invalid token response */ }
  const token = payload?.data?.token;
  if (!response.ok || !token) throw new Error(`GOAL WebSocket token returned ${response.status}`);
  if (generation !== goalLiveGeneration) return;
  const socket = new WebSocket(`wss://api.goal-api.com/ws?wsToken=${encodeURIComponent(token)}`);
  goalLiveSocket = socket;
  let heartbeat;
  socket.addEventListener('open', () => {
    if (generation !== goalLiveGeneration) return socket.close();
    socket.send(JSON.stringify({ type: 'auth', token }));
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.type === 'auth_success') {
      const maximum = Number(message.data?.maxSubscriptions ?? message.maxSubscriptions ?? 0);
      if (!maximum) {
        setGoalLiveState('unavailable', 0);
        return socket.close(4001, 'No match subscriptions available');
      }
      goalLiveRetryAttempt = 0;
      const ids = goalLiveFixtureIds.slice(0, Math.min(maximum, 25));
      setGoalLiveState('connected', ids.length);
      for (const matchId of ids) socket.send(JSON.stringify({ type: 'subscribe', resource: 'match', matchId }));
      heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 30_000);
      return;
    }
    if (message.type === 'match_update') applyGoalSocketMessage(message);
    if (message.type === 'error') {
      const code = String(message.error?.code || message.code || 'provider-error');
      console.warn('GOAL live socket reported an error:', code);
      if (goalLiveState.state !== 'unavailable') socket.close();
    }
  });
  socket.addEventListener('close', () => {
    if (heartbeat) clearInterval(heartbeat);
    if (goalLiveSocket === socket) goalLiveSocket = null;
    if (generation !== goalLiveGeneration || goalLiveState.state === 'unavailable') return;
    setGoalLiveState('reconnecting');
    scheduleGoalSocketRetry(generation);
  });
  socket.addEventListener('error', () => {
    if (generation === goalLiveGeneration) setGoalLiveState('reconnecting');
  });
}
function syncGoalLiveSocket(fixtures) {
  const ids = fixtureRowsOf(fixtures).filter(goalMatchIsLive).map((fixture) => String(fixture?.id || fixture?.fixtureId || '')).filter((id) => id && knownFixtures.has(id)).slice(0, 25);
  const nextKey = ids.join('|');
  if (nextKey === goalLiveFixtureKey) return;
  goalLiveFixtureKey = nextKey;
  goalLiveFixtureIds = ids;
  goalLiveGeneration += 1;
  const generation = goalLiveGeneration;
  if (goalLiveRetryTimer) { clearTimeout(goalLiveRetryTimer); goalLiveRetryTimer = null; }
  const previous = goalLiveSocket;
  goalLiveSocket = null;
  if (previous) previous.close(1000, 'RPL live fixtures changed');
  goalLiveRetryAttempt = 0;
  if (!GOAL_API_KEY || !ids.length) { setGoalLiveState('idle', 0); return; }
  setGoalLiveState('connecting', ids.length);
  connectGoalLiveSocket(generation).catch((error) => {
    if (generation !== goalLiveGeneration) return;
    console.warn('GOAL live socket connection failed:', error.message);
    setGoalLiveState('reconnecting');
    scheduleGoalSocketRetry(generation);
  });
}
function teamIdOf(team) { return String(team?.id || team?.teamId || team?.team_id || ''); }
function rememberFixtures(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  for (const item of rows) {
    const id = String(item?.id || item?.fixtureId || '');
    const homeTeamId = String(item?.homeTeamId || item?.home_team_id || teamIdOf(item?.homeTeam || item?.home_team || item?.teams?.home) || '');
    const awayTeamId = String(item?.awayTeamId || item?.away_team_id || teamIdOf(item?.awayTeam || item?.away_team || item?.teams?.away) || '');
    if (id) knownFixtures.set(id, {
      id, status: String(item.matchStatus || item.status || '').toUpperCase(), homeTeamId, awayTeamId,
      provider: item.provider || payload?.provider || 'GOAL API',
      flashscoreMatchId: String(item.flashscoreMatchId || ''),
      flashscoreHomeCode: String(item.flashscoreHomeCode || ''), flashscoreAwayCode: String(item.flashscoreAwayCode || ''),
      kickoffUtc: String(item.kickoffUtc || item.kickoff_utc || item.matchDate || item.date || ''),
      homeFormation: item.homeTeamSystem || item.homeFormation || '',
      awayFormation: item.awayTeamSystem || item.awayFormation || '',
      goalFixtureId: String(item.goalFixtureId || '')
    });
    for (const teamId of [homeTeamId, awayTeamId]) if (teamId) knownTeams.add(teamId);
  }
}
function rememberStandingsTeams(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 8) return;
  if (Array.isArray(value)) { for (const row of value) rememberStandingsTeams(row, depth + 1); return; }
  for (const id of [value.teamId, value.team_id, value.team?.id, value.club?.id, value.participant?.id]) if (id) knownTeams.add(String(id));
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object' && !['team', 'club', 'participant'].includes(key)) rememberStandingsTeams(child, depth + 1);
}
function moscowDay() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function shiftDay(iso, days) { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function resolvePath(pathname) {
  let decoded; try { decoded = decodeURIComponent(pathname.split('?')[0]); } catch { return null; }
  const requested = decoded === '/' ? '/index.html' : decoded;
  if (requested.split('/').some((part) => part.startsWith('.'))) return null;
  const publicFile = ['/index.html', '/goal-data.js', '/service-worker.js', '/manifest.json'].includes(requested)
    || /^\/assets\/fonts\/(?:Golos-Text|Oswald|IBM-Plex-Mono)-OFL\.txt$/.test(requested)
    || /^\/(?:assets|previews)\/.+\.(?:css|js|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf)$/i.test(requested);
  if (!publicFile) return null;
  const file = path.resolve(ROOT, `.${requested}`);
  return file.startsWith(`${ROOT}${path.sep}`) ? file : null;
}
function approvedUrl(value, host) {
  try { const url = new URL(String(value || '')); return url.protocol === 'https:' && url.hostname === host ? url.href : ''; }
  catch { return ''; }
}
function goalPortraitOf(player) {
  for (const value of [player?.image, player?.playerImage, player?.photo, player?.avatar]) {
    const url = approvedUrl(value, 'media.goal-api.com');
    if (url) return url;
    const flashscore = approvedUrl(value, 'static.flashscore.com');
    if (flashscore && /^\/res\/image\/data\/[A-Za-z0-9._-]+$/.test(new URL(flashscore).pathname)) return flashscore;
  }
  return '';
}
function nameTokens(value) {
  const transliteration = { а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y', к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f', х:'kh', ц:'ts', ч:'ch', ш:'sh', щ:'shch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya' };
  const latin = String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[а-яё]/g, (letter) => transliteration[letter] ?? letter);
  return latin.split(/[^a-z0-9]+/).filter(Boolean);
}
function apiFootballMatch(goalPlayer, squad) {
  const playerName = goalPlayer?.name || goalPlayer?.lineupPlayer || goalPlayer?.displayName || '';
  const goalTokens = nameTokens(playerName);
  if (!goalTokens.length) return null;
  const goalKey = goalTokens.join(' ');
  const goalSorted = [...goalTokens].sort().join(' ');
  const rank = (candidate) => {
    const tokens = nameTokens(candidate?.name);
    if (!tokens.length) return 0;
    const key = tokens.join(' ');
    if (key === goalKey || [...tokens].sort().join(' ') === goalSorted) return 3;
    const abbreviationMatches = (short, long) => short.length >= 2 && short[0].length === 1 && long.length >= 2 &&
      long[0].startsWith(short[0]) && short.slice(1).length > 0 && short.slice(1).every((word) => long.slice(1).includes(word));
    if (abbreviationMatches(tokens, goalTokens) || abbreviationMatches(goalTokens, tokens)) return 2;
    return 0;
  };
  const ranked = squad.map((candidate) => ({ candidate, score: rank(candidate) })).filter((entry) => entry.score > 0);
  const best = Math.max(0, ...ranked.map((entry) => entry.score));
  const matches = ranked.filter((entry) => entry.score === best);
  return matches.length === 1 ? matches[0].candidate : null;
}
async function apiFootballSquad(goalTeamId) {
  if (!API_FOOTBALL_API_KEY) return null;
  const apiTeamId = API_FOOTBALL_TEAM_IDS_BY_GOAL_ID.get(String(goalTeamId));
  if (!apiTeamId) return null;
  await loadPersistentCache();
  const key = String(apiTeamId);
  const cached = persistentCache.teams[key];
  if (cached && Array.isArray(cached.players) && Date.now() - Number(cached.fetchedAt || 0) < SQUAD_CACHE_TTL) return cached.players;
  if (apiFootballPendingSquads.has(key)) return apiFootballPendingSquads.get(key);
  const request = (async () => {
    const allowed = await reserveApiFootballRequest();
    if (!allowed) return Array.isArray(cached?.players) ? cached.players : null;
    try {
      const response = await fetch(`${API_FOOTBALL_BASE}/players/squads?team=${encodeURIComponent(apiTeamId)}`, {
        headers: { 'x-apisports-key': API_FOOTBALL_API_KEY, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const errors = payload?.errors;
      if ((Array.isArray(errors) && errors.length) || (errors && typeof errors === 'object' && !Array.isArray(errors) && Object.keys(errors).length)) throw new Error('provider returned an API error');
      const team = Array.isArray(payload?.response) ? payload.response[0] : null;
      if (Number(team?.team?.id) !== Number(apiTeamId)) throw new Error('team ID did not match the configured crosswalk');
      if (!Array.isArray(team?.players)) throw new Error('unexpected squads response');
      const players = team.players.map((player) => ({
        id: String(player?.id || ''),
        name: String(player?.name || '').trim(),
        number: player?.number === null || player?.number === undefined ? '' : String(player.number),
        position: String(player?.position || ''),
        photo: approvedUrl(player?.photo, 'media.api-sports.io')
      })).filter((player) => player.id && player.name && player.photo);
      persistentCache.teams[key] = { fetchedAt: Date.now(), players };
      await savePersistentCache();
      return players;
    } catch (error) {
      console.warn('API-Football squad fallback unavailable for team', key, error.message);
      return Array.isArray(cached?.players) ? cached.players : null;
    }
  })();
  apiFootballPendingSquads.set(key, request);
  try { return await request; }
  finally { apiFootballPendingSquads.delete(key); }
}
async function validateApiFootballPhoto(player) {
  const id = String(player?.id || '');
  const expectedUrl = `https://media.api-sports.io/football/players/${id}.png`;
  const url = approvedUrl(player?.photo, 'media.api-sports.io');
  if (!/^\d+$/.test(id) || !url) return { ok: false, hash: '', reason: 'invalid-url' };
  let parsed;
  try { parsed = new URL(url); } catch { return { ok: false, hash: '', reason: 'invalid-url' }; }
  if (parsed.pathname !== `/football/players/${id}.png`) return { ok: false, hash: '', reason: 'invalid-url' };
  await loadPersistentCache();
  const cached = persistentCache.portraitChecks[id];
  if (cached && Date.now() - Number(cached.checkedAt || 0) < PORTRAIT_CHECK_TTL) {
    const hash = String(cached.hash || '');
    const reason = String(cached.reason || (API_FOOTBALL_GENERIC_PHOTO_HASHES.has(hash) ? 'generic-silhouette' : cached.ok ? 'ok' : 'unverified'));
    return { ok: Boolean(cached.ok), hash, reason };
  }
  if (apiFootballPendingPortraitChecks.has(id)) return apiFootballPendingPortraitChecks.get(id);
  const check = (async () => {
    let result = { ok: false, hash: '', reason: 'unverified' };
    try {
      const response = await fetch(expectedUrl, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().startsWith('image/')) throw new Error('photo could not be verified');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 2 * 1024 * 1024) throw new Error('photo exceeded size limit');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new Error('photo exceeded size limit');
      const hash = createHash('sha256').update(bytes).digest('hex');
      const generic = API_FOOTBALL_GENERIC_PHOTO_HASHES.has(hash);
      result = { ok: !generic, hash, reason: generic ? 'generic-silhouette' : 'ok' };
    } catch (error) {
      console.warn('API-Football portrait could not be verified for player', id, error.message);
    }
    persistentCache.portraitChecks[id] = { checkedAt: Date.now(), ok: result.ok, hash: result.hash, reason: result.reason };
    await savePersistentCache();
    return result;
  })();
  apiFootballPendingPortraitChecks.set(id, check);
  try { return await check; }
  finally { apiFootballPendingPortraitChecks.delete(id); }
}
async function fallbackAssignments(players, apiSquad) {
  const assignments = new Map();
  const stats = { configured: Boolean(API_FOOTBALL_API_KEY), attempted: false, applied: 0, rejectedPhotos: 0, rejectedSilhouettes: 0, rejectedDuplicateImages: 0, unmatched: 0 };
  if (!Array.isArray(players) || !players.length || !Array.isArray(apiSquad) || !apiSquad.length) return { assignments, stats };
  stats.attempted = true;
  const candidates = [];
  for (const player of players) {
    if (goalPortraitOf(player)) continue;
    const match = apiFootballMatch(player, apiSquad);
    if (match) candidates.push({ player, match });
    else stats.unmatched += 1;
  }
  const uniqueMatches = new Map(candidates.map(({ match }) => [String(match.id), match]));
  const checks = await Promise.all([...uniqueMatches.values()].map(async (match) => ({ match, check: await validateApiFootballPhoto(match) })));
  const checkById = new Map(checks.map(({ match, check }) => [String(match.id), check]));
  const hashCounts = new Map();
  for (const { check } of checks) if (check.ok && check.hash) hashCounts.set(check.hash, (hashCounts.get(check.hash) || 0) + 1);
  for (const { player, match } of candidates) {
    const check = checkById.get(String(match.id)) || { ok: false, hash: '', reason: 'unverified' };
    if (!check.ok) {
      stats.rejectedPhotos += 1;
      if (check.reason === 'generic-silhouette') stats.rejectedSilhouettes += 1;
      continue;
    }
    if (check.hash && hashCounts.get(check.hash) > 1) { stats.rejectedPhotos += 1; stats.rejectedDuplicateImages += 1; continue; }
    assignments.set(player, `https://media.api-sports.io/football/players/${match.id}.png`);
  }
  stats.applied = assignments.size;
  return { assignments, stats };
}
async function enrichRoster(teamId, payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : null;
  const baseMeta = { provider: 'API-Football', configured: Boolean(API_FOOTBALL_API_KEY), attempted: false, applied: 0, rejectedPhotos: 0, rejectedSilhouettes: 0, rejectedDuplicateImages: 0, unmatched: 0 };
  if (!rows || !rows.some((player) => !goalPortraitOf(player))) return { payload, meta: baseMeta };
  const squad = await apiFootballSquad(teamId);
  if (!squad) return { payload, meta: { ...baseMeta, attempted: Boolean(API_FOOTBALL_API_KEY), unavailable: true } };
  const { assignments, stats } = await fallbackAssignments(rows, squad);
  const enrichedRows = rows.map((player) => {
    const image = assignments.get(player);
    return image ? { ...player, image, portraitSource: 'API-Football' } : player;
  });
  return { payload: { ...payload, data: enrichedRows }, meta: { ...baseMeta, ...stats } };
}
function mergeFlashscoreRosterWithGoal(flashscorePayload, goalPayload) {
  const flashRows = Array.isArray(flashscorePayload?.data) ? flashscorePayload.data : [];
  const goalRows = Array.isArray(goalPayload?.data) ? goalPayload.data : [];
  const keyOf = (value) => nameTokens(value).sort().join(' ');
  const flashNames = new Set(flashRows.map((player) => keyOf(player?.name)).filter(Boolean));
  const data = flashRows.map((player) => {
    const key = keyOf(player?.name);
    if (!key) return player;
    const matches = goalRows.filter((candidate) => keyOf(candidate?.name || candidate?.lineupPlayer || candidate?.displayName) === key &&
      (!player.number || !candidate.number || String(player.number) === String(candidate.number)));
    if (matches.length !== 1) return player;
    const goal = matches[0];
    const image = goalPortraitOf(goal);
    return {
      ...player,
      number: player.number || goal.number || '',
      age: player.age ?? goal.age ?? null,
      type: player.type || goal.type || goal.position || '',
      playerPosition: player.playerPosition || goal.playerPosition || goal.position || '',
      image: player.image || image,
      portraitSource: player.image ? 'Flashscore' : image ? 'GOAL API' : player.portraitSource
    };
  });
  const supplementalNames = new Set();
  for (const goal of goalRows) {
    const name = String(goal?.name || goal?.lineupPlayer || goal?.displayName || '').trim();
    const key = keyOf(name);
    if (!key || flashNames.has(key) || supplementalNames.has(key)) continue;
    supplementalNames.add(key);
    const image = goalPortraitOf(goal);
    const supplemental = {
      ...goal,
      id: String(goal.id || goal.playerId || goal.player_id || `goal-${key.replace(/[^a-z0-9]+/gi, '-')}`),
      name,
      number: goal.number ?? goal.shirtNumber ?? '',
      age: goal.age ?? null,
      type: goal.type || goal.position || '',
      playerPosition: goal.playerPosition || goal.position || ''
    };
    if (image) { supplemental.image = image; supplemental.portraitSource = 'GOAL API'; }
    data.push(supplemental);
  }
  return { ...flashscorePayload, data, supplementalProvider: goalRows.length ? 'GOAL API' : '' };
}
function lineupArrayKey(key) { return /starting|starter|substitut|bench/i.test(String(key || '')); }
function collectLineupPlayers(value, insideLineup = false, output = [], seen = new Set()) {
  if (Array.isArray(value)) { for (const child of value) collectLineupPlayers(child, insideLineup, output, seen); return output; }
  if (!value || typeof value !== 'object') return output;
  const hasName = Boolean(value.name || value.lineupPlayer || value.displayName);
  if (insideLineup && hasName && !seen.has(value)) { seen.add(value); output.push(value); }
  for (const [key, child] of Object.entries(value)) collectLineupPlayers(child, insideLineup || lineupArrayKey(key), output, seen);
  return output;
}
function mapLineupPlayers(value, assignments, profileIds, insideLineup = false) {
  if (Array.isArray(value)) return value.map((child) => mapLineupPlayers(child, assignments, profileIds, insideLineup));
  if (!value || typeof value !== 'object') return value;
  const copy = {};
  for (const [key, child] of Object.entries(value)) copy[key] = mapLineupPlayers(child, assignments, profileIds, insideLineup || lineupArrayKey(key));
  if (insideLineup && assignments.has(value)) {
    copy.image = assignments.get(value);
    copy.portraitSource = 'API-Football';
  }
  if (insideLineup && profileIds.has(value)) {
    copy.profileId = profileIds.get(value);
    copy.portraitPath = flashscorePortraitPath(copy.profileId);
  }
  return copy;
}
async function enrichLineups(payload, fixture) {
  const outer = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) ? payload : null;
  const root = outer ? payload.data : payload;
  if (!root || typeof root !== 'object') return { payload, meta: { configured: Boolean(API_FOOTBALL_API_KEY), applied: 0 } };
  const homeKey = root.home ? 'home' : root.homeTeam ? 'homeTeam' : '';
  const awayKey = root.away ? 'away' : root.awayTeam ? 'awayTeam' : '';
  const sideSpecs = [
    { key: homeKey, teamId: fixture.homeTeamId },
    { key: awayKey, teamId: fixture.awayTeamId }
  ].filter((side) => side.key && side.teamId);
  const allAssignments = new Map();
  const profileIds = new Map();
  const clubPlayers = FLASHSCORE_ENABLED && sideSpecs.some(side => collectLineupPlayers(root[side.key]).length)
    ? await flashscoreSquadPlayers().catch(() => []) : [];
  let applied = 0;
  for (const side of sideSpecs) {
    const lineupPlayers = collectLineupPlayers(root[side.key]);
    const code = FLASH_TEAM_BY_GOAL_ID.get(side.teamId);
    const team = clubPlayers.filter(player => player.t === code);
    for (const player of lineupPlayers) {
      const match = matchSquadPlayer(team, player.name || player.lineupPlayer || player.displayName, player.lineupNumber || player.number);
      if (match && flashscorePortraitPath(match.id)) profileIds.set(player, match.id);
    }
    const missing = lineupPlayers.filter((player) => !goalPortraitOf(player));
    if (!missing.length) continue;
    const squad = await apiFootballSquad(side.teamId);
    if (!squad) continue;
    const { assignments, stats } = await fallbackAssignments(missing, squad);
    for (const [player, url] of assignments) allAssignments.set(player, url);
    applied += stats.applied;
  }
  const nextRoot = mapLineupPlayers(root, allAssignments, profileIds);
  const nextPayload = outer ? { ...payload, data: nextRoot } : nextRoot;
  return { payload: nextPayload, meta: { configured: Boolean(API_FOOTBALL_API_KEY), applied } };
}

function fixtureRowsOf(payload, depth = 0) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object' || depth > 6) return [];
  for (const key of ['fixtures', 'matches', 'items', 'results', 'data']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  for (const key of ['data', 'result', 'response']) {
    const rows = fixtureRowsOf(payload[key], depth + 1);
    if (rows.length) return rows;
  }
  return [];
}

async function seasonFixtureHistory(season, to) {
  const from = `${season}-07-01`;
  const pageSize = 100;
  const pages = [];
  let complete = false;
  for (let page = 0; page < 12; page += 1) {
    const offset = page * pageSize;
    const query = new URLSearchParams({ leagueId: LEAGUE_ID, from, to, limit: String(pageSize), offset: String(offset) }).toString();
    const payload = await goalGet(`/fixtures?${query}`, 5 * 60_000);
    const rows = fixtureRowsOf(payload);
    pages.push(...rows);
    if (rows.length < pageSize) { complete = true; break; }
  }
  return { rows: pages, complete, from, to };
}

async function goalFixtureIdFor(fixtureId, fixture) {
  if (fixture?.provider !== 'Flashscore') return fixtureId;
  if (fixture.goalFixtureId) return fixture.goalFixtureId;
  if (!GOAL_API_KEY) return '';
  const day = dateKeyOf(fixture.kickoffUtc);
  if (!day) return '';
  const query = new URLSearchParams({ leagueId: LEAGUE_ID, from: shiftDay(day, -1), to: shiftDay(day, 1), limit: '100', offset: '0' }).toString();
  const payload = await goalGet(`/fixtures?${query}`, 5 * 60_000);
  const rows = fixtureRowsOf(payload).filter((row) => {
    const teams = teamIdsOfFixture(row);
    return teams.home === fixture.homeTeamId && teams.away === fixture.awayTeamId;
  });
  if (rows.length !== 1) return '';
  fixture.goalFixtureId = String(rows[0].id || rows[0].fixtureId || '');
  knownFixtures.set(fixtureId, fixture);
  return fixture.goalFixtureId;
}

async function goalLineupsFor(fixtureId, fixture) {
  if (!GOAL_API_KEY) return null;
  const goalId = await goalFixtureIdFor(fixtureId, fixture);
  if (!goalId) return null;
  const finished = /FINISHED|COMPLETE|ENDED|FT/.test(fixture.status);
  const farFromKickoff = Date.parse(fixture.kickoffUtc) - Date.now() > 2 * 60 * 60_000;
  const ttl = finished ? 24 * 60 * 60_000 : farFromKickoff ? 10 * 60_000 : 60_000;
  const payload = await goalGet(`/fixtures/${encodeURIComponent(goalId)}/lineups`, ttl);
  const enriched = await enrichLineups(payload, fixture);
  const data = enriched.payload?.data || enriched.payload;
  const next = { ...data };
  for (const side of ['home','away']) {
    const formation = data[side]?.formation || data[side+'Formation'] || fixture[side+'Formation'];
    if(next[side] && globalThis.rplLineupLayout.slots(formation).length===11)
      next[side] = { ...next[side], formation };
  }
  return { ...enriched.payload, data: next, portraitFallback: enriched.meta, provider: 'GOAL API' };
}

function lineupTeamOf(payload, side) {
  const data = payload?.data || payload || {};
  return data[side] || data[`${side}Team`] || {};
}

function hasLineupTeam(team) {
  const starters = team?.startingLineups || team?.starting_lineups ||
    Object.entries(team || {}).find(([key, value]) => Array.isArray(value) && /starting|starter/i.test(key))?.[1];
  return Array.isArray(starters) && starters.length > 0;
}

function canPredict(fixture) {
  return /^(SCHEDULED|NOT.?STARTED|NS|TIMED|UPCOMING|PENDING|TBD)$/i.test(fixture.status) &&
    Date.parse(fixture.kickoffUtc) > Date.now();
}

async function positionalHistory(teamId, players, kickoff) {
  if(!GOAL_API_KEY) return null;
  const code=FLASH_TEAM_BY_GOAL_ID.get(teamId);
  const squad=players.filter(p=>p.t===code);
  const cutoff=new Date(kickoff);
  const seasonStart=Date.UTC(cutoff.getUTCFullYear()-Number(cutoff.getUTCMonth()<6),6,1);
  const fixtures=[...knownFixtures.values()].filter(item=>{
    const time=Date.parse(item.kickoffUtc);
    return time>=seasonStart && time<Date.parse(kickoff) &&
      /^(FINISHED|FT|COMPLETE[D]?|ENDED)$/.test(item.status) &&
      (item.homeTeamId===teamId||item.awayTeamId===teamId) &&
      (item.homeFormation||item.awayFormation);
  }).sort((a,b)=>Date.parse(b.kickoffUtc)-Date.parse(a.kickoffUtc));
  const seen=new Set();
  const history=fixtures.filter(item=>{
    const key=[item.homeTeamId,item.awayTeamId,dateKeyOf(item.kickoffUtc)].join(':');
    if(seen.has(key))return false;
    seen.add(key); return true;
  });
  const key=[teamId,...history.map(item=>item.goalFixtureId||item.id)].join(':');
  if(positionalHistoryCache.get(key)?.until>Date.now())return positionalHistoryCache.get(key).value;
  if(positionalHistoryPending.has(key))return positionalHistoryPending.get(key);
  const task=(async()=>{
    const observations=new Map();
    const formations=history.map(fixture=>fixture[fixture.homeTeamId===teamId?'homeFormation':'awayFormation']).filter(value=>globalThis.rplLineupLayout.slots(value).length===11);
    // At most three upstream requests at once; completed teamsheets are cached by goalGet.
    const sample=history.slice(0,12);
    const teams=[];
    for(let offset=0;offset<sample.length;offset+=3) {
      teams.push(...await Promise.all(sample.slice(offset,offset+3).map(async fixture=>{
        const goalId=fixture.goalFixtureId||(fixture.provider==='GOAL API'?fixture.id:'');
        if(!goalId)return null;
        const side=fixture.homeTeamId===teamId?'home':'away';
        const formation=fixture[side+'Formation'];
        try {
          const data=await goalGet(`/fixtures/${encodeURIComponent(goalId)}/lineups`,24*60*60_000);
          const starters=lineupTeamOf(data,side).startingLineups;
          const placed=globalThis.rplLineupLayout.placement(starters,formation);
          return placed?{placed,formation}:null;
        } catch {return null;}
      })));
    }
    for(const team of teams.filter(Boolean)) {
      for(const player of team.placed) {
        const name=player.name||player.lineupPlayer||'';
        const number=player.lineupNumber||player.number;
        let matched=matchSquadPlayer(squad,name,number);
        if(!matched) {
          // Same club and jersey, with a matching surname or close transliteration.
          const tokens=nameTokens(name);
          const nearby=squad.filter(p=>number!=null&&String(p.no)===String(number)&&
            nameTokens(p.n).some(token=>tokens.some(other=>token===other ||
              (token.length>4&&other.length===token.length&&[...token].filter((c,i)=>c!==other[i]).length===1))));
          if(nearby.length===1)matched=nearby[0];
        }
        if(!matched)continue;
        if(!observations.has(matched.id))observations.set(matched.id,new Map());
        const counts=observations.get(matched.id);
        counts.set(player.tacticalRole,(counts.get(player.tacticalRole)||0)+1);
      }
    }
    const value={observations,formations:mostUsedFormations(formations),sampleSize:teams.filter(Boolean).length};
    if(value.sampleSize)positionalHistoryCache.set(key,{value,until:Date.now()+30*60_000});
    return value;
  })().finally(()=>positionalHistoryPending.delete(key));
  positionalHistoryPending.set(key,task);
  return task;
}

async function lineupWithPrediction(payload, fixture) {
  if (!canPredict(fixture) || !FLASHSCORE_ENABLED) return payload;
  const missing = ['home', 'away'].filter(side => !hasLineupTeam(lineupTeamOf(payload, side)));
  if (!missing.length) return payload;
  const players = await flashscoreSquadPlayers().catch(() => []);
  const prediction = { provider: 'Flashscore', basis: 'season-league-minutes' };
  await Promise.all(missing.map(async side=>{
    const teamId=fixture[side+'TeamId'];
    const teamCode=fixture[side==='home'?'flashscoreHomeCode':'flashscoreAwayCode']||FLASH_TEAM_BY_GOAL_ID.get(teamId);
    const history=await positionalHistory(teamId,players,fixture.kickoffUtc).catch(()=>null);
    const positioned=history?.sampleSize ? predictPositionedLineup(players,teamCode,history.formations,history.observations):null;
    if(positioned)prediction[side]={...positioned,positionHistoryMatches:history.sampleSize};
    else {
      const team=predictFlashscoreLineup(players,teamCode,history?.formations||[]);
      if(team)prediction[side]={...team,positionsUnavailable:true};
    }
  }));
  return prediction.home||prediction.away ? {...(payload||{data:{}}),prediction}:payload;
}

async function goalMatchDataFor(fixtureId, fixture, resource, ttl) {
  if (!GOAL_API_KEY) return null;
  const goalId = await goalFixtureIdFor(fixtureId, fixture);
  if (!goalId) return null;
  if (resource !== 'events') return goalGet(`/fixtures/${encodeURIComponent(goalId)}/${resource}`, ttl);
  // The events endpoint can contain only goals. Cards and substitutions also live on the full fixture.
  const [eventResult, detailResult] = await Promise.allSettled([
    goalGet(`/fixtures/${encodeURIComponent(goalId)}/events`, ttl),
    goalGet(`/fixtures/${encodeURIComponent(goalId)}`, ttl)
  ]);
  if (eventResult.status === 'rejected' && detailResult.status === 'rejected') throw eventResult.reason;
  const detail = detailResult.status === 'fulfilled' ? detailResult.value?.data || detailResult.value : {};
  const context = { homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, ...detail };
  const { eventRecords } = globalThis.rplMatchInsights;
  const rows = eventRecords({ events: [
    ...eventRecords(eventResult.status === 'fulfilled' ? eventResult.value : [], context),
    ...eventRecords(detail, context)
  ] }, context);
  if (FLASHSCORE_ENABLED && rows.some(row => row.playerId || row.playerInId || row.playerOutId)) {
    const players = await flashscoreSquadPlayers().catch(() => []);
    const lineups = Array.isArray(detail.lineups) ? detail.lineups : [];
    const localPlayer = (value, id, side) => {
      const name = typeof value === 'string' ? value : value?.name || '';
      if (!name || !side) return value;
      const lineup = lineups.find(row => row.team === side && String(row.playerKey || row.playerId) === String(id));
      const squad = players.filter(row => row.t === FLASH_TEAM_BY_GOAL_ID.get(fixture[side+'TeamId']));
      const fullName = lineup?.lineupPlayer || name;
      const exact = matchSquadPlayer(squad, fullName, lineup?.lineupNumber);
      const tokens = nameTokens(fullName).filter(token => token.length >= 4);
      const surnameMatches = squad.filter(row => (!lineup?.lineupNumber || String(row.no) === String(lineup.lineupNumber)) && nameTokens(row.n).some(token => tokens.includes(token)));
      const matched = exact || (surnameMatches.length === 1 ? surnameMatches[0] : null);
      return matched ? { name: matched.n, id: matched.id } : value;
    };
    for (const row of rows) for (const key of ['player','assist','playerIn','playerOut']) row[key] = localPlayer(row[key], row[key+'Id'], row.side);
  }
  return { data: rows, fixtureId: goalId, count: rows.length, completeChronology: Array.isArray(detail.cards) && Array.isArray(detail.substitutions) };
}
function sourcedPayload(payload, provider) {
  if (Array.isArray(payload)) return { data: payload, provider };
  if (payload && typeof payload === 'object') return { ...payload, provider: payload.provider || provider };
  return { data: payload, provider };
}

async function flashscorePlayerDetail(id) {
  const saved = playerDetails.get(id);
  if (saved?.until > Date.now()) return saved.value;
  if (!playerDetailPending.has(id)) {
    const pending = flashscoreGet(`/api/player/${id}`).then(value => {
      if (value?.id !== id) throw new Error('Player identity did not match');
      playerDetails.set(id, { value, until: Date.now() + 30 * 60_000 });
      return value;
    }).finally(() => playerDetailPending.delete(id));
    playerDetailPending.set(id, pending);
  }
  return playerDetailPending.get(id);
}

function rememberLineupPlayers(payload, fixture) {
  for (const side of ['home', 'away']) {
    const teamId = fixture[`${side}TeamId`];
    for (const player of collectLineupPlayers(lineupTeamOf(payload, side))) {
      if (!flashscorePortraitPath(player.id)) continue;
      if (!knownLineupPlayers.has(player.id)) knownLineupPlayers.set(player.id, new Set());
      knownLineupPlayers.get(player.id).add(teamId);
    }
  }
  return payload;
}

function matchSquadPlayer(team, name, number) {
  const candidates = team.filter(player => !number || player.no == null || String(player.no) === String(number))
    .map(player => ({ name: player.n, player }));
  return apiFootballMatch({ name }, candidates)?.player;
}

async function playerProfile(teamId, url) {
  const code = FLASH_TEAM_BY_GOAL_ID.get(teamId);
  const id = url.searchParams.get('id') || '';
  const name = (url.searchParams.get('name') || '').slice(0, 120);
  const number = url.searchParams.get('number') || '';
  const squad = await flashscoreSquadPlayers().catch(() => null);
  const team = (squad || []).filter(player => player.t === code);
  let row = team.find(player => player.id === id);
  if (!row && !flashscorePortraitPath(id)) row = matchSquadPlayer(team, name, number);
  const playerId = row?.id || (knownLineupPlayers.get(id)?.has(teamId) ? id : '');
  if (!playerId) {
    if (!squad) throw new Error('Squads unavailable');
    return null;
  }
  const detail = await flashscorePlayerDetail(playerId).catch(() => null);
  const competitionRows = Array.isArray(detail?.career) ? detail.career : [];
  const today = moscowDay();
  const start = Number(today.slice(0, 4)) - Number(today.slice(5, 7) < '07');
  const season = `${start}/${start + 1}`;
  const league = row ? playerSeasonStats(row.lg) : null;
  const all = row ? playerSeasonStats(row.tot) : null;
  const currentLeague = competitionRows.find(item => item.rpl && item.teamCode === code && item.season === season);
  return {
    id: playerId, name: detail?.n || row?.n || '',
    number: row?.no ?? null, age: row?.age ?? detail?.age ?? null,
    nationality: row?.nat || '', birthDate: detail?.dob || '',
    marketValue: detail?.val || '', contractUntil: detail?.ct || '',
    photo: detail?.img ? flashscorePortraitPath(playerId) : '',
    season, league: league || currentLeague || null,
    all, rating: currentLeague?.rating ?? null, career: competitionRows,
    careerUnavailable: !detail
  };
}

async function fetchPlayerPhoto(id) {
  if (!playerPhotos.has(id)) {
    const pending = (async () => {
      const detail = await flashscorePlayerDetail(id);
      if (!/^[a-z0-9_-]{1,120}\.(?:png|jpe?g|webp)$/i.test(detail?.img || '')) return null;
      const response = await fetch(`https://static.flashscore.com/res/image/data/${detail.img}`, {
        signal: AbortSignal.timeout(8000), redirect: 'error'
      });
      const type = response.headers.get('content-type');
      if (!response.ok || !/^image\/(?:png|jpeg|webp)$/i.test(type || '')) throw new Error('Player photo unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 512 * 1024) throw new Error('Invalid player photo size');
      return { type, bytes };
    })().catch(error => { playerPhotos.delete(id); throw error; });
    playerPhotos.set(id, pending);
    if (playerPhotos.size > 100) playerPhotos.delete(playerPhotos.keys().next().value);
  }
  return playerPhotos.get(id);
}

function rosterMapForFixture(players, fixture) {
  const home = flashscoreRosterById(players, fixture.flashscoreHomeCode);
  const away = flashscoreRosterById(players, fixture.flashscoreAwayCode);
  return new Map([...home, ...away]);
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  // The existing application uses inline scripts/styles and image handlers.
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'");
  if (releaseIssues(release).length) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return send(res, 400, { error: 'Bad request' }); }
  if (!['GET', 'HEAD'].includes(req.method)) return send(res, 405, { error: 'Method not allowed' }, undefined, { Allow: 'GET, HEAD' });
  if (legalRoutes.includes(url.pathname)) return send(res, 200, renderLegalPage(url.pathname, release), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' });
  if (url.pathname === '/healthz') return send(res, 200, { status: 'ok', version: release.version });
  if (url.pathname === '/robots.txt') return send(res, 200, releaseIssues(release).length ? 'User-agent: *\nDisallow: /\n' : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${release.publicUrl}/sitemap.xml\n`, 'text/plain; charset=utf-8');
  if (url.pathname === '/sitemap.xml') {
    if (releaseIssues(release).length) return send(res, 404, { error: 'Public release is not configured' });
    const locations = ['/', ...legalRoutes].map(route => `<url><loc>${release.publicUrl}${route}</loc></url>`).join('');
    return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locations}</urlset>`, 'application/xml; charset=utf-8');
  }
  if (url.pathname === '/api/status') return send(res, 200, {
    configured: Boolean(FLASHSCORE_ENABLED || GOAL_API_KEY), provider: FLASHSCORE_ENABLED ? 'Flashscore' : 'GOAL API',
    fallbackProvider: GOAL_API_KEY ? 'GOAL API' : '', goalApiConfigured: Boolean(GOAL_API_KEY), flashscoreProxyEnabled: FLASHSCORE_ENABLED, leagueId: LEAGUE_ID,
    season: process.env.GOAL_RPL_SEASON || '2026',
    portraitFallbackConfigured: Boolean(API_FOOTBALL_API_KEY), portraitFallbackProvider: 'API-Football'
  });
  if (url.pathname === '/api/live-stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    liveStreamClients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(goalLiveState)}\n\n`);
    const heartbeat = setInterval(() => { if (!res.destroyed) res.write(': ping\n\n'); }, 25_000);
    res.on('close', () => { clearInterval(heartbeat); liveStreamClients.delete(res); });
    return;
  }
  if (url.pathname === '/api/rpl') {
    const season = url.searchParams.get('season') || process.env.GOAL_RPL_SEASON || '2026';
    if (!/^20\d{2}$/.test(season)) return send(res, 400, { error: 'Season must be a four-digit year' });
    const today = moscowDay();
    const to = shiftDay(today, 30);
    const flashscorePromise = FLASHSCORE_ENABLED
      ? flashscoreGet('/api/season').then((payload) => flashscoreSeasonPayload(payload, season)).catch((error) => { console.warn('Flashscore data unavailable:', error.message); return null; })
      : Promise.resolve(null);
    const goalPromise = GOAL_API_KEY ? (async () => {
      const query = new URLSearchParams({ leagueId: LEAGUE_ID, from: today, to: today, limit: '100', offset: '0' });
      const results = await Promise.allSettled([
        seasonFixtureHistory(season, to),
        goalGet(`/leagues/${encodeURIComponent(LEAGUE_ID)}/standings?season=${encodeURIComponent(season)}`, 15 * 60_000),
        goalGet(`/fixtures?${query}`, 15_000)
      ]);
      const [historyResult, standingsResult, todayResult] = results;
      for (const result of results) if (result.status === 'rejected') console.warn('GOAL API supplemental data unavailable:', result.reason.message);
      if (results.every(result => result.status === 'rejected')) return null;
      const current = todayResult.status === 'fulfilled' ? fixtureRowsOf(todayResult.value) : [];
      const history = historyResult.status === 'fulfilled' ? historyResult.value : { rows: [], complete: false, from: `${season}-07-01`, to };
      const rows = new Map(history.rows.map(row => [String(row.id || row.fixtureId), row]));
      for (const row of current) rows.set(String(row.id || row.fixtureId), row);
      return { history: { ...history, rows: [...rows.values()] }, current, standings: standingsResult.status === 'fulfilled' ? standingsResult.value : null };
    })() : Promise.resolve(null);
    const [flashscore, goalData] = await Promise.all([flashscorePromise, goalPromise]);
    if (flashscore) {
      const fixtures = flashscore.fixtures;
      const standings = goalData?.standings || flashscore.standings;
      if (goalData) {
        mergeGoalFixtures(fixtures.data, goalData.history.rows, goalData.current);
        rememberFixtures({ data: goalData.history.rows, provider: 'GOAL API' });
        syncGoalLiveSocket(goalData.history.rows);
      } else syncGoalLiveSocket([]);
      rememberFixtures({ ...fixtures, provider: 'Flashscore' });
      rememberStandingsTeams(standings);
      return send(res, 200, {
        ...flashscore, fixtures, standings, provider: 'Flashscore',
        standingsProvider: goalData?.standings ? 'GOAL API' : 'Flashscore', supplementalProvider: goalData ? 'GOAL API' : '',
        leagueId: LEAGUE_ID, range: { from: `${season}-07-01`, to },
        fixtureHistoryComplete: flashscore.fixtureHistoryComplete,
        fetchedAt: new Date().toISOString()
      });
    }
    if (!goalData?.standings) return send(res, 502, { error: 'Flashscore proxy недоступен, а GOAL API не настроен или не ответил' });
    const fixtures = { data: goalData.history.rows };
    rememberFixtures({ ...fixtures, provider: 'GOAL API' });
    rememberStandingsTeams(goalData.standings);
    syncGoalLiveSocket(goalData.history.rows);
    return send(res, 200, { fixtures, standings: goalData.standings, provider: 'GOAL API', leagueId: LEAGUE_ID, season, range: { from: goalData.history.from, to: goalData.history.to }, fixtureHistoryComplete: goalData.history.complete, fetchedAt: new Date().toISOString() });
  }
  const portraitMatch = url.pathname.match(/^\/api\/player-portraits\/([a-z0-9-]{1,100}\/[a-z0-9]{8})$/i);
  if (portraitMatch) {
    const id = portraitMatch[1];
    if (!FLASHSCORE_ENABLED) return send(res, 404, { error: 'Portrait unavailable' });
    try {
      if (!knownLineupPlayers.has(id) && !(await flashscoreSquadPlayers()).some(player => player.id === id)) {
        return send(res, 404, { error: 'Unknown player' });
      }
      const photo = await fetchPlayerPhoto(id);
      return photo ? send(res, 200, photo.bytes, photo.type, { 'Cache-Control': 'public, max-age=86400' })
        : send(res, 404, { error: 'Portrait unavailable' }, undefined, { 'Cache-Control': 'public, max-age=1800' });
    } catch { return send(res, 502, { error: 'Не удалось загрузить портрет' }); }
  }
  const playerMatch = url.pathname.match(/^\/api\/teams\/([a-zA-Z0-9_-]{1,64})\/player$/);
  if (playerMatch) {
    if (!FLASHSCORE_ENABLED || !FLASH_TEAM_BY_GOAL_ID.has(playerMatch[1])) return send(res, 404, { error: 'Player stats unavailable' });
    try {
      const profile = await playerProfile(playerMatch[1], url);
      return profile ? send(res, 200, profile) : send(res, 404, { error: 'Unknown player' });
    } catch { return send(res, 502, { error: 'Не удалось загрузить профиль игрока' }); }
  }
  const rosterMatch = url.pathname.match(/^\/api\/teams\/([a-zA-Z0-9_-]{1,64})\/players$/);
  if (rosterMatch) {
    const teamId = rosterMatch[1];
    if (!knownTeams.has(teamId)) return send(res, 404, { error: 'Unknown RPL team' });
    const flashscoreTeamCode = FLASH_TEAM_BY_GOAL_ID.get(teamId);
    if (FLASHSCORE_ENABLED && flashscoreTeamCode) {
      try {
        const proxyRoster = flashscoreRoster(await flashscoreSquadPlayers(), flashscoreTeamCode);
        let merged = proxyRoster;
        if (GOAL_API_KEY) {
          try {
            const goalRoster = await goalGet(`/teams/${encodeURIComponent(teamId)}/players`, 6 * 60 * 60_000);
            merged = mergeFlashscoreRosterWithGoal(proxyRoster, goalRoster);
          } catch (error) { console.warn('GOAL API roster supplement unavailable:', error.message); }
        }
        const enriched = await enrichRoster(teamId, merged);
        return send(res, 200, { ...enriched.payload, portraitFallback: enriched.meta, provider: 'Flashscore' });
      } catch (error) { console.warn('Flashscore roster unavailable:', error.message); }
    }
    if (!GOAL_API_KEY) return send(res, 502, { error: 'Flashscore roster unavailable and GOAL API is not configured' });
    try {
      const payload = await goalGet(`/teams/${encodeURIComponent(teamId)}/players`, 6 * 60 * 60_000);
      const enriched = await enrichRoster(teamId, payload);
      return send(res, 200, { ...enriched.payload, portraitFallback: enriched.meta, provider: 'GOAL API' });
    } catch (error) {
      console.error('GOAL API roster request failed:', error.message);
      return send(res, 502, { error: 'Не удалось загрузить состав команды', status: error.status || 502 });
    }
  }
  const lineupMatch = url.pathname.match(/^\/api\/fixtures\/([a-zA-Z0-9_-]{1,64})\/lineups$/);
  if (lineupMatch) {
    const fixtureId = lineupMatch[1];
    const fixture = knownFixtures.get(fixtureId);
    if (!fixture) return send(res, 404, { error: 'Unknown RPL fixture' });
    let flashscoreLineups = null;
    if (fixture.provider === 'Flashscore' && FLASHSCORE_ENABLED) {
      try {
        const [matchPayload, players] = await Promise.all([
          flashscoreGet(`/api/match/${encodeURIComponent(fixture.flashscoreMatchId || fixtureId)}`),
          flashscoreSquadPlayers().catch(() => [])
        ]);
        flashscoreLineups = flashscoreMatchLineups(matchPayload, fixture, rosterMapForFixture(players, fixture));
        if (hasLineupTeam(lineupTeamOf(flashscoreLineups, 'home')) &&
            hasLineupTeam(lineupTeamOf(flashscoreLineups, 'away'))) return send(res, 200, rememberLineupPlayers(flashscoreLineups, fixture));
      } catch (error) { console.warn('Flashscore lineups unavailable:', error.message); }
    }
    const goalPayload = await goalLineupsFor(fixtureId, fixture).catch(error => {
      console.warn('GOAL API lineup fallback failed:', error.message);
      return null;
    });
    let payload = goalPayload || flashscoreLineups;
    if (goalPayload && flashscoreLineups) {
      const sides = ['home', 'away'];
      const useFlash = side => hasLineupTeam(lineupTeamOf(flashscoreLineups, side));
      if (sides.some(useFlash)) {
        const data = Object.fromEntries(sides.map(side => [side, lineupTeamOf(useFlash(side) ? flashscoreLineups : goalPayload, side)]));
        payload = { data, provider: sides.some(side => !useFlash(side) && hasLineupTeam(data[side])) ? 'Flashscore + GOAL API' : 'Flashscore' };
      }
    }
    payload = await lineupWithPrediction(payload, fixture);
    if (payload) return send(res, 200, rememberLineupPlayers(payload, fixture));
    return send(res, GOAL_API_KEY ? 502 : 503, { error: 'Не удалось загрузить составы матча' });
  }
  const matchDataRoute = url.pathname.match(/^\/api\/fixtures\/([a-zA-Z0-9_-]{1,64})\/(events|statistics)$/);
  if (matchDataRoute) {
    const fixtureId = matchDataRoute[1];
    const resource = matchDataRoute[2];
    const fixture = knownFixtures.get(fixtureId);
    if (!fixture) return send(res, 404, { error: 'Unknown RPL fixture' });
    const status = String(fixture.status || '').toUpperCase();
    const finished = /FINISHED|COMPLETE|ENDED|FT/.test(status);
    const live = /LIVE|PLAY|IN.?PROGRESS|1H|2H|HALF.?TIME|HT/.test(status);
    const ttl = finished ? 5 * 60_000 : live ? 15_000 : 10 * 60_000;
    let flashscoreData = null, goalData = null;
    if (GOAL_API_KEY) {
      try {
        goalData = await goalMatchDataFor(fixtureId, fixture, resource, ttl);
        const complete = resource === 'events' ? goalData?.completeChronology && goalData?.data?.length : goalData?.data?.match?.fullTime?.length;
        if (complete) return send(res, 200, sourcedPayload(goalData, 'GOAL API'));
      } catch (error) { console.warn(`GOAL API fixture ${resource} supplement unavailable:`, error.message); }
    }
    if (fixture.provider === 'Flashscore' && FLASHSCORE_ENABLED) {
      try {
        const [matchPayload, players] = await Promise.all([
          flashscoreGet(`/api/match/${encodeURIComponent(fixture.flashscoreMatchId || fixtureId)}`),
          flashscoreSquadPlayers().catch(() => [])
        ]);
        const rosterById = rosterMapForFixture(players, fixture);
        flashscoreData = resource === 'events'
          ? flashscoreMatchEvents(matchPayload, fixture, rosterById)
          : flashscoreMatchStatistics(matchPayload);
        if (Array.isArray(flashscoreData.data) && flashscoreData.data.length) return send(res, 200, flashscoreData);
      } catch (error) { console.warn(`Flashscore fixture ${resource} unavailable:`, error.message); }
    }
    try {
      const payload = goalData || await goalMatchDataFor(fixtureId, fixture, resource, ttl);
      if (payload) return send(res, 200, sourcedPayload(payload, 'GOAL API'));
      if (flashscoreData) return send(res, 200, flashscoreData);
      if (!GOAL_API_KEY) return send(res, 503, { error: `No ${resource} provider is available` });
      return send(res, 502, { error: 'GOAL API fixture match ID could not be matched' });
    } catch (error) {
      console.error(`GOAL API fixture ${resource} request failed:`, error.message);
      return send(res, 502, { error: resource === 'events' ? 'Не удалось загрузить события матча' : 'Не удалось загрузить статистику матча', status: error.status || 502 });
    }
  }
  const file = resolvePath(url.pathname);
  if (!file) return send(res, 403, { error: 'Forbidden' });
  try {
    const info = await stat(file); if (!info.isFile()) return send(res, 404, { error: 'Not found' });
    const body = await readFile(file); const ext = path.extname(file).toLowerCase();
    return send(res, 200, body, MIME[ext] || 'application/octet-stream', { 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  } catch { return send(res, 404, { error: 'Not found' }); }
});
startFlashscoreProxy();
server.on('close', stopFlashscoreProxy);
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`КРОМКА ${release.version} is running on http://0.0.0.0:${PORT}`);
  console.log(`Flashscore proxy: ${FLASHSCORE_ENABLED ? 'enabled' : 'disabled'}`);
  console.log(`GOAL API fallback/supplement: ${GOAL_API_KEY ? 'configured (key hidden)' : 'not configured'}`);
  console.log(`API-Football portrait fallback: ${API_FOOTBALL_API_KEY ? 'configured (key hidden)' : 'not configured'}`);
});
