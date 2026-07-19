---
phase: 02-steam-library
plan: 05
subsystem: frontend/steam-ui
tags: [steam, ui, store-logo, playtime, sync-spinner, stale-indicator, refresh-button, ipc, i18n, GameCard, LibraryHeader, StoreLogos]
dependency_graph:
  requires: [02-01 (electronStores/steamSyncStore), 02-02 (push stream), 02-03 (getGameInfo/lazy metadata), 02-04 (library integration)]
  provides: [steam store logo on GameCard, playtime display, getSteamSyncedAt IPC, LibraryHeader sync spinner, offline stale indicator, manual Refresh button]
  affects: []
tech_stack:
  added: []
  patterns: [currentColor-svg, faSyncAlt-spinner, useEffect-IPC-fetch, tokens-only-css, t2-default-namespace]
key_files:
  created:
    - src/frontend/assets/steam-logo.svg
  modified:
    - src/frontend/components/UI/StoreLogos/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.tsx
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/screens/Library/components/LibraryHeader/index.tsx
    - src/frontend/screens/Library/components/LibraryHeader/index.css
    - src/common/types/ipc.ts
    - src/preload/api/steam.ts
    - src/backend/main.ts
    - public/locales/en/translation.json
decisions:
  - "Use steamSyncStore.get('syncedAt') (no-fallback overload returning number|undefined) then ?? null — avoids TypeScript overload mismatch where fallback must match ValueType=number"
  - "Background-sync spinner gated on refreshing && refreshingInTheBackground (existing context state), not a new steam-specific sync flag"
  - "Manual Refresh button added directly in LibraryHeader (not ActionIcons) alongside ActionIcons wrapper div, per plan action text"
  - "formatRelativeTime helper in LibraryHeader computes minutes/hours/days string; passed as interpolation to t('steam.lastSynced', ..., { time })"
  - "steamSyncStore imported into main.ts from storeManagers/steam/electronStores alongside existing SteamUser import"
metrics:
  duration: 5min
  completed: 2026-06-27
  tasks_completed: 3
  files_changed: 9
---

# Phase 2 Plan 5: Steam UI Polish Summary

**One-liner:** Steam store logo SVG added to StoreLogos; GameCard shows pluralized playtime ("N hours"/"Never played") from `extra.steamPlaytimeMinutes`; LibraryHeader gains a background-sync spinner, offline stale indicator, and manual Refresh button via new `getSteamSyncedAt` IPC backed by `steamSyncStore`.

## What Was Built

### Task 1: Steam Logo Asset + StoreLogos Case

**`src/frontend/assets/steam-logo.svg`**

Created a compact single-colour SVG of the Steam gauge mark. Uses `fill="currentColor"` on the `<path>` so it inherits `var(--text-default)` through the `.store-icon` class. Same format as `zoom-logo.svg` (no `<use>/<symbol>` nesting). Sized to 35×35 via the existing `.store-icon` class.

**`src/frontend/components/UI/StoreLogos/index.tsx`**

Added `import SteamLogo from 'frontend/assets/steam-logo.svg?react'` after the ZoomLogo import; added `case 'steam': return <SteamLogo className={className} />` before the `default` case.

**Commit:** `7252c2c`

### Task 2: GameCard Playtime Display + CSS + i18n Keys

**`src/frontend/screens/Library/components/GameCard/index.tsx`**

Added playtime `<span className="steamPlaytime">` after the runner span, inside the `<Link>`. Gated on `runner === 'steam' && gameInfo.extra?.steamPlaytimeMinutes !== undefined`. Logic:
- `steamPlaytimeMinutes === 0` → `t2('game.steam.neverPlayed', 'Never played')`
- Otherwise → `Math.round(value / 60)` hours, with `t2('game.hour')`/`t2('game.hours')` singular/plural
- `undefined` → element omitted entirely

Skeleton state (AppID placeholder + faded cover) handled by the existing `CachedImage` `img.loading`/`img.loaded` opacity pattern — no new code needed. No `dangerouslySetInnerHTML` introduced (T-2-02 satisfied).

