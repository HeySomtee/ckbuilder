# Streak interactive design preview

Proposal 01, 15 October 2026. A local, clickable proposal for the Streak redesign and Streak Five. All fixtures, accounts, points, balances and transactions are illustrative. This is not the deployed product.

From the repository root:

```powershell
node products/streak/design/season-preview/serve.cjs
```

Open [the overview](http://127.0.0.1:4175/#/home), [Streak Five](http://127.0.0.1:4175/#/five), or [the guided review](http://127.0.0.1:4175/#/review). The server binds to loopback only. Set `STREAK_PREVIEW_PORT` if port 4175 is busy.

No install, wallet extension, football API, database or environment secret is needed. JavaScript and SVG assets are local. The server serves only an explicit list of preview files and rejects connections to external services through its content security policy.

## Review documents

- [Design, interaction and flow proposal](DESIGN-PROPOSAL.md)
- [Architecture, migration and future agent workflow](ARCHITECTURE-PROPOSAL.md)

The owner approved this UI and architecture on 15 October 2026, including the denser slip surface, shared glass and scrollbar treatment, and labelled controls. The [active documentation](../../docs/README.md) and [agent contract](../../AGENTS.md) now govern implementation. Approval is not a claim that the production rebuild or wallet integration is complete.

## Try these journeys

1. **Five:** choose players through the pitch, search a club, inspect unavailable choices, choose a captain, review and save. Reload to verify the local draft. Try the locked-round scenario and inspect sample results.
2. **Predictions:** choose an outcome, set a stake and use Add more matches. Add two more predictions, then open the dock to adjust the separate stakes. The total combines all stakes, recoverable storage and one illustrative network fee. Minimize, navigate, reload and restore the complete slip. Connect the demo wallet and review one simulated payment. Try rejection and shard-conflict scenarios before success. Every prediction settles independently.
3. **Recovery:** close the simulated submission while it is pending, then check My activity. Review a sample claim or refund, and confirm that it cannot be repeated after completion.
4. **Matchday:** switch timeline, stats and players. Change to delayed feed or no live matches. Data stays clearly provisional.
5. **Community:** inspect the leaderboard, daily streak, badges and proposed crew journey. Wallet and account remain reachable on a phone.
6. **Surfaces and motion:** compare the translucent cards, glistening borders and labelled Minimize/Close controls on desktop and mobile. Scroll the page and long slip with the wheel, keyboard or touch. The shared native scrollbar has sage, hover and coral pressed states on supported desktop browsers. Use Account to reduce motion, or your operating system preference. Operate dialogs with the keyboard and Escape.

The preview starts with a signed-in sample profile and a disconnected wallet. Production fantasy sign-in is proposed separately. Player names/club associations are sample content, not current transfer or fixture claims. Sample final fantasy points are fixed, rather than calculated from the selected draft. The 5,000 tCKB sample wallet balance is fixed and no chain transactions occur. The combined-payment design requires a production batch transaction builder and contract validation before it can move funds.

Local draft state uses `streak-design-proposal-v1` in localStorage. Account > Reset this preview clears only this preview state. It does not affect the real application.

## Verification

With the preview server running:

```powershell
node products/streak/design/season-preview/verify.cjs
node products/streak/design/season-preview/batch-verify.cjs
node products/streak/design/season-preview/motion-verify.cjs
node products/streak/design/season-preview/glass-capture.cjs
node products/streak/design/season-preview/capture.cjs
```

These use Streak's existing Playwright installation. `verify.cjs` records actually completed checks in `evidence/preview-checks.json`. `batch-verify.cjs` checks basket editing, totals, migration, validation and simulated submission in Chromium and WebKit, writing `evidence/batch-checks.json`. `capture.cjs` produces desktop/mobile screenshots and recorded walkthroughs under `evidence/`. `motion-verify.cjs` checks Chromium and WebKit motion, painted bounds, interruption, focus and reduced motion, and records separate timing observations in `evidence/motion-checks.json`. They use no live football data or wallets.

`glass-capture.cjs` checks the revised material, labelled controls and scrolling at 320, 390 and 1440px in Chromium and WebKit. It records the 44px control bounds, overflow, wheel/keyboard behavior, desktop thumb dragging, draft retention and a forced-colours screenshot in `evidence/glass-checks.json` and `evidence/glass-*.png`. Playwright does not support mouse-wheel injection into mobile WebKit; that scenario checks keyboard and native scroll reachability instead.

Verified on 15 October 2026: **18 general browser scenario groups and 32 basket scenario groups passed**. General checks include all 11 routes at 320, 390 and 1440 px. Basket checks cover both browser engines at 390 and 1440 px, including replacing an outcome without duplicating a fixture, per-pick and aggregate validation, retained drafts after rejection, separate positions from one payment, a pending payment preserving a newer draft, and reset during or after submission. The foundation run caught and fixed mutable defaults that could retain completed activity after reset. No uncaught browser errors or external requests were observed. This does not establish real-device motion performance or production readiness.

The latest full Genie suite passed **56 of 58 motion checks**. Two Windows headless WebKit mobile checks failed: the timing observation did not confirm overlay cleanup, and the immediate cold-start animation observation timed out. See [the full results](evidence/motion-checks.json). The dedicated [snapshot suite](evidence/motion-snapshot-checks.json) passed **9 of 9 checks** before the final change to a 95% slip tint. Physical iPhone motion performance remains unverified.

Captured 28 views plus a [short interaction walkthrough](evidence/interaction-walkthrough.webm), a [mobile minimize/restore clip](evidence/genie-mobile.webm), and a [combined-payment mobile demo](evidence/multi-pick-mobile.webm). Useful starting points:

- [Overview, desktop](evidence/overview-desktop.png) and [mobile](evidence/overview-mobile.png)
- [Streak Five, desktop](evidence/five-desktop.png) and [mobile](evidence/five-mobile.png)
- [Mobile player picker](evidence/player-picker-mobile.png)
- [Mobile prediction slip](evidence/prediction-mobile.png) and [minimized dock](evidence/prediction-dock-mobile.png)
- [Combined slip, desktop](evidence/combined-slip-desktop.png) and [mobile](evidence/combined-slip-mobile.png)
- [Combined payment review](evidence/combined-payment-review-mobile.png), [confirmation](evidence/combined-payment-success-mobile.png) and [independent positions](evidence/combined-independent-positions-mobile.png)
- Revised glass: [desktop overview](evidence/glass-home-chromium-1440.png), [desktop slip](evidence/glass-slip-chromium-1440.png), [mobile slip](evidence/glass-slip-webkit-390.png) and [system high-contrast mode](evidence/glass-forced-colors-chromium-390.png)
- [Matchday](evidence/matchday-desktop.png), [Clubhouse](evidence/clubhouse-desktop.png) and [public welcome](evidence/welcome-desktop.png)

The source is deliberately isolated and dependency-free to make design review easy. Production implementation should follow the approved feature boundaries, typed operations and state model described in the architecture proposal, rather than copying this single preview controller into the main application.
