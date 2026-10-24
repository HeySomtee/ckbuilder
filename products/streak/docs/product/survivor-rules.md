# Streak Survivor: rules and creation proposal

19 October 2026. The owner approved the interactive design and requested implementation. **Only the configured admin creates competitions, chooses free or fee-gated entry and sets the prize**. The [implementation record](../delivery/survivor-implementation.md) defines the local free-entry rules and verification. It supersedes the unresolved scheduling and correction choices in the original proposal below: all rounds are pinned before publication, results finalize six hours after the round's last kickoff, changed fixtures void, and later impossible slates or missed opening after service recovery produce joint winners. Fee-gated drafts remain unpublished until their separate funding/refund mechanism exists. No actual fee or prize budget has been authorized.

## The game

Pick one team to win each round. Win and advance. Draw or lose and your run ends. Once a valid pick is locked, that team is spent for this competition. The strategy is deciding whether to use a strong team now or save it for a harder round.

Start with Premier League competitions. Each round has an explicit fixture list, one eligible fixture per club, a published common pick deadline before its earliest kickoff, and a result-resolution deadline. These are stored UTC timestamps, displayed in the player's local time. Do not infer rounds solely from Friday-to-Monday dates or current provider matchweek labels.

## Admin and entry

- Admin creates a draft with a name, entry mode, entry fee if applicable, fixed prize, maximum entrants, initial round and complete published rules. The preview edits the name, entry mode, fee, prize and entrant limit; scheduling is a labelled sample, not a functioning schedule editor.
- Free entry and prize are independent. A free competition may have an admin-funded prize. A fee does not automatically become the prize pool. Prize amount and funding status must be separate fields.
- Publishing exposes the joining terms. Once the first entry is accepted, entry fee, prize and rules become immutable. Later round fixtures follow the originally published scheduling policy. Admin must not change deadlines retrospectively or select advantageous fixtures after seeing private picks.
- One entry per account, admitted before the opening lock and within capacity. Account uniqueness is not proof of one human. Existing login is wallet-based; wallet-free identity and anti-abuse require explicit design.
- Free entry is an atomic database admission. Fee-gated entry is admitted only after the intended payment has been verified under the chosen custody model. Retrying or reloading must not charge again or create a duplicate entry. UI role switching in the preview is not authorization.
- The paid review must disclose entry fee, network fee, any recoverable storage, exact wallet debit, prize terms and funding status. Never reuse the current prediction position's 321 CKB storage cost without a Survivor contract design.

## Round lifecycle

1. **Open:** eligible entrants can save and replace a team choice. Only the entrant can read their own pick. Backend clock and stored deadline govern acceptance.
2. **Locked:** freeze picks atomically and reveal them together. A missed pick eliminates the entrant. A saved pick consumes that team, subject to the void rule below.
3. **Awaiting results:** resolve only the exact pinned fixtures using the configured trusted football oracle. Display pending results honestly.
4. **Final:** ordinary wins advance; draws and losses eliminate. Apply the exception rules below exactly once. Store the provider result, rule version and audit event used for progression.
5. **Next round or complete:** publish the next eligible slate, or declare the winner. A winning UI state is distinct from a verified prize payout.

## Exceptions to publish before entry

| Situation                                                    | Proposed treatment                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postponed, cancelled or abandoned fixture                    | Remains pending until the published result-resolution deadline. If unresolved then, void this pick, advance its entrant and restore the team to their reserve.                                                                                 |
| Every remaining entrant loses or draws                       | Rescue those entrants into the next round; their selected teams remain used. Missed picks are never rescued. If someone advanced by a win or void, this exception does not trigger.                                                            |
| Everyone misses the deadline                                 | Cancel rather than invent a winner. Proposed cancellation policy refunds entry fees; network fees may be unrecoverable and must be disclosed.                                                                                                  |
| Fewer than two entrants at opening lock                      | Cancel and return entry fees under the published refund mechanism.                                                                                                                                                                             |
| Only one entrant remains                                     | Declare that entrant the winner once the round is final.                                                                                                                                                                                       |
| No further legal round under the published schedule/end date | Remaining survivors are joint winners. Prize split, smallest-unit rounding and remainder handling must be fixed before paid entry. A schedule builder must not publish a round that silently denies an active entrant a legal pick.            |
| Provider corrects a result                                   | Before finalization, recompute the provisional state. After finalization, use a published correction policy and audit trail. The correction window and dispute authority are still launch decisions. Never silently rewrite completed payouts. |

## Proposed system boundary

Use a `survivor` feature in the existing Node/TypeScript API and React app. PostgreSQL owns competitions, versioned rules, rounds, entrant status, saved picks and resolution events. Uniqueness on competition/account and entrant/round, transaction-level capacity checks and idempotent finalization prevent duplicate entry and double advancement. Backend authorization must enforce admin-only creation, immutable joined terms, pick privacy and deadlines independently of the client.

The existing fixture provider adapter supplies validated IDs, kickoff times and results. A retryable worker records each resolution decision, then publishes standings and opt-in notifications. Defer irreversible notifications until finalization. Round tasks need restart recovery, provider-outage handling and observable failure states.

Current single-match CKB parimutuel scripts do **not** enforce Survivor admission or multiweek prize entitlement. Their operator-sponsored market creation mechanism must not be reused as if it were game escrow. No existing pool principal or sponsor reserves may fund these prizes implicitly.

Before live fee-gated entry, settle currency/network, custody, prize prefunding, fee destination, cancellation refunds, abandoned-competition recovery, payout authorization, split/rounding, deadlines, corrections and independent contract review. The preview uses whole **testnet CKB** amounts only as examples. No mainnet funds, wallet request or on-chain guarantee is implied.

## Acceptance for the first implementation

After preview approval, build the admin creation and complete free-entry lifecycle with persistent data, provider-backed rounds, hidden picks, enforced cutoffs, used-team restrictions, deterministic exceptions, standings and history. Keep fee-gated publication disabled until its funding and recovery design is approved and implemented. Expose the admin's fee/prize controls without presenting an unfunded promise as a claimable balance.

Test unauthorized creation, concurrent last-place joins, repeated paid callbacks, deadline boundaries, private-pick exposure, result replay/correction, void team restoration, all-loss rescue, missing picks and restart recovery. This is a future implementation checklist, not evidence those tests or services exist today.