**`src/frontend/screens/Library/components/GameCard/index.css`**

Added `.steamPlaytime { font-size: var(--text-sm); color: var(--text-secondary); font-weight: var(--regular); }` — tokens only, no raw hex/px.

**`public/locales/en/translation.json`**

Added `game.hour`, `game.hours`, `game.steam.neverPlayed` keys inside the existing `"game"` object.

**Commit:** `c9c96fa`

### Task 3: getSteamSyncedAt IPC + LibraryHeader

**`src/common/types/ipc.ts`**

Added `getSteamSyncedAt: () => Promise<number | null>` to `AsyncIPCFunctions` after `checkSteamInstalled`.

**`src/preload/api/steam.ts`**

Added `export const getSteamSyncedAt = makeHandlerInvoker('getSteamSyncedAt')` after `checkSteamInstalled`.

**`src/backend/main.ts`**

Imported `steamSyncStore` from `./storeManagers/steam/electronStores`; registered `addHandler('getSteamSyncedAt', () => steamSyncStore.get('syncedAt') ?? null)` after the `checkSteamInstalled` handler. Used the no-fallback overload (returns `number | undefined`) then coerces to `null` via `??` to match the declared `number | null` return type — avoids a TypeScript overload mismatch.

**`src/frontend/screens/Library/components/LibraryHeader/index.tsx`**

Full rewrite to add three new elements while preserving the existing numberOfGames and AddGameButton:

1. **Background-sync spinner:** `faSyncAlt` FontAwesomeIcon inside `libraryTitle`, shown when `refreshing && refreshingInTheBackground`. Tooltip `t('steam.syncing', ...)`. Uses class `steamSyncSpinner`.

2. **Stale indicator:** `<span className="steamStaleIndicator">` below the `libraryTitle` span, shown when `connectivity.status !== 'online' && syncedAt !== null`. Fetched via `window.api.getSteamSyncedAt()` in two `useEffect` hooks (mount + connectivity status change). `formatRelativeTime()` helper converts `Date.now() - syncedAt` into "X minutes ago" / "X hours ago" / "X days ago" (never seconds).

3. **Manual Refresh button:** `<button className="steamRefreshButton">` with `faSyncAlt` icon; calls `window.api.refreshLibrary('steam')`; `disabled` and `.fa-spin` while `refreshing`; visible only when `storesFilters?.steam === true`. Placed inside a new `div.actionIconsWrapper` alongside `<ActionIcons />`.

Context hooks added: `refreshing`, `refreshingInTheBackground`, `connectivity` from `ContextProvider`; `storesFilters` from `LibraryContext`.

**`src/frontend/screens/Library/components/LibraryHeader/index.css`**

Added rules: `.steamSyncSpinner` (color/margin/animation), `.steamStaleIndicator` (var(--text-xs)/var(--text-secondary)), `.actionIconsWrapper` (flex layout), `.steamRefreshButton` (transparent button with var(--action-icon)/var(--accent) states), `.steamRefreshButton.spinning`. `@keyframes refreshing` is referenced, not redefined (defined in UpdateComponent/index.css which is always imported).

**`public/locales/en/translation.json`**

Added `steam.lastSynced` (with `{{time}}` interpolation) and `steam.refresh` to the existing `"steam"` object. `steam.syncing` was already present from plan 04.

**Commit:** `0f8940f`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `7252c2c` | feat(02-05): add steam-logo.svg asset and StoreLogos steam case |
| 2 | `c9c96fa` | feat(02-05): add GameCard playtime display, skeleton note, and i18n keys |
| 3 | `0f8940f` | feat(02-05): add getSteamSyncedAt IPC and LibraryHeader sync spinner, stale indicator, refresh button |

## Verification Results

