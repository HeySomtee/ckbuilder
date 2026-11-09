const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = new Map([
  ['/', [path.join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/preview.css', [path.join(__dirname, 'preview.css'), 'text/css; charset=utf-8']],
  ['/preview.js', [path.join(__dirname, 'preview.js'), 'text/javascript; charset=utf-8']],
  ...['on-form-wordmark.svg', 'on-form-favicon.svg'].map((name) => [
    '/brand/' + name,
    [path.resolve(__dirname, '../../public/brand', name), 'image/svg+xml'],
  ]),
]);
http
  .createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    let pathname;
    try {
      pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch {
      return res.writeHead(400).end();
    }
    const file = files.get(pathname);
    if (!file) return res.writeHead(404).end();
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
  .listen(4205, '127.0.0.1', () =>
    console.log('Competition entry preview: http://127.0.0.1:4205/'),
  );
