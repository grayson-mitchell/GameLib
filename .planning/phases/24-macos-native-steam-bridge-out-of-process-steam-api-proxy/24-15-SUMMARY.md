---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 15
subsystem: steam-bridge
tags: [crossover, wine, bottle, launch, macos, tdd]

# Dependency graph
requires:
  - phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy (24-11/24-12/24-13)
    provides: bridge install→shim→launch integration cluster closed (shim overwrite-by-identity, bridge AcfSource install poll, install-poll wiring + sticky-flag clear + launch existence-gate)
provides:
  - getBridgeBottleSettings() resolving a CrossOver WineInstallation (type:'crossover') derived from the locked CXBOTTLE_BIN root, instead of inheriting globalSettings.wineVersion
  - resolveBridgeCrossoverWine() synchronous helper reused by the bridge launch getter
affects: [24-UAT.md Gates 3/4 retest, launchBridgeGame, installBridgeGame, provisionBridgeBottle consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derive a CrossOver WineInstallation synchronously from a sibling binary of an already-locked root constant (CXBOTTLE_BIN), rather than importing an async detector (getCrossover) that would force a synchronous getter async."

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts

key-decisions:
  - "Reused CXBOTTLE_BIN/WINESERVER_BIN (already-locked CrossOver root constants) instead of importing getCrossover() — keeps getBridgeBottleSettings() synchronous, matching all of its existing synchronous callers (library.ts, games.ts)."
  - "Fallback to globalSettings.wineVersion only when CrossOver's wine binary is absent from disk (dev/CI/non-macOS) — zero regression to that path."

requirements-completed: [R6]

# Metrics
duration: 12min
completed: 2026-07-21
---

# Phase 24 Plan 15: Bridge Launch Resolves CrossOver Wine (D-UAT-24-06) Summary

**`getBridgeBottleSettings()` now resolves the CrossOver runtime that created the bridge bottle via cxbottle, instead of inheriting the GPTK/toolkit global default that made 32-bit bridge game exes abort instantly.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-21T16:34:00+12:00 (approx, plan read + graphify orientation)
- **Completed:** 2026-07-21T16:46:46+12:00
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `resolveBridgeCrossoverWine()` — a synchronous module helper in `bottle.ts` that derives CrossOver's multi-arch `wine` binary as a sibling of the already-locked `CXBOTTLE_BIN` root, returning a `WineInstallation` (`type: 'crossover'`, `wineserver: WINESERVER_BIN`) when it exists on disk, else `undefined`.
- `getBridgeBottleSettings()`'s `wineVersion` field now resolves `resolveBridgeCrossoverWine() ?? globalSettings.wineVersion` — CrossOver first, global fallback only when CrossOver is absent.
- Closes the D-UAT-24-06 BLOCKER (confirmed root cause on hardware in 24-UAT.md RETEST RUN 1): GPTK's `wine64` has no 32-bit loader and aborts (`alloc_pages_vprot` assertion) on the bridge's 32-bit game exes; CrossOver's `wine` is WoW64-capable and proven to keep the same exe running in a positive-control probe.
- `getSteamBottleSettings()` (Phase 17 non-bridge getter) left byte-for-byte unchanged.

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1 RED: add failing tests for CrossOver resolution** - `fa67aaef` (test)
2. **Task 1 GREEN: getBridgeBottleSettings resolves CrossOver wine** - `868c3e81` (fix)

**Plan metadata:** (this commit, follows)

## Files Created/Modified
- `src/backend/storeManagers/steam/bottle.ts` — added `resolveBridgeCrossoverWine()` helper; `getBridgeBottleSettings()` wineVersion now `resolveBridgeCrossoverWine() ?? globalSettings.wineVersion`
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — 3 new tests: CrossOver-present resolution (type/bin/wineserver, not-equal to GPTK global), CrossOver-absent fallback (deep-equal to global), synchronous + `wineCrossoverBottle` unchanged

## Decisions Made
- Reused the existing `CXBOTTLE_BIN`/`WINESERVER_BIN` constants (sibling-derivation precedent already used for `WINESERVER_BIN`/`CX_ROOT`) instead of importing the async `getCrossover()` detector from `compatibility_layers.ts` — this keeps `getBridgeBottleSettings()` synchronous, which its callers (`library.ts:getBridgeBottleSteamappsRoot`, `games.ts:resolveBridgeGameInstallRoot`, `games.ts:installBridgeGame`, `games.ts:launchBridgeGame`) all require.
- New WineInstallation `name` field set to `'CrossOver (bridge bottle runtime)'` for log/debug clarity, distinguishing it from the Phase 17 bottle's own resolved wine.

## Deviations from Plan

None - plan executed exactly as written. TDD RED/GREEN gate sequence followed per the `tdd="true"` task attribute.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Unblocks the Gates 3/4 (R6) human-hardware retest in `24-UAT.md`: `launchBridgeGame`'s `runWineCommand` will now run under CrossOver's `wine` (WoW64-capable) instead of GPTK's `wine64`, so a 32-bit bridge game exe should load instead of aborting instantly.
- Live re-verify (a bridge game actually reaching playable single-player) remains a human-hardware Gate 3/4 retest — not asserted by this plan's automated tests.
- D-UAT-24-07 (periodic library sync clobbering the bridge-installed badge) remains open, tracked separately (not in this plan's scope — see 24-16 per the gap-cycle plan doc `c1f991f8`).

## Self-Check: PASSED
- FOUND: src/backend/storeManagers/steam/bottle.ts
- FOUND: src/backend/storeManagers/steam/__tests__/bottle.test.ts
- FOUND commit fa67aaef
- FOUND commit 868c3e81

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*
