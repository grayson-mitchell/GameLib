---
phase: 71-rust-shell-module-decomposition
plan: 05
subsystem: infra
tags: [rust, tauri, dispatcher, wave-1, source-text-tests]
requires: [71-04]
provides:
  - app_lifecycle.rs (five rpc_* lifecycle handlers)
  - login_window/invite_picker.rs (first D-12 child module)
  - rpc_tray_set_icon in tray.rs
affects: [71-06, 71-07, 71-09]
key-files:
  created:
    - src-tauri/src/app_lifecycle.rs
    - src-tauri/src/login_window/invite_picker.rs
    - .planning/todos/pending/2026-11-08-single-instance-and-tray-exceed-module-size-target.md
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src-tauri/src/tray.rs
    - src-tauri/src/login_window.rs
    - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
key-decisions:
  - "Handlers extracted mechanically with a script (verbatim bodies dedented 8, leading comments moved above the fn)"
  - "rpc_app_hide carries cfg_attr(not(macos), allow(unused_variables)); app is not renamed"
requirements-completed: [D-04, D-05, D-07, D-10, D-12, D-13, D-15]
duration: 30min
completed: 2026-11-08
---

# Phase 71 Plan 05: Wave 1 part 2 - lifecycle, tray, invite picker, shell arms Summary

Nine more dispatcher arms are now one-liners: five lifecycle handlers in app_lifecycle.rs, rpc_tray_set_icon in tray.rs, rpc_bridge_invite_picker_open in the new child login_window/invite_picker.rs, and the two shell arms as router-direct calls to the unchanged shell_open.rs.

## Accomplishments
- Layer 2 progression: 23, 24, 25, then 25 matched + 2 router-direct; 0 MISMATCH. cargo 445 passed each time, clippy ratchet PASS.
- sidecarShutdownFlagSource AppExit/AppRelaunch tests now read `readHandlerBody(.., 'app_exit'|'app_relaunch', 1)`; the begin_shutdown-before-app.exit/restart index needles are unchanged. tauriShellSource AppRelaunch pin and the tray atomic-setter pin are repointed the same way.
- The child layout (`mod invite_picker; pub(crate) use invite_picker::*;` in login_window.rs, child with `use super::*;`) compiled with no visibility changes. No item was made pub(crate) (D-15).
- shell_open.rs diff vs wave-1-start is empty (T-71-15). openPolicy.test.ts green.
- The "shell_show_item_in_folder arm calls the workaround" pin located the arm by `=> {`; its locator was relaxed to `=>` for the one-line form (needles otherwise unchanged).
- Oversize todo recorded: single_instance.rs 1,620 and tray.rs 1,158 non-test lines. `pnpm planning-gates` 12/12.
- Note: the win32 clippy ceiling for the cfg_attr on rpc_app_hide is only checked by the CI Windows leg at wave end; the local (macOS) ratchet passed.

## Task Commits
1. 3fdb61988 lifecycle arms to app_lifecycle.rs
2. 09df4ec9c tray_set_icon to tray.rs
3. ea802fb0b invite picker to login_window/invite_picker.rs
4. 92c1cf823 shell arms router-direct
5. todo commit (docs, oversize)

## Deviations from Plan
- Jest pin for ShellShowItemInFolder locator relaxed (see above); a necessary consequence of the planned one-line collapse.
- jestpins shows only the known WR-07 failure.

## Known Stubs
None.

## Self-Check: PASSED
