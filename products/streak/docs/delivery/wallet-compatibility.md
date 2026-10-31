# Wallet compatibility and sign-in recovery

## 30 October: disconnect and account switching

The owner confirmed Zerion Android sign-in works after updating the wallet app,
then reported that signing out and choosing another account reused the old one.
The Season header now uses Disconnect, and My Account uses the same operation.
It clears the signer, remembered selection and private query caches, closes the
server session and asks the selected injected provider to revoke `eth_accounts`
permission. Other signers receive their native disconnect call. Signed payment
recovery records are retained under their original owner.

Explicit reconnect requests account selection where the wallet supports it.
Cancellation does not continue with the previous account. Silent restoration
never requests permission. Unsupported revocation is explained as a local app
disconnect, not a claim that wallet permission was removed. Native adapters may
implement disconnect as a no-op; Streak cannot force every wallet's account picker.

Server logout failure keeps the previous session suppressed across reloads and
requires a successful logout retry before new sign-in. Auth operations serialize
before changing caches. A provider that leaves revocation pending gets a bounded
five-second UI wait and a page-reopen recovery message; reconnection remains
blocked until that request settles, preventing late revocation of a new session.

Independent identity review accepted the implementation after correcting the
cache-clearing race. Disconnect also removes CCC's remembered connection, so a
new chooser cannot silently restore the old provider. Mobile account controls
wrap within the header at 320px.

All 76 `npm run quality:major` checks passed on 30 October, from 13:20:08 to
13:59:26 UTC. Evidence: `.quality-artifacts/oct30-disconnect-major-final.json`
and `oct30-disconnect-major.log`. Coverage includes four expanded wallet-switch
journeys, My Account, logout failure/reload suppression, rejected/unsupported
permissions, stalled revocation, six checkout journeys, isolated PostgreSQL and
signed local-chain recovery. All test identities and funds are synthetic.

Earlier failed runs are retained. A 320px header overflow was corrected. The
motion test now observes beyond the animation's 816ms stationary phase; movement
assertions and production animation are unchanged. A transient launcher test
passed on isolated retry and in the final full run. A disk-full build was resolved
by removing old disposable chain databases while retaining reports and recent
runs. Formatting failures were corrected before the final pass.

Implementation remains local and uncommitted. Publication is the next step.
Physical switching on MetaMask, Zerion Android and native CKB wallets remains a
separate acceptance step. No Render configuration or database migration is needed.

## 30 October: mobile sign-in recovery

The owner reported a connected address and balance inside Zerion's mobile
browser, followed by sign-in returning to its button without a signature prompt.
The header showed "No connected wallet"; the slip showed no explanation. This
does not establish a Render configuration failure or a confirmed provider cause.

The local candidate renews EVM account access during explicit sign-in, then
checks that the selected account has not changed before preparing a challenge.
Silent restoration still performs no permission request or signature. Chooser
cleanup removes listeners without disconnecting the selected provider.

Successful challenge verification must now be followed by an authenticated
account read matching that wallet. Only then does the application update its
session cache. A missing session, blank error, plain provider rejection or
"No connected wallet" produces a visible message inside checkout. Picks remain
saved and the header shows the actual sign-in stage.

Four isolated Chromium/WebKit wallet journeys pass, including cached address
with expired signing access, permission rejection, account replacement during
permission renewal, navigation, reload and native CKB restoration. All six
checkout journeys pass blank nonce/provider failures, the reported error text,
verification failure, a missing session, explicit retry and separate payment.
The 390px error screenshot was inspected: the message and retry action remain
visible inside the slip. Independent identity review accepted the final injected
EVM guard and permission-boundary tests with no blocking findings.

The final `npm run quality:major` passed all 76 checks from 10:21:16 to 11:01:09
UTC on 30 October. Evidence: `.quality-artifacts/oct30-mobile-auth-major-final.json`
and its matching log. Earlier focused failures exposed stale test selectors for
the slip name and shared progress label; both were corrected. The earlier broad
run was interrupted to narrow renewal to injected EVM providers, preserving
JoyID's existing popup behavior. Those logs remain; no failed gate was bypassed.
All providers, accounts and funds in these tests are synthetic. Physical Zerion
acceptance, publication and deployment remain pending. No new Render setting
or migration is required by this frontend change.

