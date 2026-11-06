# Concurrent payments and settlement

1 November 2026. **Proposal for owner review, not an implemented or approved migration.**
Source baseline: `4c71507`. The local payment-message edit is separate.

Revised after owner review: cover the whole payment journey, not only the global
queue. The [larger-market design](payment-protocol-vnext.md) now supplies a concrete
settlement candidate and its proof obligations. Neither document is a claim that
the proposed throughput or new scripts have been verified.

## The decision in plain language

### Deferred funding-selection fix, 3 November

Owner requested recording this for later implementation with payment concurrency:

- Allow one sponsored slip to combine several eligible sponsor cells when no
  single cell covers the reserve. This is distinct from allocating separate
  cells to concurrent payments. Prefer bounded selection within the payment;
  do not require manual consolidation as the normal user workflow.
- Reserve every selected input atomically, exclude pending/reserved inputs, and
  preserve signed recovery and creation-lineage protections. Update builder,
  wallet verification, journals and change accounting together; preserve v4's
  first-input market identity and transaction-size/input limits.
- Review user-wallet fragmentation handling: the existing collector combines
  up to 16 user inputs and inspects up to 256 candidates. Distinguish insufficient
  funds from selection-limit failures; do not simply remove safety bounds.
- Acceptance must cover sufficient aggregate funds spread across smaller cells,
  genuinely insufficient funds, concurrent reservations, accurate sponsor/user
  change, fee bounds, restarts and recovery without double spending.

The hosted incident demonstrated the sponsor's one-cell restriction. The owner
subsequently sent 100,000 tCKB, observed as a single live sponsor cell at
08:56 UTC on 3 November. That replenishment is not an implementation of this fix
or evidence that the original slip completed. No fund movement or implementation
is authorized by this backlog entry.

### Proposed implementation stages

Replace the service-wide payment barrier with reservations for the **specific
funding and market cells each payment needs**. Alice waiting for her wallet must
not prevent Bob paying into an unrelated match. Several bettors on the same
match must receive different available deposit cells.

The current scripts can support this first improvement. They cannot support an
arbitrarily busy market: v4 has **four deposit cells and at most 32 positions per
market**. Four independent payment lanes are useful concurrency, but they are not
a high-volume market architecture. That limit must be visible in the launch plan.

I recommend two separately accepted deliveries:

1. **Remove global blocking on v4.** Build durable per-cell allocation, multiple
   independent sponsor funding cells, concurrent workers and safe recovery. Keep
   the current economics and existing positions unchanged.
2. **Introduce a reviewed market version for larger demand.** Support market
   initialization without a first bettor, a larger explicitly bounded set of
   deposit lanes, and a settlement design that can actually close that capacity.
   Do not call delivery 1 the completion of the scaling work.

Both sponsor-funded creation and ordinary deposits need this treatment. Increasing
server size, adding worker processes, or improving the error message alone does
not remove shared-input contention.

### What the complete delivery should feel like

- Different people can approve payments at the same time, including predictions,
  game sponsorships and prize funding. Nobody waits for an unrelated wallet prompt.
- A popular match has multiple independent entry lanes. Larger markets are created
  before demand arrives, within the treasury budget, rather than depending on the
  first bettor to establish them.
- An abandoned unsigned review releases only its own safe reservations. A signed
  payment continues recovering after navigation, disconnect or server restart.
- Results move each market through bounded settlement jobs. Once funded, a user's
  claim does not wait for other winners to collect.
- Activity reads saved, continuously updated records. Chain checks happen where
  spending needs verification, not as a prerequisite for drawing every page.

"Smooth" means short preparation, isolated waits, preserved progress and reliable
recovery. It cannot mean no chain-confirmation time, unlimited market capacity or
that one wallet can spend the same CKB cell twice. These constraints must appear
in the UI at the action they affect.

### One recommended path

Keep the final Streak co-signature for the first concurrency release. It provides
a cancellable review window before Streak commits to signing. Supply independent
sponsor cells so this authorization does not create a global queue. Do not remove
it merely to reduce a signature count the user does not see.

For the new market generation, prototype **pre-created lanes with bounded tree
settlement**: seal lanes independently, combine their verified totals and funds,
then split them into independently funded claims. This keeps one common market
pool without requiring all bets or all claims in one giant transaction. The
[companion design](payment-protocol-vnext.md) explains the construction, its limits
and the review required before choosing final lane counts.

Deliver the allocator first because it improves existing markets and is needed by
the new protocol too. The project is not finished at that intermediate release:
larger-market settlement, game treasury concurrency and measured wallet acceptance
remain explicit completion milestones.

| Situation                                        | Required experience                                                           | Actual constraint                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Two users, different funded matches              | Both review and approve independently                                         | Separate owner, deposit and any sponsor inputs                        |
| Several users, one funded match                  | Allocate distinct free deposit lanes concurrently                             | v4 has four lanes; full or occupied lanes require a truthful wait     |
| Users creating different matches                 | Separate sponsor allocations proceed together                                 | Available sponsor cells, capacity budget and chain limits             |
| Users creating the same new match                | One canonical creation; others keep their drafts and wait only for that match | v4 creation needs the first bettor and confirmation                   |
| A user abandons a wallet prompt                  | Only that payment's reservations are affected                                 | Releasing a reservation must be safe against delayed signatures       |
| A sponsor transaction is uncertain               | Recover its exact bytes while unrelated resources continue                    | Never reuse its inputs on a timer                                     |
| Five sponsorship bids and Survivor prize funding | Independent incoming transfers and idempotent crediting                       | Their custodial rewards ledger remains separate from prediction funds |

