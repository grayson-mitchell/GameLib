---
created: 2026-11-08T00:00:00.000Z
title: 'Split rpc_humble_login_clear_cookies into named steps'
area: shell
severity: minor
platform: any
ready: live-gate
---

Phase 71 D-06 extracts `rpc_humble_login_clear_cookies` whole, so its body moved verbatim from the
`dispatch_rust_channel` arm into `src-tauri/src/login_window/humble_cookies.rs`. It is a single
573-line function carrying two platform branches (the macOS WKWebsiteDataStore removal and the
non-macOS wry/WebView2 path) and the Epic cold-jar window branch.

A split into named steps would change control flow on the logout path, so it needs a live
disconnect on macOS and Windows before it can land. Two source pins read this handler by its `fn`
line and closing brace: `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` (exact
`(handler, guard)` site set) and `epic_cold_jar_login_timeout_window_branch_*`. A split has to
repoint both in the same commit and re-derive the site set from a fresh measurement, never widen it.
