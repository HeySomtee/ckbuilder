# Week 19: sharded parimutuel settlement

This is a separate local Rust prototype. It extends the Week 18 deadline work into a complete bounded market lifecycle: create, deposit across four shards, resolve or void, consolidate, redeem, and recover the operator reserve. It does not migrate the Streak application or handle real funds.

## Run

From the repository root:

```sh
npm ci
npm run test:week19
npm run devnet:week19
npm run evidence:week19
```

Windows uses the default WSL distribution for Rust and the CKB node. Install Rust through rustup, Clang, GNU ar, Python 3.12+, and Node 20+. The pinned toolchain installs Rust 1.97.1 and `riscv64imac-unknown-none-elf`. The devnet runner downloads the official CKB 0.210.0 release and checks its archive SHA-256. Ports 8218 and 8219 must be free. It owns and stops only the node it starts.

Run tests before the devnet because the latter deploys the compiled binaries. Evidence generation checks binary hashes against the completed devnet run. Screenshots use Playwright from the Streak installation. VM tests use mock wallet locks; devnet tests use real secp256k1 signatures and the public keys supplied with CKB's dev chain. No application wallet or environment file is read.

## Transaction flow

1. **Create.** The configured admin signs one transaction creating the control cell and exactly four distinct shards, numbered 0 to 3. Each receives 1,000 CKB of operator storage reserve. The market identity includes the first funding input's outpoint, admin, kickoff, guard code hash and two fee beneficiaries. These terms cannot change.
2. **Deposit.** A wallet consumes one shard and adds principal plus 500 CKB reserved for its eventual share cell. A bet is a record containing the owner's lock hash, selected outcome and principal. There is at most one provisional record per shard. The control cell is a read-only dependency and must still be open. Other shards remain available.
3. **Check the preceding deposit.** Before another deposit replaces that shard, the script reads its actual creation header. A provisional bet committed before kickoff moves into the accepted list. A late bet must be refunded in that transaction. A transaction builder cannot claim that a late deposit arrived earlier by choosing an old header.
4. **Report.** The backend signs a control-cell transition containing Home, Draw or Away. The report is provisional until its creation block is checked. Its timestamp must be at least kickoff and strictly before kickoff plus six hours. It cannot be replaced or corrected in this version.
5. **Close.** Any caller consumes the control cell and all four shards in numeric order. It checks the remaining provisional deposits, refunds late ones, derives the complete totals, creates a receipt for every accepted bet, and consolidates the backing into one payout cell. It cannot omit or duplicate a shard or invent the denominator. A timely report wins even if closure happens later.
6. **Void instead.** Without a timely report, closure requires an absolute timestamp `since` at the six-hour deadline. Consensus checks maturity. Accepted bets become refundable receipts. Late bets are refunded directly. There are no betting fees. The caller's chosen recipient receives 100 CKB from the operator reserve as the cancellation reward.
7. **Redeem.** Consume the payout cell and one share cell. Recreate the payout cell with the same totals and that claim's bit cleared. Pay the exact amount, including share storage, to the pinned owner. Anyone may submit this transaction, but cannot redirect payment. The share is destroyed. After every bit is cleared, remaining reserve and rounding dust can go only to the original admin.

The script validates transitions. The builder chooses shards and constructs transactions. `Router` uses sequential round-robin selection, reserves locally pending shards, skips full or busy shards, and supports bounded conflict retries after refreshing cell state. It is not a global coordinator. Two independent builders may still pick the same shard. The devnet demonstrates both parallel submissions to different shards and rejection of a stale competing spend.

## What a share means here

One shannon of accepted principal represents one unit of the selected outcome's claim. The owner and amount are recorded in the shard before closure. **Separate redeemable share cells are minted at closure, not immediately on deposit.** This deliberate prototype choice keeps the accepted set enumerable and makes omission detectable. These are indivisible, nontransferable receipts, not an ERC-20, ERC-1155 or xUDT implementation.

The four shards share one market and one set of odds. They are not four separate betting pools. There are at most eight accepted bets per shard and 32 per market. The limit includes any remaining provisional bet. Arbitrary high-volume admission and transferable positions need another design iteration.

## Money rules

All arithmetic uses integer shannons. Multiplication for proportional payouts uses `u128`, then divides down. Totals use checked addition. The winning denominator is immutable after closure.

For original winning principal `W`, losing principal `L`, and a winning ticket `s`:

```text
protocol fee = floor(L / 50)
creator fee  = floor(L / 100)
profit pool  = L - protocol fee - creator fee
entitlement  = s + floor(s * profit pool / W)
wallet output = entitlement + 500 CKB share storage
```

