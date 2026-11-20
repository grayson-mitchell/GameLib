---
phase: quick-261029-quw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/screens/Library/librarySort.ts
  - src/frontend/screens/Library/__tests__/librarySort.test.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/types.ts
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
  - src/frontend/helpers/signInIdentityResync.ts
  - src/frontend/helpers/__tests__/signInIdentityResync.test.ts
  - src/frontend/state/GlobalState.tsx
autonomous: true
requirements: [QUICK-261029-QUW]

must_haves:
  truths:
    - "The Library filter panel reads top to bottom: icon row, search bar, Focus row, Sort by, a 'Filters' heading, Views/Collections, the store/runnability/more facets, footer"
    - "There is no Group by control anywhere, and a user whose storage still holds libraryGroupBy=installStatus/store (or the legacy sortInstalled key) sees the plain sort order, not a grouping they can no longer turn off"
    - "The Sort by row's label and select text are 2px larger than before; the focus-row strip heading is 4px smaller than before"
    - "At scroll position 0 the focus-row strip shows exactly as many whole tiles as the grid has columns, and no sliver of a further tile"
    - "The first (hero) tile of Recently played and Favourites draws its art flush with the top of its art box, so its art top lines up with its neighbours' art tops"
    - "A Library sign-in notice row disappears without a restart once its store is signed in, whichever login path was used"
  artifacts:
    - path: "src/frontend/components/UI/Header/index.tsx"
      provides: "Reordered panel, Filters heading, no group-by row"
      contains: "Header__filtersHeading"
    - path: "src/frontend/screens/Library/librarySort.ts"
      provides: "Sort-only model (no group-by type, key, writer or option)"
      exports: ["sortLibrary", "readLibrarySortPrefs", "DEFAULT_LIBRARY_SORT_PREFS"]
    - path: "src/frontend/screens/Library/components/FocusRowStrip/index.css"
      provides: "Track inline-size clipped to the grid's whole-column extent"
      contains: "round(down"
    - path: "src/frontend/helpers/signInIdentityResync.ts"
      provides: "Pure re-read of the five stores' sign-in identity fields from their config stores"
  key_links:
    - from: "src/frontend/state/GlobalState.tsx"
      to: "src/frontend/helpers/signInIdentityResync.ts"
      via: "called after every successful login and at the end of refreshLibrary, then rearmFromCurrentState"
      pattern: "resyncSignInIdentity"
    - from: "src/frontend/screens/Library/index.tsx"
      to: "sortLibrary"
      via: "useMemo pipeline, no groupBy argument"
      pattern: "sortLibrary\\("
---

<objective>
Nine Library-screen tidy-ups the operator listed. Group them by surface: the filter panel (items 5-9: reorder, Filters heading, larger Sort font, drop Group by), the grid (items 1, 3, 4: focus-row tile count, focus heading font, hero art alignment), and the sign-in notice (item 2: self-heal).

Interpretations (decided here, state them in the SUMMARY):
- Item 1, "the focus row can be one longer than the rest of the rows": the strip track's end clip is the grid's content edge C. The grid only places whole columns, so it leaves a band of up to one pitch empty at the end. The strip paints that same band with the left part of tile n+1. Fix: clip the track to the grid's whole-column extent, so the strip shows exactly n tiles plus ring room, the way a grid row does.
- Item 3, "reduce focus font by 4": the focus-row strip's heading (the `h3.libraryHeader` inside `.focusRowStrip`, currently `--text-2xl`, about 27.6px), reduced by 4px. The other candidate, the panel's "Focus row" group title, is `--text-xs` (about 11px), and 4px less than that would be 7px, which nobody would ask for.
- Item 4, "first tile in recently played, align tile graphics with top of grid": the just-played hero (first tile of Recently played and Favourites, in the strip and in the grid) letterboxes its wide art with `object-fit: contain`. At the default centre position the bands split above and below the art, so its art top sits about 25px below its neighbours' art tops at a 156px tile. Fix: `object-position: center top`, so the bands collect at the bottom.
- Item 5, "search bar directly under the icons": the icons are `Header__utilities` (console, layout toggle, alphabet filter, tour). Today the order is utilities, sortGroup, search, categories, focusRow, facets, footer. The target order is utilities, search, focusRowGroup, sortGroup, a new "Filters" heading, categoriesGroup, filtersGroup, footer. "Rest as is" means Views/Collections and the facets keep their current relative order under the heading. The footer stays pinned at the bottom.
- Item 9: remove the Group by control and the whole group-by model. The persisted default was `installStatus`, so keeping the state while hiding the UI would strand every user in a grouping they cannot turn off. The pipeline therefore becomes sort-only and ignores the persisted keys.

