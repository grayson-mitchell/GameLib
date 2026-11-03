---
created: 2026-11-02
title: "Amazon store: no back navigation after opening a claim page"
area: store-embed
status: "RESOLVED 2026-11-03. Quick tasks 261102-sk8 (record same-document navigations) and 261102-szs (3s landing settle window so luna.amazon.com URL rewrites replace instead of push). Live-verified by the operator 2026-11-03: Back from a claim returns to the grid and disables, Forward works, Steam and GOG unchanged."
files:
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/storeExitRefresh.ts
severity: medium
platform: any
ready: live-gate
---

## Problem

Seen live on 2026-11-02 in `/store/amazon`: after opening a claim, there was no way back. The
embed's back control stayed unavailable, so the only way out of the claim view was to leave the
store.

## Likely cause (not measured)

The embed's history stack is pushed from the `on_page_load` Finished event (`main.rs`, the
`store_embed_*` history code near `store_embed_nav_state_json`, line 6484), and `canGoBack` is a
field pushed from that Rust stack (`useStoreEmbedHost.ts`, D-22). `gaming.amazon.com` is a
single-page app. Opening a claim most likely changes the view with `history.pushState` and
loads no page, so nothing is pushed and `canGoBack` stays false. Steam, GOG and Epic do full
page loads for product pages, which would explain why only Amazon shows it.

## To do

- Confirm it: log nav events while opening a claim and check whether any page-load fires.
- If it is pushState, have the embed report same-document navigations (an injected
  `pushState`/`popstate` hook, or the platform webview's same-document navigation callback), and
  back them with the webview's own `history.back()` rather than the Rust stack alone.

## Verify

Live: open a claim in `/store/amazon` and step back to the grid with the embed's back control.
Check Steam, GOG and Epic back navigation still works.

## Resolution (2026-11-03)

Confirmed as pushState: opening a claim fired no page load. The store now runs on
`luna.amazon.com`, not `gaming.amazon.com`.

- `261102-sk8`: the nav-event drain reads the webview's live URL and records same-origin
  same-document changes in the Rust history stack (push, in-place replace for the same path, or a
  cursor move onto an adjacent entry).
- `261102-szs`: the first live retest looped (Back reloaded the same page indefinitely), because
  luna rewrites its URL just after each landing and the rewrite was recorded as a new step. For
  `STORE_EMBED_LANDING_SETTLE` (3s) after a back/forward/reload/navigate lands, a URL change
  replaces the current entry, and adjacent duplicates collapse. `luna.amazon.com` was also added
  to `AMAZON_HOSTS` for the store-exit refresh.

Live retest 2026-11-03: pass on all three checks (Amazon Back/Forward, Steam, GOG).
