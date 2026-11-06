const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicRoot = path.resolve(__dirname, '../../public');
const files = new Map([
  ['/', [path.join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ...['review.css', 'app.mjs'].map((name) => [
    '/' + name,
    [path.join(__dirname, name), name.endsWith('css') ? 'text/css' : 'text/javascript'],
  ]),
  ...['select-controls.css', 'select-controls.js'].map((name) => [
    '/' + name,
    [path.join(publicRoot, name), name.endsWith('css') ? 'text/css' : 'text/javascript'],
  ]),
  ...['on-form-wordmark.svg', 'on-form-favicon.svg'].map((name) => [
    '/brand/' + name,
    [path.join(publicRoot, 'brand', name), 'image/svg+xml'],
  ]),
]);
http
  .createServer((req, res) => {
    const file = files.get(new URL(req.url, 'http://localhost').pathname);
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    if (!file || !fs.existsSync(file[0])) return res.writeHead(404).end();
    res.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file[0]).pipe(res);
  })
  .listen(4199, '127.0.0.1', () => console.log('Five standings preview: http://127.0.0.1:4199/'));
