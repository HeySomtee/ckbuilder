import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  copyFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { changedPaths, planChecks, reusableReceipt } from './gate-plan.mjs';
import { ROOT, removeTemporaryDirectory } from './repository.mjs';

test('only explicit documentation, CSS and delivery tooling use focused checks', () => {
  assert.deepEqual(planChecks(['products/streak/docs/design/system.md']), ['format', 'static']);
  assert.deepEqual(
    planChecks(['products/streak/web/src/design-system/landing.css', 'products/streak/status.md']),
    ['format', 'static', 'web'],
  );
  assert.deepEqual(planChecks(['scripts/quality/hook.mjs', '.githooks/pre-push']), [
    'format',
    'static',
    'tooling',
  ]);
  assert.deepEqual(planChecks(['scripts/quality/hook.mjs', 'products/streak/web/src/app.css']), [
    'format',
    'static',
    'tooling',
    'web',
  ]);
  for (const file of [
    'products/streak/src/auth.ts',
    'products/streak/web/src/features/direct/ui.tsx',
    'products/streak/contracts/direct-v4/src/main.rs',
    'package-lock.json',
    'products/streak/scripts/direct-browser.cjs',
    'unknown.png',
    '.github/workflows/quality.yml',
  ]) {
    assert.deepEqual(planChecks(['products/streak/status.md', file]), ['all'], file);
  }
  assert.deepEqual(planChecks([]), ['all']);
});

test('receipt reuse requires successful exact contents, matching runtime, freshness and sufficient coverage', () => {
  const now = Date.parse('2026-10-17T19:00:00Z');
  const tree = 'a'.repeat(40);
  const node = process.versions.node;
  const receipt = {
    version: 1,
    status: 'passed',
    tree,
    node,
    checks: ['format', 'static', 'web'],
    finishedAt: new Date(now - 1000).toISOString(),
  };
  const accepts = (value, checks = ['format', 'static', 'web']) =>
    reusableReceipt(value, tree, checks, node, now);
  assert.equal(accepts(receipt), true);
  assert.equal(accepts(receipt, ['format', 'static']), true);
  assert.equal(accepts(receipt, ['all']), false);
  assert.equal(accepts(receipt, ['format', 'static', 'tooling']), false);
  assert.equal(accepts({ ...receipt, checks: ['all'] }, ['all']), true);
  for (const patch of [
    { tree: 'b'.repeat(40) },
    { node: 'other' },
    { status: 'failed' },
    { version: 2 },
    { finishedAt: 'invalid' },
    { finishedAt: new Date(now + 1).toISOString() },
    { finishedAt: new Date(now - 86400001).toISOString() },
    { checks: [] },
  ])
    assert.equal(accepts({ ...receipt, ...patch }), false);
  assert.equal(accepts(null), false);
});

test('push planning covers all unpushed commits and cannot hide risky paths with a rename', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'streak-gate-'));
  t.after(() => removeTemporaryDirectory(cwd, 'streak-gate-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Gate fixture');
  git('config', 'user.email', 'gate@example.invalid');
  mkdirSync(join(cwd, 'products/streak/src'), { recursive: true });
  mkdirSync(join(cwd, 'products/streak/docs'), { recursive: true });
  writeFileSync(join(cwd, 'products/streak/src/auth.ts'), 'original\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const remote = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'products/streak/src/auth.ts'), 'changed\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'identity');
  writeFileSync(join(cwd, 'products/streak/docs/note.md'), 'docs\n');
  git('add', '.');
  assert.deepEqual(planChecks(changedPaths(cwd, 'pre-commit')), ['format', 'static']);
  git('commit', '--quiet', '-m', 'docs');
  const tip = git('rev-parse', 'HEAD');
  assert.deepEqual(
    planChecks(changedPaths(cwd, 'pre-push', `refs/heads/main ${tip} refs/heads/main ${remote}`)),
    ['all'],
  );
  assert.deepEqual(
    planChecks(
      changedPaths(cwd, 'pre-push', `refs/heads/main ${tip} refs/heads/new ${'0'.repeat(40)}`),
    ),
    ['all'],
  );
  assert.deepEqual(
    planChecks(
      changedPaths(cwd, 'pre-push', `refs/heads/main ${tip} refs/heads/main ${'f'.repeat(40)}`),
    ),
    ['all'],
  );
  renameSync(join(cwd, 'products/streak/src/auth.ts'), join(cwd, 'products/streak/docs/auth.md'));
  git('add', '--all');
  assert.ok(changedPaths(cwd, 'pre-commit').includes('products/streak/src/auth.ts'));
  assert.deepEqual(planChecks(changedPaths(cwd, 'pre-commit')), ['all']);
});

