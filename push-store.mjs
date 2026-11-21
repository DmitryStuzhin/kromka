import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const PUSH_KINDS = ['goal', 'lineups', 'start', 'finish'];
export const PUSH_CONSENT = '2026-11-21';
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const hash = value => createHash('sha256').update(value).digest('hex');
const fault = (status, message) => Object.assign(new Error(message), { status });
const score = value => ['number', 'string'].includes(typeof value) && String(value).trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99 ? Number(value) : null;
const clean = value => String(value || '').replace(/[\x00-\x1f]/g, '').slice(0, 100);

export function validateDevice(id, secret, input) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !/^[A-Za-z0-9_-]{43,100}$/.test(secret)) throw fault(400, 'Invalid installation credentials');
  if (!input || input.consent !== PUSH_CONSENT) throw fault(400, 'Push consent is required');
  if (typeof input.token !== 'string' || input.token.length < 20 || input.token.length > 4096 || /\s|[\x00-\x1f]/.test(input.token)) throw fault(400, 'Invalid push token');
  const list = (value, allowed) => {
    if (!Array.isArray(value) || value.length > 100 || value.some(v => typeof v !== 'string' || !(allowed ? allowed.includes(v) : /^[A-Za-z0-9_-]{1,64}$/.test(v)))) throw fault(400, 'Invalid subscriptions');
    return [...new Set(value)].sort();
  };
  return { token: input.token, fixtureIds: list(input.fixtureIds), teamIds: list(input.teamIds), kinds: list(input.kinds, PUSH_KINDS), consent: PUSH_CONSENT };
}

