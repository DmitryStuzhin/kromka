(() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const detailSource = () => window.isLiveData ? 'РПЛ · 2026/27' : 'Демо';
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
  function resultText(result) { return result === 'win' ? 'Победа' : result === 'draw' ? 'Ничья' : 'Поражение'; }
  function goalDifference(row) {
    const goals = String(row?.[5] || '').match(/\d+/g) || [];
    return Number(goals[0] || 0) - Number(goals[1] || 0);
  }
  function seasonCompare(match) {
    const home = standingFor(match.home); const away = standingFor(match.away);
    if (!home && !away) return '<div class="empty-note">Таблица сезона пока недоступна.</div>';
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
  function formRow(item, key) {
    const scores = scoreOf(item);
    const result = key ? resultForTeam(item, key) : '';
    const date = item.dateKey ? formatCalendarDate(item.dateKey, { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';
    const team = id => `<span class="duel-team ${id === key ? 'is-focus' : ''}">${clubBadge(id)}<span>${escape(teamLabel(id))}</span></span>`;
    return `<button type="button" class="duel-row" data-history-match="${escape(item.id)}"><time>${escape(date)}</time><span class="duel-names">${team(item.home)}${team(item.away)}</span><span class="duel-score">${scores.map(score => `<b>${score}</b>`).join('')}</span>${result ? `<span class="duel-outcome ${result}" aria-label="${resultText(result)}" title="${resultText(result)}">${result === 'win' ? 'В' : result === 'draw' ? 'Н' : 'П'}</span>` : ''}</button>`;
  }
  function historyGroup(title, rows, key = '') {
    return `<section class="duel-group"><h3>${escape(title)}</h3>${rows.length ? rows.slice(0, 5).map(item => formRow(item, key)).join('') : '<p class="duel-empty">В этом сезоне таких матчей пока нет.</p>'}${rows.length > 5 ? `<details class="duel-more"><summary>Показать ещё <span>${rows.length - 5}</span></summary>${rows.slice(5).map(item => formRow(item, key)).join('')}</details>` : ''}</section>`;
  }
  function matchHistory(match, filter = 'all') {
    const earlier = matches.filter(item => item.status === 'finished' && item.id !== match.id && scoreOf(item) &&
      (!match.dateKey || compareMatchTimes(item, match) < 0)).sort((a,b) => compareMatchTimes(b,a));
    const presets = [['all','Все матчи'], ['home', teamLabel(match.home) + ' дома'], ['away', teamLabel(match.away) + ' в гостях']];
    const teamResults = (key, side) => earlier.filter(item => side ? item[side] === key : item.home === key || item.away === key);
    const direct = earlier.filter(item => (item.home === match.home && item.away === match.away) ||
      (filter === 'all' && item.home === match.away && item.away === match.home));
    return `<section id="match-form" class="match-history"><div class="duel-filters" role="group" aria-label="Где играли">${presets.map(([key,label]) => `<button type="button" data-history-filter="${key}" aria-pressed="${key === filter}">${escape(label)}</button>`).join('')}</div>
      ${filter !== 'away' ? historyGroup('Последние матчи: ' + teamLabel(match.home), teamResults(match.home, filter === 'all' ? '' : 'home'), match.home) : ''}
      ${filter !== 'home' ? historyGroup('Последние матчи: ' + teamLabel(match.away), teamResults(match.away, filter === 'all' ? '' : 'away'), match.away) : ''}
      <div id="match-h2h">${historyGroup('Очные встречи · РПЛ 2026/27', direct)}</div></section>`;
  }
  function eventList(match) {
    const events = Array.isArray(match.events) ? match.events : [];
    if (!events.length) {
      const state = match.detailDataStatus?.events;
      const message = match.status === 'soon' ? 'До стартового свистка событий матча ещё нет.' : state === 'failed' ? 'Не удалось получить события. Попробуйте открыть матч позже.' : state === 'empty' ? 'Хронология этого матча недоступна.' : window.isLiveData ? 'Загружаем ход матча…' : 'В демо-данных нет событий этого матча.';
      return `<div class="empty-note">${message}</div>`;
    }
    return window.rplMatchChronology.render(match, clubs, window.rplClubKeyForName);
  }
  function matchStats(match) {
    if (match.status === 'soon') return '';
    const stats = Array.isArray(match.stats) ? match.stats : [];
    if (!stats.length) {
      const state = match.detailDataStatus?.statistics;
      return `<div class="empty-note">${state === 'failed' ? 'Не удалось обновить статистику. Попробуйте позже.' : state === 'empty' ? 'Статистика этого матча недоступна.' : 'Загружаем статистику…'}</div>`;
    }
    const numeric = (value) => {
      const token = String(value ?? '').replace(/,/g, '.').match(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/);
      return token ? Number(token[0]) : 0;
    };
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const legend = `<div class="match-stats-legend"><span><i class="home"></i>${escape(home.short || home.name || 'Хозяева')}</span><span><i class="away"></i>${escape(away.short || away.name || 'Гости')}</span></div>`;
    const possession=stats.find(row=>/влад|possession/i.test(row[0]));
    const possessionValues=possession?[numeric(possession[3]??possession[1]),numeric(possession[4]??possession[2])]:[];
    const hasPossession=possessionValues.length===2&&possessionValues.every(n=>n>=0&&n<=100)&&Math.abs(possessionValues[0]+possessionValues[1]-100)<1;
    const rings=hasPossession?`<section class="possession-chart" aria-label="Владение мячом"><h4>Владение мячом</h4><div class="possession-rings">${possessionValues.map((value,i)=>`<div class="possession-team ${i?'away':'home'}"><div class="possession-ring"><svg viewBox="0 0 100 100" role="img" aria-label="${escape(i?away.short:home.short)}: ${value}%"><circle class="possession-track" cx="50" cy="50" r="39"/><circle class="possession-value" cx="50" cy="50" r="39" pathLength="100" stroke-dasharray="${value} ${100-value}" transform="rotate(-90 50 50)"/></svg><b>${value}%</b></div><span>${escape(i?away.short:home.short)}</span></div>`).join('')}</div></section>`:'';
    const grouped=window.rplMatchPresentation.statGroups(stats.filter(row=>!hasPossession||!/влад|possession/i.test(row[0])));
    const statDisplay=value=>{
      const text=String(value??'—'),percent=text.match(/^([\d.,]+%)\s*\(([^)]+)\)$/);
      return percent?`${escape(percent[1])}<small class="match-stat-context">${escape(percent[2])}</small>`:escape(/^\d+\.\d+$/.test(text)?text.replace('.',','):text);
    };
    const renderRows=items=>items.map(([label, homeValue, awayValue, homeRaw, awayRaw]) => {
      const homeNumber = numeric(homeRaw ?? homeValue); const awayNumber = numeric(awayRaw ?? awayValue);
      const total = Math.max(0,homeNumber)+Math.max(0,awayNumber);
      const homeWidth = total ? Math.max(0, homeNumber) / total * 100 : 0;
      const awayWidth = total ? Math.max(0, awayNumber) / total * 100 : 0;
      return `<div class="match-stat-row"><div class="match-stat-values"><b>${statDisplay(homeValue)}</b><span>${escape(label)}</span><b>${statDisplay(awayValue)}</b></div><div class="match-stat-bars" aria-hidden="true"><span class="match-stat-track home" style="width:${homeWidth}%"><i></i></span><span class="match-stat-track away" style="width:${awayWidth}%"><i></i></span></div></div>`;
    }).join('');
    const extra=grouped.groups.length?`<details class="match-stat-more"><summary>Все показатели</summary>${grouped.groups.map(([title,items])=>`<section class="match-stat-group"><h4>${escape(title)}</h4><div class="match-stats-list">${renderRows(items)}</div></section>`).join('')}</details>`:'';
    return `${legend}${rings}<div class="match-stats-list">${renderRows(grouped.primary)}</div>${extra}${window.isLiveData?'':'<p class="detail-footnote">Демонстрационные данные.</p>'}`;
  }
  function matchPage(match) {
    const home = clubs[match.home] || {}; const away = clubs[match.away] || {};
    const dateLabel = match.dateKey ? formatCalendarDate(match.dateKey) : match.date;
    const matchTime = fixtureKickoff(match);
    const status = match.status === 'soon' ? (matchTime ? 'Не начался' : 'Время уточняется') : match.status === 'live' ? (match.time === 'Перерыв' ? 'Перерыв' : /^\d+(?:\+\d*)?′$/.test(match.time) ? match.time : 'Минута уточняется') : 'Завершён';
    const followed = favoriteMatches.has(String(match.id));
    const eventCount = Array.isArray(match.events) ? match.events.length : 0;
    const eventCountMod100 = eventCount % 100; const eventCountMod10 = eventCount % 10;
    const eventCountLabel = eventCount ? `${eventCount} ${eventCountMod100 >= 11 && eventCountMod100 <= 14 ? 'событий' : eventCountMod10 === 1 ? 'событие' : eventCountMod10 >= 2 && eventCountMod10 <= 4 ? 'события' : 'событий'}` : detailSource();
    return `<div class="detail-page match-detail-page" data-status="${escape(match.status)}" style="${window.rplMatchPresentation?.dualStyle(home,away)||''}">
      <div class="detail-toolbar"><div class="matchday-detail-leading">${favoriteClubShortcut()}<button type="button" class="detail-back" data-detail-back aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"/></svg></button></div><h1 class="detail-toolbar-label">Матч</h1><button type="button" class="detail-star matchday-star ${followed ? 'selected' : ''}" data-detail-favorite="${escape(match.id)}" aria-pressed="${followed}" aria-label="${followed ? 'Убрать матч из избранного' : 'Добавить матч в избранное'}">${matchdayStar}</button></div>
      <header class="match-detail-hero"><div class="detail-kicker">РПЛ${match.round ? ` · ${escape(match.round)}-й тур` : ''}</div><div class="match-detail-teams"><button type="button" class="detail-team-link" data-detail-club="${escape(match.home)}">${clubBadge(match.home, 'detail-team-crest')}<strong>${escape(home.short || home.name || 'Хозяева')}</strong></button><div class="match-detail-score"><span>${escape(match.status === 'soon' ? (matchTime || '—') : String(match.score || '—').replace(/\s+/g, ''))}</span><small class="${match.status === 'live' ? 'is-live' : ''}">${escape(status)}</small></div><button type="button" class="detail-team-link away" data-detail-club="${escape(match.away)}">${clubBadge(match.away, 'detail-team-crest')}<strong>${escape(away.short || away.name || 'Гости')}</strong></button></div><div class="match-detail-venue"><span>${escape(dateLabel)}${matchTime ? ` · ${escape(matchTime)} МСК` : ''}</span></div></header>
      <nav class="detail-anchor-nav" data-concept-layout="true" aria-label="Разделы матча"><button type="button" data-detail-anchor="match-events" aria-controls="match-events" ${match.status === 'soon' && !eventCount ? 'disabled title="События появятся после начала матча"' : ''}>События</button><button type="button" data-detail-anchor="matchLineupsSection" aria-controls="matchLineupsSection">Составы</button><button type="button" data-detail-anchor="match-statistics" aria-controls="match-statistics">Статистика</button></nav>
      <section class="detail-card lineups-card" id="matchLineupsSection"><div class="detail-section-head"><h2>Составы</h2></div><div id="matchLineups" class="match-lineups" aria-live="polite"><div class="empty-note">${window.isLiveData ? 'Загружаем составы…' : 'Составы в демо недоступны.'}</div></div></section>
      <section class="detail-card match-events-card" id="match-events"><div class="detail-section-head"><h2>Ход матча</h2><span class="detail-source">${eventCountLabel}</span></div>${eventList(match)}</section>
      <div id="match-statistics">
        ${match.status !== 'soon' ? `<section class="duel-group match-figures"><h3>Статистика матча</h3>${matchStats(match)}</section>` : ''}
        ${matchHistory(match, detailRoute?.historyFilter)}
        <details class="match-season-details"><summary>Сравнение в сезоне</summary>${seasonCompare(match)}</details>
      </div>
      ${match.venue ? `<p class="detail-data-note">${escape(match.venue)}</p>` : ''}
    </div>`;
  }
  const playerPositionLabels = { goalkeepers: 'Вратарь', goalkeeper: 'Вратарь', gk: 'Вратарь', defenders: 'Защитник', defender: 'Защитник', df: 'Защитник', midfielders: 'Полузащитник', midfielder: 'Полузащитник', mf: 'Полузащитник', forwards: 'Нападающий', forward: 'Нападающий', fw: 'Нападающий' };
  function playerStatsPage(route) {
    if (!route.profile) {
      if (route.profileState === 'loading') return '<p class="player-profile-note" role="status">Загружаем статистику…</p>';
      if (route.profileState === 'error') return '<p class="player-profile-note" role="status">Не удалось загрузить статистику. <button type="button" class="player-retry" data-player-retry>Повторить</button></p>';
      return '<p class="player-profile-note">Статистика этого игрока пока недоступна.</p>';
    }
    const profile = route.profile;
    const charts = window.rplStatsCharts;
    const options = charts.careerCategories(profile);
    const group = Object.hasOwn(options, route.careerGroup) ? route.careerGroup : Object.keys(options)[0];
    const metric = Object.hasOwn(charts.metrics, route.careerMetric) ? route.careerMetric : 'goals';
    const scope = route.seasonScope || (profile.league || !profile.all ? 'league' : 'all');
    const seasonSelector = profile.all ? `<div class="stat-switch" role="group" aria-label="Турниры сезона">${[['league', 'РПЛ'], ['all', 'Все турниры клуба']].map(([key, title]) =>
      `<button type="button" data-season-scope="${key}" aria-pressed="${scope === key}">${title}</button>`).join('')}</div>` : '<p class="stat-note stat-league-label">РПЛ</p>';
    const select = (name, title, entries, current) => `<label>${title}<select data-career-select="${name}">${entries.map(([key, text]) =>
      `<option value="${key}"${key === current ? ' selected' : ''}>${text}</option>`).join('')}</select></label>`;
    const career = group ? `<section class="player-profile-section">
      <div class="player-section-head"><h2>Карьера по сезонам</h2></div>
      <div class="stat-selects" data-career-controls>
        ${select('group', 'Турниры', Object.entries(options).map(([key, category]) => [key, category.label]), group)}
        ${select('metric', 'Показатель', Object.entries(charts.metrics), metric)}
      </div>
      <div data-career-results aria-live="polite">${charts.careerContent(profile, options[group], metric)}</div>
    </section>` : '';
    return `<section class="player-profile-section"><div class="player-section-head"><h2>Статистика сезона</h2><span>${escape(charts.shortSeason(profile.season))}</span></div>
      ${seasonSelector}<div data-season-content aria-live="polite">${charts.seasonContent(profile, scope)}</div></section>
      ${career}
      ${profile.careerUnavailable ? '<p class="player-profile-note">Не удалось загрузить историю карьеры. <button type="button" class="player-retry" data-player-retry>Повторить</button></p>' : ''}`;
  }
  function bindPlayerCharts(root, route) {
    if (!route.profile) return;
    const charts = window.rplStatsCharts;
    const buttons = [...root.querySelectorAll('[data-season-scope]')];
    buttons.forEach(button => button.addEventListener('click', () => {
      const scope = button.dataset.seasonScope;
      if (button.getAttribute('aria-pressed') === 'true') return;
      route.seasonScope = scope;
      buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      root.querySelector('[data-season-content]').innerHTML = charts.seasonContent(route.profile, scope);
    }));
    root.querySelector('[data-career-controls]')?.addEventListener('change', () => {
      const options = charts.careerCategories(route.profile);
      route.careerGroup = root.querySelector('[data-career-select="group"]').value;
      route.careerMetric = root.querySelector('[data-career-select="metric"]').value;
      root.querySelector('[data-career-results]').innerHTML = charts.careerContent(route.profile, options[route.careerGroup], route.careerMetric);
    });
  }
  function playerProfilePage(route) {
    const player = route.player;
    const profile = route.profile;
    const key = player.team && clubs[player.team] ? player.team : '';
    const club = key ? clubs[key] : null;
    const name = profile?.name || player.name || 'Игрок';
    const position = playerPositionLabels[String(player.position || '').trim().toLowerCase()] || player.position || '';
    const photo = window.rplPlayerPhotoUrl?.(profile?.photo || player.photo) || '';
    const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] || '').join('').toUpperCase();
    const age = profile?.age ?? player.age;
    const number = player.number || profile?.number;
    const facts = [
      ['Номер', number ? `№ ${number}` : ''], ['Позиция', position],
      ['Возраст', age], ['Дата рождения', profile?.birthDate], ['Страна', profile?.nationality],
      ['Оценочная стоимость', profile?.marketValue], ['Контракт до', profile?.contractUntil]
    ].filter(([, value]) => value != null && value !== '');
    return `<div class="detail-page player-detail-page" style="${window.rplMatchPresentation?.clubStyle(club)||''}">
      <div class="detail-toolbar"><button type="button" class="detail-back" data-detail-back aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4m7-7-7 7 7 7"/></svg></button><span class="detail-toolbar-label">Профиль игрока</span><span class="detail-toolbar-spacer"></span></div>
      <header class="player-profile-hero"><div class="player-profile-avatar"><span aria-hidden="true">${escape(initials)}</span>${photo ? `<img src="${escape(photo)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true">` : ''}</div>
      <div class="player-profile-copy"><h1>${escape(name)}</h1>${key ? `<button type="button" class="player-profile-club" data-detail-club="${escape(key)}">${clubBadge(key, 'player-club-crest')}<span>${escape(club.short || club.name)}</span></button>` : ''}</div></header>
      ${facts.length ? `<dl class="player-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>` : ''}
      <div aria-busy="${route.profileState === 'loading'}">${playerStatsPage(route)}</div>
    </div>`;
  }
  function playerFromButton(button) {
    return {
      id: button.dataset.playerId || '', name: button.dataset.playerName || 'Игрок',
      number: button.dataset.playerNumber || '', position: button.dataset.playerPosition || '',
      age: button.dataset.playerAge || '', photo: button.dataset.playerPhoto || '', team: button.dataset.playerTeam || ''
    };
  }
  async function loadPlayerProfile(route) {
    const player = route.player;
    const teamId = clubs[player.team]?.apiId;
    if (!teamId) return;
    const query = new URLSearchParams({ id: player.id, name: player.name, number: player.number });
    route.profileState = 'loading';
    if (detailRoute === route) renderRoute();
    try {
      const endpoint = `/api/teams/${encodeURIComponent(teamId)}/player?${query}`;
      const response = await fetch(window.kromkaApiUrl ? window.kromkaApiUrl(endpoint) : endpoint);
      if (response.status === 404) route.profileState = 'missing';
      else if (!response.ok) throw new Error('Profile request failed');
      else {
        route.profile = await response.json();
        route.profileState = 'ready';
      }
    } catch { route.profileState = 'error'; }
    if (detailRoute === route) renderRoute();
  }
  function renderRoute() {
    if (!detailRoute) return false;
    renderHeaderClub();
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
      const initial = buttons.find(button => button.dataset.detailAnchor === detailRoute.panel && !button.disabled);
      select(initial?.dataset.detailAnchor || (buttons[0].disabled ? 'match-statistics' : 'match-events'));
      root.querySelectorAll('[data-history-filter]').forEach(button => button.addEventListener('click', () => {
        detailRoute.historyFilter = button.dataset.historyFilter;
        renderRoute();
        [...root.querySelectorAll('[data-history-filter]')].find(item => item.dataset.historyFilter === detailRoute.historyFilter)?.focus({preventScroll:true});
      }));
      root.querySelectorAll('[data-history-match]').forEach(button => button.addEventListener('click', () => openMatchDetail(button.dataset.historyMatch, detailRoute)));
      buttons.find(button => button.dataset.detailAnchor === focusedTab)?.focus({preventScroll:true});
      if (focusedStar) root.querySelector('[data-detail-favorite]')?.focus({preventScroll:true});
      if (window.loadMatchInsights) queueMicrotask(() => { if (detailRoute?.type === 'match' && detailRoute.id === String(match.id)) window.loadMatchInsights(match); });
    } else if (detailRoute.type === 'player') {
      root.classList.remove('matchday-detail');
      const backFocused = document.activeElement?.matches('[data-detail-back], [data-player-retry]');
      root.innerHTML = playerProfilePage(detailRoute);
      bindPlayerCharts(root, detailRoute);
      root.querySelector('[data-player-retry]')?.addEventListener('click', () => loadPlayerProfile(detailRoute));
      if (backFocused) root.querySelector('[data-detail-back]')?.focus({ preventScroll: true });
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
    profileParent = null;
    selectedClub = key;
    clubSection = 'обзор';
    tab = 'club';
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  function backFromDetail() {
    if (detailRoute?.type === 'player' && profileParent) {
      const { route, scrollTop, player } = profileParent;
      detailRoute = route;
      profileParent = null;
      window.render();
      window.scrollTo({ top: scrollTop, behavior: 'instant' });
      const focusPlayer = () => [...document.querySelectorAll('[data-player-profile]')].find(button =>
        button.dataset.playerTeam === player.team && (player.id ? button.dataset.playerId === player.id : button.dataset.playerName === player.name)
      )?.focus({ preventScroll: true });
      focusPlayer();
      return;
    }
    const top = detailRoute?.previousScroll || 0;
    const previousMatch = detailRoute?.id;
    if (detailRoute?.parent) {
      detailRoute = detailRoute.parent;
      matchdaySelection = detailRoute.id;
      window.render();
      window.scrollTo({ top, behavior: 'instant' });
      [...document.querySelectorAll('[data-history-match]')].find(button => button.dataset.historyMatch === previousMatch)?.focus({preventScroll:true});
      return;
    }
    detailRoute = null;
    window.render();
    window.scrollTo({ top, behavior: 'instant' });
    if (previousMatch) [...document.querySelectorAll('[data-match]')].find(button => button.dataset.match === previousMatch)?.focus({preventScroll:true});
  }
  function openMatchDetail(id, parent = null) {
    const match = matches.find((item) => String(item.id) === String(id));
    if (!match) return;
    detailRoute = { type: 'match', id: String(id), previousScroll: window.scrollY || 0, parent };
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
    const player = playerFromButton(button);
    profileParent = { route: detailRoute?.type === 'match' ? detailRoute : null, scrollTop: window.scrollY || 0, player };
    detailRoute = { type: 'player', player };
    window.render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('#screen [data-detail-back]')?.focus({ preventScroll: true });
    if (window.isLiveData) loadPlayerProfile(detailRoute);
  });
  window.fixtureHistoryComplete = true;
  window.closeMatchdayDetail = () => { detailRoute = null; profileParent = null; modalMatch = null; };
  window.refreshDetailedMatch = (id) => {
    if (detailRoute?.type === 'match' && detailRoute.id === String(id)) window.render();
  };
  window.installDetailedMatchLayer = installDetailedMatchLayer;
  installDetailedMatchLayer();
})();
