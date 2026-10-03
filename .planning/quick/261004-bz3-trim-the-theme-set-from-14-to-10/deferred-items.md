# Deferred items — 261004-bz3

Out-of-scope discoveries logged per the SCOPE BOUNDARY rule (not fixed here).

## 1. `meta/__tests__/genI18nGateScope.test.ts` — committed scope snapshot off by one (pre-existing)

**Tests failing:** `A0 fixture sanity`, `A2 ... fork-touched snapshot`, `A3 NON-VACUITY /
POSITIVE CONTROL`, `A4 BOOTSTRAP` — all assert the live/derived file count against a
hardcoded `215`, and all currently measure `214`.

**Confirmed pre-existing, not caused by this task:** ran the two failing suites with
every file this task touched stashed out (`git stash push -u` over all 15 Task-2 files,
before Task 3's locale edits existed) and re-ran
`npx jest meta/__tests__/genI18nGateScope.test.ts meta/__tests__/isTauriRemoved.test.ts`
against that baseline. Same failures, same `215` vs `214` mismatch, confirming this
predates every edit in this plan. This matches the same drift class recorded by quick
task 261002-b63's own `deferred-items.md` (`A-17` mismatch there) — the committed
i18n-gate-scope snapshot is a known standalone source of drift, independent of this
plan's theme work. Neither Task 1, 2, nor 3 touches `meta/i18nGateScope.json`,
`meta/i18nForkTouchedFiles.json`, or any file `genI18nGateScope.ts` derives its count
from.

**Disposition:** Not fixed here — out of scope. The fix is a standalone
`pnpm gen-i18n-gate-scope`-family regeneration, unrelated to trimming the theme set.

## 2. `meta/__tests__/isTauriRemoved.test.ts` — one surviving comment mention (pre-existing)

**Test failing:** `D-01/D-00b: isTauri static zero-match completeness gate`.

**Observed:** `src/frontend/screens/WebView/index.tsx:528` contains a comment
mentioning `isTauri` as one of several injected globals being discussed
(`` `isTauri`, `__TAURI__` ``), not a live code reference.

**Confirmed pre-existing:** same stash-and-rerun method as item 1 — failure reproduces
identically with this plan's edits removed. This task never touches
`src/frontend/screens/WebView/index.tsx`.

**Disposition:** Not fixed here — out of scope, unrelated file.

## 3. `src/backend/sidecar/__tests__/appShellFlows.test.ts` — flaky only under the full parallel suite

**Test:** `260922-v2e: detectVCRedist wiring › a synchronous throw from detectVCRedist
does not skip initQueue(true) scheduled at 5s (ordering, D2)` — observed `toHaveBeenCalledTimes`
expected 1, received 2, in exactly one full-suite `npx jest` run (post Task 3, 467 suites).

**Confirmed flaky, not a regression:** re-ran the single test with `-t` and re-ran the
entire file standalone — both report 47/47 (file-level) / 3/3 (targeted) passing, zero
failures. This task touches no backend/sidecar code at all (every edited file in Tasks
1-3 is under `src/frontend/`, `public/locales/`, or `meta/`), so there is no code-path
by which this plan could affect fake-timer ordering in that test. Consistent with
test-order/parallel-worker-load flakiness in a fake-timers test, not a real defect in
this plan's scope.

**Disposition:** Not fixed here — out of scope, no plausible causal link, and not
reproducible in isolation.
