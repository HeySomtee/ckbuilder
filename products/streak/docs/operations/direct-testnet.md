# Direct testnet operator and wallet recovery

This runbook covers direct positions, sponsored creation, atomic v4 entry and recovery across retained generations. Market descriptors retain the `testnet-v1` format and pinned deployment hashes; atomic offers and browser records use `atomic-predictions-v1`. The API serves real fixture terms and proxies authenticated requests to a separate sponsor. Wallets authorize their own exact contribution, and claims remain independent CKB transactions.

The current v4 deployment is output 0 of [transaction 930bba6c](https://pudge.explorer.nervos.org/transaction/0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f), with 13 canonical confirmations observed for the delivery record. Its protocol hash is `0x6c03d7942bd133c713c501df7a6e263699a0ea731339eda993548640e900405c`. The unchanged guard remains at output 1 of transaction `0xb05048b11a78fc9697c1235ec4e114f2f762559cb9652b61552bc87e8c3fde11`. V1, v2 and v3 mappings remain pinned for existing positions and exits. Public code deployment and local application activation are complete. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. See the [atomic delivery record](../delivery/atomic-slip-correction.md).

## Protocol and pilot bounds

- CKB testnet only, with the pinned RPC and deployment in `src/modules/direct/registry.ts` and the browser protocol manifest.
- Four shards, eight records per shard, at most 32 positions per market. Sequential selection reduces local contention but does not eliminate competing spends.
- Minimum principal: 100 testnet CKB. Each position also supplies 321 CKB of recoverable claim storage. Fees and ordinary wallet change capacity are separate.
- Winners receive principal plus their proportional share of the losing pool after 2% protocol and 1% creator fees. These percentages apply to the losing pool. Losing positions recover their 321 CKB storage. A void or an outcome with no winning stake returns principal plus storage. Late provisional deposits are refunded directly during closure.
- This builder pins both fee recipients to the configured market creator/operator. Legacy application creator and balance records have no authority over these direct terms.
- Original contract wallet lock arguments are limited to 20 bytes. Later contracts allow up to 59 bytes, with actual wallet/device verification still separate. One claim uses one transaction and separate fee capacity. Atomic entry supports one through eight distinct v4 fixtures in a single transaction, including a mixture of new and funded markets. Older generations cannot be mixed into that entry. One failed line blocks the entire review; there is no silent individual-payment fallback.
- A funded catalogue supports 256 markets. The durable provisioning queue retains up to 4,096 fixtures, including explicit blocked entries beyond the funded limit. The shared operator journal supports at most 1,536 lifecycle operations across configured generations. Sponsor histories are bounded at 4,096 offers per generation. Browser recovery storage supports 128 records in aggregate across ordinary, sponsored and atomic stores. These are resource bounds, not demonstrated user capacity.

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

| Variable                            | Purpose                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `STREAK_DIRECT_OPERATOR_DIR`        | Absolute durable path for private journal and observations                                              |
| `STREAK_DIRECT_REGISTRY_DIR`        | Separate absolute public catalogue path; give the API read access to this catalogue                     |
| `STREAK_DIRECT_LEGACY_REGISTRY_DIR` | API-only path to the original catalogue, retained for existing positions and claims                     |
| `STREAK_DIRECT_CATALOGUE_URL`       | Explicit loopback URL, such as `http://127.0.0.1:4100/api/direct/fixtures`, enabling automatic creation |
| `STREAK_DIRECT_PROGRESS_DIR`        | Separate absolute public progress directory; configure this for both API and worker                     |
| `STREAK_DIRECT_PRIVATE_KEY`         | Explicit testnet operator key, never supplied to the API or browser                                     |
| `API_SPORTS_KEY`                    | Football credential, needed for creation and reporting                                                  |
| `STREAK_DIRECT_DURABLE_STATE_ACK=1` | Required with `NODE_ENV=production` after verifying persistent operator storage                         |

Commands do not load `.env`, `.ckb-wallet.key`, legacy treasury keys or demonstration wallet files. Routine tests reject public-network entry points. Do not serve the private journal as website content.

Use one operator writer on a durable local volume. Ephemeral hosted filesystems and multiple hosts sharing this adapter are unsupported. Separate API and operator machines need a reviewed durable catalogue distribution step. The acknowledgement variable is not evidence that a volume or restore procedure has been verified.

Both provisioning variables must be configured together. Only a literal loopback HTTP address with the exact `/api/direct/fixtures` path is accepted. With neither variable, the worker retains its existing result and closure duties without creating new markets. Keep current and archived public registries separate, but use the same private operator directory and one worker for all configured generations. Two workers using the same wallet in separate journal directories would bypass shared input reservations and are unsupported.

## Earlier automatic funding mode, currently paused

Bulk creation is retained for historical operation and recovery. The owner selected demand creation instead. Do not enable bulk catalogue/progress provisioning while running the approved sponsored flow.

The worker loads the active real provider's schedule and coverage window from `/api/direct/fixtures`. It rejects a simulated, disabled, foreign, malformed or stale catalogue. Every future scheduled fixture is retained in the durable queue, not just the first funded page. Before signing, it fetches that exact fixture directly from API-Football and checks provider identity, teams, kickoff and scheduled status against the queued entry. Partial provider coverage remains visible as partial coverage.

The queue is stored at `STREAK_DIRECT_OPERATOR_DIR/provision-v2/queue.json`. Public progress is written separately to `STREAK_DIRECT_PROGRESS_DIR/provisioning.json` and served at `/api/direct/provisioning`. It includes queued, confirming, funded, expired, withdrawn and blocked counts, per-fixture states, catalogue coverage and reserve requirements. It contains no key or signed transaction bytes. These are observed provisioning states; the wallet still verifies the actual cells before spending.

Each market reserves **3,050 testnet CKB**, five cells of 610 CKB. For example, 196 markets require **597,800 testnet CKB** of market reserves, plus deployment funding, network fees and valid operator change. Reserves are locked capacity, not a claim that all of this is burned as fees. The current builder needs a sufficiently large plain funding cell; a high aggregate balance spread across small cells may require separate consolidation. Progress labels its observed balance as one bounded 64-cell page, not the wallet's total capacity, and reports an estimated reserve shortfall when that observation is current.

At most one market creation is attempted per invocation. The next funding signature waits for four canonical confirmations of the prior operator spend. A queued fixture is not presented as funded, and the 256-market limit leaves the remaining queue explicitly blocked. Insufficient capacity likewise remains visible and retries after funding becomes available. Increasing or archiving these bounds requires a reviewed migration that preserves all funded mappings and exits.

An individual upstream fixture failure gets a five-minute retry delay so later fixtures can proceed. A missing or stale catalogue pauses new creation while existing result and refund processing continues. If a creation was signed before interruption, the next cycle reconciles its exact saved hash; it never creates a replacement market for the same operation. Unknown or conflicting funding spends stop new signatures across all configured generations.

## Deployment funding and generation recovery

Deployment uses the same operator wallet and spending barrier. Before broadcast, the deployment helper must durably save `STREAK_DIRECT_OPERATOR_DIR/deployment-v2.json` with the pinned `protocolHash`, `transactionHash`, `signedTransaction` and `createdAtMs`. `loadOperatorDeployment` validates bounded bytes, the exact transaction hash and an output containing the pinned protocol binary. `operatorFundingBarrier` prioritizes this sentinel and requires four current canonical confirmations before another new financial signature. `assertFreshOperatorInputs` also reserves its original inputs against replacement signatures after a reorg.

Deployment must acquire the shared operator journal lease, check the funding barrier and existing input reservations, persist the signed sentinel, then broadcast only those bytes. If submission becomes uncertain, reconcile the saved hash and inputs. Do not delete the sentinel, rebuild a different deployment or restart funding blindly. The exact deployment transaction and generation-specific dependency pins must match the delivery record. A deployment sentinel remains a recovery obligation after code activation; do not discard it when upgrading generations.

Original operation files retain names such as `create-api-football-ID.json`. Compatible operations use `create-v2-api-football-ID.json`, with matching `report-v2-` and `close-v2-` names. Their descriptors use `direct-ID` and `direct-v2-ID` respectively. The automatic worker discovers all configured generations from the shared journal and chooses each descriptor's exact protocol configuration. Original signed bytes and funded mappings are never rewritten.

For a manual original-generation command, use a separate terminal with `STREAK_DIRECT_REGISTRY_DIR` pointing to the archived original catalogue and the same shared operator directory. Check `status` and the expected generation before mutation. A current-generation command uses the new catalogue. Do not copy an original mapping over the current mapping or infer generation from the football fixture ID alone.

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

The worker handles lifecycle duties before provisioning. It selects at most four due markets per invocation, serially, with deadline ordering and a durable round-robin cursor. Future kickoffs consume no lifecycle RPC or provider slots. Closed markets are revisited after fifteen minutes for fresh chain checks. It reconciles existing jobs, gathers real results, reports, settles or voids, then attempts one queued creation when enabled. A selected reporting market normally makes one provider read; a newly prepared creation performs two exact fixture reads, including a final check before broadcast. Each network request has a 15-second timeout; chain reads and transaction sizes are also bounded.

Four due records and one creation are work budgets, not a one-minute completion guarantee. An overlapping invocation fails the worker lease. If all 256 current markets become due together, one lifecycle round still needs 64 successful invocations; future markets do not add that delay. Creation also waits for confirmations and can require hours for a large catalogue. Monitor actual deadline coverage and funding progress before inviting a cohort. Closed markets remain discoverable for claims; do not delete funded mappings to improve polling speed.

The worker holds only `worker-lease/operator.lock` while scheduling. Each signing command separately acquires the shared journal's `operator.lock`, then releases it before returning. The worker does not acquire that mutation lease around a recursive `runOperator` call. This permits the serial workflow while excluding a competing signer. A local supervisor can invoke `--once` repeatedly without registering a service; stopping that supervisor or suspending the computer stops automated processing.

Provider failure cannot become a winning result and does not disable the timeout path. Pending, rejected, conflicting or uncertain signed jobs need review. The worker never assumes that an unknown broadcast failed and silently creates another spend. Monitor failures and deadline coverage. No worker is started by the API or installed as a service by this change.

## Restart, backup and conflicts

Back up the durable journal, deployment sentinel, provisioning queue, provider observations and all catalogue generations together. Public progress can be regenerated from those records and fresh chain observations. Signed bytes are public transaction material, but retain restricted filesystem permissions. Keep signing keys in separate secret configuration, outside source control and these state files.

Each financial operation has an immutable signed entry. After a timeout or restart:

1. Run `reconcile FIXTURE_ID` and inspect the original hash, canonical checkpoint and current inputs.
2. Wait for pending transactions and canonical confirmations.
3. If all original inputs remain live and the action is still time-eligible, rerun the original command with `--broadcast` to resend exactly the saved bytes.
4. If inputs are spent while the hash is absent, or a node reports rejection, preserve the journal and investigate canonical consuming transactions. Do not delete the journal to force another spend. Automatic conflicting-transaction replacement is not implemented.
5. Recheck actual chain state after a reorg. A cached committed flag is not entitlement.

The funding barrier applies to creation, reporting, closure and the deployment sentinel. It derives dependency links from actual signed input outpoints and verifies the last transaction on every independent branch. A canonical descendant proves its referenced ancestors; a later timestamp alone proves nothing about an unrelated wallet spend. All unresolved operations are reconciled too. Reads run in batches of at most four, with sequential journal and catalogue writes and an overall 1,536-operation bound. Every independent branch is checked before the barrier clears, so many independent funding cells can increase a cycle's duration.

Before a new signature, every proposed input is also compared against immutable signed entries in all configured generations. An input that belonged to another signed operation cannot be silently reused after a reorg, even if an older observation had called that operation committed. This policy can require manual recovery review; it deliberately avoids automatic replacement signatures.

A signed creation that remains unconfirmed after its pinned kickoff, or a signed report that remains unconfirmed after the six-hour reporting window, needs manual intervention. Expiry does not cancel signed bytes or release their input reservations. Automatic creation/report resubmission stops when the applicable window closes; the worker cannot silently discard the operation or issue another signature using its funds. Preserve the journal, inspect the canonical original and consuming transactions, and resolve the case before resuming operator funding. An independent keeper can still use the permissionless closure path with its own wallet and journal.

Mutation leases fail closed after a crash. Operator `status` and `reconcile` remain available without that lease. Verify that the old process has stopped and no replacement is running before manually removing an orphan `operator.lock`. The worker lease is under `worker-lease/operator.lock`. There is no automatic stale-lock deletion that could race another process.

This is a single-operator file adapter. Replicated workers need transactional jobs, leases and fencing in PostgreSQL or another reviewed coordinator.

The file adapter flushes signed file contents before publishing their names and uses atomic file publication or replacement. Tests demonstrate process interruption and restart recovery. Windows directory-entry flushes are not implemented, so this does not establish durability through host power loss or storage failure. Keep tested backups and verify the actual filesystem and restore procedure before treating this local adapter as hosted infrastructure.

## Owner recovery without the API

Export recovery JSON from Activity. It includes the pinned manifest, fixture descriptors, public owner hash and saved ordinary, sponsored and atomic records. It contains no private key. Retain it before clearing browser storage or changing devices. The standalone tool below imports descriptors and ordinary signed transactions for independent claims and exact retries. It does not import or co-sign the additional sponsored or atomic partial-record arrays; retain those backups and use the connected browser and sponsor recovery for incomplete combined payments.

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

After building the product, replace `FIXTURE_ID` with the numeric fixture ID and `MARKET_ID` with the exact generation-specific market ID in the export:

```powershell
$env:STREAK_RECOVERY_BUNDLE = (Resolve-Path .\streak-testnet-recovery.json).Path
$env:STREAK_RECOVERY_FIXTURE = 'api-football-FIXTURE_ID'
$env:STREAK_RECOVERY_MARKET = 'MARKET_ID'
$env:STREAK_DIRECT_OPERATOR_DIR = Join-Path $env:LOCALAPPDATA 'StreakRecovery\keeper-journal'
$env:STREAK_DIRECT_REGISTRY_DIR = Join-Path $env:LOCALAPPDATA 'StreakRecovery\keeper-catalogue'

@'
const { readRecovery } = require('./products/streak/scripts/direct-claim.cjs');
const { DirectRegistry } = require('./products/streak/dist/modules/direct/registry.js');
(async () => {
  const bundle = await readRecovery(process.env.STREAK_RECOVERY_BUNDLE);
  const market = bundle.markets.find(row => row.fixtureId === process.env.STREAK_RECOVERY_FIXTURE && row.id === process.env.STREAK_RECOVERY_MARKET);
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

## Sponsored first prediction

The owner replaced bulk creation with demand-driven creation on 16 October 2026. Keep existing markets and their lifecycle worker. Disable the worker's bulk catalogue/progress configuration when using sponsored creation. The separate sponsor process still needs the real fixture catalogue for verification.

Build the product, then launch `node products/streak/scripts/direct-sponsor.cjs --serve` in a separate process with explicit configuration:

- `STREAK_DIRECT_OPERATOR_DIR` and `STREAK_DIRECT_REGISTRY_DIR`: absolute durable directories. Share the operator journal with the lifecycle worker so both use the same funding lease.
- `STREAK_DIRECT_PRIVATE_KEY` and `API_SPORTS_KEY`: available only to the operator process. The API process must never receive the signing key.
- `STREAK_DIRECT_CATALOGUE_URL`: the running app's `/api/direct/fixtures` endpoint.
- `STREAK_SPONSOR_URL`: an explicit loopback HTTP origin, such as `http://127.0.0.1:4101`.
- `STREAK_SPONSOR_IPC_SECRET`: a separate random 32-byte secret encoded as 64 lowercase hexadecimal characters. The API and sponsor share this credential; browsers never receive it.
- `STREAK_DIRECT_DURABLE_STATE_ACK=1`: required in production after verifying the actual storage configuration.

Configure only the sponsor URL and IPC credential in the API process. Browser requests use the normal authenticated same-origin API. The sponsor independently verifies the fixture, wallet signature and both parties' net contributions. One transaction creates the market and its first pending prediction. Streak supplies 3,050 CKB; the bettor supplies principal, 321 CKB position storage and the reviewed network fee. Admission still checks the committed creation block against kickoff.

An unsigned offer holds a short reservation. Ready result or closure work can cancel it. A received user signature creates a recovery obligation: preserve its exact bytes even after the offer expires or an HTTP response is lost. Public status reads cannot add a signature or broadcast. The separate operator recovery cycle resumes accepted submissions and reconciles completed transactions.

Do not delete journals or manually free inputs after an uncertain submission. A replacement first bet requires verified canonical conflicting-spend evidence and sponsor-input ancestry that makes competing creations mutually exclusive. Every signed attempt remains available for audit and recovery. Recovery work is bounded; exhausted ancestry or indexer-history limits need operator investigation rather than an automatic fresh signature.

Canonical publication stores immutable descriptors under `instances/<fixture>/<creation-hash>.json` and proof events under `selection-history/<fixture>/`. A verified reorganisation may change the active fixture mapping; it does not rewrite those historical files. Publication uses `.canonical-selection.lock` in addition to the operator lease. After a process crash, verify the recorded process has stopped before removing only its stale lock. Never remove a live process's lock or an uncertain transaction record to make checkout proceed.

Contract deployment, local service activation, successful public first bets and hosted operation are separate evidence. The [sponsored delivery record](../delivery/sponsored-creation.md) records the earlier v3 release; the [atomic correction](../delivery/atomic-slip-correction.md) records current v4 work. Keep enough plain operator capacity for each 3,050 CKB reserve plus change and lifecycle fees. No grant or campaign reward budget is implied by this testnet sponsorship.

## Atomic v4 entry

Configure `STREAK_DIRECT_BATCH_REGISTRY_DIR` as a separate absolute public-catalogue directory in the API, sponsor and lifecycle-worker processes. It must differ from the private operator directory and the earlier public catalogue. Keep the same private operator journal and signing lease for all generations. The existing sponsor service hosts v3 and v4 paths, storing their offers separately under `sponsored-v3/` and `atomic-v4/`. Do not run an independent second signer with a separate journal against the same funding wallet.

The browser uses `GET /api/direct/batch/config` and `GET /api/direct/batch/demand` for pinned configuration and eligibility. Offer, submit, resume and conflict-resolution requests require the authenticated same-origin wallet session. Status is read-only and cannot sign or broadcast. Each quote freezes one through eight fixtures, outcome and principal per line, input order, every output group, dependency order, contributor change, fee and expiry. The browser independently verifies the quote against live chain state.

The sponsor supplies 3,050 CKB for each new market; the owner supplies total principal, 321 CKB storage per line and the network fee. Admission checks the previous pending ticket against its actual creation header. A stale shard, unavailable fixture, competing reservation or insufficient reserve blocks the complete quote. Limits remain four shards and eight positions per shard per market. Sponsor capacity is finite and a fragmented balance can still lack a suitable funding cell.

An unsigned quote lasts at most 90 seconds, with a two-minute preparation margin before the earliest kickoff. Owner review can expire sooner. These application checks do not create a consensus upper time bound: actual late entries retain the protocol refund path. Financial browser API calls allow 60 seconds for bounded multi-fixture work; ordinary reads retain 15 seconds. Neither a timeout nor quote expiry releases a signature once submission was attempted.

Before submitting a partial signature, the browser persists its exact bytes, hash, all reserved inputs and source draft identities. The operator verifies the owner's signature before adding its own and saves completed bytes before broadcasting. Recovery uses original identities after reload or lost responses. Three confirmations establish the browser's local canonical checkpoint; sponsor funding and conflict-proof release require four. Canonical proofs are checked again after reorganisation. An orphaned proof restores reservations, and a subsequently canonical original transaction takes precedence.

Activity exposes combined recovery and each market's independent claims. Confirmed payments remove only unchanged source draft picks; newer selections remain. The ordinary, v3 and v4 browser stores share atomic input reservations. Do not delete or manually modify a journal to make a new payment possible. If a partial was never submitted and its offer expired, the explicit browser discard path checks read-only operator status before retiring it. Submitted or uncertain partials cannot use that path.

Multiple v4 markets can share a creation hash, so retain every descriptor's complete type script and genesis output index. Back up all public registries, immutable instance histories, canonical selection proofs, operator jobs and both sponsor directories together. Recovery and rollover must not infer a market solely from its football fixture ID or creation hash.

Current evidence is 149 VM checks and 37 actual local-devnet product checks plus three harness checks. Native and genuine OmniLock signatures cover eight-new, mixed and eight-funded payments, independent claims, refunds and real reorganisation. The public v4 transaction proves code deployment only. The 47-step major gate and local activation passed. Supported physical-wallet checks and durable operation remain separate requirements.

## Isolated evidence

Five backend groups pass: registry and entry gating; strict raw provider evidence; durable journal and unknown/reorg recovery; report boundary and exact payouts; bounded worker scheduling. HTTP checks cover pinned public config, `no-store`, invalid queries, origin enforcement, source unavailability, unchanged legacy data and malformed registry failure. Four standalone recovery tests cover immutable bytes, restart observations, lock exclusion, import integrity, live-network test isolation and canonical conflict-proof recovery after a reorg.

Seven isolated provisioning groups cover strict catalogue/source validation; all-fixture persistence and explicit 256-market overflow; reserve/shortfall accounting; serial creation and exact-byte restart recovery; capacity failures, per-fixture backoff and due-market priority; four-confirmation barriers and generation preservation; independent funding branches, including an older orphan beside a newer canonical job and more than four independent branches; and deployment-sentinel reorg recovery. Backend TypeScript passes. The complete applicable gate and compatible-contract evidence are tracked separately in the delivery report.

These tests use synthetic local fixtures and stubbed chain reads. Native devnet and separately authorized public-testnet evidence must be reported separately. This runbook does not prove that a worker, real football market, hosted volume or backup is deployed.
