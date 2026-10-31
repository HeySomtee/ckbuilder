# Streak status

31 October publication: runtime commit `162dc06` is verified on GitHub `main`.
Local hooks and hosted CI were deferred under the owner's urgent release exception;
the full gate remains incomplete. Render deployment and physical acceptance are
not yet verified. Follow today's Five-first checklist before noon Lagos.

31 October urgent release: the owner explicitly deferred further automated tests
and authorized immediate commit/push of the prepared wallet and mobile controls,
including balances rounded down to two decimals. The complete release gate remains
unfinished; no full pass is claimed. Hosted CI remains skipped. Today's priority is
[saving Five teams and bids before noon Lagos](docs/delivery/hosted-acceptance-2026-10-31.md).
All six wallets are funded per owner; production submissions remain unverified.

30 October mobile payment controls are implemented locally: compact wallet
header, dismissible finished updates and a draggable three-cell pending button
that avoids docks and yields to dialogs. Independent recovery review accepted.
The local app was rebuilt, returned HTTP 200 and opened in the owner's browser
at `http://127.0.0.1:4100/season/`. Six checkout journeys, four wallet-header and
four wallet-overview journeys, placement tests, build, lint and static checks pass.
Focused verification is recorded in the
[work tracker](docs/work-tracker.md). No publication or physical-phone acceptance
is claimed; the complete release gate remains due before commit/push.

30 October wallet-switching correction is local: Season's Disconnect action now
clears app identity and requests provider permission release, with fresh account
selection on explicit reconnect. My Account uses the same operation. Failed
logout cannot restore the previous account after reload. Independent identity
review found no remaining blockers. All 76 major checks passed at 13:59:26 UTC,
including expanded disconnect/switching browser cases and recovery suites.
Implementation is uncommitted; publication and physical wallet switching remain
pending. See [wallet compatibility](docs/delivery/wallet-compatibility.md).

30 October update: the owner reports Zerion Android sign-in works after updating
the wallet app. The published `916e91e` patch alone had not resolved the error.
This is owner-reported physical sign-in success; navigation/reload persistence,
payment approval and Activity confirmation still require campaign acceptance.
No additional runtime change was made following this report.

30 October Zerion mobile sign-in investigation: the owner sees "No connected
wallet" in the header despite a visible address/balance. A local candidate renews
EVM access on explicit sign-in, confirms the server session and surfaces failures
inside checkout. Four isolated wallet and six checkout journeys pass, with
independent identity review. All 76 major checks passed at 11:01:09 UTC.
The owner authorized commit and push for phone testing. Physical Zerion recovery
and deployment remain unverified. No new Render variable is required.
See [authentication evidence](docs/delivery/wallet-compatibility.md).

30 October 09:51 Lagos: production acceptance campaign started. `b7511ec` is on
GitHub main and the hosted frontend entry filenames match its local build.
Public reads report batch payments enabled, planned evening fixtures available,
and Five GW9 open/funding available. Physical-wallet submission, settlement,
prizes and backend revision verification remain pending. See the
[campaign plan and current checkpoint](docs/delivery/hosted-acceptance-plan.md).

30 October owner authorized GitHub publication of the Five layout/budget changes
and today's production test plan. Focused browser verification passed; commit
and push enforce scoped formatting, static policies and frontend checks. Hosted
CI stays skipped. Confirm the deployed revision before production acceptance.

30 October local review API is running on port 4100 with regular game data and
the existing local database. The budget/save panel is now above the Five pitch;
mobile player browsing also shows Bank. The updated [production test plan](docs/delivery/hosted-acceptance-plan.md)
uses tonight's verified fixtures and the upcoming GW9 deadlines. Review and
production tests remain pending; nothing new is pushed. Separate local signer,
settlement and rewards workers were not started for this layout review.

29 October Five layout correction: compact title/tabs and gameweek controls bring
the game to 164px from the top at 1276 by 662, leaving 75.2% of the first screen
for play. Sponsorship credit follows the builder; Sponsors retains bidding and
details. Mobile retains squad navigation. Local CSS-only work, not yet published.
See [workspace evidence](docs/delivery/five-workspace.md).

29 October publication complete: `51d0849` is verified on GitHub `main`. The
approved shared cell loaders, wallet compatibility, branding/startup and
event-driven Activity release passed all 76 local gate checks at 15:37:59 UTC.
Commit and push reused the exact-tree receipt. GitHub Actions were intentionally
skipped and the commit has no workflow runs. Hosted deployment and physical-wallet
acceptance remain unverified. Next: use the frozen-candidate production test plan.

29 October [shared cell loaders implemented](docs/delivery/connected-loading.md)
across Season, games, payments, Activity, account, startup and retained legacy
pages. Six motion groups and eight real application loading states pass in
Chromium/WebKit, including reduced motion and cleanup. Screenshots inspected;
frontend build, scoped lint and static policies passed. This supersedes the
preview-only scope below. The final complete local release gate and authorized
GitHub push remain pending, with hosted CI omitted.

29 October release candidate authorized for GitHub publication with hosted CI
omitted. Includes the wallet, Activity, branding and startup changes below plus
the isolated loading-signature preview. Application use of the new loaders and
hosted/physical-wallet acceptance remain pending. Exact-revision local checks
are enforced by the release hooks; no deployment success is inferred from a push.

29 October 07:46 UTC: [cell loading refinement](design/loading-signature-review/README.md)
is available as an isolated preview at port 4199. Circular rotation/pulse and
horizontal connected-wave examples pass eight Chromium/WebKit groups, responsive
and reduced-motion checks. Await owner approval before replacing app loaders.
No application runtime, payment, commit or deployment change in this preview.

