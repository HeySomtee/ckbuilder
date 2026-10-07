# Streak smart-contract scope and decision register

Updated: 2026-09-23.

This records scope decisions, a proposed protocol and the isolated Week 18
experiment. The complete betting protocol is not implemented or audited.
Recommendations below are distinct from decisions explicitly accepted by the user.

## Agreed process

1. Identify the existing rules and additional rules needed for direct on-chain bets.
2. Decide where each rule belongs and what authority it grants.
3. Agree on the cell design and transaction flow that accommodate those rules.
4. Research Solidity/EVM equivalents, relevant EIPs/ERCs and OpenZeppelin patterns
   against the agreed behavior. ERC-4626 is an explicit research candidate.
5. Map the suitable patterns to CKB, specify invariants and adversarial tests, then
   implement the reviewed design in Rust with TypeScript/CCC transaction builders.

Keep user-facing discussions short and focused on a small set of decisions.

## Decisions explicitly accepted by the user

| Decision | Accepted choice | Consequence |
| --- | --- | --- |
| Funding model | Direct wallet-to-market stakes | The new protocol does not require a reusable platform deposit balance. |
| V1 boundary | Enforce betting funds on-chain; keep daily streaks, paid revivals and crew rebates as app features | Social/game state cannot authorize spending from market pools or create unbacked betting claims. |
| Market creation | Configured trusted admin only | Creation must authenticate the configured admin on-chain, equivalent in purpose to an onlyAdmin function. |
| Result authority | The trusted admin finalizes using results obtained from the football API | The API fetch happens off-chain; the script authenticates the admin and validates the transition. Result truth remains an explicit admin/API trust assumption. |
| Timeout | Six hours after the market's scheduled kickoff | Pin the kickoff/deadline before accepting stakes. Anyone may trigger voiding of an unresolved market when the deadline is reached. |
| Deadline semantics | Hard deadline; forbid late admin results | The final design must prevent late finalization even when nobody has submitted a void transaction. The CKB timing mechanism remains unresolved. |
| Voided market economics | No winners and no market fees | Return accepted wagering principal through redemption; no protocol or creator fee. Network transaction fees and storage-capacity accounting remain separate. |
| Stake representation | Depositors receive shares | Design outcome-specific share claims in CKB cells. Mint ratio, transfer/split rules and precise schema remain recommendations to settle. |

## Current user-defined skeleton

The conceptual operations are createMarket (admin), stake (user), finalizeMarket
(admin before the hard deadline), voidExpiredMarket (anyone after the deadline
if unresolved), and redeem (share owner after finalization or void).

The six-hour period starts at the scheduled kickoff pinned in the funded market;
it does not depend on an API report that the match has finished. A market cannot
be both finalized and void, and a finalized outcome cannot be overwritten.
Recommended extra restrictions: the admin cannot take pooled funds, mint
unbacked shares or change funded market terms. These are separate from trusting
the admin to report the football outcome honestly.

The time predicate must be defined against verifiable chain state. Do not treat
a caller-supplied timestamp, a stale header or merely signing before the deadline
as proof of timely finalization. Any staged implementation must explain exactly
which committed transition constitutes finalization under this hard deadline.

## Proposed responsibility matrix

"On-chain" means transaction validation by scripts. The application can still
calculate a proposed result and construct the transaction; it is not the final
authority over whether that transaction may spend protected funds.

