# Deferred Items — Phase 31

Out-of-scope discoveries logged during plan execution (not fixed, per the
executor's scope-boundary rule: only auto-fix issues directly caused by the
current task's changes).

## Plan 31-01

- **Pre-existing eslint error in `src/backend/sidecar/electronStub.ts`**
  (`@typescript-eslint/no-redundant-type-constituents`, `'unknown' overrides
  all other types in this union type`) on the `IpcHandler` type's
  `) => unknown | Promise<unknown>` return type. Confirmed pre-existing via
  `git stash` + `npx eslint` against the committed HEAD version of the file
  (error present before any Plan 31-01 change touched this file). Unrelated
  to this plan's `process.getSystemVersion` polyfill addition (which lands
  earlier in the same file but does not touch the `IpcHandler` type). Not
  fixed — out of scope for this plan.

## Plan 31-02

- **Flaky `bootstrap.test.ts` failure when run alongside the full
  `src/backend/sidecar` suite**: `round-trips a health/ping invoke frame over
  stdio` intermittently throws `ENOENT: no such file or directory, rename
  '.../Library/Logs/GameLib/gamelib.log' -> '.../gamelib.log.old'` from
  `LogWriter._LogWriter_archiveOldLogFile`. Reproduces only under
  `npx jest src/backend/sidecar` (full directory run); passes reliably in
  isolation (`npx jest .../bootstrap.test.ts` alone, both before and after
  this plan's changes via `git stash`). Caused by real-filesystem log-file
  state shared across test files (same family as the memory note "Tests
  clobbering real Steam store"), not by this plan's dialog/electronStub
  changes. Not fixed -- out of scope for this plan.