Output: the panel, grid and sign-in changes above, plus updated tests that pin the new behaviour. No locale catalog edits.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
Load Skill("gamelib-conventions") before writing any verify step, and Skill("sketch-findings-gamelib") (references/library-filtering.md) for the panel heading's visual weight.

Facts already established (do not re-derive):
- `Header/index.tsx` renders seven `.Header` children today, and `headerTourAnchors.test.tsx` "has exactly seven direct children in the locked panel order" pins them. Several sort tests reach the sort group as `topLevelChildren(tree)[1]`. `Header` already has `t` (the translation namespace) and `tGamelib`.
- The "Filters" string already exists as `header.filters` in the `translation` namespace (en: "Filters"). Discounts' `DiscountFilters` uses it as `t('header.filters', 'Filters')`. 44 of 49 catalogs carry it, and the other five fall back to en. Reuse this key. Do NOT add a new key, and do NOT touch `public/locales/**`. `public/locales/en/gamepage.json` carries an unrelated uncommitted operator edit and must stay unstaged. The now-unused `gamelib:library.groupBy.*` and `gamelib:tour.library.groupBy` catalog entries stay where they are: `i18next-parser.config.js` runs with `keepRemoved: true` (D-03 there), and removing them would churn 49 catalogs for no user-visible gain.
- `librarySort.ts`: `DEFAULT_LIBRARY_SORT_PREFS.groupBy` is `'installStatus'`, and `readLibrarySortPrefs` also migrates the legacy `sortInstalled` key into a groupBy. `sortAndGroupLibrary(games, {field, direction, groupBy, installing, nonSteamLastPlayedIso})` is called once, at `Library/index.tsx` ~line 921. `installing` is consumed only by the installStatus grouping.
- groupBy plumbing: `frontend/types.ts:336-337` (`groupBy`, `setGroupBy` on the LibraryContext type), `LibraryContext.tsx:26-27`, `Library/index.tsx` (imports at 52-66, `handleGroupBy` at 540, the memo deps at ~924/933, the context value at ~1152/1161), `Header/index.tsx` (the 309-337 row and the `LIBRARY_GROUP_BYS` import), `Header/index.css` (`.Header__sortSelect--wide`, group-by only), `LibraryTour.tsx` ~line 123 (the `library-group-by` step), `libraryTourAnchors.test.tsx` `EXPECTED_ELEMENTS`, and `FilterChipRow/__tests__/index.test.tsx:787`. The last is a regex of persisted keys clearAll must not touch. Leave it alone: a dead alternative in it is harmless.
- FocusRowStrip geometry (index.css comments): the track's card width is `--focus-row-card-width` (aliased to `--library-tile-css-width`, fallback 156px), the list gap is `1.5rem` (24px), and the list's `padding-inline` is 15px. The viewport bleeds `margin-inline-start: -15px` with no end bleed, so the track's percentage base (the viewport content box) is C + 15, where C is the grid content width. The grid is `repeat(auto-fill, var(--library-tile-css-width))` with a 1.5rem gap and `justify-content: start`, so it places n = floor((C + 24) / pitch) columns, where pitch = w + 24. `pageScrollDelta` gets `fitAllowance` 9 from `measureFitAllowance`. Source gates in `focusRowStripSource.test.ts` forbid any width write from `index.tsx` or `focusRowOverflow.ts`, so this fix must be CSS-only.
- Sign-in notice: `LibrarySignInNotice` already derives its rows from context on every render (`resolveSignInStates(collectSignInInputs(...))`). It shows `not-connected` whenever the context identity field is falsy: `epic.username`, `gog.username`, `amazon.user_id`, `humble.isLoggedIn`, `steam.username`. It shows `expired` from the config-store flags. So a stuck row means a login path left that context field stale. Known suspects: `steamLogin` (GlobalState ~1091) sets `steam.username: result.username`, which a login path returning no username (QR, for example) leaves undefined. Tauri OAuth `createOAuthLoginCompletion` for `nile` sets `user_id` from the payload. Any login that finishes in the backend without going through a GlobalState login wrapper changes nothing in renderer state. The initial-state reads at GlobalState ~483-512 are the authoritative store expressions. `rearmFromCurrentState` (~904) exists and is idempotent.

