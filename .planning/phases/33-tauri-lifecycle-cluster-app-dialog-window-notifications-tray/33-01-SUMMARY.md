---
phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray
plan: 01
subsystem: downloadmanager
tags: [steam, install-hang, watchdog, timeout, dialog, regression-tests, G-30-02]

# Dependency graph
requires:
  - phase: 30-tauri-lifecycle (30-07 gap closure)
    provides: withTimeout/isTimeoutError helper + all pre-download PICS call bounds
  - phase: 32-tauri-ipc-downloads-queue
    provides: the real .install() await location moved to downloadmanager/utils.ts
provides:
  - installQueueElement finally-guard now clears the "installing" badge on any
    Steam status:'error' outcome (resolved OR thrown), not just abort/deferred
  - A coherent Steam install-failure dialog (showDialogBoxModalAuto) paired with
    every badge-clear-on-error, using the existing legendary-offline dialog shape
  - A belt-and-suspenders INSTALL_WATCHDOG_MS (8min) wrap around the whole
    .install() await, converging never-settling installs onto the same
    terminal-error surface
  - A guarded logWarning when a non-Steam install carries installDlcs (WR-02/D-11
    declared boundary, no silent drop)
  - 11-case regression suite in utils.test.ts covering resolved-error, thrown-error,
    abort, watchdog-trip, watchdog-non-trip, and non-Steam DLC-guard paths
