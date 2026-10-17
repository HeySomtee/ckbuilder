# Streak direct contract v2

This is a separate product workspace derived from the Week 20 Rust lab. Historical
lab sources and the deployed v1 contract remain unchanged. No deployment is
performed by these build or test commands.

The single protocol rule change increases the maximum input lock argument length
accepted by market creation, result reporting and deposits from 20 to 59 bytes.
This admits 22-byte wallet locks, including the argument layout used by the
MetaMask OmniLock adapter. It does not replace or bypass the wallet lock script.
CKB still executes that lock when its input is consumed.

A plain 100 CKB fee or keeper output occupies 8 bytes of capacity, 32 bytes of lock
code hash, one hash-type byte, and its lock arguments. The uniform 59-byte bound
therefore keeps the fixed 100 CKB outputs valid. It also fits every 321 CKB minimum
owner claim. Allowing arbitrary lock lengths would make some fixed payments
unspendable. The VM tests calculate occupied capacity with CKB's own types and
exercise both sides of the 59/60-byte boundary.

All 172-byte market arguments, cell layouts, timing rules, four-shard limits,
principal minimum, 321 CKB storage, fees, payout rounding and claim ownership rules
are retained. Claim and reserve spends remain permissionless transactions whose
entire payout must go to the pinned owner. The guard source and compiled hash are
unchanged. Existing positions must continue using their original v1 protocol hash;
v2 is a new type-script deployment, not an in-place upgrade.

## Reproducible local verification

From the repository root:

```powershell
node products/streak/contracts/direct-v2/scripts/run.cjs build
node products/streak/contracts/direct-v2/scripts/run.cjs test
```

Windows uses WSL. The runner requires the existing Rust 1.97.1 toolchain,
`riscv64imac-unknown-none-elf` target, Clang, and cached Cargo dependencies. Builds
are offline and locked. Release flags retain overflow checks, LTO, one codegen
unit, stripping, and CKB-VM atomic lowering. A missing toolchain or dependency is a
failed check, not a skipped test. No installer, key file, provider or public RPC is
invoked. The wrapper verifies both compiled binaries against
[`build-manifest.json`](build-manifest.json).

The carried-over VM suite checks creation, admission, reporting, cutoff headers,
six-hour cancellation, all-shard closure, capacity conservation, independent
claims, recipient theft and guard type removal. Additional cases cover 22-byte
and 59-byte owners and administrators, 60-byte authorization rejection, minimum
losing claims, winner claims, full void refunds, late-deposit refunds, fixed fee
and keeper outputs, and wrong-owner payments.

VM owner fixtures use `ALWAYS_SUCCESS` locks to isolate this protocol's argument
length, lock-hash and payout rules. Passing these tests does not demonstrate
MetaMask signing, OmniLock witness verification, hardware-wallet compatibility,
public-chain execution or deployment. Those need separate product integration
evidence. Generated binaries and VM logs remain under ignored `target/` and
`artifacts/` directories.
