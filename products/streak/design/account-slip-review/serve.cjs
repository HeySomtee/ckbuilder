const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const port = Number(process.env.STREAK_ACCOUNT_PREVIEW_PORT || 4186);
const fixed = new Set(['index.html', 'styles.css', 'app.mjs', 'fixtures.json']);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
};
http
  .createServer(async (req, res) => {
    let file;
    try {
      file =
        decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405).end();
      return;
    }
    if (!fixed.has(file) && !/^assets\/team-\d+\.png$/.test(file)) {
      res.writeHead(404).end();
      return;
    }
    try {
      const data = await fs.readFile(path.join(__dirname, file));
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Streak UI review: http://127.0.0.1:${port}/`))
  .on('error', () => {
    console.error('Preview server could not start');
    process.exitCode = 1;
  });
