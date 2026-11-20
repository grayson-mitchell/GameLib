---
phase: quick-261029-uas
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/__tests__/librarySort.test.ts
  - src/frontend/types.ts
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
autonomous: true
requirements: [QUICK-261029-uas]

must_haves:
  truths:
    - "The Games filter panel shows a Group by control directly under the Sort by row, inside Header__sortGroup, above the Filters heading"
    - "The Group by control is the same themed Dropdown + NavItem picker as Sort by (label span, value span, chevron caret), spans the full row width, and there is no native <select> anywhere in the Header"
    - "Choosing None / Install status / Store regroups the grid (installed, installing, not installed; or by store display name) on top of the current sort"
    - "The choice persists in localStorage under libraryGroupBy (default installStatus; legacy sortInstalled migrates) and survives a remount"
    - "The Library tour has a Group by step anchored on data-tour=library-group-by"
  artifacts:
    - path: "src/frontend/screens/Library/librarySort.ts"
      provides: "LibraryGroupBy type, LIBRARY_GROUP_BYS, LIBRARY_GROUP_BY_KEY, LEGACY_SORT_INSTALLED_KEY, writeLibraryGroupBy, sortAndGroupLibrary"
      exports: ["LIBRARY_GROUP_BYS", "LIBRARY_GROUP_BY_KEY", "writeLibraryGroupBy", "sortAndGroupLibrary", "sortLibrary"]
    - path: "src/frontend/components/UI/Header/index.tsx"
      provides: "Group by Dropdown row with data-tour=library-group-by"
      contains: "Header__groupByRow"
  key_links:
    - from: "src/frontend/components/UI/Header/index.tsx"
      to: "LibraryContext.setGroupBy"
      via: "NavItem onClick"
      pattern: "setGroupBy\\("
    - from: "src/frontend/screens/Library/index.tsx"
      to: "sortAndGroupLibrary"
      via: "sorted-library useMemo"
      pattern: "sortAndGroupLibrary\\("
---

<objective>
Restore Library "Group by" (None / Install status / Store), removed end to end in commit
19f50e378 (quick-261029-quw), and render it as a second row inside `Header__sortGroup` directly
under Sort by, so it sits above the Filters heading. The control must use the themed
`Dropdown`/`NavItem` picker that quick 261029-riq gave Sort by (commit 712c0a121), not the old
native `<select class="Header__sortSelect--wide">`.

Purpose: operator wants grouping back, and wants it to look identical to the Sort by field.
Output: group-by model + persistence + wiring + Header row + tour step + updated tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

Reference for what to restore: `git show 19f50e378` (diff of librarySort.ts, types.ts,
LibraryContext.tsx, Library/index.tsx, LibraryTour.tsx, Header/index.tsx, Header/index.css and
the three test files). Restore by hand INTO current code — do NOT `git revert` / `git checkout`
those files: later commits changed them (712c0a121 themed Sort Dropdown; b781b515a / 9457c9a59
Metacritic sort field + `wikiMetacriticByTitle`; 59ef82e05 quick-filter chips; 5b861e63d Zoom
store removal). Do not undo the 19f50e378 layout reorder (search, focus row, sort group, Filters
heading, Views/Collections, facets) or its `+2px` label sizes.

<interfaces>
Current librarySort.ts (post-Metacritic):
- `type LibrarySortField = 'name' | 'lastPlayed' | 'installSize' | 'metacritic'`
- `interface LibrarySortPrefs { field; direction }`, `DEFAULT_LIBRARY_SORT_PREFS = { field: 'name', direction: 'asc' }`
- `readLibrarySortPrefs(storage: Pick<Storage,'getItem'>)`, private `oneOf`, private `safeWrite`
- `interface SortOptions { field; direction; nonSteamLastPlayedIso; wikiMetacriticByTitle? }`
- `export function sortLibrary(games, opts: SortOptions): GameInfo[]` (only caller: Library/index.tsx ~line 933)
- `RunnerToStore: Record<string,string>` still exported from `./facetLabels` (Zoom entry gone — fine).

Current Header Sort row (Header/index.tsx ~lines 100-122 and 281-337): `sortRows` array of
`{ value, label }` built from literal `tGamelib(...)` calls; `currentSortRow`; JSX is
`<div className="Header__sortRow" data-tour="library-sort"><Dropdown closeOnSelect className="Header__sortDropdown" title={<><span className="Header__sortLabel">…</span><span className="Header__sortValue">…</span><FontAwesomeIcon icon={faChevronDown} className="Header__sortCaret"/></>}>{rows.map(→ <NavItem key elementType="button" className="Header__sortOption" label active onClick/>)}</Dropdown><button className="Header__utilityButton Header__sortDirection" …/></div>`.

Current CSS (Header/index.css ~68-172): `.Header__sortRow { display:grid; grid-template-columns: 1fr auto }`;
all trigger/menu styling is keyed on `.Header .Header__sortDropdown .dropdownButton`,
`.Header .Header__sortDropdown .dropdown`, `.Header .Header__sortDropdown .dropdown .Header__sortOption`,
and the caret rotate on `[aria-expanded='true'] .Header__sortCaret`.

