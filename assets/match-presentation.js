/* Shared club colours and factual match progress. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const color = (value, fallback) => /^#[a-f\d]{6}$/i.test(value || '') ? value : fallback;
  const rgb = value => [1,3,5].map(i => parseInt(value.slice(i,i+2),16));
  function palette(home = {}, away = {}) {
    const left = color(home.color, '#1655b8');
    let right = color(away.color, '#69798f');
    if (Math.hypot(...rgb(left).map((n,i) => n-rgb(right)[i])) < 95) {
      right = ['#102247','#008fac','#c76b13'].find(candidate => Math.hypot(...rgb(left).map((n,i) => n-rgb(candidate)[i])) >= 125) || '#69798f';
    }
    return {home:left, away:right};
  }
  function dualStyle(home, away) {
    const colors = palette(home, away);
    return `--home-color:${colors.home};--away-color:${colors.away}`;
  }
  function clubStyle(club = {}) { return `--club-accent:${color(club?.color, '#1948d7')}`; }
  function minuteOf(value) {
    const parsed = String(value ?? '').match(/^(\d{1,3})(?:\+(\d{0,2}))?\s*[′'’]?$/);
    return parsed ? Number(parsed[1]) + Number(parsed[2] || 0) : null;
  }
  function liveProgress(match) {
    if (match.status !== 'live') return '';
    const minute = minuteOf(match.time);
    const halftime = /перерыв|half.?time|^HT$/i.test(match.time || '');
    const baseMinute = Number(String(match.time).match(/^\d+/)?.[0]);
    const caption = halftime ? 'Перерыв' : minute === null ? 'Матч идёт' : `${baseMinute <= 45 ? '1-й' : '2-й'} тайм · ${escape(match.time)}`;
    const progress = halftime ? 50 : minute === null ? null : Math.min(100, minute/90*100);
    const goals = (match.events || []).filter(event => /гол|goal|пенальти.*забит/i.test(event[1]) && !/отмен|cancel|disallow|незабит|не забит|промах|miss/i.test(event[1]));
    const last = goals.at(-1);
    return `<span class="live-flow" aria-label="${caption}"><span class="live-flow-caption"><span>${caption}</span>${last ? `<span class="live-flow-last">${escape(last[0])} · ${escape(last[1])}</span>` : ''}</span>
      <span class="live-flow-track" aria-hidden="true">${progress === null ? '' : `<i style="width:${progress}%"></i>`}<span class="live-flow-half"></span>${goals.map(event => {
        const time = minuteOf(event[0]);
        return time === null ? '' : `<b class="live-flow-goal" style="left:${Math.min(99, time/90*100)}%" title="${escape(event[0])} · ${escape(event[1])}"></b>`;
      }).join('')}</span></span>`;
  }
  function statGroups(stats) {
    const rows=stats.map(row=>{
      const [group,title]=String(row[0]).includes(' · ')?String(row[0]).split(/ · (.*)/s):['',String(row[0])];
      return {group,title,row:[title,...row.slice(1)]};
    });
    const main=rows.filter(row=>!row.group||/^(главное|основное)$/i.test(row.group));
    const primary=(main.length?main:rows).slice(0,8);
    const signature=item=>JSON.stringify(item.row);
    const seen=new Set(primary.map(signature));
    const groups=new Map();
    for(const item of rows) {
      if(seen.has(signature(item)))continue;
      seen.add(signature(item));
      const group=item.group||'Дополнительно';
      if(!groups.has(group))groups.set(group,[]);
      groups.get(group).push(item.row);
    }
    return {primary:primary.map(item=>item.row),groups:[...groups]};
  }
  const api={palette,dualStyle,clubStyle,minuteOf,liveProgress,statGroups};
  if(typeof window!=='undefined')window.rplMatchPresentation=api;
  if(typeof globalThis!=='undefined')globalThis.rplMatchPresentation=api;
})();
