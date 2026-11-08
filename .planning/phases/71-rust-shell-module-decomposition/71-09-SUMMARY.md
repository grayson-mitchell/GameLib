---
phase: 71-rust-shell-module-decomposition
plan: 09
subsystem: infra
tags: [rust, tauri, wave-2, login_window, refactor]
requires: [71-08]
provides:
  - wave-2-start baseline
  - login_window children devtools.rs, humble_helpers.rs, windows_cdp.rs; invite_picker.rs and humble_reveal.rs extended
affects: [71-10]
key-files:
  created:
    - src-tauri/src/login_window/devtools.rs
    - src-tauri/src/login_window/humble_helpers.rs
    - src-tauri/src/login_window/windows_cdp.rs
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-2-start/
  modified:
    - src-tauri/src/login_window.rs
    - src-tauri/src/login_window/invite_picker.rs
    - src-tauri/src/login_window/humble_reveal.rs
    - src-tauri/src/main.rs
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
requirements-completed: [D-03, D-10, D-12, D-13, D-15]
duration: 45min
completed: 2026-11-08
---

# Phase 71 Plan 09: login_window cross-platform clusters Summary

The cross-platform clusters of `login_window.rs` (3,324 -> 2,230 lines) now live in five children, each move its own commit with `permove.sh wave-2-start 2` green (cargo 445 passed, clippy ratchet PASS, moveproof Layer 1 and Layer 3 clean).

## Item assignment (this plan)
| Destination | Items |
| --- | --- |
| invite_picker.rs | BRIDGE_INVITE_WINDOW_LABEL, bridge_invite_picker_path, bridge_invite_nav_allowed, `pub(crate) mod macos_invite_focus` (placed above `rpc_bridge_invite_picker_open`) |
| devtools.rs | should_auto_open_devtools, DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT |
| humble_helpers.rs | next_login_window_label, login_window_parse_url, login_window_title, cookie_domain_matches, website_data_record_matches_domain, verified_delete_count, login_event_value, push_login_window_event, login_chrome_css_script (+ the `humble_reveal_post support` section comment, see below) |
| humble_reveal.rs | REVEAL_EXFIL_HOST, REVEAL_POST_TIMEOUT, RevealPostArgs, reveal_post_args, reveal_post_script, CLEAR_STORAGE_TIMEOUT, ClearStorageArgs, clear_storage_args, clear_storage_script (+ the clear-storage section comment) |
| windows_cdp.rs | CLEAR_COOKIES_TIMEOUT (`any(macos, windows)`), CLEAR_COOKIES_SETTLE, webview2_cdp_call, webview2_cdp_delete_matching_cookies (`cfg(windows)`), each cfg verbatim |
| parent (stays) | LOGIN_WINDOW_LABEL_COUNTER, LOGIN_WINDOW_EVENTS(_CAP), MAIN_WINDOW_LABEL, KEYRING_*, hosts consts, macOS clusters (71-10) |

## Visibility audit
No item needed widening: every moved item was already `pub(crate)` except `webview2_cdp_call` (private, called only inside windows_cdp.rs, stays private) and parent privates (LOGIN_WINDOW_LABEL_COUNTER, LOGIN_WINDOW_EVENTS(_CAP)) which children reach through `use super::*`. No `pub(super)`/`super::super`. `open_pristine_epic_login_window` and `set_native_login_bar_origin_on_main` are 71-10's concern. `macos_invite_focus` is referenced only from invite_picker.rs, so it needs no re-export beyond the glob.

## Commits
1. 9020fdd0a invite-picker helpers and macos_invite_focus -> invite_picker.rs
2. dcd446273 devtools.rs (+ main.rs SHELL_SOURCE lists, moveproof wave-2 `//!` allowance)
3. 5ce796e4a humble_helpers.rs
4. 087a06db1 reveal/clear-storage support -> humble_reveal.rs
5. 22f17b756 windows_cdp.rs

## Deviations from Plan
**1. [Rule 3 - Blocking] main.rs test-module SHELL_SOURCE_FILES/PARTS entries.** `shell_source_files_names_every_shell_module_file` fails for any unnamed new child, so each new file got an entry in the `#[cfg(test)]` lists (main.rs production text unchanged).
**2. [Rule 3 - Blocking] moveproof wave 2 had no `//!` add-allowance.** Added `2: ([], [r'^//!( .*)?$'])` to `ALLOW` in tools/moveproof.py (as wave 1 has) for child header doc lines.
**3. [Rule 3] items.py end lines are unreliable** for multi-line signatures and raw strings (off by one on DEV_LOGIN_DIAGNOSTIC_INIT_SCRIPT; truncated webview2_cdp_call). A first devtools attempt broke the raw string and was discarded before commit. Moves used a name-based extractor instead.
**4. Section comments travel with the preceding item.** Layer 3 hashes an item including trailing orphan comments, so the `// ---- humble_reveal_post support` header had to move with `push_login_window_event` (hence it sits in humble_helpers.rs) and the clear-storage header with `reveal_post_script`. Moving them elsewhere would flag a changed item.
**5. devtools.rs has no `use super::*;`** (nothing referenced; would trip `unused_imports`). windows_cdp.rs gates its `use super::*;` and the parent's `pub(crate) use windows_cdp::*;` with `#[cfg(any(target_os = "macos", windows))]` so Linux sees no unused import; `mod windows_cdp;` itself is unconditional (no hoisted cfg). Not verifiable locally: the Linux/Windows CI legs at wave end must confirm.

No jest/Rust pins needed repointing; tauriShellSource.test.ts untouched. `jestpins.sh` over the wave suite list: 714 passed, 2 failed (the known WR-07 and C3 failures, 0 unknown).

## Known Stubs
None.

## Threat Flags
None. T-71-28: per-item cfgs unchanged (Layer 3 hash equal, no cfg on `mod windows_cdp;`); T-71-29: `bridge_invite_nav_allowed` moved whole; T-71-30: no visibility widening.

## Self-Check: PASSED
