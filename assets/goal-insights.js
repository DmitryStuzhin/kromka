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
  function toEvents(item) {
    const values = item?.events || item?.goals || item?.matchEvents || item?.match_events || [];
    if (!Array.isArray(values)) return [];
    return values.map((event) => {
      const minute = event.minute ?? event.time?.elapsed ?? event.time ?? event.elapsed ?? '—';
      const player = nameOf(event.player || event.scorer || event.athlete);
      const kind = plain(event.type?.name || event.type || event.detail || event.name || 'Событие');
      const text = plain(event.description || [kind, player].filter(Boolean).join(' · '));
      const minuteText = String(minute).trim();
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
      return [plain(stat.name || stat.type?.name || stat.type || stat.label || stat.statistic || 'Показатель'), statText(home), statText(away), homeNumber, awayNumber];
    }).filter(Boolean);
  }
  function normalizeEventsPayload(payload) {
    const rows = Array.isArray(payload) ? payload : findArray(payload, ['events', 'incidents', 'goals', 'items', 'results', 'data']);
    return toEvents({ events: rows });
  }
  function normalizeStatsPayload(payload) {
    const rows = Array.isArray(payload) ? payload : findArray(payload, ['statistics', 'stats', 'matchStatistics', 'match_statistics', 'items', 'results', 'data']);
    return toStats({ statistics: rows });
  }
  const api = Object.freeze({ plain, safe, scalar, findArray, toEvents, toStats, normalizeEventsPayload, normalizeStatsPayload });
  if (typeof globalThis !== 'undefined') globalThis.rplMatchInsights = api;
  if (typeof window !== 'undefined') window.rplMatchInsights = api;
})();
