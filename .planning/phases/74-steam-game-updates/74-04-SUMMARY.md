---
phase: 74-steam-game-updates
plan: 04
subsystem: steam
tags: [steam, update-detection, pics, acf]
requires: []
provides:
  - detectSteamUpdates / per-boot update-state cache (steamInstallRuntime.updateStates)
  - string-preserving ACF readers (parseAcfInstalledDepots, readAcfUpdateState, isAcfUpdatePending)
affects: [74-05, 74-08, 74-09, 74-10, 74-11]
tech-stack:
  added: []
  patterns: [raw-text ACF tree scanner (no number coercion), closure-Map cache on the install runtime]
key-files:
  created:
    - src/backend/storeManagers/steam/acfInstalledDepots.ts
    - src/backend/storeManagers/steam/library/acfUpdateState.ts
    - src/backend/storeManagers/steam/updateDetection.ts
    - src/backend/storeManagers/steam/__tests__/acfInstalledDepots.test.ts
    - src/backend/storeManagers/steam/__tests__/updateDetection.acf.test.ts
    - src/backend/storeManagers/steam/__tests__/updateDetection.test.ts
    - src/backend/storeManagers/steam/__tests__/updateDetection.exit.test.ts
    - src/backend/storeManagers/steam/__tests__/fixtures/steamUpdate/acf-pending.acf
    - src/backend/storeManagers/steam/__tests__/fixtures/steamUpdate/acf-current.acf
  modified:
    - src/backend/storeManagers/steam/steamInstallRuntime.ts
key-decisions:
  - "Phase 17 GameLibSteam bottle installs are neither bridge nor registered: not returned, no badge (the bottled Steam client owns their updates)."
  - "A registered install with Steam running, or whose PICS cross-check failed, reports 'current' from the ACF alone; only bridge failures fall back to last-known/unknown."
  - "cache.set takes an optional picsAt so TTL reuse tracks only real PICS answers, not ACF-only results."
requirements-completed: []
duration: ~25m
completed: 2026-11-12
---

# Phase 74 Plan 04: Steam update detection Summary

Bridge installs compare the ACF buildid to anonymous PICS `depots.branches.<branch>.buildid` in one bounded batched call; registered installs are judged from the ACF alone (PICS only when Steam is not running); GIDs and build ids are read as exact strings.

## Tasks
1. ACF readers + registered-pending predicate - 8b9eaa579
2. detectSteamUpdates, per-boot cache, exit-contract test - 754286f4e

## Verification
- jest: acfInstalledDepots, updateDetection (acf/main/exit), moduleStateCensus pass; full `src/backend/sidecar` + `src/backend/storeManagers/steam` run: 260 suites, 7310 tests pass.
- `pnpm codecheck` and `pnpm steam-line-ceiling` exit 0; prettier clean on all written .ts paths (.acf fixtures have no parser).

## Deviations from Plan
- Added `readAcfUpdateFieldsFromDir` (exported from acfUpdateState.ts) so the bridge path reads a bottle's steamapps dir directly; `readAcfUpdateState` uses it too. Added `parseAcfTree`/`acfString`/`acfBlock` exports in acfInstalledDepots.ts as the shared raw scanner.
- No existing SteamInstallRuntime test fakes broke typecheck; none needed updating.

## Known issues
- `pnpm find-deadcode` reports new knip findings for the not-yet-consumed exports STEAM_UPDATE_PICS_TTL_MS, STEAM_UPDATE_REFRESH_TIMEOUT_MS, STEAM_UPDATE_PRELAUNCH_TIMEOUT_MS, SteamUpdateEstimate, SteamUpdateKind, SteamUpdateStateValue. Left in place per plan; they are consumed by plans 05/09/10/11, which must land (or tag `@public`) before the ratchet is green.
- The ACF flag semantics for registered installs are from spike 069; the live gate (plan 13) records real flags.

## Self-Check: PASSED
