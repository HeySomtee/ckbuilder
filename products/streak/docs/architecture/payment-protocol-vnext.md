# Larger markets: proposed entry and settlement design

1 November 2026. Companion to the [payment proposal](concurrent-payments.md).
**Design candidate, not deployed code, an audited specification or a capacity promise.**
Existing v4 markets retain their original scripts, economics and recovery paths.

## The idea in plain language

Give each match several independent entry lanes. Prepare them before betting opens
so users do not depend on the first bettor's wallet approval. At the end, close each
lane separately, combine their verified totals, and distribute the funds through
small transactions until each bettor has an independent claim.

There is a common total for each match because the return depends on that match's
whole pool. That calculation happens during settlement. It is not a shared cell
that every user must spend to place a prediction. Different matches never share
this settlement state.

The proposed construction is a fixed binary tree. Each branch covers a known,
nonoverlapping range of lane IDs. Scripts check the coverage and arithmetic at
each step. The backend supplies transactions and proofs, but cannot choose which
bets count or substitute a database total for the committed records.

## Entry and market identity

Creation fixes the protocol version, fixture/rules hash, outcome meanings, oracle,
entry cutoff, result deadline, lane count, records per lane, storage requirements,
fee recipients, payout arithmetic and reserve budget. Lane count is a power of
two for this candidate. None of these changes after entries begin.

The deployment catalogue continues to select one canonical instance per fixture.
Scripts enforce uniqueness inside a market instance; they do not establish which
real-world fixture an arbitrary external instance represents. Application routing
must never combine independent pools or silently migrate live positions.

Creation funds the complete fixed lane set, including empty lanes. No first bettor
is required. Reject partial initialization. The transaction size and capital needed
for initialization form part of the maximum supported lane count.

An entry consumes only one available lane for that market and the payer/sponsor
inputs required by its reviewed transaction. A slip can touch several markets
atomically within proven input/output/cycle bounds. The new manifest is a stable
dependency, separate from the mutable oracle-report control cell. Reporting a result
therefore does not replace the metadata dependency used for entry.

Retain block-header-based pending admission: a transaction cannot prove its own
future inclusion time. A later transition admits its pending ticket only when the
committing block was before cutoff, otherwise refunds it. Sealing performs that
classification for the last pending ticket too. A server clock or review expiry
is not proof of timely chain admission.

Owner decision, 1 November: keep these checks in subsequent deposits and existing
settlement/lifecycle transitions. A standalone admission/refund transition remains
an optional future enhancement, preferably integrated into existing execution.
Do not add a dedicated admission worker as a requirement of this proposal.

Each ticket commits an immutable owner lock, principal, outcome, storage funding
and unique lane/sequence identity. No operator can remove an accepted ticket or
reassign its owner. Tickets beyond the lane's committed capacity are rejected;
the application shows full capacity rather than opening an undisclosed second pool.

## Cells and authorized transitions

This is a logical schema. Exact binary layouts, hash domains and transaction
group checks must be specified before implementation is accepted.

| Cell                | Committed contents                                                               | Permitted transition                                                    |
| ------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Manifest            | Market identity, immutable terms, lane set and limits                            | Remains available as shared read-only metadata                          |
| Oracle control      | Oracle authority and result window                                               | Exactly one terminal result certificate                                 |
| Result certificate  | Timely authorized outcome, or deterministic timeout/void                         | Read-only for this candidate; no admin rewrite                          |
| Open lane           | Lane ID, sequence, accepted records, optional pending ticket, funds              | Entry replacement or one sealed leaf                                    |
| Sealed leaf         | Lane ID, complete ticket commitment, outcome totals, counts, final result, funds | Merge into its uniquely determined parent range                         |
| Aggregate           | Range, child commitments, outcome totals, storage/reserve accounting, funds      | Merge with sibling; full root can enter distribution                    |
| Distribution branch | Range commitment, global totals, final outcome, funded entitlement budget        | Split into its two children                                             |
| Distribution leaf   | Bounded lane records and funded budget                                           | Exact independent claims, plus specified reserve/dust outputs           |
| Claim               | Exact owner lock and fully funded return including refundable storage            | Owner-directed collection without another bettor or shared pool counter |

Creation and type transitions must forbid counterfeit leaves, duplicate lane IDs,
arbitrary aggregate minting, range overlap, cross-market mixing and a second root.
Input consumption alone is not enough if scripts permit unauthorized outputs.
Hash commitments bind the market/version, node kind, range, child hashes, outcome
totals, ticket counts and storage obligations together with the record commitment.
Distribution must verify those same authenticated summaries; a record hash with
uncommitted child totals would let a builder redirect funds between branches.

