/* Storage for visitor analytics.
 *  - upstashStore(): Upstash Redis over its REST API (plain fetch, no SDK). The Vercel Upstash
 *    integration sets KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN).
 *  - memoryStore(): local development and tests.
 * Interface (all async):
 *   pipeline(cmds) -> results   e.g. [['SET','k','v','EX',60], ['RPUSH','l','a','b']]
 * Only the commands used by lib/analytics.cjs are implemented in memoryStore.
 */
'use strict';

function upstashStore(url, token) {
  return {
    async pipeline(cmds) {
      if (!cmds.length) return [];
      const r = await fetch(url.replace(/\/$/, '') + '/pipeline', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(cmds.map(c => c.map(String))),
      });
      if (!r.ok) throw new Error('upstash ' + r.status);
      const out = await r.json();
      return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
    },
  };
}

function memoryStore(now = () => Date.now()) {
  const m = new Map(); // key -> { t: 'str'|'list'|'zset', v, exp }
  const live = k => { const e = m.get(k); if (e && e.exp && e.exp <= now()) { m.delete(k); return null; } return e || null; };
  const run = c => {
    const [cmd, k, ...a] = c; const C = cmd.toUpperCase();
    if (C === 'SET') { const e = { t: 'str', v: String(a[0]), exp: 0 }; const i = a.indexOf('EX'); if (i >= 0) e.exp = now() + Number(a[i + 1]) * 1000; m.set(k, e); return 'OK'; }
    if (C === 'GET') { const e = live(k); return e ? e.v : null; }
    if (C === 'MGET') return [k, ...a].map(x => { const e = live(x); return e ? e.v : null; });
    if (C === 'EXPIRE') { const e = live(k); if (e) e.exp = now() + Number(a[0]) * 1000; return e ? 1 : 0; }
    if (C === 'RPUSH') { const e = live(k) || { t: 'list', v: [], exp: 0 }; e.v.push(...a.map(String)); m.set(k, e); return e.v.length; }
    if (C === 'LTRIM') { const e = live(k); if (e) { const s = Number(a[0]), en = Number(a[1]); e.v = e.v.slice(s < 0 ? Math.max(0, e.v.length + s) : s, en < 0 ? e.v.length + en + 1 : en + 1); } return 'OK'; }
    if (C === 'LRANGE') { const e = live(k); if (!e) return []; const s = Number(a[0]), en = Number(a[1]); return e.v.slice(s, en < 0 ? e.v.length + en + 1 : en + 1); }
    if (C === 'ZADD') { const e = live(k) || { t: 'zset', v: new Map(), exp: 0 }; e.v.set(String(a[1]), Number(a[0])); m.set(k, e); return 1; }
    if (C === 'ZREMRANGEBYSCORE') { const e = live(k); if (!e) return 0; let n = 0; const lo = Number(a[0]), hi = a[1] === '+inf' ? Infinity : Number(a[1]); for (const [mem, s] of e.v) if (s >= lo && s <= hi) { e.v.delete(mem); n++; } return n; }
    if (C === 'ZRANGE') { // ZRANGE key max min BYSCORE REV LIMIT 0 n  (only the form we use)
      const e = live(k); if (!e) return [];
      const hi = a[0] === '+inf' ? Infinity : Number(a[0]), lo = a[1] === '-inf' ? -Infinity : Number(a[1]);
      const li = a.indexOf('LIMIT'); const cnt = li >= 0 ? Number(a[li + 2]) : Infinity;
      return [...e.v].filter(([, s]) => s >= lo && s <= hi).sort((x, y) => y[1] - x[1]).slice(0, cnt).map(([mem]) => mem);
    }
    if (C === 'INCR') { const e = live(k) || { t: 'str', v: '0', exp: 0 }; e.v = String(Number(e.v) + 1); m.set(k, e); return Number(e.v); }
    throw new Error('memoryStore: unsupported ' + C);
  };
  return { async pipeline(cmds) { return cmds.map(run); } };
}

let cached;
function defaultStore() {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? upstashStore(url, token) : null;
  return cached;
}

module.exports = { upstashStore, memoryStore, defaultStore };
