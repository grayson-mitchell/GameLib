---
status: complete
phase: 72-renderer-trust-boundary-and-process-hardening
source: [72-VERIFICATION.md]
started: 2026-11-08T17:30:00+13:00
updated: 2026-11-11T17:00:00+13:00
---

## Current Test

[testing complete]

## Tests

### 1. Windows: normal quit reaps the sidecar tree

expected: (D-20, 72-UAT item 6) Start a legendary/gogdl operation or a game, quit GameLib, and Task Manager shows no legendary.exe, gogdl.exe, nile, powershell.exe or game child left running.
result: pass. See 72-UAT item 6 (2026-11-11): a normal quit with Balrum running under gogdl left no sidecar, gogdl or game process behind.

### 2. Windows: ending the shell process reaps the sidecar tree

expected: (D-20, 72-UAT item 7) With the same children running, end the GameLib shell in Task Manager and the children die with it (kill-on-close Job Object).
result: pass. See 72-UAT item 7 (2026-11-11): Balrum closed the moment the shell was killed. gogdl.exe was still listed by an immediate `Get-Process` and gone within about a minute; its teardown time was not measured.

### 3. Windows compile of 72-12 on CI

expected: After the next push, the rust-test windows-latest leg is green with the Job Object code compiled.
result: pass. Rust test run 42952556201 on 847c0849f (2026-11-11): the cargo-test (windows-latest) job passed with the 72-12 Job Object code (dadef07e7) compiled in.

### 4. Dead-sidecar Restart in a packaged build

expected: (D-01/D-02) After killing the sidecar in a packaged build, the dialog's Restart relaunches the shell and sidecar with a working UI. Tracked by todo 2026-11-08-verify-dead-sidecar-restart-in-packaged-build.
result: pass. macOS, 2026-11-10: packaged `tauri build --debug`; see the todo's Resolution. Windows, 2026-11-11, operator's PC: `pnpm tauri:dev:packaged` at 076fd3044. The installer step failed on updater signing (no `TAURI_SIGNING_PRIVATE_KEY`), but `gamelib-shell.exe` had already been compiled and was run directly. Killing the sidecar (`node build/main/sidecar.js`, pid 18032, child of shell 4948) with `Stop-Process -Force` raised the dialog. Restart brought up a new shell (11972) with a new sidecar (12760, its child), and the operator confirmed the UI loaded and worked. This debug build runs the sidecar with node, not the SEA binary, on both OSes. The Windows build writes no shell log, so the restart exit code was not observed.

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
