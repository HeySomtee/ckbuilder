import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, assertCandidate, assertPushHeads, git } from './repository.mjs';

const hook = process.argv[2];
try {
  if (!['pre-commit', 'pre-push'].includes(hook))
    throw new Error('Expected pre-commit or pre-push.');
  if (
    hook === 'pre-push' &&
    !assertPushHeads(readFileSync(0, 'utf8'), git(['rev-parse', 'HEAD']).trim())
  )
    process.exit(0);
  const before = assertCandidate(ROOT, { push: hook === 'pre-push' });
  const result = spawnSync(process.execPath, [resolve(ROOT, 'scripts/quality/verify.mjs'), 'all'], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error('Full quality checks failed. The Git operation has been stopped.');
  const after = assertCandidate(ROOT, { push: hook === 'pre-push' });
  if (before !== after)
    throw new Error('The candidate changed during verification. Run the Git operation again.');
  console.log(`[quality] ${hook}: tested candidate ${after.slice(0, 12)} passed.`);
} catch (error) {
  console.error(`[quality] ${error.message}`);
  process.exitCode = 1;
}
