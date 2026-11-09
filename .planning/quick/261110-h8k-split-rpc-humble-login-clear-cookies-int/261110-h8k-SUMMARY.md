---
phase: quick-261110-h8k
plan: 01
subsystem: src-tauri/login_window
tags: [refactor, humble, cookies, source-pins]
requirements: [TODO-2026-11-08-split-rpc-humble-login-clear-cookies-into-named-steps]
key-files:
  modified:
    - src-tauri/src/login_window/humble_cookies.rs
    - src-tauri/src/main.rs
duration: ~30m
completed: 2026-11-10
---

# Quick 261110-h8k: Split rpc_humble_login_clear_cookies into named steps

One-liner: the macOS count, macOS WKWebsiteDataStore removal and Windows WebView2 removal are now named step fns; the handler shrank from 575 to 151 lines and both source pins were repointed in the same commit.

## Commits
- `56d8e4509` refactor: the split, both pin repoints, baseline files (Tasks 1 and 2)
- `4eee62bc0` chore: post-split gate baselines

## Structure
Handler `rpc_humble_login_clear_cookies`: L361-511 (151 lines; was L361-935, 575 lines). Step fns (private, column 0, appended after it):
- `count_window_cookies_matching_macos` (cfg macos) L539-605
- `remove_window_cookies_macos` (cfg macos) L607-802
- `remove_window_cookies_windows` (cfg windows) L804-964

Both `.cookies()` sites (non-macOS `count_matching` closure and the Linux block) stay inline in the handler, so the pin's predicate, walk-back, `expected` vec and `found_split_line_shape` are untouched.

## Comment edits (positional references made false by the move)
1. Moved F-34.4.2-12 comment: "this arm's own removal branch (below)" -> "`remove_window_cookies_macos` (below)".
2. In the count fn: "mirrors this arm's own removal-branch cast, below" -> "mirrors `remove_window_cookies_macos`'s cast, below".
3. Linux block: "see the Windows arm above" -> "`remove_window_cookies_windows`".
Added a two-line comment at the handler's macOS `count_matching` closure naming the new fn. All code, strings, timeouts and order are verbatim (dedented one level).

## Pin changes (main.rs)
- F-34.4.2-12: a `clear_cookies_steps` list maps those three column-0 fns to the `humble_login_clear_cookies` arm; a post-loop assertion fails if any step was not seen (rename/removal). Stale `main.rs:7692/7705` prose now names the Linux block in humble_cookies.rs. `expected`, `guard_excludes_macos`, walk-back unchanged.
- Window-branch pin: scan boundary is now `fn remove_window_cookies_macos(`; added a linkage assertion that the handler calls `remove_window_cookies_macos(` in a non-comment line.

## Verification
- `.cookies()` site measurement (cookie_sites.py): before == after, 4 sites, byte-identical (2 in the handler: `#[cfg(not(target_os = "macos"))]` and `#[cfg(all(not(target_os = "macos"), not(windows)))]`).
- Mutation: an unguarded `let _probe = window.cookies();` as first statement of `remove_window_cookies_macos` made `f_34_4_2_12...` FAIL (reported guard `<none>`, arm `humble_login_clear_cookies`). Reverted (no `_probe` in diff) and the test passed again.
- `cargo test --bin gamelib-shell`: `453 passed; 0 failed; 2 ignored`, same as baseline. Both pins pass.
- Clippy ratchet (1.99.1): green, lint list identical ignoring locations.
- rustfmt `--check` per-file hunks: humble_cookies.rs 9 -> 9, main.rs 22 -> 22 (one extra hunk in new code was hand-fixed). No write-mode rustfmt run.
- Jest Rust-source pin suites (35 files): 959 tests, 1 failing before and after, same test (WR-07 `.title(` string-literal pin; pre-existing, unrelated).
- Prettier omitted per convention (no path written is prettier-handled).
- `graphify update .` run.

## Cross-target checks (could not run)
- `cargo check --bin gamelib-shell --target x86_64-pc-windows-msvc`: BLOCKED before reaching this crate. `ring-0.17.14` C build script failed (`cc --target=x86_64-pc-windows-msvc ... p256-nistz.c`, 1 error).
- `--target x86_64-unknown-linux-gnu`: BLOCKED. `libdbus-sys-0.2.7` build.rs panicked (pkg-config / libdbus-1-dev missing).
So `remove_window_cookies_windows` and the Linux block are unverified locally; the CI windows-latest leg is the authority. macOS native check and tests passed.

## Deviations
None beyond the three comment edits above. No pre-existing issues were fixed (pre-existing `observe_live_url` dead_code warning left alone).

## Human verification required (live-gate)
The todo `.planning/todos/pending/2026-11-08-split-rpc-humble-login-clear-cookies-into-named-steps.md` stays pending (`ready: live-gate`) until both pass. It was not moved or edited.
1. macOS: live Humble disconnect. Passes when `[shell] humble_login_clear_cookies: window branch evicting cookies ...` fires and the disconnect returns a nonzero verified count with no main-thread wedge. Also confirm Epic, GOG and Amazon logout still take the default-store fallback (the `default-store evicting` line).
2. Windows: live Humble disconnect. Passes when `before=N after=0 settle_rereads=K` appears and, when partitioned cookies exist, the `CDP cleanup issued=` line.

## Known Stubs
None.

## Self-Check: PASSED
Commits 56d8e4509 and 4eee62bc0 exist; step fns present at column 0; baseline files present.