A losing receipt returns its 500 CKB storage only. A void market or empty winning outcome returns principal plus storage, with no betting fee. Principal must be at least 100 CKB in this lab. Fees pay the immutable beneficiary hashes, which are distinct in the fixtures. The production creator-beneficiary policy remains undecided.

If there is losing principal and a nonempty winning outcome, each fee output also receives 100 CKB from the operator reserve so small fees can occupy a normal cell. This subsidy is separate from the fee and is deliberately generous for the lab. A void pays only the cancellation reward; an empty-winning market pays neither fees nor that reward. There is no production capacity optimization here.

The operator starts with 5,000 CKB reserved across five cells. Bettors supply their own receipt storage. The fixed reserve remains sufficient for the bounded data layout. Authorized wallet input locks are restricted to at most 20 argument bytes. Fee beneficiary lock scripts must also fit their outputs; clients must validate those configured beneficiaries before funding a market. The contract currently pins hashes, not a registry of supported wallets.

## Cell layout

The market's control, shards, payout and receipts share one type-script identity. One group invocation validates the entire transition. A separate guard lock requires every consumed cell to retain its pinned type identity. This allows permissionless close and redemption without giving a backend key the ability to spend pool funds arbitrarily.

Type arguments are 172 bytes:

| Bytes | Meaning |
| --- | --- |
| 0..36 | Creation funding outpoint |
| 36..68 | Admin lock hash |
| 68..76 | Scheduled kickoff, little-endian u64 milliseconds |
| 76..108 | Guard code hash |
| 108..140 | Protocol fee beneficiary lock hash |
| 140..172 | Creator fee beneficiary lock hash |

| Role | Data |
| --- | --- |
| Control | Tag 0, phase 0 open or 1 report pending, outcome 0/1/2 or 255 |
| Shard | Tag 1, shard number, accepted count, provisional flag, accepted records, optional provisional record |
| Payout | Tag 2, outcome or 255 void, three original u64 totals, u64 unredeemed bitmap |
| Receipt | Tag 3, claim index, one bet record |
| Bet record | Owner lock hash (32), outcome (1), principal u64 (8) |

Protocol outputs must precede ordinary outputs. Closure orders its inputs as control then shards 0 through 3. Redemption orders its inputs as payout then receipt. Plain refunds and fee outputs have prescribed positions, preventing multiple obligations from counting the same payment. Transactions mixing different market identities under this code are rejected.

Exit codes: 5 malformed structure, 6 authorization or recipient, 7 time, 8 invalid transition or accounting identity, 9 capacity or amount, 10 missing actual creation header, 11 missing open market dependency.

## EVM references and differences

[Gnosis Conditional Tokens](https://github.com/gnosis/conditional-tokens-contracts/blob/master/contracts/ConditionalTokens.sol) is the reference for oracle-bound outcomes and burning positions at redemption. Its complete-set collateral splitting and ERC-1155 transfers are not reproduced. Here one selected outcome receives a stake, and winnings come from the losing pool.

[ERC-4626](https://eips.ethereum.org/EIPS/eip-4626) informs the separation of assets, shares, redemption and explicit rounding. This is not a vault with an ERC-20 share exchange rate, and it does not claim ERC-4626 compliance. [OpenZeppelin's access-control documentation](https://docs.openzeppelin.com/contracts/5.x/access-control) informs explicit privileged operations. This version has one pinned admin, not a role registry or imported Solidity module.

## Limits to review

- Deposits scale across four spendable shards, but redemption uses one payout cell and is sequential. Closure is also one atomic transaction.
- The 32-bet limit bounds transaction size and validation work. Increasing it needs measurements and potentially a different commitment scheme.
- The oracle can report a false result or remain silent. Time bounds and refunds limit its powers but do not prove football results.
- Deadlines use cell creation block timestamps; timeout maturity uses CKB's consensus time rules. They are not exact wall-clock guarantees.
- The admin address is configured per market. Clients must pin an approved admin and fee configuration; this is not a global market-creation allowlist.
- There is no deployed contract registry, upgrade path, correction/dispute mechanism, production indexer or keeper, or football API wiring in the lab.
- Receipts cannot transfer, split or merge. Late deposit refunds may wait for another shard update or closure. A production builder should stop submissions before kickoff and handle confirmation uncertainty.
- Code deployment cells in the devnet are controlled by the fixture admin. Production code availability must use a suitable permanent deployment policy.
- The existing Streak application still uses its custodial ledger. This contract is not integrated with it and has not been audited or deployed to public testnet/mainnet.

See [the Week 19 report](../../../reports/week-19.md) and [the executable scenarios](tests/tests/protocol.rs).
