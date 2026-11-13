const TEAMS = Object.freeze({
  din: { id: 'cmr7uolsy8mghrx06jog9s5dt', name: 'Dynamo Moscow' },
  zen: { id: 'cmr7uolst8mgfrx06mqhdh3qs', name: 'Zenit Saint Petersburg' },
  spa: { id: 'cmr7uolso8mgcrx06cn6sa9ix', name: 'Spartak Moscow' },
  cska: { id: 'cmr7uolsu8mggrx06zkk540w9', name: 'CSKA Moscow' },
  kra: { id: 'cmr7uolsb8mg6rx06bm79bwbe', name: 'Krasnodar' },
  ore: { id: 'cmr7uolt88mglrx06dkah1bw7', name: 'Orenburg' },
  bal: { id: 'cmr7uolsf8mg8rx06mricgkwz', name: 'Baltika' },
  dmx: { id: 'cmr7uolt08mgjrx06xj1x745j', name: 'Dynamo Makhachkala' },
  ros: { id: 'cmr7uolsy8mgirx06lps95sxi', name: 'FK Rostov' },
  rub: { id: 'cmr7uolso8mgbrx06e5bwsovt', name: 'Rubin Kazan' },
  kry: { id: 'cmr7uolt48mgkrx06mtepmfuh', name: 'Krylya Sovetov Samara' },
  loko: { id: 'cmr7uolsb8mg7rx06aps282s2', name: 'Lokomotiv Moscow' },
  akh: { id: 'cmr7uolte8mgprx06586mvsut', name: 'Akhmat Grozny' },
  akr: { id: 'cmr7uolsj8mg9rx06lps3j1ye', name: 'Akron Tolyatti' },
  fak: { id: 'cmr7uop9q8nosrx06j3ktdh8n', name: 'Fakel Voronezh' },
  rod: { id: 'cmr7uopea8ns6rx06dhawawlh', name: 'Rodina Moscow' }
});

export const FLASH_TEAM_BY_GOAL_ID = new Map(Object.entries(TEAMS).map(([code, team]) => [team.id, code]));
export const FLASH_TEAM_CODES = Object.freeze(Object.keys(TEAMS));
const TEAM_BY_CODE = TEAMS;
const TEAM_BY_ID = new Map(Object.values(TEAMS).map((team) => [team.id, team]));
const POSITION_NAMES = Object.freeze({ GK: 'Goalkeepers', DF: 'Defenders', MF: 'Midfielders', FW: 'Forwards' });

function intOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function matchTeam(code) {
  const team = TEAM_BY_CODE[String(code || '')];
  return team ? { ...team, code: String(code) } : null;
}

function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')); }
function validTime(value) { return /^\d{2}:\d{2}$/.test(String(value || '')); }

export function mapFlashscoreFixture(match) {
  const home = matchTeam(match?.h);
  const away = matchTeam(match?.a);
  const id = String(match?.id || '');
  const day = String(match?.d || '');
  if (!home || !away || !/^[A-Za-z0-9]{6,12}$/.test(id) || !validDay(day)) return null;
  const time = validTime(match?.t) ? match.t : '00:00';
  const live = match?.live === true || Number(match?.st) === 2;
  const finished = Number(match?.st) === 3;
  const status = live ? 'LIVE' : finished ? 'FINISHED' : 'SCHEDULED';
  const homeScore = live || finished ? intOrNull(match?.hg) : null;
  const awayScore = live || finished ? intOrNull(match?.ag) : null;
  return {
    id,
    fixtureId: id,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeTeam: { id: home.id, name: home.name },
    awayTeam: { id: away.id, name: away.name },
    kickoffUtc: `${day}T${time}:00+03:00`,
    matchDate: `${day}T${time}:00+03:00`,
    matchTime: time,
    matchRound: intOrNull(match?.r),
    matchStatus: status,
    status,
    matchLive: live,
    homeScore,
    awayScore,
    provider: 'Flashscore',
    flashscoreHomeCode: home.code,
    flashscoreAwayCode: away.code,
    flashscoreMatchId: id
  };
}

