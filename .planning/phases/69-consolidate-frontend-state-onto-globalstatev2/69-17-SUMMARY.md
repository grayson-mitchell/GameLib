---
phase: 69-consolidate-frontend-state-onto-globalstatev2
plan: 17
subsystem: frontend-state
tags: [zustand, libraryState, D-03, D-06, D-08]
requires: [69-15, 69-16]
provides: [libraryState owns epic/gog/amazon/steam/sideloaded arrays, gameUpdates, refresh flags, refresh(), updateGameOverrides, applyGamePush]
key-files:
  modified: [src/frontend/state/libraryState.ts, src/frontend/state/bridgeContextValue.ts, src/frontend/state/initStateSubscriptions.ts, src/frontend/state/GlobalState.tsx]
decisions:
  - "libraryState flat names epicLibrary/gogLibrary/amazonLibrary/steamLibrary/sideloadedLibrary keep the GameInfo[] shape (D-03)"
  - "installLibraryBridgeSlots now accepts only refreshLibrary; resetRunnerLibrary/setRefreshing are real store actions"
  - "The 'Force Update' logInfo is kept but forceUpdate() dropped: store set() already notifies subscribers and the bridge"
  - "Source-text gate (b) (refreshLibrary scoping of the global flags, class-owned until 69-18) moved to GlobalStateRefreshLibraryOrigin.test.ts so the three rewritten files carry no readFileSync"
metrics:
  completed: 2026-11-10
---

# Phase 69 Plan 17: library data and refresh() Summary

libraryState now owns the four store library arrays, sideloadedLibrary, gameUpdates, refreshing, refreshingInTheBackground and refreshingByRunner, with `refresh(library?, checkUpdates?, overrides?)`, `updateGameOverrides` and `applyGamePush` as store actions (every logInfo/logError string verbatim, the empty-cache fetch guard and scoped-refresh isolation preserved). `readInitialLibrary()` (boot section 1) also hydrates the arrays; section 2 registers the metadata-changed and game-push listeners once; section 3 calls `registerLibrarySideEffects()` (gameUpdates -> localStorage 'updates', fireImmediately). `restoreStoredGameUpdates()` and `shouldRunInBackgroundAtMount()` are called from componentDidMount at the original positions. GlobalState now keeps only libraryStatus, steamMetadataSyncing, steamSyncStatus plus refreshLibrary/handleGameStatus, which read/write the library fields through the store.

## Commits
- 79039f3e0: libraryState data, loaders, overrides, game push, refresh() + tests
- a7144af1d: bridge, boot, GlobalState wiring + test fallout
- 00f7b9f0a, follow-up: SteamCacheHydration / RefreshCacheGuard / ScopedRefresh rewritten as behavioural gates (each with near-miss convictions)

## Deviations
- [Rule 3] Tests owned by no sibling plan that installed `resetRunnerLibrary`/`setRefreshing` through `installLibraryBridgeSlots` now set them with `useLibraryState.setState` (authState.test, GlobalStateSteamLogout.test, useTauriOAuthLogin.test).
- [Rule 3] `GlobalStateRefreshLibraryOrigin.test.ts` guard strings updated for the class's new store reads (`libraryAtStart.refreshing`, `useLibraryState.setState`); gate (b) from ScopedRefresh moved into it.
- SteamCacheHydration Test 4 no longer text-checks the sidecar's module-local `CACHE_BACKED_STORE_NAMES` (needed readFileSync); the renderer's two exported lists are still checked and the sidecar list stays covered by its own storeLayer test round trip. Small drift-check loss, deliberate.
- Mount-time `shouldRunInBackgroundAtMount()` reads the four arrays at call time (the class captured three at the start of componentDidMount); equal in practice since boot reads precede mount.

## Observation (not changed, R1)
`registerLibrarySideEffects` fires immediately with `[]` at boot (as the plan specified, reproducing componentDidUpdate's first pass), so the localStorage 'updates' value is overwritten with `[]` before `restoreStoredGameUpdates()` reads it, same as the class's forceUpdate-then-await ordering. Persisted updates may therefore never restore. Unverified; worth a live check.

## Gates
Frontend jest 315 suites / 5400 tests pass; lint 0 errors; frontend-context-ceiling PASS; prettier clean on touched files; `PERF_ERA=check pnpm perf:rerender` passes with non-zero GameCard counts (check.json deleted, baseline untouched). Other-session noise (src/backend, not touched here): `pnpm codecheck` fails only in src/backend/__tests__/spawnAsync.test.ts; `pnpm find-deadcode` fails only on SpawnAsyncOptions (spawnAsync.ts) and QuitMessageBoxOptions (quitHandler.ts); `pnpm backend-di-ceilings` fails only on src/backend/spawnAsync.ts moduleState. codecheck was green on frontend files and fully green after my Task 2 until the other session's files appeared. meta/knip-baseline.txt needed no change.

## Self-Check: PASSED
