# Phase 48: Focus row — Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 14 (create/modify) + 3 removal-only
**Analogs found:** 12 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx` (new) | component (tier-2 panel section) | request-response (click → context setter) | `src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx` | exact (clearable single-select shape) |
| `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss` (new) | style | n/a | `FilterFacetGroup/index.scss` (divider/row sub-styles) + `FilterCollectionList/index.scss` | role-match |
| `src/frontend/screens/Library/components/FocusRowStrip/index.tsx` (new) | component (horizontal strip container) | CRUD (reads context/state, renders list) | `src/frontend/screens/Library/components/RecentlyPlayed/index.tsx` | role-match (closest "lane" shape); **no sideways-scroll analog exists in this codebase — see "No Analog Found"** |
| `src/frontend/screens/Library/components/FocusRowStrip/index.css` (new) | style | n/a | `src/frontend/screens/Library/index.css:1-16` (`.gameList`/`.firstLane`) for spacing only; **no scroll-track analog** | partial |
| `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts` (new, suggested) | utility (data selection/ordering) | transform | `RecentlyPlayed/index.tsx`'s `getRecentGames` + `Library/index.tsx:916-922` (title `localeCompare`) | role-match |
| `src/frontend/screens/Library/index.tsx` (modify) | screen/controller | request-response | itself — lane insertion block `:1218-1238`, flags `:577,596-597` | exact (in-place edit) |
| `src/frontend/components/UI/Header/index.tsx` (modify) | component (panel assembly) | request-response | itself — `Header__categoriesGroup`/`Header__filtersGroup` assembly `:284-298` | exact (in-place edit) |
| `src/frontend/state/GlobalState.tsx` (modify) | store/provider | CRUD (state + persistence) | itself — `handleLibraryTopSection` `:798-800`, `libraryTopSection` field `:120,492` | exact (in-place edit) |
| `src/frontend/state/ContextProvider.tsx` (modify) | provider | CRUD | itself — `libraryTopSection: 'disabled'` default `:52-53` | exact (in-place edit) |
| `src/frontend/screens/Library/LibraryContext.ts` (modify, likely) | provider/context | CRUD | existing `currentCollection`/`setCurrentCollection` pair (consumed by `FilterCollectionList`) | role-match |
| `src/common/types.ts` (modify) | model (type defs) | n/a | itself — `LibraryTopSectionOptions` `:170-174` | exact (in-place edit) |
| `src/backend/config.ts` (modify) | config/model (GlobalConfig defaults + migration) | CRUD | itself — `libraryTopSection: 'disabled'` default `:349` | exact (in-place edit) |
| `src/backend/recent_games/recent_games.ts` (modify) | service | CRUD | itself — `maxRecentGames()` / `getRecentGames()` `:7-19` | exact (in-place edit) |
| `src/frontend/screens/Library/engineWiring.ts` (modify, comment only) | utility/doc | n/a | itself — stale doc comment `:175` | exact (in-place edit) |
| `src/frontend/screens/Settings/components/LibraryTopSection.tsx` (delete) | component (settings control) | n/a | — | removal |
| `src/frontend/screens/Settings/components/MaxRecentGames.tsx` (delete) | component (settings control) | n/a | — | removal |
| `src/frontend/screens/Settings/components/index.ts` (modify, barrel) | config/barrel | n/a | itself `:44` | exact (in-place edit) |
| `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx` (modify) | screen | n/a | itself `:16,80` | exact (in-place edit) |
| `public/locales/en/gamelib.json` (modify) | config (i18n catalogue) | n/a | existing `library.filterPanel.*` keys | exact |

## Pattern Assignments

### `FilterFocusRow/index.tsx` (new panel section)

**Analog:** `src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx` (clearable single-select) + `FilterStoreFacet/index.tsx` (empty-group `return null`) + `FilterViewList/index.tsx` (literal `tGamelib` call sites).

**Clear-by-reclick pattern** (`FilterCollectionList/index.tsx:58-60`):
```typescript
const selectCollection = (value: string) => {
  setCurrentCollection(currentCollection === value ? null : value)
}
```
Copy this verbatim, generalized to `{ kind, value }`:
```typescript
const selectFocusRow = (kind: FocusRowKind, value: string) => {
  const isSame = focusRow?.kind === kind && focusRow?.value === value
  setFocusRow(isSame ? null : { kind, value })
}
```

**Row shape** (`FilterCollectionList/index.tsx:75-84`):
```typescript
<NavItem
  key={category}
  elementType="button"
  className="FilterCollectionList__row"
  label={category}
  active={currentCollection === category}
  onClick={() => selectCollection(category)}
