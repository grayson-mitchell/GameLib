---
phase: quick-261027-jjz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/__tests__/librarySort.test.ts
  - src/preload/tauriTransport.ts
  - src/preload/api/misc.ts
  - src/frontend/types.ts
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
  - src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts
  - public/locales/*/gamelib.json
  - public/locales/*/gamelib.mt.json
autonomous: true
requirements: [TODO-2026-10-03-library-sort-slice-1]

must_haves:
  truths:
    - "The Games panel offers a sort-field select (Name / Last played / Install size), a direction toggle, and a separate group-by select (None / Install status / Store)"
    - "Unknown values (never played, not installed, unparseable or zero size) sort LAST in both directions; ties break by Name ascending"
    - "Last played reads extra.steamLastPlayed (seconds) for runner 'steam' and timestampStore lastPlayed (ISO) for every other runner, both normalised to epoch ms; tsStore is never read for Steam"
    - "Group-by Install status keeps today's installed -> installing -> not-installed order; group-by Store groups by runner, sort applied inside each group"
    - "Choices persist in localStorage; a user with only the old sortDescending/sortInstalled keys gets the equivalent new state; tampered values fall back to defaults"
    - "Defaults for a fresh profile: Name, ascending, grouped by Install status (today's behaviour)"
    - "ConsoleMode's own A->Z / Z->A toggle is unchanged"
  artifacts:
    - path: "src/frontend/screens/Library/librarySort.ts"
      provides: "Pure sort/group/parse/persistence module"
      exports: ["sortAndGroupLibrary", "parseInstallSize", "readLibrarySortPrefs", "writeLibrarySortField", "writeLibrarySortDirection", "writeLibraryGroupBy"]
    - path: "src/frontend/screens/Library/__tests__/librarySort.test.ts"
      provides: "jest coverage for the pure module"
    - path: "src/preload/tauriTransport.ts"
      provides: "ensureStoreHydrated(storeName) awaitable lazy-store hydration"
      contains: "export function ensureStoreHydrated"
  key_links:
    - from: "src/frontend/screens/Library/index.tsx"
      to: "src/frontend/screens/Library/librarySort.ts"
      via: "libraryToShow useMemo calls sortAndGroupLibrary"
      pattern: "sortAndGroupLibrary\\("
    - from: "src/frontend/screens/Library/index.tsx"
      to: "window.api.storeEnsureHydrated"
      via: "effect that builds the non-Steam lastPlayed map after timestampStore hydrates"
      pattern: "storeEnsureHydrated\\('timestampStore'\\)"
    - from: "src/frontend/components/UI/Header/index.tsx"
      to: "LibraryContext sortField/setSortField/sortDirection/setSortDirection/groupBy/setGroupBy"
      via: "useContext(LibraryContext)"
      pattern: "setGroupBy"
---

<objective>
Implement slice 1 of `.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md`:
replace the `sortDescending` boolean with a sort FIELD (`name` | `lastPlayed` | `installSize`) plus
direction, and replace `sortInstalled` with a separate GROUP-BY (`none` | `installStatus` | `store`).

The todo's `## Decisions (operator, 2026-10-27)` section is LOCKED. Do not revisit it. Specifically:
no Playtime, no Date purchased/added, no Release date, no Developer, no new sort field beyond the
three; do NOT add a `tsStore` write to `dispatchSteamLaunch`; do NOT read `tsStore` for Steam.

