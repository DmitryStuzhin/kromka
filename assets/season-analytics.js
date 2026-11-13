(() => {
  function scoreOf(match) {
    if (match?.status !== 'finished') return null;
    const found = String(match.score || '').match(/(^|\s)(\d+)\s*[:–—-]\s*(\d+)(\s|$)/);
    return found ? [Number(found[2]), Number(found[3])] : null;
  }
  function compareNewest(a, b) {
    return String(b.dateKey || '').localeCompare(String(a.dateKey || '')) || String(b.time || '').localeCompare(String(a.time || ''));
  }
  function finishedForTeam(matches, key) {
    return (Array.isArray(matches) ? matches : [])
      .filter((match) => (match.home === key || match.away === key) && scoreOf(match))
      .sort(compareNewest);
  }
  function recordFor(matches, key) {
    const row = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, points: 0 };
    for (const match of matches) {
      const score = scoreOf(match);
      if (!score) continue;
      const home = match.home === key;
      const own = home ? score[0] : score[1];
      const against = home ? score[1] : score[0];
      row.played += 1;
      row.goalsFor += own;
      row.goalsAgainst += against;
      if (against === 0) row.cleanSheets += 1;
      if (own > against) { row.won += 1; row.points += 3; }
      else if (own === against) { row.drawn += 1; row.points += 1; }
      else row.lost += 1;
    }
    return row;
  }
  function teamSplits(matches, key) {
    const finished = finishedForTeam(matches, key);
    const home = finished.filter((match) => match.home === key);
    const away = finished.filter((match) => match.away === key);
    return { total: recordFor(finished, key), home: recordFor(home, key), away: recordFor(away, key), matches: finished };
  }
  function headToHead(matches, first, second) {
    const direct = (Array.isArray(matches) ? matches : [])
      .filter((match) => ((match.home === first && match.away === second) || (match.home === second && match.away === first)) && scoreOf(match))
      .sort(compareNewest);
    const summary = { first: 0, draws: 0, second: 0, goalsFirst: 0, goalsSecond: 0 };
    for (const match of direct) {
      const score = scoreOf(match);
      const firstGoals = match.home === first ? score[0] : score[1];
      const secondGoals = match.home === first ? score[1] : score[0];
      summary.goalsFirst += firstGoals;
      summary.goalsSecond += secondGoals;
      if (firstGoals > secondGoals) summary.first += 1;
      else if (firstGoals < secondGoals) summary.second += 1;
      else summary.draws += 1;
    }
    return { matches: direct, summary };
  }
  const api = { scoreOf, finishedForTeam, recordFor, teamSplits, headToHead };
  if (typeof window !== 'undefined') window.rplSeasonAnalytics = api;
  if (typeof globalThis !== 'undefined') globalThis.rplSeasonAnalytics = api;
})();