This candidate retains the manifest/result certificate as permanently available
small cells to avoid a late dependency disappearing. Budget their occupied capacity
explicitly; it is not fully recoverable reserve. A reclaimable certificate would
need an additional reviewed lifecycle proof, not an admin delete button.

## Bounded settlement construction

1. **Finalize the outcome.** An authorized result is eligible only under the frozen
   reporting window and canonical block evidence. With no eligible result, a
   permissionless timeout transition chooses void under the published rules.
   A report and timeout compete for the same control input, producing one terminal
   decision. Neither API time nor a late oracle signature can override the window.
2. **Seal lanes independently.** Each seal validates the lane's full bounded record
   set and classifies its pending ticket using its committing header. Late funds
   return through an explicit refund output or independently funded refund claim,
   as fixed in the new specification. They never enter pool totals. Empty lanes
   also produce real sealed leaves. Each leaf carries certified outcome totals,
   counts, ticket commitment and its actual funds.
3. **Reduce sibling pairs.** Combine only adjacent sibling ranges of the expected
   tree level and market identity. Add their checked totals and funds. Bind the
   child commitments into the parent. Repeat until one root covers precisely all
   lanes. No subset is a valid whole-market root, even if the operator declares a
   missing lane inactive. Independent branches execute in parallel.
4. **Create the distribution root.** Apply frozen global payout rules to verified
   totals. Account separately for user storage, stake, fees and sponsor reserves.
   The root commits the same complete record tree and final outcome. This is one
   market's settlement boundary, not a recurring checkout or claim lock.
5. **Split down the tree.** Each transaction proves the two child commitments of
   its current range, preserves the global totals/outcome and funds both child
   budgets. It cannot send principal to an operator-selected recipient. Different
   branches then distribute concurrently.
6. **Materialize independent claims.** At each leaf, reveal the bounded committed
   records and calculate each exact entitlement using global totals. Emit one
   fully funded claim per ticket. Recover only the explicitly unallocated reserve
   and arithmetic remainder. Once emitted, claims need no still-live root or
   certificate and no other user's signature.

The root cannot spend funds before all lanes are accounted for. This is necessary
for a common parimutuel denominator. A broken or unavailable lane can delay that
market's settlement, so every valid open lane needs a permissionless seal path.
Do not invent an omission timeout that discards accepted positions. A failed
settlement worker is replaced by another worker using the same public rules.

The process uses bounded work per transaction, not less total work: reduction and
distribution each require a number of jobs proportional to the lane count. Record
both total fees and sequential confirmation rounds. More lanes improve entry
concurrency but increase occupied capacity and settlement overhead.

## Funding claims across lanes without changing returns

One lane can contain mostly winners and another mostly losers. Paying directly
from each lane's original funds would be incorrect. The reduction gathers the
whole market's funds before distribution allocates them by global entitlement.

Use the existing v4 payout arithmetic as the compatibility target, subject to
review of the new capacity requirements. Let `T` be total admitted principal,
`W` the winning principal, `L = T - W`, and:

```text
protocol_fee = floor(L / 50)
creator_fee = floor(L / 100)
distributable_profit = L - protocol_fee - creator_fee
winner_return = storage + stake + floor(stake * distributable_profit / W)
loser_return = storage
void_or_no_winning_stake_return = storage + stake
```

Use checked integer arithmetic with sufficiently wide intermediate multiplication.
The actual v4 implementation is [payout and close](../../contracts/direct-v4/contracts/protocol/src/main.rs).
Preserving the formula does not mean preserving the old fixed storage amounts.

Rounding matters during tree distribution. For a subtree with total winning stake
`w` and storage obligation `s`, allocate the conservative budget:

```text
subtree_budget = s + w + floor(w * distributable_profit / W)
```

This is at least the sum of its individual ticket entitlements. The two child
budgets sum to at most the parent's budget. Carry the difference in an explicitly
accounted reserve/dust balance; do not round each child's fraction upward. At a
leaf, calculate individual returns exactly and send only the remaining difference
to the frozen remainder destination. In void/no-winner cases, allocate storage
plus all principal instead, with no division by zero or losing-pool fee.

