# Match terminal and background payments

17 October 2026. Local work on `feat/streak-direct-testnet`, based on `07b427c` with the owner's earlier uncommitted UI corrections. Commits and pushes remain paused.

## Experience

Market details restore the legacy information density: compact numeric typography, real provider model and bookmaker probabilities, standings, form and the last five meetings. Pool percentages come from current direct contract principal, separately from provider forecasts and the legacy ledger. Missing coverage stays unavailable. The graph keeps the interactive pool-history design; no historical values are invented.

The slip shows refundable storage and the estimated wallet debit before review. The reviewed invoice separates prediction stakes, a smaller storage/network section and the exact total. The storage copy says when it returns, including losing picks, and mentions the claim network fee. Sponsored market reserves appear separately as a Streak contribution.

After the wallet signature is saved, the slip closes. A lower-left tracker follows the payment across client-side navigation. Expand it for the transaction, recovery actions and saved status. Moving dots indicate ongoing work without inventing completion percentages. Reduced motion retains the text. An uncertain delivery is a payment check, never a reason to sign a replacement automatically. Confirmation changes the tracker to a persistent success update. Dismissal applies only while the transaction remains terminal; a detected reorg makes the tracker visible again.

Explicit wallet reconnection restores the latest unresolved saved payment without requiring the slip to open. Older history remains in My activity. Monitoring runs while the application is open and refreshes on focus; this is not an operating-system or Telegram push service. No new notification messages were sent.

## Cost verified on public testnet

Read-only inspection of the owner's already committed [three-prediction transaction](https://pudge.explorer.nervos.org/transaction/0xe6f60c254119cee71b105e58c24a7ef262e29aa1a5bc4e557d0be8ff985e33f8) found:

| Component                                  |           tCKB |
| ------------------------------------------ | -------------: |
| Three stakes                               |            300 |
| Three refundable position-storage deposits |            963 |
| Network fee                                |     0.00006104 |
| Owner wallet debit                         | 1,263.00006104 |
| Separate Streak market-creation reserve    |          9,150 |

Evidence: `.quality-artifacts/three-pick-public-cost.json`. This was the owner's transaction, not a synthetic test or a payment made by the agent. The deployed v4 position needs 321 CKB of storage. Its capacity returns through a claim after settlement, including a losing position, subject to claim transaction fees and usable output capacity. It is not an entry fee and does not automatically return when the final whistle blows.

### Reducing the upfront requirement

Clear disclosure does not eliminate the capital requirement. Two concrete options need an economics decision before implementation:

1. **Testnet storage subsidy:** Streak supplies the 321 tCKB per pick under v4. That capacity is ultimately claimable by the bettor, so it is a grant rather than a recoverable operator reserve. Requires a campaign budget, per-user limits and abuse controls, plus reviewed client/operator contribution checks. No contract change alone can make that subsidy return to Streak.
2. **Recoverable storage sponsorship:** a new contract generation records the storage sponsor/refund destination and enforces separate returns on winning, losing, void and late-admission exits. This requires new layout/capacity analysis, protocol tests, a deployment and compatibility with existing v4 claims. It cannot be added as a frontend discount.

Recommendation for the pilot: keep current amounts honest and provide sufficient testnet faucet funding while deciding a bounded subsidy. Do not disguise storage as a fee or silently alter user entitlements. No subsidy budget or new economic design is implemented in this change.

## Recovery boundaries

The existing journal remains the sole authority for saved signatures. Background monitoring and submit/resolve/discard now share the wallet Web Lock. Lock-held internal recovery uses a private implementation, avoiding nested-lock deadlocks. Every displayed result matches the active identity and transaction hash. Previous payment success cannot label the next transaction. Account changes remove transient progress; durable records remain available to their owner. Submitted draft retirement only removes unchanged source picks.

## Verification

Independent source review approved the payment-progress, identity, recovery and cost-disclosure changes. All **50 local major-gate checks passed at 10:51:39 UTC**, including signed local-chain settlement, independent claims, nine atomic transaction unit tests and the application browser suites. Evidence: `.quality-artifacts/terminal-major.json` and `.quality-artifacts/terminal-major.log`.

A final CSS spacing correction prevents the tracker overlapping the retained slip dock on narrow and tablet screens. The follow-up production build and expanded full-app checkout test cover Chromium/WebKit at 390, 900 and 1440px, with an explicit non-overlap assertion. Evidence: `.quality-artifacts/terminal-final-checkout.log` and `.quality-artifacts/checkout-browser/`. The gate's original four-profile checkout run also verifies navigation during submission, rejection after an earlier successful payment, and reorg visibility after dismissal. Reload recovery preserves the original signature and newer draft edits.

Separate real-provider screenshots at 390, 1279 and 1440px show five genuine AC Milan/Atalanta meetings, form and forecast data, with zero page errors or browser writes. Evidence: `.quality-artifacts/terminal-live/results.json` and screenshots in that directory. The owned disposable PostgreSQL container was stopped after the gate; local app/operator services remain running. Public chain cost evidence is separate from synthetic payment tests. No commits or pushes.
