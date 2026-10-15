import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, repositoryFiles } from './repository.mjs';
import {
  browserFindings,
  documentationFailures,
  forbiddenPath,
  secretFindings,
} from './policies.mjs';

const failures = [];
const files = repositoryFiles();
let docs = 0,
  browser = 0,
  syntax = 0,
  scanned = 0;
const nodeVersion = readFileSync(resolve(ROOT, '.node-version'), 'utf8').trim();
if (!process.versions.node.startsWith(`${nodeVersion}.`) && process.versions.node !== nodeVersion) {
  failures.push(`Use Node ${nodeVersion}, as pinned in .node-version.`);
}

for (const file of files) {
  const reason = forbiddenPath(file);
  if (reason) failures.push(`${file}: ${reason}`);
  const path = resolve(ROOT, file);
  if (
    !existsSync(path) ||
    !/\.(?:[cm]?[jt]sx?|css|html|mdx?|json|ya?ml|toml|rs|sh|py|sql|txt)$/.test(file)
  )
    continue;
  const content = readFileSync(path, 'utf8');
  scanned++;
  // Only paths and rule names are reported, never matching credential values.
  for (const issue of secretFindings(content)) failures.push(`${file}: ${issue} (value redacted)`);
  if (
    /^(?:docs\/.*\.md|AGENTS\.md|README\.md|products\/streak\/(?:docs\/.*\.md|AGENTS\.md|README\.md|status\.md|design\/season-preview\/(?:README|DESIGN-PROPOSAL|ARCHITECTURE-PROPOSAL)\.md))$/.test(
      file,
    )
  ) {
    docs++;
    for (const issue of documentationFailures(ROOT, file, content))
      failures.push(`${file}: ${issue}`);
  }
  if (/^products\/streak\/(?:public\/.*\.(?:js|html)|web\/src\/.*\.[jt]sx?)$/.test(file)) {
    browser++;
    for (const issue of browserFindings(content)) failures.push(`${file}: ${issue}`);
  }
  if (
    /^(?:scripts\/quality\/|products\/streak\/(?:public\/|scripts\/|design\/season-preview\/)|src\/week20\/contract-lab\/(?:scripts|web)\/)/.test(
      file,
    ) &&
    /\.[cm]?js$/.test(file)
  ) {
    syntax++;
    const result = spawnSync(process.execPath, ['--check', path], { cwd: ROOT, encoding: 'utf8' });
    if (result.error || result.status !== 0)
      failures.push(`${file}: JavaScript syntax check failed. Run node --check on this file.`);
  }
}
if (docs < 2) failures.push('Root README.md and AGENTS.md are required by the documentation gate.');
if (browser === 0 || syntax === 0)
  failures.push('No maintained browser or JavaScript files were found.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Static policy checks passed: ${docs} documents, ${browser} browser files, ${syntax} syntax checks, ${scanned} text files scanned.`,
  );
  console.log(
    'Secret rules are a targeted guard, not a full history or entropy audit. Browser rules cover direct imports; review transitive dependencies.',
  );
}
