const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const fixed = new Set(['index.html', 'styles.css', 'app.mjs']);
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
    const reference = file === 'fixtures.json' || /^assets\/team-\d+\.png$/.test(file);
    if (!fixed.has(file) && !reference) {
      res.writeHead(404).end();
      return;
    }
    try {
      const bytes = await fs.readFile(
        path.join(reference ? path.join(__dirname, '../account-slip-review') : __dirname, file),
      );
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(4187, '127.0.0.1', () =>
    console.log('Streak slip workspace preview: http://127.0.0.1:4187/'),
  )
  .on('error', (error) => {
    console.error(error.code);
    process.exitCode = 1;
  });
