---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
reviewed: 2026-10-05T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - src/backend/config.ts
  - src/backend/recent_games/recent_games.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/common/__tests__/focusRowMigration.test.ts
  - src/common/focusRowMigration.ts
  - src/common/types.ts
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
  - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx
  - src/frontend/screens/Library/__tests__/engineWiring.test.ts
  - src/frontend/screens/Library/__tests__/filterChipRowPlacement.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowSelectors.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
  - src/frontend/screens/Library/engineWiring.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Settings/components/index.ts
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
findings:
  critical: 1
  warning: 2
  info: 4
  total: 7
status: issues_found
---

# Phase 48: Code Review Report

**Reviewed:** 2026-10-05
**Depth:** standard
**Files Reviewed:** 28 (`index.css`/`index.scss` skimmed only)
**Status:** issues_found

## Summary

The strip, selector, overflow arithmetic and panel section are largely sound. The three deleted files have no live references (only stale comments, IN-02). `getRecentGames()` callers are all updated: the only two callers (`recent_games.ts:18`, `:40`) already pass no argument. `tsc --noEmit` is clean and ESLint reports 0 errors on the touched TS/TSX.

The significant finding is that the one-time legacy migration is correct in isolation but never reaches the renderer. It populates the backend `GlobalConfig` in memory, while `GlobalState` seeds `focusRow` from a different store (CR-01).

Both prior-review flags were checked and are NOT confirmed as defects (see "Prior-review flags" below).

## Critical Issues

### CR-01: Legacy `libraryTopSection` seed never reaches the renderer (SPEC R7 not delivered at runtime)

**File:** `src/frontend/state/GlobalState.tsx:57,490` (consumer), `src/backend/config.ts:341-342,406-407` (producer)

**Issue:** `migrateFocusRowSelection` runs inside `GlobalConfigV0.getSettings()`. That only fills `GlobalConfig`'s in-memory `this.config` and, on the next `flush()`, `config.json`. The renderer does not read either.

`GlobalState` initialises its state from the module-level `const globalSettings = configStore.get_nodefault('settings')` (line 57), then `focusRow: globalSettings?.focusRow ?? null` (line 490). That is the renderer-side `configStore['settings']` mirror (`store/config.json`).

The mirror is written only in two places: `GlobalConfig.setSetting` (`config.ts:406-407`, which spreads the existing mirror and so never adds a `focusRow` key) and `writeConfig` in `utils.ts:1814`. Neither runs the migration.

Trace for an upgrading user who had `libraryTopSection: 'recently_played'`:
- The old `useSetting` write put `libraryTopSection` into the mirror.
- The backend seeds `focusRow` in memory only.
- The renderer reads the mirror, finds no `focusRow`, and gets `null`.
- The Library shows no focus row.
- The seed is lost, silently.

If the user picks and then clears, `null` is written and the problem disappears, which makes it hard to notice. The old code was correct only because it read `libraryTopSection` from that same mirror. `trayIconVariant` works because its UI reads `requestAppSettings`, not the mirror.

`focusRowMigration.test.ts` exercises `migrateFocusRowSelection` directly, so the gap is invisible to the suite. This is a static trace and was not run live.

**Fix:** Hydrate `focusRow` from the migrated source instead of the mirror. Either option works:
```ts
// GlobalState: after mount (componentDidMount), pull the migrated value
window.api.requestAppSettings().then(({ focusRow }) => {
  if (isValidFocusRowSelection(focusRow)) this.setState({ focusRow })
})
```
or have the backend write the migrated value into the mirror when it derives it in `getSettings()`. Add a test that drives the real read path from a legacy `{ libraryTopSection: 'recently_played' }` fixture to the `focusRow` the context exposes.

## Warnings

### WR-01: `{ kind: 'view', value: <unrecognised> }` passes validation and renders an unlabelled strip of arbitrary games

**File:** `src/common/focusRowMigration.ts:30-49`, `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts:62-70`, `FocusRowStrip/index.tsx:150-178`

**Issue:** The validator accepts any non-empty string `value`. `passesView` (`filterEngine.ts:174`) has `default: return true`. So a stale, hand-edited or future-version `{kind:'view', value:'bogus'}` becomes "all games": the first 20 titles alphabetically render.

`FocusRowStrip`'s `default: label = ''` then gives that strip an empty header. The migration docstring presents the fall-through as benign, but it is not "selects no games", and the user sees an unexplained, labelless row. The panel highlights nothing, so there is no obvious way to see what is selected.

Other kinds degrade safely (unknown store, runnability and collection values match zero games and the strip returns `null`). Only `view` is open-ended.

