# Hosted worker recovery and readiness

6 November 2026. Local implementation and synthetic evidence; not a hosted
deployment or live payment acceptance record.

## Scheduling lock

On Linux, a settlement pass opens a private
`operator-private/worker-lease/scheduler.flock` file. The `flock` utility locks the
same open file description inherited as descriptor 3. Node retains its descriptor
through the whole pass and closes it in `finally`. Linux also closes it when the
worker dies, including `SIGKILL`, so a stopped worker cannot leave a scheduling
lease that prevents every later restart. The file itself remains and is never
deleted during ordinary operation.

Only the scheduling lease changes. Signed transaction journals, financial
`operator.lock`, registry publication locks, funding barriers and reserved inputs
retain their independent validation and reconciliation. A crash during a financial
mutation can still require operator review. An absent scheduling lease is not proof
that a transaction finished or may be signed again.

Deployment requires Linux `flock` at `/usr/bin/flock` or `/bin/flock` and the existing
single-instance durable disk. Startup fails closed if the utility is missing. An
old `worker-lease/operator.lock` is never automatically removed, even when its PID
appears dead; confirm the old deployment is stopped and preserve/archive only that
verified legacy scheduling lock before migrating. Do not mix old and new worker
binaries against one state directory. Windows and other local platforms retain the
existing conservative file-lock behavior and explicit stale-lock recovery.

## Rewards readiness and wake

The supervisor's existing loopback control port becomes a private HTTP endpoint.
It creates a new random token per startup and passes it only to its API and rewards
children. No new Render secret is required. Payment sponsor and settlement children
do not receive the token.

The API authenticates to `GET /workers/rewards/health`, or the separate `testRewards`
scope. The supervisor asks the current child over its private Node IPC channel and
waits at most three seconds. The worker checks its initialized, non-stopping state
and required dependencies. A running PID alone cannot make readiness true. Responses
contain only `{ "ready": true }` or `{ "ready": false }`; no addresses, keys, signed
bytes or database details are returned.

`POST /workers/rewards/wake` and its `testRewards` counterpart interrupt the worker's
sleep after work has been saved. These notifications improve latency and are not
durable jobs. Missing notifications or worker restarts must still recover from
persisted state and the bounded fallback scan. Authentication and dependency
checks happen on demand; the health service does not write an idle database
heartbeat. Calls fail closed when configured IPC is missing or unresponsive.

## Measurements and checks

The supervisor reads Linux cgroup memory current, peak and limit values at startup
and every five minutes. These small log records do not query PostgreSQL. Missing
or unlimited cgroup accounting is tolerated. This reports real container usage
rather than summing process RSS, which can double-count shared memory.

Synthetic checks cover real child-process exclusion, normal and failed-task lock
release, kernel release after a forced worker death, legacy lock refusal, lock
path validation, authenticated health/wake, worker dependency failure, separate
regular/test scopes, child exit and normal supervisor shutdown. They use temporary
local files and processes with isolated environments, without wallets, provider
credentials or live databases.

6 November checks passed on Windows Node 24.14.0 and on Linux in the cached
`node:24.14.0-bookworm-slim` image. The pinned Linux run covered real competing
workers, normal and failed-task release, kernel release after `SIGKILL`, legacy
lock refusal, hardlink rejection and symlink protection. The container used
`--pull never`, disabled networking, a read-only repository mount and disposable
temporary state. No dependencies were downloaded and no live configuration was
supplied. An earlier WSL Node 22.22.2 run is additional portability evidence;
the later pinned Linux run supersedes that runtime limitation. Full combined
application checks and hosted idle/live/settlement memory observations remain
separate acceptance work.

The combined 91-stage major gate passed on 6 November at 08:41:26 UTC before a
later rewards-schema startup serialization fix. That follow-up requires scoped
static, unit and disposable PostgreSQL checks; all three passed, with the last
finishing at 08:51:30 UTC. Unchanged browser, VM and local devnet evidence is
retained from the earlier run. This is separate-run coverage, not a single-run
major-gate receipt for the final tree, and does not waive a future publication
hook.

Independent source review covered scheduling descriptor lifetime, migration
refusal, unchanged financial locks, loopback authentication, environment isolation,
per-child request matching, bounded waiters and test scope. No blocking issue was
found in those helpers. The worker's dependency queries must also have bounded
timeouts: the helper deliberately coalesces one outstanding dependency check and
fails closed if it never completes, rather than accumulating repeated queries.
