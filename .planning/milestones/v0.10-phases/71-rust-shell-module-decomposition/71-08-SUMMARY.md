---
phase: 71-rust-shell-module-decomposition
plan: 08
subsystem: infra
tags: [rust, tauri, wave-1, gate, ci, live-check]
requires: [71-07]
provides:
  - wave-1-end baseline
  - Wave 1 gate passed (automated, three-leg CI, live check)
affects: [71-09]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-1-end/
  modified:
    - meta/clippyRatchet.cjs
key-decisions:
  - "win32 unused_imports clippy ceiling lowered 2 -> 0 because wave-1 moves removed both Windows-only unused imports"
requirements-completed: [D-03, D-04, D-05, D-07, D-14, D-15]
duration: 60min
completed: 2026-11-08
---

# Phase 71 Plan 08: Wave 1 gate Summary

Wave 1 is closed: the automated gate, three-leg CI and the live check in `pnpm tauri:dev` (frameless title bar OFF and ON) all pass.

## Automated gate
- `baseline.sh compare wave-1-start wave-1-end`: all PASS. cargo 445 passed / 0 failed / 2 ignored, no test name lost or added, clippy list identical, jest failing set identical (WR-07, C3).
- jest passed 714 vs 713 at wave-1-start; the +1 is untraced and was already 714 at 71-07, so `--allow-new-tests` was not needed.
- `moveproof --wave 1 --require-all`: PASS. Layer 1 removed/added-not-allowed 0; Layer 2 matched=43, router-direct=2.
- `pnpm check:ipc-contract` up to date; `ipc_contract.rs` has no diff vs wave-1-start.
- `sizes.py` flags only allowed files (login_window.rs, macos_epic_embed.rs, main.rs, single_instance.rs, store_embed.rs, tray.rs). `graphify update .` ran.

## CI
- rust-test.yml run 42445589877 on e78677442: success on windows, macos and ubuntu.

## Live check (operator approved 2026-11-08)
Sidecar rebuilt (build/main/sidecar.js) before the check. One OFF and one ON result per item, all pass:

| Item | Title bar OFF | Title bar ON |
| --- | --- | --- |
| Embedded store page | pass | pass |
| Login-window sign-ins (Humble, GOG, Amazon, Epic) | pass | pass |
| Epic embed | pass | pass |
| Notification | pass | pass |
| app_hide / main_window_hide launch path | pass | pass |
| Dialogs | pass | pass |
| Tray icon change | pass | pass |
| Keyring read after relaunch | pass | pass |
| Bridge invite picker | pass | pass |

## Task Commits
1. 2be5a2ce5 capture wave-1-end baseline
2. e78677442 lower win32 unused_imports clippy ceiling 2 -> 0
3. Task 2 (live check) is verification only, no commit.

## Deviations from Plan
**1. [Rule 3 - Blocking] win32 clippy ratchet below ceiling**
- **Found during:** Task 1, first push (HEAD 2be5a2ce5, run 42445149648), windows-latest only.
- **Issue:** `unused_imports` was 0, below ceiling 2; the wave-1 moves removed both Windows-only unused imports. This was not the rpc_app_hide cfg_attr risk noted in 71-05, which produced no failure.
- **Fix:** removed the ceiling entry in `meta/clippyRatchet.cjs`; clippyRatchet.test.ts 22/22.
- **Commit:** e78677442

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