Purpose: each future sort key becomes one list entry instead of another localStorage boolean, and
grouping becomes its own axis (Playnite's SortOrder / GroupableField split).
Output: a pure, tested `librarySort.ts`; the Library + Header wired to it; strings in all 49
gamelib catalogs. Do NOT move the todo to completed (the orchestrator decides).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md
@./CLAUDE.md

## Executor constraints (apply to EVERY task)

- The working tree has unrelated uncommitted changes (at plan time: `.planning/notes/...`,
  `.planning/todos/...`, `src/backend/storeManagers/steam/bridge/allowlist*`, `.planning/debug/...`,
  a spike `.exe`) and another session may be committing concurrently. Every commit MUST use explicit
  pathspecs: `git add -- <paths>` then `git commit -m "..." -- <paths>`. NEVER `git add -A`, `-a`,
  `.` or a directory. After each commit run `git show --stat HEAD` and confirm it lists ONLY this
  task's files. If a file you need to edit is already dirty from someone else before you touch it,
  stop and report rather than commit it.
- Every commit message ends with a blank line then:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Commit message prefix: `feat(quick-261027-jjz): ...` (tests-only RED commit: `test(quick-261027-jjz): ...`).
- `npx prettier --check` over the exact `src/` paths each task wrote (scoped, never `.`). Note
  `src/preload/.prettierrc` sets printWidth 120 for the preload files. `public/locales/**` and
  `.planning/**` are prettier-ignored: do not put a prettier check over them (it would be vacuous);
  hand-match the surrounding file's indentation and key order instead.
- Do not move or edit the todo file.
- Jest runs in `testEnvironment: 'node'` (no jsdom): components are tested by calling them as
  functions / reading source text, as the existing Header and Library tests already do.

## Measured facts the executor needs (no exploration required)

Current state in `src/frontend/screens/Library/index.tsx`:
- L489-503: `sortDescending` state from `storage.getItem('sortDescending') || 'false'` (JSON) and
  `handleSortDescending`; `sortInstalled` from `storage.getItem('sortInstalled') || 'true'` and
  `handleSortInstalled`. `storage` is the module's localStorage handle already used there.
- L857-890: `libraryToShow` useMemo: alphabet-letter filter, then sort by
  `a.title.toUpperCase().replace('THE ', '')` with `localeCompare` (negated when descending), then
  when `sortInstalled` concatenates `installed` (`game.is_installed`), `installingGames`
  (`!is_installed && installing.includes(app_name)`), `notInstalled`. Deps:
  `[gamesForAlphabetFilter, alphabetFilterLetter, sortDescending, sortInstalled, installing]`.
- L1097-1098 and L1105-1106: the four values are passed into `LibraryContext.Provider`.
- L239-249: `recentAppNames` state, refreshed via `window.api.handleRecentGamesChanged`.
- L50 imports `configStore, steamConfigStore` from `frontend/helpers/electronStores`;
  `timestampStore` is exported from the same module (L190, store name `timestamp`).

Other consumers (complete grep of `sortDescending|sortInstalled|library-sort-*`):
- `src/frontend/types.ts:324-327` — `LibraryContextType` fields `sortDescending`,
  `setSortDescending`, `sortInstalled`, `setSortInstalled`.
- `src/frontend/screens/Library/LibraryContext.tsx:21-24` — initial context values.
- `src/frontend/components/UI/Header/index.tsx:87-90` (destructure), `:231-266` (the A-Z button
  with `data-tour="library-sort-az"`, and the sort-by-status button with
  `data-tour="library-sort-installed"` and the `Header__statusGlyph` badge). Icons imported at
  L17-20: `faArrowDownAZ`, `faArrowDownZA`, `faHardDrive`, `faCircleXmark` (check each for other
  uses in the file before removing the import).
- `src/frontend/components/UI/Header/index.css:~70-95` — `.Header__statusGlyph` and
  `.Header__statusGlyphBadge` rules (only consumer is that button; `grep -rn statusGlyph src`
  confirms only Header/index.tsx and index.css).
- `src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx` — stub type + defaults
  at L55-58 / L79-82; test at ~L408 asserts `.Header` has exactly six direct children in order
  (utilities, search, categoriesGroup, focusRowGroup, filtersGroup, footer); test at ~L420 asserts
  `Header__utilities` holds exactly six controls (Link, button x4, TourButton). The test renders
  via `Header({...})` as a plain function and walks elements; `findByDataTour(tree, value)` helper
  at ~L328.
- `src/frontend/screens/Library/components/LibraryTour.tsx:115-130` — steps for
  `[data-tour="library-sort-az"]` (`t('tour.library.sortOptions', ...)`) and
  `[data-tour="library-sort-installed"]` (`t('tour.library.sortInstalled', ...)`). The file
  already has `const { t: tGamelib } = useTranslation('gamelib')` (L28).
- `src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx:103-104` — `EXPECTED_ELEMENTS`
  lists both old anchors in order.
- `src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx:782-796` — D-08
  source gate: FilterChipRow source must not mention sort vocabulary. Extend the regex, keep it.
- `src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts:37-46` — comment
  cites `Library/index.tsx:916-922` and "no `sortDescending`"; its comparator duplicates the
  grid's title expression. Comment-only update.
- `src/frontend/screens/ConsoleMode/index.tsx:158,451-452` — own local `ascending` state and
  `gamelib:consoleMode.sort*` strings. It does NOT read LibraryContext sort state: leave it
  untouched.

Data facts:
- `GameInfo.extra.steamLastPlayed?: number` (`common/types.ts:221`), Unix SECONDS; 0/undefined =
  never played.
- `timestampStore.get_nodefault(appName)` returns `{ firstPlayed, lastPlayed: string (ISO), totalPlayed } | undefined`.
- `timestampStore` is a LAZY store (`src/common/types/storePolicy.ts` `LAZY_STORES`). The first
  synchronous read of an un-hydrated lazy store returns `undefined` and only kicks off an async
  hydrate (`src/preload/tauriTransport.ts` `snapshotGet` -> `reportLazyMiss` -> `hydrateStore`,
  L294, not exported; `hydrated` Set at L157). Nothing notifies the renderer when it completes.
  A naive read inside the memo would therefore show every non-Steam game as "never played" on
  the first pass. Task 2 adds an awaitable `ensureStoreHydrated` to fix this.
- `window.api` is typed as `typeof import('../../preload/api').default`
  (`src/common/types/proxy-types.ts:1`), which spreads `src/preload/api/misc.ts`; a new export there
  is typed on `window.api` automatically. misc.ts L120 imports from `'../tauriTransport'`; its
  `storeGet` (L189) wraps `snapshotGet`.
- `InstalledInfo.install_size: string` (`common/types.ts:411`). Every producer formats with the
  backend's `getFileSize = fileSize.partial({ base: 2 })` (`backend/utils.ts:158`), measured
  output: `0 B`, `1.5 KiB`, `4.66 GiB`, `2.73 TiB`. Steam `games.ts:1977` writes `''`; legendary
  writes `'0'` when it has no size (`legendary/library.ts:594`). No reverse (string -> bytes)
  parser exists anywhere in the repo (searched for parseSize/toBytes/GiB parsers): write one.
- `RunnerToStore` (`src/frontend/screens/Library/facetLabels.ts:26`) maps runner -> store display
  name (legendary 'Epic Games', gog 'GOG', nile 'Amazon Games', zoom 'ZOOM Platform', steam
  'Steam', humble); `sideload` has no entry.
- Persistence precedent to mirror: `src/frontend/screens/Library/libraryTileSize.ts`
  (`read...(storage: Pick<Storage,'getItem'>)` total on throw; `write...(storage: Pick<Storage,'setItem'>, v)`
  swallowing a throwing write).
- i18n: fork strings live in the `gamelib` namespace, called as
  `tGamelib('gamelib:<key>', 'English default')`. `pnpm lint-translations:gamelib` fails if any
  key present in `en/gamelib.json` is missing from any of the other 48 locales'
  `gamelib.json`; `meta/__tests__/gamelibCatalogParity.test.ts` enforces parity;
  `pnpm i18n-churn-guard` fails if anything under `public/locales/` other than
  `gamelib.json`/`gamelib.mt.json` changes. Precedent for the full 49-catalog flow:
  `.planning/quick/261027-ch9-gamelib-compat-row-with-a-tick-in-instal/261027-ch9-PLAN.md`
  Task 3 (commit `b78a7ee37`) and `261027-c4g` Task 2 (commit `2141cdf84`).

<interfaces>
Contract for the new module `src/frontend/screens/Library/librarySort.ts` (Task 1 creates it;
Tasks 2-3 consume it). Names are binding:

- `export type LibrarySortField = 'name' | 'lastPlayed' | 'installSize'`
- `export type LibrarySortDirection = 'asc' | 'desc'`
- `export type LibraryGroupBy = 'none' | 'installStatus' | 'store'`
- `export const LIBRARY_SORT_FIELDS: readonly LibrarySortField[]` (in that order),
  `LIBRARY_GROUP_BYS: readonly LibraryGroupBy[]` (in that order)
- `export const LIBRARY_SORT_FIELD_KEY = 'librarySortField'`,
  `LIBRARY_SORT_DIRECTION_KEY = 'librarySortDirection'`, `LIBRARY_GROUP_BY_KEY = 'libraryGroupBy'`,
  `LEGACY_SORT_DESCENDING_KEY = 'sortDescending'`, `LEGACY_SORT_INSTALLED_KEY = 'sortInstalled'`
- `export interface LibrarySortPrefs { field: LibrarySortField; direction: LibrarySortDirection; groupBy: LibraryGroupBy }`
- `export const DEFAULT_LIBRARY_SORT_PREFS: LibrarySortPrefs = { field: 'name', direction: 'asc', groupBy: 'installStatus' }`
- `export function readLibrarySortPrefs(storage: Pick<Storage, 'getItem'>): LibrarySortPrefs`
- `export function writeLibrarySortField(storage: Pick<Storage, 'setItem'>, v: LibrarySortField): void`
  (and `writeLibrarySortDirection`, `writeLibraryGroupBy` likewise)
- `export function parseInstallSize(raw: unknown): number | undefined` (bytes)
- `export function librarySortTitle(game: GameInfo): string`
- `export function lastPlayedMs(game: GameInfo, nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>>): number | undefined`
- `export function sortAndGroupLibrary(games: readonly GameInfo[], opts: { field: LibrarySortField; direction: LibrarySortDirection; groupBy: LibraryGroupBy; installing: readonly string[]; nonSteamLastPlayedIso: Readonly<Record<string, string | undefined>> }): GameInfo[]`

New `LibraryContextType` fields (replace the four old ones):
`sortField: LibrarySortField; setSortField: (v: LibrarySortField) => void;`
`sortDirection: LibrarySortDirection; setSortDirection: (v: LibrarySortDirection) => void;`
`groupBy: LibraryGroupBy; setGroupBy: (v: LibraryGroupBy) => void`

New preload surface: `ensureStoreHydrated(storeName: string): Promise<void>` in tauriTransport.ts;
`storeEnsureHydrated(storeName: string): Promise<void>` in misc.ts (=> `window.api.storeEnsureHydrated`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure sort/group/persistence module with jest tests (librarySort.ts)</name>
  <files>src/frontend/screens/Library/librarySort.ts, src/frontend/screens/Library/__tests__/librarySort.test.ts</files>
  <behavior>
    Build GameInfo fixtures with a small factory (title, app_name, runner, is_installed,
    install.install_size, extra.steamLastPlayed); cast via `as unknown as GameInfo` like sibling tests.
    - parseInstallSize: '4.66 GiB' -> 4.66*1024^3; '1.5 KiB' -> 1536; '512 MiB'; '2.73 TiB'; '10 B'; case/whitespace tolerant ('  3 gib ');
      'Bytes'/'KB'/'MB'/'GB'/'TB' treated as 1024-based (backend bytesToSize uses 1024); a bare numeric string '1048576' -> bytes;
      '' / '0' / '0 B' / 'abc' / '12 parsecs' / '-1 GiB' / 'NaN GiB' / undefined / 42 (non-string) -> undefined.
      (Zero is unknown on purpose: a 0-byte install is a missing measurement, and must not sort as the smallest real size.)
    - lastPlayedMs: steam game with steamLastPlayed 1700000000 -> 1700000000000 (seconds -> ms); steam with 0 / undefined -> undefined;
      steam game whose app_name ALSO has an ISO entry in the map -> still uses steamLastPlayed (map ignored for Steam);
      non-steam with ISO '2026-10-01T10:00:00.000Z' -> Date.parse value; non-steam missing / unparseable ISO -> undefined.
    - Steam-vs-ISO normalisation: a steam game played at seconds S and a gog game with ISO for (S+60)*1000 ms: lastPlayed desc puts gog first, asc puts steam first.
    - Unknowns last in BOTH directions for lastPlayed and installSize (never-played / not-installed / unparseable size games
      end up after every known value whether direction is asc or desc); an installed game with unparseable size is unknown;
      a NOT installed game with a stale install_size string is unknown.
    - Tie-break: two games with equal lastPlayed (or equal size) order by librarySortTitle ascending in BOTH directions;
      two unknowns also order by title ascending.
    - name field: asc / desc match today's expression exactly (`title.toUpperCase().replace('THE ', '')`, localeCompare, negated for desc);
      'The Witcher' sorts under W.
    - groupBy 'none': pure sort, no partition. groupBy 'installStatus': installed -> installing (app_name in `installing` and not installed)
      -> notInstalled, with the chosen sort applied inside each group (assert with desc as well). groupBy 'store': groups ordered by
      RunnerToStore display name localeCompare (Amazon Games, Epic Games, GOG, Steam, ZOOM Platform), runners without a display name
      (sideload, anything unknown) after them ordered by runner id; sort applied inside each group; direction never reorders groups.
    - Input array is not mutated.
    - readLibrarySortPrefs (use a Map-backed fake storage): empty storage -> DEFAULT_LIBRARY_SORT_PREFS;
      migration: only legacy sortDescending 'true' -> direction 'desc'; 'false' -> 'asc'; legacy sortInstalled 'false' -> groupBy 'none',
      'true' -> 'installStatus'; field always 'name' when absent;
      new keys win over legacy when present and valid; an invalid new value ('popularity', '') -> that axis's DEFAULT (not legacy);
      garbage legacy ('yes', '{') -> default, never throws; a getItem that throws -> defaults.
    - write* functions call setItem with the plain string under the new key and swallow a throwing setItem; they never touch legacy keys.
  </behavior>
  <action>
Write the test file first (RED), run it, confirm it fails because the module does not exist, commit
the test alone (`test(quick-261027-jjz): ...`). Then implement `librarySort.ts` to the exact
contract in `<interfaces>` (GREEN) and commit both paths.

Implementation directives:
- Pure TypeScript, no React, no `window`, no store imports. Import `GameInfo` type from
  `common/types` and `RunnerToStore` from `./facetLabels` (verify facetLabels has no React/window
  side-effects at import; if it does, copy the five runner display names into a local const with a
  comment pointing at facetLabels instead).
- `librarySortTitle` = exactly today's `game.title.toUpperCase().replace('THE ', '')` (unanchored,
  first occurrence) so the grid order for the default sort is byte-for-byte unchanged and stays in
  parity with `focusRowTitleComparator`. Note this in a short comment (the todo describes it as a
  "leading THE"; the code has always been unanchored; behaviour-preservation wins).
- `sortAndGroupLibrary` computes each game's sort value ONCE into a Map before sorting (no
  per-comparison parsing, Date.parse or map lookups beyond the precomputed one), copies the input,
  sorts with a comparator that: for `name` returns the (optionally negated) title localeCompare;
  for numeric fields returns unknown-vs-known ordering first (unknown always after known,
  regardless of direction), then `(a - b)` negated for desc, then title ascending (never negated).
  Then partitions per `groupBy` as stable filters over the sorted array.
