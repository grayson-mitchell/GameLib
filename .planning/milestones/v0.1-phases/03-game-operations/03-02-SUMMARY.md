---
phase: 03-game-operations
plan: "02"
subsystem: steam-game-operations
tags: [steam, install, uninstall, force-uninstall, focus-reconciliation, tdd, security]
dependency_graph:
  requires: [03-01-SUMMARY]
  provides: [SteamGame.install, SteamGame.uninstall, SteamGame.forceUninstall, SteamLibraryManager.refreshInstallState, BrowserWindow-focus-listener]
  affects:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/main.ts
    - src/common/types/game_manager.ts
tech_stack:
  added: []
  patterns:
    - steam://install/{appId} delegation via buildSteamProtocolUrl guard
    - steam://uninstall/{appId} delegation, no GamerLib confirm dialog (D-05)
    - forceUninstall() library.delete + sendFrontendMessage pushGameToLibrary is_installed:false
    - refreshInstallState() ACF diff loop — push only changed badges (D-01/D-02)
    - BrowserWindow 'focus' listener — void optional chain, no renderer input (T-03-03)
    - optional refreshInstallState? on LibraryManager interface — Steam-only, other runners unaffected
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/main.ts
    - src/common/types/game_manager.ts
decisions:
  - "install() and uninstall() route through buildSteamProtocolUrl (03-01 chokepoint) for T-03-01 — no parallel appId validation code"
  - "uninstall() shows no GamerLib confirm dialog (D-05) — Steam's own dialog is the sole confirmation"
  - "neither install() nor uninstall() calls sendFrontendMessage — badge state is reconciled only on focus ACF re-read (D-01/D-02)"
  - "refreshInstallState? declared optional on LibraryManager interface — only Steam needs it; other runners remain unaffected via optional chaining in focus handler"
  - "BrowserWindow 'focus' handler uses void discard convention — fire-and-forget matches existing codebase pattern (main.ts line 48 analog)"
metrics:
  duration: "~6 min"
  completed: "2026-06-28"
  tasks_completed: 3
  files_changed: 6
---

# Phase 3 Plan 2: Install + Uninstall Vertical Slice Summary

Steam install/uninstall delegation via `steam://install/{appId}` and `steam://uninstall/{appId}` with D-03 hand-off toast, no GamerLib confirmation dialog (D-05), and focus-driven install badge reconciliation via `refreshInstallState()` that diffs ACF manifests against the in-memory library Map without background polling (D-01/D-02).

## What Was Built

**`SteamGame.install(_args)`** — Calls `buildSteamProtocolUrl('install', this.appId)` (T-03-01 guard from 03-01). Returns `{ status: 'error' }` immediately for non-numeric appIds. On valid appId: shows `notify({ title, body: 'Opening in Steam…' })` (D-03 toast), `await shell.openExternal(url)`, returns `{ status: 'done' }`. Does NOT call `sendProgressUpdate` — Steam owns the download. Does NOT call `sendFrontendMessage` — install state is reconciled on focus, never assumed from click (D-02).

**`SteamGame.uninstall(_args)`** — Symmetric to install: fires `steam://uninstall/{appId}` with the D-03 toast, returns `{ stdout: '', stderr: '' }`. Shows NO GamerLib confirmation dialog (D-05) — Steam shows its own. Does NOT call `sendFrontendMessage('refreshLibrary', ...)` — badge state reconciled by focus ACF re-read only (D-01/D-02).

**`SteamGame.forceUninstall()`** — `library.delete(this.appId)` then `sendFrontendMessage('pushGameToLibrary', { ...info, is_installed: false })`. Analog: `gog/games.ts` lines 1282-1288. Used when Steam's uninstall has already completed but the in-memory state needs explicit clearance.

**`SteamLibraryManager.refreshInstallState()`** — Calls `buildInstalledMap()`, iterates `library.entries()`, and for each game whose `is_installed` differs from the ACF-derived `isNowInstalled`, builds an updated `GameInfo` (install shape matches `refresh()`: `install_path`, `install_size`, `platform: 'Windows'` when installed; `{}` when not), sets in library Map, and pushes `sendFrontendMessage('pushGameToLibrary', updated)`. Only changed games are pushed — avoids flooding the frontend with unchanged state (D-02). This is the D-01 reconciliation path: triggered by focus, not polling.

