---
phase: 260928-qvr
plan: 01
subsystem: auth/webview
tags: [macos, webkit, cookies, epic-login, humble, security]
dependency-graph:
  requires: [9359883c7]
  provides: [humble_login_clear_cookies-window-branch-disk-memory-cache-eviction]
  affects: [src-tauri/src/main.rs]
tech-stack:
  added: []
  patterns:
    - "Mirror an already-shipped fix's shape exactly (widen NSSet::from_slice, correct doc comment, add count-only log line) rather than inventing a new one."
    - "Arm-scoped structural regression pin using the arm-terminator matcher (`starts_with('\"')` + `ends_with(\"\\\" => {\")`) instead of a top-level `fn`-to-`fn` boundary, for match-arm-shaped code."
key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
decisions:
  - "Task 1 audit confirmed (not assumed) that Humble's disconnect() is the sole caller reaching the window-based branch; GOG/Amazon/Epic all resolve to sentinel no-window labels that take the already-fixed default-store branch instead."
  - "No HALT: no caller reaching the branch has any reason to rely on the HTTP disk/memory cache surviving a cookie clear (a disconnect/logout path wants the opposite)."
metrics:
  duration: "~45m"
  completed: 2026-09-28
status: complete
actuals:
  tokens: 3818
  tasks: 3
  commits: 2
  plan_head_before: fd7157534
---

# Phase 260928-qvr Plan 01: Widen Humble login-clear-cookies window branch Summary

Widened `humble_login_clear_cookies`'s window-based branch to evict WebKit's native HTTP
disk/memory cache alongside cookies, closing the twin of the gap fixed for the default-store
branch in commit `9359883c7` — scoped to `matching_records` only, confirmed by a structural
regression pin observed RED before the fix and GREEN after.

## Task 1 Audit: Caller census for the window-based branch

Enumerated every `seam.clearCookies` call site from source (not from the arm's own stale comment
at `main.rs:7185-7188`, which predates the Phase 40 plan 04 note that moved GOG/Amazon onto
sentinel labels):

| Caller | File:Line | Label binding | Branch reached (macOS) | Reliance on cache surviving? |
|---|---|---|---|---|
| Humble `disconnect()` | `src/backend/humble/user.ts:1010` | `await seam.open(HUMBLE_BASE_URL, {visible:false,...})` — a real Tauri-managed window label | **Window-based branch** (`existing_window.is_some()`) — domain `humblebundle.com` matches neither `epic_cookie_domain_matches` nor `store_logout_cookie_domain_matches`, so the macOS fallback at `:7206-7212` never intercepts it | No. A disconnect/logout path wants a genuinely fresh next login, the opposite of cache survival. |
| GOG logout | `src/backend/storeManagers/gog/user.ts:69` | `GOG_COOKIE_CLEAR_NO_WINDOW_LABEL` — sentinel, never registers a real window | Default-store branch (already fixed, `9359883c7`) — `existing_window.is_none()` is true and `store_logout_cookie_domain_matches(domain)` is true for GOG's apex (Phase 40 plan 04) | N/A — does not reach the window-based branch at all. |
| Amazon logout | `src/backend/storeManagers/nile/user.ts:69` | `AMAZON_COOKIE_CLEAR_NO_WINDOW_LABEL` — sentinel | Default-store branch (already fixed) — same guard, Amazon's apex is also in `STORE_LOGOUT_COOKIE_DOMAINS` | N/A — does not reach the window-based branch at all. |
| Epic (`clearEpicCookies`) | `src/backend/storeManagers/legendary/user.ts:400` (label bound at `:290-291`) | macOS: `EPIC_COOKIE_CLEAR_NO_WINDOW_LABEL` (sentinel). Non-macOS: `await seam.open(...)`, a real window. | macOS: default-store branch (already fixed) — `existing_window.is_none()` and `epic_cookie_domain_matches(domain)` are both true for every `EPIC_COOKIE_HOSTS` entry. Non-macOS: the window-based branch code under discussion (`main.rs:7341-7495`) is entirely inside `#[cfg(target_os = "macos")]` and does not exist on that platform at all — a separate, unaudited implementation (`#[cfg(windows)]` at `:7497`, or the remaining non-Windows-non-macOS path) handles it instead. | N/A on both platforms — never reaches the code this plan widened. |

**Verdict: no caller reaching the window-based branch relies on the HTTP disk/memory cache
surviving a cookie clear.** Humble's `disconnect()` is the sole confirmed caller; it is a
logout path with no reason to want cache survival. No HALT — proceeded to Task 2.

## Task 2: Regression pin, observed RED

Added `epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache`
(`src-tauri/src/main.rs`, `mod tests`), mirroring
`epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache`'s shape but scoped
to the `humble_login_clear_cookies` match arm via the arm-boundary matcher
`f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` already proves works on this file
(`trim().starts_with('"') && trim().ends_with("\" => {")`), rather than a top-level `fn`-to-`fn`
boundary. Asserts the scan window does NOT contain the `clear_default_data_store_cookies_for_domain`
declaration, so a future boundary drift cannot let it silently re-measure the already-fixed site.

Observed RED against the un-widened code (committed on its own in `03a343405`):

