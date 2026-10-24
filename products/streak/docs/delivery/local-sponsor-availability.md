# Local sponsorship availability, 20 October 2026

The owner repeatedly saw the disabled-payment notice in the local prediction
slip. Read-only reproduction returned `enabled: false` in 348 ms while the API
on port 4100 was running. Nothing answered the sponsor port 4101 and the local
sponsor process was absent. The original reason for that process stopping was
not established; this was not evidence of insufficient wallet balance or a
failed user signature.

Restarting the existing ignored `local-sponsor.cjs` launcher restored
`enabled: true` and 182 eligible fixtures in 617 ms. It reused the existing
operator key and durable journals. No keys were printed, no records deleted
and no new payment was requested. The existing lifecycle worker stayed running.

## Local recovery

`scripts/local-sponsor-watch.cjs` monitors the local sponsor listener every five
seconds. It starts the existing launcher only after a refused connection, waits
for its own child to exit before another start, and backs off from two seconds
to thirty seconds after repeated exits. A singleton listener on loopback port
4105 prevents a second default watchdog. `/health` reports monitor state without
credentials. An existing listener is left alone. Timeout or uncertain connection
status never triggers a duplicate signer or forced restart.

Run from the repository root after the usual local API configuration:

```text
node products/streak/scripts/local-sponsor-watch.cjs
```

The default launcher is `.quality-artifacts/local-sponsor.cjs`. An existing
absolute launcher path can be supplied as the first argument. The monitor reads
no key files and does not alter launcher configuration, signing or journal rules.
It is a local development helper, not Windows startup registration or a hosted
supervisor. It must be started again after the computer restarts.

Stopping the watchdog deliberately leaves the signer alive so an in-flight
payment is not interrupted. Before intentionally pausing local signing, stop the
watchdog first, then follow the existing signer shutdown/reconciliation procedure.
TCP presence means a listener exists; it does not prove funding or application
health. A hung running signer remains an operator investigation, not an excuse
to launch another one.

## Checkout behavior

While an open slip reports unavailable payment service, availability refreshes
every five seconds instead of thirty. Healthy service keeps the normal interval.
The notice retains the server's explanation, says picks are saved and offers a
Check again button with animated progress while checking. Refreshes only read
availability; they do not prepare, sign, submit or replace a payment. Existing
payment validation remains authoritative.

## Verification

The production frontend build and two disposable-process watchdog tests passed.
The tests cover an existing listener, duplicate monitor rejection, restart after
a child exit, preserving the signer when monitoring stops and uncertain probes.
Independent recovery review accepted the scoped implementation. Its remaining
limitations are described above.

The integrated checkout browser regression also exercises an unavailable sponsor,
manual refresh with visible pending state, automatic recovery, unchanged picks
and no wallet signature during status checks. All six Chromium/WebKit journeys
passed at 390, 900 and 1440 pixels; lint, formatting and static policies passed.
Browser evidence is `.quality-artifacts/sponsor-availability-browser.log`. The
watchdog is running and follow-up demand reads remained enabled. This is scoped
local verification, not a new full release gate.
No commit, push or Render change was requested or performed.
