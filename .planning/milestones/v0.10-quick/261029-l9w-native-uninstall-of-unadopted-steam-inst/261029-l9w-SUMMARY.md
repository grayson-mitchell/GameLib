---
phase: quick-261029-l9w
plan: 01
subsystem: steam
status: complete
tags: [steam, mac, uninstall, adoption]
requires: [quick-261029-ji2]
key-files:
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/macSteamAdoption.ts
    - src/backend/storeManagers/steam/__tests__/macSteamAdoption.test.ts
commits:
  - 4d3079ef9 fix(quick-261029-l9w): remove unadopted Mac native Steam install directly on uninstall
  - 564f13fb2 fix(quick-261029-l9w): clear Starting Steam status after adoption restart
completed: 2026-10-29
---

# Quick 261029-l9w: Native uninstall of an unadopted Steam install (Mac)

GameLib now removes a Mac native install the running Steam never adopted itself, instead of firing a `steam://uninstall` that Steam ignores. It also clears the "Starting Steam" pill after the adoption restart.

## What changed

- **Task 1 (`4d3079ef9`)**: new private `SteamGame.uninstallUnadoptedMacNativeDirectly()`, called from `uninstall()`'s `root === 'native'` branch before the delegation.
  - Gate: Mac, a pending-adoption record, `decidePlayAdoption(...) === 'restart'` (same steam_osx PID, ACF still GameLib's), `readAcfState('native')` is `installed`, and `record.manifestPath` equals the manifest that would be deleted.
  - Action: `removeSteamInstallCopy(appId, 'native')`, `clearPendingAdoption`, then `pollUninstallOnce(appId, 'native')`. That call flips `is_installed`, pushes, sends done and fires the single toast.
  - Refusal or throw: nothing deleted, no `steam://uninstall` fallback, record kept, `gameStatusUpdate done` sent, non-empty stderr.
  - Every other case delegates exactly as before.
- **Task 1b (`564f13fb2`)**: `restartMacSteamForAdoption` gained `RestartDeps.emitDone`. After emitting `steam-starting` it wraps the rest in try/finally and always emits `done`. Steam launches skip `launchEventCallback`, so nothing else cleared the pill.
- **Task 2**: gates run (below). The plan's single combined commit became two commits, one per task (the plan allowed 1b to be committed separately).

## Tests

- New `games.test.ts` describe `quick 261029-l9w`: 12 tests. They cover the direct arm, the absent race, eight delegation arms (no record, different PID, Steam not running, probe rejects, adopted ACF, downloading ACF, manifest mismatch, non-Mac), the refusal arm and the throw arm. The real `decidePlayAdoption` is used via `jest.requireActual`.
- `macSteamAdoption.test.ts`: 24 tests (was 23). It adds a rejecting-launch case, `emitDone` ordering and count, and no `emitDone` on the two early refusals.
- `pnpm codecheck` clean. `jest src/backend/storeManagers/steam src/backend/__tests__/fakeHomeIsolation.test.ts`: 92 suites, 3495 passed, 1 skipped (ji2 baseline 3481 passed). Prettier clean on all four files. ESLint 0 errors (pre-existing warnings only). Diff touches neither `drmLaunchSetup.ts` nor `stageDrmBottle.ts` and adds no `spawn(`.

## Deviations from Plan

- **Test-order leak (pre-existing, not fixed)**: the plan's verify filter `jest games.test.ts -t "uninstall"` fails the six existing GAME-03 tests. An earlier uninstall describe (the Phase 17 bottle routing block) leaves `envMock.isMac = true`. Under `-t`, the describe that normally resets it is skipped, so `resolveInstallRoot` reaches the unmocked bottle settings. The failure is in `library.ts` `getBottleSteamappsRoot`, which this change does not touch. The full `games.test.ts` run passes (481/481), as does the whole steam suite. Left as is.
- `decidePlayAdoption` is the real implementation in the new tests (`requireActual` worked), no stubbing needed.
- The new describe's `beforeEach` mocks `getSteamBottleSettings` and `getBottleSteamappsDir`, because `resolveInstallRoot` consults the bottle root first on Mac.

## Operator live steps (not run, per constraints)

1. Restart `pnpm tauri:dev` and confirm `build/main/sidecar.js` mtime is newer than the last commit (`564f13fb2`).
2. (a) With WazHack 264160 installed via GameLib, Steam running and NOT played: Uninstall. Expect the install files and `appmanifest_264160.acf` gone, badge not-installed, "Uninstalling" pill cleared, one "Game Uninstalled" toast, and the same steam_osx PID.
3. (b) Reinstall WazHack and press Play. Expect "Starting Steam" to clear once the game launches. Quit the game and confirm Play works again.

## Known Stubs

None.

## Self-Check: PASSED

Commits `4d3079ef9` and `564f13fb2` exist; the four modified files are present.
