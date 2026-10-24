import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ROOT, repositoryFiles } from './repository.mjs';

// Start with the new foundation. Expand this scope when the approved frontend
// and server modules arrive; do not reformat historical weekly exercises.
const files = repositoryFiles().filter((file) =>
  /^(?:AGENTS\.md|\.prettierrc\.json|package\.json|products\/streak\/(?:package\.json|eslint\.config\.mjs|web\/.*\.(?:tsx?|css|html|json|mjs)|src\/(?:modules\/(?:identity|predictions|direct|survivor|five)\/.*\.ts|infrastructure\/postgres-config\.ts|auth\.ts|(?:identity|predictions|survivor|five|direct(?:-[a-z-]+)?)\.test\.(?:ts|cjs))|scripts\/(?:(?:survivor|five)-[a-z-]+|season-browser|prediction-journey|prediction-motion|browser-readiness|direct-[a-z-]+)\.[cm]js|AGENTS\.md|status\.md|docs\/.*\.md)|scripts\/quality\/.*\.[cm]js|\.github\/(?:workflows\/.*\.ya?ml|pull_request_template\.md))$/.test(
    file,
  ),
);
if (!files.length) throw new Error('No foundation files found for formatting.');
const args = process.argv.slice(2);
if (args.some((arg) => !['--write', '--check'].includes(arg))) {
  throw new Error('Use --write or --check.');
}
const result = spawnSync(
  process.execPath,
  [
    resolve(ROOT, 'node_modules/prettier/bin/prettier.cjs'),
    args.includes('--write') ? '--write' : '--check',
    ...files,
  ],
  { cwd: ROOT, stdio: 'inherit', windowsHide: true },
);
if (result.error || result.status !== 0) process.exitCode = 1;