/>
```

**Group wrapper, no selection-count badge** (`FilterCollectionList/index.tsx:62-66`):
```typescript
<FilterFacetGroup
  title={tGamelib('gamelib:library.filterPanel.collections', 'Collections')}
  className="FilterCollectionList"
>
```
`FOCUS ROW` calls `FilterFacetGroup` the same way — `title` only, no `selectedCount`/`selectedCountLabel` (UI-SPEC explicit: single-select sections don't get a count badge).

**Empty-group omission** (`FilterStoreFacet/index.tsx:39-41`):
```typescript
if (connectedStores.length === 0) {
  return null
}
```
Apply this per sub-group (Collections, Store) inside the single `FOCUS ROW` disclosure — not a `return null` on the whole component, since Views and Runnability are ungated and must still render.

**Literal i18n call sites, not lookup tables** (`FilterViewList/index.tsx`, each row inline):
```typescript
label: tGamelib('gamelib:library.filterPanel.viewAll', 'All games')
```
Mandatory per the measured `pnpm i18n` failure documented in that file's own header comment (storing `{value, key, defaultText}` in an array yielded zero extracted keys). Every `FOCUS ROW` sub-group label and divider label must be a literal `tGamelib(...)`/`t(...)` call, not built from a variable.

**Divider label (non-interactive, new):** no existing analog — UI-SPEC specifies plain text, `--text-xs`/`--regular`/`--text-secondary`, no group wrapper, no button semantics. Implement as a bare `<span>`/`<p>`, not a component.

### `FilterFocusRow/index.scss` (new)

**Analog:** `FilterFacetGroup/index.scss:79-100` (group title uppercase/`--text-xs`/`0.1em` tracking — inherited free via `FilterFacetGroup` reuse, no override needed) and `:153-154` (existing long-row ellipsis treatment, to be copied for the divider labels and for `NavItem`'s overridden `white-space` per UI-SPEC E2/E3) and `:286-288` (`opacity: 0.38` for `.FilterFacetRow--zero`, reused verbatim for the forward/back controls' disabled state — not a new opacity value).

### `FocusRowStrip/index.tsx` (new strip container)

**Analog:** `RecentlyPlayed/index.tsx` (closest "lane" shape — header + `GamesList`), generalized away from the `showHidden`/`onlyInstalled` recency-only shape toward a generic pick. `Library/index.tsx:1228-1236`'s favourites-lane JSX block is the header-markup analog.

**Header + list wiring** (`RecentlyPlayed/index.tsx:102-113`):
```typescript
if (!recentGames.length) {
  return null
}

return (
  <>
    <h5 className="libraryHeader">{t('Recent', 'Played Recently')}</h5>
    <GamesList
      library={recentGames}
      isFirstLane
      handleGameCardClick={handleModal}
      onlyInstalled={onlyInstalled}
      isRecent={true}
    />
  </>
)
```
The strip's header must instead use `Library/index.tsx:1228-1236`'s exact markup (`div.library-section-header` > `h3.libraryHeader`), per UI-SPEC "no new header treatment":
```typescript
<div className="library-section-header">
  <h3 className="libraryHeader">{echoedPickLabel}</h3>
