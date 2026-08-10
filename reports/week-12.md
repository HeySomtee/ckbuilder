# Week 12: Streak Terminal - Wallet-Native Identity (Self-Custody Login + Non-Blocking On-Chain UX)

Every week since week 7, the Streak Terminal carried a quiet compromise. To keep
onboarding to a single click, the server generated a fresh Pudge wallet for each
new user and **stored that user's private key in its own database**. It was a
custodial model, flagged in the code as testnet-only, and it worked: sign up,
get a wallet, start playing. But it meant the server's JSON store was a pile of
private keys, and "log in" meant a password the server also had to hold and
hash.

Week 12 pays that debt down. It removes passwords and server-held user keys
entirely and replaces them with **sign-in-with-CKB**: you connect your own
wallet, sign a one-time challenge, and the server knows who you are without ever
touching a key. Deposits and streak renewals become transactions **you** sign in
**your** wallet; the server's job shrinks to verifying that the payment landed
on-chain. The second half of the week is the UX consequence of that shift, since
self-signed payments introduce real on-chain waits, the terminal had to learn to
process transactions in the background instead of freezing.

**Code:** [products/streak](../products/streak)
**Run:** `MATCH_PROVIDER=dummy npm run streak` -> [http://localhost:4100](http://localhost:4100)

## The custodial debt, and why it had to go

The week 7 design is honest about itself. The header of
[products/streak/src/chain.ts](../products/streak/src/chain.ts) still describes
the original bargain: generate a `secp256k1_blake160` wallet server-side, keep
the key in the store, and sign renewals "on the user's behalf." The tradeoff was
one-click onboarding in exchange for the server being a custodian.

The problem is not theoretical. A file-backed (or Supabase-backed) store full of
per-user private keys is a single object whose compromise drains *every* user at
once. It also makes the login story worse than it needs to be: if the server is
already holding keys, it may as well hold passwords too, and now there are two
secrets to protect instead of zero. On a chain whose entire identity model is
"you hold a key and sign," reproducing web2's password table on top of it is the
wrong shape.

So the account model was rebuilt around the wallet the user already has.

## Sign in with CKB

The new login is a nonce-challenge handshake. The server issues a short-lived
message, the wallet signs it, and the server verifies the signature with CCC.
No password ever exists.

On the server, a challenge is a single-use, five-minute nonce keyed by the
connecting address ([products/streak/src/auth.ts](../products/streak/src/auth.ts)):

```ts
export function issueChallenge(address: string): string {
  const nonce = randomBytes(16).toString("hex");
  const message =
    `Streak Terminal - sign in\n\n` +
    `Address: ${address}\n` +
    `Nonce: ${nonce}\n` +
    `Issued: ${new Date().toISOString()}`;
  challenges.set(address, { message, expires: Date.now() + CHALLENGE_TTL_MS });
  return message;
}
```

The client side leans entirely on CCC's connector web component, loaded straight
from a CDN so there is still no build step
([products/streak/public/app.js](../products/streak/public/app.js)). The one
non-obvious detail is that the real signer is nested one level deeper than you
expect: `connector.signer.signer`. The login flow reads cleanly once the
connector is wired:

```js
async function walletLogin() {
  const signer = await connectWallet();
  const address = await signer.getRecommendedAddress();
  const { message } = await api("/auth/nonce", { method: "POST", body: { address } });
  const signature = await signer.signMessage(message);
  return api("/auth/verify", { method: "POST", body: { address, signature } });
}
```

Verification is where CCC earns its keep. `signMessage` returns a structured
signature that carries its own `signType`, and `ccc.Signer.verifyMessage` is a
static method that dispatches on that field, so the *same* code path verifies a
native CKB secp256k1 signature, an EVM personal-sign, a BTC or Doge ECDSA
signature, a JoyID passkey, or a Nostr event
([products/streak/src/chain.ts](../products/streak/src/chain.ts)):

```ts
export async function verifyWalletSignature(message, signature): Promise<boolean> {
  try {
    return await ccc.Signer.verifyMessage(message, signature);
  } catch {
    return false;
  }
}
```

The server then finds-or-creates a user by the signature's stable `identity`,
records which wallet family signed (`signType`), and mints a session
([products/streak/src/server.ts](../products/streak/src/server.ts)). A brand-new
identity comes back flagged `justCreated`, which the client uses to trigger the
first-run intro described below:

```ts
let u = db.users.find((x) => x.walletIdentity === identity);
if (!u) {
  u = { id: randomUUID(), walletIdentity: identity, walletType, wallet: { address }, /* … */ };
  db.users.push(u);
  created = true;
}
```

## What the server stops storing

The migration is best measured by what disappeared. The `User` record lost
`passwordHash`, `passwordSalt`, and the `privateKey` on its wallet; a user is now
`{ walletIdentity, walletType, wallet: { address }, … }`. `auth.ts` lost
`hashPassword`, `verifyPassword`, and password validation. The `/api/signup` and
`/api/login` routes are gone, replaced by `/api/auth/nonce` and
`/api/auth/verify`. Username is now optional and purely cosmetic, set later on
the Account tab; everywhere a display name is missing, the UI falls back to an
abbreviated address via `abbrevAddress`.

There is one key the server still holds, and it is honest to name it: the
**treasury**. This is a parimutuel house, so the pooled stakes and the payout
escrow live in a server-operated treasury wallet, and the server signs
withdrawals out of it. What changed is that the server no longer holds *user*
keys at all. Your identity and your deposits are self-custodied; the shared pool
remains custodial, exactly as a betting pool must be until it is replaced by an
on-chain vault lock. That is the honest boundary of this week's work, and it is
the obvious next target.

## Deposits become client-signed, and the server becomes a verifier

With no user key on the server, a deposit can no longer be a transaction the
server signs. It is now a transfer the user signs in their own wallet, straight
to the treasury address. The client builds and broadcasts it, then hands the
server nothing but a transaction hash:

```js
async function broadcastTransfer(amountCkb) {
  const signer = await ensureSigner();
  const w = await api("/wallet");
  const { script: toLock } = await ccc.Address.fromString(w.treasuryAddress, signer.client);
  const tx = ccc.Transaction.from({
    outputs: [{ lock: toLock, capacity: ccc.fixedPointFrom(String(amountCkb)) }],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer);
  return signer.sendTransaction(tx);       // returns the hash, does not wait
}
```

The server credits escrow only after independently confirming that hash on-chain.
`verifyPaymentToTreasury` fetches the transaction, requires it to be committed,
sums the outputs actually locked to the treasury, and checks that at least one
input came from the connecting address, so a user cannot claim credit for someone
else's payment ([products/streak/src/chain.ts](../products/streak/src/chain.ts)).
Replay is guarded on both paths: a deposit hash is recorded once, and streak
renewals keep a `renewalTxs` list so the same payment can never revive twice. The
trust model inverted in the right direction, the client asserts a payment, and
the chain is the arbiter.

## The new problem: on-chain waits, and a UI that used to freeze

Self-signed payments surface a latency the custodial flow hid. A Pudge
transaction takes seconds to a couple of minutes to commit, and the first cut of
the deposit flow simply `await`ed that confirmation inline, leaving the button
spinning and the whole terminal locked while a block was mined. That is exactly
the experience the feedback called out: no sign that anything was happening, and
no way to keep using the app while it did.

The fix splits every on-chain action into two phases. The **broadcast** happens
in the foreground because it needs the wallet popup; the **confirmation** happens
in the background. A small retry loop polls the verify endpoint, treating
"not committed / not found" as *keep waiting* rather than *fail*:

```js
async function confirmTreasuryTx(path, txHash) {
  const deadline = Date.now() + 180_000;
  for (;;) {
    try {
      return await api(path, { method: "POST", body: { txHash } });
    } catch (err) {
      const pending = /not committed|not found/i.test(err.message || "");
      if (pending && Date.now() < deadline) { await sleep(4000); continue; }
      throw err;
    }
  }
}
```

Crucially, the loop re-POSTs the **same** hash; it never rebuilds or re-signs the
transaction, so there is no way for a slow confirmation to turn into a
double-spend. Wrapping this is `runBackground(label, fn)`, which registers a
floating activity pill in the bottom-right corner, runs the async work, and
resolves the pill to a check or a cross when it finishes. Deposits and renewals
now broadcast, close their modal, and immediately return control to the user;
the pill reports "Depositing 100 CKB" while they browse markets, then flips to
"done" and refreshes their balance in place. The terminal borrows the pattern
from wallets like CKBoost: a transaction is something happening *near* you, not a
wall you have to stare at.

## The bug that redirected you home

One report was stranger than a freeze: pages would spontaneously bounce back to
the dashboard a few seconds after you navigated. The cause was a race hiding in
the dashboard's live poll. The dashboard refreshes every twelve seconds, and a
refresh is asynchronous. If you navigated away *during* the `await`, the stale
callback would still resolve and re-render the dashboard view on top of whatever
page you had just opened.

The fix is to make each poll aware of the route it was armed for, and to abandon
itself if the route changed while it was in flight
([products/streak/public/app.js](../products/streak/public/app.js)):

```js
const armedRoute = state.route;          // this poll belongs to the current route
// … await refreshDashboard() …
if (state.route !== armedRoute) return;  // user navigated; drop the stale render
```

This is the same lesson week 11 learned about event handlers, applied to data
flow: in a hand-rolled SPA, anything asynchronous has to re-check that the world
it started in still exists before it writes to the DOM.

## A first run built for a wallet, not a form

A wallet-native user lands in a genuinely empty state: connected, but with zero
escrow and no idea what to do first. Two small additions close that gap. A
three-step onboarding modal (`showOnboarding`) explains the arc, wallet
connected, fund your account, make a pick, and it appears automatically the first
time a `justCreated` identity signs in, then stays out of the way afterward via a
`localStorage` flag. It is reopenable at any time from a new `?` button in the
status bar, so the "how does this work" path is always one click away. And
because funding is the real first hurdle, the dashboard shows an amber hint
banner whenever escrow is still zero, with a button that jumps straight to the
deposit screen. The intro is deliberately not a gate; skip it and it never
nags again.

## What this week proved

- **Match the chain's identity model instead of fighting it.** Replacing a
  password table and server-held keys with a signed nonce did not just improve
  security, it deleted whole categories of state the server used to protect.
- **Moving custody moves latency into the UI.** The moment the user signs their
  own deposit, on-chain confirmation time becomes *their* wait, and the interface
  has to make that wait ambient and non-blocking rather than a freeze.
- **Verify, do not trust, a client-submitted hash.** The server credits nothing
  until it has confirmed the committed transaction pays the treasury from the
  right address, with replay guards on every path.
- **Async work must re-check its world.** The redirect bug and week 11's dead
  hamburger are the same root cause: a callback that assumes the page it started
  on is still there.

## Next

1. Replace the custodial treasury with an on-chain escrow lock, so the pooled
   stakes are governed by a script rather than a server-held key, the last piece
   of custody to remove.
2. Persist sessions (signed cookie or Supabase) so a server restart no longer
   logs everyone out.
3. Show a live confirmations count on the activity pill by subscribing to the
   transaction status, instead of a fixed retry interval.
