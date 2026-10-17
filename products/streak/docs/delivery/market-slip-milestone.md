# Market detail and prediction draft

16 October 2026, Africa/Lagos. Review branch: `feat/streak-market-slip`, based on Season revision `eb8d151`. This increment implements MARKET-01 and SLIP-01 from the [work tracker](../work-tracker.md). It is not deployed and does not integrate contract payment.

## Implemented journey

Users can open `/season/?market=<id>` from a market card, inspect API teams and logos, kickoff, current pool distribution, lifecycle, stake limits and fees, then choose home, draw or away. Legacy activity remains accessible. Missing markets and failed refreshes have explicit recovery paths.

The floating slip holds up to eight independent predictions. Selecting another outcome for the same fixture replaces that outcome while retaining the amount. Amounts are decimal strings and totals use integer shannons, including all eight decimal places. Invalid amounts remain visible and prevent review. The initial editable amount is 100 tCKB, not an enforced minimum. Current ledger limits and fees come from the server; contract-lab limits are not used here.

Minimize and Escape retain the draft. The owner removed the duplicate Close control on 16 October. Clear requires explicit confirmation. Reload restores only draft inputs, never a reviewed or submitted status. Corrupt saved data is retained until the user chooses to discard it. Storage denial or quota failure keeps an editable in-memory draft with a warning. Other-tab changes require an explicit choice before ordinary edits continue. Local storage is a convenience for unsent input, not a transactional cross-tab database or a record of entitlement.

The review button sends every line together. No line is silently omitted. It checks provider fixture identity, duplicate upstream fixtures, market availability, kickoff and market cutoffs, limits and exact amounts against one current snapshot. Errors remain attached to their lines. Public responses contain no account positions or wallet data.

## Trust and freshness

`GET /api/markets/:id/public` supplies a public projection and a hash of fixture identity, lifecycle and terms. `POST /api/slips/review` accepts a versioned bounded draft and returns every line, errors, exact principal subtotal and a review expiry no later than thirty seconds or the earliest cutoff. Both use read-only store access and no-store HTTP responses. The POST inherits the JSON and origin policy. It does not create accounts, bets, balances, deposits, transactions or a reservation.

The browser validates response shape, revision, line order, selection identity and exact total. Edits, account changes and dismissal cancel a review. Older reviews cannot replace newer market observations. Changes to terms, closed markets, failed refreshes or expiry remove the checked state. Expiry uses both wall time and a conservative monotonic interval starting before the request, so a slow device clock or delayed response cannot extend the review window.

The existing application is still a custodial ledger. Its fees come from the losing pool; they are not an extra percentage added to this draft subtotal. Direct contract admission, network fees, cell capacity, wallet signing, broadcast and settlement remain separate implementation work. The UI explicitly says payment is unavailable.

## Requests and recovery budget

One public-detail request loads a market. Opening a slip can fetch at most eight unique public details, using the same TanStack Query cache as the detail screen. These queries have a fifteen-second freshness interval, one retry, and thirty-second polling while visible. Hidden slips do not poll; hidden browser tabs suppress interval refresh. One deliberate review uses one bounded POST with no automatic retry. Closing or editing cancels pending review work. The shared HTTP adapter supplies its timeout and cancellation behavior.

Review accepts at most eight picks, 120-character identifiers and 32-character amount strings. Persisted drafts are versioned and capped at 20 KB. The existing request-body limit is 1 MB. Review still reads the application's working-set snapshot and builds lookup maps. This is not evidence of SQL scalability or a substitute for coordinated rate limits before rollout.

The [visual and Genie correction](ui-motion-correction.md) restores the approved preview's compact market cards, split match layout, inset slip picks and mobile bottom sheet. The first pick opens the slip; later new picks update the dock so browsing can continue. The renderer only decorates minimize and restore; it cannot update a draft, submit a review or move funds.

## Verification and independent review

Regression coverage includes exact decimal totals, malformed input, canonical duplicate fixtures, equality at both cutoffs, changed terms, inactive providers, retained invalid lines, public-only responses and unchanged ledger state after HTTP review. Draft tests cover reload, corruption, quota and mid-session storage denial, cross-tab conflicts, removal, clearing and the eight-pick bound.

Integrated browser checks use the built React app and real loopback API with synthetic fixtures. They exercise desktop and mobile detail navigation, multiple picks, replacement, review, reload, keyboard controls, invalid amounts, delayed responses, changed terms, device-clock skew, closed lines and storage recovery. Screenshots are written to `.quality-artifacts/browser/market-detail-*.png` and `prediction-slip-*.png`. No provider credentials, production database, real wallets or live chain calls are used.

Independent recovery review identified stale-review cache replacement, device-clock skew, account-return review revival, mid-session storage denial and provider ownership fallback. The implementation preserves newer observations, bounds review age with elapsed time, aborts completed review contexts on identity changes, degrades storage to memory safely and fails closed without provider ownership verification. The reviewer inspected the fixes and reported no remaining blockers in this read-only scope. This is not a security audit.

`npm.cmd run quality:major` passed all **31 steps** on 16 October, completing at 07:57 UTC. This includes eighteen integrated Season browser groups, eighteen approved-preview groups, thirty-two combined-slip preview groups, disposable PostgreSQL and Rust VM/accounting checks. The commit and push hooks require the full gate again against the unchanged candidate. See [status](../../status.md) for the implementation state. Hosted CI remains paused by the owner.

## Next increment

Implement one real direct wallet-to-market stake through settlement and claim. First map application fixture and market IDs onto pinned protocol commitments and establish durable pending transaction recovery. Then add complete-basket combined payment with independent settlement. Existing ledger liabilities and withdrawals remain separately accessible. Five, production Genie profiling, operational hardening and community incentives remain tracked dependencies.