| Rule or capability | Proposed responsibility | Recommended v1 behavior |
| --- | --- | --- |
| Market identity and creation | On-chain; admin only, accepted | Unique protocol market identity; authenticate the configured admin and validate initial state and referenced code/policy. |
| One canonical market per fixture | Explicit design decision | Preserve the product rule through a registry if it must be enforced globally. A unique market ID alone does not prevent separate markets for the same fixture. |
| Fixture and settlement terms | On-chain commitment; off-chain discovery | Pin provider namespace, fixture ID, outcome definitions, regulation-time rules, cutoff and result deadline when the market is created. |
| Fund custody | On-chain | Market funds can move only through permitted transitions; no treasury-key withdrawal path. |
| Stake authorization and attribution | On-chain | The signed transaction explicitly funds and assigns each ticket to an owner. Do not credit the entire transaction to any participant who supplied one input. |
| Accepted stake limits | On-chain | Pin minimum/maximum amounts and counter/capacity limits; bounds checked with integer arithmetic. |
| Stake/share issuance | On-chain; share representation accepted | Only backed issuance. Recommend fixed stake units per outcome to preserve parimutuel economics; distinguish the share class from each physical cell holding units. |
| Share ownership | On-chain | Bind share cells to the bettor's wallet lock; retain ownership checks through redemption. |
| Share transfer, splitting and merging | Open choice | Earlier fixed-ticket omission was a recommendation, not an accepted constraint. Decide which share operations are needed, including their rounding consequences. |
| Pool totals and liabilities | On-chain | Track home/draw/away totals and remaining obligations; prevent issuance or withdrawal that creates a deficit. |
| Betting cutoff | On-chain requirement; mechanism unresolved | A late commitment must never become a valid bet. A UI clock or an upper bound on the submitted since value is insufficient. |
| Closing/sealing the pool | On-chain | Final accepted totals cannot change once settlement begins; closing must not require operator cooperation. |
| Result acquisition | Off-chain | Fetch football data and apply a disclosed acceptance policy. |
| Oracle authorization | On-chain; trusted admin accepted | Require authorization by the market's configured admin; bind it to the network/protocol, market, fixture, rules and transition. A separate signed attestation is optional if the admin signs the actual transaction. |
| Real-world result truth | External trust assumption | Signatures establish authorization, not football truth. Multiple keys using one source do not establish independent truth. |
| Result timing, finality and corrections | On-chain policy plus oracle process | Define admissible submission timing and when a result becomes irreversible; late corrections cannot arbitrarily rewrite paid claims. |
| Cancellation/postponement policy | On-chain state rules plus oracle evidence | Define void reasons and a maximum waiting policy. Do not silently change funded market terms after rescheduling. |
| Missing-result timeout | On-chain; six-hour hard deadline accepted | At scheduled kickoff plus six hours, permit anyone to void an unresolved market without admin authorization, including if the operator never closed it. No late admin finalization and no market fees on void. |
| Empty winning outcome | On-chain | Refund all accepted stakes, as the existing engine does. |
| Payout calculation | On-chain | Retain proportional winning payout from losing stakes after fees, using checked integer arithmetic. |
| Protocol and creator fees | On-chain | Pin rates and recipient locks; charge once, never on a void refund. Current rates are 2% and 1% of losing stakes. |
| Creator fee recipient | Open choice after admin-only creation | Previously recommended first accepted bettor. Admin authorization to create markets does not automatically decide who receives the existing 1% creator fee; settle this explicitly. |
| Claim/redemption | On-chain | User-controlled transaction consumes the ticket and receives the amount owed at the designated lock, without treasury approval. |
| Duplicate claims and replay | On-chain | Consume claims and validate market continuity; signatures cannot be reused for another market/network or transition. |
| Rounding and residual funds | On-chain | Define the destination and release condition for every remainder; never sweep outstanding user liabilities. |
| Storage capacity and network fees | On-chain accounting; off-chain transaction building | Track ticket/market storage funding separately from the wagering principal; define who recovers it and who pays transaction fees. |
| Small payouts and fee outputs | On-chain transaction validity | Respect occupied-capacity requirements; design aggregation, top-ups or accumulated claims before promising small standalone outputs. |
| Empty/exhausted market cleanup | On-chain | Preserve all remaining claims and storage entitlements. Decide whether terminal state is retained for unredeemed losing tickets. |
| Administrative powers and upgrades | Proposed restriction | No administrative seizure or arbitrary rewrite of funded market terms. Prefer new versions for new markets; any pause must not disable legitimate exits. |
| Verifiable settlement history | On-chain state/transactions; off-chain presentation | Build receipts from protocol transactions. Additional hashes may anchor optional analytics, but cannot substitute for payment enforcement. |
| Displayed odds, return previews, portfolio and leaderboards | Off-chain, derived from chain data | Recompute from indexed stakes/results; the scripts independently validate actual financial transitions. |
| Market vs Machine forecasts | Off-chain | Keep prediction/bookmaker data outside fund authorization; optional commitments can remain a separate feature. |
| Matchday, logos and match statistics | Off-chain | Observational UI data does not authorize settlement. |
| Wallet login and sessions | Off-chain | Preserve the convenient account layer; spending authorization comes from wallet/contract validation. |
| Streaks, crews, notifications and profiles | Off-chain, accepted v1 boundary | Index accepted bets for app behavior; app state cannot alter a user's on-chain payout. |
| Paid revivals and crew rebates | Off-chain policy with separate operator funds | Revival payments/rewards must remain separate from market pools. Decide reward delivery for small CKB amounts; a database rebate cannot become an unbacked stake ticket. |
| Caches, database and background workers | Off-chain | Index/read/build/relay services; users need a documented route to valid redemption without the hosted backend. |

