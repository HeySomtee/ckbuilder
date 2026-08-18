# Week 13 - Vault Lock (a CKB lock script in TypeScript)

A first on-chain CKB **lock script**, written in TypeScript and executed by
[ckb-js-vm](https://github.com/nervosnetwork/ckb-js-vm) (QuickJS compiled to
RISC-V). It is a **hash-lock**: a cell unlocks only when the spender reveals a
preimage whose CKB blake2b hash matches the 32-byte commitment stored in the
lock args. That is the atom of a hash-time-locked contract (HTLC) and the first
step toward replacing the Streak treasury's server-held custody with custody
enforced by code.

See the writeup: [reports/week-13.md](../../../reports/week-13.md).

## How it works

- **Lock args** hold a 32-byte commitment `hashCkb(preimage)` (after ckb-js-vm's
  35-byte loader header: 2 bytes loader + 32 bytes JS code hash + 1 byte hash type).
- **Witness** carries the revealed `preimage` in its `lock` field.
- The script ([src/index.ts](src/index.ts)) returns `0` (unlock) iff
  `hashCkb(preimage) == commitment`, else a non-zero error code.

```ts
const commitment = HighLevel.loadScript().args.slice(35);
const preimage = HighLevel.loadWitnessArgs(0, bindings.SOURCE_GROUP_INPUT).lock ?? new ArrayBuffer(0);
return bytesEq(hashCkb(preimage), commitment) ? 0 : 2;
```

## Prerequisites

- Node 20+ and `npm`.
- **ckb-debugger** on your `PATH` (ckb-testtool spawns it to run the VM). Grab a
  prebuilt binary from the
  [ckb-standalone-debugger releases](https://github.com/nervosnetwork/ckb-standalone-debugger/releases):

  ```bash
  # from this folder; example is the Windows x64 build
  mkdir -p .tools && cd .tools
  curl -fsSL -o d.tar.gz \
    https://github.com/nervosnetwork/ckb-standalone-debugger/releases/download/v1.1.1/ckb-debugger_v1.1.1_x86_64-pc-windows-msvc.tar.gz
  tar -xzf d.tar.gz && rm d.tar.gz && cd ..
  export PATH="$PWD/.tools:$PATH"   # add .tools to PATH for this shell
  ```

  (Pick the `aarch64-apple-darwin` or `x86_64-unknown-linux-gnu` asset on macOS/Linux.)

## Build and test

```bash
npm install
npm run build   # tsc + esbuild bundle + compile to dist/index.bc (ckb-js-vm bytecode)
npm test        # runs the lock on the real CKB-VM via ckb-testtool
```

Expected:

```
ok  correct preimage unlocked the vault (cycles: ~13.3M)
ok  wrong preimage was rejected (script exit code 2)
All vault-lock tests passed.
```

## Layout

- [src/index.ts](src/index.ts) - the lock script (runs on-chain).
- [test/run.cts](test/run.cts) - unit tests on the CKB-VM (CommonJS; ckb-testtool's
  ESM build has a `__dirname` bug, so it is consumed via its CJS entry).
- `dist/` - build output (`index.js` bundle, `index.bc` bytecode); git-ignored.
- `.tools/` - local `ckb-debugger` binary; git-ignored.
