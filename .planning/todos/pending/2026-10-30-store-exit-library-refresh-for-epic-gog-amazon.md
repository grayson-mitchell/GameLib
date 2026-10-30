---
created: 2026-10-30
title: "Refresh the library when leaving the in-app Epic, GOG and Amazon stores after a purchase, as Steam now does"
area: store-embed
files:
  - src/frontend/screens/WebView/steamStoreExitRefresh.ts
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src-tauri/src/macos_epic_embed.rs
  - src-tauri/src/main.rs
severity: medium
platform: macos
ready: live-gate
---

## Problem

Quick 261030-qqh fixed this for Steam only. A game bought in the in-app Steam store now appears
when the user leaves the store. The commits are `4be6400bd`, `e34ad8668` and `e598f12da`.

The other three in-app stores still have the original defect. They are `/store/epic`,
`/store/gog` and `/store/amazon`, defined in the `urls` map in
`src/frontend/screens/WebView/index.tsx`. A purchase or claim there doesn't show in the library
until the user presses Refresh. The workaround works, so the blast radius is bounded.

## Proposed shape

Generalise the Steam mechanism rather than copying it. Turn `steamStoreExitRefresh.ts` into a
store-agnostic module driven by a per-store table. Each row needs three things:

1. **Purchase-intent URL patterns.** These arm the trigger. They must be https, use exact hosts,
   and follow the same anti-spoofing shape `isSteamPurchaseIntentUrl` and its tests already pin.
   Measure each one in the live embed first, and do not guess. The Steam lesson: a free grant
   loaded no page at all (the `Checkout.AddFreeLicense#1` XHR), so a receipt-URL trigger would
   have missed it. Arming on product, cart and checkout pages, then refreshing on exit, is what
   worked.
   - Candidates to check, not facts: GOG game, cart and checkout pages on `www.gog.com`; Epic
     product pages (`store.epicgames.com/.../p/...`) and its purchase flow; Amazon claim pages
     on `gaming.amazon.com`.
2. **Refresh scope.** Use `refreshLibrary({ library: <runner>, origin: '<store>-store-exit' })`,
   the same scoped path. Since `e598f12da`, a scoped refresh spins the Refresh button, so there's
   no extra spinner.
   - Check each runner's refresh for an origin allowlist like Steam's `ORIGIN_TO_TRIGGER` in
     `authTrigger.ts`. Without one entry there, the Steam refresh was silently deferred to the
     cached library.
3. **Sign-in gate.** Use `collectSignInInputs`/`resolveSignInState` for that runner, so the
   trigger does nothing when signed out or expired, and never prompts for sign-in.

Keep the Steam behaviour unchanged. Its existing tests must pass unmodified, apart from moving
them into the generalised module. Keep the in-flight guard. Do not reintroduce a time throttle:
it swallowed the one exit that mattered in the Steam live test.

## Known complications

- **Epic on macOS is not the shared embed.** It is a raw `WKWebView` subview
  (`src-tauri/src/macos_epic_embed.rs`, Phase 50). Tauri's managed child webview is
  Cloudflare-challenged every time (spike 024). On other platforms Epic's in-app store is scoped
  out entirely (`index.tsx`, the `store === 'epic' && platform !== 'darwin'` guard).
  - First, check whether that raw view feeds the same nav-event drain that
    `useStoreEmbedHost.ts` reads. If it doesn't, Epic needs its own page-load hook, or a plain
    refresh-on-leave without URL arming.
- **Amazon:** a Prime Gaming claim is the closest thing to a purchase. Confirm that a claimed
  title actually reaches the library through nile's entitlement sync before relying on it.
- **Cost:** Steam's refresh needs an authenticated CM logon, which is why that trigger is
  careful. The Epic (legendary), GOG and Amazon (nile) refreshes are believed to be ordinary API
  calls on stored tokens. Unverified; confirm it per runner.
- **Humble** has no in-app store embed, so it is out of scope.

## Verify

- Unit: per-store URL arming (accepts and rejects), sign-in gating, the in-flight guard, and
  Steam unchanged.
- Live, on this Mac, for each store: claim or buy a free item in the embed, leave the store, and
  check that the game appears without a manual Refresh and the log shows the store's `-store-exit`
  origin.
  - Use a normal, library-listed license. A Steam demo was the wrong subject: free-on-demand
    licenses are excluded from the owned-games fetch until played.
