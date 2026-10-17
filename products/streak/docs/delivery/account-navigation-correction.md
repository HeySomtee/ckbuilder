# My Account and restored navigation

17 October 2026. The owner approved the [account/slip preview](../../design/account-slip-review/README.md), requested the full original navigation and renamed Wallet to My Account. Changes remain local and uncommitted. Commits and pushes are paused by the owner.

## Implemented behavior

- My Account groups the live wallet balance, address copying, connection controls, Telegram and activity/recovery links in one panel. `?view=account` is canonical; `?view=wallet` still works.
- Desktop includes Overview, Streak Five, Markets, Matchday, My activity, Clubhouse and My Account. Mobile keeps four primary destinations and puts Five, Matchday and Clubhouse under More.
- Overview uses API fixtures and logos, current matchweek boundaries and periodic refreshing. It has loading, error and empty states. It does not invent fantasy standings or available winnings.
- Streak Five is a coming-soon information page. Entries, player scoring and prizes are not implemented by this change. Matchday and Clubhouse link to the retained match centre, crews and leaderboard. Those legacy community statistics do not include new direct contract positions.
- Add matches stays in the slip header outside the scrolling picks. Eight picks show Slip full; removing a pick restores the control. Add matches returns to Markets from any section without resetting the draft. The collapsed slip remains opaque when hovered or focused. Close and Escape retain picks, with focus returned to the dock.
- Telegram's confirmation no longer interpolates an optional Streak username. Both named and unnamed accounts receive: `Your Telegram account is now connected to Streak.` Direct v4 settlement alerts remain a separate outstanding feature.

## Verification and review

Focused checks passed for My Account and Telegram components, shared EVM wallet connection, the existing Season journeys and six new Chromium/WebKit navigation journeys at 320x568, 390x844 and 1440x900. The new checks cover all destinations, old wallet links, eight-pick scrolling, opaque hover, draft retention, keyboard dismissal and actual API query rollover after Monday midnight. Storage-failure tests ensure both internal marketing links preserve an unsaved eighth pick without reloading the document.

Signed HTTP identity regressions exercise the real webhook handler with a stubbed Telegram transport, checking named/unnamed accounts, wrong secrets and token replay. They send no external messages. Independent review identified the date-rollover and internal full-reload issues; both were fixed and re-reviewed with no remaining blocker in the reviewed scope.

The complete **48-check major gate passed** on 17 October, including the Rust VM suites and signed native/EVM local-chain lifecycle tests. The initial attempt stopped on an obsolete Skip to markets accessibility-label expectation. The assertion now checks Skip to content and still checks keyboard focus transfer into the main region. No test was skipped or weakened. Separate real-provider local checks passed at 390px and 1440px with two retained predictions, no page errors and zero write requests. The renewed Telegram receiver was verified without messages or account links.

Generated evidence is in `.quality-artifacts/account-navigation/`, `.quality-artifacts/account-navigation-major.log` and `.quality-artifacts/account-navigation-major.json` at the repository root. Real-provider local checks are separate from the synthetic suite. No new public transaction, contract deployment, user signature or settlement is claimed.

## Local operation

The local API uses the existing datastore and separate sponsor/worker. The launcher permits existing crew reads and create/join/leave operations through the backend's normal authentication and request policy; legacy financial mutations remain blocked. No crew or membership is created by verification. Telegram uses the existing webhook-only gateway and a temporary tunnel. The expired tunnel was replaced during activation; the computer and receiver must stay running. This is not durable hosted operation.
