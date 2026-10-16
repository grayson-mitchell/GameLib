---
phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy
plan: 12
subsystem: steam-install
tags: [steam, macos, crossover, wine, acf, install-poll, gap-closure]

# Dependency graph
requires:
  - phase: 24-04
    provides: getBridgeBottleSettings()/DEFAULT_BRIDGE_BOTTLE_NAME (bottle.ts) — the dedicated GameLibSteamBridge bottle, distinct from the Phase 17 GameLibSteam bottle
provides:
  - "AcfSource 'bridge' member (additive third source alongside 'native'/'bottle')"
  - "getBridgeBottleSteamappsRoot() helper resolving the bridge bottle's own steamapps dir"
  - "readAcfState(appId, 'bridge') scans the bridge bottle root, non-conflated with native/bottle"
  - "pollInstallOnce/startInstallPolling already forward 'bridge' through unchanged (no logic change needed beyond the wider union)"
affects: [24-13, bridge-install-poller, D-UAT-24-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-source steamapps-root selector in readAcfState (native | bottle | bridge), each root resolved by a dedicated getXSteamappsRoot() chokepoint function"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts

key-decisions:
  - "getBridgeBottleSteamappsRoot() mirrors getBottleSteamappsRoot() exactly (same shape, distinct settings source) rather than generalizing both into one parameterized helper — keeps each root's resolution path trivially auditable per RESEARCH.md Pitfall 2 (never conflate roots)"
  - "pollInstallOnce/startInstallPolling required NO logic changes — they already forward the AcfSource union generically; only the type widening was needed for 'bridge' to flow through"
  - "installPlatformForSource() and pollUninstallOnce() intentionally left untouched — out of scope for this plan (installBridgeGame wiring is 24-13; uninstall-path bridge support was not called for by D-UAT-24-05)"

requirements-completed: [R6]

# Metrics
duration: ~20min
completed: 2026-07-21
---

# Phase 24 Plan 12: Bridge AcfSource for install poll Summary

**Added a 'bridge' AcfSource + getBridgeBottleSteamappsRoot() so readAcfState/pollInstallOnce can read the StateFlags=4 manifest the bridge install actually writes into the GameLibSteamBridge bottle, instead of missing it by scanning the native or Phase-17-bottle roots (D-UAT-24-05 root fix).**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-21T01:56:00Z (approx)
- **Completed:** 2026-07-21T02:16:37Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Widened `AcfSource` from `'native' | 'bottle'` to `'native' | 'bottle' | 'bridge'` in `library.ts`
- Added `getBridgeBottleSteamappsRoot()`, resolving `getBottleSteamappsDir(getBridgeBottleSettings().wineCrossoverBottle)` — mirrors the existing `getBottleSteamappsRoot()` but points at the dedicated `GameLibSteamBridge` bottle, never the Phase 17 `GameLibSteam` bottle or the native libraries
- Threaded `'bridge'` through `readAcfState`'s `steamappsDirs` selector; confirmed `pollInstallOnce`/`startInstallPolling` already forward the wider union with zero logic changes
- Added unit tests: bridge-root 'installed' detection (StateFlags=4), absent-dir no-throw, and two-way non-conflation proofs against both 'native' and 'bottle' (Pitfall 2)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 'bridge' AcfSource + getBridgeBottleSteamappsRoot; thread through readAcfState/pollInstallOnce** - `e07e85b3` (feat)

## Files Created/Modified
- `src/backend/storeManagers/steam/library.ts` - `AcfSource` widened to include `'bridge'`; new exported `getBridgeBottleSteamappsRoot()`; `readAcfState`'s `steamappsDirs` selector now branches on `'bridge'` before the native fallback; docstrings updated
- `src/backend/storeManagers/steam/__tests__/library.test.ts` - new `describe('readAcfState(appId, "bridge")...')` block (4 tests: installed detection, absent-dir, no-conflation-with-native, no-reverse-conflation-with-native/bottle); imports/mocks extended with `getBridgeBottleSettings`; new `BRIDGE_BOTTLE_STEAMAPPS_ROOT` fixture; `getBottleSteamappsDir` mock upgraded from a flat `mockReturnValue` to a bottle-name-keyed `mockImplementation` inside the new describe block so 'bottle' and 'bridge' roots can be exercised in the same test without clobbering each other

## Decisions Made
- Kept `getBridgeBottleSteamappsRoot()` as a small dedicated function (not a parameterized `getSteamappsRootFor(source)`) — matches the existing `getBottleSteamappsRoot()` precedent and keeps each root's resolution trivially greppable/auditable, per the plan's Pitfall 2 discipline.
- No changes to `installPlatformForSource()`, `pollUninstallOnce()`, or `buildBottleInstalledMap()` — explicitly out of scope per the plan (`installBridgeGame` wiring to `pollerSource: 'bridge'` is 24-13's job; uninstall-path bridge support and the library-scan bottle map were not implicated by D-UAT-24-05).

## Deviations from Plan

None - plan executed exactly as written. One test-authoring adjustment (not a deviation from plan scope, just an implementation detail): the reverse-conflation test required upgrading the shared `getBottleSteamappsDir` jest mock from `mockReturnValue` to a bottle-name-keyed `mockImplementation` within the new describe block, since both the 'bottle' and 'bridge' sources resolve through that same underlying function with different bottle names. This was necessary to correctly assert non-conflation and does not change any behavior of the existing 'bottle'-source describe block (untouched, still passing).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `readAcfState(appId, 'bridge')` / `pollInstallOnce(appId, 'bridge')` / `startInstallPolling(appId, { source: 'bridge' })` are all ready to be wired by 24-13's `installBridgeGame` (passing `pollerSource: 'bridge'`) to close D-UAT-24-05 end-to-end.
- `pnpm codecheck` clean; `pnpm jest .../library.test.ts` 154/154 green (150 pre-existing + 4 new).

---
*Phase: 24-macos-native-steam-bridge-out-of-process-steam-api-proxy*
*Completed: 2026-07-21*

## Self-Check: PASSED

- FOUND: src/backend/storeManagers/steam/library.ts
- FOUND: src/backend/storeManagers/steam/__tests__/library.test.ts
- FOUND: .planning/phases/24-macos-native-steam-bridge-out-of-process-steam-api-proxy/24-12-SUMMARY.md
- FOUND commit: e07e85b3 (Task 1)
- FOUND commit: ea25b88e (SUMMARY.md)
