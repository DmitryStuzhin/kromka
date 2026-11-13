(() => {
  const API_SIGNUP = 'https://goal-api.com/signup';
  const API_COVERAGE = 'https://goal-api.com/coverage/russia-premier-league-api';
  const safe = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = (v) => String(v ?? '').replace(/<[^>]*>/g, '').trim();
  const num = (v, fallback = 0) => { const n = Number(String(v ?? '').replace(/[^\d.+-]/g, '')); return Number.isFinite(n) ? n : fallback; };
  const norm = (v) => plain(v).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/gi, '');
  const colors = ['#356d50', '#2f6b87', '#9a3542', '#4b5e93', '#5c853c', '#79543d', '#3a7380', '#704c83'];
  const aliases = {
    zenit: ['zenit', 'zenit st petersburg', 'зенит'],
    spartak: ['spartak moscow', 'spartak moskva', 'спартак москва', 'спартак'],
    cska: ['cska moscow', 'cska moskva', 'цска москва', 'цска'],
    lokomotiv: ['lokomotiv moscow', 'lokomotiv moskva', 'локомотив москва', 'локомотив'],
    dynamo: ['dynamo moscow', 'dinamo moscow', 'dinamo moskva', 'dynamo moskva', 'динамо москва', 'динамо москвы'],
    makhachkala: ['dynamo makhachkala', 'dinamo makhachkala', 'махачкала', 'динамо махачкала'],
    krasnodar: ['krasnodar', 'краснодар'], baltika: ['baltika', 'балтика'],
    orenburg: ['orenburg', 'газовик оренбург', 'оренбург'], rubin: ['rubin kazan', 'рубин казань', 'рубин'],
    krylia: ['krylia sovetov', 'krylya sovetov', 'крылья советов', 'крылья'], rostov: ['rostov', 'ростов'],
    akhmat: ['akhmat grozny', 'akhmat', 'ахмат грозный', 'ахмат'], akron: ['akron tolyatti', 'akron togliatti', 'акрон тольятти', 'акрон'],
    fakel: ['fakel voronezh', 'fakel', 'факел воронеж', 'факел'], sochi: ['sochi', 'сочи'],
    pari: ['pari nn', 'parinn', 'пари нн', 'нижний новгород'], rodina: ['rodina', 'родина']
  };
  const translated = {
    zenit: ['Зенит', 'Зенит', 'Санкт-Петербург'], spartak: ['Спартак Москва', 'Спартак М', 'Москва'],
    cska: ['ЦСКА', 'ЦСКА', 'Москва'], lokomotiv: ['Локомотив', 'Локомотив', 'Москва'],
    dynamo: ['Динамо Москва', 'Динамо М', 'Москва'], makhachkala: ['Динамо Махачкала', 'Динамо Мх', 'Махачкала'],
    krasnodar: ['Краснодар', 'Краснодар', 'Краснодар'], baltika: ['Балтика', 'Балтика', 'Калининград'],
    orenburg: ['Оренбург', 'Оренбург', 'Оренбург'], rubin: ['Рубин Казань', 'Рубин', 'Казань'],
    krylia: ['Крылья Советов', 'Крылья', 'Самара'], rostov: ['Ростов', 'Ростов', 'Ростов-на-Дону'],
    akhmat: ['Ахмат', 'Ахмат', 'Грозный'], akron: ['Акрон', 'Акрон', 'Тольятти'],
    fakel: ['Факел', 'Факел', 'Воронеж'], sochi: ['Сочи', 'Сочи', 'Сочи'],
    pari: ['Пари НН', 'Пари НН', 'Нижний Новгород'], rodina: ['Родина', 'Родина', 'Москва']
  };
  const keyAliases = new Map();
  Object.entries(aliases).forEach(([key, values]) => values.forEach((value) => keyAliases.set(norm(value), key)));
  const idToKey = new Map();

  function getDateKey(value) {
    const raw = String(value ?? '');
    const direct = raw.match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
    if (direct) return direct;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(parsed).map((p) => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function shiftDate(iso, days) { return shiftDateKey(iso, days); }
  function fmtDate(iso, options = { day: '2-digit', month: 'long' }) { return iso ? new Intl.DateTimeFormat('ru-RU', options).format(new Date(`${iso}T12:00:00`)) : 'ДАТА НЕ УКАЗАНА'; }
  function findArray(value, keys, depth = 0) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object' || depth > 8) return [];
    for (const key of keys) if (Array.isArray(value[key])) return value[key];
    for (const key of ['data', 'result', 'response', 'league', 'standings', 'fixtures', 'results', 'groups', 'entries']) {
      if (value[key] && typeof value[key] === 'object') { const found = findArray(value[key], keys, depth + 1); if (found.length) return found; }
    }
    for (const child of Object.values(value)) { if (child && typeof child === 'object') { const found = findArray(child, keys, depth + 1); if (found.length) return found; } }
    return [];
  }
  function nameOf(v) { return typeof v === 'string' ? v : v?.name || v?.displayName || v?.shortName || v?.team?.name || v?.club?.name || ''; }
  function mediaUrl(value) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (url.hostname === 'media.goal-api.com') return url.href;
      return url.hostname === 'media.api-sports.io' && /^\/football\/players\/\d+\.png$/.test(url.pathname) ? url.href : '';
    } catch { return ''; }
  }
  function keyFor(name, id) {
    // Keep the two Dynamo clubs distinct even if a provider shortens their names.
    if (String(id) === 'cmr7uolsy8mghrx06jog9s5dt') return 'dynamo';
    if (String(id) === 'cmr7uolt08mgjrx06xj1x745j') return 'makhachkala';
    const n = norm(name);
    if (keyAliases.has(n)) return keyAliases.get(n);
    for (const [alias, key] of keyAliases) if (alias.length > 4 && n.includes(alias)) return key;
    const cleaned = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
    return `goal_${cleaned || n.slice(0, 22) || 'club'}`;
  }
  function teamKey(value, fallback = {}) {
    const source = value?.team || value?.club || value || {};
    const name = plain(nameOf(source) || fallback.name || 'Клуб');
    const id = source.id ?? source.teamId ?? source.team_id ?? fallback.id ?? name;
    const key = keyFor(name, id);
    idToKey.set(String(id), key);
    const badge = clubs[key]?.badge || mediaUrl(source.badge || source.logo || source.crest || source.image || fallback.badge || fallback.logo);
    if (!clubs[key]) {
      const local = translated[key];
      const shortName = plain(source.shortName || source.short_name || source.abbreviation || source.short || '');
      const city = plain(source.city || source.location || source.address?.city || local?.[2] || 'Россия');
      const rawColor = String(source.color || source.primaryColor || '').replace(/^#/, '');
      const color = /^[a-f\d]{6}$/i.test(rawColor) ? `#${rawColor}` : colors[Math.abs([...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0)) % colors.length];
      clubs[key] = { name: safe(local?.[0] || name), short: safe(local?.[1] || shortName || name), city: safe(city), abbr: safe(shortName.slice(0, 3) || name.slice(0, 3)), color, text: '#fff', apiId: String(id), logo: badge };
    }
    if (id) clubs[key].apiId = String(id);
    if (badge) clubs[key].logo = badge;
    return key;
  }
  function scalar(v) { if (v === null || v === undefined || v === '') return null; if (typeof v === 'object') v = v.value ?? v.current ?? v.total ?? v.goals; const n = Number(v); return Number.isFinite(n) ? n : null; }
  function scoreSide(item, side) {
    const sideObj = item[side] && typeof item[side] === 'object' ? item[side] : {};
    const score = item.score || item.scores || item.result || {};
    for (const v of [item[`${side}Score`], item[`${side}_score`], item[`${side}Goals`], item[`${side}_goals`], item[`${side}TeamScore`], item[`${side}TeamFtScore`], sideObj.score, sideObj.goals, item.goals?.[side], score[side], score[`${side}Score`], score.fullTime?.[side], score.fulltime?.[side], score.current?.[side], score.total?.[side]]) { const n = scalar(v); if (n !== null) return Math.trunc(n); }
    return null;
  }
  function statusString(value) {
    if (value && typeof value === 'object') return [value.state, value.status, value.name, value.short, value.code, value.description, value.type?.name, value.type?.state].filter(Boolean).join(' ').toLowerCase();
    return String(value ?? '').toLowerCase();
  }
  function statusOf(item) {
    const s = statusString(item.status || item.state || item.matchStatus || item.match_status || item.fixtureStatus);
    if (['live', 'in_play', 'inplay', 'inprogress', 'in progress', 'playing', '1h', '2h', 'half_time', 'ht', 'extra_time'].some((x) => s.includes(x))) return 'live';
    if (['finished', 'full_time', 'fulltime', 'complete', 'completed', 'ft', 'ended'].some((x) => s.includes(x))) return 'finished';
    return 'soon';
  }
  function roundOf(value) { if (value && typeof value === 'object') value = value.name || value.round || value.number || value.matchday || ''; const found = String(value ?? '').match(/\d+/g); return found?.length ? Number(found[found.length - 1]) : (window.apiRound || 13); }
  const toEvents = (item) => window.rplMatchInsights?.toEvents(item) || [];
  const toStats = (item) => window.rplMatchInsights?.toStats(item) || [];
  const normalizeEventsPayload = (payload) => window.rplMatchInsights?.normalizeEventsPayload(payload) || [];
  const normalizeStatsPayload = (payload) => window.rplMatchInsights?.normalizeStatsPayload(payload) || [];
  function fixture(item, index) {
    const homeRaw = item.homeTeam || item.home_team || item.home || item.teams?.home || item.participants?.[0] || {};
    const awayRaw = item.awayTeam || item.away_team || item.away || item.teams?.away || item.participants?.[1] || {};
    const home = teamKey(homeRaw, { name: 'Хозяева', id: item.homeTeamId || `home-${index}`, badge: item.teamHomeBadge });
    const away = teamKey(awayRaw, { name: 'Гости', id: item.awayTeamId || `away-${index}`, badge: item.teamAwayBadge });
    const dateRaw = item.kickoffUtc || item.kickoff_utc || item.matchDate || item.kickoff || item.kickoffAt || item.kickoff_at || item.utcDate || item.datetime || item.startTime || item.start_time || item.date || '';
    const iso = getDateKey(dateRaw);
    const status = statusOf(item);
    const hs = scoreSide(item, 'home'); const as = scoreSide(item, 'away');
    const clock = item.matchMinute ?? item.minute ?? item.elapsed ?? item.elapsedTime ?? item.clock?.displayValue ?? item.status?.elapsed;
    const minute = clock === undefined || clock === null || clock === '' ? 'LIVE' : `${String(clock).replace(/[^\d+]/g, '')}′`;
    const kick = dateRaw && String(dateRaw).includes('T') ? new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date(dateRaw)) : String(item.matchTime || item.time || item.kickoffTime || item.kickoff_time || '').slice(0, 5);
    const r = roundOf(item.matchRound || item.round || item.matchday || item.week || item.stage);
    const key = String(item.id || item.fixtureId || item.fixture_id || item.matchId || `goal-${index}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    return { id: safe(key), day: calendarDates.indexOf(iso), round: r, date: safe(`${fmtDate(iso).toUpperCase()} · ТУР ${r}`), dateKey: iso, home, away, homeFormation: plain(item.homeTeamSystem || item.homeFormation || ''), awayFormation: plain(item.awayTeamSystem || item.awayFormation || ''), score: status === 'soon' ? (kick || 'ВРЕМЯ НЕ УКАЗАНО') : `${hs ?? '—'} : ${as ?? '—'}`, status, time: safe(status === 'live' ? minute : status === 'finished' ? 'ЗАВЕРШЁН' : `НАЧАЛО В ${kick || '—'}`), venue: safe(plain(item.matchStadium || item.venue?.name || item.venue?.fullName || item.stadium?.name || item.venue || '')), events: toEvents(item), stats: toStats(item) };
  }
  function standing(row) {
    const source = row.team || row.club || row.participant || row;
    const key = teamKey(source, { name: 'Клуб', id: row.teamId || row.team_id || row.position || row.rank });
    const played = num(row.overallLeaguePlayed ?? row.played ?? row.playedGames ?? row.played_games ?? row.matches ?? row.overall?.played ?? row.all?.played);
    const won = num(row.overallLeagueW ?? row.won ?? row.wins ?? row.overall?.won ?? row.all?.won);
    const drawn = num(row.overallLeagueD ?? row.drawn ?? row.draws ?? row.overall?.drawn ?? row.all?.drawn);
    const lost = num(row.overallLeagueL ?? row.lost ?? row.losses ?? row.overall?.lost ?? row.all?.lost);
    const gf = num(row.overallLeagueGF ?? row.goalsFor ?? row.goals_for ?? row.goalsScored ?? row.gf ?? row.overall?.goalsFor ?? row.all?.goalsFor);
    const ga = num(row.overallLeagueGA ?? row.goalsAgainst ?? row.goals_against ?? row.goalsConceded ?? row.ga ?? row.overall?.goalsAgainst ?? row.all?.goalsAgainst);
    const points = num(row.overallLeaguePTS ?? row.points ?? row.pts ?? row.score ?? row.pointsTotal);
    return [key, played, won, drawn, lost, `${gf}–${ga}`, points];
  }
  function makeCalendar() { const today = moscowDateKey(); setCalendarWeek(startOfWeek(today), today); }
  function selectedIso() { return selectedDate; }
  function syncData(payload) {
    makeCalendar();
    const fixtureRows = findArray(payload.fixtures || payload.matches || payload, ['fixtures', 'matches', 'items', 'results', 'data']);
    const tableRows = findArray(payload.standings || {}, ['standings', 'table', 'entries', 'rows', 'data']);
    if (!fixtureRows.length && !tableRows.length) throw new Error('Unexpected GOAL API response shape');
    const nextMatches = fixtureRows.map(fixture).filter((m) => m.dateKey);
    const nextStandings = tableRows.map(standing);
    if (nextMatches.length) {
      matches.splice(0, matches.length, ...nextMatches);
      const active = nextMatches.find((m) => m.status === 'live') || nextMatches.find((m) => m.status === 'soon' && m.dateKey >= moscowDateKey()) || nextMatches[0];
      window.apiRound = active?.round || 13;
      round = window.apiRound;
      if (active?.dateKey) setCalendarWeek(startOfWeek(active.dateKey), active.dateKey);
    }
    if (nextStandings.length) standings.splice(0, standings.length, ...nextStandings);
    window.isLiveData = true;
    window.dataFreshAt = payload.fetchedAt || new Date().toISOString();
    setDataRibbon();
  }
  let liveEventSource = null;
  function setDataRibbon(error = false) {
    const strip = document.querySelector('.prototype-strip');
    if (!strip) return;
    const text = window.isLiveData ? window.goalLiveStreamState === 'connected' ? 'GOAL API · LIVE' : 'GOAL API · REST' : error ? 'GOAL API недоступен · показано демо' : 'Прототип · демо · не live';
    strip.innerHTML = `<span><i class="dot"></i>${text}</span><span>Только РПЛ</span>`;
  }
  function applyGoalLiveUpdate(update) {
    if (!update || update.provider !== 'GOAL API') return;
    const match = matches.find((entry) => String(entry.id) === String(update.fixtureId));
    if (!match) return;
    let changed = false;
    if (Number.isInteger(update.homeScore) && update.homeScore >= 0 && Number.isInteger(update.awayScore) && update.awayScore >= 0) {
      const nextScore = `${update.homeScore} : ${update.awayScore}`;
      if (match.score !== nextScore) { match.score = nextScore; changed = true; }
    }
    if (update.status === 'live') {
      if (match.status !== 'live') { match.status = 'live'; changed = true; }
      if (!/^\d{1,3}(?:\+\d{1,2})?′$/.test(match.time)) { match.time = 'LIVE'; changed = true; }
    }
    if (update.status === 'finished' && match.status !== 'finished') { match.status = 'finished'; match.time = 'ЗАВЕРШЁН'; changed = true; }
    if (update.status !== 'finished' && typeof update.minute === 'string' && /^\d{1,3}(?:\+\d{1,2})?$/.test(update.minute)) {
      const nextTime = `${update.minute}′`;
      if (match.time !== nextTime) { match.time = nextTime; changed = true; }
    }
    if (!changed) return;
    window.dataFreshAt = update.receivedAt || new Date().toISOString();
    if (sheet) {
      const modal = [...sheet.querySelectorAll('[data-live-match]')].find((node) => node.dataset.liveMatch === String(match.id));
      if (modal) {
        const score = modal.querySelector('.score');
        if (score) { score.textContent = match.score; score.classList.toggle('upcoming', match.status === 'soon'); }
        const top = modal.querySelector('.match-top');
        if (top) top.innerHTML = `<span class="match-round">ТУР ${match.round} · РПЛ</span>${statusText(match)}`;
      }
    }
    setDataRibbon();
    render();
  }
  function startLiveStream() {
    if (liveEventSource || typeof EventSource === 'undefined') return;
    liveEventSource = new EventSource('/api/live-stream');
    liveEventSource.addEventListener('state', (event) => {
      try { window.goalLiveStreamState = JSON.parse(event.data).state || 'idle'; }
      catch { window.goalLiveStreamState = 'reconnecting'; }
      setDataRibbon();
    });
    liveEventSource.addEventListener('fixture', (event) => {
      try { applyGoalLiveUpdate(JSON.parse(event.data)); }
      catch (error) { console.warn('GOAL live update could not be applied:', error); }
    });
    liveEventSource.addEventListener('error', () => {
      if (window.goalLiveStreamState === 'connected') window.goalLiveStreamState = 'reconnecting';
      setDataRibbon();
    });
  }
  function liveHome() {
    const list = matches.filter((m) => m.dateKey === selectedIso());
    const iso = selectedIso(); const label = fmtDate(iso, { day: 'numeric', month: 'long' });
    const live = list.filter((m) => m.status === 'live').length; const upcoming = list.filter((m) => m.status === 'soon').length; const round = list[0]?.round; const roundLabel = round ? ` · тур ${round}` : '';
    const weekday = fmtDate(iso, { weekday: 'long' });
    return `<section class="hero"><span class="photo-credit">ФОТО: MONOKLON · CC BY 3.0</span><div class="hero-content"><div><div class="eyebrow">Сезон 26—27${roundLabel}</div><h1 class="hero-title">РПЛ.<br>День игры.</h1></div><div class="hero-bottom"><div class="hero-meta"><strong>${list.length} матч${list.length === 1 ? '' : list.length < 5 ? 'а' : 'ей'} в расписании</strong><br>${safe(label)} · GOAL API</div><button class="hero-cta" data-go="matches">Календарь&nbsp; ↗</button></div></div></section>
      <div class="page-head"><div><div class="page-kicker">Календарь лиги</div><h2 class="page-title">${selectedIso() === moscowDateKey() ? 'Сегодня' : safe(label)}</h2></div><div class="page-date">${safe(weekday)}<br>${safe(fmtDate(iso, { day: '2-digit', month: 'long' }))}</div></div>${weekControls()}${dateRail()}
      <div class="section-heading"><h2>${safe(label)}${roundLabel}</h2><span class="micro">Матчей: ${list.length}${live ? ` · ${live} в игре` : upcoming ? ` · ${upcoming} скоро` : ''}</span></div><div class="match-list">${list.length ? list.map(matchCard).join('') : '<div class="empty-note">На эту дату матчей нет в расписании GOAL API. Выберите другой день.</div>'}</div>
      <div class="compact-banner"><div><span class="label">Положение · сезон 26—27</span><h3>Гонка за верх</h3><p>${standings[0] ? `${safe(clubs[standings[0][0]]?.short || 'Лидер')} лидирует по очкам` : 'Открой таблицу РПЛ'}</p></div><button class="hero-cta" data-go="table">Таблица ↗</button></div><div class="section-heading"><h2>Топ-4</h2><button class="link-button" data-go="table">Вся таблица ↗</button></div>${miniTable()}
      <div class="callout" data-go="matches"><div class="callout-index">${round ?? '—'}</div><div><div class="callout-title">${round ? 'Тур в фокусе' : 'Календарь РПЛ'}</div><div class="callout-sub">${round ? 'Матчи и таблица РПЛ в одном месте' : 'Откройте календарь матчей по дням'}</div></div><div class="callout-arrow">↗</div></div><p class="footnote">Данные: <a href="${API_COVERAGE}" target="_blank" rel="noreferrer">GOAL API · покрытие РПЛ</a>. Права на спортивные данные и эмблемы нужно отдельно подтвердить перед публичным релизом.</p>`;
  }
  function liveMatchesPage() {
    const withinWeek = matches.filter((m) => m.dateKey && m.dateKey >= calendarDates[0] && m.dateKey <= calendarDates[6]).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || String(a.score).localeCompare(String(b.score)));
    const clubMatches = withinWeek.filter((m) => filterClub === 'all' || m.home === filterClub || m.away === filterClub);
    const visible = clubMatches.filter((m) => matchScope === 'live' ? m.status === 'live' : matchScope === 'favorites' ? matchIsFollowed(m) : true);
    const scopes = [['all', 'Все', clubMatches.length], ['live', 'Live', clubMatches.filter((m) => m.status === 'live').length], ['favorites', 'Избранное', clubMatches.filter(matchIsFollowed).length]];
    const sections = calendarDates.map((iso) => {
      const rows = visible.filter((m) => m.dateKey === iso); const hasFixtures = clubMatches.some((m) => m.dateKey === iso); const count = rows.length;
      const rawHeading = fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }); const heading = safe(rawHeading.charAt(0).toLocaleUpperCase('ru-RU') + rawHeading.slice(1));
      return `<section class="calendar-day" id="calendar-${iso}"><div class="fixture-day"><strong>${heading}</strong><span>${count} ${count === 1 ? 'МАТЧ' : 'МАТЧЕЙ'}</span></div>${count ? `<div class="match-list">${rows.map(matchCard).join('')}</div>` : `<div class="empty-note calendar-empty">${hasFixtures ? 'По выбранным фильтрам матчей нет.' : 'В расписании GOAL API на эту дату матчей нет.'}</div>`}</section>`;
    }).join('');
    return `<div class="page-head"><div><div class="page-kicker">РОССИЙСКАЯ ПРЕМЬЕР-ЛИГА · GOAL API</div><h1 class="page-title">Календарь</h1></div><div class="page-date">${visible.length} ${visible.length === 1 ? 'МАТЧ' : 'МАТЧЕЙ'}<br>ЗА НЕДЕЛЮ</div></div>${weekControls()}${dateRail()}<div class="match-scope-row" role="group" aria-label="Быстрые фильтры матчей">${scopes.map(([key, label, count]) => `<button class="match-scope-chip ${matchScope === key ? 'active' : ''}" data-match-scope="${key}" aria-pressed="${matchScope === key}"><span>${label}</span><small>${count}</small></button>`).join('')}</div><div class="filter-row"><button class="filter-chip ${filterClub === 'all' ? 'active' : ''}" data-filter="all">Все клубы</button>${Object.entries(clubs).map(([id, c]) => `<button class="filter-chip ${filterClub === id ? 'active' : ''}" data-filter="${safe(id)}">${safe(c.short)}</button>`).join('')}</div>${sections}<p class="footnote">Расписание и результаты получены из <a href="${API_COVERAGE}" target="_blank" rel="noreferrer">GOAL API</a>. Дни без матчей показаны пустыми, без демо-игр. Избранное сохраняется в этом браузере.</p>`;
  }
  function liveTablePage() {
    return `<div class="page-head"><div><div class="page-kicker">СЕЗОН 2026/27 · GOAL API</div><h1 class="page-title">Таблица</h1></div><div class="page-date">ОБЩАЯ<br>ТУРНИРНАЯ</div></div><div class="table-bar"><div class="table-title">РПЛ</div><div class="table-snapshot">ОБЩАЯ<br>ТУРНИРНАЯ</div></div><div class="table-wrap"><table class="standings"><thead><tr><th style="width:31px">№</th><th style="text-align:left">КЛУБ</th><th style="width:31px">И</th><th style="width:40px">Р/М</th><th style="width:42px">О</th></tr></thead><tbody>${standings.map((row, i) => `<tr class="${i < 4 ? 'top-zone' : i > standings.length - 3 ? 'bottom-zone' : ''} ${selectedClub === row[0] ? 'selected-row' : ''}" data-club-row="${safe(row[0])}"><td class="pos">${i + 1}</td><td class="club-cell"><div class="club-inline">${clubBadge(row[0])}<span class="club-name">${safe(clubs[row[0]]?.short || row[0])}</span></div></td><td>${safe(row[1])}</td><td>${safe(row[5])}</td><td class="points">${safe(row[6])}</td></tr>`).join('')}</tbody></table><div class="table-legend"><span class="legend-item"><i class="legend-marker"></i>Верхняя группа</span><span class="legend-item"><i class="legend-marker relegation"></i>Нижняя часть</span></div></div><p class="source-note">Положение и очки загружены через GOAL API. Таблица кэшируется сервером, чтобы беречь бесплатную квоту. <a href="${API_COVERAGE}" target="_blank" rel="noreferrer">Покрытие РПЛ</a>.</p><div class="section-heading"><h2>Лидер таблицы</h2><span class="micro">ПО ОЧКАМ</span></div><div class="data-tile"><b>${standings[0] ? safe(clubs[standings[0][0]]?.short || '—') : '—'}</b><span>${standings[0] ? `${safe(standings[0][6])} очков` : 'Данные пока не получены'}</span></div>${typeof comparisonCard === 'function' ? comparisonCard() : ''}`;
  }
  const squadCache = new Map();
  const squadMetaCache = new Map();
  const squadPending = new Set();
  const lineupCache = new Map();
  const lineupPending = new Set();
  const matchInsightsCache = new Map();
  const matchInsightsPending = new Map();
  const positionNames = { Goalkeepers: 'Вратари', Defenders: 'Защитники', Midfielders: 'Полузащитники', Forwards: 'Нападающие' };
  function playerName(player) { return plain(player?.name || player?.lineupPlayer || player?.displayName || 'Игрок'); }
  function playerAvatar(player, size = '') {
    const name = playerName(player); const image = mediaUrl(player?.image || player?.playerImage || player?.photo || player?.avatar);
    const initials = name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toUpperCase() || '•';
    return `<span class="player-avatar ${size} ${image ? 'has-photo' : 'no-photo'}">${image ? `<img src="${safe(image)}" alt="${safe(name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.parentElement.classList.add('no-photo')">` : ''}<span class="avatar-fallback">${safe(initials)}</span></span>`;
  }
  function playerProfileAttrs(player, clubKey) {
    const photo = mediaUrl(player?.image || player?.playerImage || player?.photo || player?.avatar);
    return `data-player-profile data-player-name="${safe(playerName(player))}" data-player-number="${safe(player?.lineupNumber || player?.number || '')}" data-player-position="${safe(player?.playerPosition || player?.position || player?.type || '')}" data-player-age="${safe(player?.age || '')}" data-player-photo="${safe(photo)}" data-player-team="${safe(clubKey || '')}"`;
  }
  function playerGroup(player) {
    const type = norm(player?.playerPosition || player?.type || player?.position || '');
    if (type.includes('goalkeeper') || type.includes('keeper') || type.includes('врат')) return 'keepers';
    if (type.includes('defender') || type.includes('защит')) return 'defenders';
    if (type.includes('midfielder') || type.includes('полузащит')) return 'midfielders';
    if (type.includes('forward') || type.includes('striker') || type.includes('напада')) return 'forwards';
    return 'other';
  }
  function rosterMarkup(rows, meta = {}, clubKey = '') {
    if (!Array.isArray(rows) || !rows.length) return '<div class="empty-note">Состав пока не опубликован поставщиком.</div>';
    const order = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards', 'unknown'];
    const groups = new Map();
    for (const player of rows) { const type = player.type || 'unknown'; if (!groups.has(type)) groups.set(type, []); groups.get(type).push(player); }
    const photos = rows.filter((player) => mediaUrl(player.image || player.photo || player.playerImage)).length;
    const fallbackPhotos = rows.filter((player) => player.portraitSource === 'API-Football' && mediaUrl(player.image || player.photo || player.playerImage)).length;
    const source = fallbackPhotos ? `GOAL API + API-FOOTBALL · ${fallbackPhotos} РЕЗЕРВ` : 'GOAL API';
    const fallbackNote = meta.unavailable
      ? '<div class="portrait-source-note">Резерв API-Football временно недоступен; для не найденных фото оставлены инициалы.</div>'
      : meta.attempted && photos < rows.length
        ? `<div class="portrait-source-note">API-Football добавил ${fallbackPhotos} фото${meta.rejectedPhotos ? ` · ${meta.rejectedPhotos} кандидатов не прошли проверку, включая ${meta.rejectedSilhouettes || 0} общих силуэтов` : ''}. Для остальных нет надёжного совпадения, поэтому оставлены инициалы.</div>`
        : '';
    return `<div class="roster-summary">${rows.length} ЗАПИСЕЙ · ${photos}/${rows.length} ФОТО · ${source}</div>${fallbackNote}${[...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([type, players]) => `<section class="roster-group"><h3>${safe(positionNames[type] || (type === 'unknown' ? 'Без категории GOAL' : type))} <span>${players.length}</span></h3><div class="squad-grid">${players.map((player) => `<button type="button" class="squad-player" ${playerProfileAttrs(player, clubKey)}>${playerAvatar(player)}<span class="squad-player-copy"><strong>${safe(playerName(player))}</strong><span>${player.number ? `№ ${safe(player.number)}` : ''}${player.age ? ` · ${safe(player.age)} лет` : ''}</span></span><span class="player-open-mark" aria-hidden="true">↗</span></button>`).join('')}</div></section>`).join('')}`;
  }
  function loadingMarkup(label, count = 3) {
    return `<div class="loading-state" role="status" aria-live="polite"><div class="loading-state-label">${safe(label)}</div><div class="loading-skeleton-stack">${Array.from({ length: count }, () => '<div class="skeleton-row" aria-hidden="true"></div>').join('')}</div></div>`;
  }
  async function loadClubSquad(clubKey) {
    const root = document.getElementById('clubSquad'); if (!root || !clubs[clubKey]) return;
    if (squadCache.has(clubKey)) { root.setAttribute('aria-busy', 'false'); root.innerHTML = rosterMarkup(squadCache.get(clubKey), squadMetaCache.get(clubKey), clubKey); return; }
    if (squadPending.has(clubKey)) return;
    const teamId = clubs[clubKey].apiId;
    if (!teamId) { root.innerHTML = '<div class="empty-note">ID команды пока не пришёл от GOAL API.</div>'; return; }
    squadPending.add(clubKey);
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = loadingMarkup('Загружаю актуальный состав из GOAL API…', 3);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamId)}/players`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Roster HTTP ${response.status}`);
      const payload = await response.json(); const rows = Array.isArray(payload.data) ? payload.data : findArray(payload, ['players', 'items', 'data']);
      const meta = payload.portraitFallback || {};
      squadCache.set(clubKey, rows); squadMetaCache.set(clubKey, meta);
      const current = document.getElementById('clubSquad'); if (current && selectedClub === clubKey) { current.setAttribute('aria-busy', 'false'); current.innerHTML = rosterMarkup(rows, meta, clubKey); }
    } catch { const current = document.getElementById('clubSquad'); if (current && selectedClub === clubKey) { current.setAttribute('aria-busy', 'false'); current.innerHTML = '<div class="empty-note">Ростер сейчас недоступен. Попробуйте открыть клуб позже.</div>'; } }
    finally { squadPending.delete(clubKey); }
  }
  function lineupLists(team) {
    const entries = Object.entries(team || {}).filter(([, value]) => Array.isArray(value));
    const starters = team?.startingLineups || team?.starting_lineups || entries.find(([key]) => /starting|starter/i.test(key))?.[1] || [];
    const bench = team?.substitutes || team?.substitute || team?.bench || team?.substitutesBench || entries.find(([key]) => /substitut|bench/i.test(key))?.[1] || [];
    return { starters, bench };
  }
  function formationOf(team, players, fallback) {
    const named = plain(team?.formation || team?.system || team?.teamSystem || fallback || '');
    return named ? named.replace(/\s+/g, '') : 'СХЕМА НЕ УКАЗАНА';
  }
  function formationRow(players, clubKey) {
    return `<div class="formation-row">${players.map((player) => `<button type="button" class="formation-player" ${playerProfileAttrs(player, clubKey)}>${playerAvatar(player, 'pitch-avatar')}<span class="formation-number">${safe(player.lineupNumber || player.number || '')}</span><small>${safe(playerName(player))}</small></button>`).join('')}</div>`;
  }
  function teamLineupMarkup(teamData, clubKey, fallbackFormation) {
    const { starters, bench } = lineupLists(teamData);
    if (!starters.length) return '<div class="empty-note">Стартовый состав этой команды ещё не опубликован.</div>';
    const groups = { forwards: [], midfielders: [], defenders: [], keepers: [], other: [] };
    starters.forEach((player) => groups[playerGroup(player)].push(player));
    const grouped = ['forwards', 'midfielders', 'defenders', 'keepers'].filter((key) => groups[key].length).map((key) => groups[key]);
    const rows = [...grouped, ...(groups.other.length ? [groups.other] : [])];
    const formation = formationOf(teamData, starters, fallbackFormation);
    return `<section class="lineup-team"><div class="lineup-teamhead">${clubBadge(clubKey, 'lineup-crest')}<strong>${safe(clubs[clubKey]?.short || clubKey)}</strong><span class="formation-badge">${safe(formation)}</span></div><p class="lineup-layout-note">На поле — группы по позициям GOAL, не подтверждённые координаты.</p><div class="lineup-pitch">${rows.map((row) => formationRow(row, clubKey)).join('')}</div>${bench.length ? `<div class="bench-title">ЗАПАСНЫЕ · ${bench.length}</div><div class="bench-list">${bench.map((player) => `<button type="button" class="bench-player" ${playerProfileAttrs(player, clubKey)}>${playerAvatar(player, 'bench-avatar')}<span>${safe(player.lineupNumber || player.number || '')} ${safe(playerName(player))}</span></button>`).join('')}</div>` : ''}</section>`;
  }
  function lineupsMarkup(payload, match) {
    const data = payload?.data || payload || {}; const home = data.home || data.homeTeam || {}; const away = data.away || data.awayTeam || {};
    const homeList = lineupLists(home).starters; const awayList = lineupLists(away).starters;
    if (!homeList.length && !awayList.length) return '<div class="empty-note">Подтверждённые составы пока не опубликованы. Они появятся здесь, когда их передаст поставщик.</div>';
    const fallbackPhotos = [...homeList, ...lineupLists(home).bench, ...awayList, ...lineupLists(away).bench].filter((player) => player.portraitSource === 'API-Football' && mediaUrl(player.image || player.playerImage || player.photo)).length;
    const sourceNote = fallbackPhotos ? `<div class="portrait-source-note">${fallbackPhotos} резервных портрета API-Football; составы и схемы — GOAL API.</div>` : '';
    return `${sourceNote}${teamLineupMarkup(home, match.home, data.homeFormation || match.homeFormation)}${teamLineupMarkup(away, match.away, data.awayFormation || match.awayFormation)}`;
  }
  async function loadLineups(match) {
    void loadMatchInsights(match);
    const root = document.getElementById('matchLineups'); if (!root) return;
    if (lineupCache.has(match.id)) { root.setAttribute('aria-busy', 'false'); root.innerHTML = lineupsMarkup(lineupCache.get(match.id), match); return; }
    if (lineupPending.has(match.id)) return;
    lineupPending.add(match.id);
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = loadingMarkup('Запрашиваю подтверждённые составы…', 4);
    try {
      const response = await fetch(`/api/fixtures/${encodeURIComponent(match.id)}/lineups`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Lineups HTTP ${response.status}`);
      const payload = await response.json(); lineupCache.set(match.id, payload);
      const current = document.getElementById('matchLineups'); if (current && modalMatch?.id === match.id) { current.setAttribute('aria-busy', 'false'); current.innerHTML = lineupsMarkup(payload, match); }
    } catch { const current = document.getElementById('matchLineups'); if (current && modalMatch?.id === match.id) { current.setAttribute('aria-busy', 'false'); current.innerHTML = '<div class="empty-note">Составы матча сейчас недоступны. Попробуйте позже.</div>'; } }
    finally { lineupPending.delete(match.id); }
  }
  function applyMatchInsights(match, result) {
    if (result.events?.ok && result.events.rows.length) match.events = result.events.rows;
    if (result.statistics?.ok && result.statistics.rows.length) match.stats = result.statistics.rows;
    const nextStatus = {
      events: result.events?.ok ? (result.events.rows.length ? 'loaded' : 'empty') : 'failed',
      statistics: result.statistics?.ok ? (result.statistics.rows.length ? 'loaded' : 'empty') : 'failed'
    };
    const changed = match.detailDataStatus?.events !== nextStatus.events || match.detailDataStatus?.statistics !== nextStatus.statistics;
    match.detailDataStatus = nextStatus;
    return changed;
  }
  async function loadMatchInsights(match) {
    if (!match || match.status === 'soon') return;
    const id = String(match.id);
    const cached = matchInsightsCache.get(id);
    const now = Date.now();
    const cacheTtl = match.status === 'finished' ? 24 * 60 * 60_000 : 60_000;
    if (cached && now - cached.at < cacheTtl) { if (applyMatchInsights(match, cached)) window.refreshDetailedMatch?.(id); return; }
    if (matchInsightsPending.has(id)) return matchInsightsPending.get(id);
    const request = (async () => {
      const result = { at: Date.now(), events: null, statistics: null };
      await Promise.all(['events', 'statistics'].map(async (resource) => {
        try {
          const response = await fetch(`/api/fixtures/${encodeURIComponent(id)}/${resource}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          result[resource] = { ok: true, rows: resource === 'events' ? normalizeEventsPayload(payload) : normalizeStatsPayload(payload) };
        } catch {
          result[resource] = { ok: false, rows: [] };
        }
      }));
      matchInsightsCache.set(id, result);
      if (applyMatchInsights(match, result)) window.refreshDetailedMatch?.(id);
    })();
    matchInsightsPending.set(id, request);
    try { await request; }
    finally { if (matchInsightsPending.get(id) === request) matchInsightsPending.delete(id); }
  }
  function liveClubPageRoster() {
    const c = clubs[selectedClub] || clubs[Object.keys(clubs)[0]]; const idx = standings.findIndex((r) => r[0] === selectedClub); const row = idx >= 0 ? standings[idx] : null;
    const clubKey = selectedClub; const teamMatches = matches.filter((m) => m.home === clubKey || m.away === clubKey); const next = teamMatches.find((m) => m.status === 'soon') || teamMatches.find((m) => m.status === 'live');
    const goalDiff = row ? num(row[5].split('–')[0]) - num(row[5].split('–')[1]) : 0;
    const overview = `<div class="section-heading"><h2>Следующий матч</h2><span class="micro">${next ? `ТУР ${next.round}` : 'НЕТ В РАСПИСАНИИ'}</span></div>${next ? matchCard(next) : '<div class="empty-note">Матч клуба не найден в текущей выдаче GOAL API.</div>'}<div class="club-data"><div class="data-tile"><b>${row ? `${row[2]}–${row[3]}–${row[4]}` : '—'}</b><span>победы · ничьи · поражения</span></div><div class="data-tile"><b>${row ? `${goalDiff > 0 ? '+' : ''}${goalDiff}` : '—'}</b><span>разница мячей</span></div></div><div class="section-heading"><h2>Матчи клуба</h2><button class="link-button" data-go="matches">Календарь ↗</button></div><div class="match-list">${teamMatches.slice(0, 3).map(matchCard).join('') || '<div class="empty-note">Матчей пока нет в загруженном окне.</div>'}</div>`;
    const calendar = `<div class="section-heading"><h2>Игры клуба</h2><span class="micro">GOAL API</span></div><div class="match-list">${teamMatches.map(matchCard).join('') || '<div class="empty-note">Матчи не найдены.</div>'}</div>`;
    const roster = `<div class="section-heading"><h2>Игроки</h2><span class="micro">СОСТАВ КОМАНДЫ</span></div><div id="clubSquad" class="club-squad">${squadCache.has(clubKey) ? rosterMarkup(squadCache.get(clubKey), squadMetaCache.get(clubKey), clubKey) : '<div class="empty-note">Загружаю состав из GOAL API…</div>'}</div>`;
    const content = clubSection === 'календарь' ? calendar : clubSection === 'состав' ? roster : overview;
    if (clubSection === 'состав') setTimeout(() => loadClubSquad(clubKey), 0);
    return `<div class="page-head"><div><div class="page-kicker">МОЯ КОМАНДА · РПЛ</div><h1 class="page-title">Клуб</h1></div><button class="round-select" id="searchClubBtn">Сменить ↗</button></div><section class="club-hero"><div class="club-topline"><span class="club-chip">СЕЗОН 26—27${row ? ` / № ${idx + 1}` : ''}</span><button class="star ${favorites.has(clubKey) ? 'selected' : ''}" data-favorite-club="${safe(clubKey)}" aria-label="В избранное">☆</button></div><div class="club-identity">${clubBadge(clubKey)}<div><h1>${safe(c?.short || 'Клуб')}</h1><div class="club-city">${safe(c?.city || 'Россия')} · РОССИЯ</div></div></div><div class="club-stats"><div class="club-stat"><b>${row ? safe(row[6]) : '—'}</b><span>очков</span></div><div class="club-stat"><b>${row ? safe(row[1]) : '—'}</b><span>матчей</span></div><div class="club-stat"><b>${row ? safe(row[5]) : '—'}</b><span>мячи</span></div></div></section><div class="club-tabs">${[['обзор', 'обзор'], ['календарь', 'календарь'], ['состав', 'состав']].map(([value, label]) => `<button class="${clubSection === value ? 'active' : ''}" data-club-section="${value}">${label}</button>`).join('')}</div>${content}<p class="footnote">Составы и схемы — GOAL API; эмблема «Динамо Москва» — официальный файл клуба, остальные эмблемы — GOAL API. API-Football используется только как резерв для отсутствующих портретов. Если надёжного совпадения нет или изображение — общая заглушка, оставлены инициалы. Права на изображения обоих источников нужно подтвердить до публичного релиза.</p>`;
  }
  function liveClubPage() {
    const c = clubs[selectedClub] || clubs[Object.keys(clubs)[0]]; const idx = standings.findIndex((r) => r[0] === selectedClub); const row = idx >= 0 ? standings[idx] : null;
    const teamMatches = matches.filter((m) => m.home === selectedClub || m.away === selectedClub); const next = teamMatches.find((m) => m.status === 'soon') || teamMatches.find((m) => m.status === 'live');
    const goalDiff = row ? num(row[5].split('–')[0]) - num(row[5].split('–')[1]) : 0;
    const clubKey = selectedClub;
    const page = `<div class="page-head"><div><div class="page-kicker">МОЯ КОМАНДА · РПЛ</div><h1 class="page-title">Клуб</h1></div><button class="round-select" id="searchClubBtn">Сменить ↗</button></div><section class="club-hero"><div class="club-topline"><span class="club-chip">СЕЗОН 26—27${row ? ` / № ${idx + 1}` : ''}</span><button class="star ${favorites.has(selectedClub) ? 'selected' : ''}" data-favorite-club="${safe(selectedClub)}" aria-label="В избранное">☆</button></div><div class="club-identity">${clubBadge(selectedClub)}<div><h1>${safe(c?.short || 'Клуб')}</h1><div class="club-city">${safe(c?.city || 'Россия')} · РОССИЯ</div></div></div><div class="club-stats"><div class="club-stat"><b>${row ? safe(row[6]) : '—'}</b><span>очков</span></div><div class="club-stat"><b>${row ? safe(row[1]) : '—'}</b><span>матчей</span></div><div class="club-stat"><b>${row ? safe(row[5]) : '—'}</b><span>мячи</span></div></div></section><div class="club-tabs">${['обзор', 'календарь', 'новости'].map((v) => `<button class="${clubSection === v ? 'active' : ''}" data-club-section="${v}">${v}</button>`).join('')}</div>${clubSection === 'обзор' ? `<div class="section-heading"><h2>Следующий матч</h2><span class="micro">${next ? `ТУР ${next.round}` : 'НЕТ В РАСПИСАНИИ'}</span></div>${next ? matchCard(next) : '<div class="empty-note">Матч клуба не найден в текущей выдаче GOAL API.</div>'}<div class="club-data"><div class="data-tile"><b>${row ? `${row[2]}–${row[3]}–${row[4]}` : '—'}</b><span>победы · ничьи · поражения</span></div><div class="data-tile"><b>${row ? `${goalDiff > 0 ? '+' : ''}${goalDiff}` : '—'}</b><span>разница мячей</span></div></div><div class="section-heading"><h2>Матчи клуба</h2><button class="link-button" data-go="matches">Календарь ↗</button></div><div class="match-list">${teamMatches.slice(0, 3).map(matchCard).join('') || '<div class="empty-note">Матчей пока нет в загруженном окне.</div>'}</div><div class="section-heading"><h2>Состав клуба</h2><span class="micro">GOAL API</span></div><div id="clubSquad" class="club-squad"><div class="empty-note">Ростер появится после запроса к GOAL API.</div></div>` : clubSection === 'календарь' ? `<div class="section-heading"><h2>Игры клуба</h2><span class="micro">GOAL API</span></div><div class="match-list">${teamMatches.map(matchCard).join('') || '<div class="empty-note">Матчи не найдены.</div>'}</div>` : '<div class="empty-note">Новости не входят в первый этап интеграции.</div>'}<p class="footnote">Клубные данные и доступные фотографии загружены из GOAL API. Права на публичное использование эмблем и изображений нужно подтвердить до релиза.</p>`;
    if (clubSection === 'обзор') setTimeout(() => loadClubSquad(clubKey), 0);
    return page;
  }
  function liveOpenMatch(id) {
    const m = matches.find((entry) => String(entry.id) === String(id)); if (!m) return; modalMatch = m;
    const h = clubs[m.home], a = clubs[m.away]; if (!h || !a) return;
    const events = m.events.length ? m.events.map((e) => `<div class="event-row"><span class="event-time">${e[0]}</span><span class="event-main">${e[1]}</span><span class="event-side">${e[2]}</span></div>`).join('') : '<div class="empty-note">События для этого матча не пришли в текущем ответе GOAL API.</div>';
    const stats = m.stats.length ? m.stats.map((s) => {
      const homeValue = Number.isFinite(Number(s[3])) ? Number(s[3]) : Number(s[1]) || 0;
      const awayValue = Number.isFinite(Number(s[4])) ? Number(s[4]) : Number(s[2]) || 0;
      const sum = Math.max(0, homeValue) + Math.max(0, awayValue);
      const homeShare = sum ? Math.max(0, homeValue) / sum * 100 : 50;
      return `<div class="stat-row"><span>${safe(s[1])}</span><div><div class="stat-label">${safe(s[0])}</div><div class="stat-track"><div class="stat-fill" style="width:${homeShare}%"></div></div></div><span>${safe(s[2])}</span></div>`;
    }).join('') : '<div class="empty-note">Статистика зависит от покрытия сезона и доступного endpoint GOAL API.</div>';
    sheet.innerHTML = `<div class="sheet-handle"></div><div class="sheet-head"><div><h2>Матч-центр</h2><p>${m.date} · ${m.venue || 'Стадион не указан'} · GOAL API</p></div><button class="close-button" data-close>×</button></div><div class="match-card" data-live-match="${safe(m.id)}" style="cursor:default"><div class="match-top"><span class="match-round">ТУР ${m.round} · РПЛ</span>${statusText(m)}</div><div class="match-row"><div class="team-side">${clubBadge(m.home)}<span class="team-name">${safe(h.short)}</span></div><div class="score ${m.status === 'soon' ? 'upcoming' : ''}">${safe(m.score)}</div><div class="team-side away"><span class="team-name">${safe(a.short)}</span>${clubBadge(m.away)}</div></div><div class="match-foot"><span class="venue">${safe(m.venue || 'Стадион не указан')}</span><span>СЧЁТ: GOAL API</span></div></div><div class="section-heading"><h2>Составы и схемы</h2><span class="micro">GOAL API</span></div><div id="matchLineups" class="match-lineups"><div class="empty-note">Составы запрашиваются при открытии матча.</div></div><div class="section-heading"><h2>События</h2><span class="micro">${m.events.length ? `${m.events.length} ЭПИЗОДА` : 'НЕТ ДАННЫХ'}</span></div>${events}<div class="section-heading"><h2>Цифры матча</h2><span class="micro">${m.stats.length ? 'GOAL API' : 'НЕ В ОТВЕТЕ'}</span></div><div class="stats-block">${stats}</div><div class="empty-note">Доступность событий и статистики зависит от покрытия и квоты API.</div>`;
    openOverlay();
    loadLineups(m);
  }
  let liveBindingInstalled = false;
  function installLiveBinding() {
    if (liveBindingInstalled) return;
    liveBindingInstalled = true;
    const originalBind = window.bind;
    window.bind = function () {
      originalBind();
      document.querySelectorAll('[data-fav-match], [data-favorite-club]').forEach((button) => {
        button.addEventListener('click', () => { try { localStorage.setItem('temp-rpl-favorites', JSON.stringify([...favorites])); } catch { /* storage is optional */ } });
      });
    };
  }
  function applyPayload(payload) {
    makeCalendar();
    const fixtureRows = findArray(payload.fixtures || payload.matches || payload, ['fixtures', 'matches', 'items', 'results', 'data']);
    const tableRows = findArray(payload.standings || {}, ['standings', 'table', 'entries', 'rows', 'data']);
    const hasFixtureArray = Array.isArray(payload.fixtures) || Array.isArray(payload.fixtures?.data) || Array.isArray(payload.matches) || Array.isArray(payload.matches?.data);
    if (!hasFixtureArray || !tableRows.length) throw new Error('Unexpected GOAL API response shape');
    const newMatches = fixtureRows.map(fixture).filter((m) => m.dateKey).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time));
    const newTable = tableRows.map(standing);
    if (fixtureRows.length && !newMatches.length) throw new Error('GOAL API fixture dates could not be parsed');
    matches.splice(0, matches.length, ...newMatches);
    if (newMatches.length) {
      const current = newMatches.find((m) => m.status === 'live') || newMatches.find((m) => m.status === 'soon' && m.dateKey >= moscowDateKey()) || newMatches[0];
      window.apiRound = current?.round || 13; round = window.apiRound;
      if (current?.dateKey) setCalendarWeek(startOfWeek(current.dateKey), current.dateKey);
    } else { window.apiRound = 13; round = 13; }
    standings.splice(0, standings.length, ...newTable);
    window.isLiveData = true; window.dataFreshAt = payload.fetchedAt || new Date().toISOString(); window.fixtureHistoryComplete = payload.fixtureHistoryComplete !== false;
    window.home = liveHome; window.matchesPage = liveMatchesPage; window.tablePage = liveTablePage; window.clubPage = liveClubPageRoster; window.openMatch = liveOpenMatch;
    window.loadMatchLineups = loadLineups;
    installLiveBinding();
    window.installDetailedMatchLayer?.();
    startLiveStream();
    setDataRibbon(); render();
  }
  function setRefreshBusy(busy) {
    const button = document.getElementById('refreshBtn');
    button?.classList.toggle('is-loading', busy);
    button?.setAttribute('aria-busy', busy ? 'true' : 'false');
    button?.setAttribute('title', busy ? 'Обновляем данные' : 'Обновить данные');
    document.querySelector('.prototype-strip')?.classList.toggle('is-syncing', busy);
  }
  let refreshPending = null;
  async function refresh({ quiet = false } = {}) {
    if (refreshPending) return refreshPending;
    setRefreshBusy(true);
    const request = (async () => {
      const response = await fetch(`/api/rpl?season=${encodeURIComponent(window.rplSeason || '2026')}&_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`GOAL API ${response.status}`);
      applyPayload(await response.json()); if (!quiet) showToast('Данные обновлены');
    })();
    refreshPending = request;
    try { return await request; }
    finally { if (refreshPending === request) refreshPending = null; setRefreshBusy(false); }
  }

  const saved = localStorage.getItem('temp-rpl-favorites');
  if (saved) { try { favorites = new Set(JSON.parse(saved)); } catch { /* keep demo default */ } }
  window.isLiveData = false; window.goalLiveStreamState = 'idle'; window.apiRound = 13; window.rplSeason = '2026';
  setDataRibbon();
  setRefreshBusy(true);
  window.refreshGoalData = () => refresh().catch(() => showToast(window.isLiveData ? 'Не удалось обновить данные' : 'Демо-режим: добавьте GOAL_API_KEY на сервер'));
  fetch('/api/status', { cache: 'no-store' }).then((r) => r.ok ? r.json() : ({ configured: false })).then((status) => {
    if (!status.configured) return;
    window.rplSeason = status.season || '2026';
    return refresh({ quiet: true }).catch((error) => { console.warn('GOAL API unavailable; retaining explicit demo view', error); setDataRibbon(true); render(); });
  }).catch(() => setDataRibbon()).finally(() => { if (!refreshPending) setRefreshBusy(false); });
  setInterval(() => { if (window.isLiveData && document.visibilityState === 'visible') refresh({ quiet: true }).catch((e) => console.warn('GOAL API refresh failed', e)); }, 5 * 60 * 1000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js').catch((e) => console.warn('PWA worker unavailable', e));
})();
