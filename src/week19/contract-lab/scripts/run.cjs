const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname,'..');
const action = process.argv[2];
const tasks = {
  test: [['bash','test.sh']],
  devnet: [['python3','prepare-devnet.py'],['python3','devnet.py']],
};
if (!tasks[action]) throw new Error('Expected test or devnet');
for (const [interpreter,file] of tasks[action]) {
  const target = path.join(ROOT,'scripts',file);
  let command = interpreter;
  let args = [target];
  if (process.platform === 'win32') {
    if (!/^[A-Za-z]:\\/.test(target)) throw new Error('WSL runner requires a local Windows drive path');
    const linux = `/mnt/${target[0].toLowerCase()}${target.slice(2).replaceAll('\\','/')}`;
    command = 'wsl.exe';
    args = ['--',interpreter,linux];
  }
  const result = spawnSync(command,args,{stdio:'inherit',cwd:ROOT});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
