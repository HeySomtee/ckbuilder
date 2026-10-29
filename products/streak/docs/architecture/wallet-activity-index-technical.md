# Wallet activity index: engineering notes

28 October 2026. **Approved architecture; implemented locally.** Read the
[delivery record](../delivery/event-driven-activity.md) for exact scope, bounds and
verification. These notes retain the original engineering design; longer-term
targets are not claims of implemented or hosted performance.
Owner refinement on 28 October: application/verified-chain events are the primary
update path. A durable consumer waits for queued work rather than repeatedly
scanning all markets. Bounded reconciliation remains a recovery mechanism.
The owner wants fast open bets, refunds and history, and early reads after sign-in
so navigation feels ready. This document recommends a durable owner index and
bounded startup prefetch. It does not change deployed contracts, claim authority,
production settings or existing wallet recovery records.

A separate [small startup warmup](../delivery/activity-startup-warmup.md) is now
implemented locally for two recently saved markets. Its verified scope and limits
are documented there. The durable index, API and app-wide targets below remain
unimplemented; warmup alone does not solve first-device or full-history latency.

## Recommendation and CKB boundary

Keep CKB authoritative for funds. Add a centrally served, rebuildable read index
that maps an authenticated wallet's full lock hash to its positions, claims and
refunds. The screen reads that index instead of searching every market whenever
someone opens Activity. The claim builder still checks the selected live cell
and its exact owner/amount before asking for a signature.

