# Streak contract design notes

Recorded: 2026-09-15. Updated: 2026-09-23.

Status: requirements for the future smart-contract proposal and implementation.
Scope planning is now recorded in [the decision register](CONTRACT_SCOPE.md).
The user selected direct wallet-to-market stakes and keeping streaks, paid
revivals and crew rebates as app features for v1. The current skeleton also uses
a configured trusted admin to create markets and finalize football results,
outcome-share claims for depositors, and permissionless fee-free voiding of
unresolved markets at a hard deadline six hours after scheduled kickoff. Late
admin results are forbidden. The production timing policy and complete betting
contract remain open; the isolated Week 18 experiment is described below.

External feedback on 2026-09-16 identified contention on a shared market-pool
cell. The decision register now compares batching, fixed shards and independent
stake cells without selecting an alternative. The recommended crowdfunding
checkDeadline helper and its callers were inspected: its comparison against
input since alone does not establish a hard inclusion-time expiry. The subsequent
reply supplied by the user confirms that limitation and suggests checking a
submission cell's creation block plus an operator-funded cancellation reward.

The user selected sequential round-robin routing for the proposed pool shards.
Routing belongs in the transaction builder, not an on-chain shared counter.
Full shard aggregation and payout funding remain unresolved.

The user authorized the Week 18 Rust prototype, tests, report, commit and push.
The isolated [contract lab](../../src/week18/contract-lab/README.md) explores
creation-header admission, a canonical provisional result, and refunds. It
refines the timing experiment to a hard result-commitment deadline followed by
permissionless verification, which can occur later. This is not a claim that
the original pre-deadline-finalization semantics or final protocol are settled.
The deployed application and its existing treasury are not migrated.

## Agreed planning order

Identify candidate on-chain rules, decide each responsibility, agree the cell
design and transaction flow, then research and apply the appropriate Solidity
equivalents and implementation conventions. Do not choose the architecture
merely to match a named ERC.

## User requirement: research Solidity equivalents

When contract design begins, look for relevant Solidity/EVM precedents in
EIPs, ERC standards and OpenZeppelin modules. In particular, investigate
ERC-4626 as a reference for deposits, assets, share issuance and redemption.
Consider a combination of standards where their responsibilities fit together.

The user subsequently suggested Gnosis. Initial primary-source research found
Gnosis Conditional Tokens uses ERC-1155 outcome positions with ERC-20 collateral.
It is a candidate structural reference; adopting its complete-set economics
would be a separate choice from preserving Streak's parimutuel payouts. The
decision register records the comparison with OpenZeppelin authorization,
ERC1155Supply and ERC-4626 conventions.

The user wants a technically defensible proposal they can understand, present
to the CKB developer and refine with his recommendations. Explain the chosen
patterns and implement the suitable equivalents during the implementation phase.

Before selecting a pattern:

- Read the current primary specifications and official implementation sources.
- Explain which problem it solves for Streak and which assumptions it requires.
- Map its state, operations and validation rules to CKB cells and transactions.
- Identify where a football parimutuel pool differs from a conventional vault,
  including outcome-specific stakes, losses, fees, rounding and redemption timing.
- Explain departures from the source standard; using a pattern as inspiration
  does not establish ERC compliance or make an EVM library directly reusable on CKB.
- Derive tests from the economic and authorization invariants, including edge
  cases in deposits, share issuance, payouts and refunds.

ERC-4626 is an explicit research candidate, not a predetermined architecture.
Select additional standards or modules for a concrete purpose.

## Existing direction to preserve

- Explain the current implementation before asking the user to formulate the
  proposal; the user wants to understand and defend the design themselves.
- The current app uses a custodial ledger and a server-controlled CKB treasury.
- Investigate a type-scripted market cell with redeemable stake or share cells.
- Use Rust for the proposed production CKB scripts; TypeScript/CCC can continue
  handling the application and transaction construction.
- Keep the week-13 hash-lock as a separate learning exercise, not the treasury
  foundation.
- Specify the football oracle as an explicit, pinned and time-bounded trust
  assumption. Contract rules cannot independently establish a football result.
- Present a plan before implementation, in line with the user's preference.

## Open issue from the implementation walkthrough: deposit attribution

The current payment verifier checks that a committed transaction includes at
least one input from the recorded user wallet, then credits all capacity paid
to treasury outputs. A joint payment could therefore credit one participant
for the entire deposit. The transaction hash is consumed as a whole, preventing
another participant from claiming a separate portion later.

The future design must explicitly define the supported deposit transaction
shape and bind each credited stake or newly issued share to its funding and
intended owner. Review mixed-funder transactions, change, sponsored fees and
replay protection when evaluating the Solidity equivalents.
