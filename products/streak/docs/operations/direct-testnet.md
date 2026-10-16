# Direct testnet operator and wallet recovery

This runbook covers the integrated `testnet-v1` client and unchanged Week 20 Rust deployment. It does not deploy scripts or start a hosted worker. The API serves a public fixture catalogue. A separate operator process creates markets and reports football results. Wallets send their own stakes and claim directly through CKB.

## Protocol and pilot bounds

- CKB testnet only, with the pinned RPC and deployment in `src/modules/direct/registry.ts` and the browser protocol manifest.
- Four shards, eight records per shard, at most 32 positions per market. Sequential selection reduces local contention but does not eliminate competing spends.
- Minimum principal: 100 testnet CKB. Each position also supplies 321 CKB of recoverable claim storage. Fees and ordinary wallet change capacity are separate.
- Winners receive principal plus their proportional share of the losing pool after 2% protocol and 1% creator fees. These percentages apply to the losing pool. Losing positions recover their 321 CKB storage. A void or an outcome with no winning stake returns principal plus storage. Late provisional deposits are refunded directly during closure.
- This builder pins both fee recipients to the configured market creator/operator. Legacy application creator and balance records have no authority over these direct terms.
- Wallet lock arguments are limited to 20 bytes. One claim uses one transaction and separate fee capacity. This increment pays for one market. An eight-pick draft does not authorize eight separate payments.
- The catalogue supports 256 markets and the owner journal supports 128 records. These are explicit pilot bounds, not demonstrated user capacity.

## Fixture mapping and trusted results

The immutable catalogue binds the API-Football fixture ID, app fixture ID, label, original kickoff, regulation-time 1X2 rules, six-hour deadline, creation hash and market type script. Its SHA-256 digest protects catalogue consistency. The deployed 172-byte script arguments do **not** contain the fixture digest. The football-to-market mapping remains a trusted operator assumption.

The admin lock hash is pinned separately in each market's script arguments. This deployment has no global factory allowlist: another operator can create a different market instance with their own admin. The curated registry identifies Streak's supported instances. Knowing only the protocol code hash does not authenticate a particular football oracle.

Entries are disabled when the active provider no longer owns the fixture, kickoff changes, the match is no longer scheduled or the cutoff passes. An API row is not proof of a chain position. The client independently checks live cells and canonical confirmations.

Reporting reads the pinned API-Football endpoint. It requires the exact fixture and kickoff, `FT`, `AET` or `PEN` status, and explicit nonnegative integer `score.fulltime` values. Extra-time and penalty totals cannot replace regulation scores. Two identical observations at least 30 seconds apart are required, with a fresh final observation. Missing scores, provider failures and changed schedules never produce synthetic results.

A report remains provisional until its actual creation header is checked. Only commitment at or after kickoff and before kickoff plus six hours is eligible. A timely report must settle even after the deadline. Without an eligible report, the consensus timeout permits a void. `since` supplies a lower bound, not proof of pre-deadline commitment.

## Operator configuration

Build first:

```powershell
npm.cmd --prefix products/streak run build
```

Provision these variables specifically for the operator process:

| Variable                            | Purpose                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `STREAK_DIRECT_OPERATOR_DIR`        | Absolute durable path for private journal and observations                          |
| `STREAK_DIRECT_REGISTRY_DIR`        | Separate absolute public catalogue path; give the API read access to this catalogue |
| `STREAK_DIRECT_PRIVATE_KEY`         | Explicit testnet operator key, never supplied to the API or browser                 |
| `API_SPORTS_KEY`                    | Football credential, needed for creation and reporting                              |
| `STREAK_DIRECT_DURABLE_STATE_ACK=1` | Required with `NODE_ENV=production` after verifying persistent operator storage     |

Commands do not load `.env`, `.ckb-wallet.key`, legacy treasury keys or demonstration wallet files. Routine tests reject public-network entry points. Do not serve the private journal as website content.

