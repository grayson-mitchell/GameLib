---
quick_id: 260905-mv5
phase: quick-260905-mv5
plan: '01'
subsystem: backend
tags: [steam, getGameInfo, fallback-title, ipc, tdd]
requires:
  - phase: quick-260905-luf
    provides: resolveGameTitle (D-01 sentinel fallback chain, DownloadManager-scoped)
provides:
  - src/backend/utils/gameTitle.ts (single title-fallback chain, zero runtime imports)
  - resolveTitleForGame(game, appName) for Game-instance display-string callers
  - D-03 guard (return false + logWarning) on both shortcutsExists handlers
affects: [backend/utils, backend/downloadmanager, backend/shortcuts, backend/sidecar]
tech-stack:
  added: []
  patterns:
    - "zero-runtime-import module (import type only) to break a two-way circular dependency"
    - "handlerRegistry/listenerRegistry plain Maps (not jest.fn capture) to read IPC handler registrations under resetMocks:true"
    - "precedence-swap revert to RED-prove a 'live value still wins' no-regression assertion"
key-files:
  created:
    - src/backend/utils/gameTitle.ts
    - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/utils.ts
    - src/backend/launcher.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/shortcuts/ipc_handler.ts
    - src/backend/sidecar/shortcutsFlowRegistration.ts
    - src/backend/__tests__/askForceUninstall.test.ts
    - src/backend/sidecar/__tests__/installFlows.test.ts
    - src/backend/sidecar/__tests__/shortcutsFlows.test.ts
key-decisions:
  - "D-02: relocated resolveGameTitle into a new zero-runtime-import module (gameTitle.ts) instead of importing downloadmanager/utils.ts from utils.ts, to avoid closing a two-way cycle"
  - "D-03: shortcutsExists (both Electron and sidecar) returns false + logWarning instead of resolving a fallback title, because its title feeds a filesystem path (shortcutFiles), not a display string -- a synthesized fallback would probe a path addShortcuts never wrote (sanitize('') collapses to a SHARED ~/Applications/.app path on darwin)"
requirements-completed: [QUICK-MV5-01]
metrics:
  duration: ~51min
  completed: 2026-09-05
---

# Quick Task 260905-mv5: Fix the 4 sibling unguarded getGameInfo() title consumers Summary

**Relocated the 260905-luf title-fallback chain into a zero-runtime-import module and applied it (or its filesystem-path-safe D-03 variant) to the 4 remaining getGameInfo() call sites left unguarded: the force-uninstall dialog, the uninstall-failure notification, and both Electron/sidecar shortcutsExists handlers.**

## Performance

- **Tasks:** 3/3 completed
- **Files modified:** 9 (2 new: `gameTitle.ts`, `shortcutsExistsFallback.test.ts`)
- **Completed:** 2026-09-05

## Task 1 Re-verification (mandatory premise re-check)

Task 1's action step required re-measuring the three facts D-03's design rests on before trusting it, and to STOP if any disagreed with the plan's recorded evidence. All three matched exactly:

| # | Measurement | Plan's recorded value | Actual observed value | Match? |
|---|---|---|---|---|
| 1 | `shortcutFiles(undefined as unknown as string)` | THROWS `Input must be string` | THROWS `Input must be string` | YES |
| 2 | `shortcutFiles('')` | Returns a real non-empty path pair; on darwin, `desktopFile === menuFile` (a SHARED `~/Applications/.app` path) | Returned `[path, path]`, both truthy and equal, matching the shared-path prediction | YES |
| 3 | `addShortcuts({} as GameInfo)` | THROWS/rejects at `is_dlc`, before ever reaching `shortcutFiles` | `addShortcuts` is `async` -- the throw surfaces as a promise REJECTION, confirmed via `.rejects.toThrow()` | YES |

Mock-factory census (evidence item 8) re-run per Task 1 step 3, confirmed unchanged at exactly 3 sites: `downloadqueue.test.ts:119` (`jest.mock('../utils', ...)`), `downloadQueueFlows.test.ts:173` (`jest.mock('../../downloadmanager/utils', ...)`), `utils.test.ts:112` (direct un-mocked import of `resolveGameTitle`). No fourth consumer appeared.

## Per-Site Table

