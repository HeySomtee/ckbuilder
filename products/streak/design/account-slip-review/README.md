# Wallet and slip review

16 October 2026. Proposal only. No application source changed, no commits or pushes authorized.

Run `node products/streak/design/account-slip-review/serve.cjs` from the repository root. Open http://127.0.0.1:4186/ for Wallet or http://127.0.0.1:4186/#markets for the slip journey.

## Review

1. Wallet groups balance, address and funds actions into the top of one panel. Telegram is an integrated row; predictions and recovery are compact navigation rows. Mobile follows the same reading order.
2. Open the dock, scroll the picks, and use Add matches. The control lives in the fixed header, independent of list length. At eight picks it becomes Slip full. Removing one re-enables it. Close and Escape preserve picks.
3. Hover or keyboard-focus the collapsed slip over match cards. Its backing remains opaque. Hover changes its tint and border, never its opacity. Focus has one thin accessible ring.
4. Click Connect in the Telegram row to inspect the proposed bot wording. This is a simulated state and sends no message.

Fixtures and crests are a dated snapshot from the existing public local API, with assets downloaded from the returned provider URLs. They do not refresh in this isolated proposal. The balance and selections are illustrative. No wallet, payment, user account, operator or Telegram endpoint is connected. Reload resets the preview.

## Diagnosed causes and proposed implementation

- `web/src/features/predictions/slip.tsx` puts Add more matches after the picks inside the scroll region. Move it to the non-scrolling header, with the count and capacity state.
- The generic `button:hover:not(:disabled)` selector in `web/src/design-system/styles.css` overrides the dock background with a translucent colour. Define explicit component hover and focus backgrounds for the dock.
- `src/server.ts` interpolates `linkedUser.username` in the Telegram confirmation. `User.username` is optional for wallet-created accounts, so an absent handle prints as `undefined`. Use `Your Telegram account is now connected to Streak.` without a username dependency. An old named account producing a correct message is consistent with this bug; the screenshot alone cannot establish whether both connections used the same account.

After approval, implement only the accepted layout changes and bot wording. Add focused regressions for overflow, stable header controls, all eight picks, draft preservation, solid hover and Telegram accounts with/without a handle. Run applicable mandatory gates after implementation. Do not commit or push until explicitly authorized.

## Preview verification

Six isolated browser journeys passed in Chromium and WebKit at 320x568, 390x844 and 1440x900 on 16 October 2026. Checked horizontal overflow, header visibility after scrolling, modified stake retention, opaque hover, eight-pick capacity, removal, Escape/focus restoration, review and clear. No external requests or page errors were observed. Desktop and phone screenshots were inspected. Evidence is in `.quality-artifacts/account-preview/` at the repository root. These checks verify the proposal only, not the application's financial or identity flows.
