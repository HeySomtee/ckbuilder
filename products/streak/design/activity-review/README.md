# My Activity proposal

19 October 2026. Interactive design approved by the owner. Production implementation is recorded in [Activity delivery](../../docs/delivery/activity-history.md). This standalone preview remains a simulation.

Open [the local preview](http://127.0.0.1:4193/). Start it from the repository root with `node products/streak/design/activity-review/serve.cjs`.

## What to review

- Open bets contains upcoming, live and settling matches. History contains settled predictions, with separate labels for funds awaiting collection and funds already collected. A compact summary shows active predictions, collectible funds and completed collections. Phones omit the redundant completed-summary column.
- Each row shows the fixture, chosen outcome, stake, plain-language status and next action. Team crests come from the existing dated API-Football snapshot. Home, Draw and Away retain the muted blue, green and red detail accents.
- View claims filters to returns that need collection. Won bets, voided bets and lost bets with recoverable storage each expose the appropriate action. There is no unsupported collect-all transaction promise.
- History separates the result from the collection state. Wallet return includes refundable storage, and the detail panel explains both components. A losing prediction can therefore show storage returned without claiming a profit.
- A pending combined payment stays separate from accepted bets. Open its detail panel to see the three independent picks, stake subtotal and refundable storage. Checking an uncertain payment never requests a second signature in this simulation.
- Details open in a drawer on desktop and a full-screen panel on phones. Follow payment confirmation, entry acceptance, match settlement and collection separately. Transaction identifiers stay behind a disclosure.
- Simulate collection, close the panel and keep browsing. Its History row changes from collectible to transfer-confirming, then collected only after simulated completion. The interrupted-claim scenario retains its saved-transfer state and offers a status check.
- Use the scenario selector for an empty account, disconnected wallet, unavailable reads, uncertain payment and interrupted collection. Reload or Reset preview clears only in-memory sample state.

All results, scores, times, account details, stakes, wallet returns, payment progress and collection outcomes are illustrative. The fixture names and locally cached crests are from `../account-slip-review/fixtures.json`, captured on 16 October; they are not live scores or current betting availability. The visible preview label distinguishes this from the live app. No wallet SDK, external provider request, API mutation, signing or chain transaction is connected.

## Proposed production mapping

Keep My Account for wallet and notification settings. My Activity composes account-scoped direct-position discovery and payment recovery; it must not read legacy ledger balances as direct-contract entitlements.

| User-facing state              | Required evidence or behavior                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| Preparing / wallet approval    | Existing payment controller state; no accepted prediction yet                                       |
| Confirming / checking payment  | Saved transaction and observed chain status; uncertain is not failed                                |
| Verifying entry                | Committed payment with `pending-validation`; do not call it accepted                                |
| Upcoming / in play             | Accepted position plus available fixture state; live scores are context, not settlement authority   |
| Awaiting settlement            | Match completion or provisional report while the contract is not yet settled                        |
| Won / lost                     | Verified settled outcome and the owned position's entitlement                                       |
| Refund available               | Verified void or refundable/ineligible position, with a valid claim path                            |
| Transfer confirming / checking | Existing signed claim recovery state; prevent duplicate signing                                     |
| History                        | Settled prediction, distinguishing available return, pending collection and confirmed wallet return |

The current `Position.status` values alone do not label win/loss or match progress. Join them with a verified `MarketSnapshot` and provider fixture context, retaining uncertainty. A zero-principal payout with returned storage must not be called a win. A failed read must not become an empty portfolio or a zero entitlement. Disable claims while their authoritative state is unavailable, while preserving the last snapshot with a clear stale label.

The current claim entitlement is total cell capacity. Split the verified amount into prediction return and storage exactly once; do not add the 321 tCKB storage deposit twice. Display actual claim network fees when known, and distinguish pre-fee return from net wallet credit. The preview uses whole-CKB samples and an explicitly illustrative 0.001 tCKB fee; production must retain integer shannons and exact decimal formatting.

One slip payment creates independent positions. Pending payment groups should reconcile to those positions without duplicate rows. A claimed position can disappear from live-cell discovery, so durable History needs retained descriptors and verified historical transaction evidence. Browser journals alone cannot promise complete cross-device history. Reorgs must demote confirmation and collection states when their supporting transactions are no longer canonical.

Production follow-up after approval: establish the position/history read model, stable identities and source precedence; integrate existing wallet/recovery controllers; implement the approved page; run independent review and payment/history regressions. Do not invent profit, estimated payout, historical odds or a result when its evidence is missing. A successful preview is not proof of hosted payment, history completeness or settlement.

## Preview validation

Run `node products/streak/design/activity-review/verify.cjs` with the preview server running. It checks Chromium and WebKit at 320x568, 390x844 and 1440x900: filtering, search, keyboard tabs, drawer focus, phone overflow, a compact desktop rail, refund/storage clarity, simulated collection while closed, interrupted-transfer recovery and unavailable/disconnected/empty states. Requests are restricted to this local static preview and all writes are rejected.

All six browser/viewport journeys passed at 10:00:29 UTC on 19 October. The desktop and phone screenshots were visually inspected. WebKit close-focus restoration and the distinction between settled history and completed collection were corrected before the final run. No page errors, external requests or write requests occurred. Static repository policies also passed. Screenshots and results are stored in `.quality-artifacts/activity-review/`. No commit or publication is part of this design-review task.
