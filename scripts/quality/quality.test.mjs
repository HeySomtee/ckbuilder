import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ROOT,
  assertCandidate,
  assertPushHeads,
  discoverTests,
  removeTemporaryDirectory,
} from './repository.mjs';
import {
  anchors,
  browserFindings,
  documentationFailures,
  forbiddenPath,
  secretFindings,
} from './policies.mjs';

function fixture(t, prefix = 'streak-policy-') {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => removeTemporaryDirectory(folder, prefix));
  return folder;
}

test('new nested regression tests are discovered without editing a test allowlist', (t) => {
  const cwd = fixture(t);
  mkdirSync(join(cwd, 'feature'), { recursive: true });
  writeFileSync(join(cwd, 'feature/added.test.ts'), 'fixture');
  writeFileSync(join(cwd, 'feature/implementation.ts'), 'fixture');
  writeFileSync(join(cwd, 'runtime.test.mjs'), 'fixture');
  assert.deepEqual(discoverTests(cwd, ['.test.ts']), [join(cwd, 'feature/added.test.ts')]);
  assert.deepEqual(discoverTests(cwd, ['.test.mjs']), [join(cwd, 'runtime.test.mjs')]);
  assert.throws(() => removeTemporaryDirectory(cwd, 'incorrect-prefix-'), /Refusing cleanup/);
});

test('commit gate rejects unstaged edits and untracked source, and accepts the staged candidate', (t) => {
  const cwd = fixture(t);
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '--quiet');
  writeFileSync(join(cwd, 'app.js'), 'export const value = 1;\n');
  assert.throws(() => assertCandidate(cwd), /exact candidate/);
  git('add', 'app.js');
  const first = assertCandidate(cwd);
  writeFileSync(join(cwd, 'app.js'), 'export const value = 2;\n');
  assert.throws(() => assertCandidate(cwd), /exact candidate/);
  git('add', 'app.js');
  const second = assertCandidate(cwd);
  assert.notEqual(first, second, 'candidate changes cannot reuse verification');
  assert.throws(() => assertCandidate(cwd, { push: true }), /Commit staged changes/);
  mkdirSync(join(cwd, 'products/streak/products'), { recursive: true });
  writeFileSync(join(cwd, 'products/streak/products/local-only.js'), 'unrelated local scratch');
  assert.equal(assertCandidate(cwd), second, 'unrelated pre-existing nested checkout is preserved');
  writeFileSync(join(cwd, 'new-test.ts'), 'untracked test');
  assert.throws(() => assertCandidate(cwd), /new-test.ts/);
});

test('push gate refuses untested ref tips and malformed updates', () => {
  const head = 'a'.repeat(40),
    other = 'b'.repeat(40),
    zero = '0'.repeat(40);
  assert.equal(assertPushHeads(`refs/heads/task ${head} refs/heads/task ${other}\n`, head), true);
  assert.equal(assertPushHeads(`(delete) ${zero} refs/heads/task ${other}\n`, head), false);
  assert.throws(
    () => assertPushHeads(`refs/heads/other ${other} refs/heads/other ${zero}`, head),
    /checked-out HEAD/,
  );
  assert.throws(() => assertPushHeads('malformed', head), /interpret/);
});

test('security checks redact credential matches and reject private files', () => {
  const token = `gh${'p_'}${'q'.repeat(36)}`;
  assert.deepEqual(secretFindings(`const credential = '${token}';`), ['GitHub access token']);
  assert.equal(JSON.stringify(secretFindings(token)).includes(token), false);
  assert.ok(forbiddenPath('products/streak/.env.production'));
  assert.ok(forbiddenPath('src/week20/contract-lab/.secrets/owner.key'));
  assert.ok(forbiddenPath('products/streak/data/db.json'));
  assert.equal(forbiddenPath('.env.example'), undefined);
  assert.deepEqual(secretFindings('postgresql://test:local@127.0.0.1:5432/streak_test'), []);
  assert.deepEqual(
    secretFindings('postgresql://postgres:<password>@db.<project>.example/database'),
    [],
  );
  assert.ok(secretFindings('postgresql://' + 'example:placeholder@example.invalid/streak').length);
  assert.deepEqual(secretFindings('const publicTxHash = "0x' + 'a'.repeat(64) + '"'), []);
});

