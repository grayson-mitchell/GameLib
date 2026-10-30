---
created: 2026-10-28
title: "A game bought in the in-app Steam store does not show in the library until the app is refreshed"
source: user report 2026-10-28, buying Undertale (391540) in the embedded store to test the GameMaker DXVK todo
area: steam-library
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src-tauri/src/main.rs
  - src/backend/storeManagers/steam/user.ts
severity: medium
platform: any
ready: live-gate
---

The user bought Undertale through the Steam store in GameLib's embedded store browser. The game
did not appear in the library until they refreshed the app by hand. The purchase worked; the
library just did not know about it.

The workaround (an explicit Refresh) works, so the blast radius is bounded. But a user who just
paid expects the game to be there, and nothing tells them to refresh.

**Direction:** treat a completed Steam checkout as a library-refresh trigger. Candidates, cheapest
first:

- The embed already sees every page load: Rust's `on_page_load` queues the navigation state that
  `useStoreEmbedHost.ts` drains. A load of Steam's post-checkout receipt page (the
  `store.steampowered.com/checkout/...` thank-you step) could start the same owned-apps refresh the
  Refresh button does. Check the exact URL on a live purchase first; do not guess it.
- Alternatively, refresh when the user leaves the store embed after it has visited any checkout
  URL.
- `steam-user` emits license-list changes while logged on, but the CM client is anonymous by
  default and authenticated only on demand (CLAUDE.md stack note), so that event is not available
  in the normal case. Do not keep an authenticated session open just for this.

Key-redeem (`user.ts` `redeemKey`) is the existing analogue: it already knows a purchase happened.
See how its library update is wired and reuse it.

Verify live with a free-to-own app ("Add to Library" goes through the same license grant), so the
gate needs no second paid purchase. Confirm which path that free grant actually takes before you
rely on it.

## Status (2026-10-30, quick 261030-qqh)

Probe:
- A free-to-own "Add to Library" in the embed loads no page.
- Steam's store JS sends the grant as the `Checkout.AddFreeLicense#1` (ICheckoutService) XHR.
- So `on_page_load` can't see the grant, and the receipt-URL candidate was rejected.

Built (`4be6400bd`, `e34ad8668`):
- Leaving the Steam store embed runs the Steam library refresh (`origin: 'steam-store-exit'`).
- It only runs after the visit loaded a store app, cart or checkout page.
- It never runs while a refresh is already running, or when signed out. (The first build also
  throttled it to once per 2 minutes; `e598f12da` removed that.)

Live gate (open):
1. Restart `tauri dev`.
2. Add a free-to-own game in the store, then leave the store.
3. The game should appear without a manual Refresh, and the log should show
   `origin=steam-store-exit`.
4. Note whether the macOS Go Offline dialog appears.

First live test (2026-10-30), a demo:
- The trigger fired on the first store exit (19:27:35).
- The exit after the "Add to Library" grant (19:28:59) was `skipped-throttled`. `e598f12da`
  removed the throttle. The same commit made a scoped refresh spin the Refresh button instead of
  a second spinner.
- A demo is the wrong test subject anyway. GameLib's owned-games fetch leaves out free-on-demand
  licenses (demos, free-to-play) until played, and the operator chose to keep it that way.
- Retest with a paid purchase or a free-to-keep giveaway.