export function deriveFlashscoreStandings(fixtures) {
  const table = new Map(FLASH_TEAM_CODES.map((code, order) => {
    const team = TEAM_BY_CODE[code];
    return [team.id, { team: { id: team.id, name: team.name }, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, order }];
  }));
  for (const fixture of fixtures) {
    if (fixture.status !== 'FINISHED' || fixture.homeScore === null || fixture.awayScore === null) continue;
    const home = table.get(fixture.homeTeamId);
    const away = table.get(fixture.awayTeamId);
    if (!home || !away) continue;
    home.played += 1; away.played += 1;
    home.goalsFor += fixture.homeScore; home.goalsAgainst += fixture.awayScore;
    away.goalsFor += fixture.awayScore; away.goalsAgainst += fixture.homeScore;
    if (fixture.homeScore > fixture.awayScore) { home.won += 1; home.points += 3; away.lost += 1; }
    else if (fixture.homeScore < fixture.awayScore) { away.won += 1; away.points += 3; home.lost += 1; }
    else { home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1; }
  }
  return [...table.values()]
    .sort((a, b) => b.points - a.points || b.won - a.won || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.order - b.order)
    .map(({ order, ...row }) => ({
      ...row,
      overallLeaguePlayed: row.played,
      overallLeagueW: row.won,
      overallLeagueD: row.drawn,
      overallLeagueL: row.lost,
      overallLeagueGF: row.goalsFor,
      overallLeagueGA: row.goalsAgainst,
      overallLeaguePTS: row.points
    }));
}

export function flashscoreSeasonPayload(payload, season = '2026') {
  const sourceRows = Array.isArray(payload?.matches) ? payload.matches : [];
  const fixtures = sourceRows.map(mapFlashscoreFixture).filter(Boolean);
  if (!fixtures.length) throw new Error('Flashscore proxy returned no valid RPL fixtures');
  const teamsSeen = new Set(fixtures.flatMap((fixture) => [fixture.homeTeamId, fixture.awayTeamId]));
  const playedByTeam = new Map(FLASH_TEAM_CODES.map((code) => [TEAM_BY_CODE[code].id, 0]));
  for (const fixture of fixtures) {
    playedByTeam.set(fixture.homeTeamId, (playedByTeam.get(fixture.homeTeamId) || 0) + 1);
    playedByTeam.set(fixture.awayTeamId, (playedByTeam.get(fixture.awayTeamId) || 0) + 1);
  }
  const historyComplete = fixtures.length >= 200 && teamsSeen.size === FLASH_TEAM_CODES.length && [...playedByTeam.values()].every((count) => count >= 20);
  return {
    fixtures: { data: fixtures },
    standings: { data: deriveFlashscoreStandings(fixtures) },
    provider: 'Flashscore',
    season,
    fixtureHistoryComplete: historyComplete,
    fetchedAt: new Date().toISOString(),
    flashscoreMatchCount: fixtures.length
  };
}

function flashscorePlayer(row, rosterById) {
  if (!Array.isArray(row)) return null;
  const [rawId, rawName, rawNumber, rawRating, , flags] = row;
  const id = String(rawId || '');
  const known = rosterById?.get(id);
  const name = String(known?.name || rawName || '').trim();
  if (!id || !name) return null;
  const position = known?.position || (flags === 'G' ? 'Goalkeepers' : '');
  const player = {
    id,
    name,
    number: rawNumber === null || rawNumber === undefined || rawNumber === '' ? (known?.number ?? '') : String(rawNumber),
    playerPosition: position,
    type: position,
    lineupNumber: rawNumber === null || rawNumber === undefined || rawNumber === '' ? (known?.number ?? '') : String(rawNumber)
  };
  if (known?.image) player.image = known.image;
  if (rawRating !== null && rawRating !== undefined && rawRating !== '') player.rating = rawRating;
  return player;
}