## Candidate cell arrangement

This follows the accepted direct-staking scope, but does not yet settle every
mechanism in the matrix.

- **Market cell:** native CKB pool capacity, pinned market terms, lifecycle state,
  accepted stake totals by outcome, oracle configuration, fee recipients and
  remaining liabilities. A market type script validates state transitions and
  conservation. Its spending path must allow valid actions without a treasury key.
- **Outcome-share cells:** market identity, outcome, funded share units and owner
  binding, with any additional identity required by the chosen issuance scheme.
  A share type script governs issuance and consumption alongside the user's
  wallet lock. Storage capacity is additional to wagering principal. Do not
  assume shares must be NFTs; several cells can represent amounts of the same
  market/outcome class if the final design permits this.
- **Creation registry, if global fixture uniqueness is selected:** ensures the
  fixture/rules namespace can create only its permitted market. Separate this
  property from singleton continuity of one market cell.

Code dependencies and their upgrade authority must be pinned or otherwise
explicitly trusted. A cell has one optional type script; any market uniqueness
logic must be composed into its design, not assumed to be a second type slot.

## Proposed transaction flow

1. **Create (admin):** authenticate the configured admin, fund market storage and
   establish immutable terms, including kickoff, betting cutoff, kickoff-plus-six-
   hours finalization deadline, admin result authority, fees and any registry entry.
2. **Fund a stake:** the wallet signs an explicit funding/ownership transaction.
   Issue valid outcome shares only once the admission rule establishes that the stake
   is eligible. Pending funding and accepted stake may require separate states.
3. **Close/seal:** deterministically resolve all pending admissions and freeze
   accepted totals. All relevant paths must enforce this even if no operator
   sends a dedicated close transaction.
4. **Resolve or void:** accept an admin-authorized outcome only under the hard
   deadline policy; when expired and unresolved, anyone can trigger a fee-free
   void. Earlier cancellation handling remains a separate policy to specify.
5. **Redeem/refund:** consume the appropriate ticket and market state, send the
   exact entitlement to its owner and update remaining liabilities. Funding
   inputs can separately cover fees and occupied-capacity needs.
6. **Complete:** release only funds whose entitlement is fully accounted for;
   preserve enough state for any remaining tickets/storage claims.

These are logical stages, not a claim that each fits in exactly one transaction.

## Mechanisms to resolve before accepting the final design

The external developer's 2026-09-16 feedback makes per-market cell contention
and deadline semantics explicit review priorities. The shared market-pool cell
is a prototype candidate, not the accepted final concurrency architecture.

1. **Time:** CKB since enforces earliest inclusion, not expiry. Investigate a
   staged admission/result mechanism that checks actual earlier commitment
   headers. Review delayed transactions, reused stale headers, deterministic
   admission, UTC versus chain time, reorgs and timeout/result races. This is a
   research candidate, not a selected or proven solution.
2. **Admin/oracle operations:** the user selected a trusted admin and six hours
   from kickoff. Specify authorization encoding, key management/rotation rules,
   accepted API result semantics and cancellation behavior. Pin funded-market
   policy; the timeout handles missing results, not dishonest ones.
3. **Creation:** decide whether one-market-per-fixture is a protocol invariant
   requiring a registry or an application catalogue rule.
4. **Capacity and completion:** calculate serialized cell sizes and realistic
   small-stake costs; settle fee collection, residuals and unclaimed tickets.
5. **Contention:** a shared market cell serializes updates to that market. Define
   retry/batching and measure throughput rather than claiming instant betting.
6. **App rewards and existing balances:** preserve legacy user entitlements;
   specify how operator-funded rewards are delivered without recreating shared
   custody inside the new market protocol. No migration is authorized by this note.
7. **Shares and creator fees:** settle mint ratio, transfer/split/merge policy and
   the creator-fee beneficiary under admin-only market creation. Freeze original
   accepted outcome totals for payout calculations; burns must not accidentally
   shrink the denominator used by later claimants.

## External review: contention and the crowdfunding deadline helper

Reviewed on 2026-09-16. The developer identified the shared pool cell as a hot
cell and pointed to the crowdfunding project's checkDeadline helper.

### Contention finding

Two independent transactions cannot both consume the same pool-cell outpoint.
If many users build against that version, a successful spend makes competing
transactions stale. Serial transaction construction, retries or coordinated
batches are needed. This is contention for the same cell, not a one-bet-per-block
rule for CKB; a batch can include several users' stakes.