```
thread 'tests::epic_cold_jar_login_timeout_window_branch_clear_evicts_disk_and_memory_cache' panicked at src/main.rs:14632:9:
260928-qvr regression: `humble_login_clear_cookies`'s window-based branch no longer references `WKWebsiteDataTypeDiskCache` in a non-comment line -- ...
```

`cargo check --bin gamelib-shell` was clean.

## Task 3: Widened the type-set, corrected the doc comment, verified GREEN

Mirrored `git show 9359883c7`'s default-store change applied to the window-based branch at
`main.rs:7432-7446` (pre-edit line numbers): added `disk_cache_type`
(`WKWebsiteDataTypeDiskCache`) and `memory_cache_type` (`WKWebsiteDataTypeMemoryCache`) bindings
alongside the existing `cookies_type`, built `cookies_type_set` from all three in one
`NSSet::from_slice`, extended the SAFETY comment to name all three statics, added a
`matched_record_count` binding and a count-only `eprintln!` before the removal call (mirroring
the default-store branch's own log line — never a record display name or cookie value,
T-34.4.1-39/-75/-91). The `removeDataOfTypes_forDataRecords_completionHandler` call, the
`matching_records` filter, and `records_array` construction were left untouched — eviction stays
scoped to domain-matched records only.

Rewrote the doc comment at `:7432-7439` to state plainly that the JS-observable Cache Storage API
(`WKWebsiteDataTypeFetchCache`) is covered by `humble_login_clear_storage`'s injected script,
while WebKit's native HTTP disk/memory cache is not (no JS API exists for it) — the terminology
collision that caused the original Epic cold-jar defect — citing the debug session and this
branch's sole confirmed caller (Humble's `disconnect()`).

**Verification:**

- `cargo check --bin gamelib-shell`: clean.
- `cargo test --bin gamelib-shell epic_cold_jar_login_timeout`: `test result: ok. 2 passed` —
  Task 2's pin flipped RED→GREEN unmodified; the default-store branch's own pin stays GREEN.
- `cargo test --bin gamelib-shell` (full suite): `test result: FAILED. 288 passed; 1 failed; 2
  ignored` — the one failure is `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated`.
- **A/B confirmation (not assumed):** `git stash` (removing Task 3's uncommitted widening,
  leaving Task 2's committed RED-pin-only state), re-ran
  `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` alone — identical failure: same panic
  location (`src/main.rs:14319`... `.cookies()` call at `main.rs:7669`), same
  `left: Some("#[cfg(all(not(target_os = \"macos\"), not(windows)))]")` /
  `right: Some("#[cfg(not(target_os = \"macos\"))]")` mismatch as the pre-existing baseline
  measured before any edit in this plan (287 passed; 1 failed; 2 ignored). `git stash pop`
  restored Task 3's widening; re-ran the full suite and `cargo check` — same 288/1/2 result.
  Confirmed pre-existing and unrelated to this change.
- Formatter (per CLAUDE.md): `npx prettier --file-info src-tauri/src/main.rs` →
  `{ "ignored": false, "inferredParser": null }` — prettier does not ignore the path but has no
  Rust parser, so `--check` is not applicable and was deliberately NOT run. `COVERAGE.md` sits
  under prettier-ignored `.planning/`, so a check there would be vacuous for a different reason
  and was also deliberately NOT run.
- `cargo fmt --check` is not configured anywhere in this project's routine (no hit in
  `.github/`, `package.json`, `meta/`, or `.husky/` for `cargo fmt`) — stating that rather than
  inventing a gate.
- `graphify update .` was run after the source change (its output tree is gitignored, nothing to
  stage).

## COVERAGE.md

Written at `.planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/COVERAGE.md` with
the reasoned `No external API integration:` declaration — the `api-coverage` detector fired only
on the noun "api" inside the phrase "Cache Storage API" in the source todo's prose, which is
WebKit terminology this change disambiguates, not an integration point. No new dependency, SDK,
or external service is introduced.

## Deviations from Plan

None — plan executed exactly as written. Task 1's audit confirmed rather than refuted the plan's
pre-derived conclusion (Humble is the sole caller reaching the branch); no HALT was needed.

## Known Stubs

None.

## Threat Flags

None — this change closes an existing information-disclosure gap (T-260928-qvr-01) rather than
introducing new surface. All five threats in the plan's threat register were mitigated as
designed: eviction stays scoped to `matching_records` (T-260928-qvr-02), the log line is
count-only (T-260928-qvr-03), the regression pin guards against silent re-narrowing
(T-260928-qvr-04), and Task 1's audit closed the elevation-of-privilege risk of breaking a
cache-reliant caller (T-260928-qvr-05) before any code was widened.

## Self-Check: PASSED

- `src-tauri/src/main.rs` — FOUND, contains both the new test and the widened type-set (verified
  via `cargo test` output above).
- Commit `03a343405` (Task 2, RED pin) — FOUND in `git log --oneline`.
- Commit `d45e42d27` (Task 3, widening) — FOUND in `git log --oneline`.
- `.planning/quick/260928-qvr-widen-humble-login-clear-cookies-window-/COVERAGE.md` — FOUND on
  disk (not committed by the executor; docs commit is the orchestrator's responsibility).