export function flashscoreMatchLineups(payload, fixture, rosterById = new Map()) {
  const raw = payload?.li;
  if (!raw || typeof raw !== 'object') return { data: { home: {}, away: {}, homeFormation: '', awayFormation: '' }, provider: 'Flashscore' };
  const side = (key) => {
    const value = raw[key] || {};
    return {
      startingLineups: (Array.isArray(value.xi) ? value.xi : []).map((row) => flashscorePlayer(row, rosterById)).filter(Boolean),
      substitutes: (Array.isArray(value.subs) ? value.subs : []).map((row) => flashscorePlayer(row, rosterById)).filter(Boolean),
      formation: String(value.f || '')
    };
  };
  const home = side('1');
  const away = side('2');
  return {
    data: {
      home,
      away,
      homeFormation: home.formation,
      awayFormation: away.formation,
      referee: payload.ref || '',
      venue: payload.ven || '',
      attendance: payload.att || ''
    },
    provider: 'Flashscore',
    fixtureId: fixture?.flashscoreMatchId || fixture?.id || ''
  };
}

export function flashscoreMatchEvents(payload, fixture, rosterById = new Map()) {
  const output = [];
  const home = TEAM_BY_ID.get(fixture?.homeTeamId);
  const away = TEAM_BY_ID.get(fixture?.awayTeamId);
  for (const row of Array.isArray(payload?.ev) ? payload.ev : []) {
    if (!Array.isArray(row)) continue;
    const [side, minute, parts] = row;
    const team = Number(side) === 1 ? home : Number(side) === 2 ? away : null;
    for (const part of Array.isArray(parts) ? parts : []) {
      if (!Array.isArray(part)) continue;
      const [code, description, playerId] = part;
      const text = String(description || '').trim();
      const player = rosterById.get(String(playerId || ''));
      const event = {
        minute: String(minute || '—'),
        type: text || String(code ?? 'Событие'),
        description: [text || String(code ?? 'Событие'), player?.name].filter(Boolean).join(' · '),
        eventCode: code,
        playerId: String(playerId || '')
      };
      if (player?.name) event.player = { name: player.name };
      if (team) event.team = { id: team.id, name: team.name };
      output.push(event);
    }
  }
  return { data: output, provider: 'Flashscore' };
}

export function flashscoreMatchStatistics(payload) {
  const groups = Array.isArray(payload?.g) ? payload.g : [];
  const statistics = (Array.isArray(payload?.st) ? payload.st : []).map((row) => {
    if (!Array.isArray(row)) return null;
    const [groupIndex, name, home, away] = row;
    const group = groups[Number(groupIndex)] || '';
    return { name: [group, name].filter(Boolean).join(' · '), home: home ?? null, away: away ?? null };
  }).filter(Boolean);
  return { data: statistics, provider: 'Flashscore' };
}

export function flashscoreRoster(players, teamCode) {
  const rows = Array.isArray(players) ? players.filter((player) => player?.t === teamCode) : [];
  return {
    data: rows.map((player) => {
      const position = POSITION_NAMES[player?.p] || '';
      const imageId = String(player?.img || '');
      const safeImageId = /^[A-Za-z0-9._-]+$/.test(imageId) ? imageId : '';
      return {
        id: String(player?.id || ''),
        name: String(player?.n || '').trim(),
        number: player?.no === null || player?.no === undefined ? '' : String(player.no),
        type: position,
        playerPosition: position,
        age: intOrNull(player?.age),
        image: safeImageId ? `https://static.flashscore.com/res/image/data/${safeImageId}` : '',
        portraitSource: safeImageId ? 'Flashscore' : ''
      };
    }).filter((player) => player.id && player.name),
    provider: 'Flashscore'
  };
}

export function flashscoreRosterById(players, teamCode) {
  const output = new Map();
  for (const player of Array.isArray(players) ? players : []) {
    if (player?.t !== teamCode || !player?.id) continue;
    const position = POSITION_NAMES[player?.p] || '';
    const imageId = String(player?.img || '');
    const image = /^[A-Za-z0-9._-]+$/.test(imageId) ? `https://static.flashscore.com/res/image/data/${imageId}` : '';
    output.set(String(player.id), { name: String(player.n || ''), number: player.no ?? '', position, image });
  }
  return output;
}
