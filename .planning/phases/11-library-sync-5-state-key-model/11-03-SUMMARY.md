---
phase: 11-library-sync-5-state-key-model
plan: 03
subsystem: ipc-wiring
tags: [electron-ipc, preload-bridge, react-context, humble]

# Dependency graph
requires:
  - phase: 11-library-sync-5-state-key-model
    plan: 01
    provides: HumbleKey/HumbleSyncState type contracts, humble:* IPC channel typings in common/types/ipc.ts
  - phase: 11-library-sync-5-state-key-model
    plan: 02
    provides: HumbleLibrary (loadCached/sync/getKeys/getSyncState) sync orchestration
provides:
  - Typed humbleSync/humbleGetKeys/humbleGetSyncState IPC handlers delegating to HumbleLibrary
  - Preload invokers + handleHumbleKeysUpdated/handleHumbleSyncProgress listener slots
  - humble context slice (keys/syncedAt/syncError/syncing) with startup/login sync triggers
affects: [11-04, 11-05-real-account-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-then-sync on mount: window.api.humbleGetKeys()/humbleGetSyncState() fetched once on componentDidMount to render the last-known-good cache immediately, independent of whether the startup health-check-gated sync ever completes (HSYNC-04)"
    - "Startup sync gated on health check: void window.api.humbleCheckHealth().then(() => window.api.humbleSync()) — an already-expired session never triggers a sync"
    - "Progressive fill via per-order push: humbleKeysUpdated is emitted after each order commits (not just once at sync end), matching the existing humbleSyncProgress emission point in HumbleLibrary.sync()'s runBounded worker"

key-files:
  created: []
  modified:
    - src/backend/humble/ipc_handler.ts
    - src/backend/humble/library.ts
    - src/preload/api/humble.ts
    - src/frontend/state/GlobalState.tsx
    - src/frontend/state/ContextProvider.tsx
    - src/frontend/types.ts

key-decisions:
  - "humbleDisconnect's setState now also resets keys/syncedAt/syncError/syncing to their empty defaults, mirroring HumbleUser.disconnect()'s backend store wipe (Plan 02) — a disconnected account's context slice never carries stale key data even though Plan 04's route/sidebar gating already prevents it from being displayed."

requirements-completed: [HSYNC-01, HSYNC-04]

# Metrics
duration: 20min
completed: 2026-07-05
---

# Phase 11 Plan 03: Sync IPC Wiring + Context Slice Summary

**Registered the three typed `humble:*` sync IPC handlers against `HumbleLibrary`, extended the preload bridge with matching invokers/listener slots, and wired the frontend `humble` context slice (keys/syncedAt/syncError/syncing) with cache-then-sync mount fetch, health-check-gated startup sync, and a login/reconnect sync trigger.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-05 (Phase 11 wave 3)
- **Completed:** 2026-07-05
- **Tasks:** 2 completed
- **Files modified:** 6 (0 created)

## Accomplishments

- `src/backend/humble/ipc_handler.ts`: added `addHandler('humbleSync', ...)`, `addHandler('humbleGetKeys', ...)`, `addHandler('humbleGetSyncState', ...)`, each delegating straight to `HumbleLibrary`. No generic `storeGet` exposure of `humbleLibraryStore`/`humbleRevealedStore` (WR-09, T-11-02) — verified by grep.
- `src/preload/api/humble.ts`: exported `humbleSync`, `humbleGetKeys`, `humbleGetSyncState` invokers plus `handleHumbleKeysUpdated`/`handleHumbleSyncProgress` frontend listener slots. Picked up automatically by the existing `import * as Humble from './humble'` aggregation in `src/preload/api/index.ts` — no separate registration step needed.
- `src/frontend/types.ts` / `src/frontend/state/ContextProvider.tsx` / `src/frontend/state/GlobalState.tsx`: extended `StateProps.humble`/`ContextType.humble`/the default context object with `keys?: HumbleKey[]`, `syncedAt?: number | null`, `syncError?: 'none'|'denied'|'network'|'partial'`, `syncing?: boolean`, seeded from IPC (never `humbleConfigStore`, since this data lives in the separate library/sync stores).
- Added `handleHumbleKeysUpdated`/`handleHumbleSyncProgress` IPC listeners in `componentDidMount`, next to the existing `handleHumbleAuthState` listener.
- Startup trigger chained: `void window.api.humbleCheckHealth().then(() => window.api.humbleSync())` — an expired session's health check resolves first and the sync only fires after that (no separate `session_expired` branch needed here since `HumbleLibrary.sync()` itself no-ops safely without a valid cookie).
- Cache-then-sync: `window.api.humbleGetKeys()` and `window.api.humbleGetSyncState()` are fetched once on mount so the last-known-good cache renders immediately, independent of the sync's outcome (HSYNC-04).
- `humbleLogin` now fires `void window.api.humbleSync()` after setting the logged-in state (D-23).
- `humbleDisconnect` resets `keys`/`syncedAt`/`syncError`/`syncing` to their empty defaults alongside the existing `isLoggedIn`/`username`/`expired` reset.

## Task Commits

Each task was committed atomically:

1. **Task 1: Register humble sync IPC handlers + extend preload bridge** — `b7a44e8d` (feat)
2. **Task 2: Extend the humble context slice + startup/login sync triggers** — `9dcbb893` (feat)
3. **Deviation fix (Rule 2): push `humbleKeysUpdated` on each order commit during sync** — `cd9af8d8` (fix)

## Files Created/Modified

- `src/backend/humble/ipc_handler.ts` — three new `addHandler` registrations delegating to `HumbleLibrary`
- `src/backend/humble/library.ts` — `sync()`'s per-order worker now also pushes `humbleKeysUpdated` (see Deviations)
- `src/preload/api/humble.ts` — five new exports (three invokers, two listener slots)
- `src/frontend/state/GlobalState.tsx` — `StateProps.humble` fields, init seeding, two new IPC listeners, startup chain, mount-time `humbleGetKeys()`/`humbleGetSyncState()` fetch, `humbleLogin` sync trigger, `humbleDisconnect` reset, provided-value extension
- `src/frontend/state/ContextProvider.tsx` — default `humble` object gains `keys: [], syncedAt: null, syncError: 'none', syncing: false`
- `src/frontend/types.ts` — `ContextType.humble` gains the four new fields, imports `HumbleKey` from `common/types/humble`

## Decisions Made

- `humbleDisconnect`'s local state reset now covers the new fields too, matching the backend's store-wipe behavior on disconnect (see key-decisions above).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `HumbleLibrary.sync()` never pushed `humbleKeysUpdated` during a sync**
- **Found during:** Task 2, while verifying the wired `handleHumbleKeysUpdated` listener would actually receive fresh data end-to-end.
- **Issue:** Plan 02's `library.ts` only calls `sendFrontendMessage('humbleKeysUpdated', ...)` once, from `loadCached()` (mount-time cache render). `sync()`'s per-order worker only emitted `humbleSyncProgress`. Without a keys push during the sync itself, this plan's newly-wired listener would set `syncing: false` correctly (via the progress `done < total` check reaching false) but the renderer's `keys` array would never refresh after the initial mount fetch — breaking both D-26's progressive-fill contract ("keys appear in the list as each order detail resolves") and the basic correctness of "a successful sync updates what the user sees." Plan 04 (next plan, already read) consumes `humble.keys` purely via `useContext` with no independent re-fetch, so this data path is load-bearing for the very next plan's UI to work at all.
- **Fix:** Added one line — `sendFrontendMessage('humbleKeysUpdated', getKeys())` — immediately after the existing `humbleSyncProgress` emission inside `sync()`'s `runBounded` worker callback in `src/backend/humble/library.ts`. Mirrors the existing emission point exactly; no new code paths, no change to commit/classification logic.
- **Files modified:** `src/backend/humble/library.ts`
- **Verification:** `npm run codecheck` exits 0; all 16 pre-existing `library.test.ts` cases still pass unchanged (the tests assert on `humbleSyncProgress` calls and cache-store commits, not on `humbleKeysUpdated` call count, so this additive push required no test changes); `npx eslint src/backend/humble --ext .ts` — 0 errors, same 46 pre-existing warnings, none introduced.
- **Committed in:** `cd9af8d8`

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical functionality directly load-bearing for this plan's own listener wiring and the very next plan's UI).
**Impact on plan:** Additive one-line fix in a file outside this plan's declared `files_modified` list (`library.ts` belongs to Plan 02), but directly upstream of the exact IPC event this plan's Task 2 wires a listener for — without it, the listener would be dead code in practice. No architectural change, no new files, no test breakage.

## Issues Encountered

None beyond the deviation above.

## User Setup Required

None — no external service configuration required. Zero new npm dependencies.

## Next Phase Readiness

- The `humble` context slice (`keys`, `syncedAt`, `syncError`, `syncing`) is fully wired end-to-end (backend push -> preload listener -> GlobalState -> ContextProvider -> ContextType) and ready for Plan 04's Humble Keys screen to consume via `useContext`.
- Startup sync is correctly gated on the health check; login/reconnect and manual `window.api.humbleSync()` calls (Plan 04's refresh button) all flow through the same `HumbleLibrary.sync()` path with live progress/keys pushes.
- No blockers. Plan 05's real-account UAT remains the designated verification point for the still-unconfirmed live-API assumptions.

---
*Phase: 11-library-sync-5-state-key-model*
*Completed: 2026-07-05*
