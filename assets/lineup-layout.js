/* Slot order follows provider lineupPosition: goalkeeper, then each line from right to left. */
(() => {
  const roles = {
    GK:['ВР','Вратарь','GK'], RB:['ПЗ','Правый защитник','R'], LB:['ЛЗ','Левый защитник','L'],
    RWB:['ПЛ','Правый латераль','R'], LWB:['ЛЛ','Левый латераль','L'],
    RCB:['ПЦЗ','Правый центральный защитник','C'], CB:['ЦЗ','Центральный защитник','C'], LCB:['ЛЦЗ','Левый центральный защитник','C'],
    RDM:['ПЦОП','Правый опорный полузащитник','D'], DM:['ОП','Опорный полузащитник','D'], LDM:['ЛЦОП','Левый опорный полузащитник','D'],
    RCM:['ПЦП','Правый центральный полузащитник','M'], CM:['ЦП','Центральный полузащитник','M'], LCM:['ЛЦП','Левый центральный полузащитник','M'],
    RM:['ПП','Правый полузащитник','R'], LM:['ЛП','Левый полузащитник','L'],
    RAM:['ПАП','Правый атакующий полузащитник','A'], AM:['ЦАП','Центральный атакующий полузащитник','A'], LAM:['ЛАП','Левый атакующий полузащитник','A'],
    RW:['ПВ','Правый вингер','R'], LW:['ЛВ','Левый вингер','L'],
    RST:['ПН','Правый нападающий','F'], ST:['ЦН','Центральный нападающий','F'], LST:['ЛН','Левый нападающий','F']
  };
  function formationLines(value) {
    if (!/^[1-5](?:-[1-6]){2,4}$/.test(String(value || ''))) return null;
    const lines = String(value).split('-').map(Number);
    return lines.reduce((a,b)=>a+b,0) === 10 ? lines : null;
  }
  function slots(formation) {
    const lines = formationLines(formation);
    if (!lines) return [];
    const output = [{ ordinal:1, row:0, column:0, columns:1, role:'GK' }];
    for (let band=0;band<lines.length;band++) {
      const size=lines[band], last=band===lines.length-1;
      let codes;
      if (band===0) codes=({3:['RCB','CB','LCB'],4:['RB','RCB','LCB','LB'],5:['RWB','RCB','CB','LCB','LWB']})[size];
      else if(last) codes=({1:['ST'],2:['RST','LST'],3:['RW','ST','LW']})[size];
      else if(band===1 && lines.length>3 && size<=2) codes=size===1?['DM']:['RDM','LDM'];
      else if(band===lines.length-2 && lines.length>3 && lines.at(-1)===1) codes=({1:['AM'],2:['RAM','LAM'],3:['RAM','AM','LAM'],4:['RM','RAM','LAM','LM']})[size];
      else codes=({1:['CM'],2:['RCM','LCM'],3:['RCM','CM','LCM'],4:['RM','RCM','LCM','LM'],5:['RM','RCM','CM','LCM','LM']})[size];
      if(!codes) return [];
      codes.forEach((role,column)=>output.push({ordinal:output.length+1,row:band+1,column,columns:size,role}));
    }
    return output;
  }
  function placement(startingLineups, formation) {
    const grid=slots(formation);
    if(!Array.isArray(startingLineups)||startingLineups.length!==11||grid.length!==11) return null;
    const players=[...startingLineups].sort((a,b)=>Number(a.lineupPosition)-Number(b.lineupPosition));
    if(players.some((p,i)=>Number(p.lineupPosition)!==i+1)) return null;
    return players.map((player,i)=>({...player,pitchSlot:grid[i],tacticalRole:grid[i].role}));
  }
  function fit(from,to) {
    if(from===to)return 1;
    // A winger is not a fullback. Keep the flank, and allow only neighbouring wide roles.
    const wide={RB:['R',0],RWB:['R',1],RM:['R',2],RW:['R',3],LB:['L',0],LWB:['L',1],LM:['L',2],LW:['L',3]};
    if(wide[from]||wide[to]) {
      if(!wide[from]||!wide[to]||wide[from][0]!==wide[to][0])return 0;
      const distance=Math.abs(wide[from][1]-wide[to][1]);
      return distance===1?.85:0;
    }
    if((from==='RAM'&&to==='LAM')||(from==='LAM'&&to==='RAM'))return 0;
    const a=roles[from]?.[2], b=roles[to]?.[2];
    if(!a||!b)return 0;
    if(a===b)return .94;
    if((a==='D'&&b==='M')||(a==='M'&&b==='D'))return .75;
    if((a==='A'&&b==='M')||(a==='M'&&b==='A'))return .6;
    return 0;
  }
  const api={roles,formationLines,slots,placement,fit};
  if(typeof window!=='undefined')window.rplLineupLayout=api;
  if(typeof globalThis!=='undefined')globalThis.rplLineupLayout=api;
})();