- `parseInstallSize`: one anchored case-insensitive regex for `number [unit]`; units B, BYTES,
  KIB/KB, MIB/MB, GIB/GB, TIB/TB, PIB/PB, all powers of 1024; unit optional (bytes); return
  undefined unless the result is finite and > 0.
- `readLibrarySortPrefs`: wrap all reads in try/catch -> defaults. Per axis: new key present
  (non-null) -> validated against LIBRARY_SORT_FIELDS / ['asc','desc'] / LIBRARY_GROUP_BYS, invalid
  -> DEFAULT for that axis; new key absent -> derive from legacy (`sortDescending` raw `'true'` ->
  'desc', raw `'false'` -> 'asc', else default; `sortInstalled` raw `'false'` -> 'none', `'true'`
  -> 'installStatus', else default) per the spec's migration rule; field has no legacy source ->
  'name'. Do not write or delete anything during read (migration is derive-on-read; legacy keys are
  left in place, harmless and reversible).
- Header comment on the module: cite the todo path and that its Decisions are operator-locked
  (2026-10-27), plus the Steam-vs-GameLib meaning difference of Last played (accepted by operator).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/screens/Library/__tests__/librarySort.test.ts && pnpm codecheck && npx prettier --check src/frontend/screens/Library/librarySort.ts src/frontend/screens/Library/__tests__/librarySort.test.ts && git show --stat HEAD</automated>
  </verify>
  <done>All behaviours above are green; RED commit precedes GREEN commit; both commits contain only the two paths; codecheck exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: Wire state, data and the Games-panel controls to the new model</name>
  <files>src/preload/tauriTransport.ts, src/preload/api/misc.ts, src/frontend/types.ts, src/frontend/screens/Library/LibraryContext.tsx, src/frontend/screens/Library/index.tsx, src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/Header/index.css, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx, src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx, src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts</files>
  <action>
