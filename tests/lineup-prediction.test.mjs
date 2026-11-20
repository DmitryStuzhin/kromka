import test from 'node:test';
import assert from 'node:assert/strict';
import { mostUsedFormations, predictFlashscoreLineup } from '../flashscore-adapter.mjs';

const player = (id, p, minutes, t = 'zen') => ({
  id, p, t, n: id, lg: [8, minutes], tot: [25, 3000]
});
const roster = [
  player('g1', 'GK', 420), player('g2', 'GK', 970),
  ...[100, 900, 300, 700, 600].map((m, i) => player('d' + i, 'DF', m)),
  ...[200, 800, 950, 400].map((m, i) => player('m' + i, 'MF', m)),
  ...[500, 640, 368].map((m, i) => player('f' + i, 'FW', m))
];

test('forecast ranks each position by current club league minutes only', () => {
  const result = predictFlashscoreLineup([...roster, player('wrong-club', 'GK', 1230, 'din'),
    player('cup-only', 'DF', null), player('d1', 'DF', 10), player('unknown-position', '?', 1200)], 'zen');
  assert.equal(result.formation, '4-3-3');
  assert.deepEqual(result.startingLineups.map(p => p.id), ['g2','d1','d3','d4','d2','m2','m1','m3','f1','f0','f2']);
  assert.equal(result.startingLineups[0].minutes, 970);
});

test('forecast adapts to the available positions or returns no incomplete eleven', () => {
  const shortAttack = roster.filter(p => p.id !== 'f2');
  assert.equal(predictFlashscoreLineup(shortAttack, 'zen').formation, '4-4-2');
  assert.equal(predictFlashscoreLineup(shortAttack.filter(p => p.p !== 'GK'), 'zen'), null);
});

test('forecast chooses the most frequent eligible shape, retaining separate midfield lines', () => {
  const preferences = mostUsedFormations(['4-3-3', '4-2-3-1', '4-4-2', '4-2-3-1', '1-2-3']);
  assert.deepEqual(preferences, ['4-2-3-1','4-3-3','4-4-2']);
  const extraMidfielder = player('m4', 'MF', 310);
  const prediction = predictFlashscoreLineup([...roster, extraMidfielder], 'zen', preferences);
  assert.equal(prediction.formation, '4-2-3-1');
  assert.equal(prediction.startingLineups.length, 11);
  assert.equal(predictFlashscoreLineup(roster, 'zen', preferences).formation, '4-3-3');
});
