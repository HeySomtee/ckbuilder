/* Own a disposable local node. No public RPC or wallet key is used here. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../../..');
const script = path.join(__dirname, 'sponsored-devnet.py');
const env = { ...process.env, NODE_ENV: 'test', STREAK_SKIP_ENV_FILE: '1' };
for (const name of Object.keys(env)) {
  if (
    /(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|DATABASE_URL|SUPABASE|TELEGRAM|API_SPORTS|NOTIFY_PROVIDER)/i.test(
      name,
    )
  )
    delete env[name];
}
delete env.NODE_OPTIONS;
delete env.STREAK_PUBLIC_ORIGIN;
let command = 'python3',
  args = [script];
if (process.platform === 'win32') {
  if (!/^[A-Za-z]:\\/.test(script))
    throw Error('The local devnet requires a local Windows drive path.');
  command = 'wsl.exe';
  args = [
    '--',
    'python3',
    `/mnt/${script[0].toLowerCase()}${script.slice(2).replaceAll('\\', '/')}`,
  ];
}
const result = spawnSync(command, args, {
  cwd: root,
  env,
  stdio: 'inherit',
  windowsHide: true,
  timeout: 600_000,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
