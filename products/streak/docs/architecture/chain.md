# Prediction protocol and oracle integration

The [Week 20 lab](../../../../src/week20/contract-lab/README.md) is the implemented Rust prototype. This document defines how its limits constrain the approved app integration. It does not deploy or upgrade a script.

## Existing lab boundary

- Four deposit shards, at most eight accepted records per shard, at most 32 accepted bets per market.
- Sequential off-chain shard selection. The script validates a transaction; it does not schedule wallets or load-balance competing transactions. A shard can still be contended. Bounded retries must revalidate inputs and never create a shared routing-counter hot cell.
- Settlement consumes the canonical market and all four shards, computes global totals, and creates separately funded claims. Claim transactions do not consume the market, reserve or other claims.
- Claims return their full pinned entitlement to the owner, using separate fee input capacity. The current version permits one claim per transaction. Consensus rejects replay of a spent outpoint.
- Minimum principal is 100 CKB plus 321 CKB recoverable claim storage and network fees. Operator reserve, fee-output storage and keeper reward are separate obligations.
- Wallet lock arguments are restricted to at most 20 bytes by the current shared builder. Publish a tested wallet matrix before promising support.
- No share transfers/splits, disputes, production indexer/keeper or mainnet deployment. Direct-market app integration is still planned.

The lab's settlement policy returns principal plus a rounded-down proportional portion of the losing pool after 2% protocol and 1% creator fees for a nonempty winning outcome. A void or empty winning outcome returns principal. Losing positions recover their receipt storage. These are versioned prototype rules, not automatically approved new campaign economics. Review the actual manifest, encoder and deployed code for every supported version.

## Trusted roles and time

The configured operator creates markets and acts as the result reporter. The backend obtains football API evidence and signs an oracle report. Separate market-creation and reporting permissions in the design even if one initial operator holds both. Document custody, rotation and recovery of these privileged keys.

The result window ends six hours after pinned scheduled kickoff. A `since` condition supplies a lower bound; a builder-supplied pre-deadline value does not prove that commitment happened before the cutoff. Admission and report eligibility therefore depend on the actual creation header checked in a later transition. Timely reports may be verified later. An ineligible late report cannot become valid by winning a cancellation race.

Timeout cancellation uses the six-hour consensus condition and a keeper incentive from operator capacity. State changes occur when transactions commit, not when a browser countdown expires. Verify the exact transition rules for an already committed eligible report before exposing cancellation. Use the lab VM/devnet tests as the authority for implemented behavior.

Funded kickoff and settlement terms are immutable. The Week 20 args do not yet commit a fixture/rules hash. A production football catalogue needs a reviewed commitment/version, including regulation time, postponement, abandonment and result-source rules. An off-chain fixture label alone is an additional trust assumption and must not be hidden.

## One slip, independent positions

The approved interaction is one reviewed transaction containing independent predictions, with at most one outcome per fixture. Changing the outcome preserves the stake. Every pick receives its own admission status, position and eventual claim/refund.

Before signing, bind the builder output to one immutable intent: account/wallet, network, contract version, fixture terms, outcomes, per-pick principal, receipt ownership, storage and fee estimate. Revalidate cutoffs and live shard inputs. Verify per-market conservation and group isolation, duplicate inputs, supported locks and complete-transaction size/cycle limits. The preview's 0.005 tCKB fee is not a production estimate.

If any pick cannot proceed, return the whole slip for review. Never silently remove a pick or split one approved payment into several transactions. Retain the draft after rejection or stale inputs. Persist the signed hash before broadcast and reconcile it before retry. One committed transaction does not imply every record is admitted; track each later validation and refund independently.

Required states are `draft`, `reviewed`, `awaiting signature`, `submitted`, `committed/pending validation`, then `accepted` or `refund required`. Settlement and claimability are later states. A submitted hash is not success evidence and closing a sheet does not cancel broadcast.

## Indexing and recovery

Store block number/hash checkpoints, transaction hashes, outpoints, contract version and processed-event identity. Define confirmation policy and rollback affected projections on reorg before replaying deterministically. Wallet discovery and operator tools share the versioned encoders/builders. Raw protocol functions remain independently testable.

Keep claims recoverable via direct RPC tooling when the website is unavailable. Do not require backend permission for a valid owner claim. A service pause blocks new entries while leaving valid exits available. Script upgrades deploy a new version with an explicit migration; keep old code/manifests available for exits. Frontend rollback cannot reverse a committed transaction.

## EVM references and adaptation

The design takes ideas from [Gnosis Conditional Tokens](https://github.com/gnosis/conditional-tokens-contracts) for outcome positions and redemption, [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control) for explicit roles, and [ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) for deposit/share/redemption accounting conventions. These are design references, not a claim that this CKB script implements an ERC interface.

CKB cells, transaction validation and concurrency require their own invariants. Do not copy an account-based mutable pool or imply ERC-4626 yield/vault semantics for a parimutuel market. Specify conservation, ownership, rounding, authorized transitions and timing first, then map the useful pattern to cells and Rust validators.

## Validation required for integration

Run relevant Rust VM, accounting and shared-client tests after protocol/builder changes. Changes to lifecycle, signatures, admission, settlement or recovery also require the isolated local devnet flow. Cover all-shard completeness, underpayment, recipient theft, type removal, duplicate/replayed claims, late admission/reporting, empty outcomes, cancellation and concurrent claims. Batch integration adds multi-market group isolation, per-pick refund paths and size/cycle bounds.

Routine tests must not use public RPC, the deployment key or `.ckb-wallet.key`. Live testnet settlement is a separate authorized check with actual hashes and explorer evidence. Report synthetic results, wallet mocks, local devnet and public-chain verification as different evidence.
