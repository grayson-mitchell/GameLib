---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 08
subsystem: steam-bridge-launch
tags: [rust-migration, scanners, ceg, gamemaker]
requires: [63-07]
provides:
  - async path-based readLaunchExeCegMarkers
  - GameMaker runner DLL-import read over scan_pe_imported_dlls
affects: [63-09, 63-11]
key-files:
  modified:
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameBridgeLaunch.ts
    - src/backend/storeManagers/steam/bridge/gameMakerRunner.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/gameMakerRunner.test.ts
decisions:
  - "games.test.ts gets a file-level beforeEach defaulting the peScan mock to a resolved not-parsed result, because resetMocks leaves it returning undefined"
  - "GameMaker MSAA probe still reads the whole exe (Pitfall 7); documented in the module header, not changed"
metrics:
  tasks: 2
  completed: 2026-11-07
requirements: [D-08, D-09, D-11]
---

# Phase 63 Plan 08: Launch-path CEG read and GameMaker runner on the path-based scanner

`readLaunchExeCegMarkers` is now async over `peScan.detectSteamDrmInPe` (readError, then not-parsed, then markers; same two warning texts) and both launch callers await it with caller tags. The GameMaker runner takes its d3d11 import from `readPeImportedDllNames(exePath, 'gameMakerRunner')`.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 async CEG read and callers | 4288e0129 | gameLaunch/gameBridgeLaunch await; fs imports removed; games.test mocks peScan with `mockResolvedValue` |
| 2 GameMaker runner by path | c00723292 | peScan import; MSAA byte probe and data.win stat unchanged; tests pin rust env, mock `requestRustInvoke`, add by-path and transport-rejection cases |

## Deviations from Plan

None in behavior. One test-only addition: a file-level default for the `detectSteamDrmInPe` mock in games.test.ts, since the old code tolerated `undefined` (`result?.parsed`) and the new code reads `readError`.

## Verification

- games.test.ts: 702 pass, 1 fail (pre-existing channel constants reading the archived 56-01-SUMMARY.md). launchDispatch and bottleLaunchSignals suites pass.
- gameMakerRunner and steamBridgeKnownFixes suites pass; `tsc --noEmit` clean; `pnpm find-deadcode` PASS; eslint no errors; prettier clean.
- Only `legacyTsScanners.ts` (and the peScan wrapper itself) import peSteamDrm in non-test code.
- Not run: full `pnpm lint`, `pnpm planning-gates`.

## Known Stubs

None.

## Self-Check: PASSED

Commits 4288e0129 and c00723292 exist; five modified files are committed.
