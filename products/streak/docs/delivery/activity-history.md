# My Activity and fixture status correction

19 October 2026. Owner approved the [interactive proposal](../../design/activity-review/README.md), production implementation, commit and push. This release covers Activity and the misleading finished-match labels. Survivor planning remains separate.

## User journey

My Activity separates Open bets from History, with match search, state filters and compact rows. A detail drawer follows payment confirmation, entry acceptance, settlement and collection. It closes immediately without discarding a signed claim. My Account continues to own wallet and Telegram settings.

The summary shows checked open positions, collectible returns and completed collections. History distinguishes Won, Lost and Refund from collection status. Losing predictions expose Collect storage. A return is split into prediction return and refundable cell storage once, with the actual network fee shown at claim review. Net wallet increase subtracts that fee. Saved payments and recovery remain in their own expandable section.

## Sources and safeguards

- Existing direct-chain discovery verifies positions, historical claims and canonical transactions. Verified reserve outcomes distinguish wins, losses and no-winner refunds. Football scores are display context, never payout authority.
- Catalogue and saved journal descriptors support discovery. Eight markets are checked initially with three concurrent readers; users can request more. Each market retains the existing 96-record discovery bound. Missing registry history is explicitly disclosed rather than described as a complete cross-device portfolio.
- Queries use wallet-scoped keys and cancellation. Failed refreshes retain the last verified snapshot, label it stale and pause collection. Initial failures show Checking rather than a zero balance. Missing or bounded history remains visible.
- Claim review, signing, persistence, broadcast and conflict recovery use the existing client and journal. A saved unresolved claim blocks duplicate signing. Closing or changing a drawer invalidates an unfinished preparation; wallet revisions invalidate its result. No contract economics or custody rules change.
- Automatic late-entry refunds have a separate timeline milestone. They do not imply that the market has settled. Confirmed payment alone is not accepted entry; collected funds require canonical claim/refund evidence.

## Finished matches

The previous cards displayed the legacy ledger's `void` status. An empty legacy pool is voided by that engine even when the football fixture finishes normally; direct predictions do not populate that ledger. Read-only diagnosis found 44 final fixtures with zero legacy bets, all labelled void by the old field.

Cards and match pages now use fixture lifecycle and available scores. Fresh direct pool observations expose settlement phase separately. Missing, stale or unmapped contract state says Settlement not verified. Results filtering uses completed/cancelled fixtures, not the legacy ledger result. Closed matches no longer invite a first prediction. Legacy settlement behavior is unchanged.

## Validation and release boundary

Focused TypeScript build and frontend lint passed. Sixteen direct-client/activity tests passed, including settlement outcome classification, unknown state, storage accounting, saved-claim duplicate guards and existing reorg recovery. Pool projection and fixture-filter tests passed. Four built-app Chromium/WebKit journeys at 390 and 1440 pixels exercised the new Activity route, pending admission, claim review, close during processing, conflicting-spend recovery, collection, search and drawer dismissal. Screenshots in `.quality-artifacts/browser/activity-*` were visually inspected; a crest margin inherited from market cards was corrected afterward.

Independent recovery review identified and resolved delayed-review row confusion, initial read failures appearing empty, automatic refunds implying settlement, and stale wallet review/notice state. Exact-candidate full gates are required before publication. These are isolated synthetic chain/browser tests, not proof of a new hosted payment or a production settlement. Hosted Actions remain paused by owner instruction.

The updated shared-wallet and sponsored-payment browser journeys retain connection and original-byte recovery assertions through the new recovery disclosure and claim drawer. Activity fault injection verifies that initial chain failure shows Checking and a failed refresh retains the previous row. The atomic devnet runner now waits for RPC readiness from its own Node process, since WSL can respond before Windows localhost forwarding is ready. This read-only startup probe precedes deployment; the existing fresh-chain assertion and all signed-transaction checks remain required.
