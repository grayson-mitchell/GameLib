---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 14
subsystem: steam-engine-switch
tags: [dxvk, engine-switch, gap-closure, wine]
requires: []
provides:
  - "prepareBottleForEngine({ crossoverHealthy?, onSwitching?, ... }) and failure reason 'shared-bottle'"
  - "strict DXVK.installRemove restore result on the source-pinned path"
affects: [59-20, 59-22]
tech-stack:
  added: []
  patterns: ["marker records installed DXVK {dir,version} or 'failed'"]
key-files:
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
    - src/backend/storeManagers/steam/engine/engineSwitch.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
key-decisions:
  - "Restore source: marker dxvk dir, then pinById(marker.id), then ENGINE_PINS.current, downloaded via ensurePinEngine when absent"
  - "Unhealthy CrossOver restores through the built-in engine and stops that engine's wineserver"
requirements-completed: [D-03, D-07, D-09]
duration: ~25min
completed: 2026-11-02
---

# Phase 59 Plan 14: Accurate engine marker and recoverable DXVK restore Summary

The `.gamelib-engine.json` marker now says `crossover` only when DXVK is really gone. A failed or source-less restore returns `dxvk-failed` and is retried. The restore no longer runs through an expired CrossOver. Shared bottles are never switched.

## Commits
- 3619b0775: strict DXVK restore on the source-pinned path (WR-01)
- 85ec747de: marker accuracy, restore source, health-aware restore, shared-bottle refusal (Tasks 2 and 3)

## What changed
- `DXVK.installRemove(..., 'restore', source)` returns false on any reg delete failure (except "unable to find"), any non-zero `wineboot -u`, or any non-ENOENT DLL rm error. `current_dxvk-macOS` is removed last, synchronously, only after every step succeeded. The non-source Heroic toggle path is unchanged. A missing, null or undefined `code` on a `wait: true` call counts as a failure (`runWineCommand` returns `code` as `number | null`, and early-error paths leave it undefined).
- Marker gains `dxvk?: {dir, version} | 'failed'`. `readMarker` accepts the dir only when inside `pinnedEngineRoot()` (T-59-60).
- A dxvk-failed switch into a non-CrossOver engine writes that engine's marker with `dxvk:'failed'` (WR-09). A later same-identity launch retries the install without killing a wineserver.
- Switching to CrossOver restores when `current_dxvk-macOS` exists or the marker has a dxvk field. No resolvable source is a failure with the marker unchanged (CR-03). The "leaving DXVK in place" branch is gone.
- `crossoverHealthy:false` restores on the built-in engine (`fallbackSettings`, `winePrefix` = bottle dir) and stops its wineserver afterwards (G10). `DXVK_RESTORE_ENGINE` is removed.
- Shared-bottle guard (WR-06) runs after the same-identity check and before `onSwitching`, any kill or any DXVK step.
- `resolveCrossoverBinDir` now uses `persistedWineBins()` (IN-02).

## User-visible consequence of the WR-06 refusal
A title still in the legacy shared bridge bottle (`GameLibSteamBridge`) cannot use the built-in engine fallback. Any engine change there is refused with `shared-bottle`. It runs only on CrossOver until it is uninstalled and reinstalled into its own per-game bottle.

## Deviations from Plan
Tasks 2 and 3 edit the same function and were implemented together, so they share one commit instead of two. Otherwise none.

## Verification
- `jest dxvkInstallRemove.test.ts engineSwitch.test.ts` passes (36 tests).
- `pnpm codecheck` exits 0.
- Prettier check was clean on all four files.

## Known Stubs
None.

## Self-Check: PASSED
Commits 3619b0775 and 85ec747de exist; the four modified files exist.
