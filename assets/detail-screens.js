(() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const detailSource = () => window.isLiveData ? 'GOAL API · СЕЗОН 2026/27' : 'ДЕМО-СРЕЗ · НЕ LIVE';
  let detailRoute = null;
  let installedDetailRender = null;
  let installedOpenMatch = null;
  let profileParent = null;

  function teamLabel(key) { return clubs?.[key]?.short || clubs?.[key]?.name || key || 'Клуб'; }
  function standingFor(key) { return standings?.find((row) => row[0] === key) || null; }
  function teamRank(key) {
    const index = standings?.findIndex((row) => row[0] === key) ?? -1;
    return index >= 0 ? index + 1 : null;
  }
  function scoreOf(match) {
    const value = String(match?.score || '');
    const found = value.match(/(^|\s)(\d+)\s*[:–—-]\s*(\d+)(\s|$)/);
    return found ? [Number(found[2]), Number(found[3])] : null;
  }
  function resultForTeam(match, key) {
    const score = scoreOf(match);
    if (!score) return null;
    const own = match.home === key ? score[0] : score[1];
    const other = match.home === key ? score[1] : score[0];
    return own > other ? 'win' : own === other ? 'draw' : 'loss';
  }
  function recentForm(key, limit = 5) {
    return (matches || []).filter((match) => match.status === 'finished' && (match.home === key || match.away === key) && scoreOf(match))
      .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)) || String(b.time).localeCompare(String(a.time)))
      .slice(0, limit).map((match) => ({ match, result: resultForTeam(match, key), opponent: match.home === key ? match.away : match.home, score: scoreOf(match) }));
  }
  function resultText(result) { return result === 'win' ? 'Победа' : result === 'draw' ? 'Ничья' : 'Поражение'; }
  function goalDifference(row) {
    const goals = String(row?.[5] || '').match(/\d+/g) || [];
    return Number(goals[0] || 0) - Number(goals[1] || 0);
  }
  function seasonCompare(match) {
    const home = standingFor(match.home); const away = standingFor(match.away);
    if (!home && !away) return '<div class="empty-note">Таблица текущего сезона не пришла от поставщика.</div>';
    const analytics = window.rplSeasonAnalytics;
    const homeVenue = analytics?.teamSplits(matches, match.home).home;
    const awayVenue = analytics?.teamSplits(matches, match.away).away;
    const rate = (row) => Number(row?.[1]) ? ((Number(String(row[5] || '0–0').split('–')[0]) || 0) / Number(row[1])).toFixed(2).replace('.', ',') : '—';
    const record = (split) => split?.played ? `${split.won}–${split.drawn}–${split.lost}` : '—';
    const rows = [
      ['Место', home ? `${teamRank(match.home) || '—'}` : '—', away ? `${teamRank(match.away) || '—'}` : '—'],
      ['Очки', home?.[6] ?? '—', away?.[6] ?? '—'],
      ['Матчи', home?.[1] ?? '—', away?.[1] ?? '—'],
      ['В–Н–П', home ? `${home[2]}–${home[3]}–${home[4]}` : '—', away ? `${away[2]}–${away[3]}–${away[4]}` : '—'],
      ['Мячи', home?.[5] ?? '—', away?.[5] ?? '—'],
      ['Разница', home ? `${goalDifference(home) > 0 ? '+' : ''}${goalDifference(home)}` : '—', away ? `${goalDifference(away) > 0 ? '+' : ''}${goalDifference(away)}` : '—'],
      ['Голов за матч', rate(home), rate(away)],
      ['Дом / гость · В–Н–П', record(homeVenue), record(awayVenue)]
    ];
    return `<section class="detail-card season-compare-card" id="season-comparison" aria-label="Сравнение команд в таблице сезона">
      <div class="detail-section-head"><div><span class="detail-kicker">СЕЗОН 2026/27</span><h2>Таблица и цифры</h2></div><span class="detail-source">${detailSource()}</span></div>
      <div class="compare-team-head"><span></span><button type="button" data-detail-club="${escape(match.home)}">${clubBadge(match.home, 'compare-crest')}<strong>${escape(teamLabel(match.home))}</strong></button><button type="button" data-detail-club="${escape(match.away)}">${clubBadge(match.away, 'compare-crest')}<strong>${escape(teamLabel(match.away))}</strong></button></div>
      <div class="compare-season-rows">${rows.map(([label, homeValue, awayValue]) => `<div class="compare-season-row"><span>${label}</span><b>${escape(homeValue)}</b><b>${escape(awayValue)}</b></div>`).join('')}</div>
      <p class="detail-footnote">Позиции и общие показатели — из таблицы сезона; разрез дома/в гостях вычислен только по завершённым матчам в загруженной истории.</p>
    </section>`;
  }
  function headToHead(match) {
    const result = window.rplSeasonAnalytics?.headToHead(matches, match.home, match.away);
    if (!result) return '';
    const { matches: direct, summary } = result;
    const scope = window.isLiveData ? (window.fixtureHistoryComplete === false ? 'ТЕКУЩИЙ СРЕЗ · ИСТОРИЯ НЕПОЛНАЯ' : 'СЕЗОН 2026/27') : 'ДЕМО-СРЕЗ · НЕ LIVE';
    const list = direct.slice(0, 5).map((item) => {
      const date = item.dateKey ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${item.dateKey}T12:00:00`)) : 'Дата не указана';
      return `<div class="h2h-result"><small>${escape(date)} · тур ${escape(item.round || '—')}</small><span>${clubBadge(item.home, 'form-crest')}<b>${escape(teamLabel(item.home))}</b><strong>${escape(item.score)}</strong><b>${escape(teamLabel(item.away))}</b>${clubBadge(item.away, 'form-crest')}</span></div>`;
    }).join('');
    const summaryLine = `${teamLabel(match.home)} ${summary.first} · ${summary.draws} ничьих · ${summary.second} ${teamLabel(match.away)}`;
    const note = window.isLiveData
      ? (window.fixtureHistoryComplete === false ? 'Очные результаты найдены только в неполной загруженной истории текущего сезона.' : 'Учтены только завершённые очные матчи сезона 2026/27; это не полная история клубов.')
      : 'Демо-примеры нужны только для проверки интерфейса и не являются фактической историей.';
    return `<section class="detail-card h2h-card" id="match-h2h"><div class="detail-section-head"><div><span class="detail-kicker">ОЧНЫЕ ВСТРЕЧИ · ЗАВЕРШЁННЫЕ</span><h2>В этом сезоне</h2></div><span class="detail-source">${escape(scope)}</span></div>${direct.length ? `<div class="h2h-summary"><strong>${direct.length}</strong><span>${escape(summaryLine)}</span></div><div class="h2h-list">${list}</div>${direct.length > 5 ? `<p class="detail-footnote">Показаны 5 из ${direct.length} найденных матчей.</p>` : ''}` : `<div class="empty-note">В загруженной истории сезона завершённых очных матчей не найдено.</div>`}<p class="detail-footnote">${escape(note)}</p></section>`;
  }
  function formTeam(key) {
    const form = recentForm(key);
    const chips = form.map(({ result, opponent, score, match }) => {
      const own = match.home === key ? score[0] : score[1];
      const against = match.home === key ? score[1] : score[0];
      return `<div class="form-result-card"><span class="form-result ${result}" aria-label="${resultText(result)}">${result === 'win' ? 'В' : result === 'draw' ? 'Н' : 'П'}</span><span class="form-opponent">${clubBadge(opponent, 'form-crest')}<small>${escape(teamLabel(opponent))}</small></span><b class="form-score">${own} : ${against}</b><small class="form-result-label">${resultText(result)}</small></div>`;
    }).join('');
    const record = standingFor(key);
    const limitNote = form.length < 5
      ? `<p class="detail-footnote">Показываем ${form.length} из 5 последних завершённых матчей${window.fixtureHistoryComplete === false ? '; история поставщика помечена как неполная' : ''}. Ничего не дополняем вымышленными результатами.</p>`
      : '';
    const seasonRecord = record ? `<span class="form-season-record">СЕЗОН · ${record[2]}–${record[3]}–${record[4]}</span>` : '';
    return `<section class="form-team"><div class="form-team-head"><button type="button" data-detail-club="${escape(key)}">${clubBadge(key, 'form-team-crest')}<strong>${escape(teamLabel(key))}</strong></button><span>${teamRank(key) ? `№ ${teamRank(key)} · ${record?.[6] ?? '—'} оч. · ${form.length}/5` : `${form.length}/5 матчей`}</span></div><div class="form-five" aria-label="${escape(teamLabel(key))}: последние ${form.length} результата">${chips || '<div class="empty-note">В загруженной истории нет завершённых матчей.</div>'}</div>${seasonRecord}${limitNote}</section>`;
  }
  function eventList(match) {
    const events = Array.isArray(match.events) ? match.events : [];
    if (!events.length) {
      const state = match.detailDataStatus?.events;
      const message = match.status === 'soon' ? 'До стартового свистка событий матча ещё нет.' : state === 'failed' ? 'Не удалось получить события GOAL API. Попробуйте открыть матч позже.' : state === 'empty' ? 'GOAL API не передал события для этого матча.' : 'События не пришли в текущем ответе поставщика.';
      return `<div class="empty-note">${message}</div>`;
    }
    return `<div class="detail-events">${events.map((event) => `<div class="detail-event"><time>${escape(event[0])}</time><span>${escape(event[1])}</span><small>${escape(event[2])}</small></div>`).join('')}</div>`;
  }
  function matchStats(match) {
    if (match.status === 'soon') return '<div class="empty-note">Статистика появится после стартового свистка. Предматчевые нули здесь не показываем.</div>';
    const stats = Array.isArray(match.stats) ? match.stats : [];
    if (!stats.length) {
      const state = match.detailDataStatus?.statistics;
      return `<div class="empty-note">${state === 'failed' ? 'Не удалось получить статистику GOAL API. Попробуйте открыть матч позже.' : state === 'empty' ? 'GOAL API не передал статистику для этого матча.' : 'Показатели матча не пришли в ответе поставщика.'}</div>`;
    }
    return `<div class="match-stats-list">${stats.map(([label, home, away, homeValue, awayValue]) => {
      const homeNumber = Number.isFinite(Number(homeValue)) ? Number(homeValue) : Number(home) || 0;
      const awayNumber = Number.isFinite(Number(awayValue)) ? Number(awayValue) : Number(away) || 0;
      const sum = Math.max(0, homeNumber) + Math.max(0, awayNumber);
      const homeShare = sum ? Math.max(0, homeNumber) / sum * 100 : 50;
      return `<div class="match-stat-row"><div><b>${escape(home)}</b><span>${escape(label)}</span><b>${escape(away)}</b></div><div class="match-stat-track"><i style="width:${homeShare}%"></i></div></div>`;
    }).join('')}</div><p class="detail-footnote">${window.isLiveData ? 'Показаны только значения, переданные поставщиком для этого матча.' : 'Демо-значения для проверки интерфейса, не live-данные.'}</p>`;
  }
  function matchPage(match) {
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const dateLabel = match.dateKey ? new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${match.dateKey}T12:00:00`)) : match.date;
    const matchTime = match.status === 'soon' ? (String(match.time || '').match(/(\d{1,2}:\d{2})/)?.[1] || (/^\d{1,2}:\d{2}$/.test(String(match.score || '')) ? String(match.score) : '')) : '';
    const status = match.status === 'soon' ? (matchTime ? `Начало · ${matchTime}` : 'Время уточняется') : match.status === 'live' ? `Идёт · ${match.time}` : 'Завершён';
    const standingsCaption = [teamRank(match.home) && `${teamRank(match.home)}-е место`, teamRank(match.away) && `${teamRank(match.away)}-е место`].filter(Boolean).join(' · ');
    return `<div class="detail-page match-detail-page">
      <div class="detail-toolbar"><button type="button" class="detail-back" data-detail-back>← <span>Назад</span></button><span class="detail-toolbar-label">МАТЧ · ТУР ${escape(match.round || '—')}</span><button type="button" class="detail-star ${favoriteMatches.has(String(match.id)) ? 'selected' : ''}" data-detail-favorite="${escape(match.id)}" aria-label="${favoriteMatches.has(String(match.id)) ? 'Убрать матч из избранного' : 'Добавить матч в избранное'}">☆</button></div>
      <header class="match-detail-hero"><div class="detail-kicker">РПЛ · ${escape(dateLabel)}${matchTime ? ` · ${escape(matchTime)}` : ''}</div><div class="match-detail-teams"><button type="button" class="detail-team-link" data-detail-club="${escape(match.home)}">${clubBadge(match.home, 'detail-team-crest')}<strong>${escape(home.short || home.name || 'Хозяева')}</strong><small>${escape(home.city || 'Россия')}</small></button><div class="match-detail-score"><span>${escape(match.status === 'soon' ? '—' : match.score || '—')}</span><small>${escape(status)}</small></div><button type="button" class="detail-team-link away" data-detail-club="${escape(match.away)}">${clubBadge(match.away, 'detail-team-crest')}<strong>${escape(away.short || away.name || 'Гости')}</strong><small>${escape(away.city || 'Россия')}</small></button></div><div class="match-detail-venue"><span>${escape(match.venue || 'Стадион не указан')}</span><small>${escape(detailSource())}</small></div></header>
      <nav class="detail-anchor-nav" aria-label="Разделы матча"><button type="button" data-detail-anchor="matchLineupsSection">Составы</button><button type="button" data-detail-anchor="season-comparison">Сезон</button><button type="button" data-detail-anchor="match-h2h">Очные</button><button type="button" data-detail-anchor="match-form">Форма</button><button type="button" data-detail-anchor="match-events">События</button><button type="button" data-detail-anchor="match-statistics">Статистика</button></nav>
      <section class="detail-card lineups-card" id="matchLineupsSection"><div class="detail-section-head"><div><span class="detail-kicker">${match.status === 'soon' ? 'ПЕРЕД МАТЧЕМ' : 'СОСТАВЫ МАТЧА'}</span><h2>Составы</h2></div><span class="detail-source">${match.status === 'soon' ? 'ЕЩЁ НЕ ОПУБЛИКОВАНЫ' : 'GOAL API'}</span></div><div id="matchLineups" class="match-lineups" aria-live="polite">${match.status === 'soon' ? '<div class="lineups-pending"><span class="lineups-pending-mark">XI</span><span><strong>Стартовые составы пока не опубликованы</strong><small>Появятся здесь, когда GOAL передаст подтверждённые данные</small></span></div>' : '<div class="empty-note">Запрашиваю подтверждённые составы…</div>'}</div></section>
      ${seasonCompare(match)}
      ${headToHead(match)}
      <section class="detail-card form-card" id="match-form"><div class="detail-section-head"><div><span class="detail-kicker">ПОСЛЕДНИЕ ЗАВЕРШЁННЫЕ</span><h2>Форма команд</h2></div><span class="detail-source">ДО 5 ИГР</span></div><div class="match-form-grid">${formTeam(match.home)}${formTeam(match.away)}</div><div class="form-legend" aria-label="В означает победа, Н означает ничья, П означает поражение"><span><i class="win">В</i> Победа</span><span><i class="draw">Н</i> Ничья</span><span><i class="loss">П</i> Поражение</span></div></section>
      <section class="detail-card" id="match-events"><div class="detail-section-head"><div><span class="detail-kicker">ХОД МАТЧА</span><h2>События</h2></div></div>${eventList(match)}</section>
      <section class="detail-card" id="match-statistics"><div class="detail-section-head"><div><span class="detail-kicker">${match.status === 'soon' ? 'ПОСЛЕ СТАРТА' : 'ПО МАТЧУ'}</span><h2>Статистика матча</h2></div></div>${matchStats(match)}</section>
      <p class="detail-data-note">${window.isLiveData ? `Источник: GOAL API · актуальность ${escape(window.dataFreshAt ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(window.dataFreshAt)) : 'при последнем обновлении')}. ${escape(standingsCaption)}` : 'Это демонстрационный экран. Расписание и результаты в демо-режиме не являются фактическими данными.'}</p>
    </div>`;
  }
  function playerProfilePage(player) {
    const key = player.team && clubs[player.team] ? player.team : '';
    const club = key ? clubs[key] : null;
    const photo = /^https:\/\/(media\.goal-api\.com|media\.api-sports\.io)\//.test(player.photo || '') ? player.photo : '';
    const initials = String(player.name || 'Игрок').trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toUpperCase();
    return `<div class="detail-page player-detail-page">
      <div class="detail-toolbar"><button type="button" class="detail-back" data-detail-back>← <span>Назад</span></button><span class="detail-toolbar-label">ПРОФИЛЬ ИГРОКА</span><span class="detail-toolbar-spacer"></span></div>
      <header class="player-profile-hero"><div class="player-profile-avatar">${photo ? `<img src="${escape(photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>${escape(initials || 'И')}</span>` : `<span>${escape(initials || 'И')}</span>`}</div><div class="player-profile-copy"><span class="detail-kicker">${escape(player.position || 'ИГРОК РПЛ')}</span><h1>${escape(player.name || 'Игрок')}</h1><div class="player-profile-club">${key ? `${clubBadge(key, 'player-club-crest')}<span>${escape(club.short || club.name)}</span>` : '<span>Клуб РПЛ</span>'}</div></div></header>
      <section class="detail-card player-facts"><div class="player-fact"><span>Номер</span><b>${player.number ? `№ ${escape(player.number)}` : '—'}</b></div><div class="player-fact"><span>Позиция</span><b>${escape(player.position || '—')}</b></div><div class="player-fact"><span>Возраст</span><b>${player.age ? `${escape(player.age)} лет` : '—'}</b></div></section>
      <section class="detail-card"><div class="detail-section-head"><div><span class="detail-kicker">2026/27</span><h2>Статистика сезона</h2></div><span class="detail-source">${detailSource()}</span></div><div class="player-stats-unavailable"><strong>Личная сезонная статистика пока недоступна</strong><p>Подключённый источник передаёт состав и матчевые lineups, но не даёт в этом приложении сезонные показатели игрока. Поэтому матчи, голы и карточки не оцениваются по неполной выборке.</p></div></section>
      ${key ? `<section class="detail-card player-club-link-card"><span class="detail-kicker">КОМАНДА</span><button type="button" data-detail-club="${escape(key)}">${clubBadge(key, 'player-club-crest')}<strong>Открыть профиль ${escape(club.short || club.name)}</strong><span aria-hidden="true">↗</span></button></section>` : ''}
      <p class="detail-data-note">Состав и доступные сведения — GOAL API${player.photo ? ' · портрет проверенного источника изображений' : ''}. Возраст, номер и позиция показываются только если пришли от источника.</p>
    </div>`;
  }
  function playerFromButton(button) {
    return {
      name: button.dataset.playerName || 'Игрок', number: button.dataset.playerNumber || '',
      position: button.dataset.playerPosition || '', age: button.dataset.playerAge || '',
      photo: button.dataset.playerPhoto || '', team: button.dataset.playerTeam || ''
    };
  }
  function renderRoute() {
    if (!detailRoute) return false;
    const root = document.getElementById('screen');
    if (!root) return true;
    if (detailRoute.type === 'match') {
      const match = matches.find((item) => String(item.id) === String(detailRoute.id));
      if (!match) { detailRoute = null; return false; }
      modalMatch = match;
      root.innerHTML = matchPage(match);
      if (window.loadMatchLineups) requestAnimationFrame(() => window.loadMatchLineups(match));
    } else if (detailRoute.type === 'player') {
      root.innerHTML = playerProfilePage(detailRoute.player);
    }
    root.querySelectorAll('[data-detail-back]').forEach((button) => button.addEventListener('click', backFromDetail));
    root.querySelectorAll('[data-detail-club]').forEach((button) => button.addEventListener('click', () => openClub(button.dataset.detailClub)));
    root.querySelectorAll('[data-detail-anchor]').forEach((button) => button.addEventListener('click', () => document.getElementById(button.dataset.detailAnchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })));
    root.querySelector('[data-detail-favorite]')?.addEventListener('click', (event) => {
      const id = String(event.currentTarget.dataset.detailFavorite);
      if (favoriteMatches.has(id)) favoriteMatches.delete(id); else favoriteMatches.add(id);
      persistSet('temp-rpl:favorite-matches', favoriteMatches);
      window.showToast?.(favoriteMatches.has(id) ? 'Матч добавлен в избранное' : 'Матч удалён из избранного');
      renderRoute();
    });
    return true;
  }
  function openClub(key) {
    if (!clubs[key]) return;
    detailRoute = null;
    selectedClub = key;
    clubSection = 'обзор';
    tab = 'club';
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function backFromDetail() {
    if (detailRoute?.type === 'player' && profileParent?.type === 'match') {
      detailRoute = profileParent;
      profileParent = null;
      window.render();
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    if (detailRoute?.type === 'player' && profileParent?.type === 'app') {
      const top = profileParent.scrollTop;
      detailRoute = null;
      profileParent = null;
      window.render();
      window.scrollTo({ top, behavior: 'instant' });
      return;
    }
    const top = detailRoute?.previousScroll || 0;
    detailRoute = null;
    window.render();
    window.scrollTo({ top, behavior: 'instant' });
  }
  function openMatchDetail(id) {
    const match = matches.find((item) => String(item.id) === String(id));
    if (!match) return;
    detailRoute = { type: 'match', id: String(id), previousScroll: window.scrollY || 0 };
    modalMatch = match;
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function formMarkupForClub(key) {
    const form = recentForm(key);
    const row = standingFor(key);
    const splits = window.rplSeasonAnalytics?.teamSplits(matches, key);
    const splitSummary = (label, split) => `<div class="club-split-item"><span>${label}</span><b>${split?.played ? `${split.won}–${split.drawn}–${split.lost}` : '—'}</b><small>${split?.played ? `${split.played} игр · мячи ${split.goalsFor}–${split.goalsAgainst}` : 'Матчей пока нет'}</small></div>`;
    const seasonSplits = splits?.total.played ? `<div class="club-split-grid">${splitSummary('Дома · В–Н–П', splits.home)}${splitSummary('В гостях · В–Н–П', splits.away)}<div class="club-split-item"><span>Сухие матчи</span><b>${splits.total.cleanSheets}</b><small>в ${splits.total.played} завершённых играх</small></div></div><p class="detail-footnote">Разрез рассчитан по доступным завершённым матчам${window.isLiveData ? (window.fixtureHistoryComplete === false ? ' · история поставщика неполная' : ' сезона 2026/27') : ' демо-среза, не live'}; будущие и текущие матчи не считаются.</p>` : '<div class="empty-note">Домашние и гостевые показатели появятся после завершённых матчей.</div>';
    const results = form.map(({ result, opponent, score, match }) => {
      const own = match.home === key ? score[0] : score[1];
      const against = match.home === key ? score[1] : score[0];
      const date = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(`${match.dateKey}T12:00:00`));
      return `<button type="button" class="club-form-match" data-open-form-match="${escape(match.id)}"><span class="form-result ${result}" aria-label="${resultText(result)}">${result === 'win' ? 'В' : result === 'draw' ? 'Н' : 'П'}</span><span>${clubBadge(opponent, 'form-crest')}<strong>${escape(teamLabel(opponent))}</strong></span><b>${own} : ${against}</b><small>${date} · ${resultText(result)}</small></button>`;
    }).join('');
    return `<section class="club-form-section"><div class="detail-section-head"><div><span class="detail-kicker">ПОСЛЕДНИЕ ЗАВЕРШЁННЫЕ</span><h2>Форма · до 5 матчей</h2></div><span class="detail-source">${detailSource()}</span></div>${row ? `<div class="club-form-summary"><b>${teamRank(key) || '—'}<small>место</small></b><b>${row[6]}<small>очков</small></b><b>${row[2]}–${row[3]}–${row[4]}<small>В–Н–П за сезон</small></b><b>${row[5]}<small>мячи</small></b></div>` : '<div class="empty-note">Клуба пока нет в текущей таблице.</div>'}<div class="club-splits"><div class="detail-section-head"><div><span class="detail-kicker">СЕЗОННЫЙ РАЗРЕЗ</span><h2>Дома и в гостях</h2></div></div>${seasonSplits}</div><div class="club-form-list">${results || '<div class="empty-note">В загруженной истории нет завершённых матчей.</div>'}</div>${form.length < 5 ? `<p class="detail-footnote">Показываем ${form.length} из 5 последних завершённых матчей${window.fixtureHistoryComplete === false ? ' · история поставщика неполная' : ''}. Результаты не дополнены демо-данными.</p>` : ''}</section>`;
  }
  function addClubForm() {
    if (tab !== 'club' || clubSection !== 'обзор') return;
    const root = document.getElementById('screen');
    if (!root || !root.querySelector('.club-hero') || root.querySelector('.club-form-section')) return;
    const anchor = root.querySelector('.club-insights') || root.querySelector('.club-tabs');
    if (anchor) anchor.insertAdjacentHTML('afterend', formMarkupForClub(selectedClub));
    root.querySelectorAll('[data-open-form-match]').forEach((button) => button.addEventListener('click', () => openMatchDetail(button.dataset.openFormMatch)));
  }
  function installDetailedMatchLayer() {
    if (typeof window.render === 'function' && window.render !== installedDetailRender) {
      const renderBelowDetails = window.render;
      installedDetailRender = function (...args) {
        if (detailRoute && renderRoute()) return;
        const result = renderBelowDetails.apply(this, args);
        addClubForm();
        return result;
      };
      window.render = installedDetailRender;
    }
    if (typeof window.openMatch === 'function' && window.openMatch !== installedOpenMatch) {
      const original = window.openMatch;
      installedOpenMatch = function (id) { openMatchDetail(id); };
      installedOpenMatch.__detailedMatchLayer = true;
      window.openMatch = installedOpenMatch;
      installedOpenMatch.__original = original;
    }
  }
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-player-profile]');
    if (!button) return;
    event.preventDefault();
    profileParent = detailRoute?.type === 'match' ? detailRoute : { type: 'app', scrollTop: window.scrollY || 0 };
    detailRoute = { type: 'player', player: playerFromButton(button) };
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  window.fixtureHistoryComplete = true;
  window.refreshDetailedMatch = (id) => {
    if (detailRoute?.type === 'match' && detailRoute.id === String(id)) window.render();
  };
  window.installDetailedMatchLayer = installDetailedMatchLayer;
  installDetailedMatchLayer();
})();
