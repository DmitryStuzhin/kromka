import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/goal-insights.js';

const insights = globalThis.rplMatchInsights;

test('event normalization accepts nested GOAL-style payloads and escapes rendered text', () => {
  const rows = insights.normalizeEventsPayload({ data: { events: [
    { minute: 17, type: { name: 'Гол' }, player: { name: 'Иван' }, team: { name: 'Зенит & Ко' }, description: 'Гол & ассист' },
    { time: { elapsed: 64 }, description: '<b>Пенальти</b>', club: { name: 'Спартак' } }
  ] } });
  assert.deepEqual(rows, [
    ['17′', 'Гол &amp; ассист', 'Зенит &amp; Ко'],
    ['64′', 'Пенальти', 'Спартак']
  ]);
});

test('stat normalization preserves provider formatting, parses comparison values, and drops incomplete rows', () => {
  const rows = insights.normalizeStatsPayload({ response: { statistics: [
    { name: 'Владение', values: [{ team: 'home', value: '58%' }, { team: 'away', value: '42%' }] },
    { type: { name: 'Удары' }, data: { home: { value: 13 }, away: { value: 8 } } },
    { name: 'Передачи', home: '78% (331/420)', away: '79% (339/432)' },
    { name: 'Дробный показатель', home: '1,25', away: '0.87' },
    { name: 'Нули', home: '0', away: '0' },
    { name: 'Без парного значения', home: 4, away: '—' },
    { name: 'Неизвестное значение', home: '—', away: '0' }
  ] } });
  assert.deepEqual(rows, [
    ['Владение', '58%', '42%', 58, 42],
    ['Удары', '13', '8', 13, 8],
    ['Передачи', '78% (331/420)', '79% (339/432)', 78, 79],
    ['Дробный показатель', '1,25', '0.87', 1.25, 0.87],
    ['Нули', '0', '0', 0, 0]
  ]);
});

test('event and statistic payloads that are absent or malformed normalize to empty arrays', () => {
  assert.deepEqual(insights.normalizeEventsPayload({ data: { error: 'not available' } }), []);
  assert.deepEqual(insights.normalizeStatsPayload(null), []);
  assert.deepEqual(insights.toEvents({ events: 'not-an-array' }), []);
  assert.deepEqual(insights.toStats({ statistics: [] }), []);
});
