---
phase: 71-rust-shell-module-decomposition
plan: 06
subsystem: infra
tags: [rust, tauri, dispatcher, wave-1, source-text-tests, login-window]
requires: [71-05]
provides:
  - login_window/humble_open.rs (open, close, take_events)
  - login_window/humble_cookies.rs (cookies, cookies_for_domain, clear_cookies)
  - login_window/humble_reveal.rs (reveal_post, clear_storage)
  - rpc_fn_name tracker in main.rs tests
affects: [71-07, 71-09]
key-files:
  created:
    - src-tauri/src/login_window/humble_open.rs
    - src-tauri/src/login_window/humble_cookies.rs
    - src-tauri/src/login_window/humble_reveal.rs
    - .planning/todos/pending/2026-11-08-split-rpc-humble-login-open-into-named-steps.md
    - .planning/todos/pending/2026-11-08-split-rpc-humble-login-clear-cookies-into-named-steps.md
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/login_window.rs
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/loginChromeCssInjection.test.ts
key-decisions:
  - "Handlers extracted mechanically (verbatim bodies dedented 8, leading comment block moved above the fn); the compiler needed no visibility changes"
  - "The five extractHumbleLoginOpenArmBody copies became one module-level humbleLoginOpenHandlerBody wrapper over readHandlerBody"
requirements-completed: [D-04, D-05, D-06, D-07, D-10, D-12, D-15]
duration: 40min
completed: 2026-11-08
---

# Phase 71 Plan 06: Wave 1 part 3 - Humble login, cookie and reveal handlers Summary

All eight Humble dispatcher arms are now one-line `rpc_humble_*` calls; the 1,653 lines of bodies live verbatim in three `login_window` children, and every jest and Rust pin over them reads the handler.

## Accomplishments
- Layer 2 progression: 28, 31, then 33 matched + 2 router-direct, 0 MISMATCH. cargo 445 passed each time, clippy ratchet PASS, `permove.sh wave-1-start 1` green before each commit.
- `rpc_humble_login_open` (641 body lines) and `rpc_humble_login_clear_cookies` (573) are each one function (D-06), with one todo each (`ready: live-gate`).
- No item was made pub(crate) beyond the handlers themselves; the `mod x; pub(crate) use x::*;` plus `use super::*;` layout compiled unchanged. main.rs has no production changes at all; its edits are test-module only (SHELL lists, `rpc_fn_name` tracker). The `mod`/`use` lines are in login_window.rs (D-15).
- Jest: five `extractHumbleLoginOpenArmBody` definitions removed from tauriShellSource.test.ts (one `humbleLoginOpenHandlerBody` wrapper over `readHandlerBody`); loginChromeCssInjection.test.ts uses the same call; `extractArmBody` removed; the census extractor and the cookie direction pins use `readHandlerBody`; the hidden-window (reveal/clear-storage) pin reads both handler bodies. Synthetic RED-proof sources were rewritten in fn form; needles unchanged. The census mutation guard text was dedented by 8 spaces (handler body indent).
- Rust: `dispatch_arm_opener_name` replaced by `rpc_fn_name`; `f_34_4_2_12_wry_blocking_cookies_calls_are_macos_gated` tracks the current handler via a column-0 `fn`/`pub(crate) fn` boundary and its backward guard walk stops at the same boundaries. `epic_cold_jar_login_timeout_window_branch_*` starts at the `concat!("fn rpc_humble_login", "_clear_cookies(")` line and ends at the next line exactly `}`. Both pass; the blind-to-the-other-site assertion is kept.
- found_sites before and after (asserted by exact equality in the test, which passed both times): `(humble_login_cookies, not(macos))`, `(humble_login_cookies_for_domain, not(macos))`, `(humble_login_clear_cookies, not(macos))`, `(humble_login_clear_cookies, all(not(macos), not(windows)))`. Identical.
- HumbleLoginOpen extracted body: new handler body = 641 interior lines, equal to the old arm interior. The old test slice ran from the `=> {` line to the next arm's opener, so it additionally included the arm's closing `}` and the leading comment block of the HumbleLoginCookies arm (about 7 lines); the new body excludes those and the `fn` line. Assertions are on content inside the visible block, so no needle changed.
- jestpins on loginChromeCssInjection + tauriShellSource: only the known WR-07 failure. `pnpm planning-gates` 12/12; prettier and eslint clean on the edited test files.

## Task Commits
1. f25afa977 humble_open.rs (open, close, take_events) + Open pins
2. cd9e837cf todo: split rpc_humble_login_open
3. 44882f095 humble_cookies.rs + cookie census pins + Rust fn tracker
4. 15bc89238 humble_reveal.rs (reveal_post, clear_storage) + hidden-window pin
5. todo commit: split rpc_humble_login_clear_cookies

## Deviations from Plan
- Interim step: in commit 3 the hidden-window pin's end marker was relaxed to `HumbleLoginCookiesForDomain =>` (the arm was already one-line) so every commit stays green; commit 4 replaced it with `readHandlerBody`.
- The TakeEvents "body pin" in the plan is only an end marker for the HumbleLoginCookies slice; it disappeared when that pin moved to `readHandlerBody`.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