affects: [33-05 (live-hardware proof of G-30-02, D-13), any future downloadmanager/utils.ts work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hoist a try-scoped destructured value (status/error) to an outer let so a
      finally block that previously couldn't see it now can, instead of adding
      new state machinery"
    - "withTimeout(...) wraps a whole multi-step await (install()), not just a
      single RPC round-trip, reusing the exact Phase 30 helper with no new
      timeout primitive"

key-files:
  created: []
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts

key-decisions:
  - "Kept the watchdog bound runner-agnostic (not gated to steam-only) at 8
    minutes, per 33-RESEARCH's lower-risk recommendation since Electron's install
    path has never hung this way"
  - "Failure dialog fires only on status:'error' (resolved or thrown), never on
    'abort' — a user-initiated cancel is not a failure and should not get an
    error dialog (verified by a dedicated regression test)"
  - "Renamed the outer status-tracking variable to `status` (not `installStatus`)
    to keep the plan's literal grep/pattern acceptance criteria (`status ===
    'error'`) matching the actual finally-guard condition, not just a
    semantically-equivalent renamed variable"

patterns-established:
  - "Terminal-error convergence: resolved-error / thrown-error / watchdog-timeout
    all set the same two outer variables (status='error', installErrorReason)
    before reaching one shared finally-block badge-clear + dialog block"

requirements-completed: [REQ-33-02, REQ-33-03, REQ-33-04, REQ-33-11]

# Metrics
duration: ~20min
completed: 2026-07-24
---

# Phase 33 Plan 01: Steam install-error badge-clear + watchdog + WR-02 DLC guard Summary

**Closed the visible half of the G-30-02 live install-hang: installQueueElement's finally-guard now clears the "installing" badge and shows a failure dialog on any Steam install error (resolved or thrown), backed by a belt-and-suspenders 8-minute watchdog around the whole `.install()` await.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed (5 commits: test/feat/test/feat/test — Task 1 and 2 each ran RED→GREEN; Task 3 is test-only)
- **Files modified:** 2

## Accomplishments

- The root cause identified in 33-RESEARCH ("Why the live hang persisted despite 30-07") is fixed: a Steam install that settles as `status: 'error'` (or throws) now unconditionally clears the badge via the `installQueueElement` finally-guard, instead of silently relying on an ACF poller that never starts for an error outcome.
- Per D-03, the badge-clear is paired with a failure dialog (`showDialogBoxModalAuto`) using the exact shape already established for the legendary-offline-error branch — one coherent error story, not two divergent UX paths.
- A new `INSTALL_WATCHDOG_MS` (8 minutes) wraps the entire `.install()` await via the existing `withTimeout`/`isTimeoutError` helpers (Phase 30, no new timeout primitive), so any other never-settling downstream await inside `install()` also force-terminates down the same terminal-error surface, distinguishable from an ordinary rejection.
- WR-02/D-11: a non-Steam install carrying `installDlcs` now logs a guarded `logWarning` declaring the Steam-focused install path's DLC re-scope, instead of silently dropping the DLC list.
- Regression coverage grew from 5 to 11 tests in `utils.test.ts`, closing the exact coverage gap (resolved-error path, thrown/rejected path, watchdog-trip path) that let the original WR-01 gap ship undetected.

## Task Commits

Each task was committed atomically (TDD RED/GREEN pairs for Tasks 1 & 2):

1. **Task 1: Clear the badge + show a failure dialog on Steam install error; guard non-Steam DLC drop**
   - `9037807b` (test) — RED: flip the "genuine ERROR is unaffected" regression guard to assert badge-clear, add dialog + WR-02 guard-log assertions, extend the test i18next mock to interpolate `{{token}}` placeholders
   - `5e1e654f` (feat) — GREEN: extend the finally-guard condition to `status === 'error'`, add the paired failure dialog, add the WR-02 guarded DLC-drop log, hoist `status`/error-reason tracking to outer scope
2. **Task 2: Wrap the real `.install()` await in a bounded watchdog**
   - `7a5bae4b` (test) — RED: add never-settling-install and normal-resolve-inside-bound watchdog tests (fails: test hangs past jest's default timeout with no watchdog present)
   - `1a98cb6a` (feat) — GREEN: wrap the `.install()` call in `withTimeout(..., INSTALL_WATCHDOG_MS, ...)`, distinguish a watchdog trip via `isTimeoutError()` in the catch block, route to the same terminal-error surface
3. **Task 3: Extend the error-path regression test (WR-03/D-12)**
   - `60d7f413` (test) — add the throw/reject-path regression test (the one path not yet exercised by resolved-status tests) and an explicit "abort gets no dialog" regression guard

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `src/backend/downloadmanager/utils.ts` — `installQueueElement`'s finally-guard now fires on `status === 'error'`; paired failure dialog; `INSTALL_WATCHDOG_MS` watchdog wrap around `.install()`; WR-02 guarded DLC-drop log
- `src/backend/downloadmanager/__tests__/utils.test.ts` — grew from 5 to 11 test cases (error-badge-clear, failure-dialog, WR-02 guard-log, watchdog-trip, watchdog-non-trip, throw/reject-path, abort-gets-no-dialog); extended the shared `i18next` test mock to interpolate `{{token}}` placeholders so dialog-message assertions can check real interpolated content

## Decisions Made

- Kept the watchdog bound runner-agnostic (applies to every runner, not gated to `runner === 'steam'`) at 8 minutes — per 33-RESEARCH's lower-risk recommendation, since the Electron-side install path has never exhibited this hang class, and a generous bound (well above the ~5.3min worst-case pre-download sum) cannot false-trip a legitimately slow non-Steam install.
- The failure dialog fires only for `status === 'error'`, never for `'abort'` — a user-initiated cancel already had correct badge-clear behavior (Phase 21/22 wasAborted fix) and should not additionally surface an error dialog. Verified by a dedicated regression test asserting `showDialogBoxModalAuto` was NOT called for an abort outcome.
- Renamed the outer status-tracking variable to `status` (shadowing the try-scoped destructure via a separate `resultStatus` binding) rather than a distinctly-named `installStatus`, specifically so the plan's literal acceptance-criteria grep (`status === 'error'`) matches the actual finally-guard condition text, not just an equivalent-but-differently-named variable.

## Deviations from Plan

None — plan executed exactly as written. The one adjustment (renaming `installStatus` back to `status` mid-implementation) was a self-correction to satisfy the plan's own literal acceptance criteria pattern, not a deviation from its intent.

## Issues Encountered

- The test file's `jest.mock('i18next', ...)` mock originally returned the raw fallback string with unresolved `{{token}}` placeholders, which broke the new dialog-message assertion (`expect.stringContaining('Steam connection stale, try again')`). Fixed by extending the mock's `t()` implementation to interpolate `{{key}}` tokens from the options argument, matching real i18next's behavior — this is now more accurate test infrastructure, not a workaround.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- This plan's fix is code-complete and unit-verified; live hardware proof of the G-30-02 install-hang closure is explicitly gated to Plan 33-05 (D-13) per this plan's own `<objective>` — do not consider G-30-02 closed until that live retest passes.
- No blockers for the remaining Phase 33 plans (electronStub dialog/notification/shell/app-lifecycle work is independent of this plan's downloadmanager changes).

---
*Phase: 33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: src/backend/downloadmanager/utils.ts
- FOUND: src/backend/downloadmanager/__tests__/utils.test.ts
- FOUND: 9037807b (test — Task 1 RED)
- FOUND: 5e1e654f (feat — Task 1 GREEN)
- FOUND: 7a5bae4b (test — Task 2 RED)
- FOUND: 1a98cb6a (feat — Task 2 GREEN)
- FOUND: 60d7f413 (test — Task 3)