Before editing, run `git status --short` over every path in `<files>`; all must be clean.

A. Preload (awaitable lazy hydration; needed because `timestampStore` is lazy, see context).
In `tauriTransport.ts` add `export function ensureStoreHydrated(storeName: string): Promise<void>`
that resolves immediately when `hydrated.has(storeName)`, otherwise returns `hydrateStore(storeName)`
(which de-dupes in-flight fetches and never rejects). Doc comment: why it exists (lazy-store first
read returns the default; callers that must not act on that miss await this first). In
`misc.ts` add `export const storeEnsureHydrated = (storeName: string) => ensureStoreHydrated(storeName)`
next to `storeGet`, importing from `'../tauriTransport'`. No allow-list bypass: it only fetches the
store's already-filtered snapshot via the existing path.

B. Context types. In `frontend/types.ts` replace the four `sortDescending`/`sortInstalled` members
with the six from `<interfaces>` (import the three types from
`frontend/screens/Library/librarySort` with `import type`). In `LibraryContext.tsx` set initial
values from `DEFAULT_LIBRARY_SORT_PREFS` and no-op setters.

C. Library/index.tsx.
- Replace L489-503 with one `useState(() => readLibrarySortPrefs(storage))` (or three states
  seeded from one read) and three handlers `handleSortField` / `handleSortDirection` /
  `handleGroupBy` that call the matching `write*` then set state.