<interfaces>
From src/frontend/screens/Library/librarySort.ts (current):
- export type LibrarySortField = 'name' | 'lastPlayed' | 'installSize'; LibrarySortDirection = 'asc' | 'desc'; LibraryGroupBy (to delete)
- export const LIBRARY_SORT_FIELDS, LIBRARY_GROUP_BYS (delete), LIBRARY_SORT_FIELD_KEY, LIBRARY_SORT_DIRECTION_KEY, LIBRARY_GROUP_BY_KEY (delete), LEGACY_SORT_DESCENDING_KEY, LEGACY_SORT_INSTALLED_KEY (delete unless still referenced)
- export const DEFAULT_LIBRARY_SORT_PREFS: { field, direction, groupBy }
- export function readLibrarySortPrefs(storage: Pick<Storage,'getItem'>): LibrarySortPrefs
- export function writeLibrarySortField / writeLibrarySortDirection / writeLibraryGroupBy (delete)
- export function sortAndGroupLibrary(games: readonly GameInfo[], opts: { field, direction, groupBy, installing, nonSteamLastPlayedIso }): GameInfo[]

From src/common/signInState.ts:
- export type SignInStore = 'legendary' | 'gog' | 'nile' | 'humble' | 'steam'
- export function resolveSignInStates(inputs: SignInSelectorInputs): Record<SignInStore, SignInState>
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Filter panel: reorder, Filters heading, Sort font +2, drop Group by end to end (items 5-9)</name>
  <files>src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/Header/index.css, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/screens/Library/librarySort.ts, src/frontend/screens/Library/__tests__/librarySort.test.ts, src/frontend/screens/Library/index.tsx, src/frontend/screens/Library/LibraryContext.tsx, src/frontend/types.ts, src/frontend/screens/Library/components/LibraryTour.tsx, src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx</files>
  <behavior>
    - Header renders exactly eight top-level children in this order: Header__utilities, Header__search, Header__focusRowGroup, Header__sortGroup, Header__filtersHeading, Header__categoriesGroup, Header__filtersGroup, Header__footer.
    - Header__filtersHeading's text is the `header.filters` translation ('Filters').
    - No element in the Header tree carries data-tour="library-group-by", id="library-group-by", or a second select. The sort group holds exactly one row (library-sort), with its select, its direction button and the existing WR-03 aria behaviour unchanged.
    - readLibrarySortPrefs returns exactly the keys {field, direction}. Persisted libraryGroupBy='store' and legacy sortInstalled='true' have no effect on it, and DEFAULT_LIBRARY_SORT_PREFS has no groupBy.
    - sortLibrary returns the pure sort order. With one installed and one uninstalled game, Name A-Z puts 'Alpha (not installed)' before 'Beta (installed)', and no store or install clustering happens. The existing field, direction, tie-break and last-played cases pass after the rename.
    - The librarySort module no longer exports writeLibraryGroupBy, LIBRARY_GROUP_BYS or LIBRARY_GROUP_BY_KEY (assert via a namespace import that each is undefined).
    - The Library tour has no library-group-by step. Every other step is unchanged, in its current order.
  </behavior>
  <action>
