---
phase: 02-steam-library
plan: 01
subsystem: backend/steam
tags: [steam, cache, types, test-scaffold, tdd]
dependency_graph:
  requires: [phase-01-steam-authentication]
  provides: [SteamUser.getClient, steamLibraryStore, steamMetadataStore, steamSyncStore, SteamMetadataCacheEntry, ExtraInfo.steamPlaytimeMinutes, library.test.ts-scaffold, games.test.ts-scaffold]
  affects: [02-02-PLAN.md, 02-03-PLAN.md, 02-04-PLAN.md]
tech_stack:
  added: []
  patterns: [CacheStore-null-lifespan, static-accessor, optional-type-extension, jest-todo-scaffold]
key_files:
  created:
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
  modified:
    - src/backend/storeManagers/steam/user.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/common/types.ts
decisions:
  - "CacheStore lifespan set to null (indefinite) per D-05 — Steam library data has no TTL; user-triggered refresh handles staleness"
  - "SteamMetadataCacheEntry interface exported from electronStores.ts to keep all Steam store types co-located"
  - "steamPlaytimeMinutes typed as optional (?: number) so non-Steam runners leave it undefined with no default"
  - "Pre-existing user.test.ts mock gap (session.on vs session.once) logged as deferred — out of scope for plan 02-01"
metrics:
  duration: 4min
  completed: 2026-06-27
  tasks_completed: 3
  files_changed: 5
---

# Phase 2 Plan 1: Steam Library Foundation Summary

**One-liner:** Phase 2 foundation — `SteamUser.getClient()` accessor, three indefinite CacheStores for library/metadata/sync, `ExtraInfo.steamPlaytimeMinutes` field, and Jest RED-target scaffolds for LIB-01 through LIB-04.

## What Was Built

### Task 1: SteamUser.getClient(), CacheStores, ExtraInfo extension

**`src/backend/storeManagers/steam/user.ts`**
Added `static getClient(): InstanceType<typeof SteamUserLib> | null` immediately after `isLoggedIn()`. This is the only change to user.ts — it exposes the authenticated steam-user client that `SteamLibraryManager.refresh()` (plan 02) will call to reach the CM connection.

**`src/backend/storeManagers/steam/electronStores.ts`**
Replaced the single-export file with full CacheStore scaffolding following the `zoom/electronStores.ts` analog:
- `steamLibraryStore = new CacheStore<GameInfo[], 'games'>('steam_library', null)` — full library list, indefinite lifespan
- `steamMetadataStore = new CacheStore<SteamMetadataCacheEntry>('steam_metadata', null)` — per-game artwork/extra, keyed by appId
- `steamSyncStore = new CacheStore<number, 'syncedAt'>('steam_sync', null)` — last sync timestamp epoch for stale indicator (plan 05)
- `SteamMetadataCacheEntry` interface exported: `{ art_cover: string; art_square: string; extra: ExtraInfo }`

None of these are registered in StoreStructure — CacheStore manages its own file under `store_cache/` per the RESEARCH anti-pattern guard.

**`src/common/types.ts`**
Added `steamPlaytimeMinutes?: number` to `ExtraInfo` with JSDoc comment noting it comes from `getUserOwnedApps()`. Optional so all non-Steam runners leave it undefined.

### Task 2: library.test.ts RED scaffold (LIB-01/02/03)

`src/backend/storeManagers/steam/__tests__/library.test.ts` — 8 `it.todo()` stubs covering:
- LIB-01: `refresh()` calls `getUserOwnedApps`, builds `GameInfo` per app, pushes via `sendFrontendMessage`
- LIB-02: `buildInstalledMap` reads ACF StateFlags bit 4, handles corrupt files without throwing
- LIB-03: `GameInfo.extra.steamPlaytimeMinutes` equals `app.playtime_forever`
- Cache fallback: serves `steamLibraryStore` when `getUserOwnedApps` throws

