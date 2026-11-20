(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const number = value => value == null || value === '' ? null : (count(Number(value)) ? Number(value) : null);
  const label = value => count(value) ? format.format(value) : '—';
  const shortSeason = value => String(value ?? '').replace(/\/(\d{2})(\d{2})$/, '/$2');
  const width = (value, max) => max > 0 && count(value) ? Math.min(value / max, 1) * 100 : 0;
  const metrics = { goals: 'Голы', assists: 'Голевые передачи', played: 'Матчи', rating: 'Средняя оценка', yellow: 'Жёлтые карточки', red: 'Красные карточки' };
  const outcomes = [['won', 'Победы'], ['drawn', 'Ничьи'], ['lost', 'Поражения']];
  const categories = { league: 'Чемпионаты', 'nacional-cup': 'Кубки страны', 'international-cups': 'Международные турниры', 'national-team': 'Сборная' };

  function track(parts, max, className = '') {
    return `<div class="stat-track-line ${className}" aria-hidden="true">${parts.filter(([, value]) => count(value) && value > 0).map(([kind, value]) =>
      `<i class="stat-fill-${kind}" style="--share:${width(value, max)}%"></i>`).join('')}</div>`;
  }
  function legend(parts) {
    return `<dl class="stat-legend">${parts.map(([kind, title, value]) => `<div><dt><i class="stat-fill-${kind}" aria-hidden="true"></i>${title}</dt><dd>${label(value)}</dd></div>`).join('')}</dl>`;
  }
  function facts(parts) {
    return `<dl class="stat-footline">${parts.filter(([, value]) => count(value)).map(([title, value]) => `<div><dt>${title}</dt><dd>${label(value)}</dd></div>`).join('')}</dl>`;
  }
  function donut(parts, caption) {
    if(!parts.every(([, , value])=>count(value))) return legend(parts);
    const total=parts.reduce((sum,[,,value])=>sum+value,0);
    let offset=0;
    const slices=parts.filter(([, , value])=>value>0).map(([kind,title,value])=>{
      const share=value/total*100;
      const circle=`<circle class="stat-donut-segment stat-fill-${kind}" cx="60" cy="60" r="45" pathLength="100" stroke-dasharray="${share} ${100-share}" stroke-dashoffset="${-offset}"><title>${esc(title)}: ${label(value)} (${label(Math.round(share*10)/10)}%)</title></circle>`;
      offset+=share;
      return circle;
    }).join('');
    const description=parts.map(([,title,value])=>`${title}: ${label(value)}`).join(', ');
    return `<div class="stat-donut-layout">
      <div class="stat-donut-ring"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(description)}">
        <circle class="stat-donut-track" cx="60" cy="60" r="45"/>
        <g transform="rotate(-90 60 60)">${slices}</g></svg>
        <div class="stat-donut-total" aria-hidden="true"><b>${label(total)}</b><span>${esc(caption)}</span></div>
      </div><dl class="stat-donut-legend">${parts.map(([kind,title,value])=>
        `<div><dt><i class="stat-fill-${kind}" aria-hidden="true"></i>${esc(title)}</dt><dd><b>${label(value)}</b><span>${total ? label(Math.round(value/total*1000)/10) : 0}%</span></dd></div>`).join('')}</dl>
    </div>${total===0 ? '<p class="stat-note">Пока нет результативных действий.</p>' : ''}`;
  }
  function seasonContent(profile, scope) {
    const stats = scope === 'all' ? profile.all : profile.league;
    const rating = scope === 'league' ? profile.rating : null;
    if (!stats && !count(rating)) return '<p class="stat-note">За этот сезон пока нет данных.</p>';
    const { played, minutes, goals, assists, yellow, red } = stats || {};
    const contribution = count(goals) || count(assists);
    return `${contribution ? `<div class="stat-surface">
      <h3>Голы и передачи</h3>
      ${donut([['primary','Голы',goals],['secondary','Передачи',assists]],'гол + пас')}
    </div>` : ''}
    ${facts([['Матчи', played], ['Минуты', minutes], ['Средняя оценка', rating]])}
    ${count(yellow) || count(red) ? `<details class="stat-disclosure"><summary>Карточки</summary>${facts([['Жёлтые', yellow], ['Красные', red]])}</details>` : ''}`;
  }

  function careerCategories(profile) {
    const rows = Array.isArray(profile.career) ? profile.career : [];
    return Object.fromEntries([
      ['rpl', { label: 'РПЛ', rows: rows.filter(row => row.rpl) }],
      ...Object.entries(categories).map(([key, name]) => [key, { label: name, rows: rows.filter(row => row.category === key) }])
    ].filter(([, group]) => group.rows.length));
  }
  function careerContent(profile, group, metric) {
    const rows = group.rows.slice().sort((a, b) => String(b.season).localeCompare(String(a.season)));
    const recent = rows.slice(0, 5);
    const max = metric === 'rating' ? 10 : Math.max(0, ...recent.map(row => count(row[metric]) ? row[metric] : 0));
    const hasCurrent = recent.some(row => row.season === profile.season);
    const showCompetition = group.label !== 'РПЛ';
    const chart = recent.some(row => count(row[metric])) ? `<ul class="stat-career-chart" aria-label="${esc(metrics[metric])} по сезонам">
      ${recent.map(row => {
        const active = row.season === profile.season;
        return `<li><span class="stat-career-season"><strong>${esc(shortSeason(row.season))}${active ? '<sup>*</sup>' : ''}</strong><small>${esc(row.team)}${showCompetition && row.competition ? ` · ${esc(row.competition)}` : ''}</small></span>
          ${track([[active ? 'primary' : 'history', row[metric]]], max)}
          <b>${label(row[metric])}</b></li>`;
      }).join('')}</ul>
      ${hasCurrent ? '<p class="stat-note">* Текущий сезон ещё идёт.</p>' : ''}`
      : '<p class="stat-note">Для этого показателя пока нет данных.</p>';
    const short = { played: 'Матчи', goals: 'Голы', assists: 'Ассисты', yellow: 'ЖК', red: 'КК', rating: 'Оценка' };
    const keys = Object.keys(short).filter(key => rows.some(row => count(row[key])));
    const detail = keys.length ? `<details class="stat-disclosure"><summary>Все сезоны и показатели</summary><div class="stat-table-scroll" tabindex="0" role="region" aria-label="Таблица показателей по сезонам">
      <table class="stat-table stat-career-table"><thead><tr><th scope="col">Сезон / клуб</th>${keys.map(key => `<th scope="col" aria-label="${metrics[key]}">${short[key]}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr><th scope="row">${esc(shortSeason(row.season))}<small>${esc(row.team)}${showCompetition && row.competition ? ` · ${esc(row.competition)}` : ''}</small></th>${keys.map(key => `<td>${label(row[key])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div></details>` : '';
    return `<div class="stat-surface stat-career-surface">${chart}</div>${detail}`;
  }

  function clubSeason(record) {
    const parts = outcomes.map(([key, name], i) => [key, name, number(record[i + 2])]);
    const played = number(record[1]);
    const goals = String(record[5] ?? '').match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/);
    const resultTotal = parts.every(([, , value]) => count(value)) ? parts.reduce((sum, [, , v]) => sum + v, 0) : null;
    const bars = goals ? [['primary', 'Забито', Number(goals[1])], ['against', 'Пропущено', Number(goals[2])]] : [];
    const maxGoals = Math.max(0, ...bars.map(([, , value]) => value));
    return `<div class="club-chart"><div class="stat-surface">
      <h3>Результаты${count(played) ? ` <small>· ${label(played)} ${played % 10 === 1 && played % 100 !== 11 ? 'матч' : played % 10 >= 2 && played % 10 <= 4 && !(played % 100 >= 12 && played % 100 <= 14) ? 'матча' : 'матчей'}</small>` : ''}</h3>
      ${resultTotal > 0 ? donut(parts,'матчей') : legend(parts)}
    </div>${bars.length ? `<div class="stat-club-goals"><h3>Голы</h3>
      ${bars.map(([kind, title, value]) => `<div class="stat-comparison-line"><span>${title}</span>${track([[kind, value]], maxGoals)}<b>${label(value)}</b></div>`).join('')}
    </div>` : ''}</div>`;
  }
  function clubSplits(splits, totalGames) {
    const rows = [['Дома', splits.home], ['В гостях', splits.away]];
    const columns = [['Матчи', 'played'], ...outcomes.map(([key, title]) => [title, key]), ['Забито', 'goalsFor'], ['Пропущено', 'goalsAgainst'], ['Очки', 'points']];
    return `<div class="club-chart"><div class="stat-surface stat-splits-surface">
      <h3>Очки за матч <small>· из 3</small></h3>
      ${rows.map(([title, row], i) => {
        const rate = row.played ? row.points / row.played : null;
        return `<div class="stat-comparison-line"><span>${title}</span>${track([[i ? 'secondary' : 'primary', rate]], 3)}<b>${label(rate)}</b></div>`;
      }).join('')}
      ${count(totalGames) && splits.total.played < totalGames ? `<p class="stat-note">По доступным матчам: ${splits.total.played} из ${totalGames}.</p>` : ''}
    </div>
    <details class="stat-disclosure"><summary>Полная статистика</summary><table class="stat-table">
      <thead><tr><td></td>${rows.map(([title]) => `<th scope="col">${title}</th>`).join('')}</tr></thead>
      <tbody>${columns.map(([title, key]) => `<tr><th scope="row">${title}</th>${rows.map(([, row]) => `<td>${row.played || key === 'played' ? label(row[key]) : '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></details></div>`;
  }
  function clubForm(recent, key, clubName, badge, scoreOf) {
    const tiles = recent.slice(0, 5).reverse().map(match => {
      const score = scoreOf(match);
      if (!score) return '';
      const home = match.home === key;
      const opponent = home ? match.away : match.home;
      const [own, other] = home ? score : score.slice().reverse();
      const [kind, sign, outcome] = own > other ? ['won', 'В', 'Победа'] : own < other ? ['lost', 'П', 'Поражение'] : ['drawn', 'Н', 'Ничья'];
      return `<li><button type="button" data-match="${esc(match.id)}" aria-label="${esc(`${outcome}: ${clubName(match.home)} — ${clubName(match.away)}, ${score.join(':')}`)}">
        <span class="stat-form-result stat-fill-${kind}" aria-hidden="true">${sign}</span>${badge(opponent)}<b>${own}:${other}</b></button></li>`;
    }).join('');
    return tiles ? `<div class="club-chart"><ol class="stat-form" aria-label="От более раннего матча к последнему">${tiles}</ol><p class="stat-note">Счёт с точки зрения клуба · последний матч справа</p></div>` : '';
  }
  const api = { donut, seasonContent, careerCategories, careerContent, clubSeason, clubSplits, clubForm, metrics, shortSeason, number };
  if (typeof window !== 'undefined') window.rplStatsCharts = api;
  if (typeof globalThis !== 'undefined') globalThis.rplStatsCharts = api;
})();
