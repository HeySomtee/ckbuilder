# Five local rewards activation, 23 October 2026

24 October recheck: restored the stopped local services using the same database
and wallet. The 10,000 tCKB reserve remained intact with 15,377 confirmations.
No sponsorships, credits, payouts or collection requests existed. Automatic
progression opened Gameweek 9 with its official 31 October 11:00 UTC deadline.
The API reports sponsorship available and a 100 tCKB minimum. Owner wallet
submission is still required for live contribution acceptance; the previous
Gameweek 8 sponsorship deadline has passed.

The owner approved activating the existing dedicated testnet rewards workflow.
This is local operational setup, not a hosted release or a funded prize promise.
No product runtime or payout rules were changed.

## Local setup

Docker Desktop and the existing `streak-survivor-dev` database were restored.
Before assigning a wallet, the rewards runtime, credits, claim requests and
payout tables were absent. The only Five round, `fpl-2026-8`, had zero entries
and zero sponsorships. No earlier Five liabilities or signatures were replaced.

A new native CKB testnet wallet was generated locally. Its key is ignored by
Git and readable only by the owner's Windows account and SYSTEM. It is not
loaded by the API, browser or tests. The rewards child receives an explicit
environment allowlist and checks its address against its key. The database
is pinned to `127.0.0.1:55433/streak_survivor_dev`.

Public rewards address:

```text
ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqfnx932sm5rqfcgg86ly78uy3q0jashrfsk0hrqm
```

The official Nervos faucet supplied **10,000 tCKB**, verified in an ordinary
live cell after **26 canonical confirmations**. Transaction:

```text
0x8977201b9f1e3bd4be033d10f84b8b4862442d1b47773639727e19ff720603b1
```

This funds the dedicated wallet's operating reserve. It does not count as a
gameweek sponsorship or increase the advertised prize pool. Sponsor deposits
need their own authenticated intent, signature and confirmed attribution.
The rewards wallet cannot sponsor itself. No prediction-operator funds moved.

## Running and recovery

The ignored local launchers are `.quality-artifacts/local-season-sponsored.cjs`
and `.quality-artifacts/local-five-rewards.cjs`. The public wallet configuration
is `.quality-artifacts/five-local-wallet.public.json`; the private key stays
inside `.quality-artifacts/five-local-private/`. Run the worker as the owner's
Windows account. Do not copy that key into the web API environment.

On this activation, API PID was 16972 and rewards worker PID was 20692, with
launcher PID 26444. These are dated evidence, not durable process identifiers.
Verify current process identity before stopping or restarting anything. The
database and wallet files must survive restarts. Do not delete signed payouts
or reservation rows to force a retry. No reboot/autostart service was installed.

The initial private-directory ACL belonged to the sandbox account, preventing
the owner-run worker from reading the key. The ACL was corrected to owner plus
SYSTEM and checked without printing the secret. Worker startup then succeeded.

`GET /api/five` returned `fundingAvailable: true`; Gameweek 8 remained open.
The heartbeat proves worker/database liveness only. The independent public
balance check established funding at activation, not perpetual solvency.

## Verification

- Public testnet: faucet deposit and 26 canonical confirmations verified using
  read-only RPC. Evidence: `.quality-artifacts/five-activation-funding.json`.
- Local app: Chromium at 1440px and 390px showed an enabled Sponsor this gameweek
  button, no page errors and no horizontal overflow. Screenshots:
  `.quality-artifacts/five-activation-{1440,390}.png`.
- Synthetic: existing Five domain/service/identity/replay/payout tests passed.
- Synthetic PostgreSQL: disposable database admission races, rollback,
  idempotency, database-clock cutoff and automatic JSONB deduplication passed.
- Synthetic CKB: existing signed contribution validation, duplicate inputs,
  durable retry/restart, exact payout, 24-confirmation checks, conflicting-spend
  recovery and late-confirmation cancellation refund passed. Evidence:
  `.quality-artifacts/five-activation-devnet.log`. The owned CKB node stopped.
- Independent read-only review accepted local address/key isolation and
  operational setup, subject to confirmed reserve and empty-state preflight.

No real key, football credential or existing app database entered those tests.
No full major gate was rerun: this increment changes local operational
configuration and documentation, not product runtime. Earlier release-gate
limitations remain recorded in the work tracker.

## Remaining acceptance

On 24 October the owner reported successful wallet submission of 100 tCKB to
Gameweek 9. The existing worker recorded it as confirmed and the public pool
showed exactly 100 tCKB. Transaction:
`0x1fc68a65de602226d401af5ffddb878ea0d0ad1b35f19138c3fe51e7deaa9dd5`.
The physical wallet interaction was owner-reported; the saved payment and pool
were independently checked. No real participant or contribution was fabricated.
Winner collection needs a legitimately finalized gameweek;
the current EPL round was not cancelled or given synthetic scores for testing.
Actual live claims/refunds and additional physical MetaMask recovery checks remain separate
from the passing disposable-chain checks. Render, Git commits and pushes were
not changed.