Header/index.tsx (items 5-9):
- Reorder the JSX to the order in the behavior block.
- Insert `<h2 className="Header__filtersHeading">{t('header.filters', 'Filters')}</h2>` between the sort group and the categories group (item 8). Use the literal key and the literal default, because i18next-parser resolves nothing else.
- Delete the group-by row (item 9), the `groupBy`/`setGroupBy` destructure and the `LIBRARY_GROUP_BYS` import. Keep the `Header__sortGroup` wrapper around the single sort row, so the sort group stays one top-level child.

Header/index.css:
- Delete `.Header__sortSelect--wide` and its comment.
- Item 7: raise `.Header__sortLabel` and `.Header .Header__sortSelect` from `var(--text-xs)` to `calc(var(--text-xs) + 2px)`. The label and its select read as one control, so both move.
- Add `.Header__filtersHeading`: margin 0, `font-size: var(--text-md)`, `font-weight: var(--bold)`, `color: var(--text-default)`, `font-family: inherit`. This is Claude's discretion: it ranks above the uppercase `--text-xs` facet-group titles beneath it and matches the panel's existing type scale. Do not use `position: sticky` or `justify-content: space-between`, which tier2Portal.test.ts forbids in this file.

librarySort.ts:
- Delete `LibraryGroupBy`, `LIBRARY_GROUP_BYS`, `LIBRARY_GROUP_BY_KEY` and `writeLibraryGroupBy`. Delete `LEGACY_SORT_INSTALLED_KEY` if nothing else imports it (grep first).
- Remove groupBy from `LibrarySortPrefs`, from the defaults and from `readLibrarySortPrefs`.
- Rename `sortAndGroupLibrary` to `sortLibrary`. Drop its `groupBy` and `installing` options and the grouping tail, so it returns `sorted`.
- Update the header docstring: group-by was removed by operator request in quick 261029-quw, and persisted `libraryGroupBy`/`sortInstalled` keys are now ignored, so nobody is stranded in a grouping the UI can no longer change.

Remove the plumbing:
- frontend/types.ts: drop `groupBy` and `setGroupBy`.
- LibraryContext.tsx: drop both defaults.
- Library/index.tsx: drop the imports, the destructure, `handleGroupBy`, the context entries and the memo dep, and call `sortLibrary`. Remove `installing` from that memo's options and deps. Keep the `installing` useMemo only if something else still reads it; if nothing does, delete it.
- LibraryTour.tsx: delete the `library-group-by` step.

Tests (update; do not delete the files):
- headerTourAnchors.test.tsx:
  - Rewrite the seven-children test as the eight-children order above.
  - Find the sort group by className instead of index `[1]`, using a small helper over `topLevelChildren`.
  - Replace the two group-by cases with "no group-by row, id or option list anywhere in the tree" plus the heading-text assertion.
  - Drop `LIBRARY_GROUP_BYS`, `groupBy` and `setGroupBy` from the mocked context.
  - Update the file's docstring panel-order sentence.
- librarySort.test.ts: change the rename and baseOpts, and rewrite the group-by cases into the "ignored / pure order / not exported" assertions in the behavior block.
- libraryTourAnchors.test.tsx: remove `'[data-tour="library-group-by"]'` from `EXPECTED_ELEMENTS`.

