# Season visual and Genie correction

16 October 2026, Africa/Lagos. Follow-up to `13d2571` on `feat/streak-market-slip` and [PR 3](https://github.com/HeySomtee/ckbuilder/pull/3). The previous functional gate did not establish fidelity to the approved preview. This change addresses the owner's visual and motion correction, tracked as UI-02.

## Implemented behavior

Markets use compact outcome controls, coral selected markers, directional glass rims and a clickable team row. The detail page puts the match and current pool distribution beside the prediction panel on desktop, then stacks them on phones. Names, logos, fixture states, amounts and terms still come from the API.

The first pick opens a 480px desktop slip with inset pick cards, team crests, selected outcomes, exact decimal inputs and stake shortcuts constrained by API limits. Later new picks update the dock without interrupting browsing; choosing an already selected outcome reopens the slip. Mobile uses the approved full-width bottom sheet. The slip remains more opaque than ordinary cards. Limits and pool fees are available in each pick's disclosure. Clear remains an explicit confirmation, separate from Minimize.

The only window control is visibly labelled Minimize. Escape and Add more matches also retain the draft in the dock. Restoring returns to the same picks and amounts. Existing corruption, storage denial, cross-tab choice, cancellation, expiry and stale-review protections remain in place. Payment is still unavailable in this read-only journey.

## Motion ownership

`genie-motion.ts` owns a decorative transition, while the native dialog and React own state and keyboard focus. Minimize retracts the lower edge into a 20px dock mouth before the top follows. Restore reverses the connection. Durations are 720ms and 620ms respectively. The mesh has 128 rows; a canvas fallback preserves the connected shape when WebGL is unavailable.

The renderer uses one in-memory snapshot of the explicit prediction surface. Snapshot identity includes current amounts, scroll offsets, loaded logos and native disclosures. A measured inert copy covers bounded cold preparation. Preparation does not delay draft state or focus. Normal preparation is prewarmed after edits; cold preparation has a 240ms limit. Canvas density is capped at two device pixels per CSS pixel.

The copied surface contains no interactive controls, IDs or active URLs. Provider logos that cannot be safely rasterized retain their measured frame and text fallback. No screenshot leaves the browser or enters persistent storage. Wallet prompts and marked private surfaces are excluded. Unsupported rendering, reduced motion and forced colours use immediate state changes.

New input, navigation, resize, scrolling, tab hiding, unmount and preference changes dispose the overlay. Generation checks prevent late preparation from hiding a newer dialog. Resource ownership is reusable through React StrictMode's setup and cleanup rehearsal.

## Verification

The built app passed **22 integrated browser groups** with synthetic loopback fixtures in Chromium and WebKit. Both engines painted the actual slip at two and eight picks. At 40% progress, phone captures measured 378px above and 45px below; desktop measured 480px and 52px. The added scenarios inspect visible raster pixels at 40% progress, requiring a connected surface and a bottom width below 35% of the top. They also cover cold preparation, edited amounts, restore, rapid reversal, Escape, route focus, resize, live reduced-motion changes and failed canvas allocation. They forbid financial requests and external network access.

`npm.cmd run quality:major` passed all **31 steps**, finishing at **09:00 UTC on 16 October**. Evidence: `.quality-artifacts/ui-motion-full-gate.log`, `.quality-artifacts/all.json` and `.quality-artifacts/browser/prediction-genie-*.png` / `prediction-genie-*.json`. Existing draft, backend, PostgreSQL, preview and Rust checks remain included. Commit and push hooks repeat the full gate against unchanged candidate contents; hosted Actions remain paused.

Independent review covered motion lifecycle and retained review/draft recovery. It found and corrected a delayed focus callback, stale preference events and raster clipping defects. Browser tests wait for positive page and account readiness, finish tracked local reads before unrelated document changes, and follow the actual entry link without a redundant reload. Deliberate stale-response races and all browser-error assertions remain. Failure traces record request phases. No remaining recovery blocker was identified in this scope.

Manual desktop and mobile captures using already loaded public API fixtures confirmed logo loading, zero browser errors and successful read-only whole-slip review with payment unavailable. These captures are separate from isolated regression tests and are stored as `.quality-artifacts/browser/local-api-*.png`.

Physical iPhone and Android frame-rate profiling remains a public-pilot prerequisite. Historical preview timing failures remain recorded in the design evidence; new integrated browser results do not rewrite those earlier runs. This change does not deploy the app or establish testnet settlement.
