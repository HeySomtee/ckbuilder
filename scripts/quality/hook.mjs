import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, assertCandidate, assertPushHeads, discoverTests, git } from './repository.mjs';
import { changedPaths, planChecks, reusableReceipt } from './gate-plan.mjs';

const hook = process.argv[2];
try {
  if (!['pre-commit', 'pre-push'].includes(hook))
    throw new Error('Expected pre-commit or pre-push.');
  const updates = hook === 'pre-push' ? readFileSync(0, 'utf8') : '';
  if (hook === 'pre-push' && !assertPushHeads(updates, git(['rev-parse', 'HEAD']).trim()))
    process.exit(0);
  if (process.versions.node !== readFileSync(resolve(ROOT, '.node-version'), 'utf8').trim())
    throw new Error('Use the repository-pinned Node version.');
  const before = assertCandidate(ROOT, { push: hook === 'pre-push' });
  const files = changedPaths(ROOT, hook, updates);
  const checks = planChecks(files);
  const receiptDirectory = resolve(ROOT, '.quality-artifacts/hook-receipts');
  const receiptPath = resolve(receiptDirectory, `${before}.json`);
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    /* A missing or corrupt receipt requires checks. */
  }
  if (reusableReceipt(receipt, before, checks, process.versions.node)) {
    if (assertCandidate(ROOT, { push: hook === 'pre-push' }) !== before)
      throw new Error('The candidate changed while checking its receipt.');
    console.log(
      `[quality] ${hook}: reusing passed ${receipt.checks.join(', ')} checks for exact tree ${before.slice(0, 12)}.`,
    );
    process.exit(0);
  }
  const env = { ...process.env, STREAK_SKIP_ENV_FILE: '1', NODE_ENV: 'test' };
  for (const name of Object.keys(env)) {
    if (
      name !== 'PG_TEST_URL' &&
      /(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|DATABASE_URL|SUPABASE|TELEGRAM|API_SPORTS|NOTIFY_PROVIDER)/i.test(
        name,
      )
    )
      delete env[name];
    if (name.startsWith('STREAK_DIRECT_')) delete env[name];
  }
  delete env.NODE_OPTIONS;
  delete env.STREAK_PUBLIC_ORIGIN;
  function run(label, args, cwd = ROOT, production = false) {
    console.log(`[quality] ${label}`);
    const result = spawnSync(process.execPath, args, {
      cwd,
      env: production ? { ...env, NODE_ENV: 'production' } : env,
      stdio: 'inherit',
      windowsHide: true,
    });
    if (result.error || result.status !== 0)
      throw new Error(`${label} failed. The Git operation has been stopped.`);
  }
  console.log(
    `[quality] ${hook}: selected ${checks.join(', ')} for ${files.length} changed paths.`,
  );
  if (checks.includes('all'))
    run('Complete quality gate', [resolve(ROOT, 'scripts/quality/verify.mjs'), 'all']);
  else {
    const formattable = files.filter(
      (file) => /\.(?:md|mjs|css)$/.test(file) && existsSync(resolve(ROOT, file)),
    );
    if (formattable.length)
      run('Changed-file formatting', [
        resolve(ROOT, 'node_modules/prettier/bin/prettier.cjs'),
        '--check',
        ...formattable,
      ]);
    run('Static documentation, source and secret policies', [
      resolve(ROOT, 'scripts/quality/static.mjs'),
    ]);
    if (checks.includes('web')) {
      run('Season strict TypeScript', [
        resolve(ROOT, 'node_modules/typescript/bin/tsc'),
        '-p',
        resolve(ROOT, 'products/streak/web/tsconfig.json'),
      ]);
      run(
        'Season production build',
        [
          resolve(ROOT, 'products/streak/node_modules/vite/bin/vite.js'),
          'build',
          '--config',
          'web/vite.config.mjs',
        ],
        resolve(ROOT, 'products/streak'),
        true,
      );
    }
    if (checks.includes('tooling')) {
      const tests = discoverTests(resolve(ROOT, 'scripts/quality'), ['.test.mjs']);
      if (!tests.length) throw new Error('Quality tooling tests are required.');
      run('Quality tooling regressions', ['--test', ...tests]);
    }
  }
  const after = assertCandidate(ROOT, { push: hook === 'pre-push' });
  if (before !== after)
    throw new Error('The candidate changed during verification. Run the Git operation again.');
  mkdirSync(receiptDirectory, { recursive: true });
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        version: 1,
        status: 'passed',
        tree: after,
        checks,
        node: process.versions.node,
        finishedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    `[quality] ${hook}: ${checks.join(', ')} passed for exact tree ${after.slice(0, 12)}.`,
  );
} catch (error) {
  console.error(`[quality] ${error.message}`);
  process.exitCode = 1;
}
