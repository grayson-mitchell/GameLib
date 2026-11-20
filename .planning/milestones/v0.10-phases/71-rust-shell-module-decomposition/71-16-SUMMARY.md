---
phase: 71-rust-shell-module-decomposition
plan: 16
subsystem: rust-shell
tags: [rust, tauri, test-colocation, move-proof, wave-5]
requires: [71-15]
provides:
  - "Trailing `#[cfg(test)] mod tests` in sidecar, clipboard, wake_lock, keyring_dispatch, relay_commands, tray, terminate_veto, single_instance"
  - "baselines/wave-5-start with test-routing.tsv (358 rows)"
affects: [71-17, 71-18]
tech-stack:
  patterns: ["verbatim test co-location behind `use super::*;`", "production-only source reader for slicing pins"]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-5-start/
  modified:
    - src-tauri/src/main.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/clipboard.rs
    - src-tauri/src/wake_lock.rs
    - src-tauri/src/keyring_dispatch.rs
    - src-tauri/src/relay_commands.rs
    - src-tauri/src/tray.rs
    - src-tauri/src/terminate_veto.rs
    - src-tauri/src/single_instance.rs
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/__tests__/appRootResolution.test.ts
requirements-completed: [D-03, D-08, D-09, D-10]
completed: 2026-11-09
---

# Phase 71 Plan 16: Wave 5 part 1 - flat-module test co-location Summary

149 of main.rs's 358 `#[test]` fns (plus their helpers, consts and banners) moved verbatim into trailing `mod tests` blocks in eight flat modules; main.rs went 8333 -> 6152 lines with cargo passed/ignored unchanged at 445/2.

## Task Commits
1. ae65c0ccd - wave-5-start baseline, test-routing.tsv, moveproof wave-5 add-allow for `mod tests {`
2. 494f614d7 - sidecar.rs (17 tests + `spawn_orphaned_group`)
3. f4a1a34a0 - clipboard.rs (10 tests, the names jest pins) plus tauriShellSource D-10 strip-proof relaxation
4. f01ce9e95 - wake_lock.rs (12)
5. cd97f2b39 - keyring_dispatch.rs (12: `keyring_get_result_*`, `keyring_outcome_*`, `keyring_get_outcome_*`, `bounded_keyring_read_*`)
6. 800d23bba - relay_commands.rs (12 + `send_frame`), as a separate trailing `mod tests` beside `relay_allow_list_tests`
7. ebd7f6155 - tray.rs (28 incl. `TRAY_SET_ICON_WIRE_FIXTURE`)
8. c0d6b8c1d - terminate_veto.rs (5: 4 `tray_quit_*` + the Cmd+Q menu-id collision test)
9. 3c5a3227b - single_instance.rs (53 incl. `WINDOWS_TEST_VALID_SID`/`WINDOWS_TEST_OTHER_VALID_SID`)
10. 6484e3b43 - two source-slicing jest pins pointed at production-only source

## Routing
`baselines/wave-5-start/test-routing.tsv` has 358 rows (one per real `#[test]` fn; the plan's `grep -c '#\[test\]'` gives 363 because five doc/comment lines mention the attribute). Destinations: 149 moved here; 138 are login_window/store_embed tests left for 71-17; 71 stay in main.rs. Stay cases: SHELL_SOURCE/include_str readers, `open_external_command_body_calls_the_scheme_check_before_opening`, `timeout_for` / abandoned-invoke tests, `keyring_account`/`keyring_slot`/probe/`KEYRING_READ_TIMEOUT` tests (subjects are defined in main.rs or ipc_contract.rs), the two `#[ignore]` keyring tests (subject consts live in main.rs), `shell_panic_log_path` and stderr/panic tests, `handle_protocol_url_channel_is_bounded_at_invoke_timeout`, ipc_contract arg tests.

Plan text differences resolved by subject-fn rule: keyring_account/slot-arg tests stay in main.rs (the plan topic map said keyring_dispatch.rs, but `keyring_account` is defined in main.rs and `keyring_slot` in ipc_contract.rs). The `clipboard_text_arg_*` tests moved to clipboard.rs as the plan directs even though their subject is the generated ipc_contract Args type.

## Gate results
- Per-commit `permove.sh wave-5-start 5 --include-tests`: PERMOVE PASS after every move commit (cargo 445 passed / 0 failed, clippy ratchet PASS, moveproof Layer 1 0 removed / 0 added, import-line review only `use serde_json::json;`).
- Names diff (module path stripped) against wave-5-start `cargo-names.txt`: empty after every commit. baseline.sh compare is name-suffix based, so renamed module paths do not matter; no deviation.
- Jest (24 baseline suites): 715 passed, 2 failed - exactly the known WR-07 `.title(` and C3 `.spawn()` failures.
- `cfg(windows)` lines inside test code: 5 before, 5 after (tray 1 - the `#[ignore]` reg.exe test; single_instance 2 - comment mentions only; remaining 2 in main.rs). No moved test uses a helper left in main.rs's test mod (checked programmatically over the base helper list), and `WINDOWS_TEST_VALID_SID` count in main.rs is 0 (19 in single_instance.rs). Windows leg is compiled by CI at 71-18.
- `open_external_command_body_calls_the_scheme_check_before_opening` count in main.rs: 1.

## longRunningChannels (D-10)
`locateCfgTestRegionRaw` takes the first `#[cfg(test)]` in the concatenated source; the first occurrence is a doc mention in app_lifecycle.rs, so the region already started well before any test module. Region length 1226876 (before, at 2794c5019) -> 1227295 (after, working tree); the `for _ in LONG_RUNNING_CHANNELS` loop with `assert_eq!(timeout_for(` is still inside the region (main.rs, last in order, keeps the `timeout_for` tests). Not vacuous; suite passes.

## Deviations from Plan
**1. [Rule 3 - Blocking] moveproof had no wave-5 allowance for the `mod tests {` opener.** The plan expects it as an allowed preamble line, but `ALLOW` had no wave-5 entry, so Layer 1 reported `+ 1 mod tests {`. Added `5: ([], [r'^mod tests \{$'])` to tools/moveproof.py (self-test still passes). Commit ae65c0ccd.

**2. [Rule 3 - Blocking] tauriShellSource "per file: strip removes exactly the enumerated test-mod line ranges" pinned the exact test-mod name list.** Co-located `mod tests` blocks broke it. Relaxed to: non-`tests` names still equal `['relay_allow_list_tests', 'shell_open_tests']`, and no file has more than one `tests` mod. Commit f4a1a34a0.

**3. [Rule 3 - Blocking] Two source-slicing jest pins read the full (test-included) shell source.** `REQ-34.1-07 no unwrap() or expect( appears inside the tray-building block` and appRootResolution's `app_root_env_value` body pin sliced between two production markers and began seeing `.unwrap()`/`.expect(` in newly co-located tests. Both now read `readTauriShellProductionSource()`. Commit 6484e3b43.

**4. Process note.** wake_lock and keyring were first moved in one working tree and gated together, then reset (only my own files) and redone as one commit each so history is one commit per destination; both gates were re-run.

No fix attempts beyond these. Pre-existing `non_snake_case` warnings on two test fn names moved with their tests unchanged.

## Known Stubs
None.

## Threat Flags
None. T-71-46 (no test lost, names diff empty), T-71-47 (10 allow-list tests moved, self-reading body test stays), T-71-48 (cfg counts equal) mitigated.

## Self-Check: PASSED