</div>
```

**`passesHiddenLaneFilter` call** (`RecentlyPlayed/index.tsx:48-51,69-71`):
```typescript
const hiddenAppNames = hiddenGames.list.map((game) => game.appName)
...
newRecentGames = newRecentGames.filter((game: GameInfo) =>
  passesHiddenLaneFilter(hiddenAppNames.includes(game.app_name), showHidden)
)
```
SPEC R4 requires the focus row call this too — copy the filter call, not the surrounding recency-only fetch logic.

**Zero-result → render nothing** (`RecentlyPlayed/index.tsx:98-100`):
```typescript
if (!recentGames.length) {
  return null
}
```
Reuse directly — UI-SPEC's "no empty-state UI at all" requirement matches this existing convention exactly.

**Ordering analog** — `Library/index.tsx:916-922`'s title `localeCompare` (leading `The `-stripped) is the non-recency ordering path; copy it for every pick except recently-played.

### `GamesList` reuse (no new component)

**Analog:** `src/frontend/screens/Library/components/GamesList/` — already takes `isFirstLane`/`isRecent`/`isFavourite`/`layout`. The strip wraps this unchanged; do not fork a card renderer (locked by SPEC Constraints).

### `FocusRowStrip/index.css` — the net-new scroll track

**No analog exists.** `.gameList` (`Library/index.css:1-8`) is `display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))` — it wraps, which the strip must never do. `.gameList.firstLane` (`:10-12`) only overrides padding. **State explicitly: this codebase has no prior horizontal-scroll-with-overflow-controls component to copy from.** The UI-SPEC's own `.focusRowStrip`/`.focusRowTrack` CSS block (lines 258–285 of `48-UI-SPEC.md`) is the closest thing to a pattern and should be treated as the spec, not an analog — reuse only the two verbatim-reused values it calls out: `padding: 0 var(--space-md-fixed) var(--space-md-fixed)` (matches `.gameList.firstLane` exactly) and `gap: 1.5rem` (`.gameList`'s own `grid-gap`, `Library/index.css:5`).

### `Header/index.tsx` modification (new group div insertion)

**Analog:** itself — the existing `Header__categoriesGroup`/`Header__filtersGroup` divs (`:284-298`).
```typescript
<div
  className="Header__categoriesGroup"
  data-tour="library-views-collections"
>
  <FilterViewList />
  <FilterCollectionList />
</div>
<div className="Header__filtersGroup" data-tour="library-facets">
  <FilterStoreFacet />
  <FilterRunnabilityFacet />
  <FilterMoreGroup />
</div>
```
Insert a new `<div className="Header__focusRowGroup" data-tour="...">` sibling between these two, wrapping one `FilterFocusRow` (per D-10/UI-SPEC "Panel Section Shape").

### `Library/index.tsx` modification (lane replacement)

**Current flags to replace** (`:577,596-597`):
```typescript
const showRecentGames = libraryTopSection.startsWith('recently_played')
...
const showFavourites =
  libraryTopSection === 'favourites' && !!favouriteGamesList.length
```
**Current insertion point** (`:1218-1238`):
```typescript
{showRecentGames && (
  <RecentlyPlayed
    handleModal={handleModal}
    onlyInstalled={libraryTopSection.endsWith('installed')}
    showHidden={showHidden}
  />
)}

{showFavourites && !showFavouritesLibrary && (
  <>
    <div className="library-section-header">
      <h3 className="libraryHeader">{t('favourites', 'Favourites')}</h3>
    </div>
    <GamesList
      library={favourites}
      handleGameCardClick={handleModal}
      isFavourite
      isFirstLane
    />
  </>
)}
```
Both branches collapse into one `<FocusRowStrip focusRow={focusRow} handleModal={handleModal} showHidden={showHidden} />` at the same position. **Do not touch** the `KNOWN NUANCE` comment block immediately above (`:1205-1212`) except to note it now describes intended behavior per SPEC R4 — leave the comment, do not "correct" the asymmetry.

### Backend persistence pair: `common/types.ts` + `config.ts`

**Current enum** (`src/common/types.ts:170-174`):
```typescript
export type LibraryTopSectionOptions =
  | 'disabled'
  | 'recently_played'
  | 'recently_played_installed'
  | 'favourites'
```
**Current default** (`src/backend/config.ts:349`):
```typescript
libraryTopSection: 'disabled',
```
New shape (per CONTEXT.md, left to planning): a `FocusRowSelection = { kind: 'view'|'collection'|'store'|'runnability'; value: string } | null` type, added alongside (not necessarily replacing) `LibraryTopSectionOptions`/`libraryTopSection` — CONTEXT.md leaves open whether the old key is widened or a new key added. Follow the exact same declare-in-`types.ts`/default-in-`config.ts` pairing shown above for whichever shape is chosen.

### `recent_games.ts` — fixed-constant bound

**Current** (`src/backend/recent_games/recent_games.ts:7-19`):
```typescript
const maxRecentGames = async () => {
  const { maxRecentGames } = GlobalConfig.get().getSettings()
  return maxRecentGames || 5
}

