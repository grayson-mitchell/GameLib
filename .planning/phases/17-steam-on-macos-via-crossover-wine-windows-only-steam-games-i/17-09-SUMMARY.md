---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 09
subsystem: steam-macos-bottle
tags: [steam, macos, crossover, wine, install-routing, gap-closure, uat]

# Dependency graph
requires:
  - phase: 17 (plan 08)
    provides: isBottleReady() real-readiness gate used by ensurePlatformsCaptured()'s downstream routing
provides:
  - ensurePlatformsCaptured() forcing a synchronous appdetails platform check at install()/launch()/uninstall() entry, decoupling bottle routing from the fire-and-forget metadata fetch race
  - steamPlatformsCaptured passthrough on GameInfo reconciling the frontend "Runs via Windows Steam bottle" indicator with the backend D-11 routing gate
affects: [17-uat-retest, steam-library-sync, steam-guided-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded poll to convert a fire-and-forget dedup-guarded async fetch into an effectively-awaited one (100ms interval, METADATA_FETCH_TIMEOUT_MS deadline)"
    - "Stateful jest mock (get() reflects the last set() call) to test async cache-fill races realistically instead of a static mockReturnValue"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/common/types.ts
    - src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "ensurePlatformsCaptured() calls this.getGameInfo() (not a raw library.get()) to reuse getGameInfo()'s existing lazy-fetch side effect as the actual network trigger; the method's own explicit fetchMetadataIfNeeded() call then short-circuits via the T-2-03 pendingFetches dedup guard, so only ONE axios.get() fires per click — the bounded poll converts that fire-and-forget call into an effectively-awaited one."
  - "isBottleEligible()'s definition is unchanged (platformsCaptured && !is_mac_native) — only the timing of platform-data resolution changed, preserving the D-11 ambiguous-default safety property (a fetch that ultimately fails still does not force-bottle a game)."
  - "steamPlatformsCaptured is NOT set on the delisted branch of fetchMetadataIfNeeded — that branch returns before platforms are captured, matching its existing early-return semantics."

patterns-established:
  - "Fire-and-forget async operation forced into a synchronous decision point via: (1) an already-captured short-circuit, (2) an explicit awaited call that piggybacks on the existing dedup guard, (3) a bounded poll with a hard deadline as the actual wait mechanism."

requirements-completed: [MACSTEAM-04, MACSTEAM-06]

# Metrics
duration: 35min
completed: 2026-07-11
---

# Phase 17 Plan 09: Force Synchronous Platform Capture + Reconcile Bottle Indicator Summary

**Closes UAT GAP 2 (MACSTEAM-04): install()/launch()/uninstall() now force-resolve macOS platform data via `ensurePlatformsCaptured()` before routing, and the "Runs via Windows Steam bottle" indicator now requires `steamPlatformsCaptured===true` to match the backend gate exactly.**

## Performance

- **Duration:** 35 min
- **Tasks:** 2 completed
- **Files modified:** 6

## Accomplishments

- Root-caused-and-fixed: a Windows-only Steam game on macOS whose platform data hadn't yet been captured by the throttled lazy fetch no longer silently falls through to native `steam://install` — `ensurePlatformsCaptured()` forces a real (awaited) platform check before the `isBottleEligible()` gate is consulted, so guided setup (consent dialog → WineSelector → provisioning) now reliably fires.
- Native-Mac games and non-macOS platforms are provably unaffected — `ensurePlatformsCaptured()` is a no-op off macOS, and a confirmed native-Mac game still routes to `shell.openExternal` after capture resolves.
- The D-08 "Runs via Windows Steam bottle" frontend indicator no longer over-promises for a never-synced game: it now requires the same `platformsCaptured` confirmation the backend routing gate requires, via a new `steamPlatformsCaptured` field mirrored onto `GameInfo`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Force a synchronous appdetails platform check at install/launch/uninstall entry (games.ts)** - `edfa8d4a` (feat)
2. **Task 2: Reconcile the D-08 indicator with the routing gate via steamPlatformsCaptured** - `0affcd8c` (feat)

_No plan-metadata commit in this response — orchestrator owns STATE.md/ROADMAP.md updates after the wave merges (worktree mode)._

## Files Created/Modified

- `src/backend/storeManagers/steam/games.ts` - Adds private `ensurePlatformsCaptured()`; awaited at the top of `install()`/`launch()`/`uninstall()`; `fetchMetadataIfNeeded`'s pushed `updated` GameInfo now sets `steamPlatformsCaptured:true`.
- `src/backend/storeManagers/steam/library.ts` - `refresh()`'s GameInfo build now seeds `steamPlatformsCaptured: cachedMeta?.platformsCaptured ?? false`.
- `src/common/types.ts` - Adds `steamPlatformsCaptured?: boolean` to the `GameInfo` interface.
- `src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx` - `showBottle` gate now also requires `gameInfo.steamPlatformsCaptured === true`.
- `src/backend/storeManagers/steam/__tests__/games.test.ts` - New `ensurePlatformsCaptured()` describe block (4 tests: uncaptured→bottle routing, native-Mac→native after capture, non-macOS skip, already-captured skip); extends the existing `fetchMetadataIfNeeded` push assertion to check `steamPlatformsCaptured:true`.
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - Two new tests asserting the synced GameInfo carries `steamPlatformsCaptured` from `cachedMeta.platformsCaptured` (true when present, false when absent).

## Decisions Made

- **Reuse `getGameInfo()`'s existing lazy-fetch side effect rather than issuing a second network call.** `ensurePlatformsCaptured()` calls `this.getGameInfo()` (which synchronously kicks off `fetchMetadataIfNeeded` as a fire-and-forget side effect when platforms aren't yet captured), then makes its OWN explicit `await this.fetchMetadataIfNeeded(...)` call. That explicit call hits the pre-existing T-2-03 `pendingFetches` dedup guard and returns immediately — so a bounded poll (100ms interval, `METADATA_FETCH_TIMEOUT_MS` deadline) is what actually waits for the single in-flight fetch to resolve `platformsCaptured`. Net effect: exactly one `axios.get()` per install/launch/uninstall click on an uncaptured game, with the routing decision correctly blocked until it resolves or times out.
- **`isBottleEligible()`'s definition is unchanged.** Only the TIMING of platform-data resolution changed (moved from "hope the lazy fetch already ran" to "force it and wait, bounded"). This preserves the pre-existing D-11 safety property: if the fetch ultimately fails (network error, timeout), the game is still not force-bottled — it falls through to native, exactly as before, just with a bounded (not silent) wait.
- **Delisted branch is excluded from `steamPlatformsCaptured:true`.** `fetchMetadataIfNeeded`'s delisted branch (`success:false`) returns before ever reading `data.platforms`, so it correctly does not claim platforms were captured.