Every transition also funds its own and all required descendant cell capacities.
User claim storage is reserved for users; sponsor reserve pays for intermediate
cells, fixed fee-output capacity and any promised execution allowance. Network
fees must come from explicit operator/executor inputs or a frozen bounded budget,
never an unreviewed subtraction from user returns. The capacity proof must show
that no valid tree stage requires an emergency top-up to produce its children.

Do not choose reserve amounts from the old 610/321/3,050 CKB constants. Calculate
them from actual serialized layouts, maximum lock sizes, output constraints and
peak live cells across stages. Separately publish permanent metadata occupation,
recoverable reserve and consumed network fees.

## Data availability and permissionless completion

A commitment is not enough if nobody can retrieve its records or branch proofs.
Accepted records originate in published lane transactions. Persist their exact
content-addressed records, headers and tree proofs in replayable storage, and
provide an export/reconstruction tool independent of the main API.

Define the chain-history availability assumptions explicitly. A pruned RPC plus a
lost application database must not be described as guaranteed self-service recovery.
Test reconstruction from the declared archival source, validate every hash and
make the required transaction data available to users. This is public on-chain
data, not a reason to expose authentication or private wallet journals.

Permissionless means anyone can construct a valid transition; it does not mean
execution is free. Initially fund normal execution from a dedicated operator
maintenance budget. The specification must allow a third party to contribute fees
without taking user principal or changing recipients. Any optional executor bounty
needs frozen funding and anti-extraction rules before being enabled.

Once a result is terminal and payout distribution has begun, worker downtime must
not turn winners' claims into a different refund schedule. Resume exact stages.
Missing oracle evidence is resolved before distribution through the void path;
missing operator execution is resolved through permissionless continuation.

## Cancellation, contention and other limits

Keep cancellable co-signed reviews in the first integrated release, as specified
in the [signature table](concurrent-payments.md#the-signature-and-lease-distinction).
New script rules must explicitly decide whether co-signing is enforced or merely
used by Streak's checkout. Do not accidentally introduce mandatory operator custody
by changing the v4 owner-authorized funded-entry path without review.

Public owner-authorized entry means external transactions can compete with Streak's
reserved lanes. A database cannot prevent that. Final live-input validation and
conflict recovery remain necessary. Transaction fees and identity quotas do not
prove protection against well-funded many-wallet abuse.

Increasing lanes does not remove all contention: one lane accepts one input spend
at a time, one wallet cannot reuse its pending input, and the chain has finite
throughput. The proposal should display these waits accurately and keep them local.
It must not promise arbitrary simultaneous users from a fixed lane count.

An independent ticket-inbox design is deferred. It can remove shared lane inputs
at initial funding, but then needs enforceable complete admission, cutoff handling,
bounded aggregation and refunds for excluded tickets. Depositing into an inbox
must not be marketed as an accepted prediction before those rules are solved.

## Prototype and decision gates

Evaluate 16 lanes with 32 records each as a **candidate 512-position market**.
This is a prototype workload, not an approved parameter or launch capacity. Keep
limits frozen per deployed version. If minimum capacity, transaction size, VM
cycles or measured closing time are unacceptable, revise the design before launch.

Required evidence:

1. Exact cell schemas, transition permissions and group-level validation, including
   foreign outputs, duplicate roots, overflow and forged historical proofs.
2. Conservation and coverage proofs for empty/full/mixed lanes, all winners,
   no winners, all outcomes, void, late tickets and maximum supported lock sizes.
3. Global payout equivalence across different lane assignments, including
   adversarial rounding and tiny or very large stake combinations.
4. Full-capacity initialization, simultaneous entries, every settlement stage,
   every claim and reserve recovery on a disposable signed local chain. Include
   final pending-ticket boundary conditions, not just pre-admitted records.
5. Crash and reorg at each tree level, loss of a worker, duplicate executors,
   external spends and reconstruction without the application's primary database.
6. Peak occupied capacity, total fees, transaction bytes/cycles, critical-path
   confirmation time and time until all independent claims are ready.
7. Independent protocol/security review followed by the full local quality gate.
   Physical wallet acceptance and controlled public testnet evidence come afterward.

No tree design should be enabled based on a diagram and happy-path arithmetic.
The construction above makes the intended solution reviewable; exact script proofs,
costs, implementation and independent review remain required work.

## Technical references

CKB inputs consume cells while dependencies reference existing cells. This is the
basis for independent lanes and shared immutable metadata. See the official
[transaction structure specification](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md).
The proposed tree and accounting construction are Streak design work, not an
official Nervos protocol or a mechanism established by that reference.