## Earlier compatibility work

27 October 2026. Local implementation, not a hosted acceptance claim.

Neon reported repeated sign-in, a visible wallet address next to a sign-in button,
HTTP 400 from `auth/verify`, and an unchanged payment slip after signing. The
chooser offered JoyID but the server rejected its proof before authentication.
The screenshot's address prefix matches the pinned testnet JoyID script, making
this the strongest explanation available without asking the supervisor to debug.
Origin rejection normally returns 403. Seven-day server sessions use durable
PostgreSQL storage; no evidence currently identifies Render as the cause.

## Changed behavior

- The slip distinguishes wallet connection, free sign-in and payment approval.
  Animated button stages show preparing, approving and verifying sign-in.
  Authentication failures appear inside the open slip, with picks retained.
  A successful sign-in leaves the separate payment review for the user.
- MetaMask and Zerion use the existing EIP-6963/EVM adapter. Background discovery
  now allows one second for delayed announcements rather than 250 milliseconds.
  Only the remembered wallet and exact account may restore; restoration never
  requests account access, signs or switches networks.
- UTXO Global CKB restores through read-only connection, network and account APIs.
  REI remains an explicit connection because its pinned SDK's connection check
  calls `ckb_requestAccounts`. Sign-out/disconnect removes restoration hints.
- Original JoyID P-256 passkeys authenticate with a strict signature schema and
  a deterministic binding to the complete pinned testnet lock. Challenge, key
  and key-type overrides are rejected. Identity JSON/key hex are canonicalized.
  Subkeys, session keys and RSA credentials remain unsupported and receive an
  explanation before signing. No remote credential service becomes an authority.
- JoyID restoration reads its public saved connection metadata. This is not an
  authentication proof; protected actions still require verified account identity.
- Sponsored prediction payments still accept native CKB secp256k1 and EVM locks.
  JoyID passkey-lock payments need a separately reviewed witness implementation.
  Unsupported payment formats now receive an explanation before review rather
  than failing after a request to the operator. Recovery records are unchanged.

## Evidence and remaining checks

The identity suite uses ephemeral WebAuthn P-256 keys and actual HTTP handlers to
exercise accepted proofs, exact address binding, challenge changes, replay,
canonical identity, wrong network and rejected override/delegated-key proofs.
Wallet browser journeys exercise the real pinned CCC adapters with synthetic
MetaMask/Zerion-style providers and UTXO Global, including delayed discovery,
navigation/reload, account changes, logout and no automatic signature/access prompt.
Checkout exercises a visible failed login and explicit retry before its existing
signed-payment, minimized progress and interrupted-response recovery journeys.

Focused identity, four wallet browser journeys and six full checkout journeys
passed. Independent identity/recovery review accepted with no blocking findings.
The full `npm run quality:major` run passed all 71 checks from 11:24:15 to
11:47:28 UTC on 27 October, including PostgreSQL and signed local-chain recovery.
Evidence is retained in `.quality-artifacts/wallet-compatibility-major.json` and
`wallet-compatibility-major.log`. A subsequent presentation-only change reuses the
existing compact helper-text class; `npm run quality:static` passed after correcting
its formatting. The original failed formatting receipt is retained as
`wallet-compatibility-format-followup-failed.json`; final output is in
`wallet-compatibility-static-final.log`. No gate or assertion was bypassed.

All test identities, provider responses and funds are synthetic. Physical
extensions, Neon's exact wallet and hosted payment acceptance remain unverified.
No production secrets, database or public-chain funds are used by these tests.
The disposable PostgreSQL container was removed after verification. No new
Render environment variable or database migration is required; publication and
deployment of the server changes remain pending. Existing local application
processes and workers were not restarted. No commit or push was performed.
