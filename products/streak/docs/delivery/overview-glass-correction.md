# Overview, clear outcome glass and CKB details

17 October 2026. Uncommitted local changes on `feat/streak-direct-testnet`, based on `07b427c`. The owner has not authorized commits or pushes.

## Design

Overview follows the supplied composition with compact team-led fixture rows, right-aligned outcome controls and blue reflections on the side panels. Real API fixture names, logos, competitions and times remain authoritative. The date follows the current local day. The existing compact typography and viewport-fitting rail remain.

Home, Draw and Away use shared muted blue, green and red identity across Overview, Markets, match details, direct entry and the landing illustration. The owner's follow-up rejected the first frosted treatment: the final faces are almost clear, with colour concentrated in one-pixel glistening rims and small lower-edge reflections. Hover and selected states retain clear centres. Selection also uses a check mark and `aria-pressed`, so colour is not the only cue. Reduced-transparency and forced-colour modes retain solid/system alternatives. No backdrop blur or pointer-tracking effect was added.

Overview uses football's 1/X/2 notation. It does not invent probabilities, odds, personal balances, fantasy rankings or reward progress to copy the reference. Existing legacy pool percentages on other screens retain their existing context. Selecting a different outcome updates the same saved prediction, and returning from the slip shows the chosen side.

The shared Five banner adds a pitch grid, brighter kit colours and a small CKB chest crest. The existing network strip and landing attribution also use the same local mark. These are visual acknowledgements of the chain the app uses, not a sponsorship or grant claim.

## Asset source

`public/ckb-mark.png` is an unmodified local copy of the white Nervos symbol from the [official CKB documentation repository](https://github.com/nervosnetwork/docs.nervos.org/blob/develop/website/static/img/favicon.png), retrieved 17 October 2026. SHA-256: `027d56e259247d93ca1e5fb474c233c957296d89d73bd73fd7d8cf8f4d17f8e8`. The [official media kit](https://www.nervos.org/media-kit) describes the symbol's small-space use. The jerseys preserve its proportions and colours; CKB lettering is separate. No external request is needed to render it.

## Verification

The account/navigation lane checks horizontal desktop row composition, mobile reflow, distinct outcome faces, retained/replaced selections, 44px controls and local CKB asset loading on both banners. It retains the prior sidebar, draft-storage failure, midnight rollover, slip and account-navigation assertions.

Real-provider, read-only screenshots at 390, 1279 and 1440px are under `.quality-artifacts/overview-glass-live/`. The browser blocks write requests. Isolated tests use synthetic data and no public chain or provider credentials.

All **48 full major-gate checks passed at 07:58:50 UTC on 17 October**, after the final muted blue/green/red palette change. Evidence: `.quality-artifacts/overview-glass-major.json` and `.quality-artifacts/overview-glass-major.log`. This includes Chromium/WebKit browser journeys, isolated PostgreSQL, Rust VM regressions and signed local-chain lifecycles. The separate final read-only visual checks passed at 390, 1279 and 1440px with no page errors, horizontal overflow or write requests.

The first gate exposed an outdated `schema: 1` in the prediction HTTP test fixture. After the store cache expired, the current schema migration correctly removed those transient fixtures. A forced uncached read reproduced the failure. The test now imports `DB_SCHEMA`, disables its read cache and retains the full validity assertion with a diagnostic response. It passed in isolation and in the full gate. No production persistence or payment behavior changed for this fix. The original failure is retained in `.quality-artifacts/overview-glass-major-first.log`.

Five entry/scoring, direct settlement notifications, physical-wallet verification and durable operation remain open. These checks do not establish public testnet settlement or production capacity. No commits or pushes.