## What the code establishes

These are source findings, not measured production throughput:

| Finding                                                                                              | Evidence                                                                                                                          | Consequence                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Every combined offer enters a shared operator lease and funding barrier                              | [BatchService](../../src/modules/direct/batch.ts), [funding barrier](../../src/modules/direct/cli.ts)                             | Unrelated matches can wait for the same operator history                                                                  |
| Unfinished unsigned sponsor offers block funding; proposals last up to 90 seconds                    | [Sponsor journal](../../src/modules/direct/sponsor-journal.ts), [batch offer expiry](../../src/modules/direct/batch.ts)           | One abandoned approval can affect other users                                                                             |
| The barrier reconciles shared signed operations and requires four confirmations                      | [Operator funding barrier](../../src/modules/direct/cli.ts)                                                                       | Confirmation is currently a service-wide dependency                                                                       |
| The existing-market builder chooses the first eligible shard                                         | [BatchService](../../src/modules/direct/batch.ts)                                                                                 | Extra workers alone would select conflicting inputs                                                                       |
| The browser assumes a sponsor input and sponsor change even for funded-only slips                    | [BatchClient](../../web/src/features/direct/batch-client.ts)                                                                      | Removing a server barrier alone does not produce a safe sponsor-free checkout                                             |
| Funded v4 entry requires the bettor, while genesis also requires the administrator                   | [v4 validator](../../contracts/direct-v4/contracts/protocol/src/main.rs), [v4 specification](../../contracts/direct-v4/README.md) | A sponsor-free funded-only builder is possible at the script level, but still needs a separate client and recovery design |
| v4 fixes four shards, eight positions per shard, eight markets per entry, and 64 input/output bounds | [v4 validator](../../contracts/direct-v4/contracts/protocol/src/main.rs)                                                          | More workers cannot raise these limits                                                                                    |
| v4 closes a market by consuming its control and all four shards                                      | [v4 specification](../../contracts/direct-v4/README.md)                                                                           | Settlement must coordinate with that market's inflight deposits                                                           |

The on-chain uniqueness seed identifies a market instance, not a globally unique
football fixture. The trusted catalogue still selects the canonical instance for
a fixture. This proposal must not accidentally create separate competing pools
for the same fixture and describe them as one pool.

CKB transactions consume particular outpoints; dependencies provide referenced
data/code. Sharing script code is different from spending the same input. A
shared control cell used as a dependency does not serialize ordinary deposits,
but replacing it during result publication can invalidate an inflight deposit.
[CKB transaction structure](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md).

## Invariants that implementation must preserve

- A live outpoint has at most one active allocation across all participating
  builders, lifecycle workers and treasury maintenance jobs.
- A database reservation grants no authority to spend. Wallet locks, scripts and
  canonical chain checks remain authoritative.
- A slip remains one payment for one to eight independent predictions. Never
  silently split it, omit a busy match, change its stake, or switch its pool.
- One operation has one immutable reviewed transaction version. Retries reuse
  exact signed bytes. A changed transaction requires explicit new review/signing.
- Sponsor principal, user principal, storage, change and fee limits are checked
  independently by the client and signer. Use integer shannons throughout.
- Uncertainty is contained to the affected inputs and their descendants. An
  unrelated confirmed funding cell must not inherit that uncertainty.
- Signed, signable and possibly broadcast transactions do not expire merely
  because a database lease, HTTP request or browser session expires.
- Claims and refunds retain their existing version-specific exit paths, even
  when new entries are paused or the coordinator is unavailable.
- Submitted, committed, accepted and claimable are distinct states. Chain
  inclusion after the cutoff must follow the script's refund rules.

## Components and authority

Use the existing PostgreSQL service for durable coordination. Do not add Redis,
another queue service or another custody model for this increment.

| Component                       | Responsibility                                                      | Must not do                                                          |
| ------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| API and availability read model | Account-scoped intents, quotes, queue/status events                 | Hold signing keys or treat cached availability as spending authority |
| Resource allocator              | Short atomic reservations over exact inputs and market identities   | Hold database locks while waiting for RPC, a wallet or confirmation  |
| Isolated signer workers         | Independently validate and co-sign a frozen approved transaction    | Sign a second transaction using already committed signing resources  |
| Broadcaster/outbox workers      | Persisted exact-byte submission and retry                           | Rebuild transactions after a timeout                                 |
| Chain observer                  | Canonical inclusion, depth, conflict and reorg observations         | Let one unavailable transaction stop unrelated observation work      |
| Lifecycle workers               | Per-market reporting, closing and reserve recovery                  | Consume a deposit/control input already reserved for a payment       |
| Inventory replenisher           | Split confirmed plain treasury cells into usable independent inputs | Merge reserved cells or use user prediction principal                |
| Browser journal                 | Persist user intent and signed bytes before sending                 | Lose payment recovery when a wallet disconnects or a tab closes      |