test('real hook caches only successful checks, reuses them on push and rejects dirty or failed candidates', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'streak-hook-'));
  t.after(() => removeTemporaryDirectory(cwd, 'streak-hook-'));
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Hook fixture');
  git('config', 'user.email', 'hook@example.invalid');
  mkdirSync(join(cwd, 'scripts/quality'), { recursive: true });
  mkdirSync(join(cwd, 'node_modules/prettier/bin'), { recursive: true });
  for (const file of ['hook.mjs', 'gate-plan.mjs', 'repository.mjs'])
    copyFileSync(join(ROOT, 'scripts/quality', file), join(cwd, 'scripts/quality', file));
  writeFileSync(join(cwd, '.gitignore'), '.quality-artifacts/\nnode_modules/\nfailure.flag\n');
  writeFileSync(join(cwd, '.node-version'), `${process.versions.node}\n`);
  writeFileSync(join(cwd, 'README.md'), 'original\n');
  writeFileSync(
    join(cwd, 'scripts/quality/static.mjs'),
    "import { appendFileSync } from 'node:fs'; appendFileSync('.quality-artifacts/calls', 'static\\n');",
  );
  writeFileSync(
    join(cwd, 'node_modules/prettier/bin/prettier.cjs'),
    "const fs = require('node:fs'); fs.mkdirSync('.quality-artifacts', {recursive:true}); fs.appendFileSync('.quality-artifacts/calls', 'format\\n'); if (fs.existsSync('failure.flag')) process.exit(2);",
  );
  git('add', '.');
  git('commit', '--quiet', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'README.md'), 'updated\n');
  git('add', 'README.md');
  const run = (hook, input = '') =>
    spawnSync(process.execPath, ['scripts/quality/hook.mjs', hook], {
      cwd,
      encoding: 'utf8',
      input,
      windowsHide: true,
    });
  const first = run('pre-commit');
  assert.equal(first.status, 0, first.stderr);
  const calls = () => readFileSync(join(cwd, '.quality-artifacts/calls'), 'utf8');
  assert.equal(calls(), 'format\nstatic\n');
  const tree = git('write-tree');
  const receiptPath = join(cwd, '.quality-artifacts/hook-receipts', `${tree}.json`);
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).status, 'passed');
  git('commit', '--quiet', '-m', 'docs');
  const head = git('rev-parse', 'HEAD');
  const push = run('pre-push', `refs/heads/main ${head} refs/heads/main ${base}\n`);
  assert.equal(push.status, 0, push.stderr);
  assert.match(push.stdout, /reusing passed/);
  assert.equal(calls(), 'format\nstatic\n', 'push must not repeat successful checks');
  writeFileSync(receiptPath, '{broken');
  assert.equal(run('pre-push', `refs/heads/main ${head} refs/heads/main ${base}\n`).status, 0);
  assert.equal(calls(), 'format\nstatic\nformat\nstatic\n', 'a corrupt receipt must rerun checks');
  writeFileSync(join(cwd, 'README.md'), 'dirty\n');
  assert.notEqual(run('pre-push', `refs/heads/main ${head} refs/heads/main ${base}\n`).status, 0);
  git('add', 'README.md');
  writeFileSync(join(cwd, 'failure.flag'), 'fail');
  assert.notEqual(run('pre-commit').status, 0);
  assert.equal(
    existsSync(join(cwd, '.quality-artifacts/hook-receipts', `${git('write-tree')}.json`)),
    false,
    'failed checks cannot create a receipt',
  );
});
