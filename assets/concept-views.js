(() => {
  const screen = document.getElementById('screen');
  if (!screen) return;

  const resultLabel = (result) => ({ win: 'В', draw: 'Н', loss: 'П' }[result] || '—');
  const resultName = (result) => ({ win: 'Победа', draw: 'Ничья', loss: 'Поражение' }[result] || 'Нет результата');

  function scoreOf(match) {
    const found = String(match?.score || '').match(/^\s*(\d+)\s*[:–—-]\s*(\d+)\s*$/);
    return found ? [Number(found[1]), Number(found[2])] : null;
  }

  function recentForm(team, limit = 5) {
    const source = typeof matches !== 'undefined' && Array.isArray(matches) ? matches : [];
    return source.filter((match) => match.status === 'finished'
      && (match.home === team || match.away === team)
      && scoreOf(match))
      .sort((left, right) => String(right.dateKey).localeCompare(String(left.dateKey))
        || String(right.time || '').localeCompare(String(left.time || '')))
      .slice(0, limit)
      .map((match) => {
        const score = scoreOf(match);
        const homeScore = score[0];
        const awayScore = score[1];
        const own = match.home === team ? homeScore : awayScore;
        const other = match.home === team ? awayScore : homeScore;
        return {
          result: own > other ? 'win' : own === other ? 'draw' : 'loss',
          opponent: match.home === team ? match.away : match.home,
          score: match.home === team ? `${homeScore} : ${awayScore}` : `${awayScore} : ${homeScore}`
        };
      });
  }

  function decorateTable() {
    const table = screen.querySelector('.standings');
    if (!table) return;
    const header = table.querySelector('thead tr');
    if (!header || header.querySelector('.last-five-heading')) return;

    const heading = document.createElement('th');
    heading.className = 'last-five-heading';
    heading.scope = 'col';
    heading.textContent = 'Форма';
    header.append(heading);

    const rows = [...table.querySelectorAll('tbody tr[data-club-row]')];
    rows.forEach((row) => {
      const team = row.dataset.clubRow;
      const form = recentForm(team);
      const cell = document.createElement('td');
      cell.className = 'last-five-cell';
      const group = document.createElement('div');
      group.className = 'last-five-results';
      group.setAttribute('aria-label', form.length
        ? `Последние ${form.length} завершённых матчей, новые сначала`
        : 'Завершённые результаты в загруженной истории не найдены');

      if (form.length) {
        form.forEach(({ result, opponent, score }) => {
          const mark = document.createElement('span');
          mark.className = `last-five-mark ${result}`;
          mark.textContent = resultLabel(result);
          mark.title = `${resultName(result)} · ${score}${opponent ? ` · ${opponent}` : ''}`;
          mark.setAttribute('aria-label', `${resultName(result)} · ${score}`);
          group.append(mark);
        });
      } else {
        const empty = document.createElement('span');
        empty.className = 'last-five-empty';
        empty.textContent = '—';
        group.append(empty);
      }
      cell.append(group);
      row.append(cell);
    });

    const tableWrap = table.closest('.table-wrap');
    if (tableWrap && !screen.querySelector('.table-form-note')) {
      const note = document.createElement('p');
      note.className = 'table-form-note';
      note.textContent = 'В — победа, Н — ничья, П — поражение. Порядок от нового результата к старому; неполную историю не дополняем.';
      tableWrap.insertAdjacentElement('afterend', note);
    }

    const sourceNote = screen.querySelector('.source-note');
    if (sourceNote) {
      sourceNote.textContent = window.isLiveData
        ? `Таблица: GOAL API · сезон 2026/27. Форма построена только по завершённым матчам из загруженной истории${window.fixtureHistoryComplete === false ? '; история поставщика неполная' : ''}.`
        : 'Демонстрационный срез таблицы · не live-данные. Форма построена только по завершённым матчам, доступным в этом срезе.';
    }
  }

  function decorateMatchNavigation() {
    const nav = screen.querySelector('.detail-anchor-nav');
    if (!nav || nav.dataset.conceptLayout === 'true') return;

    const anchors = [...nav.querySelectorAll('button[data-detail-anchor]')];
    const byTarget = new Map(anchors.map((button) => [button.dataset.detailAnchor, button]));
    const overview = byTarget.get('match-events');
    const statistics = byTarget.get('match-statistics');
    const lineups = byTarget.get('matchLineupsSection');
    if (!overview || !statistics || !lineups) return;

    const primary = document.createElement('div');
    primary.className = 'detail-anchor-primary';
    const extra = document.createElement('div');
    extra.className = 'detail-anchor-extra';
    overview.textContent = 'Обзор';
    overview.classList.add('active');
    [overview, statistics, lineups].forEach((button) => {
      button.addEventListener('click', () => {
        primary.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
      });
      primary.append(button);
    });
    anchors.filter((button) => ![overview, statistics, lineups].includes(button)).forEach((button) => extra.append(button));
    nav.replaceChildren(primary, extra);
    nav.dataset.conceptLayout = 'true';
  }

  function updateScreen() {
    const isMatches = Boolean(screen.querySelector('.match-scope-row'));
    const isTable = Boolean(screen.querySelector('.standings'));
    const isDetail = Boolean(screen.querySelector('.match-detail-page'));
    screen.classList.toggle('concept-matches', isMatches);
    screen.classList.toggle('concept-table', isTable);
    screen.classList.toggle('concept-detail', isDetail);

    if (isMatches) {
      const title = screen.querySelector('.page-title');
      if (title && title.textContent.trim() === 'Календарь') title.textContent = 'Матчи';
    }
    if (isTable) {
      const pageDate = screen.querySelector('.page-head .page-date');
      if (pageDate) pageDate.textContent = window.isLiveData ? 'Сезон 2026/27' : 'Демо-данные';
      const tableTitle = screen.querySelector('.table-title');
      if (tableTitle) tableTitle.textContent = 'Турнирная таблица';
      const snapshot = screen.querySelector('.table-snapshot');
      if (snapshot) snapshot.textContent = window.isLiveData ? 'GOAL API · 2026/27' : 'Демо-срез · не live';
      decorateTable();
    }
    if (isDetail) decorateMatchNavigation();
  }

  const observer = new MutationObserver(() => requestAnimationFrame(updateScreen));
  observer.observe(screen, { childList: true, subtree: true });
  updateScreen();
})();
