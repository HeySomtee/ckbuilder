import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, git } from './repository.mjs';

// Installation is explicit and local to this checkout; npm install never changes Git configuration.
let previous = '';
try {
  previous = git(['config', '--local', '--get', 'core.hooksPath']).trim();
} catch {}
if (previous && previous !== '.githooks') {
  throw new Error(
    'This checkout already has a custom core.hooksPath. Review and reconcile those hooks before installing .githooks.',
  );
}
for (const file of ['pre-commit', 'pre-push']) chmodSync(resolve(ROOT, '.githooks', file), 0o755);
git(['config', '--local', 'core.hooksPath', '.githooks']);
console.log(
  'Installed .githooks for this checkout. Commits and pushes now run the complete quality gate.',
);
console.log(
  'Git hooks can be bypassed. Require the Quality gate status in GitHub branch rules for server-side enforcement.',
);
