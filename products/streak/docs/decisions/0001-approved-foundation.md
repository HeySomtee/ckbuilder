# ADR 0001: approved Streak foundation

- Date: 2026-10-15, Africa/Lagos
- Status: accepted by the owner
- Baseline application revision inspected: `2d5879a`
- Reference: local Season preview, design proposal 01 and architecture proposal 01, including subsequent glass, scrollbar, control and slip-opacity refinements

## Decision

The owner said: "UI approved archetecture approved" and requested documentation, recurring tests and CI before building. This approves the concrete preview and architecture direction already presented. It does not require another approval for this foundation or routine implementation within it.

Adopt React, strict TypeScript and Vite for the new frontend while retaining the Node API and Rust contracts. Serve static frontend assets under the same origin. Use feature ownership, named operations, semantic tokens, a shared server-data cache and explicit recovery states. Evolve the backend as a modular application with a separate durable worker, bounded SQL commands and durable identity/session state.

Preserve the Streak football identity and approved mobile-to-desktop composition. The prediction slip has a 95% opaque dark face; surrounding cards use clearer glass with directional rims. Use native scrollbars and labelled Minimize/Close controls. Multiple predictions settle independently and use one reviewed combined payment when the production builder has been validated.

Build a free five-player fantasy experience with account identity separate from optional wallet ownership. Keep fantasy scoring and campaign rewards separate from prediction funds. Integrate a limited direct-market pilot only within proven contract bounds, retaining a separate legacy custody recovery path.

Establish these canonical docs, contributor rules, recurring verification and CI before implementing the new production frontend. Every commit must pass applicable local CI-equivalent checks. A published commit also needs successful hosted checks before merge or release.

## Consequences

- The vanilla app remains the implemented product until a verified migration replaces it. Approval is not deployment evidence.
- The Week 20 Rust lab remains independent until an explicit integration is tested. It currently supports at most 32 accepted bets per market, not unrestricted matchday capacity.
- The Genie remains eligible for the approved interaction, but two mobile WebKit timing checks are unresolved. Production may use the immediate transition while the effect is profiled on real devices.
- A combined-payment slip needs multi-market transaction validation, per-pick admission and recovery. Preview success does not provide this.
- The reference Chessdict repository contributes conventions and design lessons. Its Next.js choice, permissions, branch destinations, custodial model and deferred motion policy are not imported.

## Not established by this approval

This approval does not establish hosted capacity, a reward or hosting budget, player-data permissions, finalized scoring rules, mainnet readiness, current DB health, universal wallet compatibility, successful GitHub runs, branch protection or deployment. These need their own concrete implementation or evidence. Material departures from the approved design, contract economics or trust boundaries return for review; accepted scope does not need repeated permission.

## Alternatives considered

Keep growing the vanilla controller, adopt Chessdict's full Next.js stack, or split the backend into microservices now. The chosen approach gives reusable frontend state and bounded backend evolution without adding a second request-time frontend service or prematurely distributing domain transactions.
