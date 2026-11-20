(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nameOf = player => typeof player === 'string' ? player : player?.name || '';
  const clock = value => {
    const found = String(value || '').match(/^(\d+)(?:\s*\+\s*(\d*))?/);
    return found ? { base: Number(found[1]), order: Number(found[1]) + Number(found[2] || 0) / 1000 } : null;
  };
  function kindOf(value) {
    const text = String(value || '');
    if (/отмен|незабит|промах|miss|disallow|cancel/i.test(text)) return 'missed';
    if (/красн|удалени|red card|вторая ж[её]лтая/i.test(text)) return 'red-card';
    if (/ж[её]лт|yellow card/i.test(text)) return 'yellow-card';
    if (/замен|substitution/i.test(text)) return 'substitution';
    if (/^(?:гол(?:\s|$)|автогол|goal(?:\s|$)|own goal|penalty goal)/i.test(text)) return 'goal';
    return 'event';
  }
  const icons = {
    goal: '<img class="chronology-ball" src="/assets/football-goal.jpg" width="20" height="20" alt="" decoding="async">',
    'yellow-card': '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2" fill="#f4c400" stroke="#ad8700" stroke-width=".7"/></svg>',
    'red-card': '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="2" fill="#db303d" stroke="#b91e2b" stroke-width=".7"/></svg>',
    substitution: '<svg viewBox="0 0 24 24"><path d="M3 7h17m-5-4 5 4-5 4" stroke="#087b48"/><path d="M21 17H4m5-4-5 4 5 4" stroke="#c42c3b"/></svg>',
    missed: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/></svg>',
    event: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>'
  };
  function shortName(player) {
    const name = nameOf(player).trim();
    if (player?.shortName) return player.shortName;
    const words = name.split(/\s+/);
    if (words.length < 2) return name;
    if (/^[А-ЯA-ZЁ]\.$/i.test(words[0])) return [...words.slice(1), words[0]].join(' ');
    if (words.slice(1).some(word => /\.$/.test(word))) return name;
    // Our localized roster uses surname first; unresolved full Latin names retain their supplied form.
    if (String(player?.id || '').includes('/') || /[а-яё]/i.test(name)) return `${words[0]} ${Array.from(words[1])[0]}.`;
    return name;
  }
  function playerButton(value, team, secondary = false) {
    const player = typeof value === 'string' ? { name: value } : value || {};
    const name = nameOf(player);
    if (!name) return '';
    const text = escape(shortName(player));
    if (!team) return `<span class="chronology-player${secondary ? ' is-secondary' : ''}">${text}</span>`;
    return `<button type="button" class="chronology-player${secondary ? ' is-secondary' : ''}" data-player-profile data-player-id="${escape(player.id || '')}" data-player-name="${escape(name)}" data-player-number="${escape(player.number || '')}" data-player-team="${escape(team)}" title="${escape(name)}" aria-label="Открыть профиль: ${escape(name)}">${text}</button>`;
  }
  function legacyRecord(event) {
    const parts = String(event[1] || '').split(/\s*·\s*/);
    return { minute: event[0], type: parts[0], team: {name:event[2]}, description: event[1],
      player: {name:parts[1] || ''}, assist:{name:(parts.find(part=>/^пас:/i.test(part)) || '').replace(/^пас:\s*/i,'')},
      score: parts.find(part=>/^\d{1,2}:\d{1,2}$/.test(part)) || '' };
  }
  function model(match, clubs, keyForName) {
    const records = match.eventDetails?.length ? match.eventDetails : (match.events || []).map(legacyRecord);
    const entries = records.map((event, index) => {
      const teamName = nameOf(event.team || event.club);
      let team = event.side === 'home' ? match.home : event.side === 'away' ? match.away : keyForName?.(teamName);
      if (team !== match.home && team !== match.away) team = [match.home,match.away].find(key =>
        event.team?.id && String(clubs[key]?.apiId) === String(event.team.id) ||
        teamName && [clubs[key]?.name,clubs[key]?.short].filter(Boolean).some(name=>String(name).toLowerCase()===teamName.toLowerCase()));
      const type = globalThis.rplMatchInsights?.eventKind(event.type) || event.type || 'Событие';
      const kind = kindOf(type);
      const player = value => typeof value === 'string' ? {name:value} : value || {};
      const withId = (value,id) => ({...player(value),id:player(value).id || id || ''});
      return { ...event, index, type, kind, team, side: team === match.home ? 'home' : team === match.away ? 'away' : 'unknown',
        time: clock(event.minute), minute: event.minute && /\d/.test(String(event.minute)) ? String(event.minute).replace(/['’′]+$/,'')+'′' : '—',
        player:withId(event.player,event.playerId), assist:withId(event.assist,event.assistId),
        playerIn:withId(event.playerIn,event.playerInId), playerOut:withId(event.playerOut,event.playerOutId),
        score: /^\d{1,2}\s*[-:]\s*\d{1,2}$/.test(String(event.score || '')) ? String(event.score).replace(/\s*[-:]\s*/g,':') : '' };
    });
    entries.sort((a,b)=>(a.time?.order ?? Infinity)-(b.time?.order ?? Infinity)||a.index-b.index);
    const final = String(match.score || '').match(/^(\d+)\s*:\s*(\d+)$/);
    const goals = entries.filter(event=>event.kind==='goal');
    const total = side => goals.filter(event=>event.side===side).length;
    const complete = Boolean(final && goals.every(event=>event.team && event.time && !/автогол/i.test(event.type)) &&
      total('home')===Number(final[1]) && total('away')===Number(final[2]));
    if (complete) {
      const running = {home:0,away:0};
      for (const event of goals) { running[event.side]++; event.score ||= `${running.home}:${running.away}`; }
    }
    const halfScore = half => complete ? ['home','away'].map(side=>goals.filter(event=>event.side===side&&(event.time.base<=45?1:2)===half).length).join(':') : '';
    return {entries,halfScore};
  }
  function render(match, clubs = {}, keyForName) {
    const {entries,halfScore} = model(match,clubs,keyForName);
    const list = [];
    let period = 0, previous = null;
    for (const event of entries) {
      const half = event.time ? event.time.base<=45 ? 1 : 2 : 0;
      if (half && half !== period) {
        list.push(`<li class="chronology-period"><span>${half}-й тайм</span>${halfScore(half)?`<b>${halfScore(half)}</b>`:''}</li>`);
        period = half;
      }
      const content = event.kind==='substitution' && (nameOf(event.playerIn)||nameOf(event.playerOut))
        ? `<span class="chronology-substitution"><span class="chronology-sr">Вышел:</span>${playerButton(event.playerIn,event.team)}<span class="chronology-sr">Ушёл:</span>${playerButton(event.playerOut,event.team,true)}</span>`
        : `<span class="chronology-main">${event.kind==='goal' && event.score?`<b class="chronology-score">${escape(event.score)}</b>`:''}${playerButton(event.player,event.team)}${!nameOf(event.player)?`<span class="chronology-description">${escape(event.description || event.type)}</span>`:''}${nameOf(event.assist)?`<span class="chronology-assist">(пас: ${playerButton(event.assist,event.team,true)})</span>`:''}${event.kind==='missed'?`<span class="chronology-note">${escape(event.type)}</span>`:''}</span>`;
      const sameGroup = previous?.minute===event.minute && previous?.side===event.side && previous?.kind===event.kind;
      const teamName = clubs[event.team]?.short || clubs[event.team]?.name || nameOf(event.team);
      list.push(`<li class="chronology-row ${event.side} is-${event.kind}${sameGroup?' is-grouped':''}"><span class="chronology-sr">${escape(teamName)}</span><time>${escape(event.minute)}</time><span class="chronology-icon" role="img" aria-label="${escape(event.type)}">${icons[event.kind]}</span><div class="chronology-content">${content}</div></li>`);
      previous = event;
    }
    return `<ol class="match-chronology" aria-label="События матча по времени">${list.join('')}</ol>`;
  }
  const api = Object.freeze({render,model,shortName});
  if(typeof globalThis!=='undefined') globalThis.rplMatchChronology=api;
  if(typeof window!=='undefined') window.rplMatchChronology=api;
})();