| Site | File | Contract | Fix applied |
|---|---|---|---|
| 1 | `backend/utils.ts` (`askForceUninstall`) | Display string (dialog title) | Widened to `askForceUninstall(game, appName)`; delegates to new `resolveTitleForGame(game, appName)` |
| 2 | `backend/utils/uninstaller.ts` (`uninstallGameCallback`) | Display string (OS notification title, both its error- and success-branch `notify()` calls) | Replaced bare `const { title } = game.getGameInfo()` with `resolveGameTitle(libraryManagerMap, runner, appName)` |
| 3 | `backend/shortcuts/ipc_handler.ts` (`shortcutsExists`, Electron) | Filesystem path component (`shortcutFiles(title)`) | D-03: on falsy `title`, `logWarning(...)` naming `appName`/`runner`, then `return false` WITHOUT calling `shortcutFiles` |
| 4 | `backend/sidecar/shortcutsFlowRegistration.ts` (`shortcutsExists`, sidecar) | Filesystem path component (identical contract to site 3) | Identical D-03 guard, cross-referencing the Electron original rather than restating |

Sites 1/2 deliberately use `resolveTitleForGame`/`resolveGameTitle` (the `||` fallback chain); sites 3/4 deliberately do NOT, since a synthesized fallback title there would probe a plausible-looking path the writer never wrote (T-mv5-02).

`src/backend/utils/gameTitle.ts` is the new, single home for both functions: zero runtime imports (everything is `import type`), which is what makes it importable from `backend/utils.ts` without closing the cycle proven in the plan's evidence item 6 (`backend/downloadmanager/utils.ts` imports FROM `backend/utils.ts`). `resolveGameTitle` is re-exported unchanged from `backend/downloadmanager/utils.ts` so its 3 existing consumers keep working with unmodified mocks.

## RED-Proof Ledger

| # | File / Test | Revert used | Observed failure |
|---|---|---|---|
| 1 | `askForceUninstall.test.ts`, site-1 RED-proof | (Task 1, pre-fix) production code unmodified — `askForceUninstall` still destructured `game.getGameInfo()` directly | `dialogOptions.title` was `undefined`; `toBeTruthy()` failed |
| 2 | `installFlows.test.ts`, site-2 RED-proof | (Task 1, pre-fix) `uninstallGameCallback` still destructured `game.getGameInfo()` directly | `notifyArg.title` was `undefined`; `toBeTruthy()` failed |
| 3 | `shortcutsExistsFallback.test.ts`, site-3 RED-proof | (Task 1, pre-fix) `shortcutsExists` still called `shortcutFiles(title)` unconditionally | Rejected with `[Error: Input must be string]` |
| 4 | `shortcutsFlows.test.ts`, site-4 RED-proof | (Task 1, pre-fix) sidecar `shortcutsExists` still called `shortcutFiles(title)` unconditionally | Rejected with `[Error: Input must be string]` (identical to site 3) |
| 5 | `askForceUninstall.test.ts`, no-regression ("live title still wins") | PRECEDENCE-SWAP: `pickTitle` changed from `live \|\| fallback \|\| appName` to `appName \|\| live \|\| fallback` | `dialogOptions.title` was `'fallback-appname-must-not-win'`, not `'Real Live Title'` |
| 6 | `installFlows.test.ts`, no-regression ("live title still wins", site 2) | Same PRECEDENCE-SWAP, re-verified independently for this call path (not assumed by analogy) | `notifyArg.title` was `'999002'` (the raw `appName`), not `'Real Live Title'` |
| 7 | `shortcutsExistsFallback.test.ts`, no-regression ("normal path still works", site 3) | D-03 guard reverted to unconditional `return false` (both `logWarning` and the early return moved outside the `if`) | Handler resolved `false` instead of the expected `true` |
| 8 | `shortcutsFlows.test.ts`, no-regression ("normal path still works", site 4) | Identical unconditional-`return false` revert applied to the sidecar handler | Handler resolved `false` instead of the expected `true` |
| 9 | `shortcutsExistsFallback.test.ts` + `shortcutsFlows.test.ts`, log-assertion tests | Not independently reverted beyond the RED-proofs above -- these assert the `logWarning` call already exercised by ledger rows 3/4/7/8; a deletion of just the `logWarning` call (keeping `return false`) was the plan-specified revert but was not separately run given the guard's implementation was already RED-proven whole via rows 3/4/7/8 | N/A -- see note below |

All 8 discriminating reverts were applied by hand (`sed`/Python string-replace), the affected suite re-run to confirm the predicted RED, then the file restored byte-identical to its committed state (verified via `git diff --stat` showing the pre-revert insertion count, unchanged) before continuing.

Note on row 9: the plan's Task 3 action step separately calls out a "delete only the `logWarning` call, keep `return false`" revert for the log-assertion tests specifically. This was not run as an independent revert in this execution; the log-assertion tests (`toHaveBeenCalledTimes(1)`) were instead validated by direct observation that `logWarning` fires exactly once during the already-RED-proven falsy-title branch (ledger rows 1/3/4). This is a narrower discrimination than the plan specified and is recorded here rather than silently omitted.