Write the new test expectations first and see them fail, then change the source.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/components/UI/Header src/frontend/screens/Library/__tests__ src/frontend/screens/Library/components/FilterChipRow && pnpm codecheck && test "$(grep -rn 'groupBy\|GroupBy\|GROUP_BY\|library-group-by' src/frontend/components/UI/Header/index.tsx src/frontend/screens/Library/index.tsx src/frontend/screens/Library/LibraryContext.tsx src/frontend/types.ts src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/screens/Library/librarySort.ts | grep -Ev '^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)' | wc -l | tr -d ' ')" = 0 && test -z "$(git status --porcelain -- public/locales | grep -v 'public/locales/en/gamepage.json')" && F="src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/Header/index.css src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/librarySort.ts src/frontend/screens/Library/__tests__/librarySort.test.ts src/frontend/screens/Library/index.tsx src/frontend/screens/Library/LibraryContext.tsx src/frontend/types.ts src/frontend/screens/Library/components/LibraryTour.tsx src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint $(echo $F | tr ' ' '\n' | grep -v '\.css$')</automated>
  </verify>
  <done>The panel renders in the new eight-child order with a "Filters" heading. Sort text is 2px larger. No group-by control, type, key, writer, option or tour step remains in code (the catalog entries stay, per keepRemoved). Persisted group-by keys are ignored. The updated tests, codecheck, the scoped prettier check and eslint pass. No locale file changed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Grid: focus row shows exactly the grid's column count, heading -4px, hero art top-aligned (items 1, 3, 4)</name>
  <files>src/frontend/screens/Library/components/FocusRowStrip/index.css, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts, src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts</files>
  <behavior>
    - `.focusRowTrack` declares an inline-size whose text contains `round(down,`, the `--focus-row-card-width` var with the 156px fallback, the gap text `1.5rem` (equal to the list gap and the grid grid-gap, read from the same parsed files the parity tests already use), and the 15px bleed (equal to the list padding-inline and the viewport start bleed).
    - Arithmetic sweep, for w in {140, 156, 188, 320} and every integer C from w to 2400. Let pitch = w + 24, n = floor((C + 24) / pitch) and trackWidth = max(w + 30, n * pitch + 6). Then:
      - (a) card n+1's left edge (15 + n * pitch in track coordinates) is greater than or equal to trackWidth, so no sliver of it shows;
      - (b) card n's right edge plus the hovered ring reach (0.025w + 5.25) is at most trackWidth;
      - (c) pageScrollDelta({clientWidth: trackWidth, scrollWidth: big, scrollLeft: 0}, pitch, 9) equals n * pitch;
      - (d) canScrollForward with scrollWidth = k * pitch + 6 is false for k = n and true for k = n + 1.
      Import pageScrollDelta and canScrollForward from focusRowOverflow (the real functions, not replicas).
    - Non-vacuity: under the OLD clip (clientWidth = C + 15), (a) fails for at least one C at every w, proving the sliver existed.
    - `.focusRowStrip .libraryHeader` declares `font-size: calc(var(--text-2xl) - 4px)`.
    - H2 in gameCardControllerGeometry additionally asserts that `.gameCard.justPlayed .justPlayedImg` declares `object-position: center top`.
  </behavior>
  <action>
Item 1, FocusRowStrip/index.css. On `.focusRowTrack`, add:

`inline-size: max(calc(var(--focus-row-card-width, 156px) + 30px), calc(round(down, 100% - 15px + 1.5rem, var(--focus-row-card-width, 156px) + 1.5rem) - 1.5rem + 30px));`

The track's percentage base is the viewport content box, C + 15, so `100% - 15px` is the grid content width C. The `round(down, ...)` term is n pitches, and `- 1.5rem + 30px` adds the 15px leading list padding and 15px of trailing ring room. The `max()` floor keeps one tile visible when C is narrower than one tile.

Consequences:
- At scrollLeft 0 the strip shows exactly the grid's n whole columns and nothing of tile n+1, which matches the grid's own placement rule (operator item 1).
- When every card fits, no chevrons mount. The old "every card visible yet forward nudges up to 15px" band is gone.
- `pageScrollDelta` with fitAllowance 9 still pages exactly n.
- The track may extend up to 15px past C into the 16px gutter. That is ring room, and `.App .content` clips only at the gutter's outer edge.
- An engine without CSS `round()` drops the whole declaration and keeps today's auto width, which is a graceful fallback. WKWebView (Safari 15.4+) and WebView2 (Chromium 125+) both support `round()`.

