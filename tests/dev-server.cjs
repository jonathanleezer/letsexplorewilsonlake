// Local stand-in for Vercel: static files (cleanUrls) + /api/* with in-memory storage.
// node tests/dev-server.cjs [port]   (ADMIN_KEY defaults to "local-admin-key-123")
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { memoryStore } = require('../lib/store.cjs');
process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'local-admin-key-123';
const root = path.join(__dirname, '..');
const store = memoryStore();
const handlers = { '/api/t': require('../api/t.js'), '/api/admin': require('../api/admin.js') };
for (const h of Object.values(handlers)) h.store = store;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.txt': 'text/plain', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (handlers[p]) {
    req.headers['x-vercel-ip-country'] = 'US'; req.headers['x-vercel-ip-country-region'] = 'AL'; req.headers['x-vercel-ip-city'] = 'Florence';
    return handlers[p](req, res);
  }
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.statusCode = 403; return res.end(); }
  const tryFiles = [f, f + '.html', path.join(f, 'index.html')];
  const hit = tryFiles.find(x => fs.existsSync(x) && fs.statSync(x).isFile());
  if (!hit) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[path.extname(hit)] || 'application/octet-stream');
  fs.createReadStream(hit).pipe(res);
});
server.listen(Number(process.argv[2]) || 8766, '127.0.0.1', () => console.log('dev server on', server.address().port));
