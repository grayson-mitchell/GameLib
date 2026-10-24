---
phase: quick-261024-ir1
plan: 01
subsystem: steam-bridge
tags: [bridge, unreal, shim-placement]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
completed: 2026-10-24
---

# Quick 261024-ir1: Unreal stub plus Shipping layout Summary

The bridge now places its shim for Unreal Engine games by probing the Engine Steamworks dir and scanning the `*-Shipping.exe` for steam_api imports. Previously these games returned `no-steam-api`.

## Changes
- `findUnrealLayout(bottleDir, ueRoot)` returns null without a real `Engine/` dir. Otherwise it returns the Steamworks dir (lstat-checked at every segment, contained in the bottle) and up to 8 `<P>/Binaries/Win64/*-Shipping.exe` (regex `UE_SHIPPING_EXE`, symlinks skipped, sorted).
- `findRuntimeLoadedSteamApiDlls(root, extraRoots)` walks the Steamworks dir with the same depth-4 bound, then dedupes by resolved path.
- `findSteamApiImporterPes(..., priorityPaths)` scans the Shipping exe(s) first, outside the 512 cap, and the walk skips them via a `seen` set (scanned once).
- The `arch === 'none'` branch in `placeShimForGameInner` wires both and logs one UE-layout info line. games.ts is untouched.
- `RUNTIME_WALK_MAX_DEPTH` (4), `IMPORTER_SCAN_MAX_FILES` (512) and the CR-04 depth-4 test are unchanged.

## Commits
- 9b9539bec test: failing tests (RED; 6 failed, the other 3 new tests pass trivially as safety/bound guards)
- c686ca1bf feat: implementation (GREEN)
- d3e615da7 test: removed an unnecessary type assertion in my own new test that eslint flagged (additional commit not in the plan)

## Verification
- `npx jest src/backend/storeManagers/steam/bridge`: 13 suites, 345 tests passed.
- `pnpm codecheck`: clean. Scoped `prettier --check` on both files: clean.
- eslint on the bridge dir: 0 errors. 27 warnings, all pre-existing in other files (helperIntegration, launchTarget, helperProcess).
- games.ts unchanged; the todo is still in pending/.

## Deviations
- Rule 1: extra lint-fix commit on the test file (above). No existing test was modified.

## Operator UAT (not done)
Re-place on this Mac for 1363080, 427410 and 1119730. The log must show the UE layout line and `placed`/`placed-miss`. Ranch Simulator must get past the 2-3 s exit. "Verified" requires HELLO plus a clean game Steam-init log.

## Self-Check: PASSED