29 October 06:03 UTC: local Activity launcher hookup is complete, preserving
existing accounts and persistent records. All 23 registered markets are indexed.
Failures show one retry card; cached history stays visible. Landing pages now
skip the splash entirely; `/season` retains it. Backend types, frontend build/lint,
disposable PostgreSQL regression, four Activity browser journeys and 58 startup
groups passed, with independent review. [Activity evidence](docs/delivery/event-driven-activity.md)
and [startup evidence](docs/delivery/startup-identity.md). No commit, push or hosted
test; final-candidate verification/publication and linked-cell loader preview
approval remain pending. This supersedes the local launcher gap below.

29 October splash duration corrected locally: a two-second drawing sequence,
Open Streak/Escape skip, background shell/data startup and immediate accessibility
and failure bypasses. All 38 isolated Chromium/WebKit groups, frontend build,
lint and syntax checks passed at 05:40 UTC; local HTTP delivery is verified.
[Evidence](docs/delivery/startup-identity.md). The [production test plan](docs/delivery/hosted-acceptance-plan.md)
now starts after release freeze and selects fresh fixtures then. The missed bets
remain unperformed. No commit or push. Next development priority is the older
local launcher's PostgreSQL Activity hookup; linked-cell loaders still await
preview approval. Preserve earlier publication and physical-wallet acceptance.

28 October fast-start splash correction: the visible first-frame logo and short inert fade now appear on fast local loads while the app remains usable. All 20 focused Chromium/WebKit groups, frontend build, lint and formatting passed at 16:02 UTC. [Evidence](docs/delivery/startup-identity.md). Local assets are updated; publication remains pending. The older local launcher still needs the PostgreSQL Activity startup configuration described in the work tracker.

28 October event-driven Activity complete locally: wallet-indexed PostgreSQL reads, durable public events, canonical recovery and authenticated startup prefetch. All 75 required checks have passing coverage across the major run and scoped follow-ups, with original failures retained. Final browser checks passed at 14:24:04 UTC and independent reviews accepted. [Evidence, configuration and bounds](docs/delivery/event-driven-activity.md). No new Render secret or contract; API and sponsor must restart together when published. No commit, hosted deployment or live transaction. The loading-signature preview and existing physical-wallet/hosted acceptance remain pending.

28 October event-driven Activity implemented locally: [delivery and evidence](docs/delivery/event-driven-activity.md). Durable journal relay, PostgreSQL wallet records, canonical all-owner reconstruction, targeted recovery, authenticated pagination and signer-independent startup prefetch. Focused tests pass and independent reviews accepted after corrections; final major verification is in progress. No commit, push, hosted rollout or live transaction. Preserve earlier publication and physical-wallet acceptance commitments. Linked-block loader replacement still awaits approval.

28 October architecture refinement: [plain-language proposal](docs/architecture/wallet-activity-index.md) now prioritizes event-driven updates from verified payment and settlement changes, with durable delivery and bounded reconciliation as recovery. Source review completed; this is documentation only. Index implementation and site-wide loading-signature integration remain pending approval.

28 October approved logo/splash integrated locally, with the permanent connected-cell wordmark in desktop/mobile headers and a startup screen that never gates on wallet or data reads. Eighteen focused startup browser groups passed; the major gate report records all 72 checks passed at 10:11:39 UTC. PowerShell separately returned wrapper status 1 from a Vite warning; [evidence and limits](docs/delivery/startup-identity.md) retain that distinction. The [production checklist](docs/delivery/hosted-acceptance-plan.md) and [plain-language proposal](docs/architecture/wallet-activity-index.md) are simplified. A separate [linked-block loading preview](design/loading-signature-review/README.md) is ready at port 4199 with passing responsive/reduced-motion checks; site-wide loader replacement awaits approval. The durable index stays paused. No commit, push or hosted update.

28 October logo follow-up: [preview](design/splash-review/README.md) now includes the connected cells permanently beneath the chart-r, with dark, light and single-colour samples. Motion reveals the same static detail. Architecture implementation is paused at the owner's request while they review the proposal. Application branding replacement and publication remain pending; existing local warmup work is preserved.

28 October startup/performance refinement: [new splash and chart-r identity preview](design/splash-review/README.md) is ready at port 4198. [Hosted Markdown plan](docs/delivery/hosted-acceptance-plan.md) explicitly requires production execution. [Bounded Activity warmup](docs/delivery/activity-startup-warmup.md) is implemented locally with eight focused tests, final frontend build/lint and eight browser journeys passed; independent review accepted. It improves reuse for two saved markets, not cold cross-device discovery. [Durable wallet index](docs/architecture/wallet-activity-index.md) and other app-wide performance changes remain proposals. No full major run, contract migration, commit, push or hosted update.

28 October [hosted acceptance plan](docs/delivery/hosted-acceptance-plan.md) prepared from current hosted and official FPL data. Six QA wallets cover real prediction outcomes, auction refunds, Five points/prizes and Survivor progression; no test positions or accounts created. [Animated splash preview](design/splash-review/README.md) runs at port 4198 with passing Chromium/WebKit responsive checks, awaiting approval before integration. Local and hosted market registries currently share no contract descriptors, so same-wallet local history cannot be assumed to appear on hosted. Wallet/branding publication remains pending.

28 October local full-flow testing started: API is running on port 4100 in dummy-game mode with existing test records. Persistent PostgreSQL, payment sponsor, direct settlement loop, ordinary Five rewards and separate test-game rewards are active. Five funding and atomic prediction availability checks passed; settlement passes completed successfully. Real testnet wallet approval and game acceptance remain for the owner. Telegram webhook setup is unavailable. No commit, push or hosted change. Operational evidence: .quality-artifacts/local-full-test-readiness.json.

27 October approved On form branding integrated locally: the complete streak wordmark replaces header/sidebar branding and the matching segmented s supplies browser, touch and compact icons. Build, frontend lint, static checks, 26 Season Chromium/WebKit groups and legacy responsive browser checks passed; desktop/mobile renders inspected and local icon delivery verified. [Asset mapping and evidence](design/brand-review/README.md). This supersedes earlier branding integration-pending entries below. No commit, push or hosted update. Prior wallet changes and physical-wallet acceptance remain separate.

