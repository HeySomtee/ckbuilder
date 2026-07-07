# Week 7: Streak Terminal — On-Chain Custody & the Live Oracle

Week 6 built the parimutuel market engine, but everything in it was virtual:
bets moved numbers around an in-memory escrow balance. Week 7 grounds that
engine in reality. It adds the two pieces that make Streak a *real* CKB product
rather than a simulator:

1. A **custodial on-chain bridge** — every CKB on the platform corresponds to a
   real transaction on the Pudge testnet.
2. A **live oracle** — the worldcup26.ir results feed that decides which outcome
   actually won, with a deterministic simulator as a graceful fallback.

**Code:** [products/streak](../products/streak)
**Run:** `npm run streak` → [http://localhost:4100](http://localhost:4100)

## The custody model: fast bets, real money

The core tension is that betting needs to feel instant, but a real deposit or
withdrawal is a slow on-chain transaction that also pays a cell-floor. Paying a
~61 CKB cell floor plus a fee on every 10 CKB micro-bet would be absurd.

Streak resolves this the same way Polymarket does with USDC and a custodial
smart account: **money enters and leaves on-chain, but trading happens against a
virtual ledger.**

```
Deposit    real Pudge tx   wallet   → treasury   → credit escrow
Bet/claim  virtual ledger  escrow                (Week 6 engine)
Withdraw   real Pudge tx   treasury → wallet     → debit escrow
Revive     real Pudge tx   wallet   → treasury   (63 CKB streak renewal)
```

Only the escrow balance is virtual. Every shannon of escrow is backed by a real
transfer that either happened (deposit) or will happen (withdraw) on Pudge. The
minimum on-chain transfer is 100 CKB (`MIN_ONCHAIN_CKB`, cell-floor plus
headroom); the minimum virtual bet is 10 CKB. See
[products/streak/src/wallet.ts](../products/streak/src/wallet.ts).

## The chain layer (CCC)

All on-chain work goes through a thin CCC wrapper,
[products/streak/src/chain.ts](../products/streak/src/chain.ts). A single shared
`ClientPublicTestnet` is reused across the process (it is stateless over RPC),
and every user gets a fresh `secp256k1_blake160` wallet at signup:

```typescript
function newPrivateKey(): string {
  return "0x" + randomBytes(32).toString("hex");
}

export async function createWallet(): Promise<UserWallet> {
  const privateKey = newPrivateKey();
  const signer = signerFor(privateKey);
  const address = await signer.getRecommendedAddress();
  return { address, privateKey };
}
```

Transfers are built from scratch with the same manual CCC flow first learned in
Week 5 — collect inputs by capacity, complete the fee, broadcast:

```typescript
const tx = ccc.Transaction.from({
  outputs: [{ lock: toLock, capacity: ckbToShannons(amountCkb) }],
});
await tx.completeInputsByCapacity(signer);
await tx.completeFeeBy(signer, 1000n);
return await signer.sendTransaction(tx);
```

Balances are read live from the chain with `getBalanceSingle`, never cached in
the store — the wallet page always reflects the true on-chain state, while
escrow reflects the platform ledger.

## The treasury

There is one platform-wide **treasury** wallet, created lazily on first boot and
persisted in the store. Deposits flow *into* it; withdrawals and streak-revival
fees flow *out of* it. Because the treasury holds the pooled funds of every
user, it is the counterparty to every deposit and withdrawal:

- `deposit()` → `transferFrom(userKey, treasury.address, amount)` then credits
  escrow and records a `Deposit`.
- `withdraw()` → `transferFrom(treasuryKey, userAddress, amount)` then debits
  escrow and records a `Withdraw`.

Both are guarded: a deposit checks the user's *on-chain* balance covers the
amount plus a 1 CKB fee margin; a withdrawal checks the user's *escrow* balance
covers the amount. See
[products/streak/src/wallet.ts](../products/streak/src/wallet.ts#L73).

## The live oracle

A prediction market is only as trustworthy as the source that decides who won.
[products/streak/src/livescores.ts](../products/streak/src/livescores.ts) is
Streak's oracle client, bridging to the public worldcup2026 REST API hosted at
worldcup26.ir. It resolves an authentication token through a three-step ladder,
checked in order:

1. `WC_API_TOKEN` — use this JWT as-is.
2. `WC_API_EMAIL` + `WC_API_PASSWORD` — auto-register on first boot, log in, and
   cache the JWT in the store; refresh automatically on a 401.
3. Nothing configured — fall back to the deterministic simulator.

The bootstrap coalesces concurrent callers into one in-flight promise
(`bootstrapping`) so a burst of requests at startup triggers exactly one
login, and the resulting token is cached both in memory and in `db.json`
(`LiveScoresAuth`). Results are cached for 30 s so the settlement loop never
hammers the API, and normalised into a simple map keyed by internal match id:

```typescript
map[`wc-${g.id}`] = {
  finished, live, home, away,
  result: finished ? outcomeFromScore(home, away) : undefined,
};
```

Critically, **every failure path degrades gracefully** — a network error, a
timeout, a parse error, or a missing token all return the last cached map (or
`{}`) rather than throwing. Settlement must never crash because the oracle
blinked.

## Oracle-or-simulator: one seam

The match engine
[products/streak/src/matches.ts](../products/streak/src/matches.ts) has a single
production seam. `applyResult(match, live)` prefers a live result when the API
says a match has finished; otherwise, once a fixture is past full time with no
live data, it produces a **deterministic simulated** scoreline:

```typescript
if (live?.finished && live.result) {
  return { ...match, status: "final", result: live.result,
           score: { home: live.home, away: live.away }, liveResult: true };
}
// ... past full time, no live data → seeded simulation
const { result, score } = simulateResult(match.id);
```

The simulator uses a `mulberry32` PRNG seeded by the match id, so **every server
computes the same result for the same fixture** — markets settle consistently
whether or not the oracle is configured. This is what lets the whole product run
offline as a demo while remaining a real oracle-driven market in production. The
`liveResult` flag records which path produced the result, so the UI can show
whether a settlement was real or simulated.

## The settlement loop

Everything ties together in `syncMatches()`
([products/streak/src/game.ts](../products/streak/src/game.ts#L47)), the entry
point run both at boot and on a background timer (`SETTLE_INTERVAL_MS`, 20 s):

1. seed the full real WC2026 schedule if missing,
2. fetch live results from the oracle,
3. apply results / time-based status to every fixture (`applyResult`),
4. ensure a market row exists for every fixture,
5. settle any markets whose match just finalised (Week 6 engine).

This is the heartbeat that turns a static schedule into a live, self-settling
market.

## The on-chain streak revival

The Week 6 streak game gains its one on-chain action here. A failed streak can
be **revived** by paying `RENEW_FEE_CKB` (63 CKB) from the user's wallet to the
treasury — a real Pudge transaction — which keeps the streak value intact. The
alternative, `resetStreak()`, wipes to zero for free. `renewStreak()` checks
affordability, broadcasts the transfer, and only then flips the streak back to
`active`, so a failed transaction never grants a free revival. See
[products/streak/src/game.ts](../products/streak/src/game.ts#L97).

## Security model (read before reusing)

This is deliberately a **custodial testnet** design: each user's private key is
generated server-side and stored in `data/db.json` so the terminal can sign
deposits, withdrawals, and revivals on the user's behalf for a one-tap UX. This
is acceptable *only* because Pudge testnet coins have no monetary value.

**Do not reuse this pattern on mainnet.** For real funds the key must belong to
the user — hand it over, or integrate a non-custodial wallet connector (e.g.
CCC's signer/connectors) so the server never holds keys. Sessions are opaque
in-memory tokens (`auth.ts`), passwords are scrypt-hashed with a per-user salt
and compared with `timingSafeEqual`.

## What this week proved

- The custodial-bridge pattern (real money in/out, virtual ledger for trading)
  is what makes an on-chain betting product actually usable — and it maps
  cleanly onto CKB's cell-capacity model.
- An oracle client's most important property is not correctness on the happy
  path but **graceful degradation** on every failure path; settlement depends on
  it never throwing.
- A deterministic, seeded simulator behind the same interface as the real oracle
  lets one codebase be both a runnable demo and a production market.
- Manual CCC transaction building (from Week 5) scales directly into a
  multi-user product — the same three-line `completeInputsByCapacity` /
  `completeFeeBy` / `sendTransaction` flow powers every transfer.