Use one operator writer on a durable local volume. Ephemeral hosted filesystems and multiple hosts sharing this adapter are unsupported. Separate API and operator machines need a reviewed durable catalogue distribution step. The acknowledgement variable is not evidence that a volume or restore procedure has been verified.

## Create a real football market

Replace `FIXTURE_ID` with the numeric ID from the real API catalogue. Never publish synthetic verification fixtures here.

```powershell
node products/streak/scripts/direct-operator.cjs create FIXTURE_ID
node products/streak/scripts/direct-operator.cjs create FIXTURE_ID --broadcast
node products/streak/scripts/direct-operator.cjs reconcile FIXTURE_ID
```

The first command fetches the scheduled fixture, builds and signs a market with five 610 CKB reserves, and saves the exact signed bytes and hash before broadcast. Separate fee and change funding is required. The second command reconciles the existing hash and can submit only those saved bytes.

Reconciliation publishes the immutable mapping after four canonical confirmations. Until then, the API has no enabled direct market for that fixture. An empty registry correctly returns an empty list. API fixture and logo availability remains a separate application dependency.

## Results and bounded automation

Manual paths:

```powershell
node products/streak/scripts/direct-operator.cjs observe FIXTURE_ID
node products/streak/scripts/direct-operator.cjs report FIXTURE_ID --broadcast
node products/streak/scripts/direct-operator.cjs settle FIXTURE_ID --broadcast
node products/streak/scripts/direct-operator.cjs void FIXTURE_ID --broadcast
node products/streak/scripts/direct-operator.cjs status FIXTURE_ID
node products/streak/scripts/direct-operator.cjs reconcile FIXTURE_ID
```

Wait at least 30 seconds between matching observations. `report` can save the first observation and return a waiting message. `settle` requires an eligible committed report. `void` requires the six-hour timeout and rejects a timely report. They are alternative closure commands, not a sequence to run together.

Schedule this once per minute on the configured operator host:

```powershell
node products/streak/scripts/direct-worker.cjs --once
```

The worker processes at most four records per invocation, serially, with a durable round-robin cursor. It reconciles existing jobs, waits before kickoff, gathers real results, reports, settles or voids. It does not broadcast merely prepared creation transactions. A selected reporting market normally makes one provider read per invocation. Each network request has a 15-second timeout; chain reads and transaction sizes are also bounded.

Four records is a work budget, not a one-minute completion guarantee. An overlapping invocation fails the worker lease. At the 256-market limit, a full round takes 64 successful invocations. Keep the cohort smaller or implement a reviewed indexed scheduler before promising faster coverage. Closed markets remain discoverable for claims; do not delete funded mappings to improve polling speed.

Provider failure cannot become a winning result and does not disable the timeout path. Pending, rejected, conflicting or uncertain signed jobs need review. The worker never assumes that an unknown broadcast failed and silently creates another spend. Monitor failures and deadline coverage. No worker is started by the API or installed as a service by this change.

## Restart, backup and conflicts

Back up the durable journal, provider observations and catalogue together. Signed bytes are public transaction material, but retain restricted filesystem permissions. Keep signing keys in separate secret configuration, outside source control and these state files.

Each financial operation has an immutable signed entry. After a timeout or restart:

1. Run `reconcile FIXTURE_ID` and inspect the original hash, canonical checkpoint and current inputs.
2. Wait for pending transactions and canonical confirmations.
3. If all original inputs remain live and the action is still time-eligible, rerun the original command with `--broadcast` to resend exactly the saved bytes.
4. If inputs are spent while the hash is absent, or a node reports rejection, preserve the journal and investigate canonical consuming transactions. Do not delete the journal to force another spend. Automatic conflicting-transaction replacement is not implemented.
5. Recheck actual chain state after a reorg. A cached committed flag is not entitlement.

Mutation leases fail closed after a crash. Operator `status` and `reconcile` remain available without that lease. Verify that the old process has stopped and no replacement is running before manually removing an orphan `operator.lock`. The worker lease is under `worker-lease/operator.lock`. There is no automatic stale-lock deletion that could race another process.

