# Survivor outcomes and early winners

1 November 2026. New competitions use `survivor-free-v2`; existing v1 competitions
keep their published result deadline. The rule version is part of the terms hash
players accept and is reflected in the in-app rules.

## The rule players need to know

Pick one team to win before each round's deadline. A win advances you; a draw or
loss normally eliminates you. You cannot reuse a team. If **every player who made
a pick loses or draws**, those players all survive that round, but their chosen
teams remain used. Anyone who missed the deadline stays out.

New competitions finish as soon as there is a definite sole survivor, even if
unrelated fixtures or later scheduled gameweeks remain. This happens on the next
normal progression tick, not at zero latency. Prize processing follows separately.

## What happens in each case

| Situation                                                                                                   | Outcome                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| At least two people joined, but only one saved a pick                                                       | In v2, that picker wins when the deadline locks. Their team does not need to play or win. The UI does not invent a match result.    |
| Several players picked; exactly one advances and every selected match is resolved or explicitly void        | In v2, finish immediately. Unpicked fixtures do not hold up the competition.                                                        |
| Someone's selected match has no confirmed result yet                                                        | Keep the round provisional. A current leader is not automatically a winner.                                                         |
| All actual picks lose or draw                                                                               | Wait until the published resolution deadline, then rescue those pickers. Their teams stay used; missed picks stay eliminated.       |
| All actual picks lose in the last scheduled round                                                           | The rescued pickers are joint winners. They share any funded prize equally.                                                         |
| Some picks win or void, while others lose                                                                   | Winners and voided picks advance. Losing and drawing picks are out; the all-loss rescue does not apply.                             |
| Multiple players survive                                                                                    | Finalize at the published deadline, then open the next round. If the schedule is over, they are joint winners.                      |
| No entrants or only one entrant joined                                                                      | Cancel at the opening deadline. A creator-funded prize returns to the creator through the refund process.                           |
| Everyone misses the pick deadline                                                                           | Cancel. Nobody wins; a funded prize returns to the creator.                                                                         |
| A fixture is explicitly postponed, cancelled, suspended, changes teams or changes kickoff after publication | Its picks void and the selected teams become available again. Published deadlines do not move.                                      |
| Results are missing or unconfirmed at the resolution deadline                                               | Those picks void. Missing data never fabricates a loss or a winning score.                                                          |
| Every pick voids                                                                                            | Everyone who actually picked advances, and those teams are restored. At the end of the schedule they are joint winners.             |
| The opening slate offers an entrant no legal team                                                           | Cancel. For a later slate, remaining survivors become joint winners.                                                                |
| Used teams leave a survivor no legal next pick                                                              | End with joint winners rather than forcing an impossible pick. Selecting 30 rounds does not create more than 20 distinct EPL teams. |
| Service recovery reaches the next round after its deadline                                                  | End with joint winners, rather than eliminating players for a round that never opened.                                              |
| Results change before the competition or round becomes final                                                | Apply the newer eligible observation, including withdrawal of a previously reported result.                                         |
| Results change after finalization                                                                           | Preserve the final snapshot, winner allocation and payout records. No automatic reversal or second payment.                         |
| The service restarts or receives the same event twice                                                       | Resume from saved state. Finalization and prize credits are idempotent.                                                             |

The normal resolution deadline is six hours after the pinned round's last kickoff.
V2's early-winner rule shortens that correction window only when the competition
is decided. All-loss rescue and multiple-survivor progression still wait for the
normal deadline. V1 always retains its original finalization window, including
when missed picks leave one player.

## Scheduling and prizes

The creator can type a round count up to the available remaining **complete,
non-overlapping EPL gameweeks**, capped at 38. The server validates the actual
schedule. Missing, incomplete or unsupported slates are not invented. New rounds
use the official FPL pick deadline, normally 90 minutes before the first match.

A positive new prize must be funded and canonically confirmed before entries
open. Funds use the disclosed custodial testnet rewards wallet, not a Survivor
escrow contract. Zero-prize competitions remain playable. Earlier announced
prizes are not treated as funded balances.

A sole winner receives the whole prize allocation. Joint winners receive equal
integer-shannon shares; a smallest-unit remainder returns to the creator.
Cancellation before entrants join and expired funded drafts use the same refund
journal. A creator cannot cancel or edit joined terms to reclaim the prize.

Winning is separate from payment confirmation. Funding is rechecked before
credits are created; reorgs or unavailable backing pause delivery. Stable credit
IDs, shared input reservations and saved signed transactions protect retries and
restarts. Amounts below a wallet cell's minimum remain credited for later payment,
not silently discarded. The rewards worker must be configured and running.

## Implementation and evidence

- `src/modules/survivor/domain.ts` computes the complete pick outcome snapshot
  before eliminating anyone. It never treats an unresolved fixture as void early.
  Explicit voids outrank stale results. Confirmation timestamps, score integers
  and score/outcome consistency are validated before use.
- `src/modules/survivor/service.ts` rejects a contradictory live/finished result.
  Existing database row locks serialize picks, deadlines and finalization.
- `src/survivor-early.test.ts` covers early winners, legacy rules, missing picks,
  partial outcomes, rescue, voids, corrections, restart/replay and exhausted or
  late schedules. Existing Survivor tests retain privacy, permissions and funding
  verification coverage.
- `scripts/survivor-postgres.cjs` verifies persisted early outcomes through prize
  allocation and concurrent credit replay, including ties, remainders and refunds.
- `scripts/survivor-browser.cjs` verifies the rules, 30-round selection, completion
  copy and reload in Chromium/WebKit at 320, 390 and 1440px.

Focused unit and all six browser journeys passed. Independent rule and money
review found no remaining blocker after correcting void history and rejecting
live results. The full release gate and publication are recorded in
[status](../../status.md). These are isolated tests; hosted payout acceptance
remains separate.
