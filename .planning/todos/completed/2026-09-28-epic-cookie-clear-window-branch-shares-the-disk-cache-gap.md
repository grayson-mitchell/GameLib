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
result: pass — closed by quick task 260928-qvr (2026-09-28). The window-based branch's
`cookies_type_set` now includes `WKWebsiteDataTypeDiskCache` + `WKWebsiteDataTypeMemoryCache`,
still scoped to `matching_records` only (REQ-34.4.1-06 held — no blanket wipe, the
`removeDataOfTypes_forDataRecords_completionHandler` call and record filter untouched). The
misleading doc comment was rewritten to name the terminology collision explicitly: the
JS-observable Cache Storage API (`WKWebsiteDataTypeFetchCache`) IS covered by
`humble_login_clear_storage`'s injected script; WebKit's native HTTP disk/memory cache has no JS
API and was covered by nothing.

**The mandatory caller audit ran and did not halt.** Four `seam.clearCookies` sites, classified by
label binding: Humble's `disconnect()` (`humble/user.ts:1010`) passes a real window label and is
the SOLE caller reaching this branch; GOG (`gog/user.ts:69`), Amazon (`nile/user.ts:69`) and Epic
(`legendary/user.ts:400`, via `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL`) all pass sentinel no-window
labels and take the already-fixed default-store branch on macOS. On non-macOS the branch does not
exist at all (`#[cfg(target_os = "macos")]`). No caller relies on the cache surviving a cookie
clear — a disconnect/logout path wants precisely the opposite.

Commits: `03a343405` (structural pin, observed RED first) and `d45e42d27` (fix + comment +
count-only log). The pin uses an arm-terminator boundary rather than the precedent's `fn`-to-`fn`
one — this site is a match arm — and asserts its scan window excludes the
`clear_default_data_store_cookies_for_domain` declaration, so boundary drift cannot make it
silently re-measure the already-fixed site and pass for the wrong reason. `cargo check` clean;
288 passed / 1 failed / 2 ignored, the single failure
(`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`) proven pre-existing by a recorded
`git stash` A/B AND by the structural fact that neither commit adds any `.cookies()` call site,
which is the only input that test scans.

**One residual, deliberately not fixed here.** The arm's own comment at `main.rs:7185-7188` still
claims "Humble/GOG/Amazon, all still routed through a live Tauri-managed window". That predates
the Phase 40 plan 04 note at `:7200-7205` which moved GOG/Amazon to sentinel labels, so it is
stale and contradicts the audit above. Correcting it was out of this task's scope; it is recorded
here rather than absorbed silently.