This is a single-operator file adapter. Replicated workers need transactional jobs, leases and fencing in PostgreSQL or another reviewed coordinator.

## Owner recovery without the API

Export recovery JSON from the Season direct-position screen. It includes the pinned manifest, fixture descriptors, public owner hash and saved signed transactions. It contains no private key. Retain it before clearing browser storage or changing devices.

The standalone tool imports the same `DirectClient`, validators and builders as the browser. Node 24 native TypeScript loading is required. The API, login, football provider and operator key are not involved.

Set an absolute `STREAK_DIRECT_RECOVERY_DIR` on durable local storage. `STREAK_DIRECT_OWNER_ADDRESS` permits status and exact-byte resubmission without a private key. New claim signing requires explicitly supplied `STREAK_DIRECT_OWNER_PRIVATE_KEY`. No key or environment file is opened automatically. Normal app use signs through the connected browser wallet.

```powershell
node products/streak/scripts/direct-claim.cjs streak-testnet-recovery.json status
node products/streak/scripts/direct-claim.cjs streak-testnet-recovery.json claim MARKET_ID CLAIM_TX_HASH OUTPUT_INDEX
node products/streak/scripts/direct-claim.cjs streak-testnet-recovery.json claim MARKET_ID CLAIM_TX_HASH OUTPUT_INDEX --broadcast
node products/streak/scripts/direct-claim.cjs streak-testnet-recovery.json resend SIGNED_TX_HASH --broadcast
node products/streak/scripts/direct-claim.cjs streak-testnet-recovery.json resolve ORIGINAL_TX_HASH CONFLICTING_TX_HASH
```

Without `--broadcast`, the claim command displays the actual entitlement, separate fee and reviewed transaction. With the flag, it signs, saves the exact bytes and submits. It rejects another owner, changed deployment or fixture mapping, spent claim and redirected payout. The complete claim capacity returns to its owner; separate plain cells fund the fee.

`resend` accepts an existing journal hash and cannot rebuild or resign. A lost response remains unknown until reconciliation. Canonical-header checks detect orphaned confirmations. An orphan `recovery.lock` requires stopped-process verification before manual removal.

If another confirmed transaction consumed an input of an original signed transaction, `resolve` can record that competing hash without a private key. The shared client verifies an actual shared input, a canonical block and at least three confirmations. Only then can a newly reviewed claim proceed. The old signed bytes remain in the journal. Every later recovery rechecks the proof; if its block disappears or loses the required depth, the original input reservations return. An unrelated hash or an unconfirmed transaction cannot release a reservation. This owner recovery path does not remove or replace an operator's immutable journal entry.

Status inspects at most 32 descriptors per invocation and reports whether more exist. Explicit claims can select any validated descriptor in the bundle. Preserve both the export and the durable recovery directory, including unresolved entries.

## Permissionless closure when the operator is unavailable

A claim cell exists only after market closure. If the operator disappears before closure, a bettor or another keeper can use the existing `void` or `settle` command. Despite the CLI's name, these two builders do not require the market admin key. `report` does require that key. The keeper needs a supported testnet key and an eligible plain funding cell containing at least 62 CKB for the builder's separate fee/change requirement. A valid timeout also pays the fixed 100 CKB keeper incentive from operator reserves.

Use a separate terminal and dedicated durable recovery directories. Do not point these commands at the running operator's journal or public catalogue. The following helper validates the exported bundle and restores one unchanged public descriptor into a separate local catalogue. It does not create a market, alter its funded terms or edit the original registry.

After building the product, replace `FIXTURE_ID` with the numeric fixture ID in the export:

