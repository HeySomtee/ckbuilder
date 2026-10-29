# Activity startup warmup

28 October 2026. Small read-only frontend increment, implemented locally.
The larger [wallet-index architecture](../architecture/wallet-activity-index.md)
remains a proposal. This change does not implement a central contract or a durable
portfolio API, and does not claim instant cold discovery.

## Implemented behavior

After the server account and restored wallet agree, the app loads a background
preparation module. It reads validated local direct, sponsored and atomic journals
for the same owner and selects at most two unique recent market descriptors.
It observes those markets sequentially using the existing verified chain reader.
It does not invoke wallet account/permission methods, signatures or payments.

Startup and foreground Activity share the same React Query keys and 60-second
freshness window. A foreground navigation joins an ongoing read instead of
starting another discovery pass. Existing progressive live snapshots remain
available while history finishes. An empty journal does not trigger a scan of
the global catalogue. There is no new background polling timer or splash gate.

The exact authenticated account ID/address and active wallet object must remain
current. Abort and query-entry identity checks prevent delayed partial/final
results from recreating private data after clearing, replacement or sign-out.
Route navigation does not own the background lifetime, so it does not cancel the
shared read that Activity is about to observe. Selected descriptors are explicitly
parsed again before use, in addition to the journal parser's validation.

Claims, signed recovery journals, protocol rules and payment preparation are
unchanged. A cached display observation never authorizes collection; the existing
selected-cell verification remains in place.

## Measured synthetic coverage

Eight isolated Activity query tests passed, including:

- Two unique markets maximum, observed sequentially.
- Empty saved history or inactive account: zero discovery passes.
- Foreground opening during delayed warmup: one shared discovery invocation.
- Revisiting both warmed markets within freshness: zero additional passes.
- Sign-out removal, account invalidation before effect cleanup and replacement
  of the same query key: late callbacks cannot restore obsolete private data.

Final frontend build and lint passed. Four direct browser journeys and four
shared-wallet browser journeys passed against the final built bundle, covering
Chromium desktop/mobile and WebKit mobile. These are isolated synthetic checks,
not physical-wallet or hosted latency evidence. Independent identity/recovery
review accepted the increment and independently reran all eight focused tests.

Evidence at repository root:

- `.quality-artifacts/activity-bootstrap-build-final.log`
- `.quality-artifacts/activity-bootstrap-lint-final.log`
- `.quality-artifacts/activity-bootstrap-unit.log`
- `.quality-artifacts/activity-bootstrap-browser-final.log`
- `.quality-artifacts/activity-bootstrap-wallet-final.log`

## Limits and next step

This improves known positions in the current browser. A new device, cleared
browser or empty journal gets no speculative chain warming. It still needs the
durable indexed API to avoid the broader cold scan. The two selected markets can
themselves have substantial history. Already-running SDK discovery cannot be
interrupted mid-market; after cancellation its results are ignored and the next
market is not started. This is not per-RPC cancellation.

No whole-app speed target, full major suite, commit, push or hosted acceptance
is claimed. Required full release gates remain for publication. The revised
two-strike/chart-r splash remains an isolated design preview. Its eventual
integration can overlap background preparation but must never delay the app
until this work finishes.
