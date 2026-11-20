import test from 'node:test';
import assert from 'node:assert/strict';
import { flashscoreMatchEvents } from '../flashscore-adapter.mjs';
import '../assets/goal-insights.js';

test('incident codes identify goals and cards while player-name descriptions never become event types',()=>{
  const roster=new Map([['scorer',{name:'Тимур Сулейманов'}],['assist',{name:'Олакунле Олусегун'}],['card',{name:'Дмитрий Чистяков'}],['sub',{name:'Антон Шамонин'}]]);
  const fixture={homeTeamId:'cmr7uolsy8mgirx06lps95sxi',awayTeamId:'cmr7uolt48mgkrx06mtepmfuh'};
  const payload={ev:[
    [1,"60'",[[3,'Сулейманов Т.','scorer'],[8,'Олусегун О.','assist']]],
    [1,"62'",[[1,'Чистяков Д.','card']]],
    [2,"65'",[[2,'Игрок гостей','red']]],
    [1,"78'",[[6,'Сулейманов Т.','scorer'],[7,'Шамонин А.','sub']]],
    [1,"90+4'",[[10,'Сулейманов Т.','scorer']]],
    [2,"90+5'",[[11,'Игрок гостей','miss']]]
  ]};
  const events=flashscoreMatchEvents(payload,fixture,roster);
  assert.equal(events.data.length,6,'assists belong to goals and substitution pairs are one action');
  assert.equal(events.data[0].type,'Гол');
  assert.equal(events.data[0].assist.name,'Олакунле Олусегун');
  assert.equal(events.data[1].type,'Жёлтая карточка');
  assert.equal(events.data[2].type,'Красная карточка');
  assert.equal(events.data[3].playerIn.name,'Антон Шамонин');
  assert.equal(events.data[3].playerOut.name,'Тимур Сулейманов');
  assert.equal(events.data[4].type,'Гол с пенальти');
  assert.equal(events.data[5].type,'Незабитый пенальти');
  const normalized=globalThis.rplMatchInsights.normalizeEventsPayload(events);
  assert.match(normalized[0][1],/Гол · Тимур Сулейманов · пас: Олакунле Олусегун/);
  assert.match(normalized[3][1],/Замена · ↑ Антон Шамонин · ↓ Тимур Сулейманов/);
});