i18n — ALREADY present in public/locales/*/gamelib.json, add NO keys:
`gamelib:library.groupBy.label` ("Group by"), `.none`, `.installStatus`, `.store`, and
`gamelib:tour.library.groupBy`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Restore the group-by model, persistence and Library wiring</name>
  <files>src/frontend/screens/Library/librarySort.ts, src/frontend/screens/Library/__tests__/librarySort.test.ts, src/frontend/types.ts, src/frontend/screens/Library/LibraryContext.tsx, src/frontend/screens/Library/index.tsx</files>
  <behavior>
    - readLibrarySortPrefs({}) returns { field: 'name', direction: 'asc', groupBy: 'installStatus' } (DEFAULT_LIBRARY_SORT_PREFS gains groupBy)
    - libraryGroupBy 'store' / 'none' read back; an invalid value falls back to 'installStatus'
    - with no libraryGroupBy: legacy sortInstalled 'false' → 'none', 'true' → 'installStatus'; libraryGroupBy wins over sortInstalled when both set
    - writeLibraryGroupBy writes key 'libraryGroupBy' and swallows a throwing setItem (same as the other write helpers)
    - sortAndGroupLibrary groupBy 'none' equals sortLibrary output exactly
    - groupBy 'installStatus' orders installed, then app_names in `installing`, then the rest, each bucket keeping sort order (including with field 'metacritic' + desc)
    - groupBy 'store' orders named stores by RunnerToStore display name, then unnamed runners by runner id, each bucket keeping sort order
  </behavior>
  <action>
In librarySort.ts restore from `git show 19f50e378` (pre-image): `LibraryGroupBy = 'none' | 'installStatus' | 'store'`, `LIBRARY_GROUP_BYS`, `LIBRARY_GROUP_BY_KEY = 'libraryGroupBy'`, `LEGACY_SORT_INSTALLED_KEY = 'sortInstalled'`, `groupBy` on `LibrarySortPrefs` with default `'installStatus'`, the groupBy branch of `readLibrarySortPrefs` (including the legacy migration), `writeLibraryGroupBy`, and the `import { RunnerToStore } from './facetLabels'`. KEEP `sortLibrary` exactly as it is now (Metacritic, wiki scores) and add `export function sortAndGroupLibrary(games, opts: SortOptions & { groupBy: LibraryGroupBy; installing: readonly string[] })` that calls `sortLibrary` then applies the restored grouping logic (installStatus buckets; store buckets via RunnerToStore). Update the module header comment: group-by restored by operator request in quick 261029-uas (do not leave the "has since been removed" text).

In librarySort.test.ts: delete the `describe('group-by removal (quick 261029-quw)')` block and add tests for the behaviors above (use the 19f50e378 pre-image tests as the starting point, adapted to the current field set). Fix any existing `readLibrarySortPrefs` expectations that now need `groupBy`.

In types.ts add `LibraryGroupBy` to the librarySort type import and `groupBy: LibraryGroupBy; setGroupBy: (value: LibraryGroupBy) => void` to `LibraryContextType` after `setSortDirection`. In LibraryContext.tsx restore `groupBy: DEFAULT_LIBRARY_SORT_PREFS.groupBy, setGroupBy: () => null`.

In Library/index.tsx: import `sortAndGroupLibrary`, `writeLibraryGroupBy`, type `LibraryGroupBy`; destructure `groupBy` from `sortPrefs`; restore `handleGroupBy` (write then setSortPrefs); add `setGroupBy: handleGroupBy` and `groupBy` to the context value; re-add `libraryStatus` to the `useContext(ContextProvider)` destructure. Derive `installing` WITHOUT reintroducing a per-progress-tick recompute (see the REJECTED-`libraryStatus` comment ~line 264): compute a string key `libraryStatus.filter(st => st.status === 'installing').map(st => st.appName).sort().join('\n')` in a useMemo on `[libraryStatus]`, then `installing = useMemo(() => key ? key.split('\n') : [], [installingKey])` so the array identity only changes when the installing set changes. Swap the sorted-library memo's `sortLibrary(...)` call to `sortAndGroupLibrary(...)` passing `groupBy` and `installing` (keep the pending-field fallback and wiki/lastPlayed args), and add `groupBy`, `installing` to its deps.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/Library/__tests__/librarySort.test.ts && npx tsc --noEmit -p . && npx prettier --check src/frontend/screens/Library/librarySort.ts src/frontend/screens/Library/__tests__/librarySort.test.ts src/frontend/types.ts src/frontend/screens/Library/LibraryContext.tsx src/frontend/screens/Library/index.tsx</automated>
  </verify>
  <done>All behaviors tested and green; tsc clean (Header will not yet consume groupBy — that is fine, it is optional context use); persisted libraryGroupBy drives grid grouping.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Group by row as a themed Dropdown under Sort by, plus tour step</name>
  <files>src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/Header/index.css, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx</files>
  <behavior>
    - Header__sortGroup contains exactly two rows in order: data-tour="library-sort" then data-tour="library-group-by"; both precede the Header__filtersHeading h2
    - the group-by row holds one closeOnSelect Dropdown whose className contains Header__sortDropdown, whose title has the Header__sortLabel ("Group by"), Header__sortValue (current group label) and Header__sortCaret
    - its children are three NavItem rows (None, Install status, Store) in LIBRARY_GROUP_BYS order with className Header__sortOption; exactly the current groupBy is active; clicking Store calls setGroupBy('store')
    - the group-by row has no direction button; no native select exists anywhere in the Header tree
    - the Library tour EXPECTED_ELEMENTS gains '[data-tour="library-group-by"]' immediately after '[data-tour="library-sort"]'
  </behavior>
  <action>
In Header/index.tsx pull `groupBy`, `setGroupBy` from LibraryContext; import `LibraryGroupBy` type (and `LIBRARY_GROUP_BYS` only if used). Build `groupByRows: Array<{ value: LibraryGroupBy; label: string }>` with literal `tGamelib('gamelib:library.groupBy.none','None')`, `.installStatus` ('Install status'), `.store` ('Store') — literal call sites so i18next-parser keeps the keys; no new keys. Add `currentGroupByRow` mirroring `currentSortRow`. Directly after the Sort row inside `Header__sortGroup`, add `<div className="Header__sortRow Header__groupByRow" data-tour="library-group-by">` containing a `Dropdown closeOnSelect className="Header__sortDropdown"` with the same title structure as Sort (label `gamelib:library.groupBy.label` 'Group by', value span, faChevronDown caret) and `NavItem elementType="button" className="Header__sortOption"` children with `active={groupBy === row.value}` and `onClick={() => setGroupBy(row.value)}`. Reusing `Header__sortDropdown`/`Header__sortOption`/`Header__sortLabel`/`Header__sortValue`/`Header__sortCaret` is what makes it render identically to Sort by (the "look native like the sort field" request) — do NOT reintroduce `Header__sortSelect--wide` or any `<select>`.

In index.css add one rule: `.Header__groupByRow { grid-template-columns: 1fr; }` (no direction button, so the trigger spans the full row width; trigger already has `inline-size: 100%`), with a short comment citing quick 261029-uas. Also correct the `.Header__filtersHeading` comment if it implies a single sort row.

In LibraryTour.tsx restore the step from the 19f50e378 pre-image right after the `library-sort` step: element `[data-tour="library-group-by"]`, intro `tGamelib('gamelib:tour.library.groupBy', 'Group your games by install status or by store, or turn grouping off.')`, position 'left' (confirm `tGamelib` is already in scope there; it is used by the sort step).

Tests: in headerTourAnchors.test.tsx add `groupBy: 'installStatus'` and `setGroupBy: jest.fn()` to the mock context type and value; replace the "no group-by row" test with tests for the behaviors above (keep the no-native-select assertion); update the file-header comment that says Group by was removed. In libraryTourAnchors.test.tsx insert the group-by anchor into EXPECTED_ELEMENTS after library-sort, and add `groupBy`/`setGroupBy` to its context fixture if it builds a LibraryContextType.
  </action>
  <verify>
    <automated>pnpm jest src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx src/frontend/screens/Library/__tests__/librarySort.test.ts && npx tsc --noEmit -p . && npx prettier --check src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/Header/index.css src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx</automated>
  </verify>
  <done>Group by renders under Sort by as an identical themed picker spanning the row, above Filters; selecting a value regroups the grid and persists; tour step present; all listed tests, tsc and prettier green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage → renderer | persisted `libraryGroupBy` / `sortInstalled` strings are read back as untyped input |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uas-01 | Tampering | readLibrarySortPrefs | mitigate | `oneOf(LIBRARY_GROUP_BYS, raw)` whitelist with default fallback; whole read in try/catch returning defaults (tested) |
| T-uas-02 | Denial of Service | Library sorted-library memo | mitigate | `installing` memo keyed on a joined appName string so download progress ticks do not recompute the sort |
</threat_model>

<verification>
- `pnpm jest` on the three test files above passes; `npx tsc --noEmit -p .` clean.
- `grep -n "Header__sortSelect--wide\|<select" src/frontend/components/UI/Header/index.tsx` returns nothing.
- Commit ONLY the files in `files_modified` with `git commit -- <paths>` (working tree has unrelated changes, e.g. ROADMAP.md, gamepage.json, src-tauri/*). Never `git add -A` / `git add .`.
- Run `graphify update .` after code changes.
</verification>

<success_criteria>
Group by (None / Install status / Store) is back in the Games filter panel directly under Sort by
and above Filters, rendered with the same themed Dropdown as Sort by at full row width, persisted
under `libraryGroupBy` (default Install status), regrouping the grid, with a tour step.
</success_criteria>

<output>
Create `.planning/quick/261029-uas-add-group-by-back-to-library-above-filte/261029-uas-SUMMARY.md` when done
</output>
