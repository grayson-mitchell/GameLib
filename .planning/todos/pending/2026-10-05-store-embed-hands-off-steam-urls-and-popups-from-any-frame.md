---
created: 2026-10-05T00:00:00.000Z
title: "Store embed opens steam:// URLs and http(s) popups in the system without a gesture, from any frame including ad iframes"
area: security
severity: medium
platform: any
ready: code
found_by: "Security review of the webview / sidecar / Rust trust boundary, 2026-10-05"
files:
  - src-tauri/src/main.rs:5885-5910
  - src-tauri/src/main.rs:5994-6010
  - src-tauri/src/main.rs:6015-6028
---

## Problem

`on_navigation` hands any `steam:` navigation to `open_external` with no user gesture; it fires for
subframes too (the comment at `:5895` says so) and navigation to any http(s) origin is allowed.
`on_new_window` opens any http(s) popup in the system browser without a prompt.

## Failure scenario

An ad iframe or linked third-party page inside the embed fires `steam://install/...` or
`steam://run/...`, or spams system-browser popups.

## Suggested fix

Only hand off main-frame `steam:` navigations, ideally behind a confirm; rate-limit or require a
gesture for popup handoff.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). Not independently re-checked by the orchestrating session — confirm the mechanism before fixing. Line numbers are as of `5927806` on `main`.
