// Runs the analytics flow against a real Postgres (local throwaway cluster).
// Needs PostgreSQL binaries (initdb/pg_ctl). Skips if they're missing.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const bin = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/opt/homebrew/bin', '/usr/local/bin'].find(d => fs.existsSync(path.join(d, 'initdb')));
if (!bin) { console.log('postgres test skipped (no initdb found)'); process.exit(0); }
const { Client } = require('pg');
const { postgresStore } = require('../lib/store.cjs');
const { ingest, listSessions, getSession } = require('../lib/analytics.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwpg-')), port = 54329;
const asPg = process.getuid && process.getuid() === 0 ? ['runuser', '-u', 'postgres', '--'] : [];
if (asPg.length) execFileSync('chown', ['postgres', dir]);
const run = (cmd, args) => execFileSync(asPg[0] || cmd, asPg.length ? [...asPg.slice(1), cmd, ...args] : args, { stdio: 'ignore' });
run(path.join(bin, 'initdb'), ['-D', dir, '-U', 'lw', '--auth=trust']);
run(path.join(bin, 'pg_ctl'), ['-D', dir, '-l', path.join(dir, 'server.log'), '-o', `-p ${port} -k ${dir} -c listen_addresses=''`, '-w', 'start']);
const stop = () => { try { run(path.join(bin, 'pg_ctl'), ['-D', dir, '-m', 'fast', 'stop']); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };

(async () => {
  const c = new Client({ host: dir, port, user: 'lw', database: 'postgres' }); await c.connect();
  const st = postgresStore(async (text, params) => (await c.query(text, params)).rows);
  const H = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'x-vercel-ip-city': 'Florence', 'x-vercel-ip-country': 'US' };
  const ctx = { ref: 'https://www.airbnb.com/rooms/1', path: '/', sw: 1440, sh: 900, vw: 1440, vh: 800, visit: 1 };
  const old = Date.now() - 100 * 864e5;
  await ingest(st, { sid: 'oldoldoldold', vid: 'vvvvvvvvvvvv', ctx, events: [{ k: 'view' }] }, H, old);
  await ingest(st, { sid: 'ssssssssssss', vid: 'vvvvvvvvvvvv', ctx, eng: 4000, scroll: 30, sec: { top: 4000 }, events: [{ k: 'view' }, { k: 'section', s: 'top', t: 5 }] }, H);
  await ingest(st, { sid: 'ssssssssssss', vid: 'vvvvvvvvvvvv', ctx, eng: 12000, scroll: 90, events: [{ k: 'click', label: "O'Brien's \"quote\" \\ test", s: 'dining', t: 9000 }, { k: 'booking', t: 9500 }] }, H);
  let list = await listSessions(st, { days: 30 });
  assert.strictEqual(list.length, 1, 'old visit outside 30 days');
  assert.strictEqual(list[0].source, 'Airbnb'); assert.strictEqual(list[0].browser, 'Safari'); assert.strictEqual(list[0].engagedMs, 12000);
  assert.strictEqual(list[0].booking, 1); assert.strictEqual(list[0].batches, 2);
  const s = await getSession(st, 'ssssssssssss');
  assert.deepStrictEqual(s.events.map(e => e.k), ['view', 'section', 'click', 'booking'], 'events kept in order');
  assert.strictEqual(s.events[2].label, "O'Brien's \"quote\" \\ test", 'quotes survive');
  assert.strictEqual(await getSession(st, 'nonexistent12'), null);
  await st.purge(Date.now() - 90 * 864e5);
  assert.strictEqual(await st.getMeta('oldoldoldold'), null, 'retention purge');
  assert.strictEqual((await c.query("SELECT count(*)::int n FROM lw_events WHERE sid = 'oldoldoldold'")).rows[0].n, 0, 'events cascade');
  await c.end(); stop();
  console.log('postgres tests passed');
})().catch(e => { console.error(e); stop(); process.exit(1); });
