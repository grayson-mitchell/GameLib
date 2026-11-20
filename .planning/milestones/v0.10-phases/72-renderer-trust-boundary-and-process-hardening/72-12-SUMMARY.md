---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 12
subsystem: shell
tags: [windows, job-object, sidecar, shutdown, uat]
requires: [72-03, 72-07, 72-10]
provides:
  - Windows kill-on-close Job Object holding the sidecar tree
  - 72-UAT.md with all seven manual checks of the phase
key-files:
  modified:
    - src-tauri/Cargo.toml
    - src-tauri/src/sidecar.rs
    - src-tauri/src/shell_state.rs
    - src-tauri/src/main.rs
  created:
    - .planning/phases/72-renderer-trust-boundary-and-process-hardening/72-UAT.md
requirements-completed: [D-20, D-01, D-03, D-10, D-17, D-19]
completed: 2026-11-08
---

# Phase 72 Plan 12: Windows Job Object and phase UAT Summary

The sidecar is assigned to a `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` Job Object on Windows so store CLIs, powershell wrappers and games die with it on quit or shell crash, and 72-UAT.md records the phase's manual checks.

## Commits
- Task 1 `feat(72-12): reap Windows sidecar tree with a kill-on-close Job Object`
- Task 2 72-UAT.md, committed with this SUMMARY

## What changed
- Cargo: one added windows-sys feature, `Win32_System_JobObjects` (no new crate; Cargo.lock unchanged, so cargo-deny advisories is unaffected).
- `create_kill_on_close_job` (`#[cfg(windows)]`, sidecar.rs): CreateJobObjectW, SetInformationJobObject with KILL_ON_JOB_CLOSE and no breakaway flags, AssignProcessToJobObject. Every failure is logged with GetLastError, the handle is closed, and `None` is returned; no panic and no `?`. The job is wrapped in `OwnedHandle`.
- `SidecarState.job` (`#[cfg(windows)]`): stored at construction in main.rs. The `#[cfg(not(unix))]` arm of `shutdown_child` kills the sidecar, then takes and drops the job handle.
- Non-Windows builds are unchanged.
- 72-UAT.md: 7 items. Items 1-5 are `pass`, taken from the 72-03, 72-07 and 72-10 checkpoint approvals. Items 6 and 7 (Windows Task Manager checks) are `pending`.

## Verification
- macOS `cargo test --bin gamelib-shell`: 438 passed.
- `cargoFeatures.test.ts` and `sidecarShutdownFlagSource.test.ts`: pass.
- UAT shape checks: 7 headings, 7 `expected:`, 7 `result:`; the file is prettier-ignored (.planning), so no prettier check is claimed.

## Unverified until push
- The Windows code did NOT compile locally: only `aarch64-apple-darwin` is installed, and no toolchain was installed. It is proven only by the rust-test windows-latest CI leg after the next push. I read the windows-sys 0.60.2 signatures (HANDLE as pointer, `IO_COUNTERS` behind the already-enabled `Win32_System_Threading`) but a compile error on that leg is possible.
- Runtime behaviour (UAT items 6 and 7) and the A4 assumption that libuv detached spawn does not set CREATE_BREAKAWAY_FROM_JOB are unverified until the operator runs them on Windows.
- The 72-10 packaged-build Restart UI check stays open (UAT item 2 note).

## Deviations
None. The `shutdown_child` doc comment still says Windows is sidecar-only kill; the code comment at the new arm records the job behaviour.

## Self-Check: PASSED
