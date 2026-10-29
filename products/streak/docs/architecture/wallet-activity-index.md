# Faster activity: the proposal in plain language

28 October 2026. **Approved and implemented locally.** Read the [delivery record](../delivery/event-driven-activity.md) for behavior and verification. The explanation below records the approved design.

Activity is slow because the browser searches several blockchain markets to find
your bets and their status. I propose keeping an organised list in Streak's
existing database, grouped by wallet, so the app can fetch your records directly.
**CKB would still control the money and whether a claim is valid.**

## How it would work

Use **event-driven updates**, following the owner's refinement. Save each event
durably, then update only the affected records. A worker processes queued work
and can wait while idle; it does not need to keep searching every market.

| Event                     | Update                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Market creation confirmed | Add the market to the catalogue. Creation alone is not a user's bet.        |
| Payment submitted         | Show the user's picks as pending.                                           |
| Bet accepted on chain     | Mark the matching picks open; handle late entries as refunds when required. |
| Market settled            | Update its participants' win/loss/refund status and actual claim amounts.   |
| Collection confirmed      | Move the affected return to collected history.                              |

Activity fetches this saved list in one request. Start that request after sign-in
so it may be ready before navigation. The splash never waits for it.
A football result arriving can update the match, but collection becomes available
only after the chain creates the claim. Check that claim live before signing.

## Why not one central smart contract?

On CKB, changing a cell spends it and creates a replacement. If every bet updated
one shared tracking cell, unrelated bets would compete to spend it. That could
become a bottleneck. This follows from [CKB's cell model](https://docs.nervos.org/docs/ckb-fundamentals/cell-model).

The database gives us the wallet-to-bets lookup without changing the deployed
contracts or adding a shared input to every payment.

## If something goes wrong

- A tab can close or the server can restart after a payment succeeds. Saved events
  must replay safely without creating duplicate bets or payments.
- Keep a small recovery check for pending transactions, missed events, claims made
  outside the app and changed chain blocks. Check affected records after restart,
  when stale or when new chain evidence arrives, rather than rescan everything.
- Keep the last known records visible with their update time when refresh fails.
  Pending payments stay pending until confirmed; missing data must not mean zero.
- Import existing chain history once, with catch-up after outages. An event system
  still needs a way to recover activity it did not observe.
- The same wallet can see the hosted list on another device. Local and production
  databases would still be separate.

## What is already done?

A [small startup warmup](../delivery/activity-startup-warmup.md) already reads up
to two recently saved markets early, locally. It helps revisits but does not
solve full history or discovery on a new device.

The larger index now implements durable events and wallet records. Isolated tests
exercise canonical evidence and failure recovery. Hosted speed and physical-wallet
acceptance remain separate. Similar reuse for balances, charts and game summaries
remains future work.

The detailed table design and tests are kept separately in the
[engineering notes](wallet-activity-index-technical.md).
