# In-app game testing, 25 October 2026

26 October correction: [local environment mode and fixture outlooks](games-local-mode-and-outlook.md)
supersedes the original URL-selected/public-switch design. Use
`STREAK_GAMES_DATA_MODE=test` locally, restart the API and reload. Set `api` to
return to regular football data. No user-facing mode switch remains.

The owner requested the actual Five and Survivor screens with dummy football data,
real MetaMask testnet transfers and immediate admin-controlled deadlines. The
separate port-4190 rehearsal remains an automated local-chain tool, not acceptance
evidence for the requested app journey.

## Playing through a round

With the local environment set to test, open `/season/?view=five`. Admin
controls are in More. Survivor uses `/season/?view=survivor`.
The same squad builder, player profiles, sponsorship review, auction and rewards
components are used. Dummy scouting and results are explicitly labelled.

1. The configured Five admin selects **Start new test gameweek**.
2. Players save their five and captain through the ordinary entry flow. Sponsors
   bid and top up using MetaMask and actual testnet tCKB.
3. **Close picks & bids now** records an immutable database timestamp. Both squad
   changes and new signed bid submissions close together.
4. **Apply dummy results** scores the existing entries through the ordinary scoring
   service. **Finalize prizes** verifies funding and uses the existing allocation
   rules. An unsettled auction still blocks allocation.
5. The dedicated test rewards worker refunds losing bids and processes winner
   claims through the existing durable payout journal.
6. Start another test gameweek immediately. Earlier receipts remain available.

On Survivor, use **Create competition** to
publish the dummy slate. Two actual signed-in entrants are required, just as in
ordinary play. Save picks, select **Close picks now**, choose a result scenario,
then **Resolve & open next round**. The real elimination, missed-pick, all-loss
rescue, void and no-repeat-team rules remain in force. A last survivor completes
the competition instead of opening another round. Survivor is still free entry;
its host-announced prize is not an automatic wallet payout.

Set `STREAK_GAMES_DATA_MODE=api`, restart the local API and reload to return to ordinary rounds.
Published API gameweeks keep their official FPL deadlines. Switching views does
not stop the test rewards worker or delete test receipts. Return to test mode to
follow its pending transfers. Do not disable its worker while signed transfers or
unpaid balances remain.

Real chain time is never accelerated. Five still requires 24 canonical
confirmations and retains its 30-minute post-deadline confirmation window. If all
admitted bids have already resolved, auction settlement need not wait the whole
window. No button invents a payment confirmation, entrant or prize balance.

## Isolation and configuration

The existing admin allowlists still apply. Configure the local API and its
separate worker using a new database and dedicated test rewards key:

```dotenv
STREAK_GAMES_TEST_ENABLED=1
STREAK_GAMES_DATA_MODE=test
STREAK_FIVE_NETWORK=testnet
STREAK_GAMES_TEST_DATABASE_URL=<separate PostgreSQL database URL>
STREAK_GAMES_TEST_REWARDS_ADDRESS=ckt1...
STREAK_GAMES_TEST_REWARDS_PRIVATE_KEY=0x...
```

The private key belongs only in the separate worker environment, never the API.
Dummy gameplay is local only. The retained hosted worker support is for recovery
of existing transfers, not public testing controls. For a local process,
run `node products/streak/dist/modules/five/worker.js --games-test` with only the
dedicated test settings. It must not inherit treasury, prediction or ordinary
Five private keys. Fund this new wallet with testnet tCKB for network fees.

The reserved `streak_games_test` schema has no public-schema fallback. Normal
game and reward adapters reject that schema anywhere in their search path. The
test database is durably bound to its rewards address, protecting recovery from
an accidental wallet change. This remains effective when two differently written
URLs happen to reach the same physical database.

Synthetic terms carry a hashed `admin-controlled-v1` marker issued only by the
trusted test adapter. Controls require a signed-in configured admin and a marked
round. Closing changes audited timing metadata, not the original published terms
hash. Ordinary input parsing cannot enable this policy. Existing CSRF and wallet
authentication checks still guard the routes.

The UI captures the server-injected mode once per document and scopes queries.
The API rejects stale document scopes after a server-mode change; a prepared
signature cannot be redirected to another data mode.
The test Survivor catalogue refreshes its future schedule generation on runtime
startup when the stored anchor is over a week old. Stored competitions retain
their original fixtures and deadlines.

## Evidence and remaining acceptance

The isolated controller/PostgreSQL checks exercise immediate Five finalization,
next-gameweek creation, immutable closure, admin denial, normal-round rejection,
late signature admission after closure, schema isolation, wallet binding and
Survivor advancement/elimination. Signature verification is deliberately stubbed
in the database race test; signed-chain suites are separate evidence.

Chromium and WebKit checks use the actual app bundle at 390px and 1440px. They
exercise a saved squad, player history, close/results/finalize controls, switching
to ordinary data and back, and Survivor creation, joining, picks and advancement.
They use synthetic identities and no public funds. Screenshots and results are
under `.quality-artifacts/games-test-browser/`.

Independent money/identity/recovery review accepted the corrected schema and
wallet boundaries. The major run passed 70 of 71 checks; its final standalone
rehearsal was blocked by an old owned process on port 4190. That process was
verified and stopped. All 11 checks in the complete contract lane then passed at
15:19:28 UTC, covering the remaining requirement. All 71 required checks therefore
have successful coverage across those runs; the original full-run receipt remains
failed. Evidence: `.quality-artifacts/games-test-major-first.json`,
`games-test-major.log`, `contracts.json` and `games-test-contracts.log`. A subsequent
CSS contrast correction passed the strict web build and all four new browser
journeys again. No required suite was skipped.

The local API was reloaded as PID 29552. Public read-only checks at 15:15:56 UTC
returned HTTP 200 for ordinary and dummy Five/Survivor, with test sponsorship
available. Ordinary `fpl-2026-8` and `fpl-2026-9` records remain present. The separate
test rewards worker is PID 27556, with launcher PID 12020. Its new database uses
the persistent `streak-survivor-dev-data` Docker volume and a separate database
plus reserved schema. The ordinary rewards worker remains separate.

The new test rewards wallet received a 10,000 tCKB faucet reserve, observed at 45
canonical confirmations. This is operational funding evidence, separate from
gameweek sponsorship or prize collection. Public transaction:
`0x98bcdbe44f34b8b2a5cd47fd82dbf35c8310940b661e1df0024c83de317c8288`.
The public wallet metadata, protected local key, local launcher configuration and
API readiness snapshots stay under ignored `.quality-artifacts/`. No keys were
included in source or given to the API child.

Physical MetaMask test-mode sponsorship, competing bids, automatic refund and prize
collection still need owner acceptance. The current session cannot operate the
owner's extension. No owner signature was performed by this work. No commit, push
or hosted activation was performed.
