---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 10
subsystem: shell
tags: [sidecar, shutdown, dialog, tauri, exit-contract]
requires: [72-08, 72-09]
provides:
  - begin_shutdown flag distinguishing deliberate exit from sidecar death
  - dead-sidecar Restart/Quit dialog
key-files:
  modified:
    - src-tauri/src/shell_state.rs
    - src-tauri/src/sidecar.rs
    - src-tauri/src/main.rs
    - src-tauri/src/store_embed.rs
  created:
    - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
requirements-completed: [D-01, D-02, D-03, D-05]
completed: 2026-11-08
---

# Phase 72 Plan 10: Dead-sidecar dialog Summary

A shutdown flag set at every deliberate exit entry lets the shell tell sidecar death from quit, and a sidecar death now raises a single Restart/Quit dialog.

## Commits
- Task 1 `feat(72-10): surface a dead sidecar with a Restart/Quit dialog` (b826a555b)
- Task 2 `test(72-10): pin begin_shutdown at every exit entry` (e9776fe6f)
- Task 3 live macOS check: approved (no commit)

## What changed
- `begin_shutdown` flag in shell state, EOF seam in the sidecar reader, dialog, and exit-arm wiring.
- Source-pin test asserting `begin_shutdown` is called at every exit entry.

## Task 3 live check (macOS, operator-approved)
Steps 1-5 passed: no dialog on Cmd+Q, tray quit or red X; `kill -9` of the sidecar shows "GameLib stopped working" once; Quit exits the app and leaves no sidecar.

Restart, under `tauri dev`: PASS for process and sidecar relaunch (gamelib-shell pid 14012, new sidecar pid 14074, signInProbe pass complete at 15:00:20 with legendary/gog/steam healthy). The window was blank with a webview load error because `app.restart()` exits the process, `tauri dev` then tears down its Vite server, and the relaunched binary's webview points at the dead devUrl. This is a dev-mode artifact; packaged builds embed the frontend. The UI-after-restart half is unverified in a packaged build.

Step 6 (72-08 uncaught-exception trigger) was not exercised.

## Deviations
None to the code. Verification gaps are tracked in `.planning/todos/pending/2026-11-08-verify-dead-sidecar-restart-in-packaged-build.md`.

## Self-Check: PASSED
