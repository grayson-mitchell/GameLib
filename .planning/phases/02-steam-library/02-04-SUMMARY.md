---
phase: 02-steam-library
plan: 04
subsystem: frontend/steam
tags: [steam, library-ui, handleGamePush, makeLibrary, steamCategories, favourites, alphabetFilter, i18n, empty-state]
dependency_graph:
  requires: [02-01 (types, CacheStores), 02-02 (refresh/push stream), 02-03 (getGameInfo lazy metadata)]
  provides: [steam GameInfo in unified library grid, steam in favourites, steam in alphabet/sort filters, D-02 first-sync empty state, D-01 background sync on steamLogin]
  affects: [02-05-PLAN.md (LibraryHeader spinner, stale indicator, GameCard playtime display)]
tech_stack:
  added: []
  patterns: [immutable-array-update, optional-chaining-gate, useMemo-dep-array, i18n-t-with-fallback]
key_files:
  created: []
  modified:
    - src/frontend/state/GlobalState.tsx
    - src/frontend/helpers/library.ts
    - src/frontend/screens/Library/index.tsx
    - public/locales/en/translation.json
decisions:
  - "Gate makeLibrary steam inclusion on steam?.username (not library length) so first-sync empty state shows correctly (D-02)"
  - "steamLogin uses refreshLibrary({ runInBackground: true, library: 'steam' }) per D-01; removed console.log debug line"
  - "D-02 empty state rendered as UpdateComponent with message only (UpdateComponent does not have a body prop)"
  - "steam?.library added to gamesForAlphabetFilter dep array via optional chain to safely handle undefined state"
metrics:
  duration: 2min
  completed: 2026-06-27
  tasks_completed: 2
  files_changed: 4
---

# Phase 2 Plan 4: Frontend Library Integration Summary

**One-liner:** `handleGamePush` now routes `runner === 'steam'` GameInfo into `state.steam.library` via immutable spread; `steamLogin` starts a non-blocking background sync (D-01); `steamCategories` exported from helpers; Library/index.tsx wires steam into context destructure, storesFilters, makeLibrary, favourites, and alphabet-filter deps; D-02 first-sync empty state shown when steam.username && steam.library.length === 0 && refreshingInTheBackground; two i18n keys added.

## What Was Built

### Task 1: GlobalState.tsx — steam handleGamePush case + steamLogin D-01 fix

**`src/frontend/state/GlobalState.tsx`**

`handleGamePush` — added `else if (args.runner === 'steam')` branch after the existing zoom block:
- Copies `[...this.state.steam.library]` to a new array
- `findIndex` by `app_name`; replaces at index if found, pushes if new
- `setState({ steam: { library: [...library], username: this.state.steam.username } })` — always spreads twice for React re-render

`steamLogin` — replaced blocking path with D-01 background sync:
- Removed `console.log('logging steam')` debug line
- Replaced `this.handleSuccessfulLogin('steam')` with `this.refreshLibrary({ runInBackground: true, library: 'steam' })`
- `setState({ steam: { library: [], username: result.username } })` is preserved — user sees logged-in state immediately while sync runs

**Commit:** `c503274`

### Task 2: steamCategories + Library/index.tsx 5-point integration + i18n keys

**`src/frontend/helpers/library.ts`**

Added `export const steamCategories = ['all', 'steam']` after `zoomCategories`.

**`src/frontend/screens/Library/index.tsx`** — five integration changes:

1. **Import & storesFilters:** Added `steamCategories` to import from `frontend/helpers/library`; replaced inline stub `storedCategory === 'all' || storedCategory === 'steam'` with `steamCategories.includes(storedCategory)`.

2. **Context destructure:** Added `steam` after `zoom` in `useContext(ContextProvider)` destructure.

