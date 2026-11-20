---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 01
subsystem: ci
tags: [ci, github-actions, rust, linux]
requires: []
provides:
  - Linux (ubuntu-latest) leg in rust-test.yml with hard cargo check --all-targets and hard cargo test --bin gamelib-shell
affects: [71-rust-shell-module-decomposition]
tech-stack:
  added: []
  patterns: [Linux-only steps gated on runner.os]
key-files:
  created: []
  modified:
    - .github/workflows/rust-test.yml
    - .planning/phases/71-rust-shell-module-decomposition/71-CONTEXT.md
    - .planning/ROADMAP.md
key-decisions:
  - "Linux shell tests passed on the first run, so continue-on-error was removed (hard gate)"
  - "Clippy steps skipped on Linux (no ceiling in meta/clippyRatchet.cjs)"
requirements-completed: [D-14, D-16]
duration: multi-session (push-gated)
completed: 2026-11-08
---

# Phase 72 Plan 01: Linux compile leg Summary

ubuntu-latest added to the rust-test.yml matrix with apt webkit2gtk/appindicator/rsvg deps, a hard `cargo check --all-targets`, and Linux Tauri shell tests as a hard gate; proven green on a real GitHub run.

## CI evidence

Run 42432244587 (headSha bcd25577d, which has Task 1 commit 7b34c7038 as an ancestor): conclusion success.
- ubuntu-latest: `cargo check (Tauri shell crate, Linux leg only)` success; `cargo test (Tauri shell crate)` success; clippy skipped.
- macos-latest and windows-latest: all steps success (same as previous run 42420630163); the Linux check step skipped there.

No Rust files were touched: the Linux compile was clean first time, so no cfg(target_os = "linux") fixes were needed.
`continue-on-error` no longer remains in the workflow.

## Commits

- 7b34c7038: Task 1, Linux leg added
- cd48c4a96: Task 3, removed continue-on-error, header caveat (a) updated, 71-CONTEXT D-02 / Wave 0 / Roadmap upkeep notes, ROADMAP 71 and 72 annotations

## Deviations from Plan

**1. [Rule 3 - Blocking] Clippy steps guarded off Linux**
- The plan assumed the clippy steps were already macOS-guarded. da8dc1403 had extended them to Windows, and meta/clippyRatchet.cjs has no Linux ceiling, so `if: runner.os != 'Linux'` was added to both clippy steps (one line each). Done in Task 1 (7b34c7038).

**2. Out-of-plan push unblockers (by the orchestrator)**
- bad1c7b88 (unused `t` in StoreSettings) and a039925bb (un-export STORE_SETTINGS_TABS) fixed lint/deadcode defects from concurrent quick task 261108-ioc so the pre-push hook would pass. Not part of this plan's work.

**3. Run used was for a later head**
- Another session pushed bcd25577d on top, so the verified run's headSha is bcd25577d rather than the Task 1 commit; Task 1 commit is an ancestor.

## Known Stubs

None.

## Self-Check: PASSED
