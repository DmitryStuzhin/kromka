import test from 'node:test';
import assert from 'node:assert/strict';
import { predictPositionedLineup } from '../flashscore-adapter.mjs';
import '../assets/stat-charts.js';

const layout=globalThis.rplLineupLayout;
const charts=globalThis.rplStatsCharts;

test('ordered provider lineups keep wingbacks outside the three central defenders',()=>{
  const slots=layout.slots('5-3-2');
  assert.deepEqual(slots.slice(1,6).map(s=>s.role),['RWB','RCB','CB','LCB','LWB']);
  const starters=Array.from({length:11},(_,i)=>({lineupPosition:String(i+1),name:String(i+1)})).reverse();
  const placed=layout.placement(starters,'5-3-2');
  assert.equal(placed[1].tacticalRole,'RWB');
  assert.equal(placed[2].tacticalRole,'RCB');
  assert.equal(placed[2].name,'3');
  assert.equal(layout.placement(starters.map(p=>({...p,lineupPosition:'1'})),'5-3-2'),null);
  assert.equal(layout.placement(starters,'5-3-3'),null);
});

test('position forecast maximizes season minutes without putting a central defender on a flank',()=>{
  const slots=layout.slots('5-3-2');
  const players=slots.map((slot,i)=>({id:String(i),n:'Player '+i,t:'cska',p:i?'DF':'GK',lg:[14,300+i]}));
  players[1].n='Azzi'; players[2].n='Lukin';
  players[2].lg[1]=1300;
  const roles=new Map(slots.map((slot,i)=>[String(i),new Map([[slot.role,5]])]));
  const result=predictPositionedLineup(players,'cska',['5-3-2'],roles);
  assert.equal(result.startingLineups[1].name,'Azzi');
  assert.equal(result.startingLineups[1].tacticalRole,'RWB');
  assert.ok(['RCB','CB','LCB'].includes(result.startingLineups.find(p=>p.name==='Lukin').tacticalRole));
  assert.equal(new Set(result.startingLineups.map(p=>p.id)).size,11);
  roles.delete('1');
  assert.equal(predictPositionedLineup(players,'cska',['5-3-2'],roles),null);
});

test('central roles cannot qualify for fullback slots, and midfield layers remain separate',()=>{
  assert.equal(layout.fit('CB','RB'),0);
  assert.equal(layout.fit('RCB','RWB'),0);
  assert.equal(layout.fit('RWB','LB'),0);
  assert.equal(layout.fit('RW','RB'),0);
  assert.equal(layout.fit('RAM','LAM'),0);
  assert.ok(layout.fit('RWB','RB')>0);
  assert.deepEqual(layout.slots('4-2-3-1').map(s=>s.role),['GK','RB','RCB','LCB','LB','RDM','LDM','RAM','AM','LAM','ST']);
});

test('circular charts use real proportions, preserve zero, and omit unknown proportions',()=>{
  const ring=charts.donut([['primary','Голы',7],['secondary','Передачи',1]],'гол + пас');
  assert.match(ring,/stroke-dasharray="87.5 12.5"/);
  assert.match(ring,/stroke-dasharray="12.5 87.5"/);
  assert.match(ring,/Голы: 7/);
  const zero=charts.donut([['primary','Голы',0],['secondary','Передачи',0]],'гол + пас');
  assert.doesNotMatch(zero,/NaN|Infinity|stroke-dasharray/);
  assert.match(zero,/Пока нет результативных действий/);
  const unknown=charts.donut([['primary','Голы',7],['secondary','Передачи',null]],'гол + пас');
  assert.doesNotMatch(unknown,/stat-donut-ring/);
  assert.match(unknown,/—/);
});