const getRecentGames = async (options?: { limited: boolean }) => {
  const games = configStore.get('games.recent', [])
  if (options?.limited) {
    return games.slice(0, await maxRecentGames())
  } else {
    return games
  }
}
```
Target: replace the `GlobalConfig`-sourced `maxRecentGames()` with a literal constant `RECENT_GAMES_LIMIT = 20`, used both by `getRecentGames({ limited: true })` and by `addRecentGame`'s write path (SPEC R6: the bound must apply to storage, evicting the 21st distinct game, without truncating an already-longer existing list on upgrade — so the slice must be applied only going forward, at write time in `addRecentGame`, not retroactively at every read).

### Settings removal

**`Settings/components/index.ts:44`** — barrel export line for `MaxRecentGames` to delete; same file's sibling exports for `LibraryTopSection` (verify exact line) also delete.
**`Settings/sections/GeneralSettings/index.tsx:16,80`** — import line and render call site for both components to delete.

### `engineWiring.ts:175` comment fix

```typescript
// those are off by default (`libraryTopSection` defaults to `'disabled'`;
```
Update to describe the new focus-row default (off/null) rather than leaving a stale claim about `libraryTopSection`.

## Shared Patterns

### Clearable single-select
**Source:** `FilterCollectionList/index.tsx:58-60`
**Apply to:** `FilterFocusRow`'s selection handler — the single pattern for "re-click active row to clear."

### Collapsible group wrapper, no badge
**Source:** `FilterFacetGroup` (whole component) + `FilterCollectionList`'s call convention (title only)
**Apply to:** `FilterFocusRow`'s outer shell.

### Empty-group `return null`
**Source:** `FilterStoreFacet/index.tsx:39-41`
**Apply to:** `FilterFocusRow`'s Collections and Store sub-groups (Views and Runnability are ungated, per UI-SPEC E1).

### Literal i18n call sites
**Source:** `FilterViewList/index.tsx` header comment + row definitions
**Apply to:** every new label in `FilterFocusRow` and the strip header fallback text — never a lookup table keyed by a variable.

### Hidden-games lane filter
**Source:** `RecentlyPlayed/index.tsx:48-51,69-71`, `Library/filterEngine.ts`'s `passesHiddenLaneFilter`
**Apply to:** `FocusRowStrip`'s data-selection step — the one filter dimension the focus row must still honour (SPEC R4).

### Opacity-disabled convention
**Source:** `FilterFacetGroup/index.scss:286-288` (`.FilterFacetRow--zero { opacity: 0.38 }`)
**Apply to:** the forward/back overflow controls' disabled state (UI-SPEC E6) — reuse this value, do not invent a new one.

### `--navbar-active` consumer census
**Source:** `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts:92-99` (`NAVBAR_ACTIVE_CONSUMERS`)
**Apply to:** only if any new stylesheet ends up consuming `--navbar-active` directly — UI-SPEC's own default choice (`--accent` directly for the forward/back controls) avoids this obligation, so this applies only if that default is not followed.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `FocusRowStrip/index.css` scroll-track rules (`.focusRowTrack`, forward/back controls) | component style | event-driven (scroll, gamepad focus) | **Nothing in this codebase scrolls games sideways today** (confirmed in SPEC Background: "Nothing in this codebase scrolls games sideways"). `.gameList`/`.firstLane` are grid/padding-only. The UI-SPEC's own CSS block (lines 258–285) is the design contract to implement against, not a pre-existing analog — do not force-fit `.gameList` as if it were one. |
| Horizontal gamepad-focus-scroll-into-view handler | utility/event-driven | event-driven | `GamesList/index.tsx:47-79`'s `scrollCardIntoView` is a **vertical** analogue keyed off `main.content`'s `scrollTop`. UI-SPEC explicitly flags the horizontal version as "new code, not a prop change" — there is no horizontal precedent to copy, only the vertical one's *approach* (focused element's rect relative to its own scroll container) to adapt. |
| Forward/back overflow control component itself (36px circular overlay button) | component | event-driven | No existing GameLib component is a circular overlay button positioned absolutely over card art. `FilterFacetGroup`'s `faChevronDown` toggle is the only prior chevron-icon usage and is a disclosure caret, not a scroll control — icon-library convention only, not a layout/behavior analog. |

## Metadata

**Analog search scope:** `src/frontend/components/UI/NavShell/components/**`, `src/frontend/screens/Library/**`, `src/frontend/screens/Settings/**`, `src/backend/recent_games/`, `src/backend/config.ts`, `src/common/types.ts`
**Files scanned:** ~20 (FilterCollectionList, FilterFacetGroup, FilterViewList, FilterStoreFacet, NavItem, RecentlyPlayed, GamesList, Library/index.tsx, Library/index.css, Header/index.tsx, GlobalState.tsx, ContextProvider.tsx, recent_games.ts, config.ts, common/types.ts, engineWiring.ts)
**Pattern extraction date:** 2026-10-03
