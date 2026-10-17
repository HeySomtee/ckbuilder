# Repository agent instructions

Streak's approved product work lives in `products/streak`. Read its
[agent contract](products/streak/AGENTS.md), [documentation map](products/streak/docs/README.md)
and [status](products/streak/status.md) before work on Streak or its shared delivery tools.
Read and update the [work tracker](products/streak/docs/work-tracker.md) so steering
requests and handoffs preserve earlier unfinished commitments.

The owner approved the Season preview UI and architecture on 15 October 2026.
That approval includes the documentation and quality foundation. Implement within
the approved boundaries; ask about material departures rather than repeating
approval for routine decisions already covered.

Preserve unrelated work and historical weekly exercises. Never load live keys,
the production database or football provider credentials into a test. Production
fund movement and a synthetic test are different evidence and must be labelled.

Run `npm run quality:major` after major runtime changes. Owner direction on
17 October 2026 replaces blanket commit/push reruns with scoped hooks: docs use
formatting and static policies; CSS adds the frontend build; delivery tooling
adds its regression tests; other code changes retain the full gate. Push can
reuse a successful check for the exact tree, runtime and required coverage for
up to 24 hours. See Streak's quality guide. `npm run hooks:install` installs the
hooks. Never bypass a failed gate, silently skip a required suite, or claim a
GitHub check passed without a successful run for the exact revision. Do not
commit secrets or generated private state. Stage only the intended change.

On 15 October 2026 the owner paused hosted CI work after GitHub's billing lock
prevented jobs from starting. Keep local gates; do not require hosted checks or
restore branch protection until the owner resumes that work.

Keep docs and dated test evidence current. No em dashes in newly authored prose.
Do not promise zero bugs, capacity or deployment readiness without evidence.