- Add `const [nonSteamLastPlayedIso, setNonSteamLastPlayedIso] = useState<Record<string, string | undefined>>({})`
  and a `useEffect` with deps `[sortField, gamesForAlphabetFilter, recentAppNames]`: when
  `sortField !== 'lastPlayed'` return; otherwise `let cancelled = false`, then
  `window.api.storeEnsureHydrated('timestampStore').then(() => { if (cancelled) return; build a
  Record by iterating gamesForAlphabetFilter, skipping runner === 'steam', reading
  timestampStore.get_nodefault(game.app_name)?.lastPlayed once per game; setNonSteamLastPlayedIso(map) })`,
  cleanup sets `cancelled = true`. This is the "read once per pass into a map" rule; never read the
  store inside the comparator or for Steam. `recentAppNames` is in the deps so a launch refreshes it.
  Import `timestampStore` into the existing `frontend/helpers/electronStores` import.
- In `libraryToShow`, keep the alphabet-letter filter exactly; replace the sort + installed/
  installing/notInstalled block with
  `sortAndGroupLibrary(library, { field: sortField, direction: sortDirection, groupBy, installing, nonSteamLastPlayedIso })`.
  Deps: `[gamesForAlphabetFilter, alphabetFilterLetter, sortField, sortDirection, groupBy, installing, nonSteamLastPlayedIso]`.
