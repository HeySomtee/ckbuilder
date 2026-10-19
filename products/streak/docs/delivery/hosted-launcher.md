# Hosted payment launcher

19 October 2026. Implementation complete locally, not yet published or activated on Render.

The hosted API was serving the new UI and contract pins but had no atomic registry setting or supervised operator. The owner configured the service and 1 GB disk through the setup checklist. The new start command is:

```text
node products/streak/scripts/direct-host.cjs
```

Use this only after the tested implementation is present in the deployed revision. The build command remains `npm ci --include=dev && npm --prefix products/streak run build`.

## Process and storage behavior

The launcher requires Linux, production configuration, the real football provider, all required credentials and distinct local ports. Its default persistent mount is `/var/data/streak`; a different mount requires `STREAK_HOST_STATE_DIR`. It checks Linux mount metadata, refuses symlink/overlapping paths and verifies writable/fsync-capable directories. It refuses preexisting operator, worker and publication leases without deleting them. It never reads `.env` or a wallet key file. Mount presence and fsync are preflight checks, not proof that backups have been tested.

The API, sponsor and worker receive explicit environment allowlists. The API retains the existing legacy treasury and Neon settings, but receives no direct operator key or private journal path. Sponsor/worker receive the direct key and provider credential, without database, treasury or Telegram credentials. All children disable `.env` loading and omit inherited Node options and unknown credentials. This is process-configuration isolation inside one service, not separate OS users or a hardware key boundary. If the legacy treasury uses the same underlying key, environment naming alone does not create distinct wallet identities.

The sponsor catalogue URL is derived from the API's `PORT`; any supplied conflicting URL is rejected. Worker catalogue/progress variables remain unset. Bulk provisioning configuration is rejected. This preserves first-bettor sponsorship. The API and operator share the configured public registries, while private journal records remain outside those registries and the public web root.

A loopback supervisor port, default 4102, prevents two launchers in one network namespace. API and sponsor ports must be unused before startup. The launcher starts the API, waits up to two minutes for pinned testnet configuration, then starts the authenticated sponsor and waits for its atomic configuration. The real football catalogue can still be warming up or unavailable after process readiness; `/api/direct/batch/demand` remains the user-facing eligibility gate.

The worker runs one pass immediately after readiness and then 60 seconds after each completed pass. It never overlaps itself. A failed pass is logged and retried on that cadence; a five-minute hang shuts the service down. API or sponsor exit stops the whole service with a failure status so hosting can restart the complete process group instead of leaving an apparently working website without its signer.

SIGTERM/SIGINT stops future worker passes and signals the children. The sponsor stops accepting requests and waits for in-flight requests and its active recovery pass. The worker stops before starting further operations and finishes its active operation to release journal leases normally. Its cursor preserves the interrupted market. After 25 seconds the supervisor force-stops remaining children and exits unsuccessfully. Forced termination can leave journal locks requiring explicit ownership checks and reconciliation. No startup or shutdown path deletes a stale lock, signed transaction or prior recovery record.

## Handover and release

The owner accepts a fresh hosted test pilot without importing old test activity. That does not authorize concurrent signers against different journals for the same wallet. Before activation, stop the local sponsor and worker, reconcile unresolved signed transactions, and archive rather than delete local test records. This implementation does not perform that live handover or import/delete any records. Retained old positions may require their archived descriptors for claims.

`render.yaml` describes one Starter service with a 1 GB mounted disk and the supervisor start command. Actual Render account settings and deployment are separate facts. Runtime directory acknowledgement remains an explicit secret-setting entry rather than being silently enabled by the blueprint.

## Verification

All 52 major-gate checks passed at 08:54:42 UTC on 19 October, including browser journeys, disposable PostgreSQL, contract validation and signed local-chain settlement/recovery. Evidence: `.quality-artifacts/hosted-launcher-major.json`. Independent recovery review has no remaining blockers. The owned disposable database was stopped after validation. These checks used synthetic credentials and local chains, not the hosted operator.

Focused tests use temporary directories, synthetic credentials and real local child processes. They cover environment isolation, invalid/off-mount configuration, symlink rejection, file preservation, startup ordering/readiness, worker serialization, transient worker failure, child crashes, timeout, child cleanup and graceful sponsor request/recovery draining. They never contact Neon, API-Football or public CKB RPC. The full major gate and independent review are tracked in the work tracker.

Hosted acceptance still requires actual disk persistence, operator handover, enabled real-fixture demand and separately authorized payment/recovery/settlement/claim evidence. Telegram account linking and direct payment notifications remain distinct; this launcher does not add the unfinished v4 notifications, clear the MetaMask classification or launch Survivor/Five.

Independent source review found and closed a key-format mismatch, shutdown/lease readiness gap and a concurrent-sponsor lock false positive. Ten isolated launcher tests passed in a network-disabled Linux Node 24.14.0 container with the repository mounted read-only, including actual SIGTERM draining and forced termination. The same tests are discovered by the regular Node regression lane. No hosted readiness or payment claim follows from that local evidence.
