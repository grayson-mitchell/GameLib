---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 19
subsystem: frontend-state
tags: [zustand, libraryState, sleepAssertion, accountHooks, D-05, D-08, D-09, D-10]
requires: [69-18]
provides: [libraryState.libraryStatus, libraryState.handleGameStatus, selectInstallingEpicGame, sleepAssertion.ts, accountHooks.ts, state-free GlobalState bridge]
key-files:
  created: [src/frontend/state/sleepAssertion.ts, src/frontend/state/accountHooks.ts, src/frontend/state/__tests__/accountHooks.test.ts]
  modified: [src/frontend/state/libraryState.ts, src/frontend/state/GlobalState.tsx, src/frontend/state/bridgeContextValue.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/__tests__/GlobalStateSleepAssertionClassification.test.ts, meta/rerender/seam.tsx]
decisions:
  - "registerSleepAssertionSubscriber returns the unsubscribe handle (boot ignores it, D-07) so tests can tear each registration down"
  - "accountHooks use* exports are tagged @public (no consumer until 69-20..23) instead of a knip baseline entry"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 19: libraryStatus, sleep assertion, composite hooks Summary

libraryStatus and handleGameStatus (the hot path, ported verbatim with identical ordering, filtering and side effects) are now libraryState members; the sleep-assertion lock/unlock is a libraryStatus subscription in `sleepAssertion.ts` (classify/reconcile moved verbatim, subscriber starts at `{display:false, system:false}` and fires once at registration); `installingEpicGame` is the derived `selectInstallingEpicGame`. GlobalState.tsx is 102 lines: no state, no componentDidUpdate, render is the bridge, componentDidMount is the bridge subscription plus the ordered boot calls. `accountHooks.ts` holds the pure compose* builders shared by the bridge and the new use* hooks.

## Commits
- 3bd65cb9a: libraryStatus, handleGameStatus, sleepAssertion.ts, behavioural sleep gate and handleGameStatus tests
- 3c061bd8d: accountHooks, bridge/boot wiring, GlobalState reduced, tests, seam

## D-08 port note and idempotency check
componentDidUpdate ran reconcile on every class update, so while idle it called `unlock()` and while active re-called `lock(...)` on every unrelated update. The subscriber keys on libraryStatus only; reconcile's only inputs are libraryStatus, so the lock state reached is identical, but redundant re-calls on unrelated updates stop. Idempotency was verified in the sidecar handlers, `src/backend/sidecar/appShellFlowRegistration.ts` lines ~388-422: `lock` only calls `powerSaveBlocker.start` when `powerId`/`displaySleepId` is undefined, and `unlock` only stops ids that are defined and then clears them. Both are idempotent, so dropping the redundant calls changes nothing. The Rust side (`src-tauri/src/wake_lock.rs`) is keyed by the id those handlers hold.

## Final componentDidMount body (69-24 moves it verbatim)
```
subscribeBridge(() => this.forceUpdate()); this.forceUpdate()
await seedAndFollowWindowChrome()
const { gogUser, amazonUser, steamUser } = readMountStoreUsers()
const legendaryUser = await seedEpicUserInfo()
await refreshAmazonUserInfo(amazonUser)
restoreStoredGameUpdates()
runMountLibraryRefresh({ legendaryUser, gogUser, amazonUser, steamUser })
registerControllerListener()
followConnectivity()
pullSignInProbeOutcomes()
void hydrateDismissedSignInNotices()
useAuthState.getState().rearmFromCurrentState()
applySavedFonts()
window.api.frontendReady()
```
The `window.api.handleGameStatus` registration moved out of it into initStateSubscriptions section (2) (registered at boot, before the awaits, as before in effect).

## Deviations
- [Rule 3] `meta/rerender/seam.tsx` mountApp now resets `libraryStatus` to `[]`: it was per-mount class state, now it is store state, so the repeated gameStatusPush runs became no-ops (gameStatusPush GameCard count 0). After the reset PERF_ERA=check gives 100/200/200/266 = baseline; check.json deleted, baseline untouched.
- [Rule 3] `GlobalStateRefreshLibraryOrigin.test.ts` INTERNAL_FILES drops GlobalState.tsx (the two game-status origin literals now live in libraryState.ts; counts unchanged).
- Sleep tests: the source-text extraction harness is gone; anti-vacuity self-tests now convict a silently-defaulting classifier and a never-unlocking reconcile through the same assertions.
- Confirmed by grep: no component reads showInstallModal/wineVersions/error-from-those via context (todo already filed).

## Gates
Frontend jest 316 suites / 5436 tests pass; codecheck clean on frontend/meta files; frontend-context-ceiling PASS (41); find-deadcode: no findings in my files (knip baseline unchanged); prettier clean; eslint 0 errors on touched files.
Other-session noise (src/backend only, not touched by me): codecheck TS errors in storeManagers/gog/*; `pnpm lint` errors in legacyFacades.ts (import-x/namespace) and gog/redist.ts; find-deadcode `SetupDeps` in gog/setup.ts; backend-di-ceilings "shrank" entries for gog test files. I treated these gates as passing for my files.

## Known Stubs
None.

## Self-Check: PASSED
