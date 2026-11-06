# Five manager names, squad pitches and refund status

6 November 2026. The owner approved the named standings/pitch preview and asked
for the stuck sponsor-refund message to be fixed. This change implements those
journeys in the existing Season app. It does not change game rules or funding
authority.

## Managers and squads

- A public FPL name is required before saving a squad or newly registering for a
  Five competition. It is separate from the account username. No official FPL
  account is required. Names accept 3 to 24 characters, including spaces.
- Profiles persist by authenticated account in the game database. Local synthetic
  games use their separate scope. Requests cannot choose another account's profile.
  Public names are not unique; shortened wallet labels disambiguate managers.
- Existing entries, sponsorships and refunds remain accessible. Names can be added
  or edited from **More → Your FPL name**, including after a deadline. Historical
  squads and their final-save tie-break timestamps are never rewritten by a name edit.
- Selecting a standings row opens the saved squad on the same pitch presentation
  used by My five: one forward, two midfielders, one defender and one goalkeeper.
  Captain points include the multiplier. Missing scores remain pending.
- Before the deadline, other managers' picks remain private. Mobile offers an
  explicit return to standings, a return from player details to the pitch, and
  previous/next manager controls. Closing restores the originating row's focus.
- Reward allocation and payment confirmation remain separate facts.

## Why the refund message stayed busy

The auction banner previously inferred "refunding" solely from losing an auction.
It never checked payout completion, even though individual contribution rows read
the refund ledger. A confirmed refund could therefore animate indefinitely.

The new owner-only summary joins the frozen refundable bids to their exact credit
IDs and payout journals. It totals top-ups and reports recorded, queued, paused,
confirming, delayed, returned or review-needed status. Only actual confirming
payments animate. Payments older than five minutes show a delay rather than an
endless progress claim. Partial returns show returned and remaining amounts;
available transaction links open the CKB testnet explorer. A stopped worker does
not turn an already confirmed refund back into a pending one.

Two delivery issues were also corrected. Reprocessing a round no longer queues
already assigned/paid auction refunds. An unsigned request that fails its backing
or transaction checks retains a persisted thirty-second retry time, allowing other
due wallets to run. Failure records store fixed categories, not raw RPC messages
or signed bytes.

Existing money safeguards remain: immutable credit amounts and destinations,
single reward-wallet signing lock, signed bytes and reservations committed before
broadcast, canonical confirmation checks and exact-byte retries. An unresolved
signed payout still blocks fresh input selection. This safety barrier must not be
removed just to make the UI appear faster. The wallet remains custodial testnet
rewards infrastructure, not a new escrow script.

## Verification and rollout

Focused checks cover profile validation, authentication/session fencing, scope
isolation, unchanged squad timestamps, concurrent first-start schema creation,
refund ownership/top-ups, partial returns, paid queue suppression and retry fairness.
Actual built-app browser checks use synthetic fixtures and blocked external
requests. They cover required names, saved drafts, private squads, player points,
mobile navigation and refund states.

Independent identity and money/recovery review is complete. All 94 stages of
`npm run quality:major` passed on 6 November, from 10:26:58 to 11:07:41 UTC,
including signed local-chain sponsorship, refund, restart and prize collection.
Evidence is in `.quality-artifacts/five-names-refunds-major.json` and its matching
log; built-app screenshots are under `.quality-artifacts/five-standings-runtime/`.
The later Zerion compatibility fix has separate follow-up checks; this major run
is not a single final-tree publication receipt for that later change.

The owner confirmed the refund report is hosted. A public read-only check at
10:45 UTC returned funding available, Gameweek 9 final and its auction settled;
the new refund field was absent. This establishes neither the owner's payout
status nor a successful hosted fix. No authenticated production records were read.
Deploy the API and rewards worker together with the existing efficiency refactor;
schema additions run through the normal guarded initialization. No new wallet,
private key or Render environment variable is required for these Five changes.