export function normalizePushFixture(row) {
  const id = String(row?.id || row?.fixtureId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const state = row.matchStatus || row.status || row.state || '';
  const raw = (typeof state === 'object' ? [state.state, state.status, state.name, state.short, state.code].filter(Boolean).join(' ') : String(state)).toUpperCase().replace(/[_-]/g, ' ');
  const status = /FINISHED|FULL TIME|COMPLETED|ENDED|^FT$/.test(raw) ? 'finished'
    : row.matchLive === true || /LIVE|IN PLAY|IN PROGRESS|^1H$|^2H$|^HT$|HALF TIME/.test(raw) ? 'live' : 'scheduled';
  const sideScore = side => [row[`${side}Score`], row[`${side}TeamScore`], row.goals?.[side], row.score?.[side], row.score?.fullTime?.[side]].map(score).find(value => value !== null) ?? null;
  return { id, status, homeScore: sideScore('home'), awayScore: sideScore('away'),
    kickoff: Date.parse(row.kickoffUtc || row.kickoff_utc || row.matchDate || '') || 0,
    homeTeamId: clean(row.homeTeamId || row.homeTeam?.id), awayTeamId: clean(row.awayTeamId || row.awayTeam?.id),
    home: clean(row.homeTeam?.name) || 'Хозяева', away: clean(row.awayTeam?.name) || 'Гости' };
}

export class PushStore {
  constructor(filename) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, token TEXT NOT NULL UNIQUE, prefs TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, value TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, fixture_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS deliveries(event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_at INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, error TEXT,
        PRIMARY KEY(event_id,device_id));
      CREATE INDEX IF NOT EXISTS deliveries_due ON deliveries(status,next_at);`);
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  authorize(id, secret) {
    const row = this.db.prepare('SELECT * FROM devices WHERE id=?').get(id);
    const candidate = hash(secret);
    if (!row || !timingSafeEqual(Buffer.from(row.secret_hash), Buffer.from(candidate))) throw fault(401, 'Installation credentials rejected');
    return row;
  }
  register(id, secret, input, now = Date.now()) {
    const prefs = validateDevice(id, secret, input);
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT id,prefs FROM devices WHERE id=?').get(id);
      if (existing) this.authorize(id, secret);
      const owner = this.db.prepare('SELECT id FROM devices WHERE token=?').get(prefs.token);
      if (owner && owner.id !== id) throw fault(409, 'Push token already registered');
      if (!existing && this.db.prepare('SELECT count(*) AS n FROM devices').get().n >= 10000) throw fault(503, 'Registration capacity reached');
      const { token, ...subscriptions } = prefs;
      this.db.prepare(`INSERT INTO devices VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,prefs=excluded.prefs,updated=excluded.updated`).run(id, hash(secret), token, JSON.stringify(subscriptions), now);
      // Changing preferences cancels unsent notifications from the old subscription.
      if (existing && existing.prefs !== JSON.stringify(subscriptions)) this.db.prepare("DELETE FROM deliveries WHERE device_id=? AND status!='sent'").run(id);
      return subscriptions;
    });
  }
  remove(id, secret) { this.authorize(id, secret); this.db.prepare('DELETE FROM devices WHERE id=?').run(id); }
  preferences(id, secret) { return JSON.parse(this.authorize(id, secret).prefs); }
  subscribers() { return this.db.prepare('SELECT id,prefs FROM devices').all().map(row => ({ id: row.id, ...JSON.parse(row.prefs) })); }
  matches(prefs, fixture, kind) { return prefs.kinds.includes(kind) && (prefs.fixtureIds.includes(fixture.id) || prefs.teamIds.includes(fixture.homeTeamId) || prefs.teamIds.includes(fixture.awayTeamId)); }
  interested(fixture, kind) { return this.subscribers().some(prefs => this.matches(prefs, fixture, kind)); }
  enqueue(fixture, kind, signature, now) {
    const id = hash(`${fixture.id}:${kind}:${signature}`);
    const title = { goal: 'Гол', lineups: 'Составы опубликованы', start: 'Матч начался', finish: 'Матч завершён' }[kind];
    const result = fixture.homeScore === null || fixture.awayScore === null ? '' : ` · ${fixture.homeScore}:${fixture.awayScore}`;
    const payload = { title, body: `${fixture.home} — ${fixture.away}${result}`, fixtureId: fixture.id, eventId: id, kind };
    const inserted = this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?)').run(id, fixture.id, kind, JSON.stringify(payload), now, now + (kind === 'lineups' ? 30 : 10) * MINUTE);
    if (!inserted.changes) return;
    for (const prefs of this.subscribers()) if (this.matches(prefs, fixture, kind)) this.db.prepare('INSERT OR IGNORE INTO deliveries(event_id,device_id,next_at) VALUES(?,?,?)').run(id, prefs.id, now);
  }
  observe(fixture, { lineups = false, now = Date.now() } = {}) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM snapshots WHERE id=?').get(fixture.id);
      const old = row ? JSON.parse(row.value) : null;
      // First observation and long outages establish a baseline, never replay historical goals.
      if (old && now - row.updated <= 5 * MINUTE && now >= row.updated) {
        if (old.status === 'scheduled' && fixture.status === 'live') this.enqueue(fixture, 'start', 'once', now);
        if (old.status === 'live' && fixture.status === 'finished') this.enqueue(fixture, 'finish', 'once', now);
        if (old.status === 'live' && ['live', 'finished'].includes(fixture.status) && old.homeScore !== null && old.awayScore !== null && fixture.homeScore !== null && fixture.awayScore !== null
          && fixture.homeScore >= old.homeScore && fixture.awayScore >= old.awayScore && fixture.homeScore + fixture.awayScore > old.homeScore + old.awayScore) {
          this.enqueue(fixture, 'goal', `${fixture.homeScore}:${fixture.awayScore}`, now);
        }
      }
      const nearKickoff = fixture.status === 'scheduled' && fixture.kickoff > now && fixture.kickoff - now <= 2 * 60 * MINUTE;
      if (lineups && !old?.lineups && nearKickoff) this.enqueue(fixture, 'lineups', 'once', now);
      this.db.prepare('INSERT INTO snapshots VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated=excluded.updated').run(fixture.id, JSON.stringify({ ...fixture, lineups: Boolean(lineups || old?.lineups) }), now);
    });
  }
  claim(now = Date.now()) {
    return this.transaction(() => {
      this.db.prepare("UPDATE deliveries SET status='pending' WHERE status='sending' AND lease<?").run(now);
      this.db.prepare("UPDATE deliveries SET status='expired' WHERE status='pending' AND event_id IN (SELECT id FROM events WHERE expires<=?)").run(now);
      const row = this.db.prepare(`SELECT d.*, e.payload, e.expires, v.token FROM deliveries d JOIN events e ON e.id=d.event_id JOIN devices v ON v.id=d.device_id
        WHERE d.status='pending' AND d.next_at<=? AND e.expires>? ORDER BY d.next_at LIMIT 1`).get(now, now);
      if (!row) return null;
      this.db.prepare("UPDATE deliveries SET status='sending', attempts=attempts+1, lease=? WHERE event_id=? AND device_id=?").run(now + MINUTE, row.event_id, row.device_id);
      return { ...row, attempts: row.attempts + 1, payload: JSON.parse(row.payload) };
    });
  }
  settle(job, outcome, now = Date.now()) {
    if (outcome === 'unregistered') {
      this.db.prepare('DELETE FROM devices WHERE id=? AND token=?').run(job.device_id, job.token);
      return;
    }
    const terminal = outcome === 'sent' || outcome === 'invalid' || job.attempts >= 6;
    const status = outcome === 'sent' ? 'sent' : terminal ? 'failed' : 'pending';
    this.db.prepare("UPDATE deliveries SET status=?,error=?,next_at=?,lease=0 WHERE event_id=? AND device_id=? AND attempts=? AND status='sending'").run(status, outcome === 'sent' ? null : outcome, now + Math.min(300_000, 5000 * 2 ** job.attempts), job.event_id, job.device_id, job.attempts);
  }
  prune(now = Date.now()) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM devices WHERE updated<?').run(now - 90 * DAY);
      this.db.prepare('DELETE FROM events WHERE created<?').run(now - 7 * DAY);
      this.db.prepare('DELETE FROM snapshots WHERE updated<?').run(now - 30 * DAY);
    });
  }
  counts() { return { devices: this.db.prepare('SELECT count(*) AS n FROM devices').get().n, pending: this.db.prepare("SELECT count(*) AS n FROM deliveries WHERE status IN ('pending','sending')").get().n }; }
}
