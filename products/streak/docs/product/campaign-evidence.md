# Campaign evidence and analytics

5 November 2026. The first local implementation now has an admin **Evidence** tab,
private entrant CSV and verified JSON exports. See the [delivery record](../delivery/competitions.md)
for implemented coverage and verification. The broader analytics and public export
plan below remains future work; PostHog is not installed or enabled.

## Two sources, two purposes

**Streak's database and verified CKB observations** establish registrations, saved
squads, admitted predictions, results and paid awards. **Optional PostHog analytics**
explain how people arrive, where they get stuck and whether they return. Analytics
events never determine points, payouts or transaction confirmation.

Competition picks must enter the existing shared slip, review, signer, transaction
journal and recovery flow. Campaign attribution is metadata, not another payment
implementation. Five uses its existing squad editor, save operation and scoring.

## Reuse the existing evidence path

The [Activity index](../delivery/event-driven-activity.md) already relays durable
operator/payment observations, deduplicates receipts in PostgreSQL, verifies each
affected market against CKB and updates wallet projections. Page reads use the
database. A submitted or signed observation is not yet an admitted prediction.

Extend the successful verification commit with normalized transaction/position
evidence and an outbox record. Registration, meaningful squad saves and scoring
revisions write their campaign event in the same database transaction as the
accepted change. Deliver optional analytics asynchronously with bounded retries;
analytics outages must not block playing or financial recovery.

Use stable event IDs and unique transaction/position keys so retries, duplicate
relays and a multi-pick slip do not multiply counts. Recompute affected aggregates
when canonical evidence changes. Keep orphaned observations as excluded audit
history, with replacements linked. Final exports state the verification checkpoint,
confirmation policy, coverage gaps and last refresh time.

Current limits: Activity remains testnet-only. The local campaign implementation
adds original deposit commit evidence and Five meaningful-save history, plus a
separate read-only mainnet award verifier. It cannot reconstruct squad edit events
from before that history existed. Existing Five/Survivor payouts remain testnet-only.
Campaign exports cover qualifying positions, not every transaction or a complete
revenue ledger. Large-scale indexing upgrades remain deferred.

Implementation touchpoints, verified against the current source:

| Existing code                                                                                                                                                     | Campaign integration                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`app.tsx` `pick()`](../../web/src/app/app.tsx)                                                                                                                   | Competition outcome buttons call the same selection handler and shared draft/slip. Attribution cannot establish eligibility.                                                          |
| [`batch-ui.tsx`](../../web/src/features/direct/batch-ui.tsx), [`batch-client.ts`](../../web/src/features/direct/batch-client.ts)                                  | Reuse review, wallet signing, journal, submission and recovery. Emit intent events without duplicating the payment path.                                                              |
| [`five/ui.tsx`](../../web/src/features/five/ui.tsx), [`five/service.ts`](../../src/modules/five/service.ts), [`five/domain.ts`](../../src/modules/five/domain.ts) | Reuse the existing `enter` action and `saveEntry`. Meaningful squad/captain changes update tie-break time; unchanged retries and reordering preserve it.                              |
| [`activity/chain.ts`](../../src/modules/activity/chain.ts), [`activity/storage.ts`](../../src/modules/activity/storage.ts)                                        | Extend verified admission/projection commits with original transaction block evidence. Use canonical commit ordering for prediction ties, never browser clicks or index arrival time. |

## What the dashboard counts

| Measure                      | Definition                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registered / active entrants | Distinct registered accounts; active means at least one qualifying admitted prediction or valid locked Five squad. Show both. Non-participants retain their zero-point ranked entry.             |
| Participating wallets        | Distinct verified owner lock hashes with qualifying activity. Wallets and accounts are not proof of unique humans.                                                                               |
| On-chain transactions        | Distinct `(network, transaction hash)` with current canonical confirmation. Separate entry, report/settlement, collection/refund and award transfers. One slip may contain several positions.    |
| Predictions                  | Distinct admitted positions, with a separate count of campaign-scoring positions. Repeated bets do not create extra scoring opportunities.                                                       |
| Principal committed          | Sum admitted stake in integer shannons. Exclude 321 CKB position storage, operator reserves, fees, wallet change and refunded late deposits. Testnet stake is not revenue or real-dollar volume. |
| Collected / refunded         | Separate confirmed recipient amounts, returned principal, prize/profit and released storage where derivable. Keep network fees separate; never label a gross return as profit.                   |
| Mainnet campaign awards      | Announced, allocated and confirmed paid amounts separately. USD reference source/time and frozen CKB amounts accompany published prizes.                                                         |
| Participation conversion     | Active registered entrants divided by all registered entrants in the same competition, with numerator, denominator and cutoff shown.                                                             |
| Repeat participation         | Activated accounts that qualify again in a later specified matchweek, divided by the original cohort with that full follow-up window. Do not count immature cohorts as failures.                 |
| Reliability                  | Confirmed transactions divided by distinct submitted transaction hashes, with pending/rejected separate; confirmation latency from first broadcast observation, plus measured read-model lag.    |

