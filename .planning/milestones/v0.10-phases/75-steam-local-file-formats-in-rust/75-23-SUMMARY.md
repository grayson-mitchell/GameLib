---
phase: 75-steam-local-file-formats-in-rust
plan: 23
subsystem: steam
tags: [steam, depot, acf, rust-migration]
requires: [75-19, 75-21, 75-22]
provides:
  - rustFinalize helper over depot_finalize
  - zero-depot install finalize and failed-resume finalize routed to Rust under GAMELIB_STEAMFILES_TEXT=rust
key-files:
  modified:
    - src/backend/storeManagers/steam/depotRust/rustDepot.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustDepot.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
requirements-completed: [STEAM-03, P75-D, P75-F]
duration: 25min
completed: 2026-11-14
---

# Phase 75 Plan 23: Rust finalize call sites Summary

Both remaining TS ACF writers (zero-depot install finalize and failed-resume-verify finalize) now call `depot_finalize` through a new `rustFinalize` helper under the rust text flag; the ts flag still runs `finalizeToSteam` until the delete gate.

## Commits
- 'feat(75-23)': rustFinalize + install.ts + resume.ts
- 'test(75-23)': rustDepot, rustInstall and resume (library.test.ts) rust-branch tests

## Decisions
- allowFullOwnership false on both paths; install sends outcome 'cancelled' only when aborted, resume sends null; buildid '' -> null; resume uses buildid null (it has none); betaKey only for non-public.
- An `{ error }` result throws; install propagates it to its existing catch, resume swallows it in its existing catch.
- A `{ preserved }` result is logged with the "leaving it untouched" wording.

## Deviations from Plan
- [Rule 3] The resume tests live in `steam/__tests__/library.test.ts` (the `startup resume reconciliation` block), not `library.resume.test.ts` (which only covers restart holds), so the resume rust-branch cases were added there. I added `logDebug: jest.fn()` to that file's existing logger mock factory (no new `jest.mock` calls) because `invokeSteamFiles` calls it under the rust flag. DI ceilings stay at 20 FAIL lines.
- The "aborted signal sends cancelled" install test was dropped: abort between the plan and the finalize call cannot be reached (an abort during the plan throws before the finalize), so the `cancelled` outcome path is covered only by the helper's pass-through test in rustDepot.test.ts.

## Verification
depotRust, localFiles and library.test.ts Jest suites pass (130 tests); prettier clean; tsc errors only in another session's library.refresh.test.ts; backend-di-ceilings 20 FAIL (unchanged).

## Self-Check: PASSED
