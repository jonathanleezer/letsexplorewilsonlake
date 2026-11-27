// GET /api/admin?sessions&days=30  |  /api/admin?session=<id>
// Requires header  Authorization: Bearer <ADMIN_KEY>  (set ADMIN_KEY, 16+ characters, in Vercel).
'use strict';
const crypto = require('crypto');
const { listSessions, getSession, RETENTION_DAYS } = require('../lib/analytics.cjs');
const { defaultStore } = require('../lib/store.cjs');

function authorized(req) {
  const key = (process.env.ADMIN_KEY || '').trim();
  if (key.length < 16) return false;
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(got).digest(), b = crypto.createHash('sha256').update(key).digest();
  return crypto.timingSafeEqual(a, b);
}
function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  if (!authorized(req)) return send(res, 403, { error: 'forbidden', message: (process.env.ADMIN_KEY || '').trim().length < 16 ? 'ADMIN_KEY is not set in Vercel (16+ characters).' : 'Wrong key.' });
  const store = module.exports.store || defaultStore();
  if (!store) return send(res, 503, { error: 'storage', message: 'Connect a Neon Postgres database to this Vercel project (Storage tab), then redeploy.' });
  const q = new URL(req.url, 'http://x').searchParams;
  try {
    if (q.has('session')) {
      const s = await getSession(store, q.get('session'));
      return s ? send(res, 200, s) : send(res, 404, { error: 'not found' });
    }
    const days = Math.max(1, Math.min(RETENTION_DAYS, Number(q.get('days')) || 30));
    return send(res, 200, { days, retentionDays: RETENTION_DAYS, sessions: await listSessions(store, { days }) });
  } catch (e) {
    console.error('admin', e.message);
    return send(res, 500, { error: 'server' });
  }
};
