(() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const asNumber = (value) => {
    const number = Number(String(value ?? '').replace(/[^\d.+-]/g, ''));
    return Number.isFinite(number) ? number : 0;
  };
  const percent = (value, total) => total > 0 ? Math.round(value / total * 100) : 0;
  const decimal = (value) => Number.isFinite(value) ? value.toFixed(2).replace('.', ',') : '—';
  const records = () => Array.isArray(standings) ? standings.filter((row) => Array.isArray(row)) : [];
  const getGoalNumbers = (row) => {
    const values = String(row?.[5] ?? '').match(/\d+/g) || [];
    return [Number(values[0] || 0), Number(values[1] || 0)];
  };
  const sourceLabel = () => window.isLiveData ? 'РПЛ' : 'Демо';
  const clubName = (key) => clubs?.[key]?.short || clubs?.[key]?.name || key;

  function leagueInsights() {
    const table = records().filter((row) => asNumber(row[1]) > 0);
    if (!table.length) return '';
    const ranked = table.map((row) => {
      const played = asNumber(row[1]);
      return { key: row[0], ppg: played ? asNumber(row[6]) / played : 0 };
    }).sort((a, b) => b.ppg - a.ppg).slice(0, 5);
    const max = Math.max(1, ...ranked.map((row) => row.ppg));
    return `<section class="insight-card league-insights" aria-label="Сравнение очков за матч">
      <div class="insight-head"><div><h2 class="insight-title">Очки за матч</h2><p class="insight-caption">Сравнение темпа набора очков в лиге</p></div><span class="insight-source">${sourceLabel()}</span></div>
      <div class="ppg-list">${ranked.map((item, index) => `<button type="button" class="ppg-row" data-insight-club="${escape(item.key)}" aria-label="Открыть клуб ${escape(clubName(item.key))}: ${decimal(item.ppg)} очка за матч">
        <span class="ppg-club">${index + 1}. ${escape(clubName(item.key))}</span><span class="ppg-track" aria-hidden="true"><i class="ppg-fill" style="width:${Math.max(3, item.ppg / max * 100)}%"></i></span><span class="ppg-value">${decimal(item.ppg)}</span>
      </button>`).join('')}</div>
      <p class="insight-note">Очки за матч = очки ÷ сыгранные матчи. Так удобнее сравнивать клубы, если у них разное число игр.${window.isLiveData ? ' Данные из текущей таблицы.' : ' Демонстрационные данные, не live.'}</p>
    </section>`;
  }

  function activeTab() {
    return document.querySelector('.nav-item.active')?.dataset.tab || '';
  }
  function addInsights() {
    const root = document.getElementById('screen');
    if (!root) return;
    if (activeTab() === 'table' && root.querySelector('.table-wrap') && !root.querySelector('.league-insights')) {
      root.querySelector('.table-wrap').insertAdjacentHTML('afterend', leagueInsights());
      root.querySelectorAll('[data-insight-club]').forEach((button) => button.addEventListener('click', () => {
        selectedClub = button.dataset.insightClub;
        tab = 'club';
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }));
    }
  }

  function scoreSnapshot() {
    const root = document.getElementById('screen');
    if (!root) return new Map();
    return new Map([...root.querySelectorAll('[data-match]')].map((card) => [card.dataset.match, card.querySelector('.score')?.textContent?.trim() || '']));
  }
  function animateScreen(previousScores) {
    const root = document.getElementById('screen');
    if (!root) return;
    root.classList.remove('screen-enter');
    void root.offsetWidth;
    root.classList.add('screen-enter');
    root.querySelectorAll('[data-match]').forEach((card) => {
      const previous = previousScores.get(card.dataset.match);
      const current = card.querySelector('.score')?.textContent?.trim() || '';
      if (previous && current && previous !== current) card.querySelector('.score')?.classList.add('score-updated');
    });
    addInsights();
  }

  function statLabel(raw) {
    const name = String(raw ?? '').trim();
    const normalized = name.toLowerCase().replace(/[._-]+/g, ' ');
    if (/possession|влад/.test(normalized)) return 'Владение мячом';
    if (/shots? on target|shots? on goal|удар.*створ|в створ/.test(normalized)) return 'Удары в створ';
    if (/shots?|удар/.test(normalized)) return 'Удары';
    if (/corner|углов/.test(normalized)) return 'Угловые';
    if (/foul|фол/.test(normalized)) return 'Фолы';
    if (/yellow|ж[её]лт/.test(normalized)) return 'Жёлтые карточки';
    if (/red card|красн/.test(normalized)) return 'Красные карточки';
    if (/offside|офсайд/.test(normalized)) return 'Офсайды';
    if (/pass|передач/.test(normalized)) return 'Передачи';
    if (/save|сейв|спасен/.test(normalized)) return 'Сейвы';
    return name || 'Показатель';
  }
  function statValue(rawName, value) {
    const text = String(value ?? '—').trim();
    const normalized = String(rawName ?? '').toLowerCase();
    return /possession|влад/.test(normalized) && text && !text.includes('%') ? `${text}%` : text;
  }
  function renderMatchStats(match) {
    const heading = [...document.querySelectorAll('#sheet .section-heading')].find((element) => element.querySelector('h2')?.textContent?.includes('Цифры матча'));
    if (!heading) return;
    const block = heading.nextElementSibling?.classList.contains('stats-block') ? heading.nextElementSibling : null;
    if (!block) return;
    const micro = heading.querySelector('.micro');
    if (match.status === 'soon') {
      if (micro) micro.textContent = 'ПОСЛЕ СТАРТА';
      block.innerHTML = '<div class="empty-note">Статистика появится после стартового свистка. Предматчевые нули не показываем.</div>';
      return;
    }
    const stats = Array.isArray(match.stats) ? match.stats : [];
    if (!stats.length) {
      block.innerHTML = '<div class="empty-note">Показателей в ответе поставщика пока нет. Здесь появятся только подтверждённые данные матча.</div>';
      return;
    }
    const home = clubs?.[match.home]?.short || 'Хозяева';
    const away = clubs?.[match.away]?.short || 'Гости';
    const demo = !window.isLiveData;
    const rows = stats.map((stat) => {
      const label = statLabel(stat[0]);
      const homeRaw = stat[1];
      const awayRaw = stat[2];
      const homeNum = Number.isFinite(Number(stat[3])) ? Number(stat[3]) : asNumber(homeRaw);
      const awayNum = Number.isFinite(Number(stat[4])) ? Number(stat[4]) : asNumber(awayRaw);
      const total = Math.max(0, homeNum) + Math.max(0, awayNum);
      const homeShare = total > 0 ? Math.max(0, homeNum) / total * 100 : 50;
      const awayShare = total > 0 ? 100 - homeShare : 50;
      return `<div class="stat-compare" role="img" aria-label="${escape(label)}: ${escape(home)} ${escape(statValue(stat[0], homeRaw))}, ${escape(away)} ${escape(statValue(stat[0], awayRaw))}">
        <div class="stat-compare-values"><span class="stat-compare-value">${escape(statValue(stat[0], homeRaw))}</span><span class="stat-compare-label">${escape(label)}</span><span class="stat-compare-value away">${escape(statValue(stat[0], awayRaw))}</span></div>
        <div class="stat-compare-track ${total === 0 ? 'is-empty' : ''}" aria-hidden="true"><i class="stat-compare-fill home" style="width:${homeShare}%"></i><i class="stat-compare-fill away" style="width:${awayShare}%"></i></div>
      </div>`;
    }).join('');
    block.innerHTML = `<div class="stats-chart-legend"><span class="stats-team-label"><i class="stats-team-dot"></i><span>${escape(home)}</span></span><span class="stats-team-label away"><span>${escape(away)}</span><i class="stats-team-dot"></i></span></div><div class="stats-chart">${rows}</div><p class="stats-disclaimer">${demo ? 'Пример интерфейса: в демо-режиме цифры не являются результатами реального матча.' : 'Полосы показывают долю каждой команды в сравнении по показателю. Доступны только данные из ответа поставщика.'}</p>`;
    if (micro) micro.textContent = demo ? 'ДЕМО-ПРИМЕР' : 'ДАННЫЕ МАТЧА';
  }

  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = function (...args) {
      const before = scoreSnapshot();
      const result = originalRender.apply(this, args);
      animateScreen(before);
      return result;
    };
  }

  const originalOpenMatch = window.openMatch;
  if (typeof originalOpenMatch === 'function') {
    window.openMatch = function (id, ...args) {
      const result = originalOpenMatch.call(this, id, ...args);
      const match = matches.find((item) => String(item.id) === String(id));
      if (match) requestAnimationFrame(() => renderMatchStats(match));
      return result;
    };
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('overlay')?.classList.contains('open')) closeOverlay();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') document.body.classList.remove('app-backgrounded');
    else document.body.classList.add('app-backgrounded');
  });
})();
