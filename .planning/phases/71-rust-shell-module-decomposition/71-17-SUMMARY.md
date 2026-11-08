---
phase: 71-rust-shell-module-decomposition
plan: 17
subsystem: rust-shell
tags: [rust, tauri, test-colocation, move-proof, wave-5]
requires: [71-16]
provides:
  - "Trailing `#[cfg(test)] mod tests` in login_window/{invite_picker,humble_helpers,humble_reveal,macos_cookies,sheet,devtools}.rs and store_embed/{policy,state,layout,controls}.rs"
  - "test-routing.tsv fully resolved (358 rows: 286 moved, 72 stay with a D-09 reason)"
affects: [71-18]
tech-stack:
  patterns: ["verbatim test co-location behind `use super::*;`", "tests sharing a helper with a staying test stay with it"]
key-files:
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/login_window/invite_picker.rs
    - src-tauri/src/login_window/humble_helpers.rs
    - src-tauri/src/login_window/humble_reveal.rs
    - src-tauri/src/login_window/macos_cookies.rs
    - src-tauri/src/login_window/sheet.rs
    - src-tauri/src/login_window/devtools.rs
    - src-tauri/src/store_embed/policy.rs
    - src-tauri/src/store_embed/state.rs
    - src-tauri/src/store_embed/layout.rs
    - src-tauri/src/store_embed/controls.rs
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-5-start/test-routing.tsv
requirements-completed: [D-08, D-09, D-10, D-13]
completed: 2026-11-09
---

# Phase 71 Plan 17: Wave 5 part 2 - login_window and store_embed test co-location Summary

143 more tests moved verbatim into ten child modules; main.rs went 6152 -> 3962 lines (non-test 1877, tests module 2084 lines) with cargo passed/ignored unchanged at 445/2 and the names diff empty after every commit.

## Task Commits
1. c3f2e6ddf - invite_picker.rs (3)
2. f6fb134a8 - humble_helpers.rs (41; needs `use serde_json::json;`)
3. (humble_reveal) - humble_reveal.rs (23 with `valid_reveal_args` etc.; needs `json`)
4. (macos_cookies) - macos_cookies.rs (5, macOS-only child)
5. (sheet) - sheet.rs (5, macOS-only child)
6. (devtools) - login_window/devtools.rs (2)
7. (policy) - store_embed/policy.rs (7)
8. (state) - store_embed/state.rs (34)
9. (layout) - store_embed/layout.rs (10, of which 9 keep `cfg(target_os = "linux")`: that cfg count in layout.rs went 7 -> 16)
10. (controls) - store_embed/controls.rs (2)
11. (stragglers) - 5 tests the 71-16 routing had wrongly marked stay: 2 `store_embed_navigation_policy_*` -> policy.rs, 2 StoreEmbedState tests -> state.rs, `login_window_title` impersonation test -> humble_helpers.rs
12. docs - test-routing.tsv resolved

Run `git log --oneline --grep='71-17'` for the hashes.

## Deviations from Plan
**1. [Routing authority] No humble_open.rs / humble_cookies.rs tests; devtools.rs and controls.rs gained some.** The plan's file list named humble_open and humble_cookies, but the tsv (the stated authority) routes by defining file of each subject: none of the tests' subjects live in those two children, while devtools.rs (2) and store_embed/controls.rs (3 routed, 2 moved) do. Followed the tsv.

**2. [Rule 1 - stay] Store-embed wire contract tests stay in main.rs.** 4 `store_embed_wire_contract_*` tests plus `store_embed_open_field_errors_name_each_bad_field` and `store_embed_set_bounds_field_errors_name_each_bad_field` share the fixture helper `wire_args` / `STORE_EMBED_WIRE_FIXTURE` (the plan lists "the store-embed wire contract" as D-09). They were routed to state/layout/controls in the tsv, but moving them would have required making `wire_args` crate-visible (a production-text change) or duplicating it. They stay with the fixture; tsv rows now say so.

**3. [Rule 3 - fix of 71-16 routing] 5 stranded tests moved.** See task 11 above; their subjects (`store_embed_navigation_policy`, `StoreEmbedState`, `login_window_title`) live in policy.rs/state.rs/humble_helpers.rs; the 71-16 tsv had a wrong defining-file for them. Moved in one commit instead of three; gate green once for the combined change.

**4. Process.** Moves were done by a script that parses main.rs's test module into items (banners and attached attrs included), routes by tsv, and moves single-consumer helpers with their tests. One `include_str!` was not touched: no moved test contained one. First attempt at state.rs failed to compile (`wire_args` private), fixed by deviation 2 before any commit.

## Gate results
- After every move commit: `permove.sh wave-5-start 5 --include-tests` PERMOVE PASS (cargo 445 passed / 0 failed, clippy ratchet PASS, moveproof 0 removed / 0 added), names diff vs wave-5-start `cargo-names.txt` empty.
- Jest, 24 wave suites: 715 passed, 2 failed = the known WR-07 `.title(` and C3 `.spawn()` failures; 0 unknown.
- Linux-only layout tests (9 moved) and macOS-gated tests are not compiled/run on every host; the ubuntu leg and the Windows leg are compiled in CI at 71-18. Moved tests only use `use super::*;` plus `serde_json::json` where the test bodies call `json!` (humble_helpers, humble_reveal), so no unused-import warning on other platforms is expected.

## main.rs state (D-13)
- Total 3962 lines; non-test 1877 (sizes.py; production unchanged from 71-16's 1,867 plus the existing tests-mod preamble accounting), tests module 2084 lines, 72 `#[test]` fns.
- Remaining tests by D-09 reason:
  - 12 source-text/wiring readers (SHELL_SOURCE readers, `open_external_command_body_calls_the_scheme_check_before_opening`, keyring probe-arm text, wry-blocking-cookies macOS gate, Epic cold-jar clears, linux apply_bounds / show-before-navigate / epic-arm source-text tests)
  - 41 subject defined in main.rs (`timeout_for` / invoke-timeout / abandoned-invoke attribution, `keyring_account`, probe/`KEYRING_READ_TIMEOUT`, shell_panic_log_path / stderr / panic record, `handle_protocol_url_channel_is_bounded_at_invoke_timeout`)
  - 6 store-embed wire contract (shared fixture helper)
  - 6 ipc_contract generated arg types (`keyring_slot_*`, `humble_*_args`, no wave-5 destination)
  - 3 no flat-module subject (`cut_test_modules`, `stderr_best_effort_macro`, `scan_channels_...`)
  - 4 cross-module with no wave-5 destination (`sidecar_exit_fails_every_pending_invoke_at_once`, `two_button_dialog_dismissal_is_not_a_button`, `the_invoke_timeout_error_keeps_its_original_prefix`, `keyring_read_timeout_stays_strictly_under_the_sidecar_invoke_bound...`)
- main.rs is still `OVER` in sizes.py on non-test lines (1877); the D-13 allowance reason is recorded in 71-18.

## Known Stubs
None.

## Threat Flags
None. T-71-49 (names diff empty every commit, routing table resolved), T-71-50 (cookie-domain tests moved verbatim; macOS-gated ones still in the cargo name list), T-71-51 (no include_str! path touched) mitigated.

## Self-Check: PASSED
