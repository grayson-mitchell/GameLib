---
phase: 02-steam-library
plan: 03
subsystem: backend/steam
tags: [steam, lazy-metadata, getGameInfo, axios, pendingFetches, dedup, tdd, cache, ipc-push]
dependency_graph:
  requires: [02-02 (state.ts shared Map/Set, SteamLibraryManager.refresh)]
  provides: [SteamGame.getGameInfo, fetchMetadataIfNeeded, pendingFetches-dedup, SteamLibraryManager.getGameInfo-delegation]
  affects: [02-04-PLAN.md (frontend sees enriched GameInfo), 02-05-PLAN.md (library view with real art)]
tech_stack:
  added: []
  patterns: [TDD-RED-GREEN, fire-and-forget-side-effect, module-level-Set-dedup, plain-string-XSS-prevention]
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "pendingFetches.add() placed before await axios.get() to ensure T-2-03 dedup holds across synchronous concurrent callers"
  - "short_description stored as plain string only — never HTML-parsed or injected (T-2-02 threat mitigated)"
  - "library.ts getGameInfo delegates to new SteamGame(appName).getGameInfo() so lazy fetch fires from both call paths"
  - "STEAM_CDN_BASE and STEAM_STORE_API extracted as module constants for readability and grep-ability"
metrics:
  duration: 5min
  completed: 2026-06-27
  tasks_completed: 2
  files_changed: 3
---

# Phase 2 Plan 3: Lazy Steam Metadata — getGameInfo + fetchMetadataIfNeeded Summary

**One-liner:** `SteamGame.getGameInfo()` returns the in-memory library entry synchronously and fires `fetchMetadataIfNeeded()` as a non-blocking side effect when `art_cover` is empty; deduplication via `pendingFetches` Set (add before await), indefinite metadata cache via `steamMetadataStore`, and IPC push to frontend; `SteamLibraryManager.getGameInfo()` delegates to SteamGame so the lazy path triggers from both call sites; all 8 LIB-04 tests green.

## What Was Built

### Task 1 (TDD RED → GREEN): SteamGame.getGameInfo() + fetchMetadataIfNeeded()

**`src/backend/storeManagers/steam/games.ts`**

`getGameInfo()` — replaces the Phase-1 throwing stub:
- Reads `existing = library.get(this.appId)` (shared Map from state.ts)
- Returns `{} as GameInfo` when entry absent
- When `!existing.art_cover`, calls `void this.fetchMetadataIfNeeded(existing)` (fire-and-forget, non-blocking)
- Returns `existing` synchronously — caller gets current data immediately

`fetchMetadataIfNeeded(current: GameInfo)` — private async method:
1. **T-2-03 dedup guard:** `if (pendingFetches.has(this.appId)) return` → `pendingFetches.add(this.appId)` BEFORE any await
2. `axios.get('https://store.steampowered.com/api/appdetails?appids={id}')`
3. Reads `resp.data?.[appId]?.data` — returns silently if falsy (delisted game / API down)
4. Constructs CDN URLs: `https://cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg` and `capsule_616x353.jpg`
5. Builds `extra` preserving `current.extra` (especially `steamPlaytimeMinutes`) + adds `about.description`, `about.shortDescription`, `genres` as string array
6. **T-2-02:** `short_description` stored as plain string — no HTML parsing, no `dangerouslySetInnerHTML`
7. `steamMetadataStore.set(appId, { art_cover, art_square, extra })` — indefinite cache (D-05)
8. `library.set(appId, updated)` — in-memory update
9. `sendFrontendMessage('pushGameToLibrary', updated)` — frontend re-renders GameCard with real art + title
10. `catch`: `logWarning([..., err], LogPrefix.Steam)` — no throw
11. `finally`: `pendingFetches.delete(this.appId)` — always cleans up

**TDD RED commit:** `00284cb` — 7 real assertions converted from it.todo() stubs (all fail against throwing stub)
**TDD GREEN commit:** `08cc69c` — full implementation; all 7 pass