- Provider value: replace the four old entries with `sortField, setSortField: handleSortField,
  sortDirection, setSortDirection: handleSortDirection, groupBy, setGroupBy: handleGroupBy`.

D. Header/index.tsx (UI per sketch 004's `<select class="sortsel">` direction, adapted to the
tier-2 panel). Remove the A-Z button and the sort-by-status button from `Header__utilities`
(utilities becomes: Console Mode Link, layout toggle, alphabet-filter toggle, TourButton). Remove
now-unused icon imports. Insert a NEW top-level child directly after `Header__utilities`:
a `div.Header__sortGroup` containing two rows:
  1. `div.Header__sortRow` with `data-tour="library-sort"`: a `<label htmlFor="library-sort-field">`
     "Sort by", a `<select id="library-sort-field" className="Header__sortSelect">` with options
     name / lastPlayed / installSize (labels "Name", "Last played", "Install size"), controlled by
     `sortField`, onChange validating `event.currentTarget.value` against `LIBRARY_SORT_FIELDS`
     before `setSortField`; and a `<button type="button" className="Header__utilityButton Header__sortDirection">`
     toggling asc/desc, icon `faArrowDownShortWide` for asc and `faArrowDownWideShort` for desc,
     `aria-label` and `title` = the current direction's label ("Ascending" / "Descending").
  2. `div.Header__sortRow` with `data-tour="library-group-by"`: `<label htmlFor="library-group-by">`
     "Group by" and `<select id="library-group-by" className="Header__sortSelect">` with options none /
     installStatus / store ("None", "Install status", "Store"), validated against `LIBRARY_GROUP_BYS`.
All strings via `tGamelib('gamelib:library.sort.<...>', 'English')` (the hook already exists in
Header) with these exact keys: `library.sort.label`, `library.sort.field.name`,
`library.sort.field.lastPlayed`, `library.sort.field.installSize`,
`library.sort.direction.ascending`, `library.sort.direction.descending`, `library.groupBy.label`,
`library.groupBy.none`, `library.groupBy.installStatus`, `library.groupBy.store`. Direction is
independent of field (switching field never changes direction).

