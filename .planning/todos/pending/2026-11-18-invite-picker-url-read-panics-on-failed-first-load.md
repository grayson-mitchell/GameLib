---
created: 2026-11-18T00:00:00.000Z
title: Bridge invite-picker reads existing.url() and panics if its first load failed
area: ui
severity: minor
platform: macos
ready: code
files:
  - src-tauri/src/login_window/invite_picker.rs
---

## Problem

Latent same-class site found by the G-47-9 debug session (`.planning/debug/offline-stores-tab-crash.md`),
left unfixed by Phase 47 plan 14. `src-tauri/src/login_window/invite_picker.rs:129-135` calls
`existing.url()` on the bridge invite-picker `WebviewWindow` to build the target URL. On macOS, wry 0.55.1
`url_from_webview` unwraps `WKWebView.URL` on the main thread, and that is nil when the window's first
navigation failed (for example the dev server is down). The shell then panics the same way the store
embed did, and `.and_then`/`.map_err` cannot catch it.

## Direction

Build the target URL without reading the live one: join the path against the URL the window was created
with (kept in the open call, or recomputed from the same config), instead of asking the webview. Then add
a regression test the way plan 47-14 did for the store embed (inject the URL source so a test can prove it
is never asked).

Links: G-47-9, plan `47-14`.
