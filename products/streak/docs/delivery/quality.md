# Quality gates and release procedure

The owner's requirement is that major changes receive repeatable tests and every commit passes CI checks. The local gate therefore runs the same substantive checks before a commit; GitHub confirms the committed revision separately after publication. A commit cannot have a hosted result before its SHA exists. Neither a local pass nor a workflow file proves remote enforcement.

## Reproducible setup

Use the repository-pinned **Node 24.14.0 and npm 11.9.0**, the committed lockfiles and `npm ci`. Root and Streak installs are distinct dependency contexts; follow the root scripts rather than hand-editing installed packages. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) is the clean-install contract.

Install the Playwright browser versions matching Streak's lockfile. Browser CI needs Chromium and WebKit. The contract lane uses Rust 1.97.1 and the Week 20 lab's documented native toolchain. See the [lab prerequisites](../../../../src/week20/contract-lab/README.md#run); Windows invokes WSL for the Rust VM suite.

The contract lane also builds and tests `contracts/direct-v2` and runs the product devnet harness against genuine OmniLock. Before the first gate, explicitly run `node products/streak/scripts/direct-omnilock-setup.cjs --download` from the repository root. This setup reads one pinned public code artifact, verifies its hash and canonical source, and caches it locally. Routine tests never download it, read wallet keys or use public RPC; missing or changed cached bytes fail the gate. The shared-wallet browser lane uses actual CCC EIP-6963 discovery with a synthetic EVM provider and Ethereum personal signatures, across Chromium and WebKit at phone and desktop widths.

PostgreSQL checks require an explicitly configured `PG_TEST_URL` targeting loopback and a disposable database whose name ends in `_test`, conventionally `streak_test`. The harness isolates fixtures in a random schema and cleans up its own schema. Never substitute a production URL, an existing application database or a hosted Neon instance. Missing prerequisites fail the required gate; they are not skipped into success.

Sponsored first-prediction creation adds three mandatory lanes: the separate `contracts/direct-v3` Rust VM suite, `scripts/sponsored-browser.cjs` and `scripts/sponsored-devnet-run.cjs`. Existing v1/v2 and shared-wallet checks remain required. The lanes cover actual two-party signing, exact sponsor/user contribution accounting and interrupted-submission recovery; an unsigned builder or a simulated success alone does not satisfy the signed-chain acceptance criteria. All 42 steps passed at 14:59 UTC on 16 October. See the [delivery evidence](sponsored-creation.md) for the tested scope and limits.

Install repository hooks with `npm run hooks:install` after setup. Hooks are local enforcement and must be installed in each checkout. CI repeats the requirements. Do not bypass a failing hook with `--no-verify` or weaken a test just to make a commit.

Atomic slip payments add mandatory v4 Rust VM and signed devnet lanes, the production combined-slip browser journey and Wallet/Telegram browser coverage. Older single-market browser lanes exercise historical deep links and recovery; they do not prescribe the new inline checkout. Database version 3 tests retain previous signed records and cross-store reservations. All tests use synthetic accounts, mocked remote transports or isolated local nodes. Public deployment and a live provider smoke check are recorded separately in the [atomic delivery report](atomic-slip-correction.md).

Example local PowerShell setup from the repository root, after installing the pinned Node/npm and contract prerequisites:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd ci --prefix products/streak --ignore-scripts
node products/streak/node_modules/playwright/cli.js install chromium webkit
docker run --detach --rm --name streak-quality-postgres --publish 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql/data -e POSTGRES_DB=streak_test -e POSTGRES_PASSWORD=streak-ci-local postgres:16-alpine
docker exec streak-quality-postgres pg_isready -U postgres -d streak_test
$env:PG_TEST_URL = 'postgresql://postgres:streak-ci-local@127.0.0.1:55432/streak_test'
npm.cmd run hooks:install
npm.cmd run quality:major
```

`npm.cmd` avoids PowerShell execution-policy blocks on `npm.ps1`. On other shells use `npm` and the shell's environment-variable syntax. Wait for `pg_isready` to report ready before the gate. The password above belongs only to a disposable local test container. The container binds to loopback and uses temporary storage. Do not reuse its name if another unrelated container owns it. Stop only this test container with `docker stop streak-quality-postgres` when finished; `--rm` removes the container and its temporary data. Start it again for future commit/push gates. The browser lane owns preview port 4176, leaving the interactive preview on 4175 alone.

## Command contract

The market checkout correction adds `scripts/checkout-browser.cjs` as a mandatory full-application EVM journey. It starts at the built market card and detail routes, creates the first market in its payment, repeats a mixed existing/new combined payment, and checks inline reconnect and failure-safe historical entry routing. It complements the lower-level batch and historical recovery lanes; none of those lanes are removed.

Run these from the repository root:

| Command                     | Required scope                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| `npm run quality`           | Full static, unit, PostgreSQL, browser and contract lanes                      |
| `npm run quality:major`     | Full gate after a major change; same complete lane set                         |
| `npm run verify`            | Alias for the full gate                                                        |
| `npm run quality:static`    | Repository policy, syntax/types, docs and static checks wired by the runner    |
| `npm run quality:unit`      | Existing application and shared-client unit/regression suites                  |
| `npm run quality:postgres`  | Required real PostgreSQL checks in disposable local isolation                  |
| `npm run quality:browser`   | Built-app Chromium smoke and deterministic preview journeys in Chromium/WebKit |
| `npm run quality:contracts` | Required Week 20 Rust VM, accounting and shared-client checks                  |
| `npm run test:tooling`      | Regression checks for the repository's own gate/isolation tooling              |
| `npm run format:check`      | Prettier check for the new documentation and quality foundation                |
| `npm run format:foundation` | Format that same scope locally before staging                                  |

The runner writes per-lane results and safe browser evidence to the ignored `.quality-artifacts/` directory. Preserve a dated result summary in status; artifacts alone are not hosted CI evidence. The local pre-commit and pre-push hooks both run the complete gate.

Static checks currently cover scoped formatting, strict TypeScript builds, maintained JavaScript syntax, documentation links, sensitive paths and credential patterns, and direct browser/server import rules. They are not a full historical secret audit or a transitive dependency analysis. The React/Vite increment adds TypeScript/React-hook linting, strict browser compilation, a production build and integrated component journeys against the local API in Chromium and WebKit. The unit runner discovers new `src/**/*.test.ts`, `.test.mjs`, `.test.cjs` and `web/**/*.test.mjs` files automatically; PostgreSQL remains in its own mandatory lane.

The direct-market increment adds `scripts/direct-browser.cjs`, exercising the built application, CCC connector, real IndexedDB and a synthetic chain bridge in Chromium and WebKit at 390 and 1440px. There are no production wallet test hooks. It covers wallet rejection, exact review, persistence before broadcast, original-byte retry after reload, claim settlement, confirmed conflicting-spend recovery and storage failure. Its transactions are synthetic browser evidence.

The contract lane also requires `scripts/direct-devnet-run.cjs`. It starts an owned loopback CKB node through WSL, uses the pinned local Week 20 binaries and actual product client/operator adapters, signs with public development fixture keys, and stops the node afterward. It verifies admission, settlement, independent claims, the full six-hour refund, external fee-input conflicts and actual chain reorganisations. Missing node binaries or a failed lifecycle fail the gate. The routine runner strips all inherited `STREAK_DIRECT_*` values before testing.

`scripts/direct-testnet-verify.cjs` is a separate explicitly acknowledged public-network command. It uses an isolated synthetic fixture, records source file hashes and real transaction hashes, and never publishes that fixture to the football registry. Its evidence cannot establish a real football result, community use or a hosted deployment. It is never part of the recurring quality gate.

Inspect the current package scripts and runner when a lane changes. Keep this table synchronized in that change. While iterating, run the focused lane that can reveal the change's failure. Before each commit and after a major change, run the complete gate. Major changes include domain behavior, identity, persistence, financial handling, contracts/builders, dependencies, security, architecture, the application shell and delivery tooling.

`products/streak` already has an `npm run verify -- <marketId>` command for receipt verification. That is not the root quality gate and may contact a configured service. Do not confuse the two or invoke live receipt verification as a routine test.

## Safety and meaningful coverage

Required tests must be self-contained: disposable file storage, a random test schema, deterministic provider fixtures, dummy identities and isolated local chain nodes. They must not read local wallet keys or production credentials, mutate the working application data directory, contact public RPC, consume football API quota, send notifications or publish transactions. Testnet and live-provider commands are separate explicitly scoped work.

| Layer       | Behavior to protect                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| Domain/unit | Exact money, validation, mapping, lifecycle rules, idempotency and failure branches                        |
| Persistence | Real SQL constraints, atomic rollback, exact round trips, bounded behavior and concurrency when introduced |
| Browser     | Real built routes, navigation, draft persistence, errors, keyboard/focus and critical user journeys        |
| Preview     | Approved independent-pick UX, totals, rejection/recovery, layout and accessible controls                   |
| Contract    | Authorization, cell conservation, timing, complete shard closure, fully backed claims, replay and recovery |
| Tooling     | Gates reject forbidden environments/configuration and report missing prerequisites as failures             |

Add tests for newly implemented failure and recovery behavior. A new API feature needs integration coverage; Five needs deterministic scoring/cutoff race checks when its implementation arrives. Do not add placeholder tests for unbuilt architecture or fill coverage with assertions that mirror constants. A mock proves only the boundary it controls.

PostgreSQL and browser jobs must be required, not optional because they need extra setup. A skipped, unavailable or cancelled required check is not green. Keep timeouts, cleanup and artifact capture, but never solve a failure by removing the assertion, loosening its meaning or broadly ignoring errors.

## Browser and motion evidence

Review changed journeys at 320px, representative phone and desktop widths, short heights and keyboard/zoom conditions. Test reduced motion and readable no-blur/high-contrast fallbacks. Capture relevant pending, failure and recovery states, not only the happy-path screenshot. Browser artifacts must contain only test data.

The preview's last full timing suite passed **56/58**, with two Windows headless mobile WebKit timing observations unresolved. Its earlier dedicated snapshot run passed **9/9 before the final slip tint**. Those results are retained, not silently reclassified as a production pass. See [the design evidence](../design/system.md#evidence-and-remaining-limits). Deterministic functional CI and separate timing/device profiling have different purposes. Production Genie readiness still needs real-device profiling and resolution or a documented immediate-transition fallback.

Integrated Season coverage now includes `prediction-motion.cjs` through the browser lane. It inspects actual surface pixels and taper shape at 390 and 1440px in Chromium and WebKit, with two and eight picks. Cold preparation, edited amounts, rapid reversal, focus, route changes, resize, reduced motion and failed rendering must preserve the draft. Surface presence alone is not a passing animation test. Read [the correction report](ui-motion-correction.md) for scope and evidence.

## Commit and CI procedure

1. Inspect the working tree and stage only intended files. Preserve unrelated changes. Ensure the candidate index is exactly what the verification will evaluate; the hook rejects a mismatch that could test one version and commit another.
2. Run the complete quality gate. Resolve failures and rerun affected checks, then complete the gate for the final candidate. Record actual results and any missing environment prerequisites.
3. Review the diff, including generated artifacts, dependencies, trust boundaries and docs. Financial, identity and recovery changes receive an independent review.
4. Commit only after the applicable gates pass. Use a focused Conventional Commit describing the final change. Do not create a knowingly failing checkpoint merely to obtain a GitHub SHA.
5. When publication is authorized, push and inspect all required GitHub checks for that exact SHA. Fix failures on a new commit and verify that SHA. Do not merge or release on a result from an older revision.
6. Record hosted run links, local evidence, reviewed scope and unresolved limitations. Release is a separate action from passing tests.

CI uses locked installs and separate required lanes for static checks, unit tests, PostgreSQL, browser smoke and Week 20 contracts. The workflow's aggregate **Quality gate** fails unless every required job succeeds. Confirm its actual successful GitHub check context before making it required in branch settings. Workflow configuration, successful hosted execution and branch protection are three separate states.

Configure protected branches/rulesets to require the actual quality checks, disallow force pushes/deletion and prevent merging incomplete checks, subject to repository permissions and plan support. A prepared config is not an applied rule. [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) describes the repository setting. The initial foundation has no verified hosted run or active protection; read [status](../../status.md) for updates.

## Release acceptance

Before inviting a cohort, require the implemented journey's tests, supported-wallet evidence, observable failures/recovery, a restore rehearsal, bounded workload evidence and a deployment rollback plan. Run real testnet settlement only as an explicitly scoped validation, recording actual network, contract version, transaction hashes and what the test covered. It is not a substitute for isolated regression tests.

No test suite proves software cannot crash. Completion means known critical failures are fixed, invariants are protected, failures are recoverable, monitoring can find them and remaining limits are stated. Do not describe the grant pilot as production-ready or unrestricted based on a clean local run alone.

## Hosted CI pause

On 15 October 2026 GitHub refused to start the foundation jobs because the account was billing-locked. The owner explicitly instructed us to abort hosted CI work. The newly added main protection was removed; local commit/push verification remains active. Keep the workflow for later, but do not claim hosted checks or require billing-blocked status checks until the owner resumes that work.
