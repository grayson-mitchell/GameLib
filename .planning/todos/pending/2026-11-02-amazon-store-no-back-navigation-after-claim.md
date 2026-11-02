---
created: 2026-11-02
title: "Amazon store: no back navigation after opening a claim page"
area: store-embed
files:
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src/frontend/screens/WebView/index.tsx
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