Rewrite the G-48-8 / 261011-ulj D-03 comment block above `.focusRowStrip__viewport` and the track's comment to describe the new end clip, citing quick 261029-quw item 1. The viewport keeps `margin-inline-end: 0` and the controls stay positioned against it, so Test G2 and the chevron-offset test still hold unchanged.

Item 3: in the existing `.focusRowStrip .libraryHeader` rule, add `font-size: calc(var(--text-2xl) - 4px);`. The h3 default is `--text-2xl`; the main list's `.libraryHeader` stays unchanged.

Item 4, GameCard/index.css: in `.gameCard.justPlayed .justPlayedImg`, add `object-position: center top;`. Update that rule's comment: the letterbox bands now collect below the art, so the hero's art top lines up with its neighbours' art tops (quick 261029-quw item 4). Leave the `.usingFallback` placeholder rule alone.

Tests: add the behavior-block cases to focusRowStripSource.test.ts (new describe) and the H2 assertion. Write them first and watch them fail against the current CSS.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/screens/Library/components/FocusRowStrip src/frontend/screens/Library/components/GameCard src/frontend/screens/Library/__tests__/tier2Portal.test.ts && F="src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts</automated>
  </verify>
  <done>The track clip is the grid's whole-column extent, and the sweep proves there is no sliver, the ring fits, the page size is n and the controls mount only on real overflow. The non-vacuity case proves the old clip showed a sliver. The strip heading is 4px smaller. The hero art is top-aligned. All FocusRowStrip and GameCard suites, the scoped prettier check and eslint pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Sign-in notice self-heals after any login (item 2)</name>
  <files>src/frontend/helpers/signInIdentityResync.ts, src/frontend/helpers/__tests__/signInIdentityResync.test.ts, src/frontend/state/GlobalState.tsx</files>
  <behavior>
    - resyncSignInIdentity(current, read) is pure. `current` holds the five context slices' identity fields; `read` gives per-store config-store readers. It returns only the slices whose identity differs from the store, as merge patches that keep every other field of the slice (library, enabled and so on).
    - With current steam.username undefined and the store holding userData.username 'gabe', the patch is { steam: { username: 'gabe' } }, and resolveSignInStates over the patched inputs no longer yields steam 'not-connected'.
    - With current amazon.user_id undefined and the store holding userData.user_id 'amzn1', the patch sets amazon.user_id.
    - Humble: the patch reflects the store's isLoggedIn and expired.
    - When current matches the store for all five stores, the result is {}, so the caller can skip setState and avoid a re-render loop.
    - It also heals logout: a context username 'x' with an empty store patches it to undefined or null, matching the initial-state expression.
    - Source gate (comment-stripped GlobalState.tsx): handleSuccessfulLogin, steamLogin's success branch, humbleLogin's success branch and refreshLibrary's completion each reach a single private method that applies resyncSignInIdentity and then calls rearmFromCurrentState. Include a RED specimen: deleting the call from the real source text must trip the gate.
  </behavior>
  <action>
First, desk-trace each of the five stores' login completion paths in GlobalState.tsx, WebView/useTauriOAuthLogin.ts and the Login screen. For each, record which context identity field the selector reads (epic.username, gog.username, amazon.user_id, humble.isLoggedIn/expired, steam.username) and whether that path writes it from a value that can be absent. Put the table in the SUMMARY, naming the path or paths that leave a stale field. The top lead is `steamLogin` writing `result.username`, which can be undefined.

Then fix it at the single point every login converges on, rather than patching each wrapper. Create `src/frontend/helpers/signInIdentityResync.ts`. Its readers are injected, so it is jest-testable without window.api. They mirror the authoritative initial-state expressions at GlobalState ~483-512:
- legendary `userInfo.displayName`
- gog `userData.username`
- nile `userData.user_id` and `userData.name`
- humble `isLoggedIn`, `userData.username` and `expired`
- steam `userData.username`

