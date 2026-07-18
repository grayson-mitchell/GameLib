# Deferred Items — Quick Task 260719-aog

Items discovered during execution that are out of scope for this task (not caused by this
task's changes) and were logged rather than fixed, per the executor's scope-boundary rule.

## 1. Leaked real `setInterval` crashes a Jest worker asynchronously after `library.test.ts` completes

**Status:** Pre-existing, confirmed NOT introduced by this task.

**Symptom:** Running `pnpm test src/backend/storeManagers/steam` prints:

```
TypeError: Cannot read properties of undefined (reading 'map')
    at readAcfState (.../library.ts:...)
    at pollInstallOnce (.../library.ts:...)
    at Timeout._onTimeout (.../library.ts:...)
```

between `library.test.ts`'s own `PASS` line and `depot.test.ts`'s `PASS` line. It does not fail
the run (`Tests: 648 passed, 648 total`, exit code 0 — reproduced twice for determinism) but
indicates a real (non-fake-timer) `setInterval` from `startInstallPolling` outliving its test's
`afterEach`/`jest.useRealTimers()` teardown, then firing later against a torn-down module mock
(`getSteamLibraries` resolves to `undefined`).

**Root cause (identified, not fixed):** `library.test.ts:2627` —
`startInstallPolling('730', { source: 'bottle' })` — omits `intervalMs`, so it defaults to the
real 3000ms interval. Every OTHER `startInstallPolling` call in this test file (12 occurrences
before this quick task, 15 after) deliberately passes a large `intervalMs` like `60000` or
`{ intervalMs: 60000, ... }` specifically so the real interval never fires during the test's own
fake-timer window. This one call at line 2627 is the outlier.

**Confirmed pre-existing:** `git show HEAD:src/backend/storeManagers/steam/__tests__/library.test.ts | grep -c "60000"` returned 12 (before this task's edits added 3 more `60000` calls of my own, all following the safe convention). The line 2627 call and its surrounding test (`describe('17-03: startInstallPolling(appId, { source: 'bottle' })')`) both predate this quick task entirely — I did not touch that describe block.

**Why deferred:** Unrelated to the `pollInstallOnce` speed/ETA/paused-state changes this quick
task shipped. Fixing it would mean editing a pre-existing, unrelated test (line 2627) outside
this task's file scope — out of bounds per the SCOPE BOUNDARY rule ("Only auto-fix issues
DIRECTLY caused by the current task's changes").

**Suggested fix (for a future task):** Change `startInstallPolling('730', { source: 'bottle' })`
at library.test.ts:2627 to `startInstallPolling('730', { intervalMs: 60000, source: 'bottle' })`,
matching every other call site's convention.
