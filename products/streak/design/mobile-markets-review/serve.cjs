const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const publicRoot = path.resolve(__dirname, '../../public');
const files = new Map([
  ['/', [path.join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/review.css', [path.join(__dirname, 'review.css'), 'text/css']],
  ['/review.js', [path.join(__dirname, 'review.js'), 'text/javascript']],
  ['/select-controls.css', [path.join(publicRoot, 'select-controls.css'), 'text/css']],
  ['/select-controls.js', [path.join(publicRoot, 'select-controls.js'), 'text/javascript']],
  ...['on-form-wordmark.svg', 'on-form-splash.svg', 'on-form-splash-final.svg'].map((name) => [
    '/brand/' + name,
    [path.join(publicRoot, 'brand', name), 'image/svg+xml'],
  ]),
]);
http
  .createServer((request, response) => {
    const file = files.get(new URL(request.url, 'http://localhost').pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': file[1],
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    fs.createReadStream(file[0]).pipe(response);
  })
  .listen(4197, '127.0.0.1', () => console.log('Mobile markets preview: http://127.0.0.1:4197/'));