test('browser boundary detects direct server dependencies and privileged env', () => {
  assert.ok(browserFindings('import { read } from "../src/store";').length);
  assert.ok(browserFindings('const fs = require("node:fs");').length);
  assert.ok(browserFindings('const key = process.env.DATABASE_URL;').length);
  assert.deepEqual(
    browserFindings('import { format } from "./format.js"; fetch("/api/markets");'),
    [],
  );
});

test('documentation validates local headings, duplicate slugs, encoded paths and repository containment', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, 'guide.md'), '# Guide\n## Recovery\n## Recovery\n');
  writeFileSync(join(cwd, 'with space.md'), '# Hello\n');
  assert.deepEqual([...anchors('# Recovery\n# Recovery\n')], ['recovery', 'recovery-1']);
  assert.deepEqual(
    documentationFailures(
      cwd,
      'README.md',
      '[good](guide.md#recovery-1) [space](with%20space.md) [external](https://example.invalid)',
    ),
    [],
  );
  assert.match(
    documentationFailures(cwd, 'README.md', '[bad](guide.md#missing)')[0],
    /missing heading/,
  );
  assert.match(
    documentationFailures(cwd, 'README.md', '[bad](../outside.md)')[0],
    /leaves repository/,
  );
  assert.match(documentationFailures(cwd, 'README.md', '[bad](%xx)')[0], /invalid encoded/);
  assert.deepEqual(
    documentationFailures(cwd, 'README.md', '```md\n[example](missing.md)\n```'),
    [],
  );
});

test('quality runtime blocks inherited secrets, dotenv loading and external HTTP', (t) => {
  const cwd = fixture(t);
  writeFileSync(join(cwd, '.env'), 'QUALITY_DOTENV_MARKER=must-not-load\n');
  const script = `
    const assert = require('node:assert/strict');
    require(${JSON.stringify(resolve(ROOT, 'products/streak/node_modules/ts-node'))}).register({ project: ${JSON.stringify(resolve(ROOT, 'products/streak/tsconfig.json'))} });
    require(${JSON.stringify(resolve(ROOT, 'products/streak/src/env.ts'))});
    assert.equal(process.env.QUALITY_DOTENV_MARKER, undefined);
    assert.equal(process.env.API_SPORTS_KEY, undefined);
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.throws(() => fetch('https://example.invalid'), /external HTTP/);
    assert.throws(() => require('node:https').get('https://example.invalid'), /external HTTP/);
    console.log('isolated runtime passed');
  `;
  const result = spawnSync(
    process.execPath,
    ['--require', resolve(ROOT, 'scripts/quality/test-env.cjs'), '-e', script],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, API_SPORTS_KEY: 'sentinel-only', DATABASE_URL: 'sentinel-only' },
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, 'isolated runtime must reject environment and network leakage');
  assert.match(result.stdout, /isolated runtime passed/);
  assert.equal(`${result.stdout}${result.stderr}`.includes('sentinel-only'), false);
});

