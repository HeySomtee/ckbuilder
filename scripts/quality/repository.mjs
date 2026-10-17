import { execFileSync } from 'node:child_process';
import { readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function removeTemporaryDirectory(folder, prefix) {
  const target = realpathSync(folder);
  const parent = realpathSync(tmpdir());
  if (dirname(target) !== parent || !basename(target).startsWith(prefix)) {
    throw new Error('Refusing cleanup outside the owned temporary directory.');
  }
  rmSync(target, { recursive: true, force: true });
}

export function discoverTests(directory, suffixes) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...discoverTests(fullPath, suffixes));
    else if (entry.isFile() && suffixes.some((suffix) => entry.name.endsWith(suffix)))
      files.push(fullPath);
  }
  return files.sort();
}

export function git(args, cwd = ROOT) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error(`Git operation failed: ${args[0]}. Check repository state.`);
  }
}

export function repositoryFiles(cwd = ROOT) {
  return [
    ...new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd)
        .split('\0')
        .filter(Boolean),
    ),
  ].filter((file) => !file.startsWith('products/streak/products/'));
}

export function relevantUntracked(file) {
  // This pre-existing local nested checkout is outside Streak's project roots.
  if (file.startsWith('products/streak/products/')) return false;
  // Images, fonts and unknown extensions can affect tested behavior too.
  // Generated local outputs belong in .gitignore, not an extension allowlist.
  return true;
}

export function assertCandidate(cwd = ROOT, { push = false } = {}) {
  const unstaged = git(['diff', '--name-only', '-z'], cwd).split('\0').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], cwd)
    .split('\0')
    .filter(Boolean)
    .filter(relevantUntracked);
  const conflicts = git(['ls-files', '--unmerged', '-z'], cwd);
  if (conflicts) throw new Error('Resolve merge conflicts before running the commit gate.');
  if (unstaged.length || untracked.length) {
    throw new Error(
      `The gate must test the exact candidate. Stage or separately preserve these files before retrying:\n${[...unstaged, ...untracked].map((file) => `  ${file}`).join('\n')}`,
    );
  }
  if (push && git(['diff', '--cached', '--name-only', '-z'], cwd)) {
    throw new Error('Commit staged changes before pushing so the tested worktree matches HEAD.');
  }
  return git(['write-tree'], cwd).trim();
}

export function assertPushHeads(input, head) {
  const updates = input.trim().split(/\r?\n/).filter(Boolean);
  for (const update of updates) {
    const fields = update.trim().split(/\s+/);
    if (fields.length !== 4) throw new Error('Cannot interpret the pre-push ref update.');
    const localSha = fields[1];
    if (/^0+$/.test(localSha)) continue;
    if (localSha !== head) {
      throw new Error(
        'Push only the checked-out HEAD. Check out and verify other branch tips separately.',
      );
    }
  }
  return updates.some((line) => !/^0+$/.test(line.trim().split(/\s+/)[1]));
}
