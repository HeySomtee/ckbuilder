# Wallet compatibility and automatic market provisioning

Updated 16 October 2026. The owner found that sign-in did not carry into Wallet, MetaMask was rejected by a 20-byte contract limit, and only one manually funded match could accept a prediction.

## Changes

Sign-in, Wallet and checkout now retain the same explicitly selected signer in memory. Account changes, provider disconnects and successful logout invalidate private state and unsent reviews. A failed logout retains the connection. Reload preserves signed recovery records but requires an explicit wallet reconnection. Browser authentication and a connected wallet remain separate concepts.

The new product Rust contract increases the authorized input lock-argument limit to 59 bytes. MetaMask's CCC adapter uses a 22-byte OmniLock. The 59-byte ceiling preserves the fixed 100 CKB fee and keeper outputs. There is no change to principal minimums, recoverable storage, fees, payouts, shard capacity or result timing. The guard is unchanged. Historical Week 20 files and v1 code cells are retained.

The v2 protocol is deployed at [transaction fb3a8cdb](https://pudge.explorer.nervos.org/transaction/0xfb3a8cdb8b79f84785c5847ba53181021bd4f4f2556bf33b0f6883741b50f2fe), output 0. The observed transaction was canonical with seven confirmations before activation. Its 30,016-byte binary hashes to `0xc65bfcf86e34da4bb8f51f93e261236418a639699b5fd7f3dfafb5f987e047e0`. It reuses the unchanged guard at output 1 of the earlier deployment. See the pinned [build manifest](../../contracts/direct-v2/build-manifest.json).

Both contract generations remain supported for recovery. Old journal scopes, signed bytes and transaction hashes are unchanged. The descriptor's pinned code hash selects its dependencies and wallet limit. Legacy catalogue entries are closed to new deposits, including if an operator accidentally places them in the current registry directory.

The worker queues every future scheduled fixture supplied by the real football provider, revalidates the exact fixture upstream before signing, and creates markets serially. A market is published only after four canonical confirmations. Unknown transactions retain their exact bytes and block new spending. The queue exposes preparing, confirming, insufficient funding and operator-review states. The slip shows these beside each pick and no longer advertises a different match.

The current registry supports 256 markets and the durable queue 4,096 entries. Overflow remains visible and is never silently dropped. Each market needs 3,050 testnet CKB in reserves, plus transaction fees and valid wallet change. The 196 future fixtures observed locally require 597,800 testnet CKB in market reserves. The first received top-up was 100,000 CKB. Automatic setup can proceed for the funded portion and resume when more capacity arrives.

## Verification and boundaries

- The new Rust workspace passed 11 VM groups containing 88 labelled checks, including 22-byte and 59-byte owners/admins, rejection at 60 bytes, exact claims/refunds and wrong-owner rejection.
- The product local devnet passed 38 checks, retaining 25 native lifecycle/recovery checks and adding genuine OmniLock execution. Four EVM personal signatures covered deposits, a 615 CKB winning claim and a 421 CKB timeout refund. A corrupted signature was rejected by consensus.
- Four shared-wallet browser journeys passed in Chromium/WebKit at 390/1440px, including verified synthetic Ethereum sign-in, retained balance, navigation, account mismatch, disconnects, rejection, stale signatures and logout recovery.
- Deployment is a separate public testnet operation using the operator wallet. Routine tests use disposable databases, synthetic fixture data and local nodes. No physical MetaMask extension session is claimed from the synthetic browser tests.

Independent review checked the Rust diff, compiled hashes, generation-specific dependencies, unchanged recovery scope, wallet invalidation, shared operator lease and all-fixture validation. The independent-funding-branch reorganisation finding is fixed and re-reviewed: the barrier follows actual signed input references, checks every independent funding leaf and checks unconfirmed jobs. Regression cases cover an orphaned older branch, a merging child and an orphan beyond the first read batch. Ambiguous current/legacy public-verification journals fail closed.

All 38 local gate steps passed at 13:54 UTC on 16 October, including disposable PostgreSQL, browser journeys, Rust VM tests and signed devnet lifecycle checks. Evidence is retained in `.quality-artifacts/wallet-provision-full-gate.json` and its log. Final reconnect wording and the public-verification resume selector were reviewed after that run; the mandatory commit and push hooks rerun the complete gate for the final candidate.

The actual local API-backed UI also passed read-only Chromium checks at 390px and 1440px, preserving an exact 125.00000001 CKB pick through checkout. Screenshots and results are in `.quality-artifacts/wallet-provision-local.json` and `.quality-artifacts/browser/wallet-provision-*.png`. These checks did not sign or move funds.

At 13:57 UTC, the recurring local worker had published 11 compatible markets, with one confirming and 184 queued. Its first confirmed creation is [transaction 1ce60389](https://pudge.explorer.nervos.org/transaction/0x1ce60389d0bc126ae8af8fe05900bafccf2274263d7a9231092904ade91868ed). Current funding covers about 31 markets after deployment; roughly 501,000 additional testnet CKB plus fees is needed for all 196. The worker pauses when funding is insufficient and resumes after a top-up. This is a dated snapshot, not a fixed availability count.

Local app and operator processes must remain running. No hosted service, community launch or complete funding of all fixtures is claimed. Combined multi-market payment and Five remain open commitments.
