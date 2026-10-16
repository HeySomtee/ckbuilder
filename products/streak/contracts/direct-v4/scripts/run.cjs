/* Offline local VM gate. This runner never loads wallets or public RPC. */
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const action = process.argv[2];
if (!['build', 'test', 'format'].includes(action)) throw Error('Expected build, test or format');
const env = { ...process.env, NODE_ENV: 'test', STREAK_SKIP_ENV_FILE: '1' };
for (const name of Object.keys(env)) {
  if (
    /(?:SECRET|TOKEN|PRIVATE_KEY|API_KEY|PASSWORD|DATABASE_URL|SUPABASE|TELEGRAM|API_SPORTS)/i.test(
      name,
    )
  )
    delete env[name];
}
delete env.NODE_OPTIONS;
const target = path.join(root, 'scripts', action === 'format' ? 'format.sh' : `${action}.sh`);
let command = 'bash',
  args = [target];
if (process.platform === 'win32') {
  if (!/^[A-Za-z]:\\/.test(target)) throw Error('WSL runner requires a local Windows drive path');
  command = 'wsl.exe';
  args = ['--', 'bash', `/mnt/${target[0].toLowerCase()}${target.slice(2).replaceAll('\\', '/')}`];
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
if (result.status === 0 && action !== 'format') {
  const { hashCkb } = require('@ckb-ccc/core');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8'));
  for (const contract of [manifest.protocol, manifest.guard]) {
    const bytes = fs.readFileSync(
      path.join(root, 'target', manifest.target, 'release', contract.binary),
    );
    const hash = hashCkb(bytes);
    if (hash !== contract.codeHash || bytes.length !== contract.sizeBytes)
      throw Error(`Pinned ${contract.binary} build does not match its reviewed manifest.`);
    console.log(`${contract.binary}: ${bytes.length} bytes, ${hash}`);
  }
}
