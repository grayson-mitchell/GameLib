---
phase: quick-260628-pi7
plan: "01"
subsystem: steam-library
tags: [steam, last-played, playtime, frontend, types]
dependency_graph:
  requires: []
  provides: [steamLastPlayed-field, steam-timecontainer-branch]
  affects: [src/common/types.ts, src/backend/storeManagers/steam/library.ts, src/frontend/screens/Game/TimeContainer/index.tsx]
tech_stack:
  added: []
  patterns: [ExtraInfo field extension, dedicated runner branch in TimeContainer]
key_files:
  created: []
  modified:
    - src/common/types.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/frontend/screens/Game/TimeContainer/index.tsx
decisions:
  - "Cached metadata spread placed first in extra object; fresh playtime/last-played fields placed after to override stale cache on every sync"
  - "Steam TimeContainer branch renders two lines (Last Played date + Total Time Played) and exits early so non-Steam tsInfo/never paths are unchanged"
  - "rtime_last_played defaults to 0 when absent; 0 is falsy in the UI renderer, displaying Never for games never launched through Steam"
metrics:
  duration: ~6 min
  completed: 2026-06-28
---

# Phase quick-260628-pi7 Plan 01: Steam Last Played Summary

**One-liner:** Steam game details page now shows real Last Played date from `rtime_last_played` and Total Time Played sourced from the Steam CM sync, with fresh values winning over stale cache.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Thread steamLastPlayed through types, Steam sync, and test | a9da562 | types.ts, library.ts, library.test.ts |
| 2 | Render dedicated Steam Last Played + Total Time branch | 29aea48 | TimeContainer/index.tsx |

## What Was Built

**Task 1 - Backend + types:**
- Added `steamLastPlayed?: number` to `ExtraInfo` interface with JSDoc documenting it as a Unix-seconds timestamp from `getUserOwnedApps()`.
- Added `rtime_last_played?: number` to the local `ownedApps` array element type in `library.ts` `refresh()` (the field exists at runtime in `CPlayer_GetOwnedGames_Response_Game` but `@types/steam-user` omits it).
- Reordered the `extra` object so `cachedMeta?.extra` spread comes FIRST and `steamPlaytimeMinutes`/`steamLastPlayed` come AFTER, ensuring fresh CM data always overrides stale cache values.
- Extended `makeOwnedApp` test helper to accept optional `rtime_last_played` param (default 0).
- Added new LIB-03 test asserting `extra.steamLastPlayed === rtime_last_played` from the owned app.

**Task 2 - Frontend:**
- Added a dedicated `if (runner === 'steam')` branch in `TimeContainer` that fires before the generic `!tsInfo` block.
- Renders two `<p className="timeContainerLabel">` lines: Last Played (locale-formatted date from `steamLastPlayed * 1000`, falling back to "Never"), and Total Time Played (via existing `formatSteamPlaytime`).
- Removed the now-redundant `steamTotalPlaytime` const and its injection into the `!tsInfo` fragment.
- Restored the `!tsInfo` branch to a single "Last Played: Never" `<p>` — Steam games never reach this path.

## Verification

- `npm run codecheck` (tsc --noEmit): PASS — 0 errors
- `npx jest --testPathPattern=steam`: PASS — 73 tests across 6 suites

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — all data is wired from the live Steam CM sync through `extra.steamLastPlayed`.

**Important note for users:** A library Refresh (or GamerLib relaunch) is required to populate `steamLastPlayed` for the first time. Existing cached library data predates this field, so until a resync runs, Steam games will show "Last Played: Never". This is expected and documented behavior.

## Self-Check: PASSED

- src/common/types.ts: steamLastPlayed field present
- src/backend/storeManagers/steam/library.ts: rtime_last_played type + steamLastPlayed assignment present
- src/backend/storeManagers/steam/__tests__/library.test.ts: new LIB-03 assertion present
- src/frontend/screens/Game/TimeContainer/index.tsx: dedicated steam branch present
- Commit a9da562: exists
- Commit 29aea48: exists