The funding key remains outside the API. Workers may validate/build concurrently;
cryptographic signing is a short operation rather than a lock held for an entire
confirmation cycle. Start with bounded worker concurrency and measure it before
raising it. PostgreSQL outage pauses new allocations and signing; it must not
trigger a fallback to uncoordinated file-based allocation.

The [existing Activity event index](wallet-activity-index.md) receives durable
operation events. Keep display indexing separate from financial authorization.

## Durable allocation model

Proposed records, with migrations and constraints before use:

| Record                     | Key and essential fields                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Payment intent             | Network, owner, idempotency key, request digest, ordered picks, version, state, created/deadline times                 |
| Transaction attempt        | Intent/version, raw transaction hash, reviewed bytes, exact economics, signing mode, fee bound, signed-byte references |
| Chain cell inventory       | Network + outpoint, owner role, capacity, protocol, fixture/lane, parent hash, canonical observation and maturity      |
| Active cell reservation    | Unique network + outpoint, attempt, state, fencing generation, lease deadline where valid                              |
| Canonical market selection | Unique network + fixture, selected protocol/instance, routing generation and migration state                           |
| Creation reservation       | Unique active network + fixture, pinned protocol, attempt and immutable genesis identity                               |
| Reservation history        | Append-only changes, reason, prior/new generation and observation identity                                             |
| Signing authorization      | Unique attempt/hash, resource generations, durable signer state and expiry where applicable                            |
| Outbox job                 | Unique operation + action, next retry time, worker lease, fencing generation and payload digest                        |
| Chain observation          | Transaction hash, block hash/height, confirmation depth, status and reorg lineage                                      |

Constraints enforce uniqueness; an in-memory map is only a cache. Immutable
idempotency keys with a different request digest return a conflict, not another
payment. Resource rows must survive process restarts and backup restoration.

Allocation procedure:

1. Fetch/cache public metadata and perform bounded RPC reads outside a database
   transaction. Validate the account, fixture terms and capacity budget.
2. In one short transaction, lock candidate resource rows in a stable order and
   claim the complete resource set. Use nonblocking row selection for interchangeable
   inventory and explicit uniqueness for fixture creation. If any required resource
   is missing, roll back the entire allocation and queue the intent without holding
   unrelated resources.
3. Build outside the database transaction. Recheck live inputs, dependency versions
   and reservation generations. Publish the exact review only if all still match.
4. Before signing, atomically commit the signing authorization and pin the exact
   hash/resources. The signer checks that durable authorization. A new worker cannot
   steal those resources because the old worker's process lease expired.
5. Persist signatures before any broadcast or release to a caller. Commit the
   durable outbox transition before acknowledging submission.

