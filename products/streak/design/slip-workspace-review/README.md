# Compact slip workspace proposal

17 October 2026. The owner approved this proposal. This directory remains an isolated simulation; the actual application implementation is tracked in the [delivery record](../../docs/delivery/compact-slip-implementation.md). No commits or pushes.

Run `node products/streak/design/slip-workspace-review/serve.cjs` from the repository root. Open [the local preview](http://127.0.0.1:4187/). Port 4100 remains the working application.

## Try it

- Use the top 1, 4 and 8 controls to compare list sizes. Edit a stake and inspect the single coral focus border.
- Scroll eight picks. Add matches and the payment action remain visible. Close and reopen the slip to retain the draft.
- Open Costs & refundable storage. The total remains upfront; the detailed explanation appears only on request. Escape restores focus to the costs button.
- Switch to Activity for receipts. They never appear below the editable picks. Opening an older receipt does not consume the next slip's list area.
- Review and simulate payment. The footer shows the exact sample total before the payment action. The slip closes, and a separate tracker follows the simulation. Open the receipt in Activity afterward.
- Close the slip and open Why repeat payments take time. Enable the delayed-response scenario to inspect checking and eventual confirmation without another payment.

Sample fixtures and crests are reused from the dated API-Football snapshot in `../account-slip-review`. They are not live fixtures. Pool-open/setup labels, receipts, amounts and the network fee are illustrative. The demo uses integer shannons and a sample 321 tCKB storage deposit per position, matching the current contract's accounting without altering it. Simulation delays are not estimates or benchmarks. Reload resets preview state. No wallet, payment, operator, account or provider endpoint is connected.

## Proposed app changes

The current `BatchCheckout` renders a previous `BatchTransaction` alongside an estimate and new review controls. The slip footer consequently grows with the receipt and cost content. Move completed receipts into Activity and keep the editable slip's footer bounded. Retain the app-level signed-payment owner and tracker independently of the visible tab. Draft editing must never discard, alter or silently repeat a signed payment. New payment availability must still respect unresolved input reservations.

Use one scroll region for picks, with a pinned header and small footer. Show stake subtotal, the full estimated wallet debit and explicit fee uncertainty before review. After review, show the exact debit including the network fee. The cost panel lists stakes, refundable storage, network fee and sponsor-covered setup. Moving the explanation behind a button must not hide the total or imply storage is a fee. Maintain recoverable state when the software keyboard opens and ensure controls remain reachable at zoom and short viewport heights.

The focus collision comes from the global mint `input:focus-visible` outline in `web/src/design-system/styles.css` and the coral `.stake-input:focus-within` border in `predictions.css`. Scope the input outline override to this composite control and keep a visible parent focus treatment, including forced-colour mode. Do not remove focus globally.

## Repeat-payment performance proposal

Source inspection identifies work to measure, not measured durations:

1. Even deposit-only v4 transactions use the sponsor's input/change and require its co-signature. An initialized pool skips creation outputs but does not bypass the sponsor. Removing this dependency would require a separately reviewed transaction/contract design, not a cosmetic optimization.
2. `BatchClient.prepare` checks prior reservations and owner live cells, requests an offer, verifies its inputs and pool data, then prepares the wallet transaction. `signAndPersist` verifies again before signing. Retain the independent owner verification and final freshness checks.
3. `BatchService.prepareOffer` reconciles history and funding, reloads fixtures and live markets, selects inputs and validates the frozen offer. Some input/market reads are serial. The configured fixture resolver fetches the complete catalogue for each selected fixture as well as individual provider data. The sponsor client limits RPC concurrency to two.
4. Submission verifies and co-signs the frozen transaction. Recovery checks the original hash; browser confirmation polling can add display latency after chain inclusion. Shared operator and browser wallet locks also introduce wait time. The preceding lock correction bounds waiting but is not a speed benchmark.

After approval, add safe stage timings for review, queue wait, fixture reads, RPC validation, signing preparation, sponsor completion, broadcast and observed confirmation. Compare existing-only, new-only and mixed slips at 1, 4 and 8 picks; distinguish wallet interaction time and network confirmation from app processing. Record p50/p95 only after enough observations. Never log signatures, wallet addresses or raw provider payloads as timing metadata.

Use those measurements to remove duplicate catalogue reads within a request, memoize stable metadata and canonical header reads with explicit freshness rules, and run independent reads with bounded concurrency. Recheck live inputs, deadlines, canonicality, wallet identity and exact contributions immediately before the relevant signing boundary. Do not remove reorg checks or cache spend authority merely to improve a timer. An initialized market should show Checking pool / Preparing approval / Sending / Confirming, without a market-creation step. Unknown submission is Checking, not a definitive failure. No speed target or implementation is claimed by this preview.

## Verification

`node products/streak/design/slip-workspace-review/verify.cjs` exercises Chromium and WebKit at 320x568, 390x844 and 1440x900. It checks eight-pick scrolling, visible header controls, compact footer/list geometry, a single field focus border, receipt separation, exact sample totals, cost-panel focus restoration, delayed-response confirmation, adding a fresh pick after payment, no horizontal overflow, no page errors, no external requests and zero writes. Evidence is written to `.quality-artifacts/slip-workspace-review/`.

These checks cover an isolated design simulation. Production financial changes still require independent review and the complete major gate after approval.

All six journeys passed on 17 October 2026. Desktop and phone screenshots were visually inspected. A WebKit focus-restoration issue found during the first run was corrected and the complete preview journey rerun successfully.
