# Deferred Items — Phase 32

Out-of-scope discoveries logged during plan execution (not fixed, per the
executor's scope-boundary rule: only auto-fix issues directly caused by the
current task's changes).

## From Plan 32-01

- **Pre-existing `handlers.ts` lint errors (2x `@typescript-eslint/no-unnecessary-type-assertion`)**
  — present in `src/backend/sidecar/handlers.ts` before this plan's edits
  (confirmed via `git stash`/`eslint` diff: identical 2 errors + 3 warnings on
  the pre-existing file, just at different line numbers after this plan added
  two lines). Unrelated to the `registerDownloadQueueFlows()` import/call this
  plan added. Not fixed — out of scope.
- **`storeLayer.test.ts` "Cannot log after tests are done" console warning** —
  benign, non-failing Jest console-after-teardown warning surfaced by the full
  `src/backend/sidecar` test-suite run. Root cause: `storeLayer.test.ts`
  imports `../handlers` directly (a pre-existing pattern in that file, not
  introduced by this plan) to exercise store-layer channels without ever
  calling `bootstrap.ts`'s `init()`/`initLogger()`. This plan's new
  `registerDownloadQueueFlows()` D-05 log line is deferred via `setImmediate`
  and falls back to `console.info` (try/catch) when `heroicLogWriter` was
  never assigned in that process — the fallback console call can fire after
  that test file's own suite has already finished. No test failure results
  (87/87 suites, 1820/1820 tests pass); this is cosmetic Jest noise in an
  edge-case import path, not a functional regression.
