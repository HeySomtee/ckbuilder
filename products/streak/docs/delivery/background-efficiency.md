# Background work and memory refactor

6 November 2026. Local implementation; deployment and hosted savings are not yet
verified. This changes scheduling and storage access, not prediction economics.
Source: uncommitted workspace based on `098938c`, including earlier local work.

## What changed

| Area                    | Before                                                         | New behavior                                                                                                             |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Fixture synchronization | Repeatedly loaded and copied the twelve-table store            | Queries affected fixtures, unsettled bets and users in 64-fixture pages inside one transaction; writes changed rows only |
| Receipt recovery        | Read the whole legacy store                                    | Selects pending receipts and their associated source rows directly                                                       |
| Activity                | Rewrote every owner projection after a market audit            | Preserves unchanged owner rows; freshness lives on the market row; reorgs still remove invalidated rows                  |
| Competitions            | Fresh verification timestamps could create new audit revisions | Audits semantic changes; freshness checks remain visible without generating new score histories                          |
| Scheduling              | Frequent fixed database polling                                | Durable due times, coalesced local wakes, startup catch-up and sparse fallback checks                                    |
| Rewards readiness       | A database heartbeat every ten seconds                         | Authenticated local health request to the supervised worker, including bounded database/RPC checks                       |
| Retained data           | Provider responses and full chain blocks could remain cached   | Provider caches have age/count/byte budgets; Activity retains only relevant transaction indices from fallback blocks     |
| Restart ownership       | A dead process could leave its scheduling lease                | Linux kernel-held scheduling lock releases on process death; financial recovery locks remain separate                    |

The SQL path retains the existing single API writer queue, user normalization,
exact payout/refund arithmetic and cache invalidation. An error rolls back the
entire fixture batch, including earlier pages. One large legacy market can still
contain many bets; a page limit is not a hard bound on transaction memory.
Interactive legacy routes that still use full snapshots are outside this conversion.

Football requests share four active slots and at most 32 queued requests, with
queue timeouts and a 4 MiB streamed response limit. Retained fixture/evidence data
has a 16 MiB serialized budget and a 4,096-fixture admission bound. Hitting these
limits preserves previous evidence and reports a capacity error; it does not
silently discard unfinished matches. Survivor correction history has no durable
consumer acknowledgement yet, so it is not deleted solely because it is old.
FPL responses have an 8 MiB retained budget. Both the Matchday feed and its outer
API snapshot cache have separate 4 MiB budgets. Serialized byte budgets are not
exact JavaScript heap measurements.

## When work runs

- Source changes save their rewards job in the same PostgreSQL transaction. A
  local wake then reduces latency. Lost notifications cannot erase saved work.
- Submitted rewards funding and payouts retry after ten seconds. Failures retain
  signed bytes and reservations and defer recovery. Auction closure and unfunded
  draft refunds retain their deadlines.
- Five progression wakes for official deadlines and expected live scoring. Survivor
  continues independently of football synchronization failures and schedules its
  lock and resolution boundaries. Request-time deadline enforcement remains intact.
- Activity pending submissions retry after twenty seconds; validation, refunds and
  claims have bounded follow-up checks. Fully collected history gets a daily
  canonical checkpoint audit. Empty local event relay checks do not query PostgreSQL.
- Active competitions retain frequent source verification. Finished/deleted
  competitions retain daily audits and pending award checks.
- With no nearer work, database schedulers recheck at most fifteen minutes later.
  The existing direct settlement process still runs its bounded interval; it is
  not replaced with a new service.

This allows idle gaps for Neon. Live matches, outstanding payments, traffic and
failure recovery can legitimately keep the database awake. Lower query counts do
not establish a particular bill reduction.

## Recovery and deployment

Deploy the API, supervisor and rewards worker together. Startup adds the queue
tables and discovers existing obligations. Mixed old/new writers are unsupported.
All four game/rewards initializers acquire the same transaction-scoped schema
lock before touching tables. Concurrent first starts cannot race queue creation;
failed initialization rolls back and can retry without losing existing obligations.
The hosted supervisor generates its own private control token; there is no new
secret to enter on Render. Standalone local rewards workers retain the old
heartbeat/readiness path for compatibility.

Linux needs `flock` and the existing exclusive durable disk. Legacy scheduling
locks are never silently removed. Financial locks, saved transaction bytes,
reservations and journals retain their recovery requirements. See
[worker ownership and health details](hosted-worker-efficiency.md).

The supervisor logs actual cgroup memory usage, peak and limit every five minutes,
without database writes. A previous Render memory-limit failure is confirmed, but
the exact triggering operation and a memory leak have not been established. The
owner's latest hosted sample was 295.73 MiB current and 352.78 MiB peak against
512 MiB, with no current-container OOM events.

## Verification and remaining acceptance

Independent review covers targeted SQL and legacy user compatibility, financial
queue generations/fairness, retained signing barriers, Activity canonical ordering,
and Linux lock lifetime/authenticated health. Disposable PostgreSQL regressions
exercise actual payouts/refunds, rollback, concurrent source updates, unchanged row
versions, lost-wake recovery and pending payout migration. The 91-stage
`npm run quality:major` passed on Node 24.14.0 on 6 November at 08:41:26 UTC,
including browser journeys, Rust VM checks and signed disposable-chain lifecycles.
Review then reproduced and fixed a first-start queue schema race. Its focused
PostgreSQL regression passes. The final `quality:static` (7 stages), `quality:unit`
(40 stages) and `quality:postgres` (10 stages) runs passed, finishing at 08:51:30 UTC.
Independent review verified the schema lock precedes table locks and releases on
failure. Unchanged browser, VM and signed-chain coverage comes from the earlier
major run. This is separate-run coverage, not a final-tree publication receipt.
The scheduling lock also passed on pinned Linux Node 24.14.0 with networking
disabled. All database and chain fixtures were disposable and isolated.

After deployment, compare Render cgroup peaks during idle, live matches and a
settlement pass, and compare Neon active hours/query activity over comparable
windows. Confirm a real sponsorship, refund and claim still complete, then verify
restart recovery with saved work. Those hosted checks are separate from local
synthetic tests. No live funds were moved by this refactor.