```powershell
$env:STREAK_RECOVERY_BUNDLE = (Resolve-Path .\streak-testnet-recovery.json).Path
$env:STREAK_RECOVERY_FIXTURE = 'api-football-FIXTURE_ID'
$env:STREAK_DIRECT_OPERATOR_DIR = Join-Path $env:LOCALAPPDATA 'StreakRecovery\keeper-journal'
$env:STREAK_DIRECT_REGISTRY_DIR = Join-Path $env:LOCALAPPDATA 'StreakRecovery\keeper-catalogue'

@'
const { readRecovery } = require('./products/streak/scripts/direct-claim.cjs');
const { DirectRegistry } = require('./products/streak/dist/modules/direct/registry.js');
(async () => {
  const bundle = await readRecovery(process.env.STREAK_RECOVERY_BUNDLE);
  const market = bundle.markets.find(row => row.fixtureId === process.env.STREAK_RECOVERY_FIXTURE);
  if (!market) throw Error('That fixture is absent from the validated recovery bundle');
  new DirectRegistry(process.env.STREAK_DIRECT_REGISTRY_DIR).add(market);
  console.log(JSON.stringify({ fixtureId: market.fixtureId, cutoffMs: market.cutoffMs, deadlineMs: market.terms.deadlineMs }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
'@ | node

node products/streak/scripts/direct-operator.cjs status $env:STREAK_RECOVERY_FIXTURE
```

Supply the keeper's key explicitly as `STREAK_DIRECT_PRIVATE_KEY` in this separate process, using the same secret-configuration procedure described above. This variable name does not confer admin authority. No football API key, Streak login or original operator journal is needed for closure. Keep the persistent-volume acknowledgement if running with `NODE_ENV=production`.

After the pinned six-hour deadline, when no eligible report exists:

```powershell
node products/streak/scripts/direct-operator.cjs void $env:STREAK_RECOVERY_FIXTURE
node products/streak/scripts/direct-operator.cjs void $env:STREAK_RECOVERY_FIXTURE --broadcast
node products/streak/scripts/direct-operator.cjs reconcile $env:STREAK_RECOVERY_FIXTURE
```

If the chain contains a timely eligible report, `void` refuses it. Use the permissionless settlement path instead, which preserves that reported outcome:

```powershell
node products/streak/scripts/direct-operator.cjs settle $env:STREAK_RECOVERY_FIXTURE
node products/streak/scripts/direct-operator.cjs settle $env:STREAK_RECOVERY_FIXTURE --broadcast
node products/streak/scripts/direct-operator.cjs reconcile $env:STREAK_RECOVERY_FIXTURE
```

Choose one path based on the authoritative chain state. The first closure command signs and persists; `--broadcast` can submit only its exact saved bytes. A wall-clock countdown does not prove consensus timeout maturity. A competing report, stake or keeper transaction can also invalidate prepared inputs. Preserve an uncertain or rejected closure journal and reconcile it; these commands do not automatically replace a conflicting operator transaction.

Once closure commits, run the standalone owner's `status` command with the original recovery bundle to discover the funded claim outpoints, then use its normal claim flow. The bundle's descriptor remains valid after closure. A keeper can close for everyone, but each claim still pays its pinned owner. Late provisional deposits may already have returned directly to the owner's lock instead of producing claim cells.

The automatic worker deliberately stops when its own signed report or closure is ambiguous. That off-chain policy does not remove the script's permissionless timeout. An independent keeper uses its own journal and current live cells. The script still rejects voiding an eligible report, late reporting cannot become eligible, and only a committed closure changes the market. This recovery path is supported by existing builders; it does not claim that unattended conflict replacement or a public keeper service is deployed.

## Isolated evidence

Five backend groups pass: registry and entry gating; strict raw provider evidence; durable journal and unknown/reorg recovery; report boundary and exact payouts; bounded worker scheduling. HTTP checks cover pinned public config, `no-store`, invalid queries, origin enforcement, source unavailability, unchanged legacy data and malformed registry failure. Four standalone recovery tests cover immutable bytes, restart observations, lock exclusion, import integrity, live-network test isolation and canonical conflict-proof recovery after a reorg.

These tests use synthetic local fixtures and stubbed chain reads. Native devnet and separately authorized public-testnet evidence must be reported separately. This runbook does not prove that a worker, real football market, hosted volume or backup is deployed.
