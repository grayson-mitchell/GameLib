---
phase: 19-crossover-compatibility-index-macos
plan: 06
subsystem: backend+frontend
tags: [crossover, ipc, zustand, pull-handler, push-channel, macos, badge-pipeline]

# Dependency graph
requires:
  - phase: 19-05
    provides: "isCrossoverIndexEligible(gameInfo), getCodeweaversFromIndex(gameInfo) — index-first lookup + D-16 eligibility predicate"
provides:
  - "getCrossoverIndex pull handler + crossoverIndexChanged push channel (IPC contract + backend registration + preload bindings)"
  - "buildCrossoverRatingMap() — three-state (number|null|key-absent) resolver over every game in libraryManagerMap"
  - "crossoverRatings zustand slice (GlobalStateV2) + push/pull wiring (GlobalState.tsx)"
  - "LibraryManager.getListOfGames(): GameInfo[] — new interface method, implemented on all 6 managers"
affects: [19-07, 19-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bulk pull-handler + push-channel + zustand-slice triple (mirrors getAllGameOverrides/metadataChanged verbatim in shape)"
    - "Three-state map contract: key-absent = never looked up (ineligible), value null = looked up & absent, value number = looked up & matched (D-16)"
    - "Eligibility decided by an explicit predicate call FIRST, never inferred from a lookup function's null return"
    - "LibraryManager.getListOfGames() — synchronous enumeration from each manager's own persisted libraryStore, no network, mirrors the pre-existing legendary implementation"

key-files:
  created:
    - src/backend/crossover_index/ipc_handler.ts
    - src/backend/crossover_index/__tests__/ratingMap.test.ts
  modified:
    - src/common/types/ipc.ts
    - src/common/types/game_manager.ts
    - src/backend/main.ts
    - src/preload/api/library.ts
    - src/frontend/state/GlobalStateV2.ts
    - src/frontend/state/GlobalState.tsx
    - src/backend/storeManagers/gog/library.ts
    - src/backend/storeManagers/nile/library.ts
    - src/backend/storeManagers/zoom/library.ts
    - src/backend/storeManagers/sideload/library.ts
    - src/backend/storeManagers/steam/library.ts

key-decisions:
  - "Added getListOfGames(): GameInfo[] to the LibraryManager interface (Rule 3 fix — see Deviations). Each of the 5 managers that lacked it now reads its own already-in-use persisted libraryStore/steamLibraryStore synchronously, mirroring legendary's pre-existing implementation exactly. zoom's version preserves its existing experimentalFeatures.zoomPlatform gate (returns [] when the feature flag is off)."
  - "The isMac gate for D-16's 'empty on non-macOS' truth lives in buildCrossoverRatingMap itself (early return {} when !isMac), not inside getCodeweaversFromIndex/isCrossoverIndexEligible — neither of those 19-05 primitives actually gates on platform (verified by reading crossover_index/index.ts; the plan's interfaces block description of an internal isMac gate does not match the delivered code)."
  - "The 'background index refresh' push is a single fire-and-forget buildCrossoverRatingMap() call in main.ts's app.whenReady() handler, run once at startup after initStoreManagers()/initImagesCache(). No distinct scheduled/periodic refresh job exists anywhere in this codebase yet (19-05 only wired a lazy per-game TTL'd fetch inside getCodeweaversFromIndex); this is the simplest faithful implementation of the must-have truth without inventing a bigger scheduler."
  - "Frontend push/pull wiring calls useGlobalState.getState().setCrossoverRatings(...) (the codebase's actual GlobalStateV2 import alias in GlobalState.tsx), not the plan's literal 'GlobalStateV2.setState' — functionally identical, matches the file's existing updateGameOverrides precedent exactly."

requirements-completed: [CXIDX-09]

# Metrics
duration: ~30min
completed: 2026-07-14
---

# Phase 19 Plan 06: Bulk CrossOver-Rating Pipeline (Pull + Push + Slice) Summary

**`getCrossoverIndex` pull handler + `crossoverIndexChanged` push channel deliver a three-state (`number|null|key-absent`) rating map into a `crossoverRatings` zustand slice, so the macOS library grid can paint a badge for every game with zero per-card IPC or CodeWeavers round-trips.**

## Performance

- **Duration:** ~30 min
- **Completed:** 2026-07-14
- **Tasks:** 2/2
- **Files modified:** 11 (2 created, 9 modified)

## Accomplishments

- `buildCrossoverRatingMap()` (`src/backend/crossover_index/ipc_handler.ts`) resolves every library title's CrossOver rating once: it decides eligibility via `isCrossoverIndexEligible(gameInfo)` FIRST and only then calls `getCodeweaversFromIndex(gameInfo)`, producing a map with three distinct states — key-absent (never looked up), `null` (looked up, no record), and a rating number (matched). Empty entirely on non-macOS.
- `getCrossoverIndex` pull handler + `crossoverIndexChanged` push channel exist end to end: IPC contract (`ipc.ts`) → backend registration (`ipc_handler.ts` + `main.ts`) → preload (`library.ts`) → frontend slice (`GlobalStateV2.ts`) + listener (`GlobalState.tsx`).
- A one-shot background resolve fires at app startup (`main.ts`, after `initStoreManagers()`) and pushes `crossoverIndexChanged`; the renderer also does its own one-time `getCrossoverIndex()` pull on mount, so the grid paints on first load without waiting for the push.
- `crossoverRatings` zustand slice is strictly display-only: no component writes back to it, and reading it never triggers a fetch — painting a card cannot become an IPC round-trip or a CodeWeavers scrape (D-11/D-13).

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend resolver + getCrossoverIndex pull handler + crossoverIndexChanged push + IPC contract + preload bindings** — `79321934` (feat) — includes the Rule 3 `getListOfGames()` deviation fix (see below)
2. **Task 2: crossoverRatings zustand slice + crossoverIndexChanged push listener** — `79512ce5` (feat)

## Files Created/Modified

- `src/backend/crossover_index/ipc_handler.ts` - `buildCrossoverRatingMap()` resolver + `getCrossoverIndex` pull-handler registration
- `src/backend/crossover_index/__tests__/ratingMap.test.ts` - 6 tests covering all three map states, non-mac emptiness, and multi-runner enumeration
- `src/common/types/ipc.ts` - `getCrossoverIndex` (AsyncIPCFunctions) + `crossoverIndexChanged` (FrontendMessages) contract entries
- `src/common/types/game_manager.ts` - new `LibraryManager.getListOfGames(): GameInfo[]` interface method
- `src/backend/main.ts` - side-effect-plus-named import of `buildCrossoverRatingMap`; fires `crossoverIndexChanged` once after startup
- `src/preload/api/library.ts` - `getCrossoverIndex` + `handleCrossoverIndexChanged` bindings
- `src/frontend/state/GlobalStateV2.ts` - `crossoverRatings` slice (init `{}`) + `setCrossoverRatings`
- `src/frontend/state/GlobalState.tsx` - `handleCrossoverIndexChanged` push listener registration + one-time `getCrossoverIndex()` pull on mount
- `src/backend/storeManagers/gog/library.ts`, `nile/library.ts`, `zoom/library.ts`, `sideload/library.ts`, `steam/library.ts` - new `getListOfGames()` implementations (Rule 3 deviation, see below)

## Decisions Made

- isMac gate for D-16's non-mac-emptiness truth is enforced in `buildCrossoverRatingMap` itself, since neither 19-05 primitive it calls actually gates on platform.
- Background refresh implemented as a single startup-time fire-and-forget resolve+push (no scheduler exists elsewhere in the codebase to hook into).
- Frontend wiring uses `useGlobalState.getState().setCrossoverRatings(...)`, matching the codebase's real import alias and the existing `updateGameOverrides` precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking primitive missing] `LibraryManager.getListOfGames()` did not exist on 5 of 6 managers**
- **Found during:** Task 1, implementing `buildCrossoverRatingMap`'s enumeration step
- **Issue:** The plan's interfaces block asserted "each manager exposes: `getListOfGames(): GameInfo[]`", but on inspection only `legendary/library.ts` actually implements it (`return libraryStore.get('library', [])`). The `LibraryManager` interface (`common/types/game_manager.ts`) does not declare this method, and gog/nile/zoom/sideload/steam had no equivalent bulk getter — without it, `buildCrossoverRatingMap` has no way to enumerate every runner's library.
- **Fix:** Added `getListOfGames(): GameInfo[]` to the `LibraryManager` interface, and implemented it on all 5 remaining managers by reading each manager's own already-in-use persisted store (`libraryStore.get('games'|'library', [])` for gog/nile/sideload, `steamLibraryStore.get('games', [])` for steam), mirroring legendary's existing one-liner exactly. Zoom's implementation preserves its existing `experimentalFeatures.zoomPlatform` settings gate (returns `[]` when the flag is off, matching its sibling `getGameInfo`/`getInstallAndGameInfo` methods).
- **Files modified:** `src/common/types/game_manager.ts`, `src/backend/storeManagers/{gog,nile,zoom,sideload,steam}/library.ts`
- **Verification:** `pnpm codecheck` clean; full test suites for all touched store managers + crossover_index (389 tests) pass unchanged.
- **Committed in:** `79321934`

**2. [Rule 1 - Bug/D-16 correctness] Neither 19-05 primitive actually gates on `isMac`**
- **Found during:** Task 1, verifying the "empty on non-macOS" must-have truth
- **Issue:** The plan's interfaces block claimed `getCodeweaversFromIndex` "internally applies the isMac gate (D-10)". Reading the actual `crossover_index/index.ts` delivered by 19-05 shows neither `getCodeweaversFromIndex` nor `isCrossoverIndexEligible` references `isMac` at all — without an explicit gate somewhere, the resolved map would NOT be empty on Linux/Windows, violating D-16's honesty invariant on this plan's own must-have truth.
- **Fix:** Added the `isMac` gate directly in `buildCrossoverRatingMap` (early `return {}` when `!isMac`), before any enumeration or lookup runs.
- **Files modified:** `src/backend/crossover_index/ipc_handler.ts`
- **Verification:** `ratingMap.test.ts`'s non-mac test asserts the map is `{}` and that neither `isCrossoverIndexEligible` nor `getCodeweaversFromIndex` is even called.
- **Committed in:** `79321934`

---

**Total deviations:** 2 auto-fixed (1 blocking-primitive addition, 1 D-16 correctness gap)
**Impact on plan:** Both fixes were necessary to satisfy this plan's own must-have truths and success criteria; neither changes existing behavior of any pre-existing code path (all additions are new methods/gates, not modifications to existing logic).

## Issues Encountered

- graphify's knowledge graph had not yet been re-indexed for the `crossover_index/` module tree created in 19-05 (queries returned only planning-doc nodes, not code symbols) — read source files directly instead per the fallback rule; ran `graphify update .` after completing all edits.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `crossoverRatings` is live in zustand, populated on mount and kept fresh by the push channel — 19-07 can now build the grid badge purely by reading this slice (no IPC, no scrape) and honoring the three-state contract (key-absent → no mark, `null` → unknown mark, number → rating medal).
- `LibraryManager.getListOfGames()` is now a stable, tested primitive any future bulk-enumeration need (across all 6 runners) can reuse without re-deriving it.
- No blockers for 19-07/19-08.

---
*Phase: 19-crossover-compatibility-index-macos*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created files verified present on disk; both task commits (`79321934`, `79512ce5`) verified present in git log.
