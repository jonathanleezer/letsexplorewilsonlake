// POST /api/t — event batches from /track.js (sent with navigator.sendBeacon or fetch keepalive).
'use strict';
const { ingest } = require('../lib/analytics.cjs');
const { defaultStore } = require('../lib/store.cjs');

function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return Promise.resolve(parse(String(req.body)));
  return new Promise(resolve => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 65536) { req.destroy(); resolve(null); } });
    req.on('end', () => resolve(parse(s)));
    req.on('error', () => resolve(null));
  });
}
function parse(s) { if (s.length > 65536) return null; try { return JSON.parse(s); } catch { return null; } }

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  const store = module.exports.store || defaultStore();
  if (!store) { res.statusCode = 204; return res.end(); } // storage not connected yet: accept silently
  try {
    const r = await ingest(store, await readBody(req), req.headers);
    res.statusCode = r.ok ? 204 : r.status || 400;
  } catch (e) {
    console.error('track', e.message);
    res.statusCode = 500;
  }
  res.end();
};
