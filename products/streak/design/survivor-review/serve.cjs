const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixed = new Set(['index.html', 'styles.css', 'app.mjs']);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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
    const asset = /^assets\/team-\d+\.png$/.test(file);
    const mark = file === 'mark.svg';
    if (!fixed.has(file) && !asset && !mark) {
      res.writeHead(404).end();
      return;
    }
    try {
      const root = asset
        ? path.join(__dirname, '../account-slip-review')
        : mark
          ? path.join(__dirname, '../season-preview')
          : __dirname;
      const bytes = await fs.readFile(path.join(root, file));
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(4192, '127.0.0.1', () => console.log('Streak Survivor preview: http://127.0.0.1:4192/'))
  .on('error', (error) => {
    console.error(error.code);
    process.exitCode = 1;
  });
