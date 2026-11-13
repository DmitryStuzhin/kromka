import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/season-analytics.js';

const analytics = globalThis.rplSeasonAnalytics;
const fixtures = [
  { id: 'one', status: 'finished', home: 'zenit', away: 'spartak', score: '2 : 0', dateKey: '2026-08-10' },
  { id: 'two', status: 'finished', home: 'spartak', away: 'zenit', score: '1–1', dateKey: '2026-09-10' },
  { id: 'three', status: 'live', home: 'zenit', away: 'spartak', score: '3 : 0', dateKey: '2026-10-10' },
  { id: 'four', status: 'soon', home: 'zenit', away: 'cska', score: '19:00', dateKey: '2026-12-10' },
  { id: 'five', status: 'finished', home: 'cska', away: 'zenit', score: '0 : 1', dateKey: '2026-10-20' },
  { id: 'bad-score', status: 'finished', home: 'zenit', away: 'cska', score: '—', dateKey: '2026-10-25' }
];

test('season records and home/away splits use only completed fixtures with a parseable score', () => {
  const result = analytics.teamSplits(fixtures, 'zenit');
  assert.deepEqual(result.total, { played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 4, goalsAgainst: 1, cleanSheets: 2, points: 7 });
  assert.deepEqual(result.home, { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 0, cleanSheets: 1, points: 3 });
  assert.deepEqual(result.away, { played: 2, won: 1, drawn: 1, lost: 0, goalsFor: 2, goalsAgainst: 1, cleanSheets: 1, points: 4 });
  assert.deepEqual(result.matches.map((match) => match.id), ['five', 'two', 'one']);
});

test('head-to-head honours the selected team order and excludes live, upcoming and invalid scores', () => {
  const result = analytics.headToHead(fixtures, 'zenit', 'spartak');
  assert.deepEqual(result.summary, { first: 1, draws: 1, second: 0, goalsFirst: 3, goalsSecond: 1 });
  assert.deepEqual(result.matches.map((match) => match.id), ['two', 'one']);
});

test('score parsing rejects non-finished and placeholder results', () => {
  assert.deepEqual(analytics.scoreOf(fixtures[0]), [2, 0]);
  assert.equal(analytics.scoreOf(fixtures[2]), null);
  assert.equal(analytics.scoreOf(fixtures[3]), null);
  assert.equal(analytics.scoreOf(fixtures[5]), null);
  assert.deepEqual(analytics.teamSplits([], 'zenit').total, { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, points: 0 });
});
