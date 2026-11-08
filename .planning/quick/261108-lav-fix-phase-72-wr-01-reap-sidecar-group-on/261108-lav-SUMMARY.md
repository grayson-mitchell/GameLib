---
phase: quick-261108-lav
plan: 01
subsystem: tauri-shell
tags: [sidecar, process-group, WR-01]
requirements: [WR-01]
key-files:
  modified: [src-tauri/src/sidecar.rs, src-tauri/src/shell_state.rs, src-tauri/src/main.rs, src/backend/__tests__/sidecarShutdownFlagSource.test.ts]
completed: 2026-11-08
---

# Quick 261108-lav: Reap dead sidecar's process group (WR-01)

Dead-sidecar path now unconditionally SIGKILLs the sidecar's process group (unix) or drops the kill-on-close Job (Windows) before the "GameLib stopped working" dialog, even when the sidecar already exited via exit(1). Commit: 750d386fb.

## What changed
- `kill_process_group(pgid)` (cfg(unix)) in sidecar.rs; refuses pgid <= 1 (no kill(-1)/kill(0)).
- `SidecarState::reap_dead_sidecar_tree` + `tree_reaped` latch in shell_state.rs; group kill happens before `child.wait()` so the zombie leader pins the pgid.
- `shutdown_child` skips its unix SIGTERM/SIGKILL once `tree_reaped` is set (stale pgid may be recycled while the dialog is open).
- `surface_dead_sidecar` replaced its try_wait/`!gone` block with one `reap_dead_sidecar_tree()` call.
- Tests: 3 unix cargo tests; jest pin describe "dead-sidecar tree reap (WR-01)".

## Planner finding (recorded as required)
The review's "Restart skips RunEvent::Exit" sub-claim is wrong for this call site. In tauri 2.11.5, `AppHandle::restart()` skips exit events only on the main thread. `surface_dead_sidecar` runs on the reader thread, so restart() takes the background branch (request_exit with restart_on_exit), which fires RunEvent::Exit and the single shutdown_child call site before the process restarts (REQ-34.3-06 / D-05). Therefore NO extra shutdown_child call was added (it would break the single-call-site pin). The tree is reaped pre-dialog anyway; the Windows job drop is now also pre-dialog.

## Deviations
- [Rule 1 - Test bug] `kill_process_group_on_empty_group_is_esrch`: on macOS a killed-but-unreaped zombie member makes the second kill return EPERM, not ESRCH. The test now polls up to 5 s for ESRCH and accepts ESRCH or EPERM at the end.

## Verification
- `cargo test --bin gamelib-shell`: 441 passed, 0 failed.
- Clippy ratchet (1.99.1): PASS (darwin).
- jest: sidecarShutdownFlagSource passes; tauriShellSource shows only the pre-existing WR-07 `.title(` failure.
- Prettier: `.rs` files have inferredParser null (not formattable), so the check ran only on the `.ts` file: clean.
- Optional live check (not run): `pnpm tauri:dev`, `kill -9` the sidecar node pid, confirm `ps -g <pgid>` is empty before clicking the dialog.

## Self-Check: PASSED
