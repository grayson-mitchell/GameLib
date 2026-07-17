# Deferred Items — Phase 23

## `pnpm test:ci` exits 1 after all tests pass (pre-existing, out of scope for 23-02)

**Found during:** 23-02 Task verification (`pnpm test:ci` full-suite gate).

**Symptom:** Jest reports `Test Suites: 78 passed, 78 total` / `Tests: 1421 passed, 1421 total`
(every assertion passes), then the process fails to exit cleanly and crashes ~1s later with:

```
Jest did not exit one second after the test run has completed.
TypeError: Cannot read properties of undefined (reading 'map')
    at readAcfState (src/backend/storeManagers/steam/library.ts:721:52)
    at pollInstallOnce (src/backend/storeManagers/steam/library.ts:820:20)
    at Timeout._onTimeout (src/backend/storeManagers/steam/library.ts:951:9)
```

This is a stray `setTimeout`/polling timer left running by some test in
`library.test.ts` (Phase 21's `pollInstallOnce`/`readAcfState`/`startInstallPolling`
poller) that fires after the Jest process believes the run is complete, at which
point a mocked module dependency (`getSteamLibraries`) has already been torn down —
hence the `undefined.map` crash. It causes `pnpm test:ci` to exit with code 1 even
though every test passed.

**Why out of scope for 23-02:** `library.ts`'s poller functions and `library.test.ts`
are not in this plan's `files_modified` list, were not touched by any of the three
tasks (`canWriteFullOwnership`, `finalizeToSteam` de-gating, `manifest.ts` buildid
guard), and the scope-boundary rule ("only auto-fix issues DIRECTLY caused by the
current task's changes") applies. This class of "poller keeps running past test
teardown" behavior is a known Phase 21 area (`pollInstallOnce`/`readAcfState`) —
see `.planning/phases/21-steam-native-install/21-08-PLAN.md` for the poller's
history — not something 23-02 introduced.

**Verification that it's pre-existing, not a regression:** the crash trace involves
only `library.ts` internals never edited by 23-02 (`depot.ts`, `depot/manifest.ts`,
`nativeInstallSetting.ts`, and their respective test files were the only files
touched). All 1421 individual test assertions pass before the crash — it is a
teardown/process-exit issue, not a functional test failure.

**Recommendation:** Track as a separate fast-task or fold into a future
`library.test.ts` cleanup pass — likely needs a `jest.useFakeTimers()` +
`jest.clearAllTimers()` (or an explicit `stopInstallPolling`/interval-clear call
in `afterEach`) around whichever test starts `pollInstallOnce`'s interval without
stopping it.
