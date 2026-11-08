---
status: partial
phase: 72-renderer-trust-boundary-and-process-hardening
source: [72-VERIFICATION.md]
started: 2026-11-08T17:30:00+13:00
updated: 2026-11-08T17:30:00+13:00
---

## Current Test

[awaiting human testing]

## Tests

### 1. Windows: normal quit reaps the sidecar tree

expected: (D-20, 72-UAT item 6) Start a legendary/gogdl operation or a game, quit GameLib, and Task Manager shows no legendary.exe, gogdl.exe, nile, powershell.exe or game child left running.
result: pending (operator's Windows PC)

### 2. Windows: ending the shell process reaps the sidecar tree

expected: (D-20, 72-UAT item 7) With the same children running, end the GameLib shell in Task Manager and the children die with it (kill-on-close Job Object).
result: pending (operator's Windows PC)

### 3. Windows compile of 72-12 on CI

expected: After the next push, the rust-test windows-latest leg is green with the Job Object code compiled.
result: pending (not yet pushed)

### 4. Dead-sidecar Restart in a packaged build

expected: (D-01/D-02) After killing the sidecar in a packaged build, the dialog's Restart relaunches the shell and sidecar with a working UI. Tracked by todo 2026-11-08-verify-dead-sidecar-restart-in-packaged-build.
result: pending (dev-mode run relaunched process and sidecar; blank window attributed to the dead Vite devUrl)

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
