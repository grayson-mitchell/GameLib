---
phase: 02-steam-library
plan: 02
subsystem: backend/steam
tags: [steam, library-sync, getUserOwnedApps, ACF-parsing, tdd, cache, offline-fallback]
dependency_graph:
  requires: [02-01 (SteamUser.getClient, CacheStores, ExtraInfo.steamPlaytimeMinutes)]
  provides: [state.ts (shared Map/Set), buildInstalledMap, SteamLibraryManager.refresh, SteamLibraryManager.init, SteamLibraryManager.getGameInfo]
  affects: [02-03-PLAN.md (games.ts imports state.ts), 02-04-PLAN.md (frontend library view), 02-05-PLAN.md (stale indicator uses steamSyncStore)]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, bitmask-StateFlags, graceful-fs-try-catch, CacheStore-offline-fallback, runOnceWhenOnline-once-per-session]
key_files:
  created:
    - src/backend/storeManagers/steam/state.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
decisions:
  - "buildInstalledMap exported as named function for direct unit testability (not a private class method)"
  - "online_monitor mocked via module alias 'backend/online_monitor' to prevent electron/net import at test load time"
  - "steamMetadataStore.get cast to jest.Mock to work around CacheStore overload inference"
  - "library Map shared via state.ts (not library.ts) to avoid circular import when games.ts imports it in plan 03"
metrics:
  duration: 15min
  completed: 2026-06-27
  tasks_completed: 2
  files_changed: 3
---

# Phase 2 Plan 2: Steam Library Backend Sync Summary

**One-liner:** `SteamLibraryManager.refresh()` fetches owned games via `getUserOwnedApps()` (CM authenticated), merges ACF StateFlags bitmask install state, pushes each GameInfo with playtime to the frontend, persists to CacheStore, and degrades to cache on CM failure; `init()` serves cache then background-syncs; all 7 LIB-01/02/03 tests green.

## What Was Built

### Task 1: state.ts (shared Map/Set) + buildInstalledMap

**`src/backend/storeManagers/steam/state.ts`** — New file. Exports:
- `library: Map<string, GameInfo>` — shared in-memory library used by `library.ts` (refresh/init/getGameInfo) and by `games.ts` (plan 03 lazy metadata fetch) without creating a circular import
- `pendingFetches: Set<string>` — tracks in-flight metadata requests for T-2-03 dedup mitigation (used in plan 03)

**`src/backend/storeManagers/steam/library.ts` — `buildInstalledMap()`** — Exported named function (not a class method, so test can import it directly). Implementation follows RESEARCH Pattern 1:
- Calls `getSteamLibraries()` from `backend/utils` for all library root paths
- For each root, joins `'steamapps'` to get the manifests directory (Pitfall 2 avoided)
- `existsSync` check + `readdirSync` try/catch protect against missing/unreadable directories
- Filters files to `appmanifest_*.acf` only
- Wraps each `readFileSync` + `parse` in try/catch — corrupt/missing ACF skipped (T-2-01 mitigated)
- Uses `(stateFlags & 4) !== 0` bitmask (NOT `=== 4`) — catches StateFlags 6, 516, 774, etc. (Pitfall 6 avoided)
- Returns `Map<number, {installPath, sizeOnDisk}>` keyed by numeric AppID
- `installPath = join(steamappsDir, 'common', installdir)` as required

**TDD RED commit:** `d38fec6` — test file with 3 real buildInstalledMap tests (stub returns empty Map, 2 fail).
**TDD GREEN commit:** `175f7aa` — state.ts created, buildInstalledMap implemented, 3/3 tests pass.

### Task 2: refresh(), init(), getGameInfo()

**`refresh()`** — Full implementation:
1. `SteamUser.getClient()` → null-check with logWarning and return null
2. `client.getUserOwnedApps(client.steamID!, { includePlayedFreeGames: true })` inside try/catch
3. On success: `buildInstalledMap()` → clear `library` Map → loop over apps building `GameInfo` per game with `extra.steamPlaytimeMinutes = app.playtime_forever`, art seeded from `steamMetadataStore.get(appIdStr)` cache, `is_installed` from ACF map, `install` with path/size/platform when installed
4. `sendFrontendMessage('pushGameToLibrary', gameInfo)` per game
5. `steamLibraryStore.set('games', ...)` + `steamSyncStore.set('syncedAt', Date.now())`
6. On catch: `logError`, push each cached game from `steamLibraryStore.get('games', [])`, return `{stdout:'', stderr:String(err)}` (D-09 offline fallback)

