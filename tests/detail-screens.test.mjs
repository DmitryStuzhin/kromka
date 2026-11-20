import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const details = readFileSync(new URL('../assets/detail-screens.js', import.meta.url), 'utf8');
const detailsCss = readFileSync(new URL('../assets/detail-screens.css', import.meta.url), 'utf8');
const chronology = readFileSync(new URL('../assets/match-chronology.js', import.meta.url), 'utf8');
const dataCss = readFileSync(new URL('../assets/detail-data.css', import.meta.url), 'utf8');
const goal = readFileSync(new URL('../goal-data.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');

test('match detail compares current-season table fields and only counts finished recent results', () => {
  assert.match(details, /item\.status === 'finished'.*scoreOf\(item\)/);
  assert.match(details, /compareMatchTimes\(b,a\)/);
  assert.match(details, /rows\.slice\(0, 5\)/);
  for (const label of ['Сезон команд', 'Очки', 'Матчи', 'Победы · ничьи · поражения', 'Забито · пропущено', 'Разница мячей', 'Голов за матч']) assert.ok(details.includes(label));
  assert.match(details, /Место и общие показатели — из таблицы сезона/);
  assert.match(details, /match\.status !== 'soon' \? .*Статистика матча/);
});

test('match flow and figures use a chronological timeline and symmetric two-team scales', () => {
  assert.match(chronology, /class="match-chronology"/);
  assert.match(chronology, /entries\.sort/);
  assert.match(details, /class="match-stats-legend"/);
  assert.match(details, /class="match-stat-bars"/);
  assert.match(details, /class="season-duel-bars"/);
  assert.match(details, /record\(homeSplits\?\.home\), record\(awaySplits\?\.home\)/);
  assert.match(details, /record\(homeSplits\?\.away\), record\(awaySplits\?\.away\)/);
  assert.match(dataCss, /\.chronology-row/);
  assert.match(dataCss, /\.chronology-row\.away \{ flex-direction: row-reverse/);
  assert.match(dataCss, /\.match-stat-values/);
});

test('form and lineup states do not invent results or unpublished starting elevens', () => {
  assert.match(details, /match\.status === 'soon' && !eventCount \? 'disabled/);
  assert.match(details, /В этом сезоне таких матчей пока нет/);
  assert.match(goal, /teamLineupMarkup\(projected, key, '', true\)/);
  assert.doesNotMatch(goal, /safe\(p\.minutes\)/);
  assert.match(html, /demo-krasnodar-cska-20261107[^\n]*dateKey:'2026-11-07'[^\n]*score:'19:30'/);
  assert.match(html, /Кромка · Загружаем матчи/);
});

test('timeline event count uses Russian plural forms for teen and ending digits', () => {
  assert.match(details, /eventCountMod100 = eventCount % 100/);
  assert.match(details, /eventCountMod10 = eventCount % 10/);
  assert.match(details, /eventCountMod100 >= 11 && eventCountMod100 <= 14 \? 'событий'/);
  assert.match(details, /eventCountMod10 === 1 \? 'событие' : eventCountMod10 >= 2 && eventCountMod10 <= 4 \? 'события' : 'событий'/);
});

test('player cards in GOAL rosters and lineups expose only provider fields to the profile route', () => {
  assert.match(goal, /data-player-profile data-player-name=/);
  assert.match(goal, /data-player-number=/);
  assert.match(goal, /data-player-position=/);
  assert.match(goal, /data-player-photo=/);
  assert.match(goal, /data-player-team=/);
  assert.match(goal, /data-player-id=/);
  assert.match(details, /new URLSearchParams\(\{ id: player.id/);
});

test('season fixture history uses July-to-next-month range, 100-item pages, and reports capped history', () => {
  assert.match(server, /const from = `\$\{season\}-07-01`/);
  assert.match(server, /const pageSize = 100/);
  assert.match(server, /offset: String\(offset\)/);
  assert.match(server, /for \(let page = 0; page < 12; page \+= 1\)/);
  assert.match(server, /fixtureHistoryComplete: goalData\.history\.complete/);
  assert.match(server, /fixtureHistoryComplete: flashscore\.fixtureHistoryComplete/);
  assert.match(goal, /payload\.fixtureHistoryComplete !== false/);
});

test('match insight endpoints accept only fixtures loaded from the RPL calendar and use status-aware TTLs', () => {
  assert.match(server, /matchDataRoute = url\.pathname\.match\(\/\^\\\/api\\\/fixtures/);
  assert.match(server, /\(events\|statistics\)/);
  assert.match(server, /const fixture = knownFixtures\.get\(fixtureId\)/);
  assert.match(server, /if \(!fixture\) return send\(res, 404, \{ error: 'Unknown RPL fixture' \}\)/);
  assert.match(server, /const ttl = finished \? 5 \* 60_000 : live \? 15_000 : 10 \* 60_000/);
  assert.match(server, /goalMatchDataFor\(fixtureId, fixture, resource, ttl\)/);
  assert.match(server, /goalGet\(`\/fixtures\/\$\{encodeURIComponent\(goalId\)\}\/\$\{resource\}`, ttl\)/);
  assert.match(html, /assets\/goal-insights\.js/);
  assert.match(worker, /assets\/goal-insights\.js/);
});

test('detail navigation is linked, keyboard-focusable, and included in the PWA app shell', () => {
  assert.match(html, /assets\/detail-screens\.js/);
  assert.match(html, /assets\/detail-screens\.css/);
  assert.match(html, /assets\/detail-data\.css\?v=football-goal-20261120/);
  for (const id of ['matchLineupsSection', 'season-comparison', 'match-form', 'match-events', 'match-statistics']) assert.ok(details.includes(id));
  assert.match(detailsCss, /\.detail-page button:focus-visible/);
  assert.match(worker, /assets\/detail-data\.css\?v=football-goal-20261120/);
  assert.match(worker, /assets\/detail-screens\.css/);
  assert.match(worker, /assets\/detail-screens\.js/);
});

test('GOAL mode renders the live pages and preserves provider ranking order on ties', () => {
  assert.match(html, /today:window\.home\|\|home,matches:window\.matchesPage\|\|matchesPage/);
  assert.match(goal, /const newTable = tableRows\.map\(standing\);/);
  assert.doesNotMatch(goal, /tableRows\.map\(standing\)\.sort\(\(a, b\) => b\[6\] - a\[6\]\)/);
});
