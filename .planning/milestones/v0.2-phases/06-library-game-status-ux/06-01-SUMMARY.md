---
phase: "06-library-game-status-ux"
plan: "01"
subsystem: "steam-dm-size"
tags: [steam, download-manager, install-size, frontend-fix, tdd]
depends_on:
  requires: []
  provides: [steam-dm-size-helpers, dm-steam-render-fix]
  affects: [downloadmanager, steam-games, download-manager-item]
tech_stack:
  added: []
  patterns:
    - "Runner-gate in addToQueue: if (runner === 'steam') branch before getInstallInfo"
    - "Bounded regex over pc_requirements HTML (T-06-02 — never eval, never DOM-render)"
    - "AppId /^\\d+$/ guard before store API URL construction (T-06-01)"
    - "Fast path: installed game uses ACF install_size without network call"
key_files:
  created: []
  modified:
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx
decisions:
  - "D-01: LIB-05 met via existing game-details-page TimeContainer; no grid-tile work added"
  - "D-02: Size from store appdetails API (pc_requirements.minimum HTML parse) with ACF fast path"
  - "D-03: Best-effort — '?? MB' fallback preserved; no DM finished-list truth-up"
  - "D-04: Steam-only runner gate in downloadqueue.ts; GOG/Epic/Amazon unchanged"
metrics:
  duration_min: 15
  completed: "2026-07-02T19:10:04Z"
  tasks_completed: 3
  files_changed: 4
---

# Phase 06 Plan 01: Steam DM Install Size + Render Fix Summary

Real install size in the download-manager queue for Steam games via two-part fix: `parseSteamStorageRequirement`/`getSteamInstallSize` helpers in `games.ts` + Steam runner-gate in `downloadqueue.ts` + `steam.library` spread in `DownloadManagerItem` that was silently blocking all Steam DM rows.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Steam install-size helpers (TDD) | 47f2bec4 | games.ts, games.test.ts |
| 2 | Steam runner-gate in downloadqueue.ts | 51e63719 | downloadqueue.ts |
| 3 | Fix DownloadManagerItem steam.library lookup | cf4283dc | DownloadManagerItem/index.tsx |

## What Was Built

### Task 1: `parseSteamStorageRequirement` + `getSteamInstallSize` (TDD)

Added two module-level exports to `src/backend/storeManagers/steam/games.ts` placed after `buildSteamProtocolUrl`:

- **`parseSteamStorageRequirement(htmlText)`** — pure function. Guards `typeof !== 'string'`, matches `(\d+(?:\.\d+)?)\s*(TB|GB|MB|KB)\s+available\s+space` case-insensitively, converts via 1024-based multiplier table, returns `Math.round(bytes)`. Never evals or renders the raw HTML (T-06-02).
- **`getSteamInstallSize(appId, gameInfo?)`** — async. Fast path: if game is installed with `install_size`, calls `getFileSize(parseInt(install_size))` (no network). Guards `appId` with `/^\d+$/` before URL construction (T-06-01). Otherwise fetches `STEAM_STORE_API?appids={appId}`, optional-chains `data?.pc_requirements?.minimum` (guards the `[]` case per Pitfall 5), runs `parseSteamStorageRequirement`, and returns `getFileSize(bytes)`. Falls back to `'?? MB'` on any failure with `logWarning` (D-03, T-06-03).

TDD executed: 9 tests failed RED (functions absent), then GREEN with 51/51 passing.

### Task 2: Steam Runner-Gate in `downloadqueue.ts`

Added `import { getSteamInstallSize } from 'backend/storeManagers/steam/games'` and wrapped the existing size-assignment block so `runner === 'steam'` branches directly to `await getSteamInstallSize(...)` while the `else` branch retains the original `getInstallInfo` + GOG-redist logic byte-for-byte (D-04).

### Task 3: `DownloadManagerItem` — `steam.library` Lookup Fix

Two-line fix to `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx`:
1. Added `steam` to the `ContextProvider` destructure at ~L45
2. Added `...steam.library` to the local `library` array at ~L60

This resolves a pre-existing blocking bug: all Steam DM entries were returning `null` from `currentApp` lookup because `steam.library` was absent from the spread. Steam is already provided by `ContextProvider` — the component simply never consumed it.

## Verification

- `pnpm test --testPathPattern="storeManagers/steam/__tests__/games"`: 51/51 pass (GREEN)
- `pnpm run codecheck`: exits 0 (TypeScript clean after all 3 tasks)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all functionality is fully wired. `getSteamInstallSize` returns `'?? MB'` when no size is obtainable, which is the intended best-effort behavior per D-03 (not a stub).

## Threat Flags

No new security-relevant surface introduced beyond what was in the plan's threat model. T-06-01 (appId numeric guard) and T-06-02 (bounded regex, no DOM render) are implemented as specified. T-06-SC: zero new packages installed.

## Self-Check: PASSED

- `src/backend/storeManagers/steam/games.ts` — modified with new exports: FOUND
- `src/backend/storeManagers/steam/__tests__/games.test.ts` — new test cases: FOUND
- `src/backend/downloadmanager/downloadqueue.ts` — Steam runner-gate: FOUND
- `src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx` — steam.library: FOUND
- Commits 47f2bec4, 51e63719, cf4283dc: FOUND