### Task 2: SteamLibraryManager.getGameInfo() delegates to lazy path

**`src/backend/storeManagers/steam/library.ts`**

`getGameInfo(appName)` updated to delegate:
```
const fromGame = new SteamGame(appName).getGameInfo()
if (fromGame.app_name) return fromGame
// fallback to steamLibraryStore cache for pre-init cold start
```

This ensures the IPC path `getGameInfo(appName, 'steam')` (used by GameCard on viewport visibility) reaches `fetchMetadataIfNeeded` whether the caller uses the library manager or the per-game `getGame(id)` entry point.

**`src/backend/storeManagers/steam/__tests__/games.test.ts`**

Integration test added: imports `SteamLibraryManager`, populates library Map with an entry lacking `art_cover`, calls `manager.getGameInfo(APP_ID)`, awaits flushAsync, asserts `axios.get` was called once with the correct appdetails URL.

Additional mocks added for modules pulled in transitively by `library.ts` import: `graceful-fs`, `@node-steam/vdf`, `backend/utils`, `../user`, `backend/online_monitor`.

**Commit:** `9297824`

## Commits

| Task | Phase | Commit | Description |
|------|-------|--------|-------------|
| 1 | RED | `00284cb` | test(02-03): add failing tests for SteamGame.getGameInfo lazy metadata |
| 1 | GREEN | `08cc69c` | feat(02-03): implement SteamGame.getGameInfo() with lazy metadata fetch |
| 2 | — | `9297824` | feat(02-03): delegate SteamLibraryManager.getGameInfo() to lazy SteamGame path |

## Verification Results

- `npm test -- --testPathPattern="steam/__tests__/games"` — PASSED (8/8 tests, 0 failures)
- `npm test -- --testPathPattern="steam/__tests__/library"` — PASSED (7/7 tests)
- `npm run codecheck` — PASSED (0 type errors)
- `games.ts` contains `fetchMetadataIfNeeded` ✓
- `games.ts pendingFetches.add` at line 66, `axios.get` at line 69 (add BEFORE await) ✓
- `games.ts` contains `cdn.cloudflare.steamstatic.com/steam/apps/` ✓
- `games.ts` contains `store.steampowered.com/api/appdetails` ✓
- `games.ts` contains no `dangerouslySetInnerHTML` or HTML parsing ✓
- `grep -c "it.todo"` in games.test.ts → 0 ✓
- Dedup test (concurrent getGameInfo, single axios.get call) passes ✓
- Pre-existing `user.test.ts` failures: 8 failures unchanged (session.on vs session.once, documented in 02-01-SUMMARY.md deferred issues)

## Deviations from Plan

None — plan executed exactly as written.

## TDD Gate Compliance

| Gate | Status | Evidence |
|------|--------|---------|
| RED (test commit before feat) | PASSED | `00284cb` (test) before `08cc69c` (feat) for Task 1 |
| GREEN (all tests pass) | PASSED | 8/8 tests green in final run |
| REFACTOR | N/A | Clean implementation from the start |

## Known Stubs

None — this plan completes the backend data layer. `games.ts` non-metadata methods (install, launch, etc.) remain as Phase-3 stubs with explicit error messages, but these are intentional per the plan scope.

## Threat Flags

None — T-2-02 (short_description XSS) and T-2-03 (concurrent fetch storm) are both mitigated as planned. No new trust boundaries introduced.

## Self-Check: PASSED

Files created/modified:
- [FOUND] src/backend/storeManagers/steam/games.ts (contains "fetchMetadataIfNeeded", "pendingFetches", "cdn.cloudflare.steamstatic.com", "store.steampowered.com/api/appdetails")
- [FOUND] src/backend/storeManagers/steam/library.ts (contains "new SteamGame(appName).getGameInfo()" in getGameInfo)
- [FOUND] src/backend/storeManagers/steam/__tests__/games.test.ts (0 it.todo remaining, contains SteamLibraryManager integration test)

Commits:
- [FOUND] 00284cb
- [FOUND] 08cc69c
- [FOUND] 9297824
