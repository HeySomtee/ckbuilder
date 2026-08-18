# Week 13: My First On-Chain Script - A Lock Written in TypeScript (ckb-js-vm)

For seven weeks the Streak Terminal grew into a real product, and for seven weeks
it carried the same asterisk. Every deposit, every payout, every "custody" claim
ultimately leaned on a private key the server held. Week 12 removed the per-user
keys and moved login to the wallet, but the pooled escrow still lives in a
treasury the server signs for. The reason was always the same: I had only ever
written the **off-chain** half of CKB. I could build and send transactions with
CCC all day, but I had never written the **on-chain** half, the code that lives
in a cell and decides whether a transaction is allowed to spend it.

Week 13 crosses that line. It is my first CKB **script**: a lock, written in
TypeScript, compiled to RISC-V bytecode, and executed by
[ckb-js-vm](https://github.com/nervosnetwork/ckb-js-vm) inside the CKB virtual
machine. It is deliberately small, a hash-lock, but it is real: it runs on the
actual VM, it passes and fails transactions for the right reasons, and it is the
first brick in replacing the treasury's server-held custody with custody a script
enforces.

**Code:** [src/week13/vault-lock](../src/week13/vault-lock)
**Run:** `npm run build && npm test` (needs `ckb-debugger` on `PATH`)

## A script is a validator, not a program

The mental shift this week was understanding what a CKB script *is*. Coming from
Ethereum-shaped intuitions, you expect a "contract" to hold state and mutate it.
CKB is the opposite. State lives in **cells**; a script is a pure function the VM
runs during transaction verification, and its only job is to answer one question:
*may this transaction proceed?* It reads the transaction and its own arguments,
and it returns `0` to allow or a non-zero code to reject. It stores nothing and
changes nothing.

A **lock** script guards spending: it runs for every input cell it locks, and the
cell can only be consumed if the lock returns `0`. That is exactly the primitive
the treasury needs. Instead of "the server holds the key and promises to behave,"
a lock says "these coins move only when the transaction satisfies this code."

## Why TypeScript on ckb-js-vm

CKB scripts are RISC-V binaries. The canonical way to produce one is Rust with
`ckb-std`, but that means a full RISC-V toolchain, and this machine has no Rust.
The alternative is [ckb-js-vm](https://github.com/nervosnetwork/ckb-js-vm): a
QuickJS interpreter, itself compiled to RISC-V, that runs JavaScript or
TypeScript as an on-chain script. You write the logic in TypeScript against
`@ckb-js-std/core`, bundle it with esbuild, and compile it to QuickJS bytecode.

The tradeoff is honest and worth stating: interpreting JS costs cycles. Unlocking
this lock burns about **13.3 million cycles**; the equivalent in Rust would be a
fraction of that. For a learning project and for logic that runs rarely, paying
cycles to write in a language I already know is a good trade. For a
high-frequency mainnet script it would not be, and that is the moment to reach
for Rust.

## The lock itself

The rule is the simplest thing that is still a genuine lock. The args hold a
32-byte commitment, `hashCkb(preimage)`. To spend the cell, the transaction must
reveal the matching `preimage` in the witness. The whole script is a few lines
([src/week13/vault-lock/src/index.ts](../src/week13/vault-lock/src/index.ts)):

```ts
import * as bindings from "@ckb-js-std/bindings";
import { HighLevel, bytesEq, hashCkb } from "@ckb-js-std/core";

function main(): number {
  const commitment = HighLevel.loadScript().args.slice(35);   // our 32-byte hash
  if (commitment.byteLength !== 32) return 1;                 // malformed args

  const witness = HighLevel.loadWitnessArgs(0, bindings.SOURCE_GROUP_INPUT);
  const preimage = witness.lock ?? new ArrayBuffer(0);         // revealed secret

  return bytesEq(hashCkb(preimage), commitment) ? 0 : 2;       // 0 = unlock
}

bindings.exit(main());
```

This is the atom of a hash-time-locked contract, the same mechanism that lets
Lightning-style channels and cross-chain swaps release funds against a revealed
secret. It is not, on its own, a finished escrow: a bare hash-lock reveals its
preimage on-chain the moment it is spent, so anyone watching could reuse that
secret elsewhere. Real HTLCs pair the hash branch with a signature and a
time-locked refund. Those branches are the natural next iteration; this week is
about getting one branch provably correct.

## The 35-byte surprise

The first thing that did not work was reading the args. `loadScript().args` did
not start with my commitment; it started with 35 bytes of something else. That is
ckb-js-vm's loader header. Because the on-chain code is the generic interpreter,
not my script, the script's args have to tell the VM *which* JavaScript to run:
the layout is 2 bytes of loader flags, then the 32-byte code hash of the JS cell,
then 1 byte of hash type, and only then my own arguments. Hence the `.slice(35)`.
It is obvious in hindsight and completely opaque until you know it, which made it
a good reminder that ckb-js-vm adds one indirection on top of the normal
lock-args model.

## Proving it on the real VM

The point of a script is worthless if it only "looks right," so the deliverable
is a test that runs the compiled bytecode on the actual CKB-VM and checks both
outcomes. `ckb-testtool` mocks the cells and transaction, and a `Verifier`
executes the scripts through `ckb-debugger`
([src/week13/vault-lock/test/run.cts](../src/week13/vault-lock/test/run.cts)):

```ts
const commitment = hashCkb(preimage);
// ... build a tx whose input is locked by the ckb-js-vm hash-lock ...
const cycles = await Verifier.from(resource, tx).verifySuccess();      // exit 0
await Verifier.from(resource, tx2).verifyFailure(2);                    // wrong preimage
```

The output is the whole point of the week:

```
ok  correct preimage unlocked the vault (cycles: 13373297)
ok  wrong preimage was rejected (script exit code 2)
```

Two toolchain notes cost real time and are worth recording. First, `ckb-testtool`
does not bundle the VM runner; it shells out to `ckb-debugger`, a native binary.
There is a prebuilt Windows build in the debugger's releases, which is what made
the whole TypeScript path viable without Rust. Second, `ckb-testtool`'s ESM build
references `__dirname` and crashes under Node's ES module loader; the fix was to
run the test as CommonJS (`.cts`) so it resolves the package's working CJS entry,
while the contract itself stays an ES module. A small thing, but it is the kind of
detail that turns "should work" into "works."

## What this week proved

- **On-chain and off-chain are different disciplines.** Twelve weeks of CCC taught
  me to *build* transactions; this week taught me to *judge* them. A lock is a
  validator that returns yes or no, and thinking in those terms is the real
  unlock.
- **ckb-js-vm makes scripts approachable without abandoning rigor.** I wrote the
  lock in the language I know and still ran it on the same VM a Rust script would
  use. The cycle cost is the visible, honest price of that convenience.
- **The args indirection is the one non-obvious gotcha.** ckb-js-vm's 35-byte
  loader header sits in front of your arguments; miss it and nothing decodes.
- **A test on the real VM is the deliverable.** Passing *and* failing for the
  right exit codes, in cycles, is what separates a script that compiles from a
  script that works.

## Next

1. Add the missing HTLC branches: a signature check for the owner and a
   time-locked refund path, turning the atom into a real escrow.
2. Deploy the lock to Pudge testnet and exercise a lock-then-unlock round trip
   with CCC, closing the loop from off-chain construction to on-chain enforcement.
3. Wire it under the Streak treasury so pooled stakes are governed by a script
   rather than a server-held key, finally retiring the custody asterisk that has
   followed this product since week 7.
