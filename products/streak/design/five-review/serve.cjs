const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']],
  ['/app.mjs', ['app.mjs', 'text/javascript']],
  ['/rules.mjs', ['rules.mjs', 'text/javascript']],
  ['/mark.svg', ['../season-preview/mark.svg', 'image/svg+xml']],
  ['/ckb-mark.png', ['../../public/ckb-mark.png', 'image/png']],
  ['/players.json', ['../../../../.quality-artifacts/five-preview-fpl.json', 'application/json']],
]);
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
  const entry = files.get(new URL(req.url, 'http://localhost').pathname);
  if (!entry) return res.writeHead(404).end();
  try {
    const body = await fs.readFile(path.resolve(__dirname, entry[0]));
    res.writeHead(200, {
      'Content-Type': `${entry[1]}; charset=utf-8`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(503).end('Private preview snapshot unavailable.');
  }
});
server.listen(4195, '127.0.0.1', () => console.log('Streak Five preview: http://127.0.0.1:4195/'));
server.on('error', (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
