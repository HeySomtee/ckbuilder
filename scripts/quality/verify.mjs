import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ROOT, discoverTests, removeTemporaryDirectory } from './repository.mjs';

const group = process.argv[2] || 'all';
const groups = ['static', 'unit', 'postgres', 'browser', 'contracts'];
if (!['all', ...groups].includes(group)) throw new Error(`Expected all or ${groups.join(', ')}.`);
const product = resolve(ROOT, 'products/streak');
const artifacts = resolve(ROOT, '.quality-artifacts');
const temp = mkdtempSync(join(tmpdir(), 'streak-quality-'));
const env = {
  ...process.env,
  STREAK_SKIP_ENV_FILE: '1',
  NODE_ENV: 'test',
  STREAK_DB_FILE: join(temp, 'db.json'),
  STREAK_DATA_DIR: temp,
  MATCH_PROVIDER: 'worldcup',
  STREAK_SCREENSHOTS: join(artifacts, 'browser'),
  STREAK_PREVIEW_EVIDENCE_DIR: join(artifacts, 'preview'),
};
for (const name of Object.keys(env)) {
  if (
    /(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|DATABASE_URL|SUPABASE|TELEGRAM|API_SPORTS|NOTIFY_PROVIDER)/i.test(
      name,
    ) &&
    name !== 'PG_TEST_URL'
  )
    delete env[name];
}
delete env.NODE_OPTIONS;
delete env.STREAK_PUBLIC_ORIGIN;
// A test entrypoint can import the server; loading local .env is never allowed.
const preload = resolve(ROOT, 'scripts/quality/test-env.cjs');
const tsc = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const tsnode = resolve(product, 'node_modules/ts-node/dist/bin.js');
const report = {
  group,
  node: process.versions.node,
  startedAt: new Date().toISOString(),
  status: 'running',
  checks: [],
};
mkdirSync(artifacts, { recursive: true });

function run(
  label,
  args,
  { cwd = ROOT, isolated = false, timeout = 600_000, production = false } = {},
) {
  console.log(`\n[quality] ${label}`);
  const started = Date.now();
  const result = spawnSync(
    process.execPath,
    [...(isolated ? ['--require', preload] : []), ...args],
    {
      cwd,
      env: production ? { ...env, NODE_ENV: 'production' } : env,
      stdio: 'inherit',
      timeout,
      windowsHide: true,
    },
  );
  report.checks.push({
    label,
    status: result.status === 0 && !result.error ? 'passed' : 'failed',
    durationMs: Date.now() - started,
  });
  if (result.error || result.status !== 0) {
    // Error output is intentionally restricted to step names and exit status.
    throw new Error(
      `${label} failed${result.error?.code ? ` (${result.error.code})` : ` (exit ${result.status ?? 'signal'})`}. No subsequent group was treated as passed.`,
    );
  }
}

