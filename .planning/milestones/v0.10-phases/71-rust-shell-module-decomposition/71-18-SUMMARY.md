---
phase: 71-rust-shell-module-decomposition
plan: 18
subsystem: infra
tags: [rust, tauri, wave-5, gate, ci, live-check, phase-report]
requires: [71-17]
provides:
  - wave-5-end baseline
  - Phase 71 final gate passed, three-leg CI green, live check approved
  - todo for splitting fn main setup into named steps
affects: []
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-5-end/
    - .planning/todos/pending/2026-11-09-split-fn-main-setup-into-named-steps.md
  modified:
    - .planning/phases/71-rust-shell-module-decomposition/71-VALIDATION.md
key-decisions:
  - "main.rs stays over 1,000 non-test lines: fn main is one 1,175-line function (D-06 rationale); follow-up todo filed"
requirements-completed: [D-01, D-02, D-03, D-08, D-09, D-13, D-14]
duration: two sessions
completed: 2026-11-09
---

# Phase 71 Plan 18: Wave 5 gate and phase report Summary

The final gate of the Rust shell decomposition passes: automated baselines identical, three-leg CI green on the pushed HEAD before the live check (D-03 order), and the operator approved the live check with the title bar OFF and ON.

## Automated gate
- wave-5-end vs wave-5-start: all PASS. cargo 445 passed / 0 failed / 2 ignored, no test name lost or added; clippy list identical, exit 0; jest failing set identical, 715 passed.
- `moveproof --wave 5 --include-tests`: PASS, Layer 1 0/0; only import to review `+ 4 use serde_json::json;`.
- Phase span (wave-0-start vs wave-5-end cargo names): additions only, the four Wave 0 (71-03) tests.
- `pnpm check:ipc-contract` up to date; D-01 0 transport-mirror markers in sidecar.rs; D-02 ubuntu-latest in the rust-test.yml matrix; `pnpm planning-gates` 12/12.
- Sizes (non-test): all planned files under 1,000 (sheet.rs 959). Over: main.rs 3962 total / 1877 non-test (fn main, D-06, new todo), single_instance.rs 1620 and tray.rs 1159 (71-05 todo), macos_epic_embed/surface.rs 1019 (D-13 reason in 71-14).

## CI (green)
rust-test.yml run 42511011506 on 3025f9240: SUCCESS on macOS, Windows and Ubuntu, first attempt. Covers the Windows-only single_instance tests and Linux layout tests; no clippy ceiling change.

## Live check (operator approved 2026-11-09)
Sidecar rebuilt first. Operator replied "approved"; recorded as pass with title bar OFF and ON for: embedded store page; Humble (sign in, disconnect clears cookies and storage, reveal), GOG, Amazon, Epic sign-ins; Epic embed (open, resize, hide/show, GOG and back, download hand-off, close); tray icon and menu, dialogs, notification, single-instance second launch focuses the existing window; Cmd+Q quit with no dead-sidecar dialog, and relaunch reads the keyring without a prompt.

## Full jest: eight failures, pre-existing check
Full jest: 879 suites, 19834 passed, 8 failed. Two are known (WR-07 tauriShellSource `.title(`, C3 quitTeardownWiring `.spawn()` count). The other six were run in a temporary worktree at the pre-phase HEAD 13648f14f (removed afterwards):

| Suite | Pre-phase (13648f14f) | Result |
| --- | --- | --- |
| gamelibCatalogParity (sl locale) | fails | pre-existing |
| genI18nGateScope (reverse staleness vs upstream merge) | fails | pre-existing |
| macArchKnownFixRouting (Intel routing) | fails | pre-existing |
| logSecretGate (2 tests) | fails | pre-existing |
| x86CallbackWineHarness (1 test, CBDISP 168/3/0) | passed once | differs, see below |

x86CallbackWineHarness failed on two out of two isolated runs at HEAD and passed in one run at the pre-phase commit. It runs the real x86 shim under CrossOver Wine with a loopback fake helper and touches no Rust shell code; the phase changed no file it imports (only test files, testUtils, and a few shell-source helpers). Likely environmental (CrossOver/Wine state on the machine, cf. spike 060 trial expiry) or timing, but not proven; a rerun at the pre-phase commit was not repeated. Flagged for the verifier, not attributed to phase 71.

## Task Commits
1. 3025f9240 wave-5-end baseline, phase report, fn main todo (pushed)
2. Task 2 (live check) is verification only, no commit.

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