Always segment mainnet/testnet, production/local/synthetic and community/operator
activity. Report competition traffic separately from ordinary play. Keep operator
and known test accounts labelled; campaign rewards make participation incentivized,
not evidence of organic retention. No claim of human-level Sybil resistance.

## Export a grant evidence pack

Provide **Summary**, **Transactions**, **Participation**, **Results and awards**
CSV/JSON exports plus a short Markdown summary. Include campaign/rules revision,
date range/timezone, filters, metric definitions, verification coverage and export ID.
Transaction rows include network, hash/explorer link, action, market, position/outpoint,
principal/storage/fee components, canonical block hash/number/timestamp, first observed
time and verification status. Keep transaction-to-position joins to avoid double counting.
Results retain score source/revision, final snapshot, tie-break evidence and payout hash.

Offer a public evidence export with pseudonymous entrant IDs and no wallet-to-profile
mapping; keep address-level winner/payment exports admin-only. Public transaction
hashes are still linkable on-chain. Exclude signatures, signed bytes, keys, sessions,
private drafts and hidden Five squads from analytics and public exports.

## Optional PostHog setup

Start with explicit events: `competition_viewed`, `wallet_connection_started`,
`wallet_sign_in_failed`, `competition_registered`, `prediction_added_to_slip`,
`payment_review_started`, `payment_submitted`, `prediction_admitted`,
`five_squad_saved`, `leaderboard_viewed`, `return_collected`, `campaign_prize_paid`.
Durable successes come from the backend; browser intent is labelled separately.
Use allowlisted campaign/game/provider/device/source and error-category properties,
with pseudonymous analytics IDs. Reset identity on disconnect/account change.
Disable broad autocapture and session replay initially, strip URL queries and raw
errors, exclude wallet addresses/signatures, and honor the chosen collection consent.
PostHog supports [explicit events](https://posthog.com/docs/product-analytics/capture-events)
and [collection controls](https://posthog.com/docs/privacy/data-collection).

Show a [funnel](https://posthog.com/docs/product-analytics/funnels) from visit to
registration to admitted prediction or saved squad, with a stated conversion window.
Use [retention](https://posthog.com/docs/product-analytics/retention) to measure return
play, segmented by source and wallet provider. Opt-outs/blockers mean analytics
coverage differs from database totals; show that limitation instead of forcing agreement.
Confirm the owner's PostHog project and region before setup. No project, credential,
tracking deployment or dashboard was accessed or created for this design.

## Prepare a new PostHog project

1. Create a PostHog account, choose the hosting region and name the project
   **Streak Production**. A new account includes a default project you can rename;
   use the [project switcher/settings](https://posthog.com/docs/settings/projects).
2. Choose Product Analytics with the JavaScript/React integration. Keep the project
   URL, write-only project token and exact regional API host from the setup screen
   ready for integration. No personal API key or wallet key belongs in browser code.
   Do not paste the default tracking snippet into the site yet.
3. Keep broad autocapture, session replay and automatic error capture off initially.
   In project privacy settings, discard stored IP addresses. During integration,
   explicitly disable automatic pageviews/pageleaves too: `autocapture: false`
   does not disable those. We will allowlist sanitized events/routes using
   [`before_send` and SDK controls](https://posthog.com/docs/libraries/js/config),
   with `disable_session_recording: true` and `capture_exceptions: false`.
4. Keep local/synthetic traffic out of the production project. Before enabling
   production collection, confirm consent handling and verify the actual outgoing
   event payloads contain no wallet addresses, signatures, session tokens or URL
   queries. Check default SDK properties as well as our custom event properties.
5. After integration, verify events and create **Campaign participation**,
   **Wallet/payment friction** and **Return play** dashboards. Configure cost limits
   before enabling optional paid features. Creating the project alone starts no tracking.

The owner can prepare the project now; installation, event validation and activation
are a separate implementation step. No PostHog account access is needed for this guide.