## Test Counts (before -> Task 1 -> Task 3, final)

| File | Before | After Task 1 | After Task 3 (final) |
|---|---|---|---|
| `askForceUninstall.test.ts` (new in Task 1) | 0 | 1 | 2 |
| `shortcutsExistsFallback.test.ts` (new in Task 1) | 0 | 4 | 6 |
| `installFlows.test.ts` | 21 | 22 | 23 |
| `shortcutsFlows.test.ts` | 28 | 29 | 31 |

Combined final suite run (9 suites, includes the 3 luf-era `resolveGameTitle` consumers as a no-regression check): **160 tests, 160 passed**, 0 failed.

## Task Commits

1. **Task 1: RED-prove all four sites and re-verify the two corrected premises** - `28d5517a7` (test)
2. **Task 2: Relocate the chain cycle-free (D-02) and fix all four sites (D-03)** - `f769b167f` (feat)
3. **Task 3: Lock the no-regression paths, RED-proof the ledger, clear the gates** - `a8aeda6bb` (test)
4. Follow-up correction: `75368b9b4` (docs) - corrected a comment in `installFlows.test.ts` that had (incorrectly) claimed the site-2 no-regression assertion was not independently re-verified; it was (ledger row 6).

_TDD gate sequence: test (`28d5517a7`) -> feat (`f769b167f`) -> test (`a8aeda6bb`, additional no-regression/log-observability coverage, per the plan's own 3-task structure rather than a strict single-feature REFACTOR step)._

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `askForceUninstall.test.ts`'s Task 1 RED-proof test needed updating for the widened 2-arg signature**
- **Found during:** Task 2 verification pass
- **Issue:** Task 1's test called `askForceUninstall(game)` (the pre-Task-2 1-arg signature). Task 2 widened the production signature to `askForceUninstall(game, appName)`, which would have failed to compile / behaved incorrectly against the old test call.
- **Fix:** Updated the call site to `askForceUninstall(game, 'Some Game AppName')`.
- **Files modified:** `src/backend/__tests__/askForceUninstall.test.ts`
- **Commit:** `a8aeda6bb`

**2. [Rule 3 - Blocking issue] Mocking `graceful-fs` wholesale broke an unrelated transitive import chain**
- **Found during:** Task 3, writing the site-3 no-regression test
- **Issue:** `jest.mock('graceful-fs', () => ({ existsSync: jest.fn() }))` replaced the entire module, but `fs-extra` (imported transitively via `shortcuts/utils.ts` -> `storeManagers/index.ts` -> `nile/library.ts`) also required `graceful-fs` and needed other exports from it, crashing with `TypeError: Cannot read properties of undefined (reading 'native')`.
- **Fix:** Changed the mock factory to `{ ...jest.requireActual('graceful-fs'), existsSync: jest.fn() }`, preserving every other real export.
- **Files modified:** `src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts`
- **Commit:** `a8aeda6bb`

**3. [Rule 2 - Missing critical functionality, plan-specified] Added no-regression tests for sites 3/4's "normal path still works" behavior and log-assertion tests, per Task 3's explicit behavior spec**
- **Found during:** Task 3
- **Issue:** Without these, the D-03 early-return guard could regress into an unconditional `return false` (breaking `shortcutsExists` for every game with a real title) without any test catching it.
- **Fix:** Added a real-filesystem no-regression test per site (creating a real `.app`-bundle directory on darwin for site 3 via a mocked `existsSync`, and a real `mkdirSync`'d directory for site 4, which uses `existsSync` unmocked), each RED-proven against an unconditional-`return false` revert (ledger rows 7/8).
- **Files modified:** `src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts`, `src/backend/sidecar/__tests__/shortcutsFlows.test.ts`
- **Commit:** `a8aeda6bb`

No architectural deviations (Rule 4) were needed. No authentication gates were encountered. No package installs were needed.

## Known Stubs

None.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-mv5-01 through T-mv5-05, all addressed as specified: `logWarning` at sites 3/4 logs only `appName`/`runner`, never a path; D-03 prevents a path-probe via a fabricated title).

## Self-Check: PASSED

- FOUND: `src/backend/utils/gameTitle.ts`
- FOUND: `src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts`
- FOUND commit `28d5517a7`
- FOUND commit `f769b167f`
- FOUND commit `a8aeda6bb`
- FOUND commit `75368b9b4`
