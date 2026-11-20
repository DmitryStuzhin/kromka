import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import '../assets/match-presentation.js';

const presentation=globalThis.rplMatchPresentation;
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('a new installation has no implicit club, and browsing never changes the favourite',()=>{
  const values=new Map();
  const context={localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},clubs:{cska:{name:'ЦСКА'},zenit:{name:'Зенит'}},standings:[]};
  const start=html.indexOf("let tab='today'");
  const end=html.indexOf('const screen=',start);
  runInNewContext(`${html.slice(start,end)}
    function trackedClubIds(){return [...favorites].filter(id=>clubs[id])}
    function escapeMarkup(value){return value}
    function clubBadge(key){return key}
  `,context);
  assert.equal(runInNewContext('selectedClub',context),'');
  assert.equal(runInNewContext('myClubKey()',context),'');
  assert.equal(runInNewContext('favoriteClubShortcut()',context),'');
  runInNewContext("chooseMyClub('cska');selectedClub='zenit'",context);
  assert.equal(runInNewContext('myClubKey()',context),'cska');
  assert.match(runInNewContext('favoriteClubShortcut()',context),/Мой клуб: ЦСКА/);
  assert.equal(values.get('kromka:my-club'),'cska');
  runInNewContext("favorites.delete('cska')",context);
  assert.equal(runInNewContext('favoriteClubShortcut()',context),'');
});

test('similar kit colours remain distinguishable, and arbitrary CSS is rejected',()=>{
  const original=presentation.palette({color:'#b93b40'},{color:'#168c62'});
  assert.deepEqual(original,{home:'#b93b40',away:'#168c62'});
  const similar=presentation.palette({color:'#b93b40'},{color:'#ba3c41'});
  assert.notEqual(similar.away,'#ba3c41');
  assert.doesNotMatch(presentation.clubStyle({color:'red;position:fixed'}),/position/);
  assert.doesNotThrow(()=>presentation.clubStyle(null));
});

test('live progress handles added time, half time, unknown minutes and disallowed goals honestly',()=>{
  const events=[['21′','Гол · Игрок','ЦСКА'],['34′','Гол отменён','Ахмат']];
  const flow=presentation.liveProgress({status:'live',time:'45+2′',events});
  assert.match(flow,/1-й тайм/);
  assert.match(flow,/45\+2′/);
  assert.match(presentation.liveProgress({status:'live',time:'90+′'}),/2-й тайм · 90\+′/);
  assert.equal(presentation.minuteOf('90+′'),90);
  assert.equal((flow.match(/class="live-flow-goal"/g)||[]).length,1);
  assert.match(presentation.liveProgress({status:'live',time:'Перерыв'}),/width:50%/);
  assert.doesNotMatch(presentation.liveProgress({status:'live',time:'LIVE'}),/width:/);
  assert.equal(presentation.liveProgress({status:'soon',time:'18:30'}),'');
  assert.doesNotMatch(presentation.liveProgress({status:'live',time:'67′',events:[['60′','Гол <script>','']]}),/<script>/);
});

test('statistic groups expose the main figures once and preserve additional source values',()=>{
  const data=[['Главное · Всего ударов',19,26],['Удары · Всего ударов',19,26],['Удары · Заблокировано',5,9],['Атака · Офсайды',2,1]];
  const groups=presentation.statGroups(data);
  assert.deepEqual(groups.primary,[['Всего ударов',19,26]]);
  assert.deepEqual(groups.groups,[['Удары',[['Заблокировано',5,9]]],['Атака',[['Офсайды',2,1]]]]);
  assert.equal(data[0][0],'Главное · Всего ударов');
  const long=presentation.statGroups(Array.from({length:12},(_,i)=>['Показатель '+i,i,0]));
  assert.equal(long.primary.length,8);
  assert.equal(long.groups[0][1].length,4);
});

test('event-only refresh preserves statistic state and detects changed or withdrawn live events',()=>{
  const goal=readFileSync(new URL('../goal-data.js',import.meta.url),'utf8');
  const start=goal.indexOf('  function applyMatchInsights('),end=goal.indexOf('  async function loadMatchInsights(',start);
  const context={};
  runInNewContext(`${goal.slice(start,end)}\nconst match={events:[],stats:[],detailDataStatus:{statistics:'loaded'}};`,context);
  assert.equal(runInNewContext("applyMatchInsights(match,{events:{ok:true,rows:[['21′','Гол','ЦСКА']]}})",context),true);
  assert.equal(runInNewContext('match.detailDataStatus.statistics',context),'loaded');
  assert.equal(runInNewContext("applyMatchInsights(match,{events:{ok:true,rows:[['21′','Гол','ЦСКА']]}})",context),false);
  assert.equal(runInNewContext("applyMatchInsights(match,{events:{ok:true,rows:[]}})",context),true);
  assert.equal(runInNewContext('match.events.length',context),0);
});
