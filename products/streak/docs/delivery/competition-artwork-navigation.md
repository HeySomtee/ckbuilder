# Optional competition artwork and navigation

6 November 2026. The owner approved the navigation/artwork preview and specified
that existing rehearsals must stay image-free until an administrator adds art.

## Admin workflow

Create a competition and optionally choose an icon, a banner or both in the
invitation step. Save or publish as usual. For an existing competition, open
Manage competitions, change the artwork and select Save artwork. Either image
can be replaced or removed, including after the competition finishes. Deleted
competitions retain their archive and cannot be edited.

No sample images are installed into competition records. Missing icons use the
game-type symbol; a missing or broken banner leaves the compact normal heading.
The four generated originals remain in `design/navigation-artwork-review/assets/`
for the owner to upload explicitly.

Creation saves a draft before uploading selected images, then publishes only
after those uploads succeed. On upload failure the same draft and unapplied
selections remain available for retry. Successful slots do not need uploading
again. Replacing artwork does not change entry rules, points, prizes, tie-breaks
or the frozen terms hash. Artwork is separate presentation metadata in the
existing competition record, with revision checks and audited admin writes.

## Navigation

The desktop rail separates Play, Competitions and Your space. Competition icons
and current status distinguish individual links, with both Finished and Rehearsal
retained when applicable. Mobile uses Home, Markets, Compete, Activity and More.
More contains the games, competitions, Clubhouse and My Account. Ordinary route
links, modified clicks, keyboard navigation and dialog focus return are retained.
The mobile payment controls still use the existing dock geometry.

## Storage and request boundaries

- Icons accept up to 3 MiB, banners 5 MiB; PNG, JPEG and WebP only. Server decoding
  verifies the content, rejects animations and bounds input at 16 megapixels.
- A lazily loaded pinned Sharp decoder strips metadata and writes optimized WebP:
  128 by 128 icons and 1440 by 480 banners. It uses one processing thread, no
  decoder cache and a bounded processing deadline. Only one upload is processed
  at a time. Image work runs on explicit admin requests, never a new worker.
- Same-origin admin authorization and an expected-account header are checked
  before reading bytes. Row-locked revision checks repeat before attaching the
  image. JSON removal has the same admin and expected-account checks.
- Content-addressed files are written atomically and streamed with immutable
  cache headers, outside the static asset memory cache. PostgreSQL contains only
  small image references/dimensions. Artwork edits do not enqueue score checks.
- The hosted launcher sets the API-only `STREAK_CAMPAIGNS_ARTWORK_DIR` to
  `campaign-artwork` beneath `STREAK_HOST_STATE_DIR`, normally
  `/var/data/streak/campaign-artwork`. The durable-disk preflight checks this
  directory too. The standard hosted launcher needs no new Render variable.
  A separately launched production API must configure an absolute persistent
  directory itself. Local use defaults beneath `STREAK_DATA_DIR`.
- Optimized files are bounded to 800 KiB each and 64 MiB/1,024 files per store.
  Replaced files remain immutable for old cached URLs. Removal detaches the image
  from the competition, not from the backup/history. Storage exhaustion returns
  a clear error while preserving current artwork. Back up this directory with
  PostgreSQL; any later pruning must preserve referenced files and cached links.

Image previews use browser object URLs, permitted only by the image CSP. They
are released on replacement/unmount. Account and route epochs prevent delayed
requests from updating another competition or reviving after an account switch.

## Verification and release

Independent review covered authorization, origin exceptions, account binding,
revision checks, immutable terms, decoder bounds and optional fallback behavior.
It identified and resolved missing image-only blob CSP support and account IDs
in upload URLs; identity binding now uses a header.

Focused domain, HTTP and disposable PostgreSQL checks cover empty legacy records,
finished edits, rejected files, account/permission failures, stale concurrent
updates, durable persistence, audit events and unchanged scoring schedules.
The built-app browser lane adds new/existing artwork, replacement/removal,
finished rehearsals, broken images and retry without duplicate creation. Updated
navigation, wallet and startup browser suites retain their existing journeys.

All 96 stages of `npm run quality:major` passed on Node 24.14.0 at 18:39 UTC on
6 November. This includes the expanded six competition browser journeys, real
disposable PostgreSQL persistence and signed local-chain payment/reward checks.
Responsive desktop, mobile admin and More-menu screenshots were inspected.
The owner's hosted checklist was restored byte-for-byte after gate formatting.

Local evidence is in `.quality-artifacts/artwork-major.log`, `all.json`,
`artwork-release-2026-11-06.json`, `campaigns-runtime/` and
`navigation-integration/`. Earlier failed harness iterations remain recorded;
the final combined gate passed without skipped suites.

On 7 November the owner requested publication. Commit `6ad5368` was pushed to
GitHub `main` after all 42 release file hashes matched the saved evidence. Commit
and push reused the successful gate within 24 hours on the same Node runtime.
The owner's testing checklist and private local state were excluded. No hosted
upload, physical-wallet test or deployment verification is claimed by this record.
