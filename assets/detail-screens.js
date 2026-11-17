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
    const homeSplits = analytics?.teamSplits(matches, match.home);
    const awaySplits = analytics?.teamSplits(matches, match.away);
    const rate = (row) => Number(row?.[1]) ? ((Number(String(row[5] || '0–0').split('–')[0]) || 0) / Number(row[1])).toFixed(2).replace('.', ',') : '—';
    const record = (split) => split?.played ? `${split.won}–${split.drawn}–${split.lost}` : '—';
    const homeRank = teamRank(match.home); const awayRank = teamRank(match.away);
    const homePoints = Number(home?.[6]) || 0; const awayPoints = Number(away?.[6]) || 0;
    const homeRate = Number(rate(home).replace(',', '.')) || 0; const awayRate = Number(rate(away).replace(',', '.')) || 0;
    const metric = (label, left, right, leftNumber, rightNumber) => {
      const max = Math.max(leftNumber, rightNumber, 0);
      const leftWidth = max ? leftNumber / max * 100 : 0;
      const rightWidth = max ? rightNumber / max * 100 : 0;
      return `<div class="season-duel-metric"><div class="season-duel-values"><b>${escape(left)}</b><span>${label}</span><b>${escape(right)}</b></div><div class="season-duel-bars" aria-hidden="true"><span class="season-duel-bar home"><i style="width:${leftWidth}%"></i></span><span class="season-duel-bar away"><i style="width:${rightWidth}%"></i></span></div></div>`;
    };
    const rows = [
      ['Матчи', home?.[1] ?? '—', away?.[1] ?? '—'],
      ['Победы · ничьи · поражения', home ? `${home[2]}–${home[3]}–${home[4]}` : '—', away ? `${away[2]}–${away[3]}–${away[4]}` : '—'],
      ['Забито · пропущено', home?.[5] ?? '—', away?.[5] ?? '—'],
      ['Разница мячей', home ? `${goalDifference(home) > 0 ? '+' : ''}${goalDifference(home)}` : '—', away ? `${goalDifference(away) > 0 ? '+' : ''}${goalDifference(away)}` : '—'],
      ['Дома · В–Н–П', record(homeSplits?.home), record(awaySplits?.home)],
      ['В гостях · В–Н–П', record(homeSplits?.away), record(awaySplits?.away)]
    ];
    return `<section class="detail-card season-compare-card" id="season-comparison" aria-label="Сравнение команд в таблице сезона">
      <div class="detail-section-head"><div><span class="detail-kicker">СЕЗОН 2026/27 · ТУРНИР</span><h2>Сезон команд</h2></div><span class="detail-source">${detailSource()}</span></div>
      <div class="season-duel-teams"><button type="button" data-detail-club="${escape(match.home)}">${clubBadge(match.home, 'compare-crest')}<strong>${escape(teamLabel(match.home))}</strong><small>№ ${homeRank || '—'} · ${home?.[6] ?? '—'} очков</small></button><button type="button" data-detail-club="${escape(match.away)}">${clubBadge(match.away, 'compare-crest')}<strong>${escape(teamLabel(match.away))}</strong><small>№ ${awayRank || '—'} · ${away?.[6] ?? '—'} очков</small></button></div>
      <div class="season-duel-chart">${metric('Очки', home?.[6] ?? '—', away?.[6] ?? '—', homePoints, awayPoints)}${metric('Голов за матч', rate(home), rate(away), homeRate, awayRate)}</div>
      <div class="season-facts">${rows.map(([label, homeValue, awayValue]) => `<div class="season-fact-row"><span>${label}</span><b>${escape(homeValue)}</b><b>${escape(awayValue)}</b></div>`).join('')}</div>
      <p class="detail-footnote">Место и общие показатели — из таблицы сезона. Домашние и гостевые разрезы учитывают только завершённые матчи в загруженной истории.</p>
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
      const message = match.status === 'soon' ? 'До стартового свистка событий матча ещё нет.' : state === 'failed' ? 'Не удалось получить события. Попробуйте открыть матч позже.' : state === 'empty' ? 'Источник не передал события этого матча.' : window.isLiveData ? 'Загружаем ход матча…' : 'В демо-данных нет событий этого матча.';
      return `<div class="empty-note">${message}</div>`;
    }
    const minuteValue = (value) => {
      const found = String(value || '').match(/(\d+)(?:\s*\+\s*(\d+))?/);
      return found ? Number(found[1]) + Number(found[2] || 0) / 100 : null;
    };
    const ordered = events.map((event, index) => ({ event, index, minute: minuteValue(event[0]) }));
    if (ordered.every((item) => item.minute !== null)) ordered.sort((a, b) => a.minute - b.minute || a.index - b.index);
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const belongsTo = (team, key) => {
      const label = String(team || '').toLocaleLowerCase('ru-RU');
      const club = clubs[key] || {};
      if (label && window.rplClubKeyForName?.(label) === key) return true;
      return Boolean(label) && [club.short, club.name].filter(Boolean).some((name) => {
        const normalized = String(name).toLocaleLowerCase('ru-RU');
        return label.includes(normalized) || normalized.includes(label);
      });
    };
    const kindOf = (text) => /гол|goal|пенальти|автогол/i.test(text) ? 'goal' : /красн|удалени|red card/i.test(text) ? 'red-card' : /ж[её]лт|yellow card/i.test(text) ? 'yellow-card' : /замен|substitution/i.test(text) ? 'substitution' : 'event';
    const showHalves = ordered.every((item) => item.minute !== null) && ordered.some((item) => item.minute < 46) && ordered.some((item) => item.minute >= 46);
    const list = [];
    if (showHalves) list.push('<li class="timeline-period"><span>Первый тайм</span></li>');
    let markedSecondHalf = false;
    ordered.forEach(({ event, minute }) => {
      if (showHalves && !markedSecondHalf && minute >= 46) {
        list.push('<li class="timeline-period"><span>Второй тайм</span></li>');
        markedSecondHalf = true;
      }
      const isHome = belongsTo(event[2], match.home); const isAway = !isHome && belongsTo(event[2], match.away);
      const side = isHome ? 'home' : isAway ? 'away' : 'unknown';
      const kind = kindOf(String(event[1] || ''));
      const team = isHome ? (home.short || home.name) : isAway ? (away.short || away.name) : event[2];
      list.push(`<li class="timeline-event ${side} event-${kind}"><div class="timeline-event-copy"><small>${escape(team || 'Матч')}</small><span>${escape(event[1])}</span></div><time>${escape(event[0])}</time></li>`);
    });
    return `<ol class="match-timeline" aria-label="События матча по времени">${list.join('')}</ol>`;
  }
  function matchStats(match) {
    if (match.status === 'soon') return '<div class="empty-note">Статистика появится после стартового свистка. Предматчевые нули здесь не показываем.</div>';
    const stats = Array.isArray(match.stats) ? match.stats : [];
    if (!stats.length) {
      const state = match.detailDataStatus?.statistics;
      return `<div class="empty-note">${state === 'failed' ? 'Не удалось получить статистику GOAL API. Попробуйте открыть матч позже.' : state === 'empty' ? 'GOAL API не передал статистику для этого матча.' : 'Показатели матча не пришли в ответе поставщика.'}</div>`;
    }
    const numeric = (value) => {
      const token = String(value ?? '').replace(/,/g, '.').match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/);
      return token ? Number(token[0]) : 0;
    };
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const legend = `<div class="match-stats-legend"><span><i class="home"></i>${escape(home.short || home.name || 'Хозяева')}</span><span><i class="away"></i>${escape(away.short || away.name || 'Гости')}</span></div>`;
    const rows = stats.map(([label, homeValue, awayValue, homeRaw, awayRaw]) => {
      const homeNumber = numeric(homeRaw ?? homeValue); const awayNumber = numeric(awayRaw ?? awayValue);
      const max = Math.max(homeNumber, awayNumber, 0);
      const homeWidth = max ? Math.max(0, homeNumber) / max * 100 : 0;
      const awayWidth = max ? Math.max(0, awayNumber) / max * 100 : 0;
      return `<div class="match-stat-row"><div class="match-stat-values"><b>${escape(homeValue)}</b><span>${escape(label)}</span><b>${escape(awayValue)}</b></div><div class="match-stat-bars" aria-hidden="true"><span class="match-stat-track home"><i style="width:${homeWidth}%"></i></span><span class="match-stat-track away"><i style="width:${awayWidth}%"></i></span></div></div>`;
    }).join('');
    return `${legend}<div class="match-stats-list">${rows}</div><p class="detail-footnote">Длина шкалы в каждой строке показывает соотношение значений этого показателя. ${window.isLiveData ? 'Числа переданы поставщиком для этого матча.' : 'Демо-значения для проверки интерфейса, не live-данные.'}</p>`;
  }
  function matchPage(match) {
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const dateLabel = match.dateKey ? formatCalendarDate(match.dateKey) : match.date;
    const matchTime = fixtureKickoff(match);
    const status = match.status === 'soon' ? (matchTime ? 'Не начался' : 'Время уточняется') : match.status === 'live' ? `В игре${/^\d+(?:\+\d+)?′$/.test(match.time) ? ` · ${match.time}` : ''}` : 'Завершён';
    const followed = favoriteMatches.has(String(match.id));
    const standingsCaption = [teamRank(match.home) && `${teamRank(match.home)}-е место`, teamRank(match.away) && `${teamRank(match.away)}-е место`].filter(Boolean).join(' · ');
    const eventCount = Array.isArray(match.events) ? match.events.length : 0;
    const eventCountMod100 = eventCount % 100; const eventCountMod10 = eventCount % 10;
    const eventCountLabel = eventCount ? `${eventCount} ${eventCountMod100 >= 11 && eventCountMod100 <= 14 ? 'событий' : eventCountMod10 === 1 ? 'событие' : eventCountMod10 >= 2 && eventCountMod10 <= 4 ? 'события' : 'событий'}` : detailSource();
    return `<div class="detail-page match-detail-page">
      <div class="detail-toolbar"><div class="matchday-detail-leading"><span class="matchday-mark" aria-hidden="true"></span><button type="button" class="detail-back" data-detail-back aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"/></svg></button></div><h1 class="detail-toolbar-label">Матч</h1><button type="button" class="detail-star matchday-star ${followed ? 'selected' : ''}" data-detail-favorite="${escape(match.id)}" aria-pressed="${followed}" aria-label="${followed ? 'Убрать матч из избранного' : 'Добавить матч в избранное'}">${matchdayStar}</button></div>
      <header class="match-detail-hero"><div class="detail-kicker">РПЛ${match.round ? ` · ${escape(match.round)}-й тур` : ''}</div><div class="match-detail-teams"><button type="button" class="detail-team-link" data-detail-club="${escape(match.home)}">${clubBadge(match.home, 'detail-team-crest')}<strong>${escape(home.short || home.name || 'Хозяева')}</strong></button><div class="match-detail-score"><span>${escape(match.status === 'soon' ? (matchTime || '—') : String(match.score || '—').replace(/\s+/g, ''))}</span><small class="${match.status === 'live' ? 'is-live' : ''}">${escape(status)}</small></div><button type="button" class="detail-team-link away" data-detail-club="${escape(match.away)}">${clubBadge(match.away, 'detail-team-crest')}<strong>${escape(away.short || away.name || 'Гости')}</strong></button></div><div class="match-detail-venue"><span>${escape(dateLabel)}${matchTime ? ` · ${escape(matchTime)} МСК` : ''}</span></div></header>
      <nav class="detail-anchor-nav" data-concept-layout="true" aria-label="Разделы матча"><button type="button" data-detail-anchor="match-events" aria-controls="match-events">События</button><button type="button" data-detail-anchor="matchLineupsSection" aria-controls="matchLineupsSection">Составы</button><button type="button" data-detail-anchor="match-statistics" aria-controls="match-statistics">Статистика</button><button type="button" data-detail-anchor="match-h2h" aria-controls="match-h2h season-comparison match-form">Очные</button></nav>
      <section class="detail-card lineups-card" id="matchLineupsSection"><div class="detail-section-head"><h2>Составы</h2></div><div id="matchLineups" class="match-lineups" aria-live="polite"><div class="empty-note">${window.isLiveData ? 'Загружаем составы…' : 'Стартовые составы пока не опубликованы'}</div></div></section>
      ${seasonCompare(match)}
      ${headToHead(match)}
      <section class="detail-card form-card" id="match-form"><div class="detail-section-head"><div><span class="detail-kicker">ПОСЛЕДНИЕ ЗАВЕРШЁННЫЕ</span><h2>Форма команд</h2></div><span class="detail-source">ДО 5 ИГР</span></div><div class="match-form-grid">${formTeam(match.home)}${formTeam(match.away)}</div><div class="form-legend" aria-label="В означает победа, Н означает ничья, П означает поражение"><span><i class="win">В</i> Победа</span><span><i class="draw">Н</i> Ничья</span><span><i class="loss">П</i> Поражение</span></div></section>
      <section class="detail-card match-events-card" id="match-events"><div class="detail-section-head"><div><span class="detail-kicker">ХОД МАТЧА</span><h2>Хронология</h2></div><span class="detail-source">${eventCountLabel}</span></div>${eventList(match)}</section>
      <section class="detail-card match-stats-card" id="match-statistics"><div class="detail-section-head"><div><span class="detail-kicker">${match.status === 'soon' ? 'ПОСЛЕ СТАРТА' : 'ПО МАТЧУ'}</span><h2>Статистика матча</h2></div></div>${matchStats(match)}</section>
      <p class="detail-data-note">${window.isLiveData ? [match.venue, window.rplDataProvider, standingsCaption].filter(Boolean).map(escape).join(' · ') : 'Демо-режим · расписание и результаты приведены как пример.'}</p>
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
      const focusedTab = root.contains(document.activeElement) ? document.activeElement.dataset.detailAnchor : '';
      const focusedStar = root.contains(document.activeElement) && document.activeElement.hasAttribute('data-detail-favorite');
      root.classList.add('matchday-detail');
      root.innerHTML = matchPage(match);
      const buttons = [...root.querySelectorAll('[data-detail-anchor]')];
      const select = (target) => {
        detailRoute.panel = target;
        for (const button of buttons) {
          const active = button.dataset.detailAnchor === target;
          button.classList.toggle('active', active);
          button.setAttribute('aria-pressed', String(active));
          for (const id of button.getAttribute('aria-controls').split(' ')) {
            const panel = document.getElementById(id);
            if (panel) panel.hidden = !active;
          }
        }
        if (target === 'matchLineupsSection') window.loadMatchLineups?.(match);
      };
      buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.detailAnchor)));
      select(detailRoute.panel || 'match-events');
      buttons.find(button => button.dataset.detailAnchor === focusedTab)?.focus({preventScroll:true});
      if (focusedStar) root.querySelector('[data-detail-favorite]')?.focus({preventScroll:true});
      if (window.loadMatchInsights) requestAnimationFrame(() => { if (detailRoute?.type === 'match' && detailRoute.id === String(match.id)) window.loadMatchInsights(match); });
    } else if (detailRoute.type === 'player') {
      root.classList.remove('matchday-detail');
      root.innerHTML = playerProfilePage(detailRoute.player);
    }
    root.querySelectorAll('[data-detail-back]').forEach((button) => button.addEventListener('click', backFromDetail));
    root.querySelectorAll('[data-detail-club]').forEach((button) => button.addEventListener('click', () => openClub(button.dataset.detailClub)));
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
    const previousMatch = detailRoute?.id;
    detailRoute = null;
    window.render();
    window.scrollTo({ top, behavior: 'instant' });
    if (previousMatch) [...document.querySelectorAll('[data-match]')].find(button => button.dataset.match === previousMatch)?.focus({preventScroll:true});
  }
  function openMatchDetail(id) {
    const match = matches.find((item) => String(item.id) === String(id));
    if (!match) return;
    detailRoute = { type: 'match', id: String(id), previousScroll: window.scrollY || 0 };
    matchdaySelection = String(id);
    modalMatch = match;
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function installDetailedMatchLayer() {
    if (typeof window.render === 'function' && window.render !== installedDetailRender) {
      const renderBelowDetails = window.render;
      installedDetailRender = function (...args) {
        if (detailRoute && renderRoute()) return;
        return renderBelowDetails.apply(this, args);
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
  window.closeMatchdayDetail = () => { detailRoute = null; profileParent = null; modalMatch = null; };
  window.refreshDetailedMatch = (id) => {
    if (detailRoute?.type === 'match' && detailRoute.id === String(id)) window.render();
  };
  window.installDetailedMatchLayer = installDetailedMatchLayer;
  installDetailedMatchLayer();
})();
