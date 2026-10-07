---
created: 2026-10-05T00:00:00.000Z
title: "Set a restrictive CSP on the Tauri webview (csp: null with withGlobalTauri: true)"
area: security
severity: minor
platform: any
ready: live-gate
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05 (split from 2026-10-05-security-hardening-minors-from-trust-boundary-review, item 3)"
files:
  - src-tauri/tauri.conf.json
---

## Problem

`src-tauri/tauri.conf.json` has `"csp": null` with `"withGlobalTauri": true`. Any XSS in the main
renderer reaches `sidecar_invoke`, which has no Rust-side channel allow-list. No live XSS sink was
found (MessageBoxModal decodes via textarea, GameChangeLog uses sanitize-html), so this is defence
in depth only.

## Why this is live-gate, not code

A CSP set blind can break the renderer (inline styles/scripts, `asset:`/`ipc:` URLs, remote
artwork and CDN images), the store/login embeds, and the Vite dev server (HMR websocket,
`http://localhost`). None of that is observable from jest or `cargo check`; it needs the app run
with the policy applied, ideally on each OS's webview (WebKit on macOS, WebKitGTK, WebView2).

## Suggested fix

Start from a report-only style audit in a live run: list every origin the renderer actually loads
(images, fonts, connect targets), then set `app.security.csp` (and `devCsp` for the dev server) to
that set, with `default-src 'self'` and no `unsafe-eval`. Verify the library, store embeds, login
windows and dev server all still work.
