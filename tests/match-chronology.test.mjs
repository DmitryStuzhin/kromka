import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import '../assets/goal-insights.js';
import '../assets/match-chronology.js';
const chronology=globalThis.rplMatchChronology;
const clubs={rostov:{name:'Ростов',short:'Ростов',apiId:'ros'},krylia:{name:'Крылья Советов',short:'Крылья',apiId:'kry'}};
const player=(name,id)=>({name,id});
const details=[
  {minute:'14',type:'GOAL',side:'home',score:'1 - 0',player:player('Олусегун Олакунле','olusegun/AbCd1234')},
  {minute:'60',type:'GOAL',side:'home',score:'2 - 0',player:player('Сулейманов Тимур','suleymanov/AbCd1235'),assist:player('Олусегун Олакунле','olusegun/AbCd1234')},
  {minute:'62',type:'yellow card',side:'home',player:player('Чистяков Дмитрий','chistyakov/AbCd1236')},
  {minute:'67',type:'substitution',side:'away',playerIn:player('Ахметов Ильзат','akhmetov/AbCd1237'),playerOut:player('Макаров Денис','makarov/AbCd1238')},
  {minute:'90+4',type:'GOAL',side:'home',score:'3 - 0',player:player('Шанталий Даниил','shantaliy/AbCd1239')}
];
const match={home:'rostov',away:'krylia',score:'3 : 0',eventDetails:details};

test('the compact chronology preserves event types, running scores and click targets for every participant',()=>{
  const html=chronology.render(match,clubs);
  assert.equal((html.match(/class="chronology-row /g)||[]).length,5);
  assert.match(html,/home is-yellow-card/);
  assert.match(html,/away is-substitution/);
  assert.match(html,/aria-label="Жёлтая карточка"/);
  assert.match(html,/aria-label="Замена"/);
  assert.match(html,/class="chronology-score">2:0/);
  assert.match(html,/1-й тайм<\/span><b>1:0/);
  assert.match(html,/2-й тайм<\/span><b>2:0/);
  for(const name of ['Олусегун Олакунле','Сулейманов Тимур','Чистяков Дмитрий','Ахметов Ильзат','Макаров Денис','Шанталий Даниил'])
    assert.ok(html.includes(`data-player-name="${name}"`),name+' opens its full profile');
  assert.match(html,/data-player-id="akhmetov\/AbCd1237"[^>]+data-player-team="krylia"/);
  assert.match(html,/data-player-id="makarov\/AbCd1238"[^>]+data-player-team="krylia"/);
  assert.match(html,/Олусегун О\./);
  assert.match(html,/пас:/);
  assert.doesNotMatch(html,/timeline-event-copy|match-timeline/);
});

test('added time belongs to its actual half and events are ordered without mutating match data',()=>{
  const records=[{minute:'46',type:'GOAL',side:'away',player:{name:'Гость'}},{minute:'45+3',type:'GOAL',side:'home',player:{name:'Хозяин'}}];
  const model=chronology.model({...match,score:'1:1',eventDetails:records},clubs);
  assert.equal(model.entries[0].minute,'45+3′');
  assert.equal(model.entries[0].score,'1:0');
  assert.equal(model.entries[1].score,'1:1');
  assert.equal(model.halfScore(1),'1:0');
  assert.equal(model.halfScore(2),'0:1');
  assert.equal(records[0].minute,'46');
  assert.equal(records[0].score,undefined);
});

test('partial timelines never invent a running or half-time score, and cancelled goals are not counted',()=>{
  const partial=chronology.model({...match,eventDetails:[{minute:'60',type:'GOAL',side:'home',player:{name:'Игрок'}}]},clubs);
  assert.equal(partial.entries[0].score,'');
  assert.equal(partial.halfScore(1),'');
  const cancelled=chronology.model({...match,score:'0:0',eventDetails:[{minute:'60',type:'Гол отменён',side:'home',player:{name:'Игрок'}}]},clubs);
  assert.equal(cancelled.entries[0].kind,'missed');
});

test('unknown teams do not link a player to the wrong club and untrusted names remain escaped',()=>{
  const html=chronology.render({...match,eventDetails:[{minute:null,type:'red card',player:{name:'<img src=x onerror=bad>'}}]},clubs);
  assert.doesNotMatch(html,/<img|data-player-profile/);
  assert.match(html,/chronology-row unknown is-red-card/);
  assert.match(html,/<time>—<\/time>/);
});

test('event metadata survives the shared cache so goals, assists and substitutions keep their profile IDs',()=>{
  const source=readFileSync(new URL('../goal-data.js',import.meta.url),'utf8');
  const start=source.indexOf('  function applyMatchInsights('),end=source.indexOf('  async function loadMatchInsights(',start);
  const context={};
  runInNewContext(source.slice(start,end),context);
  context.match={events:[],stats:[]};context.result={events:{ok:true,rows:[['14′','Гол','Ростов']],records:details}};
  assert.equal(runInNewContext('applyMatchInsights(match,result)',context),true);
  assert.equal(context.match.eventDetails[3].playerOut.id,'makarov/AbCd1238');
  assert.equal(runInNewContext('applyMatchInsights(match,result)',context),false);
});

test('received events remain available after a fixture refresh while statistics are still pending',async()=>{
  const source=readFileSync(new URL('../goal-data.js',import.meta.url),'utf8');
  const start=source.indexOf('  function applyMatchInsights('),end=source.indexOf('  function liveClubPageRoster(',start);
  let resolveStatistics;
  const statistics=new Promise(resolve=>{resolveStatistics=resolve});
  const context={
    matchInsightsCache:new Map(),matchInsightsPending:new Map(),
    document:{querySelectorAll:()=>[]},
    window:{rplMatchInsights:globalThis.rplMatchInsights,refreshDetailedMatch:()=>{}},
    normalizeEventsPayload:globalThis.rplMatchInsights.normalizeEventsPayload,
    normalizeStatsPayload:globalThis.rplMatchInsights.normalizeStatsPayload,
    apiFetch:async url=>url.endsWith('/events')?{ok:true,json:async()=>({events:details})}:statistics
  };
  runInNewContext(source.slice(start,end),context);
  const first={id:'match',status:'finished',events:[],stats:[]};
  const pending=context.loadMatchInsights(first);
  await new Promise(resolve=>setImmediate(resolve));
  const refreshed={id:'match',status:'finished',events:[],stats:[]};
  const second=context.loadMatchInsights(refreshed);
  assert.equal(refreshed.eventDetails[3].playerOut.id,'makarov/AbCd1238');
  assert.equal(refreshed.detailDataStatus.events,'loaded');
  resolveStatistics({ok:true,json:async()=>({statistics:[]})});
  await Promise.all([pending,second]);
});