PostgreSQL `FOR UPDATE SKIP LOCKED` is appropriate for queue-like resource
selection. It does not guarantee fairness or provide a consistent global snapshot.
Use bounded retries, age-based scheduling and short transaction timeouts; do not
hold session advisory locks through pooled connections.
[PostgreSQL 16 SELECT](https://www.postgresql.org/docs/16/sql-select.html).

## Funding many unrelated payments

Maintain a pool of **independent confirmed sponsor inputs**, instead of repeatedly
spending the change from the last sponsor transaction. Allocate only the cells a
particular slip needs. Quarantine a failed or uncertain spend and its descendants;
continue with unrelated mature cells.

Use separate inventory budgets for market creation, ordinary co-signed deposits,
settlement fees and maintenance. A depleted creation budget should not disable
already-funded entries. Keep the Five/Survivor custodial rewards wallet in its own
liability domain, with its own payout allocation.

Current v4 creation ties a market's identity to input 0 and its genesis output
index. Preserve that ordering for existing sponsored transactions. For a funded-only
co-signed slip the sponsor contribution can remain zero, but its input and return
output still need enough capacity to exist. The user still pays the reviewed fee.
Do not advertise this as fee sponsorship.

Size inventory by occupied inputs as well as CKB balance:

- Minimum v4 creation reserve is 3,050 CKB per new market, plus a valid sponsor
  change cell. These are occupied capacities, not transaction fees.
- A slip creating eight markets needs eight reserves together. Small fee-sized
  cells cannot fund it. Keep explicit size classes and a sufficient large-cell pool.
- `required funding slots >= arrival rate × average reservation lifetime`, with
  separate budgets for wallet review, confirmation and uncertain recovery, plus
  a measured burst margin. Multi-market slips also occupy several deposit lanes.
- Replenish below low-water marks through separately allocated maintenance jobs.
  Consolidation runs only on free resources. Never funnel every size class through
  one still-unconfirmed splitter transaction during peak demand.
- Before enabling a cohort, publish configured slot counts, available capacities,
  sustainable measured rates and backpressure limits. No arbitrary TPS promise.

Use confirmed inputs initially. Chaining transactions through unconfirmed change
would reduce waits but introduce parent failures, mempool policy dependencies and
larger reorg groups. It is not part of the first delivery.

## Same-market payments

For a funded v4 market, treat each eligible shard outpoint as one independent lane.
Select fairly among free lanes with remaining record capacity, rather than always
selecting shard 0. Reserve the chosen outpoint before presenting exact review.

Four different users can hold four disjoint deposit transactions when all four
lanes are available. Their shared market control dependency is read-only. The
next bettor waits for an eligible replacement lane, without blocking another
market. This is four concurrent lanes, **not four transactions per second**.

A lane's replacement outpoint becomes available only after the chosen canonical
confirmation policy is met. Initially retain four confirmations for reuse rather
than quietly weakening the existing operator safety threshold. Display the actual
stage; browser payment acknowledgement at three confirmations does not necessarily
mean the allocator can reuse its dependent cells yet. Threshold changes require a
separate measured risk decision.

Monitor free lanes, reserved lanes, uncertain lanes and remaining position slots
separately. A 32-position market is full, not temporarily loading. Never create a
second pool and combine their displayed totals as if their payout denominator were
shared. All older positions continue to resolve under their original terms.

External users may spend public eligible cells without using this coordinator.
Reservations cannot prevent that on chain. Detect a changed input, reconcile the
exact transaction and request a new review only when safe. Test this explicitly.

## Sponsored creation and overlapping slips

Creation ownership is scoped to a fixture with a pinned protocol generation. Concurrent
first bets on different fixtures use different sponsor resources. Concurrent
first bets on the same fixture elect one creation attempt through the unique
creation record; everyone else waits for that fixture's canonical outcome.

The canonical selection row is unique across protocol versions. A v4/v5 routing
race must not create two active pools. Changing that selection requires an explicit
migration transition; preserve all historical identities and refuse replacement
of a pool with live positions under ordinary new-entry routing.

V4 cannot pre-create an empty market: genesis requires a first ticket and its
owner authorization. If that first owner abandons review, cancel an unsigned
attempt safely and let the next eligible request take creation ownership. If
signing or broadcasting may have occurred, preserve the attempt until canonical
recovery resolves it. Do not issue a second pool identity merely because time
elapsed. After confirmation, queued users allocate distinct deposit lanes.

Mixed slips reserve all their new-fixture identities, funded-market lanes, sponsor
inputs and owner inputs together. No hold-and-wait across matches. One unavailable
line holds the user's entire unsent slip, but holds no other markets' resources
while queued. Preserve their choices and offer an explicit edit/remove action.

Use age-aware scheduling with a bounded wait, per-wallet outstanding limits and
bounded queue depth. A large overlapping slip must not hold seven quiet markets
while waiting for an eighth. Do not indefinitely starve larger slips by admitting
only smaller ones. Queue order is an application policy, not a guaranteed blockchain
execution order. Expire queued reviews before their effective entry deadline.

Quotes must not become a free denial-of-service tool. Require the existing signed-in
wallet identity and evidence of usable owner inputs before holding scarce cells.
Allow one outstanding unsigned review per owner initially, with a fixed total
reservation lifetime that repeated refreshes cannot extend indefinitely. Bound
creation sponsorship by eligible fixtures, per-owner/aggregate budgets and available
inventory. Address-based quotas alone do not defeat many-wallet abuse; test that
attack and publish the remaining admission policy. These controls do not alter an
already signed user's entitlement or silently discard an uncertain payment.

## The signature and lease distinction

This is a release-critical boundary, not a timer implementation detail.

| Attempt stage                                                                           | May a timer release its inputs?                            | Required handling                                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Estimate only, no allocated inputs                                                      | No inputs held                                             | Safe to discard                                                                 |
| Co-signed mode, reviewed/owner-partially-signed, sponsor authorization never committed  | Yes, through an atomic cancellation that fences the signer | Reject every late submission of the cancelled version; only then release        |
| Sponsor signing authorization committed, signer response lost, or final bytes may exist | No                                                         | Quarantine exact inputs; recover signer result/hash and exact bytes             |
| Fully signed or broadcast outcome unknown                                               | No                                                         | Reconcile/rebroadcast original bytes; release only on canonical evidence        |
| Sponsor-free transaction bytes exposed to the user                                      | Not safely by a server timer alone                         | The user can sign and broadcast later; retain the attempt and conflict tracking |
| Canonical original or a sufficiently confirmed conflicting spend                        | According to the recorded proof                            | Consume/release the corresponding reservation; restore it if proof is orphaned  |

A lease expiry is not an on-chain upper spending deadline. A user who signs after
closing a tab may still broadcast. A signing worker that pauses before a network
failure must not later authorize an old attempt after another worker reassigned
its resources. Persist the exact signing decision first and fence all cancellations
against that state. Prefer an idempotent signer operation keyed to the raw hash.

This changes the earlier suggestion to simply remove sponsor participation first:
v4 **permits** it, but safe cancellation and browser recovery need design too.
The first release should retain the existing last-signing sponsor authorization
for coordinated checkout, using independent cells so that it no longer serializes
the service. Investigate a sponsor-free mode separately. It must either accept
explicit input-spend cancellation and possible lane waits, or use a reviewed
protocol mechanism that makes stale authorization unusable. Do not ship optimistic
lease expiry as that mechanism.

Only after this distinction is proved should a sponsor-free mode become the
default. Direct recovery and existing owner claims remain available meanwhile.

## State, recovery and restart behavior

Use explicit stages: queued, resources reserved, awaiting wallet, signing committed,
signed durable, broadcast unknown/submitted, committed, confirmed, and per-position
accepted or refundable. Terminal cancellation applies only where the table above
allows it. Keep historical attempts and display the canonical winner if attempts
have mutually exclusive conflict lineage.

| Failure or race                                      | Required outcome                                                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Duplicate click/request or lost successful response  | Same intent/hash and result; no new payment                                                                                                |
| Wallet rejection before sponsor authorization        | Cancel only this safe unsigned attempt; retain draft                                                                                       |
| Same owner in two tabs or devices                    | Server-side outpoint reservations supplement browser locks; never trust a tab-local lock alone                                             |
| Wallet/account changes                               | Stop new signing; old payment stays bound to its original owner and journal                                                                |
| Signer crash before/after producing a signature      | Durable signing authorization prevents input reassignment; recover exact bytes or hold affected inputs                                     |
| Broadcast timeout or inconsistent RPC answers        | Unknown state, same-byte retry, no automatic replacement transaction                                                                       |
| One input externally spent                           | Prove the conflict canonically; preserve history and require fresh review for a replacement                                                |
| Reorg                                                | Rewind affected observations, block invalid descendants, restore relevant reservations and replay Activity events                          |
| Old transaction wins after conflict proof disappears | Prefer canonical original; no double credit, duplicate pool selection or second refund                                                     |
| API, worker or database restart                      | Recover jobs by durable state/fencing generation; no blanket unlock based on process death                                                 |
| Database restore from backup                         | Reconcile restored inventory, signer journal and chain before new signatures; missing recent authorization cannot be assumed absent        |
| RPC outage for one dependency                        | Contain uncertainty to its dependent jobs; if the chain tip itself cannot be trusted, pause new signatures with a clear service status     |
| Report/close races with a deposit                    | Per-market closing state stops new leases; account for inflight signatures and dependency changes; valid late cells retain refund recovery |

Maintain an append-only signer journal outside the public API, plus the durable
coordinator state and outbox. Define recovery when either store has a newer record.
No distributed two-store write is magically atomic: persist authorization before
signing, reconcile gaps conservatively, and never broadcast an unjournaled signature.
Encrypt and restrict access to stored signature material; logs expose IDs and fixed
error categories, not signatures, tokens or wallet keys.

## Deadlines, settlement and other payments

Prediction entry currently has an application safety margin of two minutes before
kickoff. Retain it initially. Bind quotes to the earliest effective deadline in
the slip, using server timestamps plus canonical chain evidence, not the device
clock. `since` does not enforce an upper inclusion deadline. A signature before
kickoff is not proof that the position arrived before kickoff.

Per-market result publication consumes the control cell used by deposits as a
dependency. Closing consumes the market's complete shard set. These transitions
must coordinate against that market's resource graph and actual script rules;
they must not wait behind unrelated markets or drain the entire sponsor service.
No premature cancellation of a valid signed deposit is allowed to accelerate
settlement. Retain timeout/late-entry refunds when admission cannot complete.

Claims use separate claim cells, but a single wallet can still collide on fee
inputs across claims, new bets and game sponsorships. Preserve the shared browser
reservation system and add server visibility where applicable. The same owner's
funds do not become independent just because the UI action is different.

Five sponsorship auctions and Survivor prize funding are separate incoming
transfers to the disclosed custodial rewards wallet. Sharing a destination address
does not require consuming one shared destination input. Credit each contribution
once after its existing canonical checks. Keep auction cutoffs, top-up ordering,
ties and refunds deterministic under concurrent confirmations.

Outgoing rewards/refunds must reserve both their credit rows and exact treasury
inputs. Migrate their allocator separately; do not mix their liabilities or keys
with prediction sponsorship. Keep blocked/unknown payouts isolated from unrelated
free inputs. No new financial work type may bypass the resource allocator if it
shares an input inventory.

### Operation coverage and intentionally narrow ordering

| Operation                             | Resources that must be exclusive                       | Work that may proceed independently                          |
| ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Existing-market prediction            | Owner inputs, selected lane per pick, co-signing input | Other lanes, matches and independent owners                  |
| New-market creation                   | Canonical fixture identity and selected funding inputs | Other fixture creation jobs                                  |
| Result report / market seal           | That market's relevant control/lane inputs             | Every unrelated market and existing claims                   |
| Prediction claim / late refund        | Its claim or refundable input and fee inputs           | Other claims with separate fee inputs                        |
| Five sponsor bid / top-up             | Bid admission order for that round; exact payer inputs | Wallet approval, broadcasting and confirmation of other bids |
| Survivor creator funding              | Competition funding revision and exact payer inputs    | Other creators and Five contributions                        |
| Custodial refund / prize payout       | Credit IDs plus selected rewards-wallet inputs         | Other recipients funded from different treasury cells        |
| Split / consolidate / fee maintenance | Only free cells in that inventory                      | User operations funded from other cells                      |

One short admission transaction per auction round is necessary to compare bids
against a consistent highest total. It must not remain open while a wallet signs
or while a transfer confirms. Revalidate the strictly-higher combined total at
signed admission, not only when the form was opened. If two users sign the same
leading amount concurrently, only the first eligible admission wins that ordering
race. The later user needs a fresh review to increase the bid; never silently
charge more or overwrite the signed amount.

Contributions are owner-signed transfers and can be broadcast outside Streak.
A rejected or superseded signed bid therefore cannot simply disappear. Keep a
funding-attempt record separate from the admitted bid. Reconcile its exact output;
if attributable funds arrive without eligibility, issue one refund credit. Do not
refund arbitrary transfers based only on an untrusted client claim. The same rule
applies to a creator funding an already cancelled Survivor draft.

Preserve the published [auction rules](../delivery/five-sponsor-auction.md): signed
admission at the official FPL deadline, the 30-minute confirmation window, 24-block
eligibility evidence, top-ups, ordering and exclusion/refund behavior. The newer
strictly-higher admission rule is in [creator prize delivery](../delivery/survivor-creator-prizes.md).
The prediction allocator's four-confirmation policy must not replace rewards'
24-confirmation policy. No settings edit changes already published round terms.

All services sharing a wallet input use a common network/outpoint reservation
namespace, while authorization and liabilities remain separate. An owner with
several suitable cells may submit independent operations. An owner with one cell
must wait for its pending spend or deliberately split funds before testing. Avoid
automatic fragmentation transactions, unexpected fees or extra wallet prompts.
External wallets can still spend outside this coordinator; handle the conflict.

For rewards, reserve monetary liabilities as well as inputs. Maintain distinct
amounts for uncredited contributions, refundable deposits, locked prize pools,
unpaid credits, in-flight payouts and operational fee capacity. A contribution
must occupy exactly one accounting category at a time. Pending payouts keep
their credits reserved until canonical completion or a proven conflict. Never
treat a large wallet balance as spendable profit or lend one game's prize money
to another. Reconcile category totals against confirmed backing before signing.

Below-minimum refunds remain visible credits with a reason and an explicit
collection path when enough capacity exists. Do not generate an invalid tiny cell,
deduct an undisclosed fee, or silently mark the refund complete. Fee exhaustion
pauses only affected delivery; it does not erase a claim or refund entitlement.

## Speed and user experience

Start public fixture/configuration reads during normal app startup. After an
authorized account is restored, prefetch owner-scoped inventory and saved-payment
state. This performs no wallet permission request, signature or long-lived
reservation. Do not import signing libraries on the public landing page solely
for speculative payment preparation.

Replace the complete demand-catalogue download on each review with a bounded
request for the slip's fixture IDs. Cache immutable code manifests by network and
protocol hash. Batch RPC reads and deduplicate simultaneous observations of the
same outpoint. Final live-input/signature checks remain uncached and authoritative.

The request path must not scan every historical sponsor file or recheck every
operator transaction. Maintain a durable pending-job index and canonical inventory
projection. Chain events wake affected jobs; durable outbox jobs remain authoritative.
Use scheduled backoff with jitter as a fallback when notifications fail, and pause
unnecessary browser polling in hidden tabs. A periodic bounded reconciliation
sweep is still necessary; events alone are not loss-proof.

| State                                        | User presentation                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Availability read                            | Existing layout with the shared animated cells                                                 |
| Ready                                        | Review exact payment, then one explicit wallet approval                                        |
| Another first payment is creating this match | Explain that this match is confirming; keep picks editable and follow its status               |
| All current lanes occupied                   | Explain the temporary wait, show retry/status, allow leaving the slip without losing picks     |
| Market at its position limit                 | Say the market is full; do not show an endless loader                                          |
| Sponsor capacity temporarily exhausted       | Explain preparation delay only for affected new markets; existing funded matches remain usable |
| Submitted                                    | Minimized draggable progress with canonical stages; never display acceptance early             |
| Failed before payment                        | Preserve draft and provide a clear retry/edit action                                           |

Automatically refresh readiness, not signatures. When capacity returns, enable
review; do not open an unexpected wallet prompt. Only show queue position or an
ETA if the system can maintain it truthfully. The browser can leave the queue on
navigation without deleting any signed operation.

## A larger same-market protocol

Recommended candidate: [pre-created lanes and bounded tree settlement](payment-protocol-vnext.md).
This includes the missing closing construction, not just an instruction to increase
the constants. It remains a design to prove, not a reviewed protocol specification.

Delivery 1 is explicitly capped by v4. For larger demand, commission a separately
versioned design with these mandatory properties:

- A frozen market manifest commits the lane count, position bounds, rules,
  capacity requirements, cutoff and accounting version.
- Empty market initialization is independently sponsor-funded, so the first
  bettor's approval does not become the creation gate. Pre-create only selected
  upcoming fixtures within a published capacity budget.
- Multiple deposit lanes continue to accept independently. A candidate starting
  point for evaluation is 16 lanes and 32 positions per lane, **not an approved
  limit or a measured capacity claim**. Larger lane data changes required CKB
  capacity; current 610/321/3,050 figures cannot simply be reused.
- Closure must be bounded in transaction size, output count, cycles and occupied
  capacity. Increasing counters while retaining one giant close transaction is
  not an acceptable design.
- If settlement becomes staged, scripts must prove complete inclusion of every
  committed lane/page, unique accounting, the final parimutuel denominator,
  conservation, fees, rounding and independently funded claims. A database or an
  oracle-signed totals blob cannot substitute for these proofs.
- Any aggregation tree needs a fixed committed coverage set, disjoint child
  ranges and single-use transitions. A permanently missing lane needs a specified
  timeout/refund outcome. Permissionless completion and fees must be designed.
- Old markets never inherit new limits or payout rules. New deployments use new
  code hashes and explicit routing; historical recovery remains pinned.

An independent ticket inbox is another research option: users could create ticket
cells without consuming a market lane at checkout. It moves contention to admission
and settlement, however, and raises hard questions about omitted tickets, acceptance
deadlines, total-pool completeness, capacity and refunds. It is **not** an automatic
solution, and is not recommended for immediate implementation without those proofs.

Protocol delivery is blocked until the complete state machine, exact binary layout,
capacity accounting and settlement/refund constructions are independently reviewed
and pass adversarial VM and signed devnet tests. This document specifies the gate;
it does not claim to have solved or audited that new protocol.

## Acceptance measurements

### Deferred Activity scaling work

Owner direction, 1 November: defer large-scale Activity infrastructure upgrades
until actual demand and funding justify them. Prediction-placement concurrency
remains the current priority; it must not be held behind a million-user indexing
project. Preserve existing Activity correctness and recovery during payment changes.

Retain these later upgrades: incremental transaction processing with durable
checkpoints and reorg replay; changed-record updates and batched settlement writes;
parallel processing across markets with ordering within a market; efficient
pagination and maintained wallet totals; and load tests against declared active
traffic and history sizes. Reconsider relay storage/retention and catalogue/history
bounds as measured demand grows, rather than merely removing safety limits.

Current implementation reconstructs changed markets and replaces their participant
snapshots. A service instance runs market jobs sequentially and relays persisted
file observations in bounded batches. This improves page reads but does not prove
million-user capacity. Trigger reconsideration using observed queue lag, RPC work,
database latency/storage and traffic, together with available grant/operating budget.

### Prediction concurrency targets

Proposed acceptance targets below are test objectives, not existing results. Record
hardware, database/RPC versions, network delays, configured inventory, chain block
cadence and cold/warm cache state with every run. Include failures and queued
requests in the reported denominator, not only successful fast paths.

| Measurement                     | Initial acceptance target                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unrelated-market checkout       | 32 simultaneous wallets across at least 32 sufficiently provisioned markets can reach review without waiting for another wallet or transaction confirmation |
| Same-market v4 checkout         | Four users reach four disjoint reviews before any of those four payments is broadcast; a fifth receives an accurate local wait                              |
| Different new markets           | At least eight simultaneous creation slips use disjoint sponsor inputs and reach review concurrently                                                        |
| Same new market                 | Exactly one creation attempt; after it is canonical, waiting users progress through available lanes without creating another pool                           |
| Mixed slips                     | Overlapping one-to-eight-line requests either reserve their whole input set or queue without partial holds; no deadlock                                     |
| Warm backend preparation        | p95 at most 2 seconds and p99 at most 5 seconds under the declared load and RPC profile, excluding human approval and chain confirmation                    |
| Allocation database transaction | p95 below 100 ms in the reference environment; no network waits inside it                                                                                   |
| Visible feedback                | Loading/queued state within 200 ms of the click on representative mobile hardware                                                                           |
| State propagation               | p95 within 2 seconds of the observer recording an authoritative transition                                                                                  |
| Confirmation                    | Report actual distributions; no invented wall-clock guarantee                                                                                               |
| Sustained run                   | At least 30 minutes of arrivals plus a declared burst; use enough markets to respect v4's 32-position limit and keep the queue bounded                      |

Report end-to-end time separately from preparation time, including wallet approval,
queueing, inclusion, depth and admission. Measure RPC calls per payment, signer CPU,
database waits, outbox age, inventory occupancy, conflict rate and additional user
signatures. A faster loading animation does not count as faster settlement.

For v4, a rough per-market upper bound is free lanes divided by their average
occupied lifetime, until position capacity is exhausted. Service throughput is
also bounded by sponsor slots, signer/RPC/DB capacity and chain inclusion limits.
Use measurements to size these together; adding workers alone cannot exceed them.

## Mandatory failure and concurrency evidence

Use disposable databases, public development keys and local CKB nodes. Test the
actual builders and signatures, not a mocked success response. Physical MetaMask,
Zerion Android and supported native CKB wallet acceptance follows separately.

1. Same-match and different-match simultaneous offers, signatures and broadcasts;
   prove disjoint inputs before mining, then exactly-once positions after mining.
2. Mixed slips competing for overlapping markets, including reversed allocation
   order, exhausted lanes and a full market. Check fairness and complete rollback.
3. Abandon/reject a review, sign after lease expiry, submit an old partial, and
   pause a signer across lease expiry. No stale co-sign or double allocation.
4. Crash after each persistence boundary: allocation, signing authorization,
   user-byte persistence, sponsor signature, outbox commit, broadcast and response.
5. Concurrent workers and duplicate deliveries; an expired worker resumes after
   takeover. Exactly one immutable signing decision wins.
6. External spends, same-wallet multi-device use, inconsistent RPCs, pending drops,
   original-byte rebroadcast and a conflicting transaction that later loses a reorg.
7. Reorg market genesis and parent funding, including several markets sharing one
   creation transaction. Preserve every dependent position and historical descriptor.
8. Report and close while payments are pending; deadline reached while queued,
   while approving, and before mining. No late acceptance or lost refund.
9. Empty sponsor inventory, fragmented capacity, replenishment failure and a stuck
   splitter. Unrelated mature cells and funded-entry allocations keep working.
10. Game-week bids/top-ups, losing-bid refunds and Survivor funding concurrently;
    enforce existing attribution, canonical cutoff and credit uniqueness rules.
11. Backup restore and missing notifications; reconstruction does not free unknown
    signing resources or credit a payment twice.
12. Independent claims/refunds continue while new-entry coordination is disabled.
    Old generations remain discoverable and retain their actual exit restrictions.

Do not claim "concurrent" from eight picks inside one transaction. These tests
must involve multiple owners and multiple simultaneously unresolved transactions.

## Delivery and rollback

| Stage                                | Reviewable deliverable                                                                      | Exit condition                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0. Reproduction and specification    | Capture current two-wallet blocking; finalize resource/signing state machine and invariants | Independent review of payment/recovery boundaries; scope and capacity limits accepted         |
| 1. Allocation foundation             | PostgreSQL constraints, resource inventory, fencing, journal/outbox, replay tooling         | Crash and double-allocation tests pass before any new signing path                            |
| 2. V4 concurrent checkout            | Multiple sponsor cells, fair shard allocation, scoped lifecycle coordination and UI status  | Same/different/mixed market concurrency evidence and complete quality gate                    |
| 3. Controlled hosted testnet rollout | Per-protocol feature flag, narrow cohort, real wallet acceptance and observable inventory   | Measured latency, queue bounds, no duplicate positions or unresolved accounting discrepancies |
| 4. Larger-market protocol            | Separate v5 specification, review, VM/devnet evidence and deployment decision               | Proven complete settlement/refunds at chosen bounds; reviewed migration and economics         |
| Optional direct mode                 | Funded-only owner-signing builder and explicit stale-authorization/cancellation design      | Live-signature and late-broadcast tests prove safe resource handling                          |

Game rewards need their own completion gate alongside stages 2 and 3: concurrent
bid admission and funding observations, per-credit/per-input outgoing allocations,
refund attribution and liability reconciliation. Exercise them concurrently with
prediction load. Passing prediction tests alone does not complete this proposal.

The larger-market stage has three reviewable steps: a complete script specification
and accounting proof; a disposable VM/devnet prototype at proposed maximum capacity;
then an explicitly approved testnet deployment and new-market routing. Do not promise
a calendar date or pick a high participant limit before the prototype closes a full
market, pays every entitlement and recovers from interrupted settlement.

### Operational release controls

Owner scheduling, 3 November: the monitoring system, dashboards and automated
alerts below belong to the **post-grant monitoring implementation**, not the
immediate funding-selection/concurrency increment. Existing payment validation,
safe allocation and recovery guards remain required independently of that system.

Monitor usable sponsor capacity as well as total balance: eligible unreserved
cells, largest usable cell, fragmentation, input-selection limits and the number
of new markets/slips fundable under the active builder's rules. Track near-full
market shards, exhausted position slots and registry limits too. Distinguish low
funds, fragmented funds, reservations, protocol limits and stale chain data in
configurable warning/critical alerts, with a clear operator recovery action.
Do not collect users' wallet inventories merely to monitor selection failures.
This is deferred design scope; no monitoring service or alerts are enabled here.

Expose metrics for reservation age by signing stage, free cells by purpose, lane
occupancy, oldest queue item, signer/outbox lag, observer tip lag, unsettled markets,
unpaid liabilities and refund age. Keep wallet identifiers and signature bytes out
of metric labels. Every alert links to the affected operation and recovery action.

Stop new signing for an inventory on duplicate allocation, backing discrepancy,
unreconciled restore or signer-state disagreement. Scope pauses to affected inputs
when evidence permits; an untrusted chain tip or allocator database failure may
require a wider pause. Keep read-only history and safe independent claims usable.
Alerts must not imply an admin can override on-chain rules to release funds.

Before enabling new users, rehearse signer crash, database restart, observer outage,
inventory depletion and restore on disposable systems. Establish measured recovery
times, a key rotation/drain procedure and who responds to stuck refunds. A successful
HTTP health check is insufficient; readiness must include funding inventory, job
progress and canonical chain freshness.

Migration drains the old allocator before the new one can allocate the same
inventory. Import outstanding offers, signatures, hashes and reservations as
immutable legacy attempts. Do not let a file-lock worker and a database allocator
independently manage the same cells. All consumers sharing those inputs migrate
together or use explicitly disjoint inventories.

Rollback disables new allocations but leaves the new recovery/broadcast observer
running for its existing attempts. Re-enabling the old allocator requires a proven
drain and inventory handoff; changing a feature flag does not invalidate signatures.
Retain old deployed scripts and recovery adapters. Deployment and fund movement
require their normal explicit release decisions after review.

The previous 3–5-day implementation estimate was preliminary and did not account
for the larger-market protocol or the full stale-signature lease analysis. Do not
reuse it as a commitment for this complete proposal. Estimate delivery 1 after
stage 0; estimate the new protocol separately after settlement design review.

## Decisions needed before implementation

Recommended defaults: keep one-payment slips; keep the current payout economics
and confirmation safety policy; first deliver safe co-signed v4 concurrency;
use PostgreSQL coordination; budget independent treasury inputs; treat larger
same-market capacity as a separate required protocol milestone.

Still to specify with evidence: target simultaneous users, sponsor inventory and
capacity budget, queue limits, reference hardware, new market lane/position bounds,
and the larger-market settlement construction. These are explicit decision gates,
not gaps to conceal with claims of unlimited scalability.

This proposal changes no runtime code, scripts, deployment, treasury allocation or
existing financial terms. It is ready for owner review; independent technical
review and concurrency evidence remain required before implementation is accepted.