E. Header/index.css. Delete the `.Header__statusGlyph` / `.Header__statusGlyphBadge` rules and their
comment block (only consumer removed). Add `.Header__sortGroup` (grid, restate the `.Header` gap
the same way the other wrapper blocks do), `.Header__sortRow` (grid `auto 1fr auto`, align center,
gap from existing `--space-*` tokens; the group-by select spans to the end), `.Header__sortLabel`
(`--text-secondary`, `--text-xs`/`--text-sm` as the panel uses), `.Header__sortSelect`
(sketch .sortsel shape: small padding, `--radius`-style rounding if a token exists, `font: inherit`
via longhands, `inline-size: 100%`, `min-inline-size: 0`; colours ONLY from tokens already used in
this file or the panel: `--input-background`, `--text-default`/`--text-secondary`,
`--navbar-background`; `:focus-visible` reusing the file's focus-ring tokens). Every `var(--x)` must
name a token declared somewhere (cssTokenSweep gate). Check `src/frontend/screens/Accessibility/index.css`
for global `select` rules you must out-specify. Logical properties only (RTL ships).

F. Tour. `LibraryTour.tsx`: replace the two steps with `[data-tour="library-sort"]`
(`tGamelib('gamelib:tour.library.sort', 'Sort your games by name, last played or install size, and flip the direction.')`)
and `[data-tour="library-group-by"]`
(`tGamelib('gamelib:tour.library.groupBy', 'Group your games by install status or by store, or turn grouping off.')`),
same positions in the step list, same `position: 'left'`. Update `libraryTourAnchors.test.tsx`
`EXPECTED_ELEMENTS` to the two new selectors at the same indices.

G. Tests and comments.
- `headerTourAnchors.test.tsx`: stub type/defaults use the six new context fields
  (`sortField: 'name'`, `sortDirection: 'asc'`, `groupBy: 'installStatus'`, jest.fn setters);
  `.Header` now has SEVEN direct children with `Header__sortGroup` at index 1; utilities holds
  exactly FOUR controls (Link, button, button, TourButton) — update the order comment to say the
  two sort buttons moved to `Header__sortGroup` (quick 261027-jjz). Add tests: exactly one element
  carries `data-tour="library-sort"` and one `data-tour="library-group-by"`, both inside
  `Header__sortGroup`; the sort row contains a `select` whose options' `value`s are exactly
  `LIBRARY_SORT_FIELDS` and the group row's exactly `LIBRARY_GROUP_BYS`; calling the sort select's
  `onChange` with `{ currentTarget: { value: 'lastPlayed' } }` calls `setSortField('lastPlayed')`,
  and with `'bogus'` calls nothing; clicking the direction button with `sortDirection: 'asc'` calls
  `setSortDirection('desc')`; group-by onChange `'store'` calls `setGroupBy('store')`. Include a
  non-vacuity assertion where the file's idiom does.
- FilterChipRow test L786-787 regex: extend to
  `/sortDescending|sortInstalled|sortField|sortDirection|groupBy|alphabetFilterLetter|showAlphabetFilter/`
  (confirm FilterChipRow/index.tsx contains none first: `grep -nE 'sortField|sortDirection|groupBy' src/frontend/screens/Library/components/FilterChipRow/index.tsx` must be empty).
- `focusRowSelectors.ts`: comment-only — point at `librarySortTitle` in `Library/librarySort.ts`
  instead of `Library/index.tsx:916-922`, and say the focus row has no sort field/direction of its
  own. Do not change code.
- ConsoleMode: no change (own local state).

Run the frontend + preload suites; any OTHER suite that asserted the removed buttons/strings must be
updated to the new model in this task, not skipped. Commit all twelve paths explicitly.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test -z "$(grep -rnE 'sortDescending|sortInstalled|setSortDescending|setSortInstalled|library-sort-az|library-sort-installed' src --include='*.ts' --include='*.tsx' | grep -v 'ConsoleMode/index.tsx' | grep -v 'FilterChipRow/__tests__' | grep -v 'Library/librarySort.ts' | grep -v '__tests__/librarySort.test.ts')" && pnpm jest src/frontend/screens/Library src/frontend/components/UI/Header src/frontend/components/UI/NavShell src/preload && pnpm codecheck && pnpm lint && npx prettier --check src/preload/tauriTransport.ts src/preload/api/misc.ts src/frontend/types.ts src/frontend/screens/Library/LibraryContext.tsx src/frontend/screens/Library/index.tsx src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/Header/index.css src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx src/frontend/screens/Library/components/FilterChipRow/__tests__/index.test.tsx src/frontend/screens/Library/components/FocusRowStrip/focusRowSelectors.ts && git show --stat HEAD</automated>
  </verify>
  <done>No src reference to the old state names or anchors survives outside ConsoleMode's own strings, the FilterChipRow negative gate and librarySort's legacy-key constants; all listed suites, codecheck, lint and scoped prettier pass; the commit lists exactly the twelve paths.</done>
</task>

<task type="auto">
  <name>Task 3: Twelve gamelib strings in all 49 catalogs; translation gates; graph refresh</name>
  <files>public/locales/*/gamelib.json, public/locales/*/gamelib.mt.json</files>
  <action>
Follow the `261027-ch9` Task 3 / `261027-c4g` Task 2 precedent exactly (read
`.planning/quick/261027-ch9-gamelib-compat-row-with-a-tick-in-instal/261027-ch9-PLAN.md` L200-215).

Keys (English values = the defaults passed in Task 2's `tGamelib` calls):
`library.groupBy.installStatus` "Install status", `library.groupBy.label` "Group by",
`library.groupBy.none` "None", `library.groupBy.store` "Store",
`library.sort.direction.ascending` "Ascending", `library.sort.direction.descending` "Descending",
`library.sort.field.installSize` "Install size", `library.sort.field.lastPlayed` "Last played",
`library.sort.field.name` "Name", `library.sort.label` "Sort by",
`tour.library.groupBy` "Group your games by install status or by store, or turn grouping off.",
`tour.library.sort` "Sort your games by name, last played or install size, and flip the direction."

1. First `git status --short public/locales` — record anything dirty. If `en/gamelib.json` already
   carries a foreign hunk, use the precedent's index-blob method (`git show HEAD:...` -> scratchpad
   copy -> same insertion -> `git update-index --cacheinfo`) so only your hunk is staged; otherwise
   a plain explicit-path add is fine. Any other already-dirty locale file: stop and report.
2. en: insert the keys as nested objects (`library.groupBy`, `library.sort.{direction,field}` under
   the existing `library` object; `tour.library.groupBy`/`sort` under the existing
   `tour.library`), keys sorted, indent 4, matching the file. Then run `pnpm i18n` and confirm
   `git diff public/locales/en/gamelib.json` shows only your keys with non-empty values, and run
   `pnpm i18n-churn-guard` (no upstream catalog may change; if `pnpm i18n` touched an upstream file
   that was clean before, `git checkout -- <that exact path>` and find the un-namespaced t() call).
3. Other 48 locales: try `pnpm machine-fill-gamelib` first; if it fails (no ANTHROPIC_API_KEY /
   gateway 401) hand-author natural translations. Validate every (locale, key) pair with the real
   `validateTranslation()` exported from `meta/machineFillGamelib.ts` via a scratchpad script
   (import under `JEST_WORKER_ID` as the precedents did), plus one sabotage control that must
   report a problem. Append the 12 flat key paths to each of the 48 `gamelib.mt.json` `keys`
   arrays at sorted position, indent 2, same shape as existing entries. Touch no other key.
4. Run the gates, then `graphify update .` (CLAUDE.md: keep the graph current after code changes;
   do not stage `graphify-out`).
5. Commit by explicit paths only: the 49 `gamelib.json` and 48 `gamelib.mt.json` files (list them,
   or pass the shell-expanded `public/locales/*/gamelib.json public/locales/*/gamelib.mt.json` only
   after step 1 confirmed no foreign dirt in those files). Message:
   `feat(quick-261027-jjz): library sort/group strings in all 49 gamelib catalogs`.
Prettier: every path in this task is under `public/locales/`, which is prettier-ignored
(`--file-info` reports `"ignored": true`), so a `--check` would be vacuous and is deliberately
omitted; formatting is held by hand-matching indent 4 / indent 2 and sorted keys.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/machineFillGamelib.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts && pnpm lint-translations:gamelib && pnpm i18n-churn-guard && test "$(grep -l '"installStatus"' public/locales/*/gamelib.json | wc -l | tr -d ' ')" = 49 && test "$(grep -l 'tour.library.groupBy' public/locales/*/gamelib.mt.json | wc -l | tr -d ' ')" = 48 && npx prettier --file-info public/locales/en/gamelib.json | grep -Eq '"ignored":[[:space:]]*true' && git show --stat HEAD</automated>
  </verify>
  <done>All 49 catalogs carry the 12 keys (48 validated, with mt.json stamps); parity, lint-translations:gamelib and i18n-churn-guard pass; the commit lists only gamelib.json / gamelib.mt.json files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage -> renderer state | persisted sort/group strings are user-editable |
| sidecar store snapshot -> renderer | timestampStore values arrive via the existing allow-listed snapshot path |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-jjz-01 | Tampering | readLibrarySortPrefs | mitigate | every stored value validated against the closed lists; unknown -> default; reads wrapped in try/catch (tested) |
| T-jjz-02 | Tampering | Header select onChange | mitigate | value re-validated against LIBRARY_SORT_FIELDS / LIBRARY_GROUP_BYS before setState (tested) |
| T-jjz-03 | Information disclosure | storeEnsureHydrated | mitigate | reuses hydrateStore's filtered STORE_FETCH snapshot; snapshotGet's isAllowedStoreField gate still governs every read; no new channel |
| T-jjz-04 | Denial of service | sortAndGroupLibrary | accept | O(n log n) with precomputed keys; library sizes are thousands at most |
</threat_model>

<verification>
- `pnpm jest src/frontend/screens/Library src/frontend/components/UI/Header src/frontend/components/UI/NavShell src/preload meta/__tests__/gamelibCatalogParity.test.ts`
- `pnpm codecheck`, `pnpm lint`, `pnpm lint-translations:gamelib`, `pnpm i18n-churn-guard`
- Scoped `npx prettier --check` over the src paths of Tasks 1-2
- `git log --stat -4` shows only this plan's files in its commits
</verification>

<success_criteria>
- Sort field (Name / Last played / Install size) + direction and group-by (None / Install status / Store) replace the two booleans end to end
- Unknowns last both directions; tie-break by Name asc; Steam seconds vs ISO normalised; tsStore never read for Steam
- Old-key users migrated on read; tampered values default
- Default experience identical to today (Name asc, grouped by install status)
- ConsoleMode unchanged; todo left in pending/
</success_criteria>

<output>
Create `.planning/quick/261027-jjz-implement-library-sort-slice-1-sort-fiel/261027-jjz-SUMMARY.md` when done
</output>
