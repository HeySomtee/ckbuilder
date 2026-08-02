# Week 11: Streak Terminal — Making It Reach (Responsive UI + Render Deploy)

Week 10 made Streak durable and talkative: state moved to Supabase and every
pick/settlement could reach a user on Telegram. But two things were still true.
The terminal was **desktop-only** — the dense, Bloomberg-lineage grid was
effectively unusable on a phone — and it lived **nowhere but localhost**. A
prediction market nobody can open on their phone, hosted on a laptop, is a
private demo, not a product.

Week 11 is about reach. It makes the whole terminal genuinely usable on a small
screen, and it puts the product online on Render with a persistent data disk.
No new market mechanics this week — the value is entirely in the last mile
between "works on my machine" and "a friend can open it on their phone."

**Code:** [products/streak](../products/streak)
**Run:** `MATCH_PROVIDER=dummy npm run streak` → [http://localhost:4100](http://localhost:4100)

## The problem with a terminal aesthetic on a phone

The Streak UI was built as a financial terminal: a fixed 200px left rail, a
sticky status bar, a scrolling ticker tape, and a dense main grid — all laid
out with a single CSS grid in
[products/streak/public/styles.css](../products/streak/public/styles.css). That
reads beautifully on a wide monitor and falls apart under ~400px: the rail eats
half the width, the status bar overflows its row, and multi-column KPI/market
grids get crushed.

The fix is not a coat of paint. Responsiveness here meant re-examining three
layout assumptions the desktop build had baked in: a permanent side rail, a
status bar that fits on one line, and a main content area that scrolls
*internally*. Each had to change.

## A navigation drawer — and a re-render bug that ate its clicks

On mobile the left rail is hidden and replaced by a slide-in drawer behind a
hamburger button in the status bar
([products/streak/public/app.js](../products/streak/public/app.js)). The drawer
reuses the exact same `navHtml()` the desktop rail renders, so there is one
source of truth for navigation.

The subtle part was making the hamburger actually work. The first attempt bound
`onclick` directly to the button and it worked — for about a second. The status
bar re-renders **every second** from a clock tick (`setInterval(updateStatusBar,
1000)`), and each re-render replaces `#status-bar`'s `innerHTML` — destroying
the button element and the handler attached to it. The button was alive for one
tick, then inert.

The fix is event **delegation** from a stable ancestor. A single listener,
attached once to `document`, handles the hamburger, sign-out, all route links,
and the backdrop:

```js
document.addEventListener("click", async (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest("#mobile-nav-toggle")) { e.preventDefault(); toggleMobileNav(); return; }
  if (t.closest("#signout"))          { /* … logout … */ return; }
  const link = t.closest("a[data-route]");
  if (link) { e.preventDefault(); closeMobileNav(); location.hash = `#/${link.dataset.route}`; return; }
});
```

Because the listener lives on `document`, it survives every status-bar and view
re-render. It also fixed a latent bug: the drawer's own nav links were injected
*after* the old direct-binding query ran, so they had been unbound too.

The lesson is general to any vanilla, `innerHTML`-driven SPA: an element that
lives inside a container you re-render cannot own its own listeners. Delegate
from something that never gets replaced.

## The "missing headline market" — a layout trap, not missing data

The most instructive bug this week was a report that the **headline market was
gone on mobile**. The dashboard showed the KPI cards and then apparently
nothing.

Rather than guess, I reproduced it against a running server: signed up a user
and queried `/api/dashboard`. The `headline` field was populated
(`CRY vs MUN`, a live fixture). So the data was fine — the panel was rendering
into the DOM but was not *reachable* on screen.

The cause was in the shell layout. `.main` carried `overflow: auto` inside a
`1fr` grid track. On desktop that is invisible; on mobile it turns the entire
dashboard into a short, nested scroll box sized to *viewport minus status,
tape, and footer*. You saw the KPIs and had to scroll a cramped inner region to
reach anything below — so the headline panel read as "missing."

The fix was to stop trapping content: on mobile the grid rows auto-size and
`.main` uses `overflow: visible`, so the page grows with its content and the
**body** scrolls naturally, the way a phone expects.

```css
@media (max-width: 880px) {
  .shell { grid-template-rows: auto auto auto auto; }
  .main  { overflow: visible; }
}
```

This is the debugging habit that mattered: *reproduce before you fix.*
Confirming the API returned a headline turned a vague "it's broken on mobile"
into a precise, one-line CSS cause.

## The rest of the responsive pass

The remaining work was smaller but adds up to a phone-usable terminal, all in
the `≤880px` / `≤560px` media queries:

- **Status bar** re-tiers instead of overflowing: brand and network on top, the
  live/league line on its own row, and the `BAL / WALLET / STREAK / clock`
  strip on a separated line.
- **KPI grid** drops to two columns on phones instead of one, so the six
  headline stats stay scannable.
- **The FLOW ticker** came back: the status row had been pinned to a fixed
  height, so its wrapped content was overlapping and hiding the tape. Letting
  the grid rows auto-size restored it.
- **The nav drawer's footer** (signed-in identity, wallet, sign-out) got its
  own padding — its styling had been scoped to `.rail`, so inside the drawer it
  was flush against the screen edge.

None of this touches the market engine, the escrow ledger, or settlement — it
is purely the presentation layer adapting to a new form factor.

## Deploying on Render

The second half of the week put the product online. The repo already had a
`render.yaml`, but it pointed at an earlier week's demo. It now deploys the
Streak product ([render.yaml](../render.yaml)):

- **Build** installs the root dependencies and then the product's:
  `npm install && npm --prefix products/streak install`.
- **Start** runs `npm run streak` (which is `ts-node src/server.ts` — no build
  step, consistent with every other week).
- **Provider** is pinned to `MATCH_PROVIDER=dummy` so the simulated Premier
  League feed runs any day of the year; the deployed demo is never dark.
- **Persistence** is a 1 GB disk mounted at `products/streak/data`. Render's
  filesystem is otherwise ephemeral, so without the disk every redeploy would
  wipe `db.json` — and with it every user's custodial wallet key, escrow
  balance, bet history, and crew. The disk is what makes the hosted instance a
  place you can actually keep an account.
- **Secrets** (`TREASURY_PRIVATE_KEY`, `APP_PUBLIC_URL`) are `sync: false` — set
  by hand in the dashboard, never committed.

There is an honest operational caveat that ties straight back to CKB's model:
the treasury wallet must be funded on Pudge for on-chain receipts and
withdrawals to succeed, and on Render's free plan the service spins down when
idle — which also pauses the background settlement loop until the next request
wakes it. For a persistent demo, the treasury needs a balance and the plan
needs to be always-on.

## What this week proved

- **Responsive is a rewrite of assumptions, not a coat of paint.** The desktop
  build assumed a fixed rail, a single-line status bar, and an inner-scrolling
  main. Every one of those had to change before the phone layout felt right.
- **Re-rendering UIs demand delegated events.** In an `innerHTML`-driven SPA, a
  handler bound to an element inside a container that re-renders dies on the
  next tick. Delegation from a stable ancestor is the only durable pattern.
- **Reproduce before you fix.** The "missing headline" was never missing data —
  querying the API proved it, and the real cause was a one-line overflow trap.
- **Deployment is where persistence assumptions get tested.** A file-backed
  store is fine on a laptop and catastrophic on an ephemeral host; the mounted
  disk (or, next, Supabase as the sole store) is what keeps identities alive.

## Next

1. Add a small PWA manifest so the terminal is installable to a phone home
   screen.
2. Add a CI check that runs `tsc` on every push, so a broken build never
   reaches Render.
3. Make Supabase the sole store in production and retire the disk dependency,
   removing the last piece of host-specific durability.
