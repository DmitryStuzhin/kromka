import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const live = readFileSync(new URL('../goal-data.js', import.meta.url), 'utf8');
const polish = readFileSync(new URL('../assets/ui-polish.css', import.meta.url), 'utf8');

function calendarContext() {
  const start = html.indexOf('function moscowDateKey');
  const end = html.indexOf("\nlet tab='today'", start);
  assert.ok(start >= 0 && end > start, 'calendar helper block should be present');
  const context = { Intl, Date, Array, Math, Number };
  runInNewContext(`${html.slice(start, end)}\nfunction render() {}`, context);
  return context;
}

test('calendar weeks always contain seven consecutive Moscow dates, with selectable days and reversible week navigation', () => {
  const context = calendarContext();
  runInNewContext("setCalendarWeek('2026-11-02', '2026-11-04')", context);
  assert.equal(runInNewContext('weekLabel()', context), '2—8 ноября 2026 г.');
  assert.deepEqual(
    JSON.parse(runInNewContext('JSON.stringify(calendarDates)', context)),
    ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']
  );
  runInNewContext('chooseCalendarDate(5)', context);
  assert.equal(runInNewContext('selectedDate', context), '2026-11-07');
  runInNewContext('shiftCalendarWeek(1)', context);
  assert.deepEqual(
    JSON.parse(runInNewContext('JSON.stringify(calendarDates)', context)),
    ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
  );
  assert.equal(runInNewContext('selectedDate', context), '2026-11-09');
  runInNewContext('shiftCalendarWeek(-1)', context);
  assert.equal(runInNewContext('selectedDate', context), '2026-11-02');
});

test('home and the Matches tab share the week controls but render separate daily and weekly views', () => {
  assert.match(html, /function home\(\)[\s\S]*?\$\{weekControls\(\)\}\$\{dateRail\(\)\}/);
  assert.match(html, /function matchesPage\(\)[\s\S]*?\$\{weekControls\(\)\}\$\{dateRail\(\)\}/);
  assert.match(html, /data-tab="matches"/);
  assert.match(html, /matches:window\.matchesPage\|\|matchesPage/);
  assert.match(html, /calendarDates\.map\(iso=>/);
  assert.match(html, /chooseCalendarDate\(b\.dataset\.day\)/);
  assert.match(html, /data-week-shift/);
});

test('empty calendar days stay empty and both demo and GOAL fixtures are filtered by their actual date keys', () => {
  assert.doesNotMatch(live, /const offsets\s*=\s*\[-1,\s*0,\s*1,\s*6,\s*7,\s*13,\s*14\]/);
  assert.match(html, /dateKey:'2026-11-02'/);
  assert.match(html, /В расписании на эту дату матчей нет\./);
  assert.match(live, /m\.dateKey === selectedIso\(\)/);
  assert.match(live, /m\.dateKey >= calendarDates\[0\].*m\.dateKey <= calendarDates\[6\]/);
  assert.match(live, /В расписании GOAL API на эту дату матчей нет\./);
  assert.match(html, /дни без матчей не заполняются демо-играми/);
  assert.match(live, /Дни без матчей показаны пустыми, без демо-игр/);
});

test('seven-day date rail fits mobile widths and all five primary tabs remain', () => {
  assert.match(html, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(polish, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(polish, /@media\(max-width:360px\)/);
  assert.equal((html.match(/class="nav-item(?: active)?" data-tab=/g) || []).length, 5);
});