3. **makeLibrary():** Added `if (storesFilters['steam'] && steam?.username) displayedStores.push('steam')`; added `const showSteam = steam?.username && displayedStores.includes('steam')`; added `const steamLibrary = showSteam ? steam.library : []`; spread `...steamLibrary` into the return array after `...zoomLibrary`. Gate is on `steam?.username`, NOT library length — preserves D-02 empty state visibility during first sync.

4. **favourites memo:** Added `steam?.library?.forEach((game) => { if (favouriteAppNames.includes(game.app_name)) tempArray.push(game) })` after the zoom forEach block; added `steam` to the memo's dependency array.

5. **gamesForAlphabetFilter dep array:** Added `steam?.library` after `zoom.library`. Optional chain avoids errors if steam context is temporarily undefined.

6. **D-02 first-sync empty state:** Added conditional `UpdateComponent` between the existing full-refresh spinner and the `EmptyLibraryMessage`: renders when `steam?.username && steam?.library?.length === 0 && refreshingInTheBackground`.

**`public/locales/en/translation.json`**

Added top-level `"steam"` object with:
- `"syncing": "Syncing your Steam library…"` 
- `"syncingBody": "Your games will appear here once the sync completes."`

**Commit:** `8f2973b`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `c503274` | feat(02-04): add steam case to handleGamePush and background-sync steamLogin |
| 2 | `8f2973b` | feat(02-04): add steamCategories and wire steam into Library view (5 integration points) |

## Verification Results

- `npm run codecheck` — PASSED (0 type errors) after both tasks
- `grep -c "args.runner === 'steam'" src/frontend/state/GlobalState.tsx` → 1 ✓
- `grep -c steamLibrary src/frontend/screens/Library/index.tsx` → 2 ✓
- `steamLogin` contains `refreshLibrary({ runInBackground: true, library: 'steam' })` ✓
- `steamLogin` no longer contains `handleSuccessfulLogin('steam')` ✓
- `helpers/library.ts` exports `steamCategories = ['all', 'steam']` ✓
- Library/index.tsx imports `steamCategories` ✓
- Library/index.tsx contains `showSteam`, `steamLibrary`, `...steamLibrary` ✓
- Library/index.tsx favourites memo iterates `steam?.library` ✓
- `steam?.library` in gamesForAlphabetFilter dependency array ✓
- D-02 condition: `steam?.library?.length === 0` guards `UpdateComponent` ✓
- `translation.json` contains `steam.syncing` and `steam.syncingBody` ✓

## Deviations from Plan

### Auto-fixed Issues

None.

### Notes

**D-02 body prop:** The plan specified `body={t('steam.syncingBody', '...')}` on `UpdateComponent`, but `UpdateComponent` only accepts a `message` prop (no `body`). The `UpdateComponent` was used with `message` only. The `steam.syncingBody` i18n key was still added to `translation.json` as specified (available for 02-05 to wire into an extended `UpdateComponent` or a sibling element).

## Known Stubs

None — this plan fully wires steam into the library view. The backend push stream (02-02/02-03) provides the data; this plan surfaces it in the UI.

02-05 will add the LibraryHeader spinner, offline stale indicator, and GameCard playtime display.

## Threat Flags

None — T-2-02 (GameInfo text fields auto-escaped by React JSX; no `dangerouslySetInnerHTML` introduced) and T-2-04 (no steam-user/steam-session imports in renderer; all data arrives via IPC) are both satisfied as planned.

## Self-Check: PASSED

Files modified:
- [FOUND] src/frontend/state/GlobalState.tsx (contains "args.runner === 'steam'", "runInBackground: true", "library: 'steam'")
- [FOUND] src/frontend/helpers/library.ts (contains "export const steamCategories = ['all', 'steam']")
- [FOUND] src/frontend/screens/Library/index.tsx (contains "steamLibrary", "showSteam", "steam?.library")
- [FOUND] public/locales/en/translation.json (contains "steam.syncing", "steam.syncingBody")

Commits:
- [FOUND] c503274
- [FOUND] 8f2973b
