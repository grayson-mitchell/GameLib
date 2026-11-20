---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 27
subsystem: steam-polling
tags: [live-uat, ci-gate, delete-gate]
requires: [80-26]
provides: ["Delete gate: MET (2026-11-16) for plans 28-31"]
affects: [80-28]
key-files:
  modified:
    - .planning/phases/80-steam-install-uninstall-and-update-polling-state-machines-in/80-HUMAN-UAT.md
decisions:
  - "Restart hold applies to GameLib-driven (depot) installs with InstallApp off, not Steam-driven handoffs (operator correction)"
metrics:
  completed: 2026-11-16
---

# Phase 80 Plan 27: Live smokes and delete gate Summary

All six live UAT items passed on the pnpm tauri:dev build with real Steam, rust-test.yml is green on all three legs, 80-PARITY.md is APPROVED, so the delete gate is MET (2026-11-16).

## Results

- Handoff install (1): pass. Live progress, "Installation Finished", no nettop or watchdog left after Force Quit. A Steam-driven download needs no restart hold; the game goes straight to Play.
- Depot install and update (2): pass. Restart hold on depot install with InstallApp off; update showed exactly one Updating to Done.
- Uninstall and quit-resume (3): pass. Rust rearm log line seen after GameLib relaunch.
- Running poll macOS (4a) and Windows (4b): pass. One Playing, one Done; no reg.exe on Windows.
- Notification language (5): pass in Spanish.
- CI: run 43813887944 on f078c2762, windows, macos and ubuntu all success.
- Orphan check: no nettop orphan from the Rust monitor; one 2026-11-02 orphan from the old TS monitor killed.

## Commits

- e1ab90dda: live build and preface (task 1)
- Task 3 UAT results commit (see git log, docs(80-27))

## Deviations from Plan

Earlier CI runs failed windows-latest on phase-80 test-only path-separator bugs, fixed in 6ec2e9db1, d6f314aec and f078c2762. main was pushed with --no-verify at the operator's direction; the pre-push hook stays red on checks tracked in todos/pending/2026-11-16-pre-push-hook-red-gameLaunch-and-jest-mock.md, outside the delete gate.

## Self-Check: PASSED
