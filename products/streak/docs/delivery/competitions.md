# Competitions

5 November 2026. Implemented and verified locally in the runs below. Not deployed.

## Play and administration

Open `/season/?view=competitions`. Signed-in configured administrators get **Manage**
and guided creation. Choose Predictions or Five, name it, select fixtures or an
existing API gameweek, set the registration deadline, and edit winning places and
exact CKB prizes. USD figures are reference labels, not a live conversion promise.
Publication freezes these terms. A rehearsal uses the same implementation but is
labelled and excluded from community evidence; it cannot record mainnet awards.

Registration creates a ranked entry immediately. Predictions use the existing slip,
review, wallet signing and recovery. Five opens its existing editor on the selected
gameweek. Ordinary Markets predictions qualify too. Registration reserves no space:
all users share each market's four lanes and 32 positions. Occupancy comes from the
verified Activity read model; checkout still checks live capacity.

Predictions award 3 points for a correct first qualifying admitted prediction per
fixture, 0 otherwise. Deposits must commit after registration and before the frozen
cutoff. Stake size has no effect. Ties use the earlier final qualifying prediction
in canonical block/transaction/output order, with timestamps shown for inspection.
Five uses its actual squad scores and earlier meaningful final squad/captain save.
Unchanged saves, reordering and display-name changes do not reset that time.
Inactive registrants rank below participants, including participants with negative
Five scores. Only participants receive awards; unused places remain unawarded.

Public standings refresh while a competition is active. An administrator reviews
verified final results before freezing winners. Provider completion alone cannot
settle a prediction market. Missing/ambiguous chain evidence retains checked points
and prevents finalization. Post-finalization score changes flag review and stop new
payments instead of silently reallocating awards.

Deletion reviews the named competition, then requires its exact name. The server
rechecks admin identity and revision under a database row lock. Deletion removes
discovery and closes registration; entrants retain archived results and prize access.
Underlying predictions, squads, transaction recovery and promised awards survive.

## Storage and verification

PostgreSQL tables `streak_campaigns`, `streak_campaign_entries`,
`streak_campaign_audit` and `streak_campaign_payout_outputs` hold terms, registration,
projections, mutation history and globally unique payout outputs. Writes use
database time and per-campaign row locks. No blockchain funds move through these
tables. Five additionally retains meaningful-save history, and Activity retains
original deposit block/hash/time/transaction/output coordinates through admission,
settlement and collection.

Saved Activity/Five events wake bounded reconciliation. The existing server tick
repairs missed wakeups; there is no additional continuous polling worker. Source
snapshots are read once per selected market, not once per wallet. Canonical market
bindings cannot silently switch. Reconciliation pages independently of the most
recent 100 discovery records, so newer drafts cannot starve older obligations.
Campaign-referenced Activity records queue a refresh after two minutes; evidence
older than five minutes blocks fresh scoring and finalization while retaining
previously checked points. Existing worker backoff still applies during outages.
A shorter chain reorganization forces replay instead of reusing old confirmation
depth. These checks use the existing worker, not a second chain scanner.

An entirely uncreated fixture has no settlement transaction. An optional authenticated
operator attestation can establish that its retained journals contain no accepted
owner signature or signed creation after its cutoff. It checks retained market
history and a mature canonical anchor. Chain RPC runs outside the payment lock;
a second short locked digest check rejects intervening history changes. The source
stores the private certificate, assigns no prediction/result and cannot award points
from absence. Ambiguous signatures, missing/corrupt history and stale evidence block it.

This is **operator-attested empty**, not cryptographic chain-wide absence. It is
disabled by default. Set `STREAK_CAMPAIGNS_EMPTY_HISTORY_ACK=1` only when the operator
key has one writer and all its signing history is retained, including any former
local instance. An unrelated process sharing that key invalidates the completeness
assumption. Without that assurance, use markets created through ordinary testnet
predictions before kickoff. Organizer seed bets made before registration do not
count as campaign participation and consume actual market slots. Missing evidence
is named in the admin notice.

## Mainnet prizes

The organizer holds the mainnet funds. Streak prepares the winner list and exact
amounts; the organizer sends using their wallet and records the transaction hash
and recipient output index. No mainnet signing key belongs on Render. This version
does not broadcast a mainnet batch or create independent on-chain claim cells.

Winners explicitly confirm a mainnet `ckb1` receiving address. It then locks to avoid
a recipient change racing a prepared payment. Amounts must cover that address's
cell capacity. Administrator verification requires the exact plain output, configured
source wallet, a payment after finalization, a canonical block and 24 confirmations.
One output cannot satisfy multiple awards. Recheck refreshes proof for the same
output; a changed source result or verification failure never starts a second send.

## Configuration and rehearsal

Existing `DATABASE_URL` and Five/Survivor admin settings work by default. Optional:

| Variable                           | Purpose                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `STREAK_CAMPAIGNS_DATABASE_URL`    | Separate persistent campaign DB; otherwise Five/Survivor DB, then `DATABASE_URL`           |
| `STREAK_CAMPAIGNS_ADMIN_WALLETS`   | Comma-separated signed-in testnet admin addresses; otherwise existing Five/Survivor admins |
| `STREAK_CAMPAIGNS_REWARDS_ADDRESS` | Organizer's **mainnet** receiving address used to verify prize funding inputs              |

The hosted launcher passes DB/admin/reward address settings only to the API and
the history acknowledgement only to the sponsor service. It passes no mainnet key. Keep
ordinary `STREAK_GAMES_DATA_MODE=api` for the current-gameweek rehearsal. Campaigns
reject dummy game mode and the reserved dummy database schema. Keep real testnet
payments and synthetic browser evidence separately labelled.
Keep the existing `STREAK_FIVE_FPL_ENABLED=1` setting for automatic Five gameweeks,
future-week preparation and player scores. Predictions still require the normal
Activity index, sponsor and settler services; competition records do not replace them.

1. Create a labelled rehearsal, choose the current API gameweek or future fixtures,
   and publish. Register funded test accounts.
2. Save Five squads or submit predictions through the normal flow. Check immediate
   ranks, admission, points and ties. A full/closed market must stop new picks.
3. Use the admin entrants/evidence views. Delete through both steps and verify
   archived entries remain accessible. Mainnet payout recording stays disabled for
   rehearsal competitions.
4. Create a separate community campaign with the following gameweek and final
   prize amounts. Do not relabel rehearsal activity as community participation.

Five setup also lists upcoming official FPL gameweeks. Use **Prepare gameweek**
when the chosen week is not open yet. It creates the ordinary automatically scored
Five round, so next week's campaign does not have to wait for this week's deadline.
Preparation fixes that week's player pool and prices; existing published rounds
are reused without repricing. The selected official deadline is checked again
before the round opens. Preparation requires an administrator and the ordinary
automatic FPL integration, with no dummy or imported-JSON fallback.

## Evidence and limits

Admin CSV exports cover all entrants, independent of leaderboard pagination. JSON
adds original qualifying position proofs, source revisions, exact testnet principal
and separate mainnet payout evidence. These are private operational exports: owner
locks, display names and receiving addresses can link identities. Redact those
before sharing publicly. Counts describe accounts/locks, not verified unique people;
qualifying campaign volume excludes repeat and non-campaign bets, storage and fees.
Rehearsal flags do not prove community ownership: exclude known organizer test
accounts separately if they enter a regular campaign. Operator certificates appear
separately from chain transaction evidence in the private JSON export.

PostHog remains off. Follow the [new-project instructions](../product/campaign-evidence.md#prepare-a-new-posthog-project)
when preparing the optional analytics project. Page-view funnels, public redacted
exports and automatic payout transactions are not implemented by this increment.

## Local verification, 5 November 2026

Focused checks passed before the full gate:

- Six actual React journeys in Chromium/WebKit at 320, 390 and 1440 pixels:
  registration, the shared slip, configurable fixtures/prizes, future gameweek
  preparation, publication, deletion, finished awards and admin guards.
- Twenty-two navigation cases cover short desktop screens, populated competition
  lists, keyboard access and mobile navigation. Named lists scroll within the
  desktop navigation area; controls retain their 44-pixel targets.
- Disposable PostgreSQL checks cover concurrent registration, database-clock
  cutoffs, retained deletion history, payout-output uniqueness and rollback.
- Source and HTTP checks cover canonical admission, score freshness, shorter-chain
  recovery, meaningful Five saves, future-week automatic scoring, session/origin
  guards and private exports. Sixteen payout/evidence checks use synthetic CKB data.

Independent review covered money separation, source identity, finalization,
mainnet payout proof, account privacy, administration and future gameweek
preparation. Findings about stale chain evidence, shorter reorganizations,
unavailable saved gameweeks and navigation reachability were fixed and rechecked.

The final runtime tree completed all required coverage across two commands:

- `npm run quality:major`: 75 static/build, unit, PostgreSQL and browser stages
  passed. The run stopped at the first Rust stage because the sandbox denied WSL
  access before its tests started, at 13:55 UTC.
- `npm run quality:contracts`: all 11 CKB script and signed local-chain stages
  passed with WSL access and the disposable PostgreSQL setting, at 14:10 UTC.
  An earlier retry omitted that database setting and stopped before Five; the
  corrected complete contract-group run passed.

These are 86 required stages on unchanged runtime code, with no skipped suites.
The original major-run aggregate remains failed for the WSL prerequisite; a
single-run green release receipt is not claimed. No commit, push or deployment
was made. Final documentation formatting and static policies are checked separately.
Physical wallets, hosted configuration and real mainnet transfers remain separate
acceptance work. No live provider credentials, production database or wallet keys
are used by these tests.
