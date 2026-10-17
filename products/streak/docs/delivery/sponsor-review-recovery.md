# Sponsor review and payment recovery

17 October 2026. Local uncommitted correction; commits and pushes remain paused.

The owner reported a review error, a successful retry through wallet signing, and a payment tracker that appeared to fail. A second review for Everton vs Chelsea also failed. Public read-only inspection established that the Manchester City vs Ipswich transaction actually committed canonically, with 36 confirmations at inspection:

`0x6d95987e6bdf44c22af091e3b8ea75c6e1de6c3a2d0d4df1b5a24c7baba2f448`

The agent did not sign or submit this payment. The exact earlier Chelsea error cannot be reconstructed from the old generic logs.

## Correction

Sponsor preparation, submission, recovery and the lifecycle worker share an exclusive operator journal lock. Previously, an occupied lock failed immediately and its plain error was replaced with a generic message about preserving signatures, even during an unsigned review. The sponsor now waits up to ten seconds to acquire the existing lock. Waiting never steals a lock, deletes stale ownership, retries a completed task or changes signed bytes. The worker retains fail-fast acquisition. A timed-out queue returns a safe 429 response.

Unsigned review failure explains that this review sent no payment. Signed-operation uncertainty tells the user the original transaction may still confirm. Fixed operation/category logs help distinguish contention from other unavailable operations without exposing exception payloads, wallets or witnesses.

The payment tracker keeps checking after a submission attempt whose sponsor response is unavailable. Canonical acknowledgement supersedes old submission errors, and a new unsigned review clears the preceding attempt's transient error. Saved signatures, cross-tab reservations, account guards and explicit same-transaction recovery remain intact. This change does not guarantee that every provider failure resolves automatically or change contract economics.

## Verification

Focused journal and sponsor tests pass with disposable state and synthetic clients. They cover queued acquisition, no overlapping execution, timeout without execution, foreign-lock preservation, busy HTTP response and unsigned-error redaction. The built-app browser journey adds a failed unsigned review followed by a signed request whose response is lost, then background confirmation with exactly one signature and submission. Full gate and local activation results are recorded below when complete.

Independent recovery review found no blocking issues. Its deadline precision concern was addressed by checking elapsed time before retry acquisition. No lock file or saved payment was removed.

All **50 major-gate checks passed at 11:30:23 UTC**. Evidence: `.quality-artifacts/sponsor-fix-major.json` and `.quality-artifacts/sponsor-fix-major.log`. This includes the six full-application checkout profiles, synthetic lost-response recovery, all historical browser lanes, PostgreSQL, Rust VM suites and genuine local-chain settlement/claims. These tests use isolated fixtures, not the owner's wallet or public funds.

Local activation completed after the gate. The old sponsor and API were stopped only while the activation helper owned the journal lease, after checking for unresolved owner signatures. The API is now PID 13976 and sponsor PID 40492. Read-only demand returned `enabled: true`, 210 upcoming fixtures and the Manchester City vs Ipswich market as funded. Everton vs Chelsea had passed its 11:30 UTC kickoff and correctly no longer appeared for new predictions. Both markets' live contract cells were inspected separately before cutoff, with available shards and eligible pending stakes. This does not prove the exact cause of the earlier Chelsea error.

The owned disposable PostgreSQL container is stopped. Local app/operator services remain active. Reload `/season/` once to load the new browser bundle; existing payment recovery retains its stored transaction. No commits, pushes or additional owner-wallet payments were made.
