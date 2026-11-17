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
  runInNewContext(`${html.slice(start, end)}\nfunction render() {}\nconst screen = { querySelector: () => null };`, context);
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

test('daily summary, calendar and followed fixtures serve different purposes', () => {
  const context = calendarContext();
  const start = html.indexOf('function dateRail()');
  const end = html.indexOf('function comparisonCard()', start);
  Object.assign(context, {
    window: {isLiveData:true}, clubs: {din:{short:'Динамо'}}, standings:[], filterClub:'all', matchScope:'all', matches:[
      {id:'late',dateKey:'2026-11-07',round:14,kickoff:'19:30',status:'finished',score:'1:0',home:'din'},
      {id:'early',dateKey:'2026-11-07',round:14,kickoff:'14:00',status:'live',score:'2:0'},
      {id:'tomorrow',dateKey:'2026-11-08',round:14,kickoff:'16:15',status:'soon',score:'16:15',home:'din'},
    ],
    clubBadge: ()=>'', favorites: new Set(['din']), favoriteMatches: new Set(['late']), escapeMarkup: String,
  });
  runInNewContext(`${html.slice(start,end)}\nmoscowDateKey=()=> '2026-11-07'; setCalendarWeek('2026-11-02','2026-11-07');`, context);
  const render = () => runInNewContext('matchesPage()', context);
  const matchIds = (markup=render()) => [...markup.matchAll(/data-match="([^"]+)"/g)].map(row=>row[1]);
  const today = runInNewContext('home()', context);
  assert.deepEqual(matchIds(today), ['tomorrow','early','late']);
  assert.match(today, /data-open-schedule/);
  assert.doesNotMatch(today, /data-week-shift/);
  const favoritesPage = runInNewContext('favoritesPage()', context);
  assert.deepEqual(matchIds(favoritesPage), ['tomorrow','late']);
  assert.match(favoritesPage, /Мой клуб/);
  assert.match(render(), /data-week-shift/);
  assert.match(render(), /tracked-day-dot/);
  assert.deepEqual(matchIds(), ['early','late']);
  context.matchScope='live';
  assert.deepEqual(matchIds(), ['early']);
  context.matchScope='favorites';
  assert.deepEqual(matchIds(), ['late']);
  runInNewContext("matchdayRange=true; matchScope='soon';",context);
  assert.deepEqual(matchIds(), ['tomorrow']);
  runInNewContext("matchdayRange=false; matchScope='all'; chooseCalendarDate(0);",context);
  assert.deepEqual(matchIds(), []);
  assert.match(render(), /На эту дату матчей нет\./);
  assert.match(live, /dateKey: iso, kickoff: kick/);
});

test('seven-day date rail fits mobile widths and all five primary tabs remain', () => {
  assert.match(html, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(polish, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(polish, /@media\(max-width:360px\)/);
  assert.equal((html.match(/class="nav-item(?: active)?" data-tab=/g) || []).length, 5);
});
