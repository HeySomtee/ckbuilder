# Wallet compatibility and sign-in recovery

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
