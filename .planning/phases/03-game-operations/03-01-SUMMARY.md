---
phase: 03-game-operations
plan: "01"
subsystem: steam-game-operations
tags: [steam, launch, game-operations, tdd, security]
dependency_graph:
  requires: [02-05-SUMMARY]
  provides: [SteamGame.launch, buildSteamProtocolUrl, SteamGame.getSettings, SteamGame.getExtraInfo, SteamGame.isGameAvailable, SteamGame.stop]
  affects: [src/backend/storeManagers/steam/games.ts, src/backend/launcher.ts]
tech_stack:
  added: []
  patterns: [shell.openExternal steam:// delegation, buildSteamProtocolUrl appId guard, GameConfig.get defaults, existsSync install path check]
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "buildSteamProtocolUrl is a module-level exported helper (not class method) so install/uninstall in 03-02 can reuse the same /^\\d+$/ guard without calling into a SteamGame instance"
  - "getSettings() delegates to GameConfig.get().getSettings() (nile analog) — autoSyncSaves is false by default so launcher.ts skips save sync for Steam games"
  - "isGameAvailable() uses existsSync from graceful-fs on install_path (nile/gog analog)"
  - "stop() is an intentional no-op: Steam owns process lifecycle; documented with logWarning"
  - "Test beforeEach re-establishes GameConfig mock because jest resetMocks:true clears return values between tests"
metrics:
  duration: "~10 min"
  completed: "2026-06-28"
  tasks_completed: 2
  files_changed: 2
---

# Phase 3 Plan 1: Steam Launch Vertical Slice Summary

Steam game launch delegation via `steam://rungameid/{appId}` with numeric appId injection guard (`buildSteamProtocolUrl`), D-03 hand-off toast, and full supporting method implementations (`getSettings`, `getExtraInfo`, `isGameAvailable`, `stop`) that unblock the `launchEventCallback` path in `launcher.ts`.

## What Was Built

**`buildSteamProtocolUrl(verb, appId)`** — Module-level exported helper. Validates `/^\d+$/` before constructing any `steam://` URL. Returns `null` for non-numeric input and logs a warning. This is the single chokepoint for T-03-01 (appId injection mitigation). Reusable by `install`/`uninstall` in plan 03-02.

**`SteamGame.launch()`** — Calls `buildSteamProtocolUrl('rungameid', this.appId)`, returns `false` immediately if null (invalid appId). On valid appId: shows `notify({ title, body: 'Opening in Steam…' })` (D-03 hand-off toast) then `await shell.openExternal(url)`, returns `true`. Does NOT call `sendGameStatusUpdate`. `isNative()` remains `true` so `launchEventCallback` skips `checkWineBeforeLaunch` — Proton fully delegated to Steam (GAME-04 / D-06).

**`SteamGame.stop()`** — Documented no-op with `logWarning`. Steam owns the process lifecycle; GamerLib cannot observe or terminate Steam game processes.

**`SteamGame.getSettings()`** — Delegates to `GameConfig.get(this.appId).config || (await GameConfig.get(this.appId).getSettings())` (nile analog). `autoSyncSaves` defaults to `false` so `launcher.ts:151` skips save sync for Steam games.

**`SteamGame.getExtraInfo()`** — Returns `info.extra ?? { reqs: [], about: { description: '', shortDescription: '' } }`. Never throws.

**`SteamGame.isGameAvailable()`** — Returns `Boolean(info?.is_installed && info.install?.install_path && existsSync(info.install.install_path))`. Uses `graceful-fs.existsSync` (nile/gog analog).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 (RED) | Failing tests: launch, appId guard, stop, supporting methods | 50eb167 | games.test.ts |
| 1-2 (GREEN) | Implementation: all methods + codecheck clean | 47277b2 | games.ts, games.test.ts |

## Verification

- `npx jest --testPathPattern="storeManagers/steam/__tests__/games"`: **26 passed, 0 failed**
- `npm run codecheck`: **clean (no type errors)**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] GameConfig mock reset between tests**

- **Found during:** Task 2 GREEN phase
- **Issue:** `jest resetMocks: true` in project jest config clears mock `mockReturnValue` between tests. The module-level `jest.mock('backend/game_config', ...)` establishes the factory but not per-call return values.
- **Fix:** Added `beforeEach` in the supporting-methods describe block to re-establish `GameConfig.get.mockReturnValue(...)` with a full default `GameSettings` object.
- **Files modified:** `games.test.ts`
- **Commit:** 47277b2 (included in GREEN commit)

## TDD Gate Compliance

- RED gate: commit `50eb167` (`test(03-01): add failing tests...`) — 10 tests failing as expected
- GREEN gate: commit `47277b2` (`feat(03-01): implement...`) — all 26 tests passing
- REFACTOR: not needed — implementation is clean on first pass

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes beyond those in the plan's threat model. `buildSteamProtocolUrl` mitigates T-03-01 as planned.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/games.ts`: FOUND
- `src/backend/storeManagers/steam/__tests__/games.test.ts`: FOUND
- Commit `50eb167`: FOUND (RED)
- Commit `47277b2`: FOUND (GREEN)
- All 26 tests pass, codecheck clean
