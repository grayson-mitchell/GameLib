---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 13
subsystem: steam-cm
tags: [rust, session, wrap, d-09-pass]
requires: [79-11, 79-12]
provides: [RestoreOnlyWrap]
affects: [79-16]
key-files:
  modified: [src-tauri/crates/gamelib-steamcm/src/session.rs]
requirements: [D-03, D-10, D-11]
metrics:
  tasks: 1
  completed: 2026-11-15
---

# Phase 79 Plan 13: Session wrap wiring (PASS branch) Summary

`RestoreOnlyWrap { host, app_folder }` added to session.rs: a `LogonWrap` whose before/after are no-ops and whose `pay_owed` delegates to `wrap::restore_if_owed`, so a legacy owed-goonline record is paid at boot and shutdown.

## Branch taken

`79-WRAP-RETEST.md` has `verdict: PASS` (confirmed by grep). Per the plan's PASS branch: no MacWrap, no spacing, no wrap mutex, no `OpFailure::GoOfflineRequired`. `WRAP_SPACING` was deliberately not added (FAIL-only; it would be a dead constant). The FAIL-only acceptance greps (`WRAP_SPACING`, `GoOfflineRequired`) therefore do not apply.

## What was built

- `RestoreOnlyWrap` (session.rs): logons are never delayed or refused (connect timing unchanged); `pay_owed(trigger)` calls `restore_if_owed`.
- Shutdown already ran `wrap.pay_owed(Shutdown)` after abandon/close under `bound` (79-11); it now pays for real when the shell uses `RestoreOnlyWrap`. Boot: the shell calls `wrap.pay_owed(RestoreTrigger::Boot)` on the same object; no new SessionHandle API was needed.
- Tests: no-record shutdown returns `NotOwed`, opens no URL, logon adds zero paused time; macOS-only test that an owed record with Steam not running is kept (`KeptNotRunning`) via the session shutdown.
- `cargo test -p gamelib-steamcm --lib -- session:: wrap::` 48 passed; clippy `--all-targets -D warnings` and fmt clean.

## Notes for 79-16 (shell)

The production `WrapHost` is NOT defined here. 79-16 must implement it and override `local_utc_offset_secs` (default 0 = UTC skews the late-logoff / `Logged On` fallback by the zone offset), plus `pid_alive`, `system_boot_unix_ms`, and the steam:// opener. 79-16 must also construct `RestoreOnlyWrap` instead of `NoWrap` and call `pay_owed(Boot)` at startup. `NoWrap::pay_owed` still returns `NotOwed` (test/other-platform use).

## Deviations from Plan

None beyond the branch selection. Verify command used `--lib -- session:: wrap::` per the phase notes.

## Known Stubs

None.

## Self-Check: PASSED