## Deviations from Plan

None - plan executed exactly as written. The plan's own test-design guidance ("the primary-path tests should not enter the poll") describes the already-captured/non-macOS test cases specifically; the two tests that exercise an actually-uncaptured macOS game (the primary gap-closure scenario) do enter the bounded poll by design, since `getGameInfo()`'s lazy-fetch side effect always populates `pendingFetches` first — this is the intended mechanism, not a deviation, and resolves in ~100ms per test since the axios mock resolves on the microtask queue well before the poll's real-timer tick fires.

One incidental effect worth noting for future maintainers: the three pre-existing "D-11 (BLOCKER): NOT-yet-captured macOS game" tests in `games.test.ts` (install/launch/uninstall, added in an earlier plan) still pass unchanged after this plan's edits, but each now takes ~100ms longer because those tests don't mock `axios.get`, so `ensurePlatformsCaptured()`'s underlying fetch throws (caught silently) and the poll runs to the point where `pendingFetches` drains — the net behavior (native fallthrough, no `steamBottleSetupRequired`) is unchanged and correct, since an unconfigured/failing fetch still correctly does not force-bottle the game.

## Issues Encountered

**Atomic-commit file overlap:** Task 1 and Task 2 both touch `games.ts` and `games.test.ts` (per the plan's own `files_modified` list). To keep each task's commit atomic and reviewable, the Task 2 lines (`steamPlatformsCaptured: true` in `fetchMetadataIfNeeded`'s push, and the corresponding test assertion) were temporarily backed out via the Edit tool, Task 1 was committed and verified standalone (87/87 games.test.ts green), then Task 2's lines were restored and committed with the rest of Task 2's files. No functional deviation — purely a staging technique to preserve one-commit-per-task discipline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend routing and frontend indicator are both green (`yarn jest src/backend/storeManagers/steam` → 243/243 passed) and typecheck clean (`npx tsc --noEmit -p tsconfig.json`).
- Ready for the UAT retest of Test 3/GAP 2 and Test 8 (bottle indicator) referenced in `.planning/phases/17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i/17-UAT.md`.
- No blockers. A pre-existing, unrelated open-handle warning (`Jest did not exit... TypeError: Cannot read properties of undefined (reading 'map')` at `library.ts:397` inside `pollInstallOnce`/`readAcfState`) surfaces after the full steam-suite test run completes — this is a leftover `setInterval` from an untouched polling code path, out of scope for this plan (no assertions fail; all 243 tests pass), logged here for future cleanup awareness rather than fixed.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-11*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/games.ts
- FOUND: src/common/types.ts
- FOUND: src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx
- FOUND: commit edfa8d4a (Task 1)
- FOUND: commit 0affcd8c (Task 2)
