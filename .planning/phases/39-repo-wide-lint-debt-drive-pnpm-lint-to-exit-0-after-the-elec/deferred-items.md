# Deferred Items — Phase 39

Out-of-scope discoveries logged during plan execution, per the executor's Scope Boundary rule.
Not fixed here; recorded for a future plan to triage.

## From Plan 39-02

Two `pnpm test --selectProjects Backend` failures observed while verifying plan 39-02's Task 3,
in files this plan does not touch and did not modify. Confirmed pre-existing by running each
file's suite in isolation (same failures reproduce standalone, not induced by full-suite load)
and by `git status`/`git diff` showing zero pending changes to either file before this plan
started.

1. **`src/backend/storeManagers/steam/__tests__/decompressPool.test.ts`** — 3 failing assertions,
   all expecting `lzmaDecoderKind()` to report `'native'` and instead observing `'pure-js'`
   (e.g. `lzmaLoader (native-first decode with pure-JS fallback) › lzmaDecoderKind() reports
   "native" after a successful load on this dev machine`). Shape suggests the native lzma addon
   is not built/available in this dev sandbox, not a logic defect — but that is a hypothesis, not
   confirmed here.

2. **`src/backend/downloadmanager/__tests__/utils.test.ts`** — 1 failing assertion:
   `installQueueElement — 260817-dib: no-progress (stall) install watchdog › honest copy: a
   stall trip uses box.error.install.stalled and the dialog does not say "connection may be
   stale"`. The mock `t()` call is received with an i18n-namespace-prefixed key
   (`'gamelib:box.error.install.stalled'`) where the test expects the bare key
   (`'box.error.install.stalled'`) — looks like an i18next namespace-prefix convention drift
   versus this test's expectation, unrelated to any file plan 39-02 modified.

Both are out of scope for 39-02 (Scope Boundary rule) and were not fixed. Recorded here so a
later phase-39 plan (or a dedicated fix) picks them up rather than re-discovering them.
