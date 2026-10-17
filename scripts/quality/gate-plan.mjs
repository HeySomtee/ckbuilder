import { git, repositoryFiles } from './repository.mjs';

const docs =
  /^(?:AGENTS\.md|README\.md|docs\/.*\.md|reports\/.*\.md|products\/streak\/(?:AGENTS\.md|README\.md|status\.md|docs\/.*\.md))$/;
const styles = /^products\/streak\/web\/src\/.*\.css$/;
const tooling = /^(?:scripts\/quality\/[^/]+\.mjs|\.githooks\/pre-(?:commit|push))$/;

export function planChecks(files) {
  const checks = new Set(['format', 'static']);
  if (!files.length) return ['all'];
  for (const file of files) {
    if (docs.test(file)) continue;
    if (styles.test(file)) checks.add('web');
    else if (tooling.test(file)) checks.add('tooling');
    else return ['all'];
  }
  return [...checks].sort();
}

export function changedPaths(cwd, hook, updates = '') {
  try {
    if (hook === 'pre-commit') {
      return git(['diff', '--cached', '--name-only', '--no-renames', '-z', 'HEAD'], cwd)
        .split('\0')
        .filter(Boolean);
    }
    const paths = new Set();
    for (const line of updates.trim().split(/\r?\n/).filter(Boolean)) {
      const [, local, , remote] = line.trim().split(/\s+/);
      if (/^0+$/.test(local)) continue;
      // A new ref or unavailable remote ancestry has no trustworthy small-change baseline.
      if (!remote || /^0+$/.test(remote)) return repositoryFiles(cwd);
      for (const path of git(['diff', '--name-only', '--no-renames', '-z', remote, local], cwd)
        .split('\0')
        .filter(Boolean))
        paths.add(path);
    }
    return [...paths].sort();
  } catch {
    return repositoryFiles(cwd);
  }
}

export function reusableReceipt(receipt, tree, checks, node, now = Date.now()) {
  if (
    !receipt ||
    receipt.version !== 1 ||
    receipt.status !== 'passed' ||
    receipt.tree !== tree ||
    receipt.node !== node ||
    !Array.isArray(receipt.checks)
  )
    return false;
  const finished = Date.parse(receipt.finishedAt);
  if (!Number.isFinite(finished) || finished > now || now - finished > 24 * 60 * 60 * 1000)
    return false;
  return receipt.checks.includes('all') || checks.every((check) => receipt.checks.includes(check));
}
