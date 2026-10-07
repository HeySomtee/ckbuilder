# Week 20: independently funded claims

This Rust prototype settles a bounded parimutuel market into separate, fully funded claim cells. Each claim can be consumed without the market, a shared payout cell, or backend authorization. The accompanying browser demo and recovery CLI read CKB directly.

## Run

```sh
npm run test:week20
npm run devnet:week20
npm run demo:week20
```

Open http://127.0.0.1:4120. The committed deployment manifest points to Pudge testnet. The screen shows synthetic contract fixtures, chain state and confirmed transaction links. It does not connect to Neon or the existing Streak server. Wallet selection uses CCC; the prototype supports locks with at most 20 argument bytes. No private key is served by the demo server.

The Rust environment is the same as Week 19: Rust 1.97.1, Clang, GNU ar, the RISC-V target and Python 3.12+. Windows invokes WSL. `npm run devnet:week20` owns an isolated loopback CKB node on ports 8218/8219 and stops it afterwards. Public deployment is a separate explicit command, `npm run testnet:week20`, that spends testnet CKB and creates new deployment cells. Do not rerun that command merely to view the existing demo.

## Design choice

Direct payments at settlement would use fewer cells and avoid a claim transaction. This version deliberately retains deferred claims to provide a wallet claim/recovery flow and demonstrate that fully backing claims removes redemption contention. It is a product choice, not a requirement of CKB or a universal improvement over direct payment.

The market still has four deposit shards and at most eight accepted bets per shard. Sequential selection remains off-chain. Admission and oracle eligibility still check the actual creation header; timeout uses the original six-hour `since` condition. No expiry rule was shortened for public tests.

Settlement consumes the canonical market plus all four shards and computes the immutable global totals. For every accepted ticket it creates a cell containing **the exact payout plus receipt storage**. It also pays prescribed fees or the cancellation reward and recreates a separate reserve cell holding only unallocated operator capacity and rounding dust. No claimant depends on that reserve cell. It may be reclaimed before any claim is spent.

The winning formula is unchanged: principal plus the rounded-down proportional share of losing principal after 2% protocol and 1% creator fees. A void or empty-winning outcome returns principal; losers in a resolved nonempty market recover receipt storage only. Fee output storage subsidies and cancellation rewards come from the operator reserve, not bettor principal.

## Claim transaction

```text
Inputs:   one funded claim + caller's separate wallet fee input(s)
Outputs:  exact full claim capacity to its pinned owner + caller change
Deps:     protocol code, guard code, wallet lock code
Absent:   market cell, reserve cell, other claims, oracle signature, database
```

The claim's tag-3 data retains the Week 19 owner/outcome/principal layout. Its capacity now contains the final entitlement. Only settlement may mint claims, and settlement checks their exact backing. Redemption destroys the claim and returns its entire capacity to the owner. The guard prevents type removal. Consensus rejects a second spend of the same outpoint. This version deliberately permits one claim per transaction; independent claim transactions can execute concurrently.

The tag-2 reserve retains original outcome totals for inspection but its old claim bitmap is fixed to zero. Its capacity can go only to the configured admin. The admin cannot use this cleanup path to consume outstanding claim cells.

## Capacity and cost

The cell layout occupies 321 CKB for a claim: capacity field 8 bytes, guard lock 65, type script 205, and claim data 43. The maximum shard occupies 610 CKB: the same 278 bytes of capacity/scripts plus 332 bytes of data. This replaces Week 19's 500 CKB receipt allowance and 1,000 CKB shard allowance. The control cell also receives 610 CKB for simplicity, giving an initial operator reserve of 3,050 CKB across five cells.

Minimum principal remains 100 CKB. Successful nonempty settlement adds 100 CKB of operator storage funding to each fee output; voiding pays a 100 CKB operator-funded keeper reward. These policies remain intentionally conservative. Capacity is locked storage, distinct from transaction fees.

The public scenario runner pays a fixed 500,000 shannons per transaction. The shared browser/CLI builders estimate fees at 1,000 shannons/kB through CCC. The report records actual transaction byte sizes and VM cycles separately. This is not a throughput benchmark.

## Public deployment and recovery

`web/deployment.json` contains the exact script hashes and deployment outpoints. Code cells use an unspendable zero-code-hash lock so the deployment owner cannot remove the referenced binaries. This permanently commits testnet storage capacity and provides no upgrade mechanism. Artifact generation checks the deployed binary hashes against the local build.

The public runner loads the existing development key from `.ckb-wallet.key` without printing it. Its second wallet has a generated key in `.secrets/owner.key`, which is ignored by Git and never served. The public fixture is a synthetic outcome submitted by the test operator, not a result fetched from the football API.

Standalone recovery, from this lab directory:

```sh
node scripts/claim.cjs SETTLEMENT_TX_HASH CLAIM_OUTPUT_INDEX /path/to/owner.key
```

The supplied key must match the claim owner. It needs an additional spendable fee cell. The tool and browser share `web/client.mjs`; both reject spent claims and contracts that do not match the deployment manifest.

Operator commands reuse the existing deployment:

```sh
node scripts/operator.cjs create 15
node scripts/operator.cjs report MARKET_INDEX 0
node scripts/operator.cjs settle MARKET_INDEX
node scripts/operator.cjs void MARKET_INDEX
```

`create` takes minutes until cutoff. Outcome 0 is Home, 1 Draw, 2 Away. Reporting requires the result window; voiding still needs the full six-hour consensus timeout. Creating a sandbox locks operator capacity until settlement/cancellation. A newly created descriptor is appended to the demo's manifest. Late-stake refund lock preimages are recovered from the deposit transaction's authorized inputs, so refunds do not require a database of registered wallets.

## Validation boundaries

- Rust VM tests cover structure, authorization, time, all-shard completeness, full backing, reserve separation, fee diversion, claim underpayment, recipient theft and type removal.
- Local devnet tests exercise full accepted-stake timeout refunds, independent concurrent claims and replay rejection with real signatures.
- Public testnet tests cover funded deposits, oracle submission, settlement, independent winning claims, losing-storage recovery and an expired **empty** market's timeout. The empty timeout is not presented as a public six-hour accepted-stake refund test.
- `scripts/client-testnet.cjs` separately exercises the exact shared browser/CLI builders on public testnet.
- Browser captures use live testnet reads. Automated captures do not claim to test every external wallet extension or a human confirmation dialog.

The deployed Streak custodial app is unchanged. This prototype still has a trusted oracle, atomic bounded closure, no share transfers/splits, no result disputes, no production indexer/keeper and no mainnet deployment. Admission records remain inside shards until closure. Independent claims remove payout contention, not deposit contention within one shard or the market-size bound.
