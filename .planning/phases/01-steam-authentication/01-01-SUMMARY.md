---
phase: 01-steam-authentication
plan: 01
subsystem: auth
tags: [steam, typescript, electron-store, steam-user, react-qr-code, types, runner, library-manager]

requires: []
provides:
  - "'steam' is a first-class Runner accepted everywhere tsc enforces Record<Runner, ...>"
  - "SteamCredentials and SteamUserData types in src/common/types/steam.ts"
  - "steamConfigStore registered as ValidStoreName in StoreStructure"
  - "7 Steam IPC function signatures in ipc.ts (logoutSteam, steamStartQR, steamPollQR, steamStartCredentials, steamSubmitGuard, getSteamUserInfo, checkSteamInstalled)"
  - "LogPrefix.Steam and RunnerToLogPrefixMap.steam entries"
  - "SteamLibraryManager (Phase 1 stub) registered in libraryManagerMap"
  - "SteamGame (Phase 1 stub) implementing Game interface"
  - "npm packages: steam-user@5.3.0, react-qr-code@2.2.0, @types/steam-user@5.1.1"
affects:
  - 01-02 (steam auth backend)
  - 01-03 (steam login UI)
  - all future steam plans

tech-stack:
  added:
    - steam-user@5.3.0 (runtime dep — CM network auth, library fetch)
    - react-qr-code@2.2.0 (runtime dep — QR login UI)
    - "@types/steam-user@5.1.1 (devDep — TypeScript definitions)"
  patterns:
    - "Steam follows same Runner/LibraryManager/Game pattern as Zoom and GOG"
    - "steam-session installs transitively via steam-user — no explicit entry"
    - "Steam IPC types declared in ipc.ts before handlers wired (later plans)"

key-files:
  created:
    - src/common/types/steam.ts
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/games.ts
  modified:
    - package.json
    - src/common/types.ts
    - src/common/types/electron_store.ts
    - src/common/types/ipc.ts
    - src/backend/logger/constants.ts
    - src/backend/wiki_game_info/umu/utils.ts
    - src/backend/storeManagers/index.ts
    - src/common/utils.ts
    - src/frontend/types.ts
    - src/frontend/components/UI/LibraryFilters/index.tsx
    - src/frontend/screens/Library/LibraryContext.tsx
    - src/frontend/screens/Library/index.tsx
    - src/backend/save_sync.ts
    - src/backend/tray_icon/tray_icon.ts
    - src/backend/utils.ts

key-decisions:
  - "steam-session installs as transitive dep of steam-user — not listed explicitly in package.json"
  - "SteamGame stubs throw Error for methods that require real data (getGameInfo, getSettings, getExtraInfo) rather than returning empty objects, to prevent silent failures in Phase 1"
  - "SteamLibraryManager.getGame() returns a real SteamGame instance so libraryManagerMap.steam is usable for type-safe lookups before Phase 2"

patterns-established:
  - "Steam Runner exhaustive maps: every Record<Runner, X> must include 'steam' key — enforced by tsc compile gate"
  - "Phase 1 game stubs throw descriptive errors rather than returning empty data to surface missing implementation clearly"
  - "steamConfigStore cwd is 'steam_store' (matches zoom → 'zoom_store' pattern)"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]

duration: 8min
completed: 2026-06-27
---

# Phase 1 Plan 01: Type + Dependency Foundation Summary

**steam-user@5.3.0 and react-qr-code@2.2.0 installed; 'steam' added to Runner union everywhere tsc enforces it; Phase 1 LibraryManager/Game stubs registered; compile gate (tsc --noEmit) passes clean**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-27T00:02:02Z
- **Completed:** 2026-06-27T00:10:00Z
- **Tasks:** 2 executed (Task 1 was human-verify checkpoint, pre-approved)
- **Files modified:** 15

## Accomplishments

