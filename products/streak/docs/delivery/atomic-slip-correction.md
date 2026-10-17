# Atomic slip, Wallet and Activity correction

16 October 2026. This increment implements the owner's combined-payment request and latest interaction changes. It is implemented on the current review branch. The v4 contract is deployed on public testnet. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. Earlier v3 release evidence does not establish those results for this candidate.

## User journey

The prediction slip contains up to eight distinct fixtures. Review and payment stay inside the slip. The user sees the total principal, 321 CKB of recoverable position storage per prediction, the exact network fee and Streak's separate market-reserve contribution. One wallet signature authorizes one transaction containing every reviewed prediction. Each position later settles and is claimed independently. No line can be silently omitted or paid in a separate fallback transaction.

An eligible unfunded fixture is created in that transaction. Existing eligible v4 markets can share the payment with new markets. Streak supplies 3,050 testnet CKB for each new market; existing-market deposits require no new reserve. The user pays the combined principal, position storage and reviewed network fee. A sponsor reservation or insufficient operator capacity can make a whole slip unavailable. The saved picks remain editable.

The slip now has one labelled X close button. Close and Escape retain the draft; Clear slip is a separate explicit action. The owner removed the Genie animation. Opening and closing use the native dialog and reliable focus restoration. The wallet chooser gets its own top-layer dialog when opened from the slip, so the underlying modal cannot make the chooser inert.

Wallet and Activity have distinct routes. Wallet shows the connected address, copy control, available plain CKB balance, connection state and Telegram settings. The navigation summary shares the same account-bound balance cache. Activity owns transaction history, pending recovery, positions and claims. Sign-in and payment reuse one explicitly connected in-memory wallet. Refresh retains the server session and signed recovery records but requires explicit wallet reconnection. Ordinary browsing does not load the wallet SDK.

Telegram controls use the existing account-link endpoints and validate the returned HTTPS bot link and expiry. Local linking is restored through a webhook-only tunnel. The existing bot settings are loaded from the product environment. Registration and an empty-update probe verified delivery into this local store; other app routes return 404 through the tunnel. No bot messages were sent and no accounts were linked by the probe. The computer and tunnel must remain running. Direct v4 settlement notification dispatch is not implemented. Receiver verification and notification delivery remain explicit follow-up work; isolated tests send no Telegram messages or webhooks.

## Contract and compatibility

The separate v4 protocol is 40,768 bytes with CKB code hash:

`0x6c03d7942bd133c713c501df7a6e263699a0ea731339eda993548640e900405c`