Mocks: `backend/logger` (factory form to prevent fs-extra native crash), `backend/utils`, `graceful-fs`, `@node-steam/vdf`, `../../../ipc`, `../user`, `../electronStores`.

### Task 3: games.test.ts RED scaffold (LIB-04)

`src/backend/storeManagers/steam/__tests__/games.test.ts` — 7 `it.todo()` stubs covering:
- Synchronous return of existing library entry
- Lazy `fetchMetadataIfNeeded` triggering Steam store appdetails API when `art_cover` is empty
- Populated `art_cover`, `art_square`, title, genres, `about.description` after fetch
- `steamMetadataStore` write for indefinite reuse
- `sendFrontendMessage pushGameToLibrary` push with updated `GameInfo`
- `pendingFetches` Set dedup — only one network request per appId (mitigates T-2-03)
- Failed appdetails request caught and logged without throwing

Mocks: `backend/logger` (factory), `axios`, `../../../ipc`, `../electronStores`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `eb566ca` | feat(02-01): add SteamUser.getClient(), CacheStores, and ExtraInfo.steamPlaytimeMinutes |
| 2 | `c4d771d` | test(02-01): add library.test.ts scaffold with RED targets for LIB-01/02/03 |
| 3 | `80bc473` | test(02-01): add games.test.ts scaffold with RED targets for LIB-04 |

## Verification Results

- `npm run codecheck` — PASSED (0 type errors)
- `npm test --testPathPattern=storeManagers/steam/__tests__/library --passWithNoTests` — PASSED (8 todos, 0 failures)
- `npm test --testPathPattern=storeManagers/steam/__tests__/games --passWithNoTests` — PASSED (7 todos, 0 failures)
- `npm test --testPathPattern=storeManagers/steam --passWithNoTests` — FAILED (pre-existing failures in user.test.ts — see Deferred Issues)

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

### Pre-existing user.test.ts mock gap (out of scope)

**Discovered during:** Overall verification (`npm test --testPathPattern=storeManagers/steam`)
**Scope:** `src/backend/storeManagers/steam/__tests__/user.test.ts` — Phase 1 test file, NOT modified by plan 02-01
**Issue:** `mockSessionInstance` in user.test.ts defines `on()` but the production code (`user.ts`) calls `session.once()`. Jest does not automatically alias `on` to `once`. This causes 8 tests in user.test.ts to fail with `session.once is not a function` or incorrect event-handler capture.
**Confirmed pre-existing:** Verified by stashing plan 02-01 commits — same 8 failures existed before any changes.
**Fix needed:** Add `once: jest.fn((event, cb) => { sessionOnHandlers[event] = cb })` to `mockSessionInstance` in user.test.ts, and add matching `once` capture in `beforeEach` re-establishment. This is a Phase 1 fix ticket.
**Impact on plan 02-01:** None — the new test scaffolds (library.test.ts, games.test.ts) pass cleanly. The overall `steam` pattern test command exits non-zero due to these pre-existing failures only.

## Known Stubs

None — this plan creates no UI components or data-flow stubs. The `it.todo()` stubs in the test files are intentional RED-phase targets, not hidden data stubs.

## Threat Flags

None — this plan adds no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries. The `SteamMetadataCacheEntry` type and CacheStores remain in `src/backend/` only (T-2-04 mitigated per threat register).

## Self-Check: PASSED

Files created/modified:
- [FOUND] src/backend/storeManagers/steam/user.ts (contains "static getClient")
- [FOUND] src/backend/storeManagers/steam/electronStores.ts (contains "steamLibraryStore", "steamMetadataStore", "steamSyncStore")
- [FOUND] src/common/types.ts (contains "steamPlaytimeMinutes")
- [FOUND] src/backend/storeManagers/steam/__tests__/library.test.ts
- [FOUND] src/backend/storeManagers/steam/__tests__/games.test.ts

Commits:
- [FOUND] eb566ca
- [FOUND] c4d771d
- [FOUND] 80bc473