function buildProduct() {
  run(
    'Season TypeScript and hook lint',
    [join(product, 'node_modules/eslint/bin/eslint.js'), 'web/src', '--max-warnings=0'],
    { cwd: product },
  );
  run('Streak TypeScript build', [tsc, '-p', join(product, 'tsconfig.json')]);
  run('Season strict TypeScript', [tsc, '-p', join(product, 'web/tsconfig.json')]);
  run(
    'Season production build',
    [
      join(product, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      join(product, 'web/vite.config.mjs'),
    ],
    { production: true },
  );
}

async function browserChecks() {
  buildProduct();
  run('Current Streak browser regression', [join(product, 'scripts/browser-smoke.cjs')], {
    cwd: product,
    isolated: true,
  });
  run('Integrated Season browser regression', [join(product, 'scripts/season-browser.cjs')], {
    cwd: product,
    isolated: true,
  });
  const previewPort = 4176;
  const base = `http://127.0.0.1:${previewPort}`;
  const server = spawn(process.execPath, [join(product, 'design/season-preview/serve.cjs')], {
    cwd: ROOT,
    env: { ...env, STREAK_PREVIEW_PORT: String(previewPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let failed = false,
    listening = false;
  server.on('error', () => {
    failed = true;
  });
  server.on('exit', () => {
    failed = true;
  });
  // Only our child's readiness message qualifies. An existing process cannot
  // make a failed bind look like a successful preview startup.
  server.stdout.on('data', (chunk) => {
    if (chunk.toString().includes(base)) listening = true;
  });
  server.stderr.on('data', () => {});
  try {
    for (let attempt = 0; attempt < 100 && !listening && !failed; attempt++) await delay(100);
    if (!listening || failed)
      throw new Error(
        'Preview server failed to start on loopback port 4176. Stop the conflicting process and retry.',
      );
    env.STREAK_PREVIEW_URL = base;
    run(
      'Approved preview interaction regression',
      [join(product, 'design/season-preview/verify.cjs')],
      { isolated: true },
    );
    run(
      'Independent multi-pick browser regression',
      [join(product, 'design/season-preview/batch-verify.cjs')],
      { isolated: true },
    );
  } finally {
    server.kill();
    await Promise.race([new Promise((done) => server.once('exit', done)), delay(3000)]);
  }
  console.log(
    '[quality] Preview motion frame-timing research is not a mandatory suite. Its known WebKit limitations remain a release prerequisite in docs.',
  );
}

try {
  const version = readFileSync(resolve(ROOT, '.node-version'), 'utf8').trim();
  if (process.versions.node !== version) throw new Error(`Use Node ${version} from .node-version.`);
  for (const selected of group === 'all' ? groups : [group]) {
    if (selected === 'static') {
      run('Foundation formatting', [resolve(ROOT, 'scripts/quality/format.mjs'), '--check']);
      run('Static documentation, source and secret policies', [
        resolve(ROOT, 'scripts/quality/static.mjs'),
      ]);
      run('Learning repository TypeScript build', [tsc, '-p', resolve(ROOT, 'tsconfig.json')]);
      buildProduct();
    } else if (selected === 'unit') {
      const tooling = discoverTests(resolve(ROOT, 'scripts/quality'), ['.test.mjs']);
      if (!tooling.length) throw new Error('Quality tooling tests are required.');
      run('Quality gate regression tests', ['--test', ...tooling], { isolated: true });
      const tsTests = discoverTests(join(product, 'src'), ['.test.ts']).filter(
        (file) => file !== join(product, 'src/store_pg.test.ts'),
      );
      if (!tsTests.length) throw new Error('Application TypeScript regression tests are required.');
      for (const test of tsTests) {
        run(`Streak ${relative(product, test)} regression`, [tsnode, test], {
          cwd: product,
          isolated: true,
        });
      }
      const nodeTests = [
        ...discoverTests(join(product, 'src'), ['.test.mjs', '.test.cjs']),
        ...discoverTests(join(product, 'web'), ['.test.mjs']),
      ];
      if (!nodeTests.length) throw new Error('Application Node regression tests are required.');
      run('Streak client runtime regression', ['--test', ...nodeTests], {
        cwd: product,
        isolated: true,
      });
    } else if (selected === 'postgres') {
      if (!env.PG_TEST_URL)
        throw new Error(
          'PG_TEST_URL is required. Use an isolated loopback database ending in _test. This gate never skips PostgreSQL.',
        );
      run('Isolated PostgreSQL store regression', [tsnode, 'src/store_pg.test.ts'], {
        cwd: product,
        isolated: true,
      });
    } else if (selected === 'browser') {
      await browserChecks();
    } else if (selected === 'contracts') {
      run(
        'Week 20 Rust VM and format regression',
        [resolve(ROOT, 'src/week20/contract-lab/scripts/run.cjs'), 'test'],
        { timeout: 1_200_000 },
      );
      run(
        'Week 20 exact accounting regression',
        ['--test', resolve(ROOT, 'src/week20/contract-lab/scripts/accounting.test.cjs')],
        { isolated: true },
      );
      run(
        'Week 20 client transaction regression',
        ['--test', resolve(ROOT, 'src/week20/contract-lab/scripts/client.test.cjs')],
        { isolated: true },
      );
    }
  }
  report.status = 'passed';
  console.log(
    `\n[quality] ${group} passed. No live-chain settlement, production capacity or absence of all bugs is implied.`,
  );
} catch (error) {
  report.status = 'failed';
  report.failure = error.message;
  console.error(`\n[quality] ${error.message}`);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(artifacts, `${group}.json`), `${JSON.stringify(report, null, 2)}\n`);
  removeTemporaryDirectory(temp, 'streak-quality-');
}