- Installed steam-user@5.3.0, react-qr-code@2.2.0 (runtime deps) and @types/steam-user@5.1.1 (devDep); steam-session installs transitively
- Created `src/common/types/steam.ts` with SteamCredentials and SteamUserData; added 'steam' to Runner union, GameInfo.runner, StoreStructure, ipc.ts, LogPrefix, RunnerToLogPrefixMap, storeMapping
- Created Phase 1 stub SteamLibraryManager and SteamGame implementing LibraryManager/Game interfaces; registered in libraryManagerMap satisfying `Record<Runner, LibraryManager>`
- `npm run codecheck` (tsc --noEmit) exits 0 with no errors

## Task Commits

1. **Task 1: Verify package legitimacy before install** - pre-approved by user (human checkpoint)
2. **Task 2: Install packages and add Steam type foundation** - `7177b04` (feat)
3. **Task 3: Add stub Steam LibraryManager + Game and register in libraryManagerMap** - `74cfeb4` (feat)

## Files Created/Modified

- `src/common/types/steam.ts` - SteamCredentials (refreshToken) and SteamUserData (username, steamId?) types
- `src/backend/storeManagers/steam/library.ts` - SteamLibraryManager Phase 1 stub, implements LibraryManager
- `src/backend/storeManagers/steam/games.ts` - SteamGame Phase 1 stub, implements Game
- `package.json` - steam-user@5.3.0, react-qr-code@2.2.0 in dependencies; @types/steam-user@5.1.1 in devDependencies
- `src/common/types.ts` - 'steam' added to Runner union and GameInfo.runner inline union
- `src/common/types/electron_store.ts` - steamConfigStore added to StoreStructure; SteamUserData import added
- `src/common/types/ipc.ts` - 7 Steam IPC types added to SyncIPCFunctions/AsyncIPCFunctions; SteamUserData import
- `src/backend/logger/constants.ts` - Steam: 'Steam' in LogPrefix; steam: LogPrefix.Steam in RunnerToLogPrefixMap
- `src/backend/wiki_game_info/umu/utils.ts` - steam: 'steam' in storeMapping
- `src/backend/storeManagers/index.ts` - SteamLibraryManager imported and registered as steam: new SteamLibraryManager()
- `src/common/utils.ts` - steam: undefined added to storeMap
- `src/frontend/types.ts` - 'steam' added to Category union; steam: boolean added to StoresFilters
- `src/frontend/components/UI/LibraryFilters/index.tsx` - steam added to RunnerToStore, setStoreOnly initializer, resetFilters
- `src/frontend/screens/Library/LibraryContext.tsx` - steam: true added to default storesFilters context
- `src/frontend/screens/Library/index.tsx` - steam: boolean added to initialStoresfilters
- `src/backend/save_sync.ts` - steam case added to getDefaultSavePath switch
- `src/backend/tray_icon/tray_icon.ts` - Platform indexing narrowed with keyof typeof cast
- `src/backend/utils.ts` - Platform indexing narrowed; AxiosHeaderValue coerced to string

## Decisions Made

- `steam-session` is intentionally not listed in package.json — it installs as a transitive dependency of steam-user (confirmed in npm registry)
- Phase 1 `SteamGame` methods that require real library data (`getGameInfo`, `getSettings`, `getExtraInfo`) throw `Error` rather than returning empty stubs, so callers surface the missing implementation explicitly rather than silently returning bad data
- `SteamLibraryManager.getGame()` returns a real `SteamGame` instance so `libraryManagerMap['steam'].getGame(id)` is type-safe and callable before Phase 2

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added 'steam' to frontend exhaustive maps**
- **Found during:** Task 3 (npm run codecheck)
- **Issue:** Adding 'steam' to Runner union caused tsc errors in `StoresFilters`, `Category`, `RunnerToStore`, `storeMap (common/utils)`, `LibraryFilters/index.tsx`, `LibraryContext.tsx`, `Library/index.tsx` — all missing 'steam' key
- **Fix:** Added steam to each exhaustive map/union; steam: true in filter defaults
- **Files modified:** src/frontend/types.ts, src/frontend/components/UI/LibraryFilters/index.tsx, src/frontend/screens/Library/LibraryContext.tsx, src/frontend/screens/Library/index.tsx, src/common/utils.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 74cfeb4 (Task 3 commit)