**Fix:** In `selectFocusRowGames`, return `[]` for a `view` value that is not one of `all | installed | recentlyPlayed | favourites`. Better, tighten `isValidFocusRowSelection` for `kind === 'view'` so both the migration and the renderer reject it:
```ts
const VIEW_VALUES = ['all', 'installed', 'recentlyPlayed', 'favourites']
if (kind === 'view' && !VIEW_VALUES.includes(pickValue)) return false
```

### WR-02: A present-but-invalid `focusRow` resurrects the legacy seed, contradicting the "present key permanently disarms" contract

**File:** `src/common/focusRowMigration.ts:84-96`, `src/backend/config.ts:342`

**Issue:** The `GlobalState.handleFocusRow` comment says a present key "permanently disarms the one-time legacy seed". The code does not guarantee this. A present `focusRow` that fails validation falls through to the `libraryTopSection` switch.

A user who cleared the row long ago, and whose file still carries `libraryTopSection: 'favourites'`, gets the favourites row back after any corruption or manual edit of `focusRow`. The intent was "an invalid value never reaches the renderer", which only requires returning `null`, not re-seeding.

**Fix:** Once the key is present, never consult the legacy field:
```ts
if (stored && 'focusRow' in stored) {
  return isValidFocusRowSelection(stored.focusRow) ? stored.focusRow : null
}
```

## Prior-review flags

**(1) `handleFocusRow` fire-and-forget / read-modify-write race: NOT CONFIRMED.**
- `window.api.setSetting` is a one-way `ipcMain.on` send (`settingsFlowRegistration.ts:160`) returning `void`, so there is nothing to `await` or `.catch`. ESLint raises no floating-promise warning at `GlobalState.tsx:806`. It also matches the existing pattern in `useSettingsContext.ts:87`.
- `GlobalConfig.setSetting` (`config.ts:404-420`) is fully synchronous: an in-memory read-modify-write followed by `writeFileSync`. The sidecar is single-threaded and IPC frames are processed in order, so rapid picks serialise and the last pick wins.
- The residual risk is a thrown write failure with no rollback of the optimistic `setState`. That is low-severity and shared with every other setting.

**(2) `RunnerToStore[focusRow.value]` yields an undefined label: NOT CONFIRMED in practice.**
- `RunnerToStore` covers every `StoreFacetValue` except `sideload`, which is special-cased directly above.
- A stale or unknown store value matches zero games in `filterLibrary`, so `hasGames` is false and the component returns `null` before the label code runs.
- It is still fragile because the map is `Record<string,string>`, so TypeScript would never flag a missing key. A `?? focusRow.value` fallback would make it robust (IN-03).

**Also verified, no defect:**
- Event-listener cleanup in `FocusRowStrip`: the scroll listener, the `ResizeObserver` and the capture-phase focus listener are all removed in their effect cleanups, with matching `capture` options.
- `isValidFocusRowSelection` is defined once in `common/focusRowMigration.ts` and re-exported from `focusRowSelectors.ts`. `migrateFocusRowSelection` and `selectFocusRowGames` both use it. `GlobalState` does not validate on load; it relies on the selector, which is safe because `focusRow?.kind` access is null-safe.
- Migration of absent, unrecognised and non-string `libraryTopSection` values returns `null` (the `switch` default arm). `stored` being `null` is handled.
- DLC exclusion is preserved: `filterEngine.ts:371` excludes DLC, matching the old lane.

## Info

### IN-01: Retired settings strings left in 47 locale files

**File:** `public/locales/*/translation.json` (e.g. `en/translation.json:902,958`)
**Issue:** `setting.library_top_section`, `setting.library_top_option.*` and `setting.maxRecentGames` are no longer referenced by any source file, but remain in 47 locale files.
**Fix:** Prune the keys via the project's i18n pass, mindful of the documented key-removal traps.

### IN-02: Stale comments referencing deleted files

**File:** `src/frontend/screens/Library/index.tsx:211,217`; `FocusRowStrip/index.tsx:53`; `meta/hardcodedStringGate.ts:760`
**Issue:** The comments still point at `RecentlyPlayed/index.tsx`, which no longer exists.
**Fix:** Reword them to describe the history without a path.

### IN-03: Unchecked brand-map lookup for the store label

**File:** `src/frontend/screens/Library/components/FocusRowStrip/index.tsx:186`; `FilterFocusRow/index.tsx:~127`
**Issue:** `RunnerToStore[value]` has type `string` regardless of key, so an unmapped value is invisible to the compiler.
**Fix:** `RunnerToStore[focusRow.value] ?? focusRow.value`.

### IN-04: Stale doc comment on `FocusRowSelection`

**File:** `src/common/types.ts:~178`
**Issue:** The comment says the value is validated by `isValidFocusRowSelection` "in FocusRowStrip/focusRowSelectors.ts". The function now lives in `common/focusRowMigration.ts` and is only re-exported from that file.
**Fix:** Update the reference.

---

_Reviewed: 2026-10-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
