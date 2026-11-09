# Three concurrent prediction payments

9 November 2026. Verified release on top of `54e50ab`. Hosted activation and
physical-wallet acceptance remain separate. No production funds have been moved.

## What changes

Up to three different wallets can review and submit predictions while earlier
payments await approval or confirmation. The fourth waits in the existing queue.
One operator lease still serializes allocation and signing; it is released while
people approve in their wallets and while CKB confirms transactions.

Each payment reserves its exact sponsor, owner and market inputs on durable disk.
Pending outputs cannot fund another offer. Existing markets use different available
lanes; a new fixture has one creation in flight. A fixture-specific wait yields its
queue position so unrelated requests can proceed. Each wallet retains one active
payment. Competition entry and normal settlement use the existing flow.

## Safety and limits

- Three slots include unsigned reviews, accepted partial signatures and unresolved
  signed transactions. Unknown delivery retains its slot. Restart reads the same
  offers and immutable journal; it never creates replacement signatures.
- Four canonical confirmations release a completed slot. A pending child does not
  prove its parent: the barrier rechecks unproven ancestors and restores their
  owner, input, output and creation reservations after a reorg.
- Legacy operations, deployment, report and close retain the strict barrier. Ready
  report/close work requests a five-minute, operation-specific admission pause.
  Fresh readiness renews that scheduling lease. Expiry does not release money
  reservations; the strict barrier still protects lifecycle signing.
- Browser verification reads committed unrelated shards, then checks its selected
  inputs and control dependency against the mempool. Claims and Activity keep
  their existing discovery rules.
- Pending creations count toward the 256-market catalogue limit. Markets remain
  four lanes and 32 positions. No script migration or capacity increase is included.
- Sponsorship prizes and other rewards-wallet payments are outside this increment.
  Their existing reservations and processing remain unchanged.

## Hosted activation

Deploy the tested release, then ensure the existing sponsor address has at least
three separate plain funding cells with four confirmations. **One 100,000 tCKB cell
is still only one independently spendable input.**

For a worst-case eight-new-market slip, one payment reserves 24,400 tCKB plus valid
sponsor change. Three separate transfers of 25,000 tCKB each provide three initial
funding cells for that case. Verify the configured sponsor address before sending.
These reserves are locked capacity, not all network fees. Every new market consumes
part of a cell's available capacity, so this is an initial funding example, not
unlimited throughput. Existing funds can instead be split through a separately
reviewed maintenance transaction. This release performs no automatic split.

With fewer suitable cells, payments queue safely. Do not start extra signer
processes or delete recovery records to increase concurrency.

Rehearse with three funded wallets and a fourth observer account: submit to
different fixtures, then three picks on one already-created fixture. Confirm all
three reach pending together, the fourth waits, reload preserves progress, and
Activity/competition entries arrive after confirmation. Measure preparation and
confirmation separately. Physical wallets and Render remain unverified locally.

## Evidence

- Backend regressions cover three creations and three lanes, FIFO overflow,
  insufficient independent funding, cancellation, one wallet per payment, pending
  creation capacity, restart, shallow confirmation, RPC failure, reorg ancestry and
  lifecycle scheduling expiry.
- All 18 combined-payment browser unit tests pass, including another shard pending
  while the selected input and control still require fresh validation.
- The real isolated CKB devnet accepted three signed transactions in its mempool
  before mining any block, both across fixtures and within one fixture. The fourth
  queued. This uses synthetic accounts and fixtures, not public-testnet evidence.
- Independent money/recovery review found no remaining blocking issue after fixing
  ancestor pruning and local queue blocking.
- All 100 required stages have passing local evidence. The major command completed
  80 stages before the tool process was interrupted. Its unfinished wallet stage
  and remaining browser checks then passed, followed by all twelve contract and
  signed-chain stages. Application runtime hashes match across those runs. This
  is completed required coverage, not an uninterrupted major-command pass. The
  first resumed contract run stopped at Five because its disposable database URL
  was missing; both Five stages passed after restoring that local dependency.
- The new concurrency scenario has its own required signed-devnet stage. An early
  combined test run exceeded the existing harness deadline; splitting the extra
  scenario preserves that deadline and all older assertions. Both final stages pass.
- Ignored local evidence: `concurrency-major.log`,
  `concurrency-resumed-browser.json`, `concurrency-resumed-contracts.json`,
  `concurrency-five-resumed-contracts.json`, `concurrency-final-coverage.json`
  and the matching runtime manifest. Hosted CI
  remains paused; public-network and physical-wallet evidence are not implied.
