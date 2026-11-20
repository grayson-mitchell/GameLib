---
phase: 72-renderer-trust-boundary-and-process-hardening
plan: 08
subsystem: sidecar
tags: [process-guards, uncaughtException, exit-contract]
requires: [72-05]
provides:
  - fatal uncaughtException guard with bounded flush
key-files:
  modified:
    - src/backend/sidecar/processGuards.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
key-decisions:
  - "uncaughtException is fatal: stderr + sink flush under a 1500 ms unref()-ed cap, then exit(1); re-entry exits immediately (D-04)"
  - "unhandledRejection stays log-only (D-04 discretion)"
requirements-completed: [D-04]
completed: 2026-11-08
---

# Phase 72 Plan 08: Fatal uncaughtException Summary

`installUncaughtExceptionGuard(target, exit)` now writes the error to stderr and the log sink, waits for both under a 1500 ms `unref()`-ed cap, then calls `exit(1)`; a second fault during handling exits immediately.

## Commit
- feat(72-08): make uncaughtException fatal with bounded unref'd flush (see `git log`)

## D-04 unhandledRejection choice: stays log-only
Reasons (recorded in the processGuards.ts header):
1. A rejection is the async failure of one promise chain, not an unwound call stack, so process state is not in doubt as it is after a sync throw.
2. The codebase fire-and-forgets many `void` calls; making rejections fatal would turn every missed `.catch` into a full backend death.
3. That death surfaces as the dead-sidecar dialog, which is the `sidecar-dialog-reject-crashes` incident.

## Notes
- `logError` returns void, so the bootstrap sink now calls the existing `logErrorSettled` (same severity, returns the writer promise). The bootstrap routing test spies `logErrorSettled` accordingly.
- The only `process.exit` in processGuards.ts is the default `exit` parameter; the "NEITHER guard may EVER terminate" doctrine was rewritten.
- Tests: shared harness loaders inject a mock `exit`; new D-04 cases cover exit(1) after sink resolves, never-resolving sink (fake timers + unref spy), throwing sink, re-entry, rejection non-fatal. The old "log-and-continue" test was replaced.
- `meta/sidecarStartupSmoke.cjs` and a test comment still mention the guard "pins exit 0"; now stale, harmless (not edited, out of plan files).

## Deviations from Plan
None beyond the `logErrorSettled` choice above.

## Verification
sidecarRejectionGuard + bootstrap jest green (60 tests), codecheck, build:sidecar, smoke:sidecar PASS, scoped prettier clean.

## Known Stubs
None.

## Self-Check: PASSED
