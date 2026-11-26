/* Visitor analytics: ingest batches from /track.js and answer admin queries.
 *
 * Stored per visit (session), kept RETENTION_DAYS:
 *   lw:s:<sid>  JSON summary (source, device, coarse location, scroll, section times, counts)
 *   lw:e:<sid>  list of raw events (JSON), newest MAX_EVENTS kept
 *   lw:idx      sorted set of session ids by start time
 * Not stored: IP addresses, keystrokes, form contents, anything inside the booking widget.
 */
'use strict';

const RETENTION_DAYS = 90;
const TTL = RETENTION_DAYS * 86400;
const MAX_EVENTS = 1500;
const MAX_BATCH_EVENTS = 200;
const MAX_BATCHES = 400;
const ID = /^[a-z0-9]{10,40}$/i;

const str = (v, n = 120) => (v == null ? '' : String(v)).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
const num = (v, max = 1e9) => { const x = Number(v); return Number.isFinite(x) ? Math.max(0, Math.min(max, Math.round(x))) : 0; };

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|skypeuripreview|bitlybot|vercel-|uptime|monitor|python-requests|curl|wget|httpclient|axios|node-fetch|go-http/i;

function parseUA(ua) {
  ua = String(ua || '');
  let browser = 'Other';
  if (/FBAN|FBAV/.test(ua)) browser = 'Facebook app';
  else if (/Instagram/.test(ua)) browser = 'Instagram app';
  else if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/CriOS|Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Other';
  if (/iPad/.test(ua)) os = 'iPadOS';
  else if (/iPhone|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'Tablet' : /Mobi|iPhone|Android/.test(ua) ? 'Mobile' : 'Desktop';
  return { browser, os, device };
}

const SOURCES = [
  [/google\./, 'Google'], [/bing\.com/, 'Bing'], [/duckduckgo/, 'DuckDuckGo'], [/yahoo\./, 'Yahoo'],
  [/(^|\.)facebook\.com|fb\.com|fb\.me/, 'Facebook'], [/instagram\./, 'Instagram'], [/^t\.co$|twitter\.com|x\.com/, 'X'],
  [/pinterest\./, 'Pinterest'], [/reddit\./, 'Reddit'], [/linkedin\./, 'LinkedIn'], [/tiktok\./, 'TikTok'],
  [/airbnb\./, 'Airbnb'], [/vrbo\.|homeaway\./, 'Vrbo'], [/hospitable|hsptb/, 'Hospitable'],
  [/chatgpt\.com|openai\.com/, 'ChatGPT'], [/perplexity\./, 'Perplexity'], [/claude\.ai/, 'Claude'],
  [/mail\.|outlook\.|gmail/, 'Email'],
];
function sourceOf(refHost, utm) {
  if (utm && utm.source) return str(utm.source, 40);
  if (!refHost) return 'Direct';
  for (const [re, name] of SOURCES) if (re.test(refHost)) return name;
  return refHost.replace(/^www\./, '');
}

function hostOf(ref) { try { return new URL(ref).hostname.toLowerCase(); } catch { return ''; } }

function cleanEvent(e) {
  if (!e || typeof e !== 'object') return null;
  const k = str(e.k, 24);
  if (!/^[a-z_]+$/.test(k)) return null;
  const out = { t: num(e.t, 864e5), k };
  // only known, short fields survive
  for (const f of ['s', 'label', 'href', 'tag', 'a', 'cap', 'msg', 'text', 'dir']) if (e[f] != null) out[f] = str(e[f], f === 'href' ? 300 : 160);
  for (const f of ['i', 'p', 'x', 'y', 'n', 'v', 'ms']) if (e[f] != null) out[f] = num(e[f], 1e7);
  return out;
}

/* Ingest one batch. Returns {ok} or {ok:false, status, error}. */
async function ingest(store, body, headers = {}, now = Date.now()) {
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'bad body' };
  const sid = String(body.sid || ''), vid = String(body.vid || '');
  if (!ID.test(sid) || !ID.test(vid)) return { ok: false, status: 400, error: 'bad id' };
  const ua = headers['user-agent'] || '';
  if (BOT.test(ua)) return { ok: true, skipped: 'bot' };
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, MAX_BATCH_EVENTS).map(cleanEvent).filter(Boolean);

  const mk = 'lw:s:' + sid, ek = 'lw:e:' + sid, bk = 'lw:b:' + sid;
  const [raw, batches] = await store.pipeline([['GET', mk], ['INCR', bk], ['EXPIRE', bk, TTL]]);
  if (batches > MAX_BATCHES) return { ok: true, skipped: 'limit' };
  let m = raw ? JSON.parse(raw) : null;
  const cmds = [];

  if (!m) {
    const c = body.ctx && typeof body.ctx === 'object' ? body.ctx : null;
    if (!c) return { ok: true, skipped: 'no start' }; // a batch for a session we never saw start (e.g. expired)
    const utm = {};
    for (const f of ['source', 'medium', 'campaign', 'term', 'content']) if (c.utm && c.utm[f]) utm[f] = str(c.utm[f], 80);
    const refHost = hostOf(c.ref);
    const self = /(^|\.)letsexplorewilsonlake\.com$/.test(refHost);
    const uaInfo = parseUA(ua);
    m = {
      sid, vid, start: now, last: now, visit: num(c.visit, 9999) || 1,
      ref: self ? '' : str(c.ref, 300), refHost: self ? '' : refHost,
      source: sourceOf(self ? '' : refHost, utm), utm,
      landing: str(c.path, 300),
      country: str(headers['x-vercel-ip-country'], 2), region: str(headers['x-vercel-ip-country-region'], 8),
      city: str(decodeURIComponentSafe(headers['x-vercel-ip-city'] || ''), 60),
      ...uaInfo,
      device: c.touch && uaInfo.device === 'Desktop' && num(c.sw) <= 1366 ? 'Tablet' : uaInfo.device,
      screen: num(c.sw, 1e4) + '×' + num(c.sh, 1e4), viewport: num(c.vw, 1e4) + '×' + num(c.vh, 1e4), dpr: Number(c.dpr) > 0 ? Math.round(Number(c.dpr) * 100) / 100 : 1,
      lang: str(c.lang, 20), tz: str(c.tz, 40), conn: str(c.conn, 10), dark: !!c.dark, reduced: !!c.reduced,
      events: 0, clicks: 0, rage: 0, dead: 0, engagedMs: 0, maxScroll: 0, sections: {}, lastSection: '',
      gallery: { views: 0, photos: [], lightbox: 0 }, video: { plays: 0, maxPct: 0, ended: 0 },
      booking: 0, outbound: [], copies: 0, errors: 0,
    };
    cmds.push(['ZADD', 'lw:idx', now, sid], ['ZREMRANGEBYSCORE', 'lw:idx', '-inf', now - TTL * 1000]);
  }

  // merge running totals the client sends with every batch
  m.last = now;
  m.engagedMs = Math.max(m.engagedMs, num(body.eng, 864e5));
  m.maxScroll = Math.max(m.maxScroll, num(body.scroll, 100));
  if (body.sec && typeof body.sec === 'object') {
    for (const [id, ms] of Object.entries(body.sec).slice(0, 30)) {
      const key = str(id, 30); if (!/^[a-z0-9-]+$/i.test(key)) continue;
      const s = m.sections[key] || (m.sections[key] = { ms: 0, first: null });
      s.ms = Math.max(s.ms, num(ms, 864e5));
    }
  }
  for (const e of events) {
    m.events++;
    if (e.k === 'section' && e.s) { const s = m.sections[e.s] || (m.sections[e.s] = { ms: 0, first: null }); if (s.first == null) s.first = e.t; m.lastSection = e.s; }
    else if (e.k === 'click') { m.clicks++; if (e.href && /^https?:/.test(e.href) && !/letsexplorewilsonlake\.com/.test(e.href) && m.outbound.length < 30) m.outbound.push(str(e.label || e.href, 80)); }
    else if (e.k === 'rage') m.rage++;
    else if (e.k === 'dead') m.dead++;
    else if (e.k === 'gallery') { m.gallery.views++; if (e.a === 'open') m.gallery.lightbox++; if (e.cap && !m.gallery.photos.includes(e.cap) && m.gallery.photos.length < 40) m.gallery.photos.push(e.cap); }
    else if (e.k === 'video') { if (e.a === 'play') m.video.plays++; if (e.a === 'ended') m.video.ended++; if (e.p) m.video.maxPct = Math.max(m.video.maxPct, Math.min(100, e.p)); }
    else if (e.k === 'booking') m.booking++;
    else if (e.k === 'copy') m.copies++;
    else if (e.k === 'error') m.errors++;
  }
  cmds.push(['SET', mk, JSON.stringify(m), 'EX', TTL]);
  if (events.length) cmds.push(['RPUSH', ek, ...events.map(e => JSON.stringify(e))], ['LTRIM', ek, -MAX_EVENTS, -1], ['EXPIRE', ek, TTL]);
  await store.pipeline(cmds);
  return { ok: true };
}

function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

async function listSessions(store, { days = 30, limit = 1000 } = {}, now = Date.now()) {
  const min = now - Math.min(days, RETENTION_DAYS) * 864e5;
  const [ids] = await store.pipeline([['ZRANGE', 'lw:idx', '+inf', min, 'BYSCORE', 'REV', 'LIMIT', 0, Math.min(limit, 5000)]]);
  if (!ids || !ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const [vals] = await store.pipeline([['MGET', ...ids.slice(i, i + 200).map(id => 'lw:s:' + id)]]);
    for (const v of vals) if (v) out.push(JSON.parse(v));
  }
  return out;
}

async function getSession(store, sid) {
  if (!ID.test(String(sid))) return null;
  const [raw, ev] = await store.pipeline([['GET', 'lw:s:' + sid], ['LRANGE', 'lw:e:' + sid, 0, -1]]);
  if (!raw) return null;
  return { meta: JSON.parse(raw), events: (ev || []).map(x => JSON.parse(x)) };
}

module.exports = { ingest, listSessions, getSession, parseUA, sourceOf, RETENTION_DAYS };
