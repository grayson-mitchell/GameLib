# Phase 54 deferred items

## Pre-existing backend jest failures (found in 54-03, out of scope)

Three sidecar suites fail identically with the pre-phase `user.ts` (verified by running them against the version at 3e8823f00), so they are not caused by Phase 54:

- `src/backend/sidecar/__tests__/installFlows.test.ts` (Test 1b: `listSteamLibraryTargets` ... "Cannot read properties of undefined (reading 'map')")
- `src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts` (channel-count completeness)
- `src/backend/sidecar/__tests__/testContainment.test.ts` (channel-set containment, `addTestOnlyListener is not a function`)

Also pre-existing: `macSteamOffline.ts` line ~91 has a `prefer-promise-reject-errors` eslint error from plan 54-01.

## Orchestrator post-wave gate (after 54-09, 2026-10-27)

Bisected against the pre-phase commit `930254e4f` (scratch worktree, same node_modules):

- **Phase-54 regressions, fixed in `10515ecc0`:** `skeletonFlows` (stale `ensureConnected` stub; unmocked anonymous client), `permanentlyMountedPolls` C-23 census (SteamGoOfflineNotice not enrolled), `findDeadcode` +8 used-in-module exports.
- **Pre-existing at `930254e4f`, not caused by Phase 54 (out of scope):**
  - `meta/__tests__/genI18nGateScope.test.ts` A-17: the live git derivation returns empty (18 expected entries at base, 20 now; Phase 54 only added its two new frontend files).
  - `meta/__tests__/isIntelMacRemoved.test.ts` D-10: `isIntelMac` matches under `src/`.
  - `meta/__tests__/machineFillGamelib.test.ts` `pluralCategoriesFor` (3 tests).
  - `meta/__tests__/findDeadcode.test.ts`: one used-in-module finding, `bridge/sharedRedists.ts - WINE_DRIVERS_KEY`.
- Repo-wide `pnpm lint` walks `.claude/worktrees/quick-261027-tot` (another session's worktree) and reports tsconfig parse errors from it.
