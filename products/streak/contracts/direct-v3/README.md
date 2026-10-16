# Streak direct contract v3

This separate workspace adds market creation and its first prediction in one
transaction. Historical v1 and v2 contracts and recovery rules stay unchanged.
Build and test commands perform no deployment or public transaction.

Creation requires the administrator's and first bettor's input authorization.
The first input outpoint still defines market identity. The control cell is
unreported with exactly 610 CKB. Shard 0 holds exactly one pending ticket, no
accepted tickets, and exactly 610 CKB plus principal and 321 CKB claim storage.
Shards 1 through 3 remain empty with exactly 610 CKB each. Empty creation fails.
The existing 100 CKB minimum principal and 59-byte lock-argument bound remain.

Creation cannot check its own future block timestamp. A later shard transition
or market closure checks the actual input creation header. A first ticket
committed strictly before kickoff is admitted. At or after kickoff it receives
a full principal and storage refund. A local clock or since value does not
provide an upper inclusion deadline.

The application sponsors the 3050 CKB reserve. Input authorization does not
attribute net contributions to individual parties. Both signing adapters must
verify exact sponsor and bettor inputs, changes, ticket, fees, terms, and the
configured administrator and fee recipients. Lock presence alone cannot prove
that the bettor paid their principal and storage.

All later transitions, layouts and economics are unchanged. Claims remain
independent. Reserve recovery pays the pinned administrator without consuming
claim cells. Fixed fee-output capacities and the timeout keeper reward come
from reserve capacity, never user principal. The guard code is unchanged.

## Offline verification

From the repository root:

```powershell
node products/streak/contracts/direct-v3/scripts/run.cjs build
node products/streak/contracts/direct-v3/scripts/run.cjs test
```

Windows uses installed WSL, Rust 1.97.1, the riscv64imac-unknown-none-elf target,
Clang and cached Cargo dependencies. Builds are locked and offline, with CKB-VM
atomic lowering. The wrapper verifies compiled hashes and sizes against
build-manifest.json. Missing dependencies fail the check. Generated output stays
under ignored target/ and artifacts/ directories.

The VM suite retains admission, reporting, closure, fees, claims, guard and
wallet-lock boundary tests. New creation cases reject missing authorization,
wrong origin or owner, absent or additional tickets, prematurely accepted
positions, nonempty other shards, incorrect capacity and arithmetic overflow.
Creation timestamp cases cover replacement, settlement and void refunds before,
at and after kickoff.

VM locks use ALWAYS_SUCCESS to isolate contract rules. The separate sponsored
devnet lane exercises actual native and OmniLock signatures, exact contributions,
claims, refunds and recovery on a disposable local node. Its fixtures and oracle
responses are synthetic. Local verification is not public-chain lifecycle proof.

## Pinned testnet deployment

The separately authorized deployment is recorded in `build-manifest.json`.
The 30,320-byte protocol has code hash
`0x1adbf49e05f294891e33403f399046d6de907ea18c8c256c069538a4f0508888`.
Its testnet code cell is output 0 of
[the v3 deployment transaction](https://pudge.explorer.nervos.org/transaction/0x243a71ceeaa06478fa8b74ba807407de55f184bfd125a03f4432babd1a9c1135).
The unchanged guard uses the earlier pinned output recorded in the manifest.
Deployment establishes code availability. It does not establish that a real
football market, sponsored payment or settlement has been completed publicly.
See the [delivery record](../../docs/delivery/sponsored-creation.md) for separate
integration and public verification evidence.
