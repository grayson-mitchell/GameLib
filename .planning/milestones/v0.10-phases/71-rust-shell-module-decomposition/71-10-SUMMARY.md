---
phase: 71-rust-shell-module-decomposition
plan: 10
subsystem: infra
tags: [rust, tauri, wave-2, login_window, macos, refactor]
requires: [71-09]
provides:
  - login_window children pristine_epic.rs, sheet.rs, macos_cookies.rs (all macOS-cfg)
  - login_window.rs reduced to a 231-line parent
affects: [71-11]
key-files:
  created:
    - src-tauri/src/login_window/pristine_epic.rs
    - src-tauri/src/login_window/sheet.rs
    - src-tauri/src/login_window/macos_cookies.rs
    - .planning/todos/pending/2026-11-08-move-keyring-helpers-from-login-window-to-keyring-dispatch.md
  modified:
    - src-tauri/src/login_window.rs
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
requirements-completed: [D-03, D-10, D-12, D-13, D-15]
duration: 50min
completed: 2026-11-08
---

# Phase 71 Plan 10: login_window macOS clusters Summary

The three macOS-only clusters left `login_window.rs` (2,230 -> 231 lines), each as its own `permove.sh wave-2-start 2` green commit (cargo 445 passed, clippy ratchet PASS, moveproof Layer 1 and Layer 3 clean). `login_window/` now holds exactly the ten planned children.

## Item assignment
| Destination | Items |
| --- | --- |
| pristine_epic.rs (637 lines) | the pristine-Epic section comment, its objc2 imports, EpicPristineNavDelegateIvars/define_class!/impl, present_native_js_{alert,confirm,prompt}, `open_pristine_epic_login_window` (now `pub(crate)`) |
| sheet.rs (958) | request_login_sheet_cancel, NATIVE_LOGIN_BAR_HEIGHT, login_window_ns_window(_retained), presented/pending sheet state, present_login_window_as_sheet, register_presented_login_sheet, dismiss_login_window_sheet, LoginSheetCancelTarget, native login bar fns (`set_native_login_bar_origin_on_main` now `pub(crate)`), install_native_login_bar, open_pristine_login_sheet |
| macos_cookies.rs (434) | EPIC_COOKIE_DOMAINS, epic_cookie_domain_matches, STORE_LOGOUT_COOKIE_DOMAINS, store_logout_cookie_domain_matches, clear_default_data_store_cookies_for_domain, default_data_store_cookies_for_domain |
| parent (231) | header, label counter, events registry + cap, MAIN_WINDOW_LABEL, KEYRING_* + keyring helpers, EPIC/GOG login host consts, `mod`/`pub(crate) use` block |

Each `mod X;` and `pub(crate) use X::*;` carries `#[cfg(target_os = "macos")]`; every moved item keeps its own cfg. Only two visibility widenings, both required by sibling use: `open_pristine_epic_login_window` and `set_native_login_bar_origin_on_main` (private -> `pub(crate)`).

Sizes (non-test): humble_cookies 935, humble_open 810, sheet 958, pristine_epic 637, macos_cookies 434. All `login_window*` under 1,000; sizes.py exits 0 with only the wave-3/4/main/todo allows.

## Commits
1. a89bb7a26 pristine_epic.rs (+ pin repoints, moveproof allowance)
2. f1e3fdb22 sheet.rs (+ remaining pin repoints)
3. 1d2cb3929 macos_cookies.rs
4. todo commit: keyring helpers -> keyring_dispatch.rs

## Order-sensitive pins (before/after)
Scratch check over the combined comment-stripped source, comparing the old bound (`indexOf('#[cfg(target_os = "macos")]', start)`) against the new brace-bound slice, as a multiset of every `name(` token:

