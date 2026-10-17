# Compact slip implementation

17 October 2026. Local uncommitted implementation of the approved port 4187 proposal.

## Interaction and ownership

Picks owns the editable prediction list. Activity owns saved payment receipts, which expand to the existing verified status and recovery controls. The payment controller stays mounted across both tabs and while the slip is closed. Changing a tab never creates or signs a transaction.

The footer shows stakes, the full wallet debit and the primary action. Storage and network details open in a separate cost dialog. Escape closes that dialog and restores focus without closing the slip. Refundable storage is described as claimable after settlement, with the claim network fee disclosed. Contract storage requirements and sponsorship economics are unchanged.

Preparation, wallet verification, wallet approval and saving animate inside the action button. Once the signature is persisted, the slip closes and the existing background tracker continues. A signed payment's frozen picks stay independent of later draft edits. Confirmation retires only unchanged submitted picks. The amount field uses one coral focus ring, including an explicit forced-colour fallback.

## Repeat-payment work

Each sponsor operation now fetches one fresh catalogue for its selected fixtures. All individual provider checks remain fresh and run with at most four concurrent requests. An eight-pick operation uses one catalogue request instead of eight. No catalogue is cached across payment operations.

One market inspection shares the immutable creation-transaction read for cells from the same transaction. The tested five-output creation uses one transaction lookup instead of five. Every cell still receives a fresh live-cell check and a fresh canonical-header check. A later inspection fetches the transaction again and rejects a changed canonical header.

Sponsor logs record fixed operation names, duration in milliseconds and HTTP status, with no wallet addresses, signed bytes or provider payloads. These changes reduce request counts; they do not establish a public-testnet latency target. Wallet response time, RPC latency, sponsorship contention and block confirmation still affect elapsed time.

## Verification and release

Independent source review covered identity and recovery ownership, the nested cost dialog, fixture batching, canonical checks and stage callbacks. No blocking findings remained. The reviewer did not execute tests.

Focused browser checks passed for the compact checkout, reload recovery and eight-pick navigation. The checkout journey verifies nested cost-dialog focus, tab changes while a signed submission is held, exact wallet debit, repeat payment without reconnecting, rejection, uncertain delivery and canonical reorg recovery. It also asserts one tracker across operation identity changes. A stable tracker component replaces the earlier keyed remount, which left hidden portal panels behind.

Read-only screenshots against the actual local API are recorded in `.quality-artifacts/compact-slip-live/results.json`. No wallet was connected and all write requests were blocked. At 320x568 the list measures 243px and the footer 168px; at 390x844 they measure 516px and 158px; at 1440x900 they measure 525px and 154px. These measurements are before wallet review. Exact quoted payment review is covered separately in the synthetic browser journey.

The first major run timed out in the existing Wallet overview/Telegram WebKit profile after three profiles passed. Its evidence is preserved in `.quality-artifacts/slip-workspace-major-first.json`. All four profiles passed in a separate run without a production code change. The complete rerun passed all **51 checks at 14:48:10 UTC**. Evidence: `.quality-artifacts/slip-workspace-major.json` and `.quality-artifacts/slip-workspace-major.log`. Tests use isolated synthetic wallets, local PostgreSQL and local chain fixtures. They do not use the owner's wallet or Neon. No commits or pushes are authorized.

Local activation completed after acquiring the operator lease and confirming no unresolved signed payment. API PID 8728 and sponsor PID 13648 serve the tested build. Read-only checks returned HTTP 200 for the UI, manifest and payment demand, with payments enabled and 199 catalogue fixtures (196 available and 3 funded at that observation). No owner transaction was signed or broadcast. The disposable PostgreSQL container was stopped.
