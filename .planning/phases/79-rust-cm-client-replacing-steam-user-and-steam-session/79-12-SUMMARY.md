---
phase: 79-rust-cm-client-replacing-steam-user-and-steam-session
plan: 12
subsystem: steam-cm
tags: [rust, mac-steam, owed-goonline, d-09, d-10]
requires: [79-02, 79-06]
provides: [WrapHost, OwedRecord, read_owed, write_owed, clear_owed, restore_if_owed, OwedPayer]
affects: [79-13, 79-16]
key-files:
  modified: [src-tauri/crates/gamelib-steamcm/src/wrap.rs]
requirements: [D-09, D-10]
metrics:
  tasks: 1 of 2 (Task 2 skipped by verdict)
  completed: 2026-11-15
---

# Phase 79 Plan 12: Owed-goonline record and restore (PASS branch) Summary

Rust port of the Mac Steam owed-goonline record (TS-compatible versioned JSON) and `restore_if_owed` for boot and shutdown, with a `WrapHost` trait so the crate never opens URLs itself.

## Branch taken

`grep '^verdict:' 79-WRAP-RETEST.md` returned `verdict: PASS`. Per D-09 only the owed-record restore is ported.
Task 2 skipped: D-09 PASS, wrap deleted at the delete gate (`MacWrap` is absent from wrap.rs).

## What was built

- `wrap.rs`: `WrapHost` trait, `OwedRecord` (`version`, `since` ISO, `by`, `pid`; version stamp 1, the empty-chain baseline), `read_owed`/`write_owed` (via `gamelib_steamfiles::atomic::atomic_write`)/`clear_owed`, and `restore_if_owed(host, app_folder, trigger)`.
- Mirrors `restoreMacSteamOnlineIfOwed`: no record gives `NotOwed` and no URL; live foreign owner gives `KeptOwnerAlive` (record older than boot has no owner); stale `toggled-unconfirmed` marker with no late LogOff within 60 s is cleared as `NotOwed`; Steam not running gives `KeptNotRunning` (record kept); boot fires goonline and polls the log every 250 ms for up to 10 s for a new "processing complete" line (fallback: `Logged On` state since the record time) giving `Restored` (clears) or `RestoreUnconfirmed` (keeps); shutdown fires and clears without waiting. Non-macOS returns `NotOwed` without touching disk.
- A present-but-unreadable or newer-version file is still owed, its fields degrading to defaults (as in the TS reader).
- 13 tests (fake host, temp log, paused time); clippy `-D warnings` and fmt clean.

## Deviations from Plan

**1. [Rule 2 - small trait extension] `WrapHost` gained three methods beyond the three specified.**
`pid_alive(pid)` (required; the crate has no libc and TS's `isOwnUserPidAlive` needs it), plus defaulted `self_pid()`, `system_boot_unix_ms()` and `local_utc_offset_secs()`. The last matters: connection_log stamps local time and the crate has no tz library, so the shell implementation in 79-13/79-16 must override it (default 0 is UTC and would skew the late-logoff and `Logged On` fallback checks by the zone offset).

**2. Added `OwedPayer { host, app_folder }`** convenience wrapper for the shell. Not in the plan.

**3. Verify command syntax:** used `cargo test -p gamelib-steamcm --lib -- wrap::` as directed.

No `fake.rs` changes were needed. `NoWrap::pay_owed` in session.rs still returns `NotOwed`; 79-13 wires `restore_if_owed` through a LogonWrap/boot hook.

## Known Stubs

None. The wrap record writer (`write_owed`) exists for TS-compat and tests only; nothing in the PASS branch writes a record in production.

## Self-Check: PASSED

Task commit 6bf4033a9 exists; wrap.rs present; acceptance greps: owed filename count 1, `atomic` present, opener/`Command::new("open")` 0, `MacWrap` 0.
