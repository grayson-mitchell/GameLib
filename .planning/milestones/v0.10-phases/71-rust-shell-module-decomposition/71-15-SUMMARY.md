---
phase: 71-rust-shell-module-decomposition
plan: 15
subsystem: infra
tags: [rust, tauri, wave-4, gate, ci, live-check, macos-epic-embed]
requires: [71-14]
provides:
  - wave-4-end baseline
  - Wave 4 automated gate passed, three-leg CI green, live check approved
affects: [71-16]
key-files:
  created:
    - .planning/phases/71-rust-shell-module-decomposition/baselines/wave-4-end/
key-decisions:
  - "surface.rs stays at 1,019 non-test lines (D-13 reason recorded in 71-14-SUMMARY); not split"
requirements-completed: [D-03, D-11, D-12, D-13, D-14, D-15]
duration: single session
completed: 2026-11-09
---

# Phase 71 Plan 15: Wave 4 gate Summary

Wave 4 (macos_epic_embed split) closes: automated gate passes, rust-test.yml is green on all three legs for the pushed HEAD before the live check (D-03 order honored), and the operator approved the live check with the title bar OFF and ON.

## Automated gate
- wave-4-end captured at 1582c6e5a. cargo 445 passed / 0 failed / 2 ignored; jest 24 suites, 715 passed, 2 failed (known WR-07, C3).
- `baseline.sh compare wave-4-start wave-4-end --allow-new-tests`: all PASS (cargo 445 >= 445, no test name lost or added, clippy list identical and exit 0, jest failing set identical, 715 >= 714). The flag covers 71-14's new D-11 jest test; compare printed no "test name added" line, so it may not have been needed.
- `moveproof --wave 4`: PASS. Layer 1 0/0; Layer 3 (macos_epic_embed) 0/0. `use` items to review: `pub(crate) use nav_delegate::*`, `pub(crate) use surface::*`, `use super::*`.
- `pnpm check:ipc-contract`: up to date. `sizes.py` with allow flags exit 0.
- Over 1,000 non-test lines: surface.rs 1,019 (D-13 reason in 71-14-SUMMARY: one cohesive surface type plus KVO plumbing; no todo, not split); main.rs 1,877, single_instance.rs 1,620, tray.rs 1,158 (later plans).
- `graphify update .` ran. No fix commits.

## CI (green)
rust-test.yml run 42507609410 on b7d55dc8a (pushed 05bf973bf..b7d55dc8a): SUCCESS on windows-latest, macos-latest and ubuntu-latest. No install-deps outage, no reruns. Green before the live check.

## Live check (operator approved 2026-11-09)
`pnpm build:sidecar` run before the check. Operator replied "approved"; OFF and ON recorded as pass for each item.

| Item | Title bar OFF | Title bar ON |
| --- | --- | --- |
| Embedded store page: open, resize, back/forward/reload/navigate, hide/show | pass | pass |
| Humble sign-in and sign-out | pass | pass |
| GOG sign-in and sign-out | pass | pass |
| Amazon sign-in and sign-out | pass | pass |
| Epic sign-in and sign-out | pass | pass |
| Epic embed: open | pass | pass |
| Epic embed: resize bounds tracking, controls row clear | pass | pass |
| Epic embed: hide/show on tab switch | pass | pass |
| GOG <-> Epic switch: deselect, Tauri embed hides | pass | pass |
| Epic embed: back/forward/reload/navigate | pass | pass |
| Epic Games Launcher scheme link blocked | pass | pass |
| Epic embed: download hand-off | pass | pass |
| JS alert/confirm shown as attached sheet | pass | pass |
| Epic embed: close | pass | pass |
| No challenge/blank-page load timeout | pass | pass |

## Task Commits
1. b7d55dc8a capture wave-4-end baseline (pushed)
2. Task 2 (live check) is verification only, no commit.

## Deviations from Plan
None - plan executed as written. No code changes or fix commits.

## Known Stubs
None.

## Threat Flags
None.

## Self-Check: PASSED