A Solidity-style mapping cannot simply be added to the existing CKB scripts.
CKB stores state in immutable cells; updating a cell consumes it and creates a
replacement. Scripts validate those transitions. A single global registry cell
updated by every bet or claim would introduce one shared input, so unrelated
transactions would contend for it. That serialization is an architectural
inference from the cell model, not a measured claim about this deployment.
[Official cell model](https://docs.nervos.org/docs/ckb-fundamentals/cell-model),
[CKB programming model RFC](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0002-ckb/0002-ckb.md).

CKB already provides indexed cell and transaction queries. Streak needs a
protocol-aware owner projection on top: the current open tickets encode owner
hashes inside shared shard data, while finalized tickets become independent
claim cells. A plain wallet-lock query cannot reconstruct every open position.
The official indexer indexes live cells and transactions; its integrated node
implementation is preferred over the legacy standalone deployment.
[Official indexer repository](https://github.com/nervosnetwork/ckb-indexer).

A future user-owned position-cell design could improve native discovery, but
would change storage cost, atomic entry, admission, settlement and compatibility.
That requires a separately reviewed contract version and migration. It is not a
prerequisite for fixing today's Activity latency. The present v4 claim path
deliberately has no shared claim counter or backend approval dependency
(`contracts/direct-v4/contracts/protocol/src/main.rs`, claim branch near line 446).

## Current source evidence

| Source                                                                   | Current work and consequence                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/src/features/direct/activity.tsx`, observation queries near line 92 | Starts with eight descriptors; each calls `client.discover`. Queries refresh every 60 seconds, use 60-second freshness and do not poll in background. Fixture metadata adds a query per chosen descriptor.        |
| `web/src/features/direct/client.ts`, `discover` near line 193            | A three-wide discovery queue limits simultaneous markets. Each operation rechecks wallet identity and parses the descriptor.                                                                                      |
| `web/src/features/direct/discovery.ts`, `loadMarket` near line 65        | Reads genesis transaction and canonical header, checks genesis layout, queries indexed live cells, then independently checks each live cell with four concurrent readers.                                         |
| `web/src/features/direct/discovery.ts`, `discoverMarket` near line 162   | Emits a partial live snapshot, then scans up to 96 history records per market; reads transactions and canonical headers, followed by predecessor evidence for claims and late refunds.                            |
| `web/src/features/direct/read-session.ts`                                | Deduplicates identical RPC calls only within one observation. There is no durable shared history index. Cancellation checks prevent stale UI updates, but do not abort every already-running SDK request.         |
| `web/src/features/direct/ui.tsx`, catalogue and saved-descriptor merge   | Known markets come from the operator registry and browser journals. All known markets can be candidates even when the wallet never participated. Missing descriptors remain undiscoverable.                       |
| `web/src/main.tsx`                                                       | React Query cache lives in memory, with a five-minute garbage-collection window. A page reload loses the observed portfolio snapshots.                                                                            |
| `web/src/app/app.tsx`, account query and wallet restore                  | Server account read and silent wallet restoration already exist. The new bounded warmup prefetches two saved markets after authenticated wallet restoration. A server-backed portfolio request is still proposed. |
| `src/modules/direct/pools.ts`, `PublicPoolCache`                         | Public market totals already use an optional nonblocking four-reader cache, up to 512 markets and 180 in-memory points. It resets on API restart and is not a durable wallet index.                               |

Eight selected markets can generate up to 768 indexed history records before
deduplication, plus headers, live cells and predecessor reads. That is a bound
derived from source, not an observed request count or timing measurement.
Progressive snapshots help perceived speed but do not remove this repeated work.

## Durable read model

Use PostgreSQL, which already owns read models in the approved architecture.
Keep its tables and migrations separate from legacy ledger liabilities and Five
credits. Use exact integers/decimal strings for shannons. All identifiers include
network and contract generation; a fixture name or provider ID is not contract identity.

Proposed tables:

- `direct_index_markets`: network, complete type-script hash and descriptor,
  creation transaction, fixture binding, protocol version and indexing status.
  Accept only the application's validated registry. Do not let arbitrary user
  submissions define an oracle or inject an untrusted market.
- `direct_index_positions`: stable position ID, market identity, owner lock hash,
  outcome, principal/storage, origin transaction/outpoint, current shard/claim
  outpoint, lifecycle status, settlement outcome, observed return amount and
  evidence block number/hash. Distinguish submitted, admitted, claimable,
  claimed and automatically refunded states.
- `direct_index_events`: unique canonical event key, position identity,
  transaction hash, block number/hash, transaction/output ordering, event type
  and sufficient validated evidence for deterministic replay.
- `direct_index_checkpoints`: network plus stream/market identity, last committed
  block number/hash, scan position, registry version, decoder version, lag and
  completeness. Include a bounded retained block ancestry for rollback.

A stable position identity must follow its **birth deposit outpoint and ticket
slot through replacement shards**. Do not key by owner/outcome/amount alone:
identical repeated stakes are distinct obligations. Atomic outputs have market
offsets; do not assume the first output belongs to every market. Claims and
replacement/closure refunds must attach to the original position only after
validating exact lineage and payout ownership.

Start with indexes on `(network, owner_lock_hash, lifecycle, updated_block DESC,
position_id)` and `(network, market_type_hash, origin_tx_hash)`. Use a unique
event constraint for idempotency and an outpoint lookup for spends. Final index
selection must follow query plans and representative data, not assumed volume.

## Event delivery, restart and reorg behavior

Source audit on 28 October identifies the existing handoff points:

- `OperatorJournal.persist` saves operations before broadcast and `record`
  appends observations (`src/modules/direct/journal.ts`).
- `SponsorService.submit`, `finish` and `reconcile` track submission and canonical
  funding; `BatchService` inherits this flow (`sponsor.ts`, `batch.ts`).
- `recordReconciliation` handles create/batch/report/close observations in `cli.ts`.
- Browser `DirectClient.broadcast` can submit a claim directly to CKB. A server
  event cannot be assumed merely because its browser callback completed.

Emit public projection events for submitted payment, canonical market creation,
verified ticket admission, report confirmation, settled claims, collected returns
and automatic refunds. Market creation registers a descriptor; it does not assign
positions to users without verified deposits. One atomic transaction may create
several markets and positions. Preserve all original output/ticket identities.
Committed deposits still need protocol admission checks. Report confirmation is
separate from settlement/claim creation; do not make a reported winner collectible
before the claim exists.

The current private file journals and PostgreSQL are not one atomic transaction.
A relay inside the existing operator trust boundary should derive public event
IDs and metadata from durable journal observations, send them to an authenticated
receiver, and replay after interruption until acknowledged. Do not expose private
journal files, keys or signed bytes to the web API/read index. Persist a unique
event receipt and its projection updates together in PostgreSQL. Duplicate and
out-of-order delivery must be safe; an older observation cannot regress a newer
canonical state without verified rollback evidence. A memory callback or database
notification alone is not durable delivery. Avoid adding a separate message broker
unless evidence shows the existing durable storage cannot meet the workload.

An authenticated browser transaction hint can schedule verification, but cannot
mark a bet accepted or a claim collected. Check the exact transaction, protocol,
owner, inputs/outputs and canonical evidence before updating financial status.
Lost callbacks and outside-app spends still require targeted chain observation.

1. Bootstrap each registered market once from its creation transaction. Validate
   the descriptor and supported protocol before decoding. Record incomplete
   history explicitly if provider pagination/availability prevents a full scan.
2. Durable events wake an incremental consumer for the affected transaction,
   market and owners. Verify canonical evidence and apply dependent changes in
   chain order. Track pending transactions and known unspent claims. A shared
   chain notification, where the configured provider supports it, can trigger
   bounded verification; the notification itself does not prove acceptance.
3. Commit evidence, position updates and checkpoint atomically in one database
   transaction. On restart, resume the committed cursor. Duplicate observations
   are harmless. Never place signing keys or signed transaction bytes in this index.
4. Check the checkpoint's block hash against the current canonical chain. On a
   mismatch, find the common ancestor, roll back/replay affected projections and
   invalidate corresponding owner caches. During reconciliation, label affected
   values stale and withhold claim-ready assertions.
5. Keep unconfirmed payment hints separate from confirmed positions. A broadcast
   does not make a pending ticket admitted; a committed claim transaction does
   not become irreversibly final just because the screen cached it.
6. Retain replay evidence after reserve cleanup and claim spending. Never infer
   a refund merely because an outpoint vanished. Use the protocol's exact
   replacement/closure refund rules and canonical recipient outputs.

Reconciliation runs after restart/reconnect, for due pending transactions,
stale/incomplete records and contradictory chain observations. Use backoff and
bounded batches; a low-frequency safety sweep covers outside-app spends and
missing signals. Revisit recent block ancestry so reorgs can undo events already
applied. Historical backfill uses saved cursors, rather than repeating a full scan
on each event or page request. Provider notification capability remains to be
verified; fall back to bounded incremental reads where unavailable. No hosted
subscription support or polling interval is assumed by this proposal.

## API, authorization and claim freshness

Proposed `GET /api/activity` returns a cursor-paginated owner projection with
summary totals, rows, fixture labels, last indexed block/time, stale flag and
coverage. The server derives owner lock identity from its verified session;
an arbitrary request address must not select another account's private view.
Use private/no-store HTTP responses unless a cache is explicitly partitioned
by authenticated owner and network. Include the requested account identity in
the response so the client can reject a delayed result after account switching.

Cache records are discovery/display data, not spend entitlements. For a selected
collection, retain `DirectClient.prepareClaim` and `revalidate`: live outpoint,
canonical confirmation, supported descriptor, exact full owner lock hash,
recipient, capacity, fee/change, account revision and pending-signature guard.
An index mismatch refreshes that row with an actionable status. It must not
authorize another signature or block unrelated verified rows behind a full scan.
`web/src/features/direct/client.ts` already enforces these checks near lines
408 and 490; preserve and regression-test them.

Display old observations immediately with **Last updated** context while a
bounded refresh runs. Failed refresh must not convert a prior position into
zero or claimed. Provide an explicit recovery scan for unavailable/incomplete
index coverage, using the existing validated catalogue and browser journal.
Cross-device discovery improves only for descriptors indexed in that deployment;
this does not silently merge local and hosted registries or fantasy databases.

## Startup and navigation prefetch

Begin useful reads when the server session resolves to a verified account,
independently of a wallet extension becoming available. Read-only portfolio
display must not require a signature or a fresh wallet connection. Restore an
already authorized provider in parallel for later actions using existing rules.

Proposed initial budget:

- One account/session request, then one portfolio page of at most 25 rows.
- At most two additional background reads: current game summaries and the
  currently visible fixture range. Do not preload every player profile, every
  market's chain state or every future gameweek.
- Two speculative requests at a time, pause while offline/hidden, deduplicate
  through React Query and cancel/ignore obsolete account-scoped results.
- Prioritize direct user actions over speculative refresh. Invalidate only
  affected owner/market/round keys after payment, claim or entry mutation.
- Prefetch a destination's code/query on navigation intent when useful; avoid
  eagerly importing the full wallet/chain SDK for anonymous browsing.

The splash follows initial shell readiness. It may overlap prefetch, but must
not impose an artificial minimum delay or wait for every RPC, wallet, image or
game feed. A slow portfolio shows its own snapshot/skeleton and retry controls
after the shell opens. Reduced motion changes presentation, not data semantics.

Persisting a last-observed portfolio in IndexedDB is optional and requires
explicit account/network partitioning, timestamp/coverage fields, bounded
retention and sign-out clearing. It must not share the signed recovery journal's
authority or replace reconciliation. Start with server persistence and memory
query reuse before introducing another persistent client store.

## Other expensive operations to address

| Area                              | Proposed change                                                                                                                                                                                              | Boundary                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Public pool charts                | Retain bounded cache; persist sampled history/checkpoints if chart continuity is needed; refresh active markets before closed history.                                                                       | Cached shares never authorize a stake or claim.                                                     |
| Wallet balance                    | Reuse one account-scoped balance query with single-flight refresh; mark stale values; invalidate after confirmed funds movement.                                                                             | Do not reuse cached spendable cells as transaction funding authority.                               |
| Five rewards                      | Measure and add wallet-scoped PostgreSQL indexes for pending credits and payout history. `rewards.ts` queries `wallet` and `created_at`, but current table creation only supplies PK/transaction uniqueness. | Use reviewed migrations and concurrent-access tests; preserve locked payout queues and idempotency. |
| Five scouting and fixture outlook | Share server feed caching and client query keys; lazily fetch player history; prefetch only the selected squad/profile.                                                                                      | Real availability and source timestamps stay visible.                                               |
| Survivor                          | Fetch active competition summary/picks once; reuse after navigation; invalidate the edited competition rather than every game.                                                                               | Privacy before lock and authoritative database deadlines remain enforced.                           |
| Payment preparation               | Deduplicate immutable protocol/descriptor work and reuse short-lived public metadata. Measure provider discovery separately from chain reads and signing.                                                    | Fresh inputs, ownership, cutoffs and exact signed intent still require validation.                  |

## Incremental rollout and acceptance

1. Instrument current cold/revisit latency and RPC counts with isolated delayed
   fixtures. Separate session restoration, live positions and full history.
2. Add the durable event relay, deduplicating consumer and read index behind an
   internal feature flag, shadowing existing discovery. Compare results before
   changing the display source. A shadow
   mismatch cannot change claim or refund behavior.
3. Add authenticated paginated API and prefetch. Render index snapshots with
   freshness/coverage; keep the existing direct scanner as recovery fallback.
4. Keep live claim checks, add per-row refresh, then verify with controlled
   local-chain and PostgreSQL scenarios. Obtain independent money/identity/
   recovery review and run the required major gate before activation.
5. Observe a hosted testnet payment, settlement, win/loss collection and
   cross-device revisit on the exact released revision before broader rollout.

Proposed performance targets, **not current results or promises**:

- Warm Activity shows cached rows within 150 ms of navigation under the measured
  browser setup; index API p95 below 300 ms on representative pilot data.
- Cold signed-in Activity requires one portfolio request, independent of the
  count of unrelated markets; page rendering does not await historical RPC fan-out.
- Slow/failing chain reads preserve the indexed snapshot, label age/coverage and
  expose retry within one second. Funds actions remain paused until their own
  fresh validation succeeds.
- Repeated navigations within freshness windows add no duplicate portfolio
  request; a mutation refreshes only affected queries. Measure on desktop and
  narrow mobile with 250/500 ms injected RPC latency and a failed market.
- Publish measured worker lag, database latency, cold/warm UI timings, response
  size and provider call counts. Set service targets from those observations;
  do not call blockchain reads instantaneous.

Required correctness scenarios: empty wallet versus unavailable index; identical
repeated tickets; atomic multi-market output offsets; accepted versus late pending
entry; win/loss/void/empty-winner claims; replacement and closure refunds; spent
reserve; already collected claim; duplicate block delivery; crash between read
and commit; cursor replay; shallow and beyond-retention reorg; deleted/unavailable
registry descriptor; malformed provider response; cross-owner pagination;
account switch/logout during prefetch; stale client mode/network; index tampering
rejected by live claim validation; insufficient fee capacity; and existing signed
payment recovery after index restart.

Event-specific scenarios: crash after chain acceptance but before notification;
crash after database commit but before acknowledgement; lost wake-up; duplicate
or out-of-order events; one atomic payment across several markets; browser closed
after claim broadcast; external claim spend; source replay after relay restart;
forged browser completion; stale report versus actual claim creation; and reorg
rollback followed by canonical replay. Recovery must not resubmit a payment
merely because its display event was missing.

Use only disposable PostgreSQL and isolated local chain/adapters for automated
tests. Existing local/hosted operational keys and football credentials are not
test fixtures. This proposal intentionally makes no runtime or contract change.
