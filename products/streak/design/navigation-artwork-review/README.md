# Navigation and competition artwork preview

6 November 2026. Approved standalone design preview with synthetic competition
data. The subsequent [application integration](../../docs/delivery/competition-artwork-navigation.md)
adds optional artwork and navigation. This preview itself does not modify
competition records, uploads or payment flows.

Run `node products/streak/design/navigation-artwork-review/serve.cjs` from the
repository root, then open <http://127.0.0.1:4204/>.

## What to review

- Desktop: separated play links, a dedicated competition panel with recognizable
  artwork and status, and a distinct personal navigation area.
- Mobile: Home, Markets, Compete, Activity and More. More opens grouped navigation
  with the games and account destinations still available.
- Use the review selector for Predictions, Five, Finished, No artwork and Admin
  artwork. The selector is a preview tool, not proposed public application UI.
- Optional icon and banner controls show image selection, replacement, removal
  and fallback states. Local files stay in this browser session; nothing uploads
  or saves to Streak.

## Four generated images

| Competition | Icon                                                   | Banner                                                         |
| ----------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| Five        | [Square jersey artwork](assets/five-icon.png)          | [Five-player pitch](assets/five-banner.png)                    |
| Predictions | [Square football artwork](assets/predictions-icon.png) | [Football and connected blocks](assets/predictions-banner.png) |

These are original built-in imagegen outputs, preserved without modification.
Icons are square; banners are 3:1. They have no fixed week, prize or deadline, so
the application can render current text independently. The existing Streak
wordmark remains separate. The exact generation prompts are in [PROMPTS.md](PROMPTS.md).

The local upload bundle is
`.quality-artifacts/navigation-artwork-review/streak-competition-artwork.zip`.

## Integration boundary

The owner approved integration and specified that existing rehearsals stay
image-free until an administrator adds artwork. Missing artwork retains a
compact competition-type icon and a readable plain header. Uploading artwork
does not change entry eligibility, prize rules or settlement. The integration
record documents authenticated validation, persistent storage, optimized
variants and cache rules; this standalone preview is not that service.

Keep artwork metadata separate from the frozen competition terms. The existing
terms hash covers the draft, so adding presentation fields there would make a
banner edit change the terms accepted when joining. Store only optional asset
references in the competition record, with an audited admin update and a safe
missing-image fallback. Existing sponsor logos use HTTPS URLs, not an upload
service. A small bounded same-origin upload path and optimized static files can
use existing storage without another background worker. Byte/dimension limits,
atomic writes, storage quotas and backups are defined in the integration record.
The application serves optimized variants rather than these approximately 2 MB
originals as tiny navigation avatars.

## Verification

All 24 focused scenario/interaction groups passed in Chromium at 1440, 390 and
320 pixels, and WebKit at 390 pixels. Checks covered all five scenarios, custom
dropdown and tab keyboard navigation, More/Escape focus restoration, finished
labels, generated-image uploads, rejected file types, removal/fallbacks and
horizontal overflow. No page errors or external requests occurred. Independent
review confirmed the mobile image and navigation states. Desktop, mobile More,
finished and admin screenshots were visually inspected.

Evidence and screenshots are in the ignored
`.quality-artifacts/navigation-artwork-review/` directory. This is standalone
synthetic preview verification, not production or physical-wallet acceptance.
No commit, push or deployment was performed for this preview.
