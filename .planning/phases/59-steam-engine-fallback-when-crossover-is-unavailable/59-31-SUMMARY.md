---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 31
subsystem: steam-bridge
tags: [wine, wineserver, gap-closure, logging]
requires: []
provides:
  - engine hint on endPerGameBridgeBottleSession
  - quiet macOS no-lib-paths case in setupWineEnvVars
affects: [steam bridge redist step, launcher wine env]
tech-stack:
  added: []
  patterns: [optional engine hint as fourth dispatch arm]
key-files:
  created:
    - src/backend/__tests__/launcher_wineLibFolders.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
    - src/backend/launcher.ts
key-decisions:
  - "H3: suppress the log on macOS when no lib paths are configured instead of giving the engine lib paths (would set WINEDLLPATH)"
requirements-completed: [H2, H3]
duration: 15min
completed: 2026-11-03
---

# Phase 59 Plan 31: Built-in engine false failure lines Summary

The redist display-driver window now ends a built-in-engine bottle's session with the engine's own wineserver, and pinned-wine calls on macOS no longer log the library-folder error.

## Tasks

1. H2 (commit 1fbfcd79d): `killForRegisteredEngine` and `endPerGameBridgeBottleSession` take an optional `engineHint: { wineserverBin }`, used after the DRM and registered-engine arms and before CrossOver; a non-absolute or missing path is ignored with a warning. `sharedRedistInstall.ts` derives the hint from non-CrossOver `wineVersion.wineserver` and passes it at both session-end calls.
2. H3: `setupWineEnvVars` skips the `Couldn't find all library folders` error when `isMac` and neither `lib` nor `lib32` is set. Env output unchanged; Linux unchanged.

## Verification

- Jest: bottle, sharedRedistInstall, fakeHomeIsolation (263 tests), launcher_wineLibFolders (3), launcher_callRunner pass. eslint 0 errors, `pnpm codecheck` clean, prettier clean.
- The "import after Jest environment torn down" messages in sharedRedistInstall.test.ts predate this plan (identical with H2 tests excluded).

## Deviations from Plan

- The existing assertion in sharedRedistInstall.test.ts that checks the session-end call args now expects a trailing `undefined` 4th argument (CrossOver passes no hint).
- Engine hint helper `engineHintFor` is module-level in sharedRedistInstall.ts rather than a local in `installSteamBridgeSharedRedists`, because the call sites live in `run` and a nested function.

## Known Stubs

None.

## Self-Check: PASSED
