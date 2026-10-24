# Streak Survivor interactive preview

The owner approved this design on 19 October 2026. The [integrated implementation](../../docs/delivery/survivor-implementation.md) now exists locally with persistent free-entry rules and six built-app browser journeys. The preview below remains a separate synthetic design artifact, including its simulated fee-gated flow.

19 October 2026. Local design simulation for owner review. Production routes, payments, wallet identity, contracts and database are unchanged.

Run `node products/streak/design/survivor-review/serve.cjs` from the repository root, then open [the preview](http://127.0.0.1:4192/). The existing application remains on port 4100. Reload resets the demo.

## Try the complete flow

1. Switch **Preview as** to **Admin**. Open **Create / edit competition**. Set the name, choose free entry or a fee gate, enter a separate prize and set the capacity. Publish the preview. Amounts are illustrative whole testnet CKB, not a funded reward commitment.
2. Switch to **Player**, review entry and expand the proposed rules. Simulate entry; use the failure toggle to inspect a retry without recording an entry or moving funds.
3. Choose a team and save your pick. Change it before lock. Inspect **Your run** and **Survivor board**. Other players' picks remain hidden until the sample lock.
4. Use **Explore the flow** below the board to jump to round three. Used teams cannot be selected. Inspect locked/revealed picks, survival, elimination and the winning state.
5. Return to Admin after entry. Published terms are read-only. **Reset preview** starts again without touching live data.

The grouped sidebar is a layout proposal. Other destinations are noninteractive labels, not implemented routes. The preview includes only six example clubs, labelled as a subset of the future full EPL board. Team crests reuse the existing API-Football asset snapshot in `../account-slip-review`. Opponents, future fixtures, competition schedule, entrants, results, prizes and progress are illustrative, not live API observations. The current temporary Streak mark is reused; this does not complete the original-logo work.

## What this proposes

Compact clear-glass competition overview, an admin-set prize distinct from entry fees, a strategic team reserve with upcoming opponents, used-team states, private picks before lock, a survivor board, personal round history, calm elimination messaging and a separate entry review. The same journey adapts to phones. Primary controls retain 44px targets, native dialogs restore focus, and reduced-motion/transparency preferences are respected.

The [rules and architecture proposal](../../docs/product/survivor-rules.md) records admin authority, scheduling, draws, missed picks, voids, simultaneous elimination, cancellation and the funding decisions still needed. This prototype does not authorize a live fee-gated competition. Prize funding and payout remain separate from configuring a number.

## Focused verification

Run `node products/streak/design/survivor-review/verify.cjs` with the preview server active. It exercises free and fee-gated entry, admin changes, validation, retry, joined-term locking, pick changes, used teams, private/revealed standings, game states and responsive layout in Chromium and WebKit. It records screenshots and results in `.quality-artifacts/survivor-review/`. All traffic is constrained to the local preview and checked for zero writes. This does not run or certify the live application or chain contracts.

All six browser journeys passed on 19 October 2026 at 320x568, 390x844 and 1440x900. Desktop overview/team-board and phone overview/admin screenshots were visually inspected. Verification found a WebKit dialog-focus issue; explicit opener focus corrected it before the successful rerun. Formatting and repository static policies passed. No commit or push was made.
