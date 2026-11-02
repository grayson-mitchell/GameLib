---
created: 2026-10-30
title: "Live-verify the Amazon store-exit library refresh (Epic, GOG done in 261030-ts4)"
area: store-embed
files:
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/state/GlobalState.tsx
  - src-tauri/src/macos_epic_embed.rs
  - src-tauri/src/main.rs
severity: minor
platform: macos
ready: blocked
blocked_by: "no unclaimed Amazon Games-delivered Prime title left this month"
revisit_trigger: "the next Prime Gaming batch adds an Amazon Games title - claim it, leave via the Library tab, confirm it shows without a manual Refresh"
---

## Status (2026-11-02, after quick 261102-s32)

**The exit refresh passes live.** On a store entry the log showed
`[amazonStoreExitRefresh] armed host=gaming.amazon.com via=entry` (20:27:17). Leaving via the
Library tab then logged `[refreshLibrary] runner=nile origin=amazon-store-exit` and
`outcome=refreshed` (20:29:36). The nile `library sync` ran **before** `Game list updated, got 2
games`, so F3 (pre-sync publish) is fixed. Before 261102-s32, F3 was confirmed live at 20:10:24:
a manual Refresh published 1 game while the sync wrote 2.

- Host measured: `gaming.amazon.com`. No redirect host was seen.
- **One check remains:** a *new* claim should appear without a manual Refresh. Both
  Amazon-delivered titles were claimed before the fix, so none are left to test with
  (`ready: blocked`). The pieces are each proven (arming, exit refresh, post-sync publish).
  Only the end-to-end run on a fresh claim is missing.

## Status (2026-11-02, first Amazon attempt)

The operator now has Prime, so this is no longer blocked. The check still did not run: no
`[amazonStoreExitRefresh]` line was logged. The store was opened at 19:36:00, and the app
restarted at 19:39:33 without leaving it. nile is signed in but synced 0 games, so nothing
delivered through the Amazon Games app had been claimed. The run surfaced four separate todos:

- `2026-11-02-amazon-store-account-link-popup-never-resolves`
- `2026-11-02-amazon-store-no-back-navigation-after-claim`
- `2026-11-02-amazon-store-some-game-tiles-unclickable`
- `2026-11-02-amazon-store-exit-should-refresh-epic-and-gog`. An Epic-delivered claim reached
  the library only through the next full refresh, not through this row.

To close: claim a title delivered through the **Amazon Games app** (not Epic or GOG), then leave
the store with the back control or a tab (not by quitting the app), and run the checks below.

## Status (2026-10-30, after quick 261030-ts4)

Shipped in 261030-ts4 (`3213dea8a`): Steam's mechanism is now the per-store table in
`src/frontend/screens/WebView/storeExitRefresh.ts`, covering Epic, GOG and Amazon. The live gate
passed for GOG, Epic (macOS raw WKWebView) and the Steam regression.

**What remains is Amazon only.** It was not run: claiming a Prime Gaming game needs a Prime
subscription, so this is parked until the operator has one (`ready: blocked`). Check:

- Claim a free game in `/store/amazon`, leave the store, and confirm
  `[amazonStoreExitRefresh] origin=amazon-store-exit outcome=refreshed` in `gamelib.log`.
- Note the host the embed actually shows (`gaming.amazon.com` or a redirect host). The row arms
  on any `gaming.amazon.com` page; a redirect host is added only after it is measured.
- F3: note whether the title appears from that one refresh, or only after a second Refresh.
  `nile/library.ts` starts `refreshNile()` without awaiting it, so one refresh may publish the
  pre-sync list. If so, file that separately: a manual Refresh behaves the same.

Close this todo when the Amazon check passes. The original text follows for context.

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
  - Use a normal, library-listed license. A Steam demo was the wrong subject because demos are
    never returned by GetOwnedGames, played or not (spike 052); quick 261031-i0q now adds
    licensed demos to Refresh through the licenses path.