| fn | old lines | new lines | token diff |
| --- | --- | --- | --- |
| open_pristine_epic_login_window | 208 | 206 | none |
| open_pristine_login_sheet | 59 | 57 | none |
| dismiss_login_window_sheet | 49 | 47 | none |
| present_login_window_as_sheet | 92 | 90 | none |
| install_native_login_bar | 122 | 120 | none |
| clear_default_data_store_cookies_for_domain | 142 | 140 | none |
| register_presented_login_sheet | 13 | 11 | none |
| request_login_sheet_cancel | 15 | 9 | `pub(` 2 -> 0 |

The two-line differences are the trailing attribute line and blank. `request_login_sheet_cancel`'s old bound ran into the following `pub(crate) const EPIC_LOGIN_HOST` (neighbour text, two `pub(` tokens); the pin's assertions only needed `dismiss_login_window_sheet(` and were unaffected. 13 jest sites (6 pristine in commit 1, 7 sheet in commit 2) now use a new `fnEndAfter(code, start)` helper that validates the fn via `readTopLevelFnBody` (missing/duplicate/short fails loudly) and ends at the closing column-0 `}`. The 71-02 needle-count pins (`makeKeyAndOrderFront(None)` 0, `register_presented_login_sheet(` 3, `request_login_sheet_cancel(` 2) pass unchanged.

The Rust `epic_cold_jar_login_timeout_default_store_clear_evicts_disk_and_memory_cache` test needed no repoint: `clear_default_data_store_cookies_for_domain` is still followed by a column-0 fn (`default_data_store_cookies_for_domain`) in the same file, so its bound is the same and both epic_cold_jar tests pass (2 passed).

jestpins over the wave-2 suites: 714 passed, 2 failed (the known WR-07 and C3), 0 unknown.

## Deviations from Plan
**1. [Rule 1 - Bug] Extra order-sensitive pin.** Three `extractEpicPristineNavDelegateBody` helpers took the FIRST `define_class!(` in the combined text; once `LoginSheetCancelTarget`'s `define_class!` and the pristine one lived in different files this picked the wrong one (3 unknown failures). Repointed to the `define_class!(` immediately preceding `impl EpicPristineNavDelegate {` (`lastIndexOf` from the end marker); same slice text as before.
**2. [Rule 3 - Blocking] moveproof wave-2 allowance.** Added `^#\[cfg\(target_os = "macos"\)\]$` to the wave-2 add-allow in tools/moveproof.py: the cfg lines on the new `mod`/`pub(crate) use` declarations and duplicated child imports otherwise failed Layer 1 by count. Per-item cfgs stay proven by Layer 3.
**3. [Rule 3 - Blocking] main.rs SHELL_SOURCE_FILES/PARTS** got the three new children (production text unchanged).
**4. Import handling.** The objc2 imports first stayed in the parent (trimmed to those still used) while sheet items were there, then moved with the sheet cluster; pristine_epic.rs holds its own set. Both children carry cfg-attributed `use` lines; no unused import was reported by cargo build.
**5. Section header slip (self-corrected before commit).** The `// ---- Login-window ... support` header trailed the moved imports and went into sheet.rs on the first attempt (Layer 3 flagged `LOGIN_WINDOW_LABEL_COUNTER` changed); moved back to the parent before commit 2.
No Commit B tidy beyond what the moves left: the parent's `mod`/`use` block already follows `use super::*;`.

## moveproof --wave 2
`MOVEPROOF PASS`: Layer 1 removed-not-allowed 0 / added-not-allowed 0; Layer 3 (login_window) items removed/changed 0, added/changed 0.

## Not verified locally
Linux and Windows clippy legs (the `any(macos, windows)` re-export, per-platform unused imports). All new modules are macOS-cfg'd so they are not compiled there; confirm in 71-11 CI. No live macOS login-sheet run was done (pure move, text pins and 445 Rust tests only).

## Known Stubs
None.

## Threat Flags
None. T-71-31/32/33: items moved whole (Layer 3 clean), makeKeyAndOrderFront/register_presented_login_sheet/request_login_sheet_cancel needle counts unchanged, bounds repointed with equal token counts.

## Self-Check: PASSED
