---
phase: 71-rust-shell-module-decomposition
plan: 04
subsystem: infra
tags: [rust, tauri, dispatcher, wave-1, source-text-tests]
requires: [71-03]
provides:
  - scan_dispatch.rs, dialogs.rs, notification_show.rs (new flat modules)
  - rpc_* handlers in wake_lock.rs, clipboard.rs, keyring_dispatch.rs
  - baselines/wave-1-start
affects: [71-05, 71-06, 71-07]
key-files:
  created:
    - src-tauri/src/scan_dispatch.rs
    - src-tauri/src/dialogs.rs
    - src-tauri/src/notification_show.rs
  modified:
    - src-tauri/src/store_embed.rs
    - src-tauri/src/main.rs
    - src-tauri/src/wake_lock.rs
    - src-tauri/src/clipboard.rs
    - src-tauri/src/keyring_dispatch.rs
    - src/backend/scanners/__tests__/scanChannelParity.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/keyringDiagPersistence.test.ts
    - src/backend/__tests__/dialogOptionForwarding.test.ts
    - .planning/phases/71-rust-shell-module-decomposition/tools/moveproof.py
key-decisions:
  - "Handlers are mechanically extracted (verbatim bodies dedented 8, leading comment block moved above the fn); compiler confirmed the param subsets"
  - "moveproof wave-1 add-allow list gains `^//!( .*)?$` so the plan-mandated module doc headers are not flagged"
requirements-completed: [D-03, D-04, D-05, D-07, D-10, D-15]
duration: 45min
completed: 2026-11-08
---

# Phase 71 Plan 04: Wave 1 part 1 - 18 small-domain arms to rpc_* handlers Summary

Eighteen dispatcher arms (scan x6, wake_lock x2, clipboard x2, keyring x4, dialog x3, notification_show) are now one-line `RustInvokeChannel::X => rpc_x(..),` calls; the bodies live verbatim in their domain modules and every source-text pin over them reads the handler.

## Accomplishments
- Six commits, one per arm group, `permove.sh wave-1-start 1` green before each (cargo 445 passed, clippy ratchet PASS, moveproof PASS). Layer 2 progression: 6, 8, 10, 14, 17, 18 matched, 0 MISMATCH.
- `two_button_choice` moved with its doc block to dialogs.rs; main.rs production changes are only `mod`/`use` lines (plus SHELL_SOURCE_FILES/PARTS entries in tests, plus the repointed keyring Rust test).
- Pins repointed, needles kept, anti-vacuity added:
  - scanChannelParity: reads `readTauriShellProductionSource()`, router-line regex + `readHandlerBody(.., 2)`, `arms.length === RUST_SCAN_CHANNELS.length`. `scan_channels_are_gamelib_scan_app_ops` only reads the gamelib_scan consts, left alone.
  - tauriShellSource clipboard pins: existence needles kept, plus handler-body assertions.
  - keyringDiagPersistence: region = concatenation of the four handler bodies, router lines asserted exactly once each; KeyringAvailable sub-slice reads its handler (min 10 lines).
  - Rust `the_keyring_available_arm_only_ever_READS_the_probe_account`: locates `fn rpc_keyring_available(`, ends at first `\n}\n`, asserts >= 10 lines; probe-account assertions unchanged.
  - dialogOptionForwarding: variant-to-wire map for the three dialog variants; reads handler via `readHandlerBody`.
- notification_show.rs is a flat sibling, not in PRE_SPLIT_SIBLING_MODULES, so it stays inside the combined source.
- Wave-end compare vs wave-1-start: cargo 445/0 failed, no test name lost or added, clippy list identical, jest failing set identical (WR-07 and C3 known failures), jest 713 passed. `pnpm check:ipc-contract` up to date, `pnpm codecheck` clean.

## Task Commits
1. ce0a0abf3 scan arms (+ wave-1-start baseline, moveproof allowance)
2. 5198b7f69 wake lock arms
3. 0db2d95cd clipboard arms
4. efb7d3229 keyring arms
5. 36bfec683 dialogs.rs + two_button_choice
6. 73d0b6816 notification_show.rs

## Deviations from Plan
- [Rule 3 - Blocking] moveproof.py Layer 1 flagged the new modules' `//!` doc lines as added-not-allowed, although the plan mandates those headers. Added `^//!( .*)?$` to the wave-1 add-allow list (tools/moveproof.py, committed in ce0a0abf3). Only added doc-comment lines are admitted.
- keyringDiagPersistence.test.ts still contains the literal `RustInvokeChannel::KeyringGet => {` once, inside the synthetic pre-Task-1 RED-proof fixture string (a historical reconstruction used for a negative self-test), not as a locator. All locators were repointed.
- scanChannelParity's `readFileSync`/`ROOT` imports stay (still used for gamelib-scan lib.rs).

## Known Stubs
None.

## Self-Check: PASSED
