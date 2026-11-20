import test from 'node:test';
import assert from 'node:assert/strict';
import '../assets/goal-insights.js';

const insights = globalThis.rplMatchInsights;

test('event normalization preserves text and canonicalizes Flashscore minute marks', () => {
  const rows = insights.normalizeEventsPayload({ data: { events: [
    { minute: 17, type: { name: 'Гол' }, player: { name: 'Иван' }, team: { name: 'Зенит & Ко' }, description: 'Гол & ассист' },
    { time: { elapsed: 64 }, description: '<b>Пенальти</b>', club: { name: 'Спартак' } },
    { minute: "90+1'", description: 'Гол' },
  ] } });
  assert.deepEqual(rows, [
    ['17′', 'Гол & ассист', 'Зенит & Ко'],
    ['64′', 'Пенальти', 'Спартак'],
    ['90+1′', 'Гол', ''],
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

test('full fixture chronology includes named goals, assists, cards and substitutions without duplicate goals', () => {
  const goal = { id:'goal-1', time:'60', type:'GOAL', homeScorer:'Тимур Сулейманов', homeAssist:'Олакунле Олусегун', score:'2 - 0' };
  const rows = insights.normalizeEventsPayload({ data: {
    homeTeam:{name:'Ростов'}, awayTeam:{name:'Крылья Советов'}, events:[goal],
    cards:[{time:'62',card:'yellow card',homeFault:'Дмитрий Чистяков'},{time:'90+2',card:'red card',awayFault:'Игрок гостей'}],
    substitutions:[{time:'78',team:'home',substitution:'Тимур Сулейманов | Артём Шамонин'}],
    grouped:{goals:[goal]}
  }});
  assert.equal(rows.length,4);
  assert.deepEqual(rows[0],['60′','Гол · Тимур Сулейманов · пас: Олакунле Олусегун · 2:0','Ростов']);
  assert.deepEqual(rows[1],['62′','Жёлтая карточка · Дмитрий Чистяков','Ростов']);
  assert.deepEqual(rows[2],['90+2′','Красная карточка · Игрок гостей','Крылья Советов']);
  assert.deepEqual(rows[3],['78′','Замена · ↑ Артём Шамонин · ↓ Тимур Сулейманов','Ростов']);
});

test('match statistics from the real provider schema are translated without changing values', () => {
  const labels=['Shots Total','Shots On Goal','Shots Off Goal','Shots Blocked','Shots Inside Box','Shots Outside Box','Fouls','Corners','Offsides','Ball Possession','Yellow Cards','Red Cards','Saves','Passes Total','Passes Accurate'];
  const rows=insights.normalizeStatsPayload({data:{match:{fullTime:labels.map(type=>({type,home:'4',away:'0'})),firstHalf:[]}}});
  assert.equal(rows.length,labels.length);
  for(const [label,home,away] of rows){assert.match(label,/[а-яё]/iu);assert.equal(home,'4');assert.equal(away,'0');}
  assert.equal(rows[0][0],'Всего ударов');
  assert.equal(rows[5][0],'Удары из-за штрафной');
  assert.equal(insights.localizeStatLabel('Summary · Expected Goals (xG)'),'Главное · Ожидаемые голы (xG)');
});

test('live clocks retain added time and fall back to elapsed minutes without inventing a minute', () => {
  assert.equal(insights.matchClock({matchMinute:'90+'}),'90+');
  assert.equal(insights.matchClock({matchMinute:'90+4',matchElapsed:90,matchExtra:4}),'90+4');
  assert.equal(insights.matchClock({matchMinute:'LIVE',matchElapsed:67}),'67');
  assert.equal(insights.matchClock({matchElapsed:90,matchExtra:4}),'90+4');
  assert.equal(insights.matchClock({matchPeriod:'HALF_TIME',matchMinute:'45'}),'Перерыв');
  assert.equal(insights.matchClock({matchMinute:null,matchElapsed:null}),'');
});
