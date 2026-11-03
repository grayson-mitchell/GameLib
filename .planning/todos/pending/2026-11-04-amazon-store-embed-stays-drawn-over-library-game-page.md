---
created: 2026-11-04T00:00:00.000Z
title: "Amazon store embed stays drawn over the Library game page after leaving Stores"
area: tauri-shell
severity: major
platform: macos
ready: live-gate
found_by: "Phase 59 re-UAT 3 (item 29 session), recorded as G24 in 59-UAT.md; out of scope for phase 59"
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/storeExitRefresh.ts
---

## Problem

Observed 2026-11-03 at about 12:28 during phase 59 re-UAT 3. The Amazon store embed (Luna "Claim
Games", `https://gaming.amazon.com`) stayed drawn over the Library game page after the operator
left the Stores tab. It survived a Play and an app relaunch. The operator took a screenshot at 12:29.

The log shows more than 100 `[WebView] store/wiki route pathname=/store/amazon
startUrl=https://gaming.amazon.com` lines in the same second (12:28:08), followed by
`[amazonStoreExitRefresh] origin=amazon-store-exit outcome=skipped-in-flight`. That suggests a
route re-render loop on `/store/amazon`. Possibly the hide or suppression step on leaving the
route never ran, or it ran and was then overridden.

This is not phase 59 code (59-48, 59-53: "G24 (Amazon embed, not phase 59)"). Earlier fixes for
the same symptom on other stores are in `completed/`:
`2026-09-29-store-embed-may-stay-visible-over-the-epic-panel.md`,
`2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md` and
`2026-10-01-macos-store-embed-stays-hidden-on-every-return-to-a-store-route.md`. Check whether
the Amazon route bypasses the hide path those fixes put in place.

## Solution

1. Reproduce live: open Stores > Amazon, wait for the Luna page, switch to Library, open a game
   page. Capture the `[WebView]` route lines. Find what re-fires the `/store/amazon` route 100+
   times, and check whether the exit refresh's `skipped-in-flight` arm also skips the hide.
2. Fix, so that leaving the Stores tab always hides the embed, whatever the Amazon exit refresh is
   doing.
3. Live gate: the embed is gone from the game page after leaving Stores, and still gone after a
   Play and after a relaunch. Test with frameless titlebar both OFF and ON.
