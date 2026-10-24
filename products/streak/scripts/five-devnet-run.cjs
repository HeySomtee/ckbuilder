require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict'),
  path = require('node:path'),
  { spawnSync } = require('node:child_process');
const database = new URL(process.env.PG_TEST_URL || '');
assert.ok(['127.0.0.1', 'localhost'].includes(database.hostname));
assert.match(database.pathname, /^\/[a-zA-Z0-9_]+_test$/);
const script = path.join(__dirname, 'five-devnet.py');
const mode = process.argv[2];
assert.ok(mode === undefined || mode === '--rehearsal' || mode === '--rehearsal-check');
const win = process.platform === 'win32';
const args = win
  ? [
      '--',
      'env',
      `PG_TEST_URL=${database.href}`,
      'python3',
      `/mnt/${script[0].toLowerCase()}${script.slice(2).replaceAll('\\', '/')}`,
      ...(mode ? [mode] : []),
    ]
  : [script, ...(mode ? [mode] : [])];
const result = spawnSync(win ? 'wsl.exe' : 'python3', args, {
  cwd: path.resolve(__dirname, '../../..'),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
  timeout: mode === '--rehearsal' ? 43200000 : 600000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
