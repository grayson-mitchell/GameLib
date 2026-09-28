---
created: 2026-09-28T00:00:00.000Z
title: "humble_login_clear_cookies' window-based branch (existing_window.is_some()) still scopes removal to WKWebsiteDataTypeCookies only — identical gap to the one just fixed for the default-store branch"
area: auth/webview
severity: medium
platform: macos
ready: code
source: "debug/epic-cold-jar-login-timeout, 2026-09-28 — found while confirming the fix's scope; deliberately left unfixed this pass (see rationale below), filed here so it is not lost"
files:
  - src-tauri/src/main.rs
---

## Problem

`.planning/debug/resolved/epic-cold-jar-login-timeout.md` fixed a defect where
`clear_default_data_store_cookies_for_domain` (`src-tauri/src/main.rs:4184`, the
`existing_window.is_none()` fallback branch of the shared `humble_login_clear_cookies` arm,
confirmed exercised by the real failing Epic cold-jar run) scoped its native WebKit removal call
to `WKWebsiteDataTypeCookies` only, leaving any HTTP disk-cache/memory-cache entry for the
domain untouched — allowing a stale, previously-authenticated page load to be replayed after a
cookie-only clear.

An **identical** construction exists at `src-tauri/src/main.rs:7443-7446` (current line numbers,
inside the `existing_window.is_some()` window-based branch of the *same* `humble_login_clear_cookies`
arm — the path taken when a caller passes a real window handle, e.g. Humble's `disconnect()` or a
non-macOS Epic path). Its own doc comment (`:7432-7439`) makes the same now-corrected claim the
default-store branch's comment used to make: that `removeDataOfTypes` need only cover cookies
because "Plans 15/16's separate origin-scoped storage clear owns those other categories" — which
is true for the JS-observable Cache Storage API but NOT for WebKit's native HTTP disk/memory
cache (no JS API exists for it). The same collision that caused the Epic cold-jar hang could, in
principle, recur for any caller of this window-based branch.

## Why this was left unfixed in the epic-cold-jar-login-timeout session

- The default-store branch (`clear_default_data_store_cookies_for_domain`) is the ONLY path
  confirmed exercised by the real failing run (macOS resolves `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`
  to `None` for Epic's cookie clear, taking the `existing_window.is_none()` fallback).
- The window-based branch is used by *other* callers (at minimum Humble's `disconnect()`, possibly
  other non-macOS-gated Epic paths) whose behavior under this gap has not been measured — widening
  the fix there without a fresh measurement would be scope creep past what that session's evidence
  supports.
- Minimal-fix discipline: fix the confirmed-exercised site, file the twin as a separate, explicitly
  scoped follow-up rather than either silently ignoring it or bundling an unverified change into
  the Epic fix's commit.

## Suggested fix

Mirror the fix already applied at `clear_default_data_store_cookies_for_domain`: widen the
`cookies_type_set` at `main.rs:7443-7446` to also include `WKWebsiteDataTypeDiskCache` and
`WKWebsiteDataTypeMemoryCache`, correct the doc comment at `:7432-7439` to explain the same
terminology collision (JS-observable Cache Storage API vs. WebKit's native HTTP disk/memory
cache), and add an analogous structural regression test (source-scan pattern, see
`epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache` in
`src-tauri/src/main.rs`'s `#[cfg(test)] mod tests` for the template) scoped to this second
function/branch.

Before shipping, confirm which real callers reach this branch (Humble `disconnect()` at minimum)
and consider whether they have any legitimate reason to rely on the cache surviving a cookie
clear — none is currently known, but this branch's callers were not audited as part of the
Epic session.

## Expected / Result

expected: `humble_login_clear_cookies`'s window-based branch evicts the HTTP disk/memory cache
for a domain's matching records, the same as the now-fixed default-store branch, closing the
identical stale-cache-replay gap for any caller that reaches this branch.
result: pending
