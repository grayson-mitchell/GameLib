---
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
plan: 02
subsystem: steam-crossover-bottle
tags: [steam, crossover, wine, bottle, electron-store, typescript]

# Dependency graph
requires:
  - phase: 17-01 (Wave 0 spike / research groundwork, if applicable)
    provides: RESEARCH.md architecture (dedicated bottle, non-provisioning foundation scope)
provides:
  - DEFAULT_STEAM_BOTTLE_NAME, STEAM_BOTTLE_RESERVED_APPNAME, STEAM_SETUP_EXE_URL constants
  - steamBottleConfigStore (dedicated TypeCheckedStoreBackend, distinct from auth-only configStore)
  - SteamBottleConfig type (common/types/steam.ts)
  - bottle.ts: getBottleDir, getBottleSteamappsDir, isBottleProvisioned, sanitizeBottleName, getSteamBottleSettings
affects: [17-03 (library ACF), 17-04 (provisioning), 17-05 (games routing)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dedicated electron-store per settings domain (steamBottleConfigStore) instead of a phantom GameConfig entry"
    - "Type-alias (not interface) required for any type used as a full StoreStructure value, to satisfy the Record<string, unknown> generic bound"
    - "Single sanitizeBottleName() chokepoint for all bottle-name -> path/argv sites (T-17-01)"

key-files:
  created:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  modified:
    - src/backend/storeManagers/steam/constants.ts
    - src/backend/storeManagers/steam/electronStores.ts
    - src/common/types/steam.ts
    - src/common/types/electron_store.ts

key-decisions:
  - "SteamBottleConfig must be declared as a `type` alias, not an `interface` — TypeScript only grants implicit index-signature assignability (needed for StoreStructure's Record<string, unknown> bound) to type-literal aliases, not to interfaces"
  - "SteamBottleConfig lives in common/types/steam.ts (not inline in electronStores.ts) so common/types/electron_store.ts's StoreStructure can reference it without a common->backend reverse dependency; electronStores.ts re-exports it"
  - "isBottleProvisioned() defaults its name lookup to the stored SteamBottleConfig.bottleName field; getSteamBottleSettings() reads the separate wineCrossoverBottle field for the GameSettings composition (matches the plan's literal field references)"

patterns-established:
  - "Every new bottle-name-carrying path/argv site must call sanitizeBottleName() first (T-17-01 chokepoint) — do not re-implement ad hoc validation"
  - "isBottleProvisioned()'s cxbottle.conf existence check is the canonical reuse point for launcher.ts:828-836's bottle-exists gate; 17-04's provisioning decision should call this rather than re-deriving it"

requirements-completed: [MACSTEAM-02, MACSTEAM-05]

# Metrics
duration: ~14min
completed: 2026-07-10
---

# Phase 17 Plan 02: Steam Bottle Foundation Summary

**Dedicated `GameLibSteam` CrossOver bottle constants, a standalone `steamBottleConfigStore`, and injection-safe path/guard helpers (`bottle.ts`) that 17-03/17-04/17-05 import directly with zero exploration needed.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-07-10T21:59:43+12:00 (base commit)
- **Completed:** 2026-07-10T22:13:09+12:00
- **Tasks:** 2/2 completed
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments

- Named the dedicated Steam bottle (`GameLibSteam`) distinct from the shared GOG/Epic `GameLib` bottle (D-01), plus the reserved synthetic appName constant and the official HTTPS SteamSetup.exe URL
- Added a standalone `steamBottleConfigStore` (not a phantom `GameConfig` entry) persisting the bottle's own Wine engine + provisioned/login state
- Built and fully unit-tested the `bottle.ts` foundation module: bottle-scoped path resolution, the T-17-01 `sanitizeBottleName` chokepoint, the reused `cxbottle.conf`-existence provisioned-state signal, and a `GameSettings` composition helper for the dedicated bottle

## Task Commits

Each task was committed atomically:

1. **Task 1: Bottle constants + dedicated settings store** - `a1e5dbc1` (feat)
2. **Task 2: bottle.ts path/guard foundation + tests** - `94f55f94` (feat)

## Files Created/Modified

- `src/backend/storeManagers/steam/constants.ts` - `DEFAULT_STEAM_BOTTLE_NAME`, `STEAM_BOTTLE_RESERVED_APPNAME`, `STEAM_SETUP_EXE_URL`
- `src/backend/storeManagers/steam/electronStores.ts` - new `steamBottleConfigStore`; re-exports `SteamBottleConfig` type
- `src/common/types/steam.ts` - new `SteamBottleConfig` type alias (`bottleName`, `wineVersion?`, `wineCrossoverBottle?`, `provisioned`, `loggedIn`)
- `src/common/types/electron_store.ts` - registered `steamBottleConfigStore: SteamBottleConfig` in `StoreStructure`
- `src/backend/storeManagers/steam/bottle.ts` (NEW) - `getBottleDir`, `getBottleSteamappsDir`, `isBottleProvisioned`, `sanitizeBottleName`, `getSteamBottleSettings`
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` (NEW) - 15 tests covering all five behaviors

## Exported Symbols Reference (for 17-03/17-04/17-05)

**`src/backend/storeManagers/steam/constants.ts`:**
- `DEFAULT_STEAM_BOTTLE_NAME = 'GameLibSteam'`
- `STEAM_BOTTLE_RESERVED_APPNAME = '__gamelib_steam_bottle__'`
- `STEAM_SETUP_EXE_URL = 'https://cdn.cloudflare.steamstatic.com/client/installer/SteamSetup.exe'`

**`src/backend/storeManagers/steam/electronStores.ts`:**
- `steamBottleConfigStore: TypeCheckedStoreBackend<'steamBottleConfigStore'>` — `.get_nodefault('bottleName' | 'wineVersion' | 'wineCrossoverBottle' | 'provisioned' | 'loggedIn')`, `.set(key, value)`
- `SteamBottleConfig` type (re-exported from `common/types/steam`)

**`src/backend/storeManagers/steam/bottle.ts`:**
- `getBottleDir(bottleName: string): string` — `<userHome>/Library/Application Support/CrossOver/Bottles/<bottleName>`
- `getBottleSteamappsDir(bottleName: string): string` — bottle dir + `drive_c/Program Files (x86)/Steam/steamapps`
- `isBottleProvisioned(bottleName?: string): boolean` — `cxbottle.conf` existence check; defaults to stored `bottleName` then `DEFAULT_STEAM_BOTTLE_NAME`
- `sanitizeBottleName(name: string): string | null` — T-17-01 chokepoint; rejects `/ \ .. \0`/empty/whitespace-only; returns trimmed name otherwise
- `getSteamBottleSettings(): GameSettings` — composes from `GlobalConfig.get().getSettings()` + `steamBottleConfigStore`, overriding `wineCrossoverBottle` (falls back to `DEFAULT_STEAM_BOTTLE_NAME`) and `wineVersion` (falls back to the global default)

## Decisions Made

- **`SteamBottleConfig` as a `type` alias, not `interface`:** Discovered during Task 1 that `tsc` rejected `steamBottleConfigStore: SteamBottleConfig` inside `StoreStructure` (`Record<string, unknown>` bound) specifically because it referenced a named `interface` as the entire store-value type — TypeScript only grants implicit index-signature assignability to type-literal aliases (and inline object literals), not to interfaces. Every other `StoreStructure` entry is written as an inline object literal for exactly this reason. Declared `SteamBottleConfig` as `export type SteamBottleConfig = {...}` to match.
- **Location of `SteamBottleConfig`:** Placed in `common/types/steam.ts` (sibling to `SteamUserData`) rather than only in `electronStores.ts`, so `common/types/electron_store.ts` can reference it in `StoreStructure` without introducing a `common -> backend` reverse import. `electronStores.ts` imports and re-exports it, satisfying the plan's "export an interface `SteamBottleConfig`" requirement functionally.
- **Field split between `isBottleProvisioned` and `getSteamBottleSettings`:** `isBottleProvisioned()` looks up the stored `bottleName` field (the bottle's identity); `getSteamBottleSettings()` reads the separate `wineCrossoverBottle` field (the `GameSettings`-shaped value handed to `runWineCommand`). Both fall back to the same `DEFAULT_STEAM_BOTTLE_NAME` constant, so in practice they stay in sync once 17-04 provisioning writes both fields together.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered `steamBottleConfigStore` in `StoreStructure` (not in the plan's `files_modified` list)**
- **Found during:** Task 1 (Bottle constants + dedicated settings store)
- **Issue:** `new TypeCheckedStoreBackend('steamBottleConfigStore', {...})` requires `'steamBottleConfigStore'` to be a valid key of `StoreStructure` (`ValidStoreName = keyof StoreStructure`) for `tsc` to accept it — the plan's action only listed `electronStores.ts` as needing this addition, but the type registration lives in `common/types/electron_store.ts`, which was not in the plan's `files_modified`.
- **Fix:** Added `SteamBottleConfig` type to `common/types/steam.ts` and registered `steamBottleConfigStore: SteamBottleConfig` in `StoreStructure` (`common/types/electron_store.ts`).
- **Files modified:** `src/common/types/steam.ts`, `src/common/types/electron_store.ts`
- **Verification:** `npm run codecheck` (tsc --noEmit) exits 0.
- **Committed in:** `a1e5dbc1` (Task 1 commit)

**2. [Rule 3 - Blocking] `SteamBottleConfig` declared as `type`, not `interface`**
- **Found during:** Task 1, immediately after the above fix
- **Issue:** Declaring `SteamBottleConfig` as an `interface` still failed `tsc` with "Type 'SteamBottleConfig' is not assignable to type 'Record<string, unknown>' — Index signature for type 'string' is missing" when used as a full `StoreStructure` value (the frontend `TypeCheckedStoreFrontend`'s generic constraint `StoreOptions<T extends Record<string, unknown>>` is checked against the full `StoreStructure[ValidStoreName]` union).
- **Fix:** Changed the declaration from `export interface SteamBottleConfig {...}` to `export type SteamBottleConfig = {...}`.
- **Files modified:** `src/common/types/steam.ts`
- **Verification:** `npm run codecheck` exits 0.
- **Committed in:** `a1e5dbc1` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking type-registration issues, same root cause discovered in sequence)
**Impact on plan:** Both fixes were strictly necessary to make the plan's own literal instruction ("built with `new TypeCheckedStoreBackend('steamBottleConfigStore', ...)`") compile at all. No scope creep — no new runtime behavior, only type registration.

## Issues Encountered

None beyond the two deviations above (both resolved during Task 1 before Task 2 began).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 17-03 (library ACF) can import `getBottleSteamappsDir` directly to root its bottle-aware ACF scan.
- 17-04 (provisioning) can import `isBottleProvisioned`, `sanitizeBottleName`, `getSteamBottleSettings`, and `STEAM_SETUP_EXE_URL`/`STEAM_BOTTLE_RESERVED_APPNAME` with zero further exploration.
- 17-05 (games routing) can import `getSteamBottleSettings` to source the `GameSettings` handed to `runWineCommand` for bottled install/launch/uninstall.
- No blockers. This plan intentionally shipped zero provisioning/install-routing/IPC logic — that is 17-04/17-05 scope per the plan's objective.

---
*Phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i*
*Completed: 2026-07-10*