Candidates to compare before selecting the final layout:

| Candidate | Benefit | Unresolved cost or invariant |
| --- | --- | --- |
| One shared pool with batching | Small initial accounting model; batches can admit several stakes | Updates to the pool remain serialized; signing, inclusion and retry coordination must be measured. |
| Fixed pool shards per market | Bets targeting different shards do not consume the same fund cell | All designated shards must be accounted for and sealed; global totals and adequate funding for redemptions require an explicit settlement design. |
| Independent stake/funding cells with later aggregation | Funding transactions can avoid a shared mutable pool input | Prove which stakes were accepted, correct totals and completeness; prevent selective omission, late admission and double counting. An indexer's claim of the totals is insufficient. |

Moving money out of one cell is not enough if every bet still consumes the same
market metadata or global share-supply counter. Separate immutable references
from mutable accounting when comparing these options. At the time of this
review no alternative had been selected. The later Week 18 section records
the user's sequential shard-routing preference; no load benchmark is claimed.

### Deadline finding from the referenced source

The actual files were retrieved and read, including utils/index.ts, the local
Since implementation, and the Project, Contribution and Claim callers.

checkDeadline loads the first transaction input's since, compares it with the
supplied deadline, and returns true when deadline is greater than that since.
It does not read the time of the transaction's eventual inclusion.

For an absolute timestamp example, deadline 17:00 and since 16:59 select the
helper's pre-deadline branch. At chain median time 17:10, the consensus lower
bound has also been satisfied. Provided the necessary inputs/dependencies remain
live and all other checks pass, that comparison alone does not rule out the
late transaction. Setting since at or beyond the deadline can gate a timeout
path, but does not automatically expire the competing earlier path.

This is a source-level assessment of the timing predicate, not an executed
devnet exploit or a full audit of the crowdfunding application. Ask the developer
whether another constraint is intended to close the earlier branch. The user's
hard kickoff-plus-six-hours deadline remains a requirement, not a solved mechanism.

References:

- [The referenced checkDeadline helper](https://github.com/joii2020/crowdfunding/blob/master/contracts/libs/utils/index.ts#L47-L54)
- [Its Since comparison implementation](https://github.com/joii2020/crowdfunding/blob/master/contracts/libs/ckb-since/src/index.ts)
- [Project script caller](https://github.com/joii2020/crowdfunding/blob/master/contracts/project/src/index.ts)
- [Since consensus precondition](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)

## Week 18 prototype and subsequent feedback

The user supplied a follow-up confirming that the crowdfunding example's
pre-deadline since comparison permits late inclusion. The suggested alternative
checks the creation block of a submission cell in a later transaction. The
suggested cancellation reward encourages monitoring but does not itself prevent
a late result winning a race against cancellation.

The user has chosen sequential round-robin routing for the proposed shard model.
The transaction builder selects shards in order and tracks pending updates.
There must be no shared on-chain routing counter consumed by every stake.
This is a routing preference, not a completed shard-accounting design.

Week 18 is an authorized isolated Rust experiment, documented in the
[contract lab](../../src/week18/contract-lab/README.md). It uses independent
stake cells to prove admission/refund behavior and one canonical market cell
for result transitions. It does not yet implement the sharded pool, fungible
shares, full admission aggregation, or winning redemptions.

The experiment pins kickoff and kickoff-plus-six-hours. An admin records a
provisional outcome in the canonical market cell. Later permissionless
verification binds its creation header to that exact input. Only reports
created at or after kickoff and strictly before the deadline may resolve.
A late provisional report can only lead to timeout, not finalization. A timely
canonical report prevents cancellation, including when verification is delayed.

This bounds result commitment time, not the later verification transaction's
inclusion time. It is a documented refinement under review, not silent adoption
of the originally rejected policy allowing any late result until someone voids.
The final production meaning of finalization still needs agreement.

Timeout requires an absolute timestamp since at least the deadline. Its median
time clock differs from the raw creation-header timestamp used for eligibility.
The operator's separate reward is paid atomically with a valid void or returned
to admin when a timely result is verified. Stake refunds return principal and
storage without protocol/creator fees. Network fees require separate funding.

See the lab README for encodings, fixed transaction shapes, test boundaries,
storage costs, admin identity pinning, and remaining production gaps. These
contracts are not integrated into the deployed Streak app.

## Week 19 and Week 20 implementation status

The bounded Rust experiments now implement four shards, eight bets per shard,
and atomic closure that checks every designated shard. Accepted ownership
records remain in shards until closure. Redeemable cells are minted at closure,
not immediately on deposit, and cannot transfer or split.

Week 19 consolidated backing into one payout cell. Week 20 instead funds every
claim for its exact entitlement plus storage during settlement. A claim spends
only itself and separate wallet fee inputs; no shared pool cell or application
database is required. Operator reserve recovery is separate from claims. Direct
payments at closure remain a simpler alternative if deferred claiming is not
needed by the product.

Week 20's scripts and independent claims were exercised on public Pudge testnet.
This is a synthetic contract fixture, not a production football oracle or a
migration of Streak's custodial backend. The deadline policy remains actual
result commitment before kickoff plus six hours, with later verification
permitted. The 32-bet limit, per-market admin pinning, fee-beneficiary policy,
wallet limits and trusted oracle remain explicit review items.

See [the Week 20 report](../../reports/week-20.md) for confirmed settlement and
claim transaction hashes, and [the lab](../../src/week20/contract-lab/README.md)
for the layout, wallet demo and standalone claim command.

## Initial Solidity reference comparison

These are design references for a Rust/CKB implementation, not selected EVM
dependencies or a claim of ERC compatibility.

| Reference | Useful mechanism | Boundary for Streak |
| --- | --- | --- |
| Gnosis Conditional Tokens | Outcome positions, designated result reporter and burning positions on redemption | Its positions use ERC-1155, backed by ERC-20 collateral. Its complete-set economics differ from Streak's existing parimutuel pool. |
| ERC-1155 / OpenZeppelin ERC1155Supply | Multiple share classes and supply tracking per class | A market/outcome can identify a class. CKB stores the balances in cells, and collateral/payout rules still need custom validation. |
| OpenZeppelin Ownable / AccessControl | Explicit authorization for privileged operations | A single admin matches the skeleton. Separate creation/reporting roles can initially share the same identity if useful. Do not import unrestricted minting or asset seizure. |
| ERC-4626 | Asset/share terminology, deposit/mint/redeem API conventions and rounding requirements | It specifies an ERC-20 share vault with one underlying ERC-20 asset. Native CKB and three conditional claim classes are not a drop-in implementation. |

Recommendation: retain parimutuel economics while borrowing outcome-share
structure and explicit role checks. Exact share conversion and redemption rules
must be specified before calling this the selected architecture.

On CKB, an onlyAdmin-style check can authenticate a transaction through the
configured admin's valid input lock, or a separately specified signed message.
Merely referencing an admin-owned cell as a read-only dependency is not proof
that the admin authorized the transaction.

Sources read:

- [Gnosis ConditionalTokens implementation](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol)
- [Gnosis developer guide](https://github.com/gnosis/conditional-tokens-contracts/blob/master/docs/developer-guide.rst)
- [ERC-1155 specification](https://eips.ethereum.org/EIPS/eip-1155)
- [OpenZeppelin ERC1155Supply](https://docs.openzeppelin.com/contracts/5.x/api/token/erc1155#ERC1155Supply)
- [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control)
- [ERC-4626 specification](https://eips.ethereum.org/EIPS/eip-4626)

## Implementation sequence after the design is agreed

1. Research and compare standards/modules against the agreed behavior; document
   useful equivalents and explicit incompatibilities rather than assume ERC compliance.
2. Write cell schemas, transaction layouts, signature messages and invariants.
3. Prove the timing/timeout mechanism and conservation in an isolated Rust
   prototype before adding integrations or accepting funds.
4. Implement the market and ticket validation, then fee/refund/cleanup paths.
5. Add adversarial VM tests for forged/unfunded tickets, redirected payouts,
   duplicate redemption, malformed state, overflow, rounding, invalid signatures,
   delayed admissions, timeout races and storage/fee extraction.
6. Add CCC builders and a backend-independent command-line redemption route.
7. Add chain indexing and update the UI for transaction confirmation, accepted
   versus pending stakes, ticket ownership and redemption.
8. Exercise a small testnet market end to end, obtain design/code review, then
   plan any migration separately.

## Primary CKB references checked during scope planning

- [Script execution and lock/type roles](https://docs.nervos.org/docs/script/intro-to-script)
- [Transaction structure, capacity, type scripts and header dependencies](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0022-transaction-structure/0022-transaction-structure.md)
- [Since preconditions and time metrics](https://github.com/nervosnetwork/rfcs/blob/master/rfcs/0017-tx-valid-since/0017-tx-valid-since.md)
