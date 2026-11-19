---
created: 2026-11-18T00:00:00.000Z
title: Store embed first load that fails while online leaves a blank embed with no notice
area: ui
severity: minor
platform: any
ready: code
files:
  - src-tauri/src/store_embed/open.rs
  - src/backend/sidecar/storeEmbedFlowRegistration.ts
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
---

## Problem

Follow-up filed by Phase 47 plan 14 (gap G-47-9). That plan closed the offline Stores crash and added an
offline notice row driven by the app's connectivity status (`uiState.connectivity`). A first load that
fails while the app is ONLINE (one host's DNS or TLS failing, a captive portal, a blocked host) still
leaves a blank Tauri store embed with no explanation. It no longer crashes, and keeps the existing
Reload / Open in browser chrome, but nothing tells the user the page did not load.

## Why it is not already fixed

wry 0.55.1's navigation delegate implements no load-failure callback (`WryNavigationDelegate` maps
Started to didCommitNavigation and Finished to didFinishNavigation only), so a failed first navigation
produces neither a Started nor a Finished event. A generic failed-load signal needs a new field in the
store-embed nav-event wire shape, and `coerceNavState` in
`src/backend/sidecar/storeEmbedFlowRegistration.ts` rejects extra fields for non-Epic surfaces today.

## Direction

Derive a load-timeout signal on the Rust side (a store open that sees no Finished within a bound), carry
it through `coerceNavState` for the non-Epic surfaces as a new optional field, and show it in the
existing `StoreEmbedTimeoutBanner` row in the renderer. The Epic surface already has the timed-out
variant of that row and its own Rust-side monitor to copy the shape from.

Links: G-47-9 (`47-UAT.md`), plan `47-14`, `.planning/debug/offline-stores-tab-crash.md`.

## Closed 2026-11-20 (quick 261120-8i5)

- Rust: the Tauri store embed now has a load clock (`STORE_EMBED_LOAD_TIMEOUT`, 20 s). It is armed by
  `store_embed_open` (cold and warm), `navigate`, `back` and `forward`, never by `reload`, and it is
  evaluated in the existing `store_embed_take_nav_events` drain (DD-1: no thread, no timer). One raise
  per armed load puts a `loadTimedOut: true` event, carrying the URL that did not load, last in its
  batch. Any later Finished, suppressed or not, queues the clear.
- Wire: `coerceNavState` accepts `loadTimedOut` on non-Epic events as an optional boolean (kept when
  present, absent when omitted, a non-boolean throws). The Epic contract is unchanged.
- Renderer: `StoreEmbedTimeoutBanner` shows "This page hasn't finished loading" with Reload and Open in
  browser off the Epic surface. Reload navigates to the URL that did not load, because a WKWebView
  reload of a never-committed page does nothing. The offline row still wins, so there is never a
  second notice. The in-batch sticky latch is now Epic-only (property 46 intact; latest event wins on
  the Tauri embed).
- Catalogues: `webview.storeEmbed.timeout.message` translated in all 49 `gamelib.json` and listed in
  the 48 `gamelib.mt.json` manifests; the presence baseline is unchanged.
- Tests: 9 Rust (`store_embed_load_timeout_*`), Backend `storeEmbedFlows` 79 -> 82, Frontend
  (banner, host, contract) 113 -> 120.
- Owed live check (macOS, not gating): restart `pnpm tauri:dev` after `pnpm build:sidecar`; online,
  block one store host in /etc/hosts and open that store tab (row within about 20 s); remove the block
  and press Reload (page loads, row clears); go offline briefly and confirm only the offline row shows.
