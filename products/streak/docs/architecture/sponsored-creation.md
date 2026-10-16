# Sponsored creation with the first prediction

Owner decision, 16 October 2026: create market cells and the first prediction in the same transaction. Streak supplies the market reserve. Stop bulk funding unused fixtures; retain existing markets and their exits.

## Transaction and custody

The shared Rust program is deployed once per reviewed version. Each used fixture creates one market control cell and four shards. V3 requires exactly one pending first prediction in shard zero, authorized by its owner, in addition to the configured creator authorization. The fixed reserve remains 3,050 testnet CKB. The bettor supplies principal, 321 CKB position storage and the explicitly reviewed network fee. Separate contribution checks verify both parties' input capacity less change; signature presence alone is insufficient.

A later transaction checks the first prediction's actual creation-block timestamp. A late creation does not become an accepted prediction merely because the transaction was signed before kickoff. Existing late refund and six-hour void rules apply. Sponsor reserve recovery retains existing fee-output bases and timeout keeper deductions; do not call all reserve capacity unconditionally refundable.

## Signing and recovery

The API authenticates the request and forwards bounded proposals to a separate operator that owns the sponsor key. The API never loads that key. An unsigned offer pins fixture terms, sponsor funding input, raw transaction hash, exact outputs and expiry. The browser independently checks the offer and displays the user's complete cost. The bettor signs first. Their exact partial bytes persist before submission. The operator validates the user signature and complete economics before adding its own signature, durably recording final bytes and broadcasting.

Only unsigned offers can expire without a signed recovery obligation. After user-signature submission, an HTTP error, missing response or expired offer cannot free the user's input reservations. Recover the same hash and bytes. Canonical transaction or conflicting-spend proof is required before freeing previously submitted inputs. Existing and sponsored payment adapters share wallet locking and durable reservations. Old records retain their schema and byte identity.

The browser records whether it attempted to transmit the partial signature before making that request. An expired signature that was never transmitted can be explicitly discarded only after operator status confirms no accepted signature or final transaction. Its audit record remains. A transmitted or uncertain submission cannot use this shortcut.

Replacement attempts require at least four canonical confirmations of a conflicting spend. They must use the same sponsor input or prove ancestry that prevents both creations from committing. Each v3 creation, report and closure job includes the creation transaction hash in its identity. A reorganisation can restore the original transaction as the winner. The catalogue then checks the original's canonical confirmation, the prior selection's orphaned checkpoint and mutual exclusion before changing its active selection. Every immutable descriptor and selection proof remains on disk. Browser recovery keys also include the creation hash, even when competing attempts share identical type arguments.

## Concurrency and operation

One durable creation reservation per fixture prevents parallel first bettors creating duplicate supported markets. Competing bettors wait for the first transaction, then enter existing shards. Short unsigned reservation leases, authenticated request limits and lifecycle priority bound sponsor denial of service. Funding leases must also coordinate with result reporting and settlement, not only with other creation requests. The UI distinguishes preparing, awaiting signature, submitting, confirming, confirmed and recoverable failure.

The sponsor currently serializes funding through one operator journal. It is a bounded pilot, not a throughput guarantee. Its recovery loop handles at most four accepted submissions every 15 seconds. Conflict discovery scans at most 64 indexer rows; ancestry is bounded to eight generations and 64 transaction reads. Exhausting a bound pauses funding for explicit investigation. Three signed retry attempts per fixture per minute limit repeated conflicts without permanently consuming a fixture's retry allowance.

## Acceptance

The contract deployment is a separate public-testnet operation. Full application verification and independent recovery review precede local service activation and GitHub publication. A deployed binary alone does not establish a usable checkout.

Rust VM tests must reject missing authorization, malformed/multiple initial positions, wrong capacities, wrong owners and unsupported lock lengths. Signed local-chain tests must exercise genuine native and EVM wallet locks, same-transaction creation and first stake, later deposits, winnings, timeout and late refunds. Browser tests must cover exact review, rejected signatures, account changes, concurrent checkout paths, invalid offers, lost responses and refresh recovery. Existing v1/v2 recovery, wallet, payment and motion suites remain mandatory.
