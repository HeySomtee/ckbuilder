# Operations and pilot readiness

This is the approved operational checklist and response procedure. It does not claim that a deployment, backup policy, alerting system or paid plan already exists. Record environment-specific commands and verified evidence as each integration is implemented. Never commit credentials or real participant data into runbooks.

## Before a public testnet cohort

- Verify the actual deployment, runtime version, provider limits, PostgreSQL storage/connection headroom and an always-on API/worker execution budget. `render.yaml` alone does not prove deployed settings.
- Reconcile legacy treasury liabilities and establish a visible exit path. Never move or relabel old balances as direct-contract collateral without a reviewed migration.
- Confirm TLS certificate verification, HTTPS cookie policy, durable sessions/challenges, mutation authorization and rate limits.
- Practice restoring a disposable copy from backup and record duration, integrity checks and the chosen recovery point. A backup file without a successful restore is incomplete evidence.
- Publish market terms, supported contracts/wallets, proven market-size bounds, player-data limitations, Five rules and any approved reward policy.
- Verify operator reserve and keeper funding separately from user principal. Confirm oracle key access/rotation and what happens if the signer is unavailable.
- Run a complete supported stake, admission, settlement and claim/refund flow on the intended network when authorized. Record actual hashes and distinguish synthetic oracle fixtures from real football evidence.
- Complete browser/device/accessibility checks and a workload exercise against an isolated deployment. Set monitoring and support ownership before onboarding users.

## Monitoring and bounded retention

Track API latency/error rate, process restarts, DB disk/connection use, slow queries, failed jobs, oldest job age, worker lease recovery, provider freshness/quota, chain-index lag, pending transaction age and unresolved claims. Alert thresholds should follow measured deployment budgets; do not invent traffic capacity from local tests.

Keep correlation IDs and sanitized operation identities. Exclude secrets, session tokens, private transaction payloads and personal inputs from logs. Define retention for logs, provider snapshots, history and analytics. Prune only data covered by a published policy and preserve unsettled liabilities, recovery evidence and required receipts. Do not delete funded markets to recover disk space.

## Incident response

1. Establish impact and authority: affected deployment, users, operations, network and contract version. Preserve safe logs and hashes without copying secrets.
2. Pause new entries or the affected feature when needed. Keep valid withdrawals, claims and refunds available. Show a truthful status; never fabricate settlement or hide pending liabilities.
3. Reconcile uncertain external effects before retry. For a signed transaction, inspect its existing hash and input status. For a job, inspect its durable business key, lease and completion identity.
4. Repair the cause and test the failure/recovery path in isolation. Apply the smallest safe rollback or forward fix. Database and contract changes may not be reversible like static assets.
5. Verify recovery against authoritative records, monitor recurrence and record the incident, impact and follow-up. A restart alone is not proof that ledger or chain state is correct.

## Specific recovery paths

| Failure                      | Required behavior                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Database full/unavailable    | Fail mutations visibly; do not fall back to another balance ledger. Recover capacity under retention policy and verify committed state before resuming |
| Provider delayed/unavailable | Preserve last good data with freshness; stop unsupported scoring/results; retry with bounded backoff                                                   |
| Worker restart/lease expiry  | Recover durable jobs, fence stale completions and reconcile signed/broadcast transactions before rebuilding                                            |
| Reorg/index mismatch         | Roll back affected projections to a valid checkpoint and replay; suspend misleading accepted/claimable displays                                        |
| Oracle misses deadline       | Follow the pinned protocol timeout path and eligible-report rules; never use a late builder timestamp as evidence                                      |
| App unavailable              | Keep protocol manifests and direct owner-claim/recovery tooling accessible; backend permission cannot become a claim prerequisite                      |
| Motion/render failure        | Use immediate state/focus transitions; retain drafts and signing state independently of the animation                                                  |

## Rollout and rollback

Ship versioned static assets and APIs with compatible public contracts. Feature-gate unfinished journeys. Start with a small supported cohort within contract bounds and observe failures before expanding. Do not promise a larger market until a new design and benchmark establish it.

Use expand/migrate/contract steps for schema changes where needed. Rehearse migrations on disposable copies with exact-money and liability checks. Record the version and recovery plan before applying a destructive change. Frontend rollback does not reverse an external payment or committed CKB state.

Script upgrades need new deployments and manifests, with old exit tooling retained. Never remove a supported code dependency or claim path during a web rollback. Production purchases, public announcements and reward commitments follow the owner's explicit scope; this document grants none of them automatically.
