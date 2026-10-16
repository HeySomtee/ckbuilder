# Streak direct contract v4

This separate workspace supports one atomic payment for up to eight independent predictions. A transaction can create markets with their first ticket, add tickets to existing v4 markets, or combine both. Historical contracts stay unchanged. No deployment is configured until separately verified and pinned.

## Arguments and identity

Arguments remain 172 bytes. Their first 36 bytes have a new meaning in v4.

| Byte range | Value                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| 0 to 31    | CKB Blake2b-256 of input 0's serialized 36-byte previous outpoint                  |
| 32 to 35   | Unsigned little-endian 32-bit absolute index of this market's first genesis output |
| 36 to 67   | Administrator lock hash                                                            |
| 68 to 75   | Scheduled kickoff in milliseconds, unsigned little-endian 64-bit                   |
| 76 to 107  | Guard code hash                                                                    |
| 108 to 139 | Protocol fee recipient lock hash                                                   |
| 140 to 171 | Creator fee recipient lock hash                                                    |

Hash personalization is `ckb-default-hash`, matching `ccc.hashCkb`. The genesis output index distinguishes markets created from the same funding input, including fixtures with identical kickoff times. A consumed input cannot create the same identity again. Later entries can place the market's outputs at a different transaction index without changing its stored genesis identity.

## Atomic entry layout

Every market owns a contiguous block of typed outputs. New markets produce their control cell followed by shards 0 through 3. Shard 0 has exactly one pending ticket; other shards are empty. Existing markets consume one shard and produce one replacement shard. If the prior pending ticket was committed at or after kickoff, its exact principal and storage refund occupies the plain output immediately after that replacement shard. Different market blocks cannot share this refund output.

Entry transactions permit at most eight distinct v4 type groups and at most 64 inputs and 64 outputs. Foreign typed inputs or outputs are rejected. Each market checks its own ticket sequence, owner authorization, headers and capacity. All groups must validate for the single transaction to commit.

The first bettor and administrator authorize creation. A funded-market entry requires its bettor's authorization. A basket containing only existing markets does not require administrator authorization. The application must still verify each payer's exact net contribution before signing. Lock presence alone does not attribute contributions when several parties fund a transaction.

All amounts remain unchanged: each control or shard reserve is 610 CKB, a new market requires 3050 CKB reserve, and every ticket funds 321 CKB claim storage. The minimum principal is 100 CKB and supported lock arguments are at most 59 bytes. The configured oracle, six-hour timeout, losing-pool fees, independent claims and reserve ownership remain unchanged.

Creation cannot know its future inclusion timestamp. A later transition uses its actual creation-block header to admit a timely pending ticket or refund a late ticket. A local clock or transaction since value does not enforce an upper inclusion deadline.

## Settlement and compatibility

Report, close, claim and reserve-recovery transactions remain single-market operations. They reject every foreign typed input or output, including another v4 market or an older generation. Their absolute payout layout belongs to only that market, so another group cannot count the same output as its payment. The unchanged guard checks each guarded input's pinned type hash; the v4 type script enforces the additional transaction-wide isolation.

Existing v2 and v3 markets cannot be included in a v4 payment. Their deployed rules and exit tooling remain available. New combined payments use v4 markets. Changing an application's preferred generation does not move existing positions or alter their original contracts.

## Offline verification

From the repository root:

```powershell
node products/streak/contracts/direct-v4/scripts/run.cjs build
node products/streak/contracts/direct-v4/scripts/run.cjs test
```

The wrapper uses pinned Rust 1.97.1, cached dependencies, locked offline builds and the RISC-V target with atomic lowering. It verifies the binary hash and size against `build-manifest.json`. Generated files remain in ignored directories.

VM tests retain the prior admission, result, settlement, fees, claim, guard and lock-boundary cases. Additional tests cover eight simultaneous entries, mixed creation and deposits, unique genesis identities, relative output blocks, separate late refunds, exact capacities, authorization, excessive groups and mixed-operation rejection. On 16 October 2026, all 15 test groups and 149 labelled checks passed. Test wallet locks use `ALWAYS_SUCCESS` to isolate contract validation.

The separate signed integration lane runs the actual product browser and operator adapters on a disposable loopback CKB devnet:

```powershell
node products/streak/scripts/batch-devnet-run.cjs
```

It requires the pinned local CKB binary and previously prepared offline OmniLock artifact. It strips sensitive environment variables, refuses occupied node ports and stops only its own node. The lane passed 37 product checks and three chain checks on 16 October. It covers native and genuine OmniLock EVM signatures, eight new or already funded markets, mixed payments, exact contributor accounting, interrupted responses, independent claims, late refunds and real reorganisation recovery. A published creation can be replaced after a canonical owner conflict, and an original transaction can become the selected instance again after the conflict is orphaned. Both histories remain intact.

Generated evidence is in `.quality-artifacts/batch-chain/devnet.json` at the repository root. These are synthetic fixtures, public development keys and a local chain. Public deployment, real football resolution and physical wallet checks remain separate evidence.