27 October owner selected On form for the Streak identity: complete streak wordmark with its segmented s reused as the standalone insignia. Preview defaults and selection records are updated. Logo direction is decided; actual application integration and deployment remain pending.

27 October logo refinement: the preview's primary logo is now the complete word streak, with the custom mark replacing its initial s. The same s appears alone on favicons and app icons. Wordmarks, contact sheet and export packs were refreshed; responsive Chromium and mobile WebKit checks passed. This updates the design preview only; production integration remains pending.

27 October logo/favicon design preview ready: [three original vector directions](design/brand-review/README.md) at <http://127.0.0.1:4197/>, with custom outlined lettering, light/dark/monochrome lockups, SVG/ICO/PNG icons and downloadable packs. Responsive Chromium and mobile WebKit checks passed; visuals reviewed. Breakaway is the recommended direction. Await owner selection before application integration. No production runtime, commit, push or deployment change in this design task.

27 October wallet fixes implemented locally: visible in-slip login errors and animated stages, MetaMask/Zerion delayed discovery, read-only UTXO Global restoration and strict primary JoyID passkey authentication. REI remains explicit reconnect; JoyID passkey-lock prediction payments remain unsupported and now explain that before review. Independent identity/recovery review accepted. All 71 major checks passed at 11:47:28 UTC, including four wallet and six full checkout journeys. A subsequent helper-text styling adjustment passed the complete static/build lane after correcting its formatting. No commit, push, physical-wallet or hosted acceptance claim. [Scope and evidence](docs/delivery/wallet-compatibility.md).

