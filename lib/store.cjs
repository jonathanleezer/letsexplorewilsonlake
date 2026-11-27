/* Storage for visitor analytics.
 *  - postgresStore(query): Postgres. In production `query` is Neon's HTTP driver; tests pass `pg`.
 *    The Vercel Neon integration sets DATABASE_URL (or POSTGRES_URL).
 *  - memoryStore(): local development and tests.
 * Interface (all async):
 *   getMeta(sid) -> meta | null
 *   saveMeta(meta)                      insert or replace a visit summary
 *   addEvents(sid, events[])
 *   list(sinceMs, limit) -> meta[]      newest first
 *   events(sid) -> event[]              oldest first
 *   purge(beforeMs)                     delete visits (and their events) that started before
 */
'use strict';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lw_sessions (
     sid text PRIMARY KEY,
     start_ms bigint NOT NULL,
     meta jsonb NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS lw_sessions_start ON lw_sessions (start_ms DESC)`,
  `CREATE TABLE IF NOT EXISTS lw_events (
     id bigserial PRIMARY KEY,
     sid text NOT NULL REFERENCES lw_sessions (sid) ON DELETE CASCADE,
     ev jsonb NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS lw_events_sid ON lw_events (sid, id)`,
];

function postgresStore(query) {
  let ready = null;
  const q = async (text, params = []) => {
    if (!ready) ready = (async () => { for (const s of SCHEMA) await query(s, []); })().catch(e => { ready = null; throw e; });
    await ready;
    return query(text, params);
  };
  const obj = v => (typeof v === 'string' ? JSON.parse(v) : v);
  return {
    async getMeta(sid) {
      const r = await q('SELECT meta FROM lw_sessions WHERE sid = $1', [sid]);
      return r.length ? obj(r[0].meta) : null;
    },
    async saveMeta(m) {
      await q(`INSERT INTO lw_sessions (sid, start_ms, meta) VALUES ($1, $2, $3::jsonb)
               ON CONFLICT (sid) DO UPDATE SET meta = EXCLUDED.meta`, [m.sid, m.start, JSON.stringify(m)]);
    },
    async addEvents(sid, events) {
      if (!events.length) return;
      await q(`INSERT INTO lw_events (sid, ev) SELECT $1, x FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(x, n) ORDER BY n`,
        [sid, JSON.stringify(events)]);
    },
    async list(sinceMs, limit) {
      const r = await q('SELECT meta FROM lw_sessions WHERE start_ms >= $1 ORDER BY start_ms DESC LIMIT $2', [sinceMs, limit]);
      return r.map(x => obj(x.meta));
    },
    async events(sid) {
      const r = await q('SELECT ev FROM lw_events WHERE sid = $1 ORDER BY id', [sid]);
      return r.map(x => obj(x.ev));
    },
    async purge(beforeMs) { await q('DELETE FROM lw_sessions WHERE start_ms < $1', [beforeMs]); },
  };
}

function memoryStore() {
  const S = new Map(), E = new Map();
  const clone = v => JSON.parse(JSON.stringify(v));
  return {
    async getMeta(sid) { return S.has(sid) ? clone(S.get(sid)) : null; },
    async saveMeta(m) { S.set(m.sid, clone(m)); },
    async addEvents(sid, ev) { E.set(sid, (E.get(sid) || []).concat(clone(ev))); },
    async list(since, limit) { return [...S.values()].filter(m => m.start >= since).sort((a, b) => b.start - a.start).slice(0, limit).map(clone); },
    async events(sid) { return clone(E.get(sid) || []); },
    async purge(before) { for (const [k, m] of S) if (m.start < before) { S.delete(k); E.delete(k); } },
  };
}

let cached;
function defaultStore() {
  if (cached !== undefined) return cached;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return (cached = null);
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(url);
  cached = postgresStore((text, params) => sql.query(text, params));
  return cached;
}

module.exports = { postgresStore, memoryStore, defaultStore, SCHEMA };