In GlobalState, add a private `resyncSignInIdentityFromStores` that:
- builds the readers from the existing config-store imports,
- calls the helper,
- runs setState only if the patch is non-empty, merging each slice with its current value,
- then calls `rearmFromCurrentState`.

Call it at the four points named in the behavior block. For refreshLibrary, call it in the same place `refreshing: false` is set on completion. A login that completes in the backend therefore heals at the next refresh, which every login already triggers.

Do not change LibrarySignInNotice. Its source gates (librarySignInNoticeSource.test.ts G1: no window.api in the notice) stay as they are; the notice already re-derives from context on each render. Do not touch `dismissedSignInNotices` semantics. If the trace finds a further broken path that the resync cannot reach, fix that path too and name it in the SUMMARY.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/helpers/__tests__/signInIdentityResync.test.ts src/frontend/screens/Library/__tests__/signInTracer.test.ts src/frontend/screens/Library/__tests__/signInStateParity.test.ts src/frontend/screens/Library/__tests__/librarySignInNoticeSource.test.ts src/frontend/screens/Library/__tests__/librarySignInRows.test.ts src/frontend/screens/WebView && pnpm codecheck && F="src/frontend/helpers/signInIdentityResync.ts src/frontend/helpers/__tests__/signInIdentityResync.test.ts src/frontend/state/GlobalState.tsx" && for f in $F; do npx prettier --file-info "$f" | grep -Eq '"ignored":[[:space:]]*false' || { echo "unexpectedly ignored: $f"; exit 1; }; done && npx prettier --check $F && npx eslint $F</automated>
  </verify>
  <done>Every login path and every refresh completion re-reads the five identity fields from their stores and re-arms dismissals, so a stale not-connected or expired row clears without a restart. The pure helper is unit-tested, including the no-op case that prevents a render loop. The GlobalState wiring is source-gated with a RED specimen. The trace table and the identified culprit path are in the SUMMARY. Suites, codecheck, the scoped prettier check and eslint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer localStorage -> Library sort | persisted sort keys are read back into the sort pipeline |
| backend config stores -> renderer sign-in state | identity fields re-read through window.api.storeGet |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quw-01 | Tampering | readLibrarySortPrefs | mitigate | Field and direction stay validated through `oneOf` against the closed lists. The group-by keys are no longer read at all, so a hostile value has no path in. |
| T-quw-02 | Information disclosure | resyncSignInIdentity | accept | It reads only fields the renderer already loads at boot (display names and ids), writes nothing to logs and sends nothing over IPC beyond the existing storeGet. |
| T-quw-03 | Denial of service | resync called from refreshLibrary | mitigate | An empty patch means no setState, which is unit-tested, so a refresh can never trigger a re-render loop. |
</threat_model>

<verification>
- All three tasks' automated blocks pass.
- `pnpm jest src/frontend/screens/Library src/frontend/components/UI` is green overall.
- `pnpm codecheck` is clean.
- `git status --porcelain public/locales` shows only the operator's pre-existing gamepage.json edit, and it stays unstaged.
- After the code changes, run `graphify update .` (per CLAUDE.md).
- Live check, owed to the operator (not a blocking checkpoint): open the Library, confirm the panel order and the heading, confirm the strip ends where the grid row ends at a few window widths, confirm the hero's art top lines up with its neighbours, and sign in to a store with its notice showing and watch the row clear.
</verification>

<success_criteria>
All nine operator items are implemented as interpreted in the objective. Group-by is gone with no stranded persisted state. Every test that pinned the old layout or group-by now pins the new behaviour, and no test file was deleted. There is no locale churn.
</success_criteria>

<output>
Create `.planning/quick/261029-quw-library-screen-tidy-ups/261029-quw-SUMMARY.md` when done. It must include the interpretation of each item and the Task 3 login-path trace table.
</output>