- `npm run codecheck` — PASSED (0 type errors) after all three tasks
- `npm test -- --testPathPattern=steam` — 8 pre-existing failures in `user.test.ts` (unrelated to this plan; confirmed identical before and after changes); library.test.ts and games.test.ts PASS
- `steam-logo.svg` contains `<svg` and `currentColor` ✓
- `StoreLogos/index.tsx` contains `SteamLogo` import and `case 'steam'` ✓
- `GameCard/index.tsx` contains `steamPlaytime`, `steamPlaytimeMinutes`, gates on `runner === 'steam'`, uses `Math.round`, uses `neverPlayed` ✓
- `GameCard/index.tsx` contains no `dangerouslySetInnerHTML` ✓
- `GameCard/index.css` `.steamPlaytime` uses `var(--text-sm)` and `var(--text-secondary)` ✓
- `ipc.ts` contains `getSteamSyncedAt` ✓
- `preload/api/steam.ts` contains `getSteamSyncedAt` ✓
- `main.ts` registers `addHandler('getSteamSyncedAt'` and references `steamSyncStore` ✓
- `LibraryHeader/index.tsx` contains `faSyncAlt`, calls `window.api.getSteamSyncedAt`, calls `window.api.refreshLibrary('steam')`, references `connectivity` ✓
- `LibraryHeader/index.css` uses `var(--text-xs)` / `var(--text-secondary)` and reuses (not redefines) `@keyframes refreshing` ✓
- `translation.json` contains `syncing`, `lastSynced` with `{{time}}`, `refresh` steam keys ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CacheStore.get() TypeScript overload: null fallback rejected**
- **Found during:** Task 3 implementation
- **Issue:** `steamSyncStore.get('syncedAt', null)` failed type check — the `get(key, fallback: ValueType)` overload requires `ValueType = number`, not `null`
- **Fix:** Used the no-fallback overload `steamSyncStore.get('syncedAt')` returning `number | undefined`, then coerced with `?? null`
- **Files modified:** `src/backend/main.ts`
- **Commit:** `0f8940f` (inline fix, same commit as handler registration)

## Known Stubs

None — all three UI requirements are wired to live data: playtime from `gameInfo.extra.steamPlaytimeMinutes` (populated by games.ts lazy fetch), syncedAt from `steamSyncStore` via the new IPC, sync spinner from existing `refreshing`/`refreshingInTheBackground` context state.

## Threat Flags

None — T-2-02 (no dangerouslySetInnerHTML in GameCard or LibraryHeader) and T-2-04 (no steam-user/steam-session in renderer) both confirmed satisfied.

## Self-Check: PASSED

Files created/modified:
- [FOUND] src/frontend/assets/steam-logo.svg (contains `<svg` and `currentColor`)
- [FOUND] src/frontend/components/UI/StoreLogos/index.tsx (contains `SteamLogo` and `case 'steam'`)
- [FOUND] src/frontend/screens/Library/components/GameCard/index.tsx (contains `steamPlaytime`, `steamPlaytimeMinutes`)
- [FOUND] src/frontend/screens/Library/components/GameCard/index.css (contains `.steamPlaytime`)
- [FOUND] src/frontend/screens/Library/components/LibraryHeader/index.tsx (contains `faSyncAlt`, `getSteamSyncedAt`, `refreshLibrary('steam')`, `connectivity`)
- [FOUND] src/frontend/screens/Library/components/LibraryHeader/index.css (contains `steamSyncSpinner`, `steamStaleIndicator`, `var(--text-xs)`)
- [FOUND] src/common/types/ipc.ts (contains `getSteamSyncedAt`)
- [FOUND] src/preload/api/steam.ts (contains `getSteamSyncedAt`)
- [FOUND] src/backend/main.ts (contains `addHandler('getSteamSyncedAt'` and `steamSyncStore`)
- [FOUND] public/locales/en/translation.json (contains `lastSynced`, `{{time}}`, `refresh` in steam keys)

Commits:
- [FOUND] 7252c2c
- [FOUND] c9c96fa
- [FOUND] 0f8940f