It is deployed at output 0 of [public testnet transaction 930bba6c](https://pudge.explorer.nervos.org/transaction/0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f). Thirteen canonical confirmations were observed before the deployment was recorded for this delivery. The unchanged guard remains at output 1 of [transaction b05048b1](https://pudge.explorer.nervos.org/transaction/0xb05048b11a78fc9697c1235ec4e114f2f762559cb9652b61552bc87e8c3fde11). Backend and frontend pins agree with the [build manifest](../../contracts/direct-v4/build-manifest.json).

The first 36 argument bytes now contain a hash of the first input outpoint and the new market's genesis output index. This permits several distinct market groups in one creation transaction. The remaining arguments retain the admin, cutoff, guard and fee-recipient commitments. Entry accepts at most eight v4 market groups. Reporting, closure, claims and reserve recovery remain separate operations for one market. The four-shard, eight-record-per-shard bound, payout rules, 321 CKB position storage and six-hour result window are unchanged.

Existing v1, v2 and v3 descriptors, positions and signed bytes keep their original deployment pins. They remain available for recovery and independent exits. They are not rewritten into v4 or mixed into a combined v4 entry. The fixture digest remains a trusted catalogue mapping, not an on-chain football commitment. Results still depend on the configured football oracle.

The review identified a source-level claim-composition concern across older protocol generations: their checks do not apply v4's complete isolation from other typed cells. This was not experimentally exploited. V4 requires non-entry transactions to use one market's type script and rejects foreign typed cells. Retaining historical recovery does not patch already deployed code. A separate read-only scan of the 17 registered older markets at 18:28 UTC found no positions or claim cells; that observation is time-bounded. New sponsored offers use v4 when atomic mode is configured.

## Signing and recovery

The separate sponsor service prepares an unsigned offer. Before review and again before signing, the browser verifies the actual live inputs, all output groups, exact contributor changes, fixture terms, previous-pending admission, dependency order, witness placeholders and network fee. A changed wallet, account, draft, shard or quote requires a new review. Both the sponsor and browser separately verify the user's contribution and the sponsor's contribution.

The owner signs first. Exact partial bytes and every source draft identity are saved before submission. The operator verifies that signature, signs last, persists the complete transaction and broadcasts. Ordinary direct, sponsored and atomic records share one wallet submission lock and atomic input reservations across three IndexedDB stores. Database version 3 preserves older records.

A lost response, expired offer or API rejection does not release a submitted signature. Recovery follows its original hash and bytes. Status reads cannot co-sign or broadcast. Only a never-submitted expired partial may be explicitly discarded after a read-only status check. A canonical conflicting spend needs at least three confirmations for local proof and four before the operator releases its reservation. A reorganisation restores reservations when that proof disappears. The canonical original transaction takes precedence if it later wins.

Recovery removes only unchanged draft lines whose identities were saved with the payment. Edited amounts, changed selections and newly added picks remain. Historical records without this metadata do not clear a draft. Completed positions and claim discovery remain tied to the full descriptor and creation identity, including several markets sharing one creation hash.

## Evidence

An owner check caught a response-shape mismatch after receiver activation: Wallet reads `user.telegramAvailable`, while the initial API response placed it at the root. Both the account-read and disconnect responses now use the nested field. Signed HTTP regressions check a configured receiver and confirm that disconnect preserves availability for reconnecting. The focused suite passed after the local API was rebuilt and restarted at 19:23 UTC. Final commit and push gates cover this correction; the earlier broad run started before it.

| Check                           | Observed result                                                                    | Scope                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Rust v4 VM suite                | 149 labelled checks passed                                                         | Local VM, synthetic data                                                                 |
| Signed v4 devnet                | 37 product checks and three harness checks passed                                  | Actual BatchService, native and genuine OmniLock signatures, isolated CKB node           |
| Frontend unit checks            | 29 groups passed, including eight atomic-payment groups                            | Isolated parsers, exact accounting, stale reviews, journal and recovery invariants       |
| Combined-slip browsers          | Four journeys passed at 390px and 1440px in Chromium and WebKit                    | Production slip and client with synthetic API/RPC; no public wallet or provider requests |
| Wallet browsers                 | Four shared EVM wallet journeys and four Wallet/Telegram component journeys passed | Isolated connector, account, balance and navigation behavior                             |
| TypeScript and frontend lint    | Passed                                                                             | Current frontend source                                                                  |
| Public testnet                  | v4 code deployment confirmed                                                       | Deployment only; no eight-line public user payment or public v4 settlement claimed       |
| Complete major gate and release | 47 major steps passed; commit/push gates enforced                                  | Must pass for the final candidate before commit and push                                 |

The devnet covers eight new markets, mixed new and funded markets, eight funded markets, exact combined economics, independent claims, late-entry refunds, interrupted submissions, real reorganisation and original-byte recovery. The browser lane verifies rejection, exact review controls, account changes during refresh, source-line edits, partial persistence before POST, database migration, competing reservations, reload and recovery without another wallet signature. Financial API requests use a bounded 60-second timeout; normal reads retain 15 seconds.

Evidence files are `/.quality-artifacts/batch-chain/devnet.json` and `harness.json` relative to the repository root, plus `products/streak/.quality-artifacts/batch-browser/results.json` and its phone/desktop screenshots. These are generated local artifacts, not committed deployment manifests. Browser payment hashes describe synthetic transactions and must not be presented as public testnet activity.

The complete gate log is .quality-artifacts/atomic-full-gate.log, with its report archived as .quality-artifacts/atomic-full-gate.json. Separate runtime evidence is .quality-artifacts/atomic-local-smoke.json and .quality-artifacts/telegram-receiver-check.json. The live fixture count was 192 at 18:58 UTC and changes with kickoff. Operator plain capacity after deployment was 76,971.43972621 testnet CKB, measured at 18:52 UTC; this is a dated observation, not a guaranteed budget. Independent review of funds, recovery and identity changes found no remaining blocker in the reviewed scope.

## Remaining work

Local API, sponsor, lifecycle and Telegram receiver checks have passed. Publication remains subject to exact-candidate commit/push gates. Test the connected physical wallets before inviting users. Establish durable monitored operation, backup restore, bounded database mutations and shared abuse controls before a larger cohort. Hosted CI remains paused by the owner.

Streak Five still needs verified player-data coverage, published rules, immutable entries and replayable scoring. Community onboarding still needs a confirmed reward budget, clear eligibility, support ownership and measured participation. Contract deployment, local activity, hosted operation and community engagement are separate evidence. This increment does not claim mainnet readiness, unlimited sponsorship, current Neon capacity or freedom from bugs.