**`init()`** — Serves cache then background-syncs (D-01/D-02/D-03/D-09):
- Loads `steamLibraryStore.get('games', [])`, populates `library` Map, pushes each to frontend immediately
- If `SteamUser.isLoggedIn()`: calls `runOnceWhenOnline(() => this.refresh())` — once per session

**`getGameInfo()`** — `library.get(appName)` first, falls back to `steamLibraryStore.get('games', []).find(...)`.

**TDD RED commit:** `c3346ee` — 4 real tests added (all fail against stub refresh).
**TDD GREEN commit:** `36ac5b8` — full implementation; 7/7 tests pass; `npm run codecheck` exits 0.

## Commits

| Task | Phase | Commit | Description |
|------|-------|--------|-------------|
| 1 | RED | `d38fec6` | test(02-02): add failing tests for buildInstalledMap |
| 1 | GREEN | `175f7aa` | feat(02-02): create state.ts and implement buildInstalledMap |
| 2 | RED | `c3346ee` | test(02-02): add failing tests for refresh(), init(), and offline fallback |
| 2 | GREEN | `36ac5b8` | feat(02-02): implement refresh(), init(), getGameInfo() with cache and offline fallback |

## Verification Results

- `npm test -- --testPathPattern="steam/__tests__/library"` — PASSED (7/7 tests, 0 todos, 0 failures)
- `npm run codecheck` — PASSED (0 type errors)
- `library.ts` contains `getUserOwnedApps` and `includePlayedFreeGames` ✓
- `library.ts` contains `& 4` bitmask (not `=== 4`) ✓
- `library.ts` contains `steamSyncStore.set` with `'syncedAt'` ✓
- `library.ts` contains `steamLibraryStore.set` with `'games'` ✓
- `library.ts` contains `steamPlaytimeMinutes` ✓
- `library.ts` wraps per-file parse in try/catch ✓
- `library.ts` joins `'steamapps'` onto `getSteamLibraries()` output ✓
- `state.ts` exports `library` (Map) and `pendingFetches` (Set) ✓
- Zero `it.todo` remaining in `library.test.ts` ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing test infrastructure] online_monitor mock required**
- **Found during:** Task 1 RED — test runner error: `Cannot find module '../../online_monitor'`
- **Issue:** `library.ts` imports `runOnceWhenOnline` from `backend/online_monitor`, which transitively imports `electron`'s `net` (not in test mock). The relative path `../../online_monitor` from the test's `__tests__/` directory resolved incorrectly.
- **Fix:** Added `jest.mock('backend/online_monitor', () => ({ runOnceWhenOnline: jest.fn(), isOnline: jest.fn() }))` using the module alias (`backend/online_monitor`) instead of relative path.
- **Files modified:** `library.test.ts`
- **Commit:** `36ac5b8`

**2. [Rule 1 - Bug] CacheStore overload TypeScript error**
- **Found during:** `npm run codecheck` after Task 2 GREEN
- **Issue:** `jest.mocked(steamMetadataStore.get).mockReturnValue(undefined)` — TypeScript inferred the non-undefined overload of `CacheStore.get()`, making `undefined` an invalid argument.
- **Fix:** Changed to `(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)` to bypass overload resolution.
- **Files modified:** `library.test.ts`
- **Commit:** `36ac5b8`

## TDD Gate Compliance

| Gate | Status | Evidence |
|------|--------|---------|
| RED (test commit before feat) | PASSED | `d38fec6` (test) before `175f7aa` (feat) for Task 1; `c3346ee` (test) before `36ac5b8` (feat) for Task 2 |
| GREEN (all tests pass) | PASSED | 7/7 tests green in final run |
| REFACTOR | N/A | Code clean from first implementation; no refactor pass needed |

## Known Stubs

`refresh()` has one intentional stub: `install.platform` is hardcoded to `'Windows' as const` for installed games. This is a known simplification — the correct platform (Windows/Linux/Mac) can be inferred from the ACF file or launch options, but this is out of scope for Phase 2. Deferred to Phase 3 (install operations).

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes beyond what the plan's threat register describes. T-2-01 (corrupt ACF DoS) and T-2-04 (steam-user in renderer) are both mitigated as planned.

## Self-Check: PASSED

Files created/modified:
- [FOUND] src/backend/storeManagers/steam/state.ts (contains "library" Map and "pendingFetches" Set)
- [FOUND] src/backend/storeManagers/steam/library.ts (contains "getUserOwnedApps", "& 4", "steamPlaytimeMinutes", "steamSyncStore", "steamLibraryStore")
- [FOUND] src/backend/storeManagers/steam/__tests__/library.test.ts (0 it.todo remaining)

Commits:
- [FOUND] d38fec6
- [FOUND] 175f7aa
- [FOUND] c3346ee
- [FOUND] 36ac5b8
