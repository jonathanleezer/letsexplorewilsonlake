'use strict';
const assert = require('assert');
const { memoryStore } = require('../lib/store.cjs');
const { ingest, listSessions, getSession, parseUA, sourceOf } = require('../lib/analytics.cjs');
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
(async () => {
  const st = memoryStore(); const H = { 'user-agent': UA, 'x-vercel-ip-city': 'Muscle%20Shoals', 'x-vercel-ip-country': 'US' };
  const ctx = { ref: 'https://www.google.com/', path: '/?utm_source=fb', utm: { source: 'facebook', campaign: 'winter' }, sw: 390, sh: 844, vw: 390, vh: 700, touch: true, visit: 2 };
  assert.deepStrictEqual(await ingest(st, { sid: 'bad', vid: 'x' }, H), { ok: false, status: 400, error: 'bad id' });
  assert.strictEqual((await ingest(st, { sid: 'aaaaaaaaaaaa', vid: 'bbbbbbbbbbbb', ctx }, { 'user-agent': 'Googlebot/2.1' })).skipped, 'bot');
  assert.strictEqual((await ingest(st, { sid: 'cccccccccccc', vid: 'bbbbbbbbbbbb', events: [] }, H)).skipped, 'no start');
  await ingest(st, { sid: 'aaaaaaaaaaaa', vid: 'bbbbbbbbbbbb', ctx, eng: 5000, scroll: 40, sec: { top: 3000 },
    events: [{ k: 'view' }, { k: 'section', s: 'top', t: 10 }, { k: 'click', label: '<img src=x onerror=alert(1)>', href: 'https://www.odettealabama.com/', s: 'dining' }, { k: 'BAD KIND' }, { k: 'booking' }, { k: 'gallery', a: 'next', cap: 'Porch swing' }] }, H);
  await ingest(st, { sid: 'aaaaaaaaaaaa', vid: 'bbbbbbbbbbbb', ctx, eng: 9000, scroll: 80, sec: { top: 3000, gallery: 4000 }, events: [{ k: 'video', a: 'play', p: 0 }, { k: 'video', a: 'progress', p: 50 }] }, H);
  const list = await listSessions(st, { days: 30 });
  assert.strictEqual(list.length, 1);
  const m = list[0];
  assert.strictEqual(m.source, 'facebook'); assert.strictEqual(m.city, 'Muscle Shoals'); assert.strictEqual(m.device, 'Mobile'); assert.strictEqual(m.os, 'iOS');
  assert.strictEqual(m.engagedMs, 9000); assert.strictEqual(m.maxScroll, 80); assert.strictEqual(m.sections.gallery.ms, 4000); assert.strictEqual(m.sections.top.first, 10);
  assert.strictEqual(m.booking, 1); assert.strictEqual(m.video.maxPct, 50); assert.deepStrictEqual(m.gallery.photos, ['Porch swing']);
  assert.ok(!('ip' in m));
  const s = await getSession(st, 'aaaaaaaaaaaa');
  assert.strictEqual(s.events.length, 7, 'bad kind dropped');
  assert.strictEqual(s.events[2].label, '<img src=x onerror=alert(1)>'); // stored as text; the dashboard renders text only
  assert.deepStrictEqual(parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'), { browser: 'Edge', os: 'Windows', device: 'Desktop' });
  assert.strictEqual(sourceOf('l.facebook.com', {}), 'Facebook'); assert.strictEqual(sourceOf('', {}), 'Direct'); assert.strictEqual(sourceOf('www.airbnb.com', {}), 'Airbnb');
  // admin endpoint auth
  const admin = require('../api/admin.js'); admin.store = st;
  const call = (auth, url = '/api/admin?days=30') => new Promise(r => { const res = { statusCode: 0, h: {}, setHeader(k, v) { this.h[k] = v; }, end(b) { r({ code: this.statusCode, body: b }); } }; admin({ method: 'GET', url, headers: { authorization: auth } }, res); });
  delete process.env.ADMIN_KEY; assert.strictEqual((await call('Bearer x')).code, 403);
  process.env.ADMIN_KEY = 'correct-horse-battery-staple'; assert.strictEqual((await call('Bearer wrong')).code, 403);
  const ok = await call('Bearer correct-horse-battery-staple'); assert.strictEqual(ok.code, 200); assert.strictEqual(JSON.parse(ok.body).sessions.length, 1);
  console.log('analytics tests passed');
})().catch(e => { console.error(e); process.exit(1); });