26 October Week 22 release published: `cfd8dfec20fe186bad1822d58d3eb87a1158e6fe` is pushed to `origin/main`. The exact-candidate commit hook passed all 71 checks at 18:23:53 UTC; push reused its successful receipt for tree `89eb157f315f`. The release includes the Five workspace, local-only game testing, fixture outlooks, Survivor setup and [Week 22 report](../../reports/week-22.md) with labelled screenshots and the new [streakpitch.com](https://streakpitch.com) domain. [DM draft for Neon](../../reports/week-22-dm.md) is prepared, not sent. After publication, the domain returned HTTPS 200 with the matching `index-DWsM8nEv.js` entry bundle and regular API data mode. The served Survivor bundle contains Review setup and the paid-entry explanation. This verifies frontend rollout, not hosted payment or reward acceptance. Evidence: `.quality-artifacts/week22-release-major.json`, `week22-release-commit.log` and `week22-release-push.log`. The owner's unrelated ignore-file change and nested benchmark data are excluded. No hosted CI resumed. Original logo/favicon and the explicit beta limits below remain unfinished.

26 October Survivor setup corrected locally: private drafts have a dedicated review/publish workspace, functional Review setup navigation and explicit paid-entry or expired-schedule guidance. The team board appears after publication. All 71 major checks passed at 12:08:36 UTC, including six responsive create/revisit/publish/join journeys. The local server serves the new frontend after refresh; no API restart, commit, push or deployment. Paid admission and automatic Survivor prize payouts remain unimplemented. [Details and evidence](docs/delivery/survivor-implementation.md).

26 October local-only game mode and discovery implemented: Five and Survivor both show Beta; public data switches and URL-selected dummy data are removed. `STREAK_GAMES_DATA_MODE` selects regular or dummy data on the local server; hosted dummy mode and stale request scopes are rejected. Survivor creation now pins the new competition across reloads without corrupting another selection's cache, with visible competition cards and explicit publication before joining. Used teams are grey; Survivor boards and Five players show three fixture slots. The shared FPL outlook loads independently of stats. All 71 major checks passed at 09:57:27 UTC in one run, and independent review accepted. API PID 4708 is active with regular data. No commit, push, hosted update or wallet signature. [Configuration and evidence](docs/delivery/games-local-mode-and-outlook.md). Original logo/favicon remains next.

26 October Five workspace is integrated and active locally. My five opens first with position-correct pitch rows, explicit captain guidance, preserved drafts and Save changes states. Sponsors contains open-round bidding and moderated optional product copy, logo and website. Back to squad works from secondary panels and dialogs. All 71 required checks have passing coverage across the major run and documented follow-ups; independent recovery review accepted. Original failed receipts remain and an archived-preview timeout passed unchanged on rerun. Local API PID 17128 retains existing stores and workers. Physical MetaMask and hosted acceptance remain separate. Next is original logo/favicon design. [Implementation, evidence and local routes](docs/delivery/five-workspace.md).

25 October preview refinement adds explicit Back to squad navigation, four position-correct pitch lines and a prominent open-gameweek sponsor bid card with simulated amount/review states. The shared payment tracker and retained Matchday detail controls now use SVG chevrons; only their icon presentation changed in the app. Five layout and auction UI remain isolated pending approval. [Review guide](design/five-workspace-review/README.md).

25 October Five workspace proposal: an isolated interactive preview puts squad building first, moves secondary sections into tabs, distinguishes Save changes, explains captain selection and demonstrates optional sponsor description, logo and website exposure. [Preview and verification](design/five-workspace-review/README.md). Await owner design review before live integration. Existing in-app testing and pending wallet acceptance remain unchanged.

25 October in-app game testing is active locally. Five and Survivor use their actual components and domain services with explicitly selected dummy data, isolated records and a dedicated test rewards wallet. Admins can close deadlines, apply results and progress immediately. All 71 required checks have passing coverage across the major run and the complete contract rerun; the original run records the resolved old-rehearsal port conflict. Independent money/recovery review accepted. Both local data modes return HTTP 200, ordinary FPL gameweeks remain present, and the test worker has a confirmed faucet reserve. Physical MetaMask sponsorship/refund/prize acceptance remains pending. No commit, push or hosted activation. [Controls, configuration and dated evidence](docs/delivery/in-app-games-testing.md).

24 October publication: `74ee5e3` is pushed to main. All 68 complete local release checks passed at 21:04:44 UTC; push reused the same verified tree. Official-deadline enforcement, Five auctions/rewards, Survivor, navigation and wallet quality work are included. The isolated six-step rehearsal is ready at `http://127.0.0.1:4190`. Owner chose manual Render configuration. A separate hosted rewards wallet has a confirmed 10,000 tCKB operating reserve, with its private key protected outside Git. Hosted activation and actual MetaMask prize/refund verification remain separate. [Release evidence and configuration](docs/delivery/five-release-rehearsal.md).

24 October release candidate: official FPL deadlines now fail closed when event data is missing, duplicated or invalid. Picks and sponsorship bids share the existing server deadline; polling intervals are unchanged. The six-action local-chain rehearsal passed actual dummy-wallet bids, top-up, cutoff enforcement, automatic refund, synthetic scoring and prize collection, including a stale-heartbeat recovery check. Independent review accepted this scope. Release publication is authorized and subject to the complete exact-candidate gate. Render configuration is documented and the integration connection is pending; no hosted wallet activation is claimed. [Rehearsal and setup](docs/delivery/five-release-rehearsal.md).

24 October sponsor auctions are implemented locally for newly created rounds. Confirmed top-ups combine by wallet; the highest total wins the sponsor slot and funds the player prize pool. Other and excluded late bids refund automatically, with refund-only queue scope and durable payout recovery. Branding remains optional. Existing Gameweek 9 retains its confirmed 100 tCKB community contribution. Independent review accepted; all 67 required steps have passing coverage across the major run and complete browser/contract reruns. The original full-run receipt retains the corrected calendar-test failure. API and isolated worker were reloaded and current desktop/mobile checks passed. [Rules, verification and limits](docs/delivery/five-sponsor-auction.md). No actual live auction settlement, commit, push or Render change.

23 October Five rewards are enabled locally. A new dedicated testnet wallet received 10,000 tCKB from the official faucet, verified after 26 canonical confirmations. The isolated rewards worker is running and the local API exposes sponsorship availability; desktop/mobile checks show an enabled sponsor button without page errors or overflow. Existing isolated domain, PostgreSQL and signed-chain recovery checks passed. This reserve is not an advertised gameweek pool. Owner wallet sponsorship and eventual live collection remain unverified. [Activation and evidence](docs/delivery/five-local-rewards-activation.md). No product runtime, prediction funds, commit, push or Render configuration changed.

21 October Five automatic EPL progression and player scouting are implemented and active on the local app. Official Gameweek 8 opened automatically with 562 eligible players and the 23 October 17:30 UTC deadline. The compact pitch/player workspace includes FPL form, points, transfers, availability and clickable history/fixtures. Independent recovery review accepted. All 66 required checks have passing coverage: 38 backend/build/database checks, 18 browser checks and 10 contract checks. The original full-run receipt remains failed after its corrected browser selector; remaining groups passed separately, with no suite skipped. Public source inspection is separate from synthetic tests. No reward wallet, funds, commit, push or hosted deployment was created. [Lifecycle, rules and evidence](docs/delivery/five-automatic-gameweeks.md).

20 October local sponsorship restored: the sponsor process was absent while the API remained running. Restarting its existing launcher restored payment availability for 182 fixtures. A local watchdog now monitors the listener without duplicating or interrupting it; the slip adds faster outage checks and animated manual retry. Build, lint, static policies, two synthetic process tests and all six Chromium/WebKit checkout journeys passed, including the added outage/retry recovery cases. Independent recovery review accepted. [Operation and limits](docs/delivery/local-sponsor-availability.md). Local only; no commit, push or hosted changes.

20 October Five runtime is implemented locally following owner authorization. The Season route integrates admin gameweek drafts, free squad entry, PostgreSQL persistence, scoring revisions and standings. The owner approved a dedicated custodial testnet rewards wallet; optional contributions, moderation, exact fixed-pool allocation, refunds and durable payout collection are implemented but not activated. [Configuration and verification](docs/delivery/five-implementation.md). The major run passed 63 checks and failed its final check on a Windows-to-WSL connection refusal; that unchanged signed-chain test passed on isolated retry. All 64 required checks now have passing coverage, but the single full-run receipt remains failed. Independent money, identity and recovery review accepted the implementation. The local API was reloaded; no gameweek, live funds, reward key or budget was created. Not committed, published or deployed.

20 October Streak Five has a complete private EPL-first squad-builder preview at `http://127.0.0.1:4195/`, following the owner's start-Five direction and EPL fallback after FPL/UEFA research. Four rules tests, six Chromium/WebKit viewport journeys, failure/retry checks, formatting and static policies passed. [Preview, rules proposal, evidence and data-source findings](design/five-review/README.md). This changes the next-feature priority; Community Markets remains in the backlog. Production Five still remains coming soon. Official entry persistence, live scoring and public data reuse are not implemented by the preview. No commit, push or hosted change.

20 October Survivor Create competition restyled locally with a compact coral finish and plus icon. Frontend build and six existing Survivor browser journeys passed; no behavior or admin permissions changed.

20 October Survivor is now enabled on the running local app. The old launcher route restriction and missing local database were corrected; the screenshot wallet matches the configured admin allowlist. Survivor uses a separate persistent local PostgreSQL database while existing file accounts and payment records stay intact. Build, independent review and six browser journeys passed. [Local configuration and evidence](docs/delivery/survivor-implementation.md). Refresh to access Create competition; no game or prize was created and hosted services were unchanged.

20 October dropdown arrows corrected locally across Season and legacy pages with one shared inset rule. Frontend build and focused Chromium/WebKit desktop/mobile, Survivor, legacy and forced-colors checks passed. Refresh the local page to see the rebuilt styles. No commit or push.

20 October league dropdown fixed locally: options now use the existing cached provider-status endpoint and remain compatible with a running older API. Read-only verification showed all six leagues and nine correctly filtered Champions League fixtures. All 26 browser groups, build, lint, formatting and static checks passed. [Evidence and cause](docs/delivery/fixture-date-navigation.md). Refresh the local page; no API/operator restart, commit or push was performed.

20 October navigation refinement complete locally: mutually exclusive compact desktop arrows and centered mobile dates, fading strip edges, hidden scrollbars and a provider-backed league selector that filters before pagination. All 26 Chromium/WebKit browser groups, build, lint, two calendar tests and formatting/static checks passed. [Delivery evidence](docs/delivery/fixture-date-navigation.md). Not committed or pushed.

20 October daily navigation implemented locally: Today-first Markets, one-day arrows, keyboard-accessible calendar, scrollable mobile dates, Live and Weekend shortcuts, local-time boundaries and date-preserving market recovery. Build/lint, four date tests, fixture-filter regression and all 26 integrated Season browser groups passed. [Delivery record](docs/delivery/fixture-date-navigation.md). No commit, push or deployment.

20 October quality pass complete locally: silent authorized EVM restoration, progressive independent Activity reads, retained match details, dismissible notices, animated claim stages, durable delayed-signature recovery and fresh shared-input checks. Survivor admins can delete empty competitions with confirmation and concurrent-admission protection. All **60 local major checks passed at 07:42:14 UTC**. [Changes, evidence and limits](docs/delivery/wallet-activity-quality.md). No commit, push, hosted rollout or physical MetaMask test was performed.

19 October Activity publication: `df147f17261dc8cf08d1131dc5f2d2bed1a0c6e9` is verified on remote main. All 53 local major checks passed at 12:23:29 UTC and push reused the exact-content receipt. Render deployed it at 12:25:25 UTC; the public entry bundle matched the tested build at 13:00:13 UTC.

19 October Survivor implementation complete locally: admin drafts, free publication/entry, private picks, no-repeat teams, standings/history and provider-backed PostgreSQL progression follow the approved preview. All **60 major-gate checks passed at 13:17:00 UTC**, including six Survivor browser journeys and isolated database/chain regressions. Independent review findings are resolved. [Delivery and admin configuration](docs/delivery/survivor-implementation.md). Survivor remains uncommitted and unpublished. Paid drafts are configurable, but paid publication stays disabled pending payment/refund design. No prize commitment or live competition was created. The planning notes below are historical; Community Markets and Streak Five remain next in sequence.

## Product direction, 19 October 2026

Owner clarification: Survivor creation is admin-only, with configurable free or fee-gated entry and a separately set prize. The [interactive local preview](design/survivor-review/README.md) demonstrates creation, entry, picks, used-team restrictions, survivor standings and results. The [rules proposal](docs/product/survivor-rules.md) records the future backend boundary and unresolved funding decisions. No live game, fee collection or funded award is implemented by this preview. This supersedes the earlier free-only Survivor planning note below; Five remains free initially.

The next-feature sequence is **Streak Survivor, Community Markets, then Streak Five**. These are planned, not implemented. The owner asked to retain both games under Streak Games and community-created markets under Predictions. Free game entry is the starting scope. [The roadmap](docs/product/scope-and-roadmap.md#current-product-decisions-19-october-2026) records the agreed direction, grouped sidebar, initial boundaries and unresolved rules. Start with a Survivor rules specification and interactive UX preview; keep Five, original logo, hosted operations, notifications and the MetaMask investigation visible in the backlog. No application code or deployment was changed by this planning update.

19 October My Activity implementation: owner approved Open bets/History and publication. Production activity now uses verified chain positions, separate payment recovery, exact storage/return breakdowns and claim review in a responsive drawer. Finished fixture cards no longer inherit the empty legacy ledger void status. Focused checks and four Chromium/WebKit claim journeys passed with independent recovery review; exact-candidate release gates and publication are next. [Delivery record](docs/delivery/activity-history.md).

19 October hosted readiness update: public atomic demand is enabled with 195 fixtures, and the pinned batch configuration responds successfully. The owner accepts losing historical test stakes and defers dev/production switching work. No historical state was deleted or new wallet payment made during this check. Hosted payment completion, settlement and persistence across restart still require verification.

## Hosted launcher, 19 October 2026

The hosted API/sponsor/worker implementation is ready for the owner-authorized release. All 52 local major-gate checks passed at 08:54:42 UTC, alongside ten Linux process tests and independent recovery review. [Implementation and activation boundaries](docs/delivery/hosted-launcher.md). Render startup configuration, operator handover and public payment verification remain separate acceptance steps. No hosted readiness or new public transaction is claimed.

## Current follow-up, 17 October 2026

The hero correction is published as `8e32db6`. Render deployed it successfully at 19:00:07 UTC, and the live root stylesheet matches the tested build. All 51 checks passed for commit and both push attempts; the first upload disconnected after checks and the HTTP/1.1 retry succeeded. Evidence: `.quality-artifacts/hero-release-*`. Earlier local-only language below is historical.

The owner then requested smaller hooks, published as `37f5fd7`. The [revised quality policy](docs/delivery/quality.md#scoped-hooks) uses focused docs/CSS/tooling checks and reuses a successful exact-tree receipt for up to 24 hours. Other code and major runtime changes retain full validation. Formatting, static policies and all 13 tooling regressions passed in 8.85 seconds before commit. Push reused that exact-tree receipt without repeating tests. Evidence: `.quality-artifacts/hook-scope-*`; no new application behavior or security clearance is implied.

The landing hero copy now centers in the viewport space below the navigation without depending on the fixture board's height. The local web build, all 26 existing Season browser groups and 22 additional Chromium/WebKit viewport profiles passed, with visible, clickable CTAs and no horizontal overflow or page errors. Evidence is in `.quality-artifacts/hero-centering-*`. This CSS correction is local and uncommitted.

MetaMask's public-site "Malicious site" and "High-risk request" warnings remain unresolved. The inspected login uses a single-use, origin-bound, five-minute `personal_sign` challenge, with no payment or allowance request. Published wallet bundles matched the expected build at 16:25 UTC. These findings do not prove a false classification. See the [work tracker](docs/work-tracker.md) for evidence and the provider-review next step. No wallet approval, security bypass or support submission was performed.

## Week 21 release, 17 October 2026

Published through [PR 4](https://github.com/HeySomtee/ckbuilder/pull/4): release `45297c1c`, main merge `8621e4d`, tested and merged tree `984ffa2f`. Both exact-candidate local gates passed all 51 checks. PR consolidation and remote branch cleanup are complete. After an initial failure, Render retry `dep-db9ptfrbc2fs73cqb0hg` succeeded at 16:14:46 UTC and the expected public JavaScript was verified. See the [release record](docs/delivery/week-21-release.md). This establishes the new hosted web app, not complete hosted payment operations.

The owner explicitly authorized publication of the accumulated approved implementation, the [Week 21 report](../../reports/week-21.md), screenshots and integration of the outstanding PR stack into main. Earlier dated commit pauses below are historical and superseded for this release. The report includes the confirmed three-prediction public payment and separates it from local settlement tests. Exact-candidate commit and push gates remain required; hosted Actions remain paused by the account billing lock. Render's API deployment does not itself configure the durable sponsor, registry and lifecycle worker needed for hosted payments. Five, an original logo, direct v4 notifications and operational readiness remain open. No optional campaign commitment was approved.

## Implementation history

17 October compact slip is locally active: Picks/Activity separation, compact full wallet total, on-demand refundable-cost details, one coral input focus ring and animated action-button stages. One stable tracker retains recovery across signed payments and tabs. Fresh catalogue and creation-transaction reads are deduplicated within each operation. All **51 local major-gate checks passed at 14:48:10 UTC**, including signed settlement/claims and reorg recovery. Independent review is approved. The actual local API passed read-only phone/desktop checks; API and sponsor were safely restarted with payments enabled. See the [delivery record](docs/delivery/compact-slip-implementation.md). No commits or pushes; no owner-wallet transaction was made.

17 October compact slip proposal is ready at `http://127.0.0.1:4187/`. Six isolated Chromium/WebKit journeys passed for separate Picks/Activity, compact costs, unified input focus and simulated pending-payment recovery. [Preview and performance proposal](design/slip-workspace-review/README.md). Implementation awaits owner approval; the working application and payment pipeline are unchanged by this preview. No commits or pushes.

17 October sponsor review/recovery correction is locally active. Sponsor contention waits briefly instead of immediately returning a generic failure, unsigned review errors no longer imply a signature exists, and signed-payment tracking continues through unavailable responses to verified confirmation. All **50 major-gate checks passed at 11:30:23 UTC** with independent recovery review. Public inspection confirms the owner's Manchester City vs Ipswich payment committed. Its earlier error was not proof of failed payment; the exact Chelsea review error remains unreconstructed. See the [delivery record](docs/delivery/sponsor-review-recovery.md). Local payment demand is enabled; Chelsea has since passed kickoff. No additional owner payment, commit or push was made.

17 October terminal/payment upgrade is locally active. Real football intelligence, compact terminal typography, upfront refundable-storage disclosure and an expandable background payment tracker are added. All **50 local major-gate checks passed at 10:51:39 UTC**; independent recovery review is approved. Final responsive follow-up evidence and real-provider screenshots are recorded in the [delivery record](docs/delivery/terminal-payment-upgrade.md). The owner successfully paid for three predictions; public chain inspection confirms a 1,263.00006104 tCKB debit and three sponsored market creations, superseding the earlier zero-market observation below. The agent made no owner-wallet payment. Storage sponsorship remains a separate economics decision. No commits or pushes.

17 October checkout and chart correction complete locally: market details and old entry URLs now use the atomic slip, reconnect works in place, and unchanged EVM account events retain the signer. Cards have visible detail links. The compact match page adds a Polymarket-inspired interactive chart, current on-chain pool shares and blue/amber notices. All **50 major-gate checks passed at 09:54:32 UTC**, including full-app EVM payments and signed local-chain settlement. Read-only phone/desktop checks passed separately. See the [delivery record](docs/delivery/checkout-route-correction.md). The current local atomic registry has no initialized markets yet; first-bet sponsorship is available. No payment from the owner's wallet is claimed. **No commits or pushes.** Five, direct notifications, durable history/operation and physical-wallet validation remain open.

17 October Overview/glass correction: compact team-led rows, clear blue side-panel reflections and CKB jersey crests are active locally. Home, Draw and Away use muted blue, green and red highlights with clear faces. All **48 major-gate checks passed at 07:58:50 UTC**, with final desktop/mobile read-only screenshots checked separately. See the [delivery record](docs/delivery/overview-glass-correction.md). No commits or pushes. Five entry/scoring and the earlier operational commitments remain open.

17 October density correction: smaller type and tighter layout are implemented across the current Season app and public landing. The desktop rail has no independent scrolling or promotional footer; short windows retain all destinations through the bottom navigation and More. All **48 major-gate checks passed at 07:08 UTC**, including ten compact viewport profiles and six navigation/slip journeys. Read-only local visual checks passed separately. See the [delivery record](docs/delivery/compact-layout-correction.md). No commits or pushes.

17 October: the approved compact account/slip layout and full navigation are implemented and locally active, with Wallet renamed **My Account**. All **48 local major-gate checks passed**, including browser, database, contract and signed-chain regressions. Real-provider local phone/desktop checks and the Telegram receiver verification passed separately. See the [delivery record](docs/delivery/account-navigation-correction.md). **No commits or pushes are authorized; this work is uncommitted.** Earlier release evidence below describes the published 16 October revision.

Active work, earlier commitments and the next resume point are tracked in the [work tracker](docs/work-tracker.md). Read it before starting or switching tasks.

Updated **16 October 2026**, Africa/Lagos. The current candidate adds one payment for up to eight independent predictions inside the slip, separate Wallet and Activity pages, compact balance/address controls and Telegram settings. The separate v4 contract is deployed on public testnet with 13 canonical confirmations observed. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. See the [atomic slip delivery record](docs/delivery/atomic-slip-correction.md) for pins, evidence and limits. No public eight-line user payment, public v4 settlement or hosted operation is claimed.

## Owner decisions

Latest correction, 16 October: review and payment stay inside the slip. One X close button and Escape retain the draft; Clear slip remains explicit. Genie motion is removed. A combined payment includes every reviewed line, with independent settlement and one claim per position. Streak covers reserves for new markets, while the bettor pays principal, 321 CKB recoverable storage per line and the exact network fee. Wallet shows balance, address, connection and Telegram; Activity owns history, recovery and claims.

The earlier sponsored-creation increment established owner-first signing, sponsor-last co-signing and durable partial recovery. V4 extends that model to several distinct market groups, preserving the original-generation terms, descriptors and exits. The previous v3 release passed 42 local gate steps at 14:59 UTC; those results are historical evidence for that revision, not a completed gate for this candidate.

Historical checkout correction, 16 October: the prior individual-payment handoff passed a 35-step gate at 12:48 UTC, as recorded in the [tracker](docs/work-tracker.md#slip-to-payment-correction). The atomic slip replaces that handoff for v4 entry. Existing generations remain independently recoverable.

Runtime correction after PR 4, 16 October: the owner confirmed that local testing is the present target. Local sign-in is enabled after removing an accidental launcher restriction. Signed authentication, profile updates and logout passed against the running app. Fixtures refresh continuously and a separate local operator now runs recurring cycles for the funded fixture. This depends on the computer remaining available; public hosting is not required for the current local task. See the [tracker](docs/work-tracker.md#local-usability-correction-after-publication) for evidence. Historical milestone results below retain their original release state.

- The Season UI and architecture are approved: React/TypeScript/Vite, the retained Node API, clear glass, labelled controls and a denser prediction slip.
- The latest owner correction uses one X close control, retained drafts and immediate opening/closing. Earlier Minimize and Genie evidence is historical.
- Independent predictions in one combined payment are implemented for up to eight eligible v4 fixtures, with final release verification pending.
- The five direct-journey steps remain: wallet capacity, exact review, signing, canonical confirmation/recovery, and independent result/claim/refund recovery. Combined entry preserves each position's independent exit.
- Fixtures and logos must use API data. A matchweek covers Friday through Monday, including Monday EPL fixtures.
- Featured matches use weighted league and club preferences. EPL leads otherwise comparable fixtures, followed by La Liga and Italian Serie A, but marquee matches such as El Clásico can outrank EPL games.
- Hosted CI work is paused at the owner's request after GitHub's account billing lock prevented jobs from starting. Local commit and push gates remain mandatory.

## Implementation state

| Area                      | State                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Season app                | Integrated shell at `/season/`, real API fixture catalogue, Friday-to-Monday filters, search, pagination and error recovery                                                                |
| Identity                  | Durable single-use challenges and hashed sessions, full lock binding, exact origin policy, secure hosted cookies and verified database TLS configuration                                   |
| Public landing            | New Season design at `/` and `/welcome/`, live API fixture preview with visible-tab refresh and automatic matchweek rollover, browsing before login and clearly labelled Five introduction |
| Existing app              | Retained at `/index.html`, including custodial market details, activity, wallet and withdrawals; existing root hash links preserved                                                        |
| Week 20 Rust work         | Historical protocol and v2/v3 positions retained; separate v4 supports atomic entry with unchanged payout/storage economics and guard                                                      |
| Market detail and draft   | API fixture detail and persistent independent picks; exact combined review and one payment inside the slip for up to eight eligible v4 fixtures                                            |
| Direct single-market flow | All five parts implemented and verified: wallet capacity, exact principal/storage/fee review, wallet signing, persisted signed bytes, canonical confirmation and position/claim recovery   |
| Oracle and operator       | Immutable real-fixture catalogue, strict regulation-time observations, durable signed jobs and a bounded separate worker; no hosted worker activation claimed                              |
| Independent owner exits   | Browser recovery export and standalone claim, exact-byte resubmission and canonical conflict-proof recovery implemented without API or admin permission                                    |
| Slip interaction          | Compact native dialog, one X close control, retained draft and focus restoration; Genie removed by owner                                                                                   |
| Atomic payment and Five   | Atomic entry published in Week 21 after both 51-check release gates; durable hosted operation remains open. Five remains planned                                                           |
| Quality foundation        | Published in [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); local hooks and workflow configuration retained                                                                        |
| Hosted checks             | No successful run claimed; temporary required branch protection removed following the owner's override                                                                                     |

## Current verification

V4 passed **149 labelled VM checks** and **37 signed local-devnet product checks plus three harness checks**. The actual node exercises native and genuine OmniLock wallets, eight-new, mixed and eight-funded payments, independent claims, refunds, lost responses and reorganisation recovery. Frontend checks passed 29 unit groups, four combined-slip browser journeys and eight Wallet/shared-connection journeys, plus TypeScript and lint. Public testnet evidence is the [v4 code deployment](https://pudge.explorer.nervos.org/transaction/0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f) only. These results do not substitute for the pending complete major and exact-candidate commit/push gates.

The [atomic delivery record](docs/delivery/atomic-slip-correction.md) identifies commands, generated artifacts, protocol pins and remaining activation work. Browser checks use synthetic transports and send no public transactions or Telegram messages. Hosted Actions remain paused.

## Historical direct verification

The earlier direct integration gate passed all **35 checks** at **2026-10-16T11:48:11.275Z**. The wallet/provisioning correction subsequently passed 38 steps, as recorded above. Evidence is in `.quality-artifacts/direct-full-gate.json` and `.quality-artifacts/direct-full-gate.log`. The direct adapter passed **25 actual signed local-devnet checks**, including the full six-hour refund and real reorganisation recovery. Public synthetic testnet verification completed at 11:13 UTC on 16 October with creation, two deposits, report, settlement, winning claim and losing-storage claim confirmed. The [milestone](docs/delivery/direct-testnet-milestone.md) links every transaction and the separate funded Everton vs Chelsea fixture. Hosted Actions remain paused.

The direct increment also has passing targeted backend checks in five groups, HTTP integration checks and four standalone recovery tests. They cover immutable fixture mappings, explicit fulltime scores, two-observation reporting, durable signed bytes, unknown broadcasts, canonical reorg checks, bounded worker scheduling and owner conflict-proof recovery. Backend TypeScript passes. These targeted checks use isolated synthetic data and stubbed chain reads; the native devnet and public-chain exercises provide separate evidence.

The synthetic public exercise passed with seven confirmed transactions; its run log is `.quality-artifacts/direct-public-run.log`. Synthetic oracle inputs were kept out of the real-football catalogue. The separate Everton vs Chelsea market is funded and enabled locally, and the worker was exercised once. This is fixture creation evidence, not completed real-football settlement or an unattended hosted service. Commands, counts, hashes and release state are recorded in the [direct milestone](docs/delivery/direct-testnet-milestone.md).

## Earlier verified increments

The UI correction passed the full **31-step gate**, finishing at **09:00 UTC on 16 October**, including **22 integrated browser groups** across Chromium and WebKit. Tests inspect actual painted snapshots at 390 and 1440px, two and eight picks, current amounts, interrupted transitions, focus, reduced motion and renderer failure. Source and unwarped capture comparisons were inspected separately from the narrowed frame. Independent recovery review resolved a delayed focus callback and a queued preference-event race. Browser tests now await positive page/account readiness and finish tracked local reads before unrelated document changes. Redundant navigation was removed while deliberate stale-response races and all browser-error assertions remain. Evidence is in `.quality-artifacts/ui-motion-full-gate.log` and the correction report.

The 16 October market/slip increment passed all **31 steps** of `npm.cmd run quality:major`. It adds server/domain tests, six draft recovery tests and six browser journeys, bringing integrated coverage to eighteen groups across Chromium/WebKit at 320, 390 and 1440px. The new checks include newer terms arriving before an older review, slow device clocks, retained invalid lines, cross-tab recovery and keyboard focus. Independent review found and resolved review freshness, account-return revival, device-clock expiry, storage denial and missing provider ownership checks. See the tracker for evidence and the next resume point.

The full local gate passed all **30 steps** for published revision `70beb34` on 15 October 2026, including the live fixture ranking follow-up. No required suite was skipped. That check used the local preview at `http://127.0.0.1:4100/` with real API fixtures in separate local storage, account mutations and payments disabled. Manual inspection confirmed team-logo loading; automated tests used synthetic fixtures and no live provider requests. The tracker records subsequent verification separately.

The recurring command is `npm.cmd run quality:major`, using a disposable local PostgreSQL database. Exact results are written to `.quality-artifacts/all.json` and repeated against the unchanged staged candidate by the commit and push hooks. The foundation passed all 20 steps before publication. Earlier Season work added frontend lint/build, identity and provider regressions, automatic API refresh, Monday-to-Tuesday rollover, ranking before pagination and chronological sorting. These checks remain in the current gate. See the [ranking policy](docs/product/fixture-ranking.md) for scoring and remaining data limits.

Targeted checks cover Monday fixtures, catalogue-only postponed matches, API logos, paging/search, failed reads, stale responses, real disposable wallet signatures, CCC connector event ordering, cancelled connection, logout failure and delayed account responses. Database tests cover challenge races, audience/expiry enforcement, session persistence across pool recreation, revocation and storage failure. Tests use synthetic data and loopback services; no production data or live settlement was used.

Independent identity/recovery review found audience/expiry, wallet binding, hosted fallback, test isolation, connector lifecycle, logout race and schedule coverage issues. These were corrected and reviewed again with no remaining blockers for this review milestone. This is not a security audit or deployment approval.

The approved preview retains 18 general and 32 combined-slip regression groups. Earlier motion research passed 56/58 with two mobile WebKit timing observations. That historical result remains recorded. The former controller had separate cold-start and cleanup checks in both engines. Genie was subsequently removed; this research does not describe current slip behavior. Physical-device wallet, focus and interaction checks still remain before a public pilot.

## Next and unresolved

1. Complete the current major and exact-candidate release gates, then verify local v4 API, sponsor and worker activation. Public contract deployment alone does not establish this application rollout.
2. Verify supported wallets and the current slip/chooser interactions on physical devices. JoyID identity binding remains unsupported. Establish durable operator storage, monitored execution, restore evidence and sufficient reserve/fee capacity before onboarding.
3. Complete bounded SQL mutations, coordinated abuse controls, backup/restore evidence and production job coordination. The new file-backed operator is explicitly one writer; API replication remains unsupported.
4. Verify Five player coverage, publish its rules and implement immutable entries and replayable scoring. Verify restored Telegram linking and implement direct v4 notification dispatch before offering settlement alerts. Keep legacy custody exits separate from direct claims.
5. Establish deployment capacity, support ownership and a funded campaign budget before public onboarding.

The fixture digest is an off-chain catalogue check, not an on-chain fixture commitment. Admin authority is pinned per market; this deployment does not have a global market-creator factory allowlist. The curated registry identifies the supported operator's instances. Current Neon health, broad wallet compatibility, hosted operator durability and production capacity remain unproven. Earlier local evidence and the completed synthetic public exercise do not establish live football settlement or deployment readiness.