test('HTTP isolation checks merged options before dispatch and rejects alternate transports', (t) => {
  const cwd = fixture(t);
  const script = `
    const assert = require('node:assert/strict');
    const http = require('node:http'), https = require('node:https');
    const calls = [];
    for (const transport of [http, https]) for (const method of ['request', 'get']) {
      transport[method] = (...args) => { calls.push(args); return { end() {} }; };
    }
    let fetched;
    globalThis.fetch = (input, init) => { fetched = { input, init }; return Promise.resolve({ status: 302 }); };
    require(${JSON.stringify(resolve(ROOT, 'scripts/quality/test-env.cjs'))});
    for (const transport of [http, https]) for (const method of ['request', 'get']) {
      const protocol = transport === https ? 'https:' : 'http:';
      const url = protocol + '//127.0.0.1:12345/fixture';
      for (const name of ['host', 'hostname', 'servername']) {
        assert.throws(() => transport[method](url, { [name]: 'example.invalid' }), /external HTTP/);
        assert.throws(() => transport[method]({ [name]: 'example.invalid' }), /external HTTP/);
      }
      for (const options of [{ socketPath: '/unused-test-socket' }, { lookup() {} },
        { createConnection() {} }, { agent: {} }, { _defaultAgent: {} }]) {
        assert.throws(() => transport[method](url, options), /forbid custom HTTP/);
      }
    }
    assert.equal(calls.length, 0, 'Rejected endpoints must never reach the native transport.');
    const callback = () => {};
    http.request(new URL('http://127.0.0.1:12345/fixture?one=1'),
      { method: 'POST', headers: { 'x-test': 'fixture' }, agent: false }, callback);
    assert.equal(calls[0][0].hostname, '127.0.0.1');
    assert.equal(calls[0][0].port, 12345);
    assert.equal(calls[0][0].path, '/fixture?one=1');
    assert.equal(calls[0][0].method, 'POST');
    assert.equal(calls[0][1], callback);
    https.get('https://[::1]:12345/fixture', callback);
    assert.equal(calls[1][0].hostname, '::1');
    assert.equal(calls[1][1], callback);
    fetch(new Request('http://127.0.0.1/fixture', { redirect: 'follow' }), { redirect: 'follow' });
    assert.equal(fetched.init.redirect, 'manual', 'Both Request and init redirect settings must be overridden.');
    assert.throws(() => fetch('http://127.0.0.1/fixture', { dispatcher: {} }), /forbid custom fetch/);
    assert.throws(() => fetch('https://example.invalid'), /external HTTP/);
    console.log('HTTP dispatch isolation passed without network');
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `Request option isolation failed: ${result.stderr}`);
  assert.match(result.stdout, /HTTP dispatch isolation passed without network/);
});

test('native fetch exposes redirects without following them and normal loopback HTTP still works', (t) => {
  const cwd = fixture(t);
  const script = `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    require(${JSON.stringify(resolve(ROOT, 'scripts/quality/test-env.cjs'))});
    async function main() {
      const visits = [];
      const server = http.createServer((req, res) => {
        visits.push(req.url);
        if (req.url === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end(); return; }
        res.end(req.method + ' fixture');
      });
      await new Promise((done) => server.listen(0, '127.0.0.1', done));
      const base = 'http://127.0.0.1:' + server.address().port;
      try {
        for (const input of [base + '/redirect', new Request(base + '/redirect', { redirect: 'follow' })]) {
          const response = await fetch(input, { redirect: 'follow' });
          assert.equal(response.status, 302);
          assert.equal(response.headers.get('location'), '/target');
          await response.text();
        }
        assert.deepEqual(visits, ['/redirect', '/redirect'], 'A redirect destination must never be requested implicitly.');
        const body = await new Promise((resolve, reject) => {
          const request = http.request(base, { path: '/direct', method: 'POST' }, (response) => {
            let data = ''; response.setEncoding('utf8');
            response.on('data', chunk => data += chunk);
            response.on('end', () => resolve(data));
          });
          request.on('error', reject); request.end();
        });
        assert.equal(body, 'POST fixture');
        assert.deepEqual(visits, ['/redirect', '/redirect', '/direct']);
        console.log('Native loopback and manual redirect passed');
      } finally {
        await new Promise(done => { server.close(done); server.closeAllConnections(); });
      }
    }
    main().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `Native loopback isolation failed: ${result.stderr}`);
  assert.match(result.stdout, /Native loopback and manual redirect passed/);
});
