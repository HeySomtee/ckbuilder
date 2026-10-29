const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname);
const allowed = new Set(['index.html', 'assets/wordmark.svg']);
http
  .createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    const relative = path.relative(root, file);
    if (
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !allowed.has(relative.split(path.sep).join('/')) ||
      !fs.existsSync(file)
    ) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': file.endsWith('.svg') ? 'image/svg+xml' : 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(4199, '127.0.0.1', () =>
    console.log('Loading signature preview: http://127.0.0.1:4199/'),
  );
