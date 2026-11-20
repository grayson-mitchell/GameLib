---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 18
subsystem: frontend-state
tags: [zustand, libraryState, D-05, D-06, D-09, D-10]
requires: [69-17]
provides: [libraryState.refreshLibrary, steamMetadataSyncing, steamSyncStatus, boot listeners for steam sync + refresh push, runMountLibraryRefresh]
key-files:
  modified: [src/frontend/state/libraryState.ts, src/frontend/state/bridgeContextValue.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/GlobalState.tsx, meta/rerender/seam.tsx]
decisions:
  - "installLibraryBridgeSlots and the 'slot not installed' stub are deleted; authState calls the real libraryState.refreshLibrary"
  - "runMountLibraryRefresh takes the four user flags; the three store has('userData') reads live in readMountStoreUsers(), called at the original position before the awaits (R10 timing preserved)"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 18: refreshLibrary and Steam sync indicators Summary

refreshLibrary is now a libraryState action, ported verbatim (same guards, same `[refreshLibrary] runner=<r|all> origin=<o>` log, same error log and flag resets). steamMetadataSyncing/steamSyncStatus are libraryState fields written by three boot listeners (handleSteamMetadataSyncing, handleSteamSyncStatus, handleRefreshLibrary with origin 'push') registered once in initStateSubscriptions section (2); the status handler never touches refreshingInTheBackground. The mount refresh is `runMountLibraryRefresh`, called at the same position. The class now holds only libraryStatus/handleGameStatus (69-19).

## Commits
- 9813962c2: store action, fields, boot listeners, bridge slice, slot mechanism removed, tests, seam
- 407433092: refreshLibrary-origin and steamSyncStatus gates rewritten, signInIdentityResync gate retargeted

## Deviations
- [Rule 3] `runMountLibraryRefresh` takes `{legendaryUser, gogUser, amazonUser, steamUser}` rather than reading the three `has` checks itself: reading them after the awaits would have changed their timing (plan also required order unchanged). New `readMountStoreUsers()` does the reads at the original spot.
- [Rule 3] `meta/rerender/seam.tsx` now calls `initStateSubscriptions()` (after resetting its once-guard, since every run installs a fresh fake api) because handleRefreshLibrary is a boot listener. libraryRefreshPush GameCard count is 266, equal to baseline; check.json deleted, baseline untouched.
- [Rule 3] `signInIdentityResync.test.ts` wiring gate (owned by no sibling) retargeted: refreshLibrary is now a store member in libraryState.ts. authState/GlobalStateSteamLogout/useTauriOAuthLogin tests set `refreshLibrary` via `useLibraryState.setState`.
- Acceptance grep `"GlobalState.tsx"` in GlobalStateRefreshLibraryOrigin.test.ts is not 0: the two `game-status` origin literals still live in the class's handleGameStatus until 69-19, so the call-site count test lists it (INTERNAL_FILES comment says so). W4 stays source-text with a comment pointing at 69-24.
- Original gate (b) text checks replaced by a behavioural scoped-vs-global flag probe with a near-miss; the dropped-reset, stale-log, no-origin and pre-fix-mount-gate specimens are each run through the same probe.

## Gates
Frontend jest 315 suites / 5411 tests pass; lint 0 errors; find-deadcode PASS (knip baseline unchanged); frontend-context-ceiling PASS (41); backend-di-ceilings PASS; codecheck clean on frontend/meta files (only src/backend other-session noise, if any). PERF_ERA=check GameCard counts non-zero (100/200/200/266).

## Known Stubs
None.

## Self-Check: PASSED
