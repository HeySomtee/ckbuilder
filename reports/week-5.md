# Week 5: CKB Scroll — Permanent On-Chain Microblog

**Code:** [src/week5/scroll](../src/week5/scroll)  
**Run:** `npm run week5` → [http://localhost:4002](http://localhost:4002)

---

## The Idea

Weeks 1-4 covered address management, wallet transfers, Spore NFT minting, and
NFT-gated governance.  Week 5 steps back and asks a more fundamental question:

> What does it mean to store data on CKB — not as a token, not as metadata
> attached to an NFT, but as raw, permanent, first-class storage?

CKB Scroll is a **permanent on-chain microblog**.  Every message you submit
creates a real, live cell on the Pudge testnet.  The cell's `data` field holds
your words; the cell's `capacity` locks a proportional amount of CKBs to pay
for that storage, forever.  No type script, no protocol contract, no off-chain
database needed — the chain IS the persistence layer.

---

## What makes it different

| Property | Scroll | Ethereum contract storage | IPFS / Arweave |
|---|---|---|---|
| Ownership | Capacity owned by the poster (or faucet) | Rented from the network | Pinned by an uploader |
| Cost model | Pay once, store forever | Pay per read/write | Pay per GB per epoch |
| Timestamp | Block height (unforgeable) | Block timestamp (miner-biasable) | Content-addressed (no time) |
| Verification | Anyone with an outpoint can verify | Need ABI + event logs | Need a gateway |
| Reclaim | Spend the cell to unlock capacity | N/A | No reclaim |

---

## Architecture

```
Browser  ──POST /api/post──►  server.ts
                                  │
                           publishScrollPost()   (chain.ts)
                                  │
                          ccc.Transaction.from({
                            outputs: [{ lock: faucetLock, capacity: minCap }],
                            outputsData: ["SCROLL_V1:{…}"]
                          })
                                  │
                          completeInputsByCapacity()
                          completeFeeBy(1000n)
                          sendTransaction()
                                  │
                             Pudge testnet  ◄──── Browser links to explorer
                                  │
                           txHash stored in
                           data/posts.json (local)
                                  │
                    Background poll every 15 s
                    checkTxStatus() → "confirmed"
```

Two layers of state:

- **On-chain (authoritative)**: the actual cell, verifiable forever by anyone
  with the outpoint.
- **Off-chain (index)**: `data/posts.json` mirrors the feed so the server
  doesn't need to scan the full chain on every request.

---

## Cell anatomy

```
CellOutput {
  capacity: (61 + dataBytes) × 10^8  // shannons
  lock:     faucet secp256k1_blake160 lock
  type:     null
}
CellData: "SCROLL_V1:" + JSON.stringify({
  content,
  authorAddress,
  createdAt,
})
```

The **magic prefix** `SCROLL_V1:` lets anyone scan the chain and identify Scroll
posts without a registry.  The capacity formula follows the standard CKB rule:

```
minCap = (8 capacity_field + 32 lock.code_hash + 1 lock.hash_type + 20 lock.args + dataLen) bytes
       × 100,000,000 shannons/byte
```

A typical 100-character post costs around **230 CKB** on testnet.

---

## Key concepts learned

### Cells as owned storage units
Unlike Ethereum's `SSTORE`, which rents storage from validators, a CKB cell is
an asset you own.  You pay once (capacity), store forever, and can reclaim the
CKBs by spending (destroying) the cell later.  This changes the economics of
data: users have *skin in the game*.

### No type script required
Weeks 3-4 relied on the Spore protocol's type script for NFT semantics.
Week 5 proves that a useful application needs **zero deployed scripts** — just
raw cells with structured data and a normal lock.  This is the simplest possible
CKB primitive.

### Block height as a trusted timestamp
There is no `Date.now()` on a blockchain.  CKB cells are included in blocks,
and block numbers are monotonically increasing.  Anyone can verify *when* a
cell was created without trusting any off-chain oracle — the block itself is
the timestamp.

### CCC transaction building (manual)
Previous weeks used the high-level `createSpore` helper.  Week 5 builds
transactions from scratch:

```typescript
const tx = ccc.Transaction.from({
  outputs: [{ lock: myLock, capacity: minCapacity }],
  outputsData: [ccc.hexFrom(dataBytes)],
});
await tx.completeInputsByCapacity(signer);   // collect UTXOs
await tx.completeFeeBy(signer, 1000n);       // add change + fee
const txHash = await signer.sendTransaction(tx);
```

This is the core mental model for all CKB development — everything else
(Spore, xUDT, Nervos DAO) is just a more constrained version of this flow.

---

## Features shipped

- **Permanent publishing**: every post is a real CKB testnet cell.
- **Cost estimator**: the compose form shows the CKB cost before you submit.
- **Live feed**: auto-refreshes every 15 s; shows pending → confirmed
  transitions as the background poller updates statuses.
- **Tip button**: send CKBs directly to an author's address.
- **Pudge links**: every confirmed post links directly to the Pudge testnet
  explorer so anyone can verify the cell on-chain.
- **Animated hex grid**: canvas background visualises drifting CKB cells —
  purely aesthetic, but sets the mood.

---

## What's next (Stage 2 ideas)

- **Verify by outpoint**: add a `/api/verify/:txHash/:index` endpoint that
  fetches the live cell from the node and decodes the data, proving the post
  is still unspent (i.e., the author hasn't reclaimed the capacity).
- **sUDT token posts**: charge posters a small amount of a custom sUDT token
  instead of (or alongside) raw CKBs — introduces fungible token logic.
- **Type ID upgradeable registry**: deploy a Type-ID-based registry cell that
  stores all Scroll post outpoints; this removes the dependency on the local
  JSON index.
- **Molecule encoding**: swap the JSON payload for a Molecule-serialized
  struct to reduce data size and demonstrate CKB's native serialisation format.