**`SteamLibraryManager.installState()` (updated)** — Replaced placeholder comment with a doc comment explaining that Steam install state is ACF-derived (D-10) and callers should use `refreshInstallState()`. Remains an intentional no-op.

**`LibraryManager.refreshInstallState?` (new optional method)** — Added `refreshInstallState?: () => Promise<void>` to the `LibraryManager` interface in `src/common/types/game_manager.ts`. Declared optional so other runners (Epic, GOG, Amazon) do not need to implement it. The focus handler in `main.ts` uses `?.refreshInstallState?.()` (double optional chain) so it is a guaranteed no-op for non-Steam runners.

**BrowserWindow 'focus' listener (main.ts)** — Added `mainWindow.on('focus', () => { void libraryManagerMap['steam']?.refreshInstallState?.() })` immediately after the existing `leave-full-screen` listener block (line 220). Uses the `void` discard convention for fire-and-forget promises. The handler passes no renderer-supplied input into `refreshInstallState` (T-03-03 mitigation).

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 (RED) | Failing tests: install, uninstall, forceUninstall | 8ee2044 | games.test.ts |
| 1 (GREEN) | Implementation: install(), uninstall(), forceUninstall() | 96d808b | games.ts |
| 2 (RED) | Failing tests: refreshInstallState(), installState() no-op | 47cfc02 | library.test.ts |
| 2 (GREEN) | Implementation: refreshInstallState() + installState() doc comment | b105dce | library.ts |
| 3 (AUTO) | Wire BrowserWindow focus → refreshInstallState, extend LibraryManager interface | 29706ea | main.ts, game_manager.ts |

## Verification

- `npx jest --testPathPattern="storeManagers/steam/__tests__/games"`: **38 passed, 0 failed** (26 from 03-01 + 12 new)
- `npx jest --testPathPattern="storeManagers/steam/__tests__/library"`: **16 passed, 0 failed** (11 existing + 5 new)
- `npm run codecheck`: **clean (no type errors)**
- `grep -n "mainWindow.on('focus'" src/backend/main.ts`: focus listener found at line 220

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

- Task 1 RED gate: commit `8ee2044` (`test(03-02): add failing tests...`) — 8 tests failing as expected
- Task 1 GREEN gate: commit `96d808b` (`feat(03-02): implement install...`) — all 38 tests passing
- Task 2 RED gate: commit `47cfc02` (`test(03-02): add failing tests for refreshInstallState...`) — 4 tests failing as expected
- Task 2 GREEN gate: commit `b105dce` (`feat(03-02): implement refreshInstallState...`) — all 16 library tests passing
- Task 3: AUTO (no TDD gate applicable)
- REFACTOR: not needed — implementations clean on first pass

## Known Stubs

None. All three operation methods (`install`, `uninstall`, `forceUninstall`) and the reconciliation path (`refreshInstallState`) are fully implemented. No placeholder values flow to the UI.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes beyond those in the plan's threat model.

- T-03-01 mitigated: All steam:// URLs in install/uninstall route through `buildSteamProtocolUrl` (03-01 chokepoint).
- T-03-03 mitigated: Focus handler takes no renderer input — `refreshInstallState` reads only local ACF and in-memory library Map.
- T-03-04 accepted: `buildInstalledMap` already swallows corrupt/missing ACF without throwing (Phase 2 mitigation reused).

## Self-Check: PASSED

- `src/backend/storeManagers/steam/games.ts`: FOUND
- `src/backend/storeManagers/steam/__tests__/games.test.ts`: FOUND
- `src/backend/storeManagers/steam/library.ts`: FOUND
- `src/backend/storeManagers/steam/__tests__/library.test.ts`: FOUND
- `src/backend/main.ts`: FOUND (focus listener at line 220)
- `src/common/types/game_manager.ts`: FOUND (refreshInstallState? declared)
- Commit `8ee2044` (Task 1 RED): FOUND
- Commit `96d808b` (Task 1 GREEN): FOUND
- Commit `47cfc02` (Task 2 RED): FOUND
- Commit `b105dce` (Task 2 GREEN): FOUND
- Commit `29706ea` (Task 3): FOUND
- All 54 tests pass (38 games + 16 library), codecheck clean
