---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 09
subsystem: steam-bridge-drm
tags: [drm, bottle-stage, registry, wine, steamstub]
requires: [56-04]
provides:
  - stageDrmBottle (bottle-stage DrmStep)
  - buildDrmRegistryCommands, drmRegistryStagedInUserReg, isPhase52ForwarderBytes
affects: [56-11, 56-12, 56-13]
tech-stack:
  added: []
  patterns: [all-or-nothing swap with pre-probe, tmp+rename staging, unref'd timer race]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
  modified: []
key-decisions:
  - "Module carries its own HKCU registry builder and drive_c path mapping; it does not import steamClientSetup.ts, so 56-13 can delete that file."
  - "Win32 prefix (no Program Files (x86)) fails closed with a '64-bit' cause; no fallback root."
  - "runtime dll walk happens twice (swap, then cleanup) rather than widening restoreDrmOriginals' return shape."
requirements-completed: [D-07, D-11, D-21]
duration: ~25min
completed: 2026-10-28
---

# Phase 56 Plan 09: Bottle-stage step Summary

stageDrmBottle turns a title's existing TCP-bridge bottle into a DRM-mode bottle: swaps GameLib shims back to originals (all or nothing), removes gamelib_bridge.cfg and the Phase 52 forwarder, stages five files into `C:\Program Files (x86)\Steam\`, and writes four HKCU-only registry values, idempotently.

## Commits
- 6134c3955 test(56-09): failing tests (RED)
- 0c78c6dc1 feat(56-09): swap, cleanup, registry argv (GREEN, task 1)
- fb4524b28 feat(56-09): stageDrmBottle orchestration (task 2)

## Signatures (for 56-11 / 56-12 / 56-13)
```ts
stageDrmBottle(input: StageDrmBottleInput, deps?: StageDrmBottleDeps): Promise<DrmStepResult<StageDrmBottleOk>>
StageDrmBottleInput = { appId, bottleName, bottleSettings: GameSettings, exePath, installRoot, installdir, valveClientDir, componentDir, signal? }
StageDrmBottleDeps  = { getBottleDir?, findDlls?, findUnreal?, restoreOriginals?, runReg?(commandParts) => Promise<{code?,stderr?}>, regTimeoutMs? }
StageDrmBottleOk    = { steamDirHost, steamDirWin, helperHostPath, helperWinPath, steamClient64WinPath, restored, removed, foreignSteamClientLeft, staged, registryWritten }
buildDrmRegistryCommands(): string[][]
drmRegistryStagedInUserReg(text: string): boolean
isPhase52ForwarderBytes(buf: Buffer): boolean
DRM_STEAM_DIR_WIN, DRM_STEAMCLIENT64_WIN, DRM_HELPER_WIN, DRM_VALVE_FILES, DRM_COMPONENT_FILES, DRM_REG_ADD_TIMEOUT_MS, DRM_STEAM_DIR_SEGMENTS
```
- 56-11: pass the DRM bottle-settings variant (clone wineVersion) as `bottleSettings`, or inject `runReg` following the 56-01 launch_form. `steamDirHost` is the first WINEDLLPATH entry.
- 56-12: launch `helperWinPath` with the game exe.
- 56-13: this module does not import steamClientSetup.ts.

## Deviations from Plan
None of substance. Minor: the timeout test uses real timers with `regTimeoutMs: 20` and a `clearTimeout` spy (fake timers raced the async fs walk before the timer was armed). 41 tests (plan required 25).

## Verification
- stageDrmBottle test 41/41; whole bridge dir + fakeHomeIsolation: 31 suites pass.
- `pnpm codecheck` clean; prettier clean; HKLM/forbidden-token greps 0.
- `node meta/findDeadcode.cjs`: only the 3 pre-existing findings (GameMakerRunnerSignals, PeReader, WINE_DRIVERS_KEY).
- `gsd-sdk query requirements.mark-complete`: REQUIREMENTS.md missing in this repo (known).

## Known Stubs
None.

## Self-Check: PASSED
