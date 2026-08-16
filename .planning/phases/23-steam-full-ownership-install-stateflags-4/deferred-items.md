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

## Skip-and-warn policy for a Blocked key on a non-essential owned depot (G-23-01) — GATED on the official-Steam-client diagnostic

**Found during:** 23-04 Gate 2 Attempt 1 (KCD2, appId 1771300), diagnosed by
23-09's observability-only fix.

**Symptom:** KCD2's install aborted entirely because Steam returned `EResult 40
(Blocked)` for depot 1771304's decryption key. GameLib had selected 1771304 via
the package-ownership gate (`select.ts:174`), but owning a depot does not
guarantee Steam will issue its key — for region/DRM-gated depots, Steam
re-checks at key-request time and can return `Blocked` even for an owned
depot. `classifyDepotError` treats EResult 40 as non-retryable and fails the
WHOLE install (`depotErrors.ts`), rather than skipping a non-essential blocked
depot and continuing.

**Why out of scope this cycle:** User-locked decision (23-09-PLAN.md
objective): diagnostic + observability ONLY this cycle. Required-vs-optional
depot classification at selection time is an explicit non-goal — 23-09
shipped only a dedicated Blocked classification (`steam.download.error.depotBlocked`)
and a failure-site log naming the depot, so whatever the diagnostic finds, the
next occurrence is legible. No change to `select.ts`, to
`NON_RETRYABLE_ERESULTS`, or to any retry/abort behavior.

**The two branches the diagnostic decides** (23-10 Task 3 runs it — install
KCD2 in the OFFICIAL Steam client on this same account/region and observe
whether depot 1771304 downloads):

1. **Official Steam client ALSO cannot fetch depot 1771304** ⇒ genuine
   region/account block. Close `G-23-01` as not-a-bug — GameLib's
   fail-the-whole-install behavior is correct; there is no depot to skip
   because the official client can't get it either.
2. **Official client installs KCD2 fully** (silently skipping or substituting
   for 1771304, or the depot isn't actually required) ⇒ GameLib
   over-selection / hard-fail defect confirmed. Follow-up work: introduce a
   required-vs-optional depot distinction at selection time in
   `depot/select.ts`, plus a skip-and-warn path (continue the install, warn
   the user which depot was skipped) instead of a whole-install abort on a
   Blocked key for a non-essential depot.

**Recommendation / GATE: do not start this work until 23-10 Task 3 records the
diagnostic verdict.** The correct fix depends entirely on which branch the
diagnostic lands on — building the skip-and-warn selection-policy change
before knowing whether depot 1771304 is actually skippable would be guessing
at Steam's own selection rules.
