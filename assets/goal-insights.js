(() => {
  const plain = (value) => String(value ?? '').replace(/<[^>]*>/g, '').trim();
  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const nameOf = (value) => typeof value === 'string' ? value : value?.name || value?.displayName || value?.shortName || value?.team?.name || value?.club?.name || '';
  const statText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') value = value.value ?? value.current ?? value.total ?? value.goals;
    return plain(value);
  };
  const scalar = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const text = statText(value).replace(/−/g, '-');
    const token = text.match(/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)\s*%/) || text.match(/[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)/);
    if (!token) return null;
    const number = Number(token[0].replace(/[%\s]/g, '').replace(',', '.'));
    return Number.isFinite(number) ? number : null;
  };
  function findArray(value, keys, depth = 0) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 8) return [];
    for (const key of keys) if (Array.isArray(value[key])) return value[key];
    for (const key of ['data', 'result', 'response', 'league', 'fixtures', 'results', 'groups', 'entries']) {
      if (value[key] && typeof value[key] === 'object') {
        const found = findArray(value[key], keys, depth + 1);
        if (found.length) return found;
      }
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        const found = findArray(child, keys, depth + 1);
        if (found.length) return found;
      }
    }
    return [];
  }
  const statLabels = {
    'shots total':'Всего ударов','total shots':'Всего ударов','shots on goal':'Удары в створ','shots on target':'Удары в створ',
    'shots off goal':'Удары мимо','shots off target':'Удары мимо','shots blocked':'Заблокированные удары','blocked shots':'Заблокированные удары',
    'shots inside box':'Удары из штрафной','shots insidebox':'Удары из штрафной','shots outside box':'Удары из-за штрафной','shots outsidebox':'Удары из-за штрафной',
    'fouls':'Фолы','fouls committed':'Совершённые фолы','fouls drawn':'Заработанные фолы','corners':'Угловые','corner kicks':'Угловые','offsides':'Офсайды',
    'ball possession':'Владение мячом','possession':'Владение мячом','yellow cards':'Жёлтые карточки','red cards':'Красные карточки',
    'saves':'Сейвы','goalkeeper saves':'Сейвы вратаря','passes total':'Всего передач','total passes':'Всего передач','passes accurate':'Точные передачи',
    'accurate passes':'Точные передачи','passes %':'Точность передач','passes accuracy':'Точность передач','pass accuracy':'Точность передач',
    'expected goals':'Ожидаемые голы (xG)','expected goals (xg)':'Ожидаемые голы (xG)','expected assists':'Ожидаемые голевые передачи (xA)',
    'big chances':'Голевые моменты','big chances missed':'Упущенные голевые моменты','hit woodwork':'Попадания в каркас ворот',
    'woodwork':'Каркас ворот','attacks':'Атаки','dangerous attacks':'Опасные атаки','tackles':'Отборы','interceptions':'Перехваты',
    'clearances':'Выносы','blocks':'Блокировки','crosses':'Навесы','accurate crosses':'Точные навесы','crosses total':'Всего навесов',
    'duels':'Единоборства','duels won':'Выигранные единоборства','aerial duels won':'Выигранные верховые единоборства',
    'aerials won':'Выигранные верховые единоборства','dribbles':'Обводки','successful dribbles':'Успешные обводки',
    'key passes':'Ключевые передачи','throw ins':'Ауты','throw-ins':'Ауты','goal kicks':'Удары от ворот','free kicks':'Штрафные',
    'penalties':'Пенальти','penalty goals':'Голы с пенальти','goals prevented':'Предотвращённые голы','dispossessed':'Потери мяча',
    'match':'Матч','full time':'Весь матч','fulltime':'Весь матч','first half':'Первый тайм','second half':'Второй тайм',
    'summary':'Главное','shots':'Удары','passing':'Передачи','defending':'Оборона','attack':'Атака','goalkeeping':'Игра вратаря'
  };
  function localizeStatLabel(value) {
    return plain(value).split(/\s*·\s*/).map(label => statLabels[label.trim().toLowerCase().replace(/_/g,' ').replace(/\s+/g,' ')] || label).join(' · ');
  }
  function eventKind(value) {
    const text = plain(value), key = text.toLowerCase().replace(/[_-]/g,' ').replace(/\s+/g,' ').trim();
    return ({goal:'Гол','normal goal':'Гол','own goal':'Автогол','penalty':'Пенальти','penalty goal':'Гол с пенальти',
      'missed penalty':'Незабитый пенальти','penalty missed':'Незабитый пенальти','yellow card':'Жёлтая карточка',
      'red card':'Красная карточка','second yellow':'Вторая жёлтая карточка','second yellow card':'Вторая жёлтая карточка',
      'yellow red card':'Вторая жёлтая · удаление',substitution:'Замена',subst:'Замена',var:'Видеопросмотр',
      'goal cancelled':'Гол отменён','disallowed goal':'Гол отменён'})[key] || text || 'Событие';
  }
  function matchClock(item = {}) {
    const period = String(item.matchPeriod || item.period || item.matchStatus || item.status || '').replace(/[_-]/g,' ');
    if (/^(?:HT|HALF TIME|HALFTIME|BREAK)$/i.test(period)) return 'Перерыв';
    for (const value of [item.minute, item.matchMinute, item.clock?.minute, item.matchElapsed, item.elapsed, item.status?.elapsed]) {
      const minute = String(value ?? '').trim().replace(/[′'’]/g,'').replace(/\s/g,'');
      if (!/^\d{1,3}(?:\+\d{0,2})?$/.test(minute)) continue;
      const extra = item.matchExtra ?? item.extra ?? item.clock?.extra;
      return !minute.includes('+') && /^\d{1,2}$/.test(String(extra ?? '')) && Number(extra) > 0 ? `${minute}+${Number(extra)}` : minute;
    }
    return '';
  }
  function eventRecords(payload, context = {}) {
    const data = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
    const fixture = { ...context, ...(data && !Array.isArray(data) ? data : {}) };
    const rows = [];
    const collect = value => {
      if (Array.isArray(value)) { rows.push(...value); return; }
      if (!value || typeof value !== 'object') return;
      for (const key of ['events','incidents','goals','cards','substitutions','other']) if (Array.isArray(value[key])) rows.push(...value[key]);
      if (Array.isArray(value.data)) rows.push(...value.data);
      if (value.grouped) collect(value.grouped);
    };
    collect(data);
    if (payload !== data) collect(payload.grouped);
    const seen = new Set();
    return rows.filter(event => event && typeof event === 'object').map(event => {
      const side = event.side || (event.team === 'home' || event.team === 'away' ? event.team : '') ||
        (event.homeScorer || event.homeFault ? 'home' : event.awayScorer || event.awayFault ? 'away' : '');
      const team = event.team && event.team !== 'home' && event.team !== 'away' ? event.team : side ? fixture[side+'Team'] || { id: fixture[side+'TeamId'], name: fixture[side+'TeamName'] } : event.team || event.club;
      const substitution = typeof event.substitution === 'string' ? event.substitution.split(/\s*\|\s*/) : [];
      const ids = String(event.substitutionPlayerId || '').split(/\s*\|\s*/);
      const player = event.player || event.scorer || event.athlete || { name: event.playerName || event.homeScorer || event.awayScorer || event.homeFault || event.awayFault || '' };
      return { ...event, minute: event.minute ?? event.time?.elapsed ?? event.time ?? event.elapsed ?? event.timeNum ?? '—',
        type: event.card || event.type?.name || event.type || (event.substitution ? 'substitution' : '') || event.detail || event.name || 'Событие',
        side, team, player,
        playerId: event.playerId || event.homeScorerId || event.awayScorerId || event.homePlayerId || event.awayPlayerId,
        assist: event.assist || { name: event.homeAssist || event.awayAssist || '' }, assistId: event.homeAssistId || event.awayAssistId || event.assistId,
        playerOut: event.playerOut || { name: substitution[0] || '' }, playerIn: event.playerIn || { name: substitution[1] || '' },
        playerOutId: event.playerOutId || ids[0], playerInId: event.playerInId || ids[1] };
    }).filter(event => {
      const key = [event.minute, eventKind(event.type), event.side || nameOf(event.team), nameOf(event.player), nameOf(event.playerOut), nameOf(event.playerIn), event.score || event.description || ''].join('|');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  function toEvents(item) {
    return eventRecords(item).map(event => {
      const player = plain(nameOf(event.player)), assist = plain(nameOf(event.assist));
      const kind = eventKind(event.type);
      const substitution = [nameOf(event.playerIn) && `↑ ${nameOf(event.playerIn)}`, nameOf(event.playerOut) && `↓ ${nameOf(event.playerOut)}`].filter(Boolean).join(' · ');
      const score = plain(event.score).replace(/\s*[-:]\s*/g,':');
      const details = [kind, substitution || player, assist && `пас: ${assist}`, /^\d{1,2}:\d{1,2}$/.test(score) && score].filter(Boolean).join(' · ');
      const text = plain(event.description ? String(event.description).replace(/\bGOAL\b/g,'Гол') : details);
      const minuteText = String(event.minute).trim();
      const minuteLabel = /\d/.test(minuteText) ? minuteText.replace(/\s*['’′]+$/, '') + '′' : minuteText;
      return [minuteLabel, text || 'Событие', plain(nameOf(event.team || event.club))];
    });
  }
  function toStats(item) {
    const raw = item?.statistics || item?.stats || item?.matchStatistics || item?.match_statistics;
    if (!Array.isArray(raw)) return [];
    return raw.map((stat) => {
      const values = stat.values || stat.data || [];
      let home = stat.home ?? stat.homeValue ?? stat.home_value ?? stat.homeTeamValue ?? stat.home_team_value;
      let away = stat.away ?? stat.awayValue ?? stat.away_value ?? stat.awayTeamValue ?? stat.away_team_value;
      if (values && typeof values === 'object' && !Array.isArray(values)) {
        home ??= values.home ?? values.host ?? values.local;
        away ??= values.away ?? values.visitor ?? values.guest;
      }
      if (Array.isArray(values)) {
        home ??= values.find((value) => /home|host|local/.test(String(value.team || value.side || '').toLowerCase()))?.value;
        away ??= values.find((value) => /away|visitor|guest/.test(String(value.team || value.side || '').toLowerCase()))?.value;
      }
      const homeNumber = scalar(home);
      const awayNumber = scalar(away);
      if (homeNumber === null || awayNumber === null) return null;
      return [localizeStatLabel(stat.name || stat.type?.name || stat.type || stat.label || stat.statistic || 'Показатель'), statText(home), statText(away), homeNumber, awayNumber];
    }).filter(Boolean);
  }
  function normalizeEventsPayload(payload) {
    const rows = eventRecords(payload);
    return rows.length ? toEvents({ events: rows }) : toEvents({ events: findArray(payload, ['events','incidents','goals','items','results','data']) });
  }
  function normalizeStatsPayload(payload) {
    const rows = Array.isArray(payload) ? payload : findArray(payload, ['statistics', 'stats', 'matchStatistics', 'match_statistics', 'items', 'results', 'data']);
    return toStats({ statistics: rows });
  }
  const api = Object.freeze({ plain, safe, scalar, findArray, toEvents, toStats, eventRecords, eventKind, matchClock, localizeStatLabel, normalizeEventsPayload, normalizeStatsPayload });
  if (typeof globalThis !== 'undefined') globalThis.rplMatchInsights = api;
  if (typeof window !== 'undefined') window.rplMatchInsights = api;
})();