**2. [Rule 1 - Bug] Fixed non-exhaustive switch in save_sync.ts after adding 'steam' to Runner**
- **Found during:** Task 3 (npm run codecheck)
- **Issue:** `getDefaultSavePath` switch on Runner had no 'steam' case, causing TS2366 "Function lacks ending return statement"
- **Fix:** Added `case 'steam': return ''` (save sync not applicable in Phase 1)
- **Files modified:** src/backend/save_sync.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 74cfeb4 (Task 3 commit)

**3. [Rule 1 - Bug] Fixed pre-existing Platform indexing errors in tray_icon.ts and utils.ts**
- **Found during:** Task 3 (npm run codecheck)
- **Issue:** `iconSizesByPlatform[platform]` and `necessaryFoldersByPlatform[process.platform]` used `NodeJS.Platform` (which includes 'aix', 'android', etc.) to index objects with only darwin/linux/win32 keys — pre-existing TS7053 errors blocking the compile gate
- **Fix:** Added `as keyof typeof` casts with fallback defaults. These were pre-existing but blocked the plan's compile gate goal.
- **Files modified:** src/backend/tray_icon/tray_icon.ts, src/backend/utils.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 74cfeb4 (Task 3 commit)

**4. [Rule 1 - Bug] Fixed pre-existing AxiosHeaderValue undefined coercion in utils.ts**
- **Found during:** Task 3 (npm run codecheck)
- **Issue:** `parseInt(response.headers['content-length'], 10)` where headers['content-length'] is `AxiosHeaderValue | undefined` — TS2345 error; pre-existing, blocking compile gate
- **Fix:** Wrapped with `String(value ?? '0')` coercion
- **Files modified:** src/backend/utils.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 74cfeb4 (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (2 caused by my Runner union addition, 2 pre-existing bugs fixed to unblock compile gate)
**Impact on plan:** All auto-fixes necessary for the compile gate. No scope creep. Pre-existing fixes (#3, #4) were already failing in the codebase before this plan — fixing them was necessary to satisfy the plan's `must_haves.truths[0]`.

## Known Stubs

| Stub | File | Lines | Reason |
|------|------|-------|--------|
| SteamGame.getGameInfo() throws Error | src/backend/storeManagers/steam/games.ts | 27-30 | Intentional Phase 1 — no library data until Phase 2 |
| SteamGame.getSettings() throws Error | src/backend/storeManagers/steam/games.ts | 21-24 | Intentional Phase 1 — no game config until Phase 2 |
| SteamGame most methods return error/false | src/backend/storeManagers/steam/games.ts | multiple | Intentional Phase 1 — plan spec: "no-ops" until Phase 2 |
| SteamLibraryManager.refresh() returns null | src/backend/storeManagers/steam/library.ts | 22-28 | Intentional Phase 1 — library sync in Phase 2 |
| SteamLibraryManager.getGameInfo() returns undefined | src/backend/storeManagers/steam/library.ts | 30-35 | Intentional Phase 1 |

All stubs are intentional per plan spec. Phase 2 (steam library) resolves them.

## Issues Encountered

None beyond the deviations documented above.

## Next Phase Readiness

- Type foundation is complete: 'steam' recognized everywhere tsc enforces it
- Plan 02 (Steam auth backend) can now import `LogPrefix.Steam`, register `steamConfigStore`, and implement `SteamUser` class
- Plan 03 (Steam login UI) can use `SteamUserData` type and IPC signatures from ipc.ts
- No blockers

---
*Phase: 01-steam-authentication*
*Completed: 2026-06-27*
