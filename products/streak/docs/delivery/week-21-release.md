# Week 21 release record

Prepared 17 October 2026 on `feat/streak-direct-testnet`, based on `07b427c`. The owner explicitly authorized the report, screenshots, commit, push and consolidation of the outstanding PRs into main. Hosted Actions remain paused under the previously confirmed billing lock. No new campaign, prize budget or Five launch date was approved.

## Publication result

- Release commit: `45297c1cb77524ca0ffd160dca6dd24c1dac8865`.
- Main merge: `8621e4d762081b83eddf9c1b86aff28366cb3556`, through [PR 4](https://github.com/HeySomtee/ckbuilder/pull/4).
- Exact tested and merged tree: `984ffa2fe4cab24ecca5df52e91bbd325727afbe`.
- All 51 pre-commit checks passed at 15:40:33 UTC; all 51 pre-push checks passed at 15:57:57 UTC on 17 October.
- PR 1 is merged. PRs 2 and 3 are closed as consolidated. All four verified merged remote feature branches were removed.
- The unrelated ignore-file contents were restored byte-for-byte, the nested benchmark was untouched and disposable PostgreSQL was stopped.
- Render's initial deployment failed at 16:01:23 UTC. Retry `dep-db9ptfrbc2fs73cqb0hg` for the main merge succeeded at 16:14:46 UTC. [Deployment log](https://dashboard.render.com/web/srv-d9nn05u417fc73do0hig/deploys/dep-db9ptfrbc2fs73cqb0hg). Public `/` and `/season/` assets were verified separately at 16:25 UTC.

The instructions below record the release preparation and deployment handoff. Hosted payment durability remains unverified. A later local hero-centering change is outside this release. The owner's MetaMask classification warning remains under investigation; successful deployment is not security clearance. Local result evidence: `.quality-artifacts/week21-release-result.json` and `.quality-artifacts/metamask-published-js-audit.json`.

## Candidate and evidence

The candidate includes the approved account/navigation, compact layout, clear glass, terminal intelligence, inline checkout, sponsor recovery and compact Picks/Activity work. The [Week 21 report](../../../../reports/week-21.md) distinguishes those product improvements from upcoming Five and the original logo.

- All 51 implementation checks passed at 14:48:10 UTC on 17 October. The public-safe summary is retained with the report.
- Independent review of the pending money/recovery diff found no release blocker: lock waiting preserves exclusion; per-operation fixture/creation reads retain fresh validation; signed recovery shares the submission lock; tab switching preserves the same payment controller and captured picks.
- A separate fact review verified ranking, operator funding, public transaction amounts and the distinction between public entry and isolated settlement tests.
- Six fresh read-only screenshots of the actual local API-backed app were captured without signatures, writes or fabricated data. Their provenance records the asset hashes.
- Full exact-candidate gates are required by both commit and push hooks. Their logs and results belong in `.quality-artifacts/week21-*`; do not describe an incomplete run as passed.

The unrelated `.gitignore` addition and nested September benchmark must remain outside the release. Preserve the ignore file byte-for-byte while testing the exact candidate, then restore it after publication. Never include private operator journals, `.env`, keys or generated local state.

## GitHub integration

PRs 1 through 4 form an ancestral stack. Integrate the final reviewed tip once through PR 4 against main, then mark older PRs superseded only if GitHub has not already recognized them as merged. Verify their commits are present before deleting any merged remote branch. Do not deploy the intermediate PR states sequentially.

Record the final commit, merge and deployment results in the release PR. Main's tree must match the locally tested release tree. Hosted checks cannot be represented as green while the account lock prevents them from starting.

## Render handoff

Read-only inspection found the last successful Render deployment at Week 20 commit `2d5879a` on 8 October. The public service is `https://streak-terminal.onrender.com`. Its service dashboard is `https://dashboard.render.com/web/srv-d9nn05u417fc73do0hig`.

The existing dashboard may retain the old build/start commands unless Blueprint synchronization updates it. Review these exact settings before declaring the new web app available:

| Setting                | Required value                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| Branch                 | `main`                                                           |
| Build Command          | `npm ci --include=dev && npm --prefix products/streak run build` |
| Start Command          | `node products/streak/dist/server.js`                            |
| `NODE_ENV`             | `production`                                                     |
| `STREAK_PUBLIC_ORIGIN` | `https://streak-terminal.onrender.com`                           |

Keep existing database, provider and Telegram credentials private. The production API requires PostgreSQL-backed identity. Database capacity and deployed secrets must be checked through the owner's hosting account, not copied into reports or tests. Authenticated Render settings access is unavailable in this workspace, so the owner was asked to confirm the build, start and public-origin settings while local checks run.

The free web service alone does **not** host the complete direct-payment system. The current sponsor protocol requires a loopback process, shared IPC credential, durable absolute operator/registry directories and a lifecycle worker. No paid hosting or secret migration is authorized by this report. Follow [direct operations](../operations/direct-testnet.md) before enabling hosted payments; never place signed journals on an ephemeral filesystem or claim a main merge establishes that readiness.

After integration, inspect GitHub deployment status and the actual `/season/` assets separately. Report startup/build failures and missing configuration directly. Do not send the supervisor DM automatically.
