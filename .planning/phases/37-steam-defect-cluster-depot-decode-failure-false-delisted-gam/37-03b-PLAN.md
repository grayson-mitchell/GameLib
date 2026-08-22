---
phase: 37-steam-defect-cluster-depot-decode-failure-false-delisted-gam
plan: 03b
type: execute
wave: 2
depends_on: ['37-03a']
files_modified:
  - src/frontend/types.ts
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts
  - src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts
  - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/LibraryContext.tsx
  - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts
  - src/frontend/screens/Library/components/FilterChipRow/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - public/locales/en/gamelib.json
autonomous: false
requirements: [REQ-37-02]

must_haves:
  truths:
    - "D-10: A tri-state 'No store page' row exists inside the existing More filters group (FilterMoreGroup), beside 'Show Hidden' and 'Show non-Available games' — NOT a new facet group. It inherits the chip row, the group badge and zero-result handling, and costs exactly one new descriptor kind in MORE_FILTER_KINDS."
    - "D-11: The three states are off / only / hide — NOT the neighbours' off/show/only. Neutral 'off' means NOT FILTERING: delisted games are visible, no descriptor is emitted, no chip appears, and the group badge reads nothing on a virgin library."
    - "Clicking the row cycles to 'hide', which reproduces the OLD forced-hide behaviour as an opt-in"
    - "The row label and the card badge both read 'No store page', rendered from a NEW i18n key present in public/locales/en/gamelib.json"
    - "MORE_FILTER_KINDS and describeActiveFilters both carry the sixth kind — the manual transcription did not drift"
    - "Facet-count semantics are unchanged: the new state is read only inside passesMore, so filterLibrary({skip:'more'}) still excludes it from its own counts"
    - "The new facet is not routed through nonAvailableGames (D-16), and the Install-with-options doors stay closed (D-14)"
  artifacts:
    - path: "src/frontend/screens/Library/filterEngine.ts"
      provides: "noStorePage tri-state in FilterEngineState, DEFAULT_FILTER_ENGINE_STATE, passesMore and describeActiveFilters"
      contains: "noStorePage"
    - path: "src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx"
      provides: "the off/only/hide row, using its own cycle helper — not the off/show/only one"
    - path: "public/locales/en/gamelib.json"
      provides: "the NEW No store page keys"
      contains: "noStorePage"
  key_links:
    - from: "src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts"
      to: "src/frontend/screens/Library/filterEngine.ts"
      via: "MORE_FILTER_KINDS mirrors describeActiveFilters's More-filters branches"
      pattern: "noStorePage"
    - from: "src/frontend/screens/Library/components/GameCard/index.tsx"
      to: "public/locales/en/gamelib.json"
      via: "tGamelib with a literal key AND a literal default"
      pattern: "gamelib:library.noStorePage"
---

<objective>
Give the user the filter that replaces the forced hide plan 37-03a removed, and rename the badge to
something the data can actually support.

Purpose: 37-03a made delisted games visible. This plan makes the old behaviour available as an
OPT-IN, and fixes the label. Two of the nine affected titles (`Starbound - Unstable` 367540,
`Rust - Staging Branch` 700580) are branch entries that were NEVER listed — "Game no longer
available" asserts a claim the data cannot support, and with nothing hidden the badge becomes the
primary signal rather than a footnote. "No store page" is literally what Steam's `success: false`
means, and it is deliberately the PARENT term so a later PICS-based refinement can add "Delisted"
underneath it.

Output: a "No store page" row in More filters (off / only / hide), a matching chip, a renamed card
badge, and the live confirmation that Dead Island renders and launches.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-RESEARCH.md
@.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-VALIDATION.md
@.planning/todos/pending/2026-08-21-nine-owned-games-permanently-flagged-delisted-and-hidden.md
@.claude/skills/sketch-findings-gamelib/references/library-filtering.md

<interfaces>
<!-- Extracted from the codebase at plan time. Use these directly; do not re-explore. -->

From `src/frontend/types.ts`:
  export type FilterMode = 'off' | 'show' | 'only'        // the NEIGHBOURS' states — NOT the new row's
  export type FacetKind = 'view' | 'collection' | 'store' | 'runnability' | 'search' | 'more'
  export interface FilterEngineState {
    view; collection; stores; runnability; searchMatchedKeys;
    showHidden: FilterMode; showNonAvailable: FilterMode;
    showSupportOfflineOnly: boolean; showThirdPartyManagedOnly: boolean; showUpdatesOnly: boolean
  }
  export interface ActiveFilterDescriptor {
    id: string
    kind: 'view'|'collection'|'store'|'runnability'|'search'|'showHidden'|'showNonAvailable'|'showSupportOfflineOnly'|'showThirdPartyManagedOnly'|'showUpdatesOnly'
    value: string
  }
  `LibraryContextType` carries `showNonAvailable: FilterMode` / `setShowNonAvailable(v)` around ~:303.

From `src/frontend/screens/Library/filterEngine.ts`:
  export function isNonAvailableGame(game, deps): boolean   // after 37-03a: list membership only
  export function passesMore(game, state, deps): boolean    // current shape at ~:255-295:
      offline/thirdParty/updates guards, then
      const { showHidden, showNonAvailable } = state
      if (showHidden === 'only' && showNonAvailable === 'only') return isNonAvailable || isHidden   // D-09 union
      if (showHidden === 'only') return isHiddenGame(...)
      if (showNonAvailable === 'only') return isNonAvailableGame(...)
      if (showNonAvailable === 'off' && isNonAvailableGame(...)) return false
      if (showHidden === 'off' && isHiddenGame(...)) return false
      return true
  export const DEFAULT_FILTER_ENGINE_STATE  (~:393-404) — PINNED by
      `__tests__/libraryHeaderVisibility.test.ts`: describeActiveFilters(DEFAULT, '') === []
  export function describeActiveFilters(state, searchTerm): ActiveFilterDescriptor[]  (~:408-475)
      — emits for each tri-state whenever `state.X !== 'off'`
  export function filterLibrary(library, state, deps, opts?: { skip?: FacetKind })

From `src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts`:
  export const MORE_FILTER_KINDS = ['showHidden','showNonAvailable','showSupportOfflineOnly','showThirdPartyManagedOnly','showUpdatesOnly'] as const satisfies readonly DescriptorKind[]
  export function countDescriptorsOfKind(descriptors, kinds): number
  Tripwire: `src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts` ~:80-95
  pins the membership list AND the absence of duplicates.

From `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx`:
  local `triState(value: FilterMode, label, onToggle, onOnly)` renders
    <div className="FilterMoreGroup__triState"><FilterFacetRow label checked={value !== 'off'} onToggle/>
     <button className="FilterMoreGroup__only" aria-pressed={value === 'only'} onClick={onOnly}>{t('header.only','only')}</button></div>
  Existing cycles: off -> show (row click); show -> off; only -> show. Separate "only" button toggles only<->off.
  Group badge: countDescriptorsOfKind(activeFilterDescriptors, MORE_FILTER_KINDS), label interpolated
  on `{{selected}}` — `count` is RESERVED by i18next and must never be used as the name.

From `src/frontend/screens/Library/index.tsx`:
  ~:331-339  const migrateFilterMode = (key: string, defaultValue: FilterMode): FilterMode =>
               storage.getItem(key) matched against 'show' | 'only' | 'off', else defaultValue
  ~:365-371  const [showNonAvailable, setShowNonAvailable] = useState(migrateFilterMode('show_non_available','off'))
             const handleShowNonAvailable = (v) => { storage.setItem('show_non_available', v); setShowNonAvailable(v) }
  ~:736-764  const engineState: FilterEngineState = useMemo(...) — object literal AND dep array
  ~:993-1020 the LibraryContext.Provider value object

From `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts` ~:141-156:
  case 'showNonAvailable': switch (descriptor.value) { case 'only': {...chipNonAvailableOnly}; case 'show': {...chipNonAvailableIncluded}; default: return null }
  Returned spec shape: `{ ns: 'gamelib' | 'default', key, defaultText }`

From `src/frontend/screens/Library/components/FilterChipRow/index.tsx` ~:140-158:
  the chip's x-button switch — `case 'showNonAvailable': setShowNonAvailable('off'); break`
  D-27: a tri-state chip's x always returns the filter to 'off', never steps the cycle.

From `src/frontend/screens/Library/components/GameCard/index.tsx`:
  :108-110  const { t } = useTranslation('gamepage'); const { t: t2 } = useTranslation();
            const { t: tGamelib } = useTranslation('gamelib')
  :323      const isDelisted = !!gameInfoFromProps.is_delisted
  :535-544  <span className="gameCardDelistedBadge" aria-label={t2('library.delisted','Game no longer available')} ...>
              {t2('library.delisted','Game no longer available')}</span>
  TRAP: `library.delisted` ALREADY EXISTS in `public/locales/en/translation.json:689` with the value
  "Game no longer available". i18next renders the catalog value in preference to a call-site
  default, so editing the default argument is a SILENT NO-OP. This rename needs a NEW KEY.

Catalog rules:
  - `public/locales/en/gamelib.json` is the ONLY catalog file that may change.
    `meta/i18nCatalogChurnGuard.ts`'s live-tree assertion runs inside `pnpm test:ci` and fails on
    ANY changed path under `public/locales/` that is not a `gamelib.json`/`gamelib.mt.json` leaf.
  - `i18next-parser` only resolves STRING-LITERAL arguments. A literal key with a NON-literal
    default extracts an EMPTY catalog value, which i18next then renders in preference to the
    call-site fallback — the row renders blank. Both arguments must be literal at every new call site.
  - `{{count}}` is RESERVED by i18next.
  - `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx` and
    `src/frontend/screens/Library/components/GameCard/index.tsx` are both listed in
    `meta/i18nGateScope.json`, so a new bare user-facing string in either is a gate failure.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add the sixth More-filter to the engine, in BOTH places, with the tripwire updated</name>
  <files>src/frontend/types.ts, src/frontend/screens/Library/filterEngine.ts, src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts, src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts, src/frontend/screens/Library/__tests__/filterEngine.test.ts</files>
  <read_first>
    - src/frontend/types.ts ~:435-510 — `FilterMode`, `FacetKind`, `FilterEngineState`, `FilterEngineDeps`, `ActiveFilterDescriptor`
    - src/frontend/screens/Library/filterEngine.ts ~:230-300 (isNonAvailableGame / isHiddenGame / passesMore) and ~:370-480 (DEFAULT_FILTER_ENGINE_STATE and describeActiveFilters, including the INVARIANT doc comment above the constant)
    - src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts — the whole file; its header states exactly why a second implementation of "what counts as active" is forbidden
    - src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts ~:74-95 — the drift tripwire that must be re-pinned to six
    - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts — the `describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '') === []` invariant this task must not break
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md § D-10, D-11, D-16
    - .claude/skills/sketch-findings-gamelib/references/library-filtering.md § "Facet counts exclude their own facet"
  </read_first>
  <action>
    In `src/frontend/types.ts`, add `export type NoStorePageMode = 'off' | 'only' | 'hide'` next to
    `FilterMode`, with a comment stating why the neutral moved: `describeActiveFilters` emits a
    descriptor whenever a tri-state is `!== 'off'`, so a `'show'`-defaulting row would put a chip in
    the chip row and "1 selected" on the More group badge for every user on a virgin library with
    zero action taken (D-11). A per-row exception suppressing the descriptor was rejected to keep
    `selectionCount.ts`'s "what counts as active" rule uniform.

    Add `noStorePage: NoStorePageMode` to `FilterEngineState`, add `'noStorePage'` to
    `ActiveFilterDescriptor['kind']`'s union, and add `noStorePage: NoStorePageMode` +
    `setNoStorePage: (value: NoStorePageMode) => void` to `LibraryContextType`.

    In `filterEngine.ts`:
    - `DEFAULT_FILTER_ENGINE_STATE` gains `noStorePage: 'off'`.
    - `describeActiveFilters` gains a branch, placed immediately after the `showNonAvailable`
      branch so file order matches `MORE_FILTER_KINDS`'s order:
      `if (state.noStorePage !== 'off') descriptors.push({ id: 'noStorePage:' + state.noStorePage, kind: 'noStorePage', value: state.noStorePage })`.
    - `passesMore` gains the predicate and the two new branches. Introduce a local
      `const isNoStorePageGame = game.runner === 'steam' && !!game.is_delisted` — this is the same
      expression 37-03a removed from `isNonAvailableGame`, deliberately re-homed here as its OWN
      facet rather than routed back through `nonAvailableGames` (D-16: that list means "an INSTALLED
      game whose install_path went missing", has exactly one writer, and a second writer would
      collide at every existing reader).
      Restructure the tri-state block to this exact shape, which is BEHAVIOURALLY IDENTICAL to
      today's for every combination in which `noStorePage === 'off'`:
        1. `if (state.noStorePage === 'hide' && isNoStorePageGame) return false`
        2. if ANY of the three tri-states is `'only'`, return the OR across just those that are
           `'only'` (this generalises the existing D-09 both-`'only'`-means-union rule from two
           tri-states to three)
        3. the existing `showNonAvailable === 'off'` and `showHidden === 'off'` exclusions, unchanged
        4. `return true`
      Document the step-1-before-step-2 ordering: an explicit `hide` beats an unrelated `'only'`
      isolation, because `hide` is the user's direct instruction about THIS facet.
    - Read `state.noStorePage` ONLY inside `passesMore`. It must not be consulted by any other
      stage, because `filterLibrary`'s `skip: 'more'` is what excludes a More filter from its own
      counts; reading it elsewhere would reintroduce the counting-a-facet-against-itself defect the
      34.11 CR-01 fix removed.

    In `selectionCount.ts`, add `'noStorePage'` to `MORE_FILTER_KINDS` and update the doc comment
    from "five" to "six" everywhere it appears.

    Update `facetSelectionCount.test.ts`'s membership pin from five entries to six (add
    `'noStorePage'` to the sorted expectation and change the `it(...)` title from "five" to "six").
    The duplicate guard stays as-is.

    Add to `filterEngine.test.ts`, in the same describe as 37-03a's flipped case, five cases:
    (a) `noStorePage: 'off'` — a delisted game is returned (already true after 37-03a; this pins
        that adding the facet did not silently re-hide it);
    (b) `noStorePage: 'hide'` — the delisted game is excluded and a non-delisted game is returned;
    (c) `noStorePage: 'only'` — only the delisted game is returned;
    (d) `noStorePage: 'only'` combined with `showHidden: 'only'` — the UNION is returned, matching
        the existing D-09 rule;
    (e) a NON-Steam game carrying a truthy `is_delisted` is unaffected by `noStorePage: 'hide'` —
        the predicate is runner-scoped.
    Also assert `describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '')` is still `[]`, and that
    `describeActiveFilters({...DEFAULT, noStorePage: 'hide'}, '')` returns exactly one descriptor of
    kind `'noStorePage'`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/__tests__/ src/frontend/components/UI/NavShell/__tests__/ --silent</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "noStorePage" src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts` is at least 1 AND `grep -c "noStorePage" src/frontend/screens/Library/filterEngine.ts` is at least 3 — the sixth kind exists in BOTH the manual transcription and the branch it transcribes.
    - `facetSelectionCount.test.ts`'s membership expectation lists exactly six entries and its title says "six".
    - `npx jest src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts --silent` passes — the `describeActiveFilters(DEFAULT, '') === []` invariant survived a new state field.
    - Case (b) is observed FAILING when the `noStorePage === 'hide'` branch is commented out, and case (a) is observed FAILING when `DEFAULT_FILTER_ENGINE_STATE.noStorePage` is set to `'hide'`. Record both mutation observations in the SUMMARY — a filter test that passes under both settings measures nothing.
    - Every pre-existing test in `filterEngine.test.ts` still passes with no edit, proving the `passesMore` restructure is behaviourally identical at `noStorePage: 'off'`.
    - `grep -n "state.noStorePage\|noStorePage" src/frontend/screens/Library/filterEngine.ts` shows every read inside `passesMore`, `describeActiveFilters` or the DEFAULT constant — nowhere else.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors.
  </acceptance_criteria>
  <done>The engine carries a sixth More filter, the manual transcription is in step with it, and the tripwire is re-pinned.</done>
</task>

<task type="auto">
  <name>Task 2: Wire the state through the Library screen and render the off/only/hide row</name>
  <files>src/frontend/screens/Library/index.tsx, src/frontend/screens/Library/LibraryContext.tsx, src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx</files>
  <read_first>
    - src/frontend/screens/Library/index.tsx ~:325-375 (`migrateFilterMode` and the `showHidden`/`showNonAvailable` state+persist pairs), ~:730-770 (`engineState` memo AND its dependency array), ~:990-1030 (the context Provider value)
    - src/frontend/screens/Library/LibraryContext.tsx — the default value object
    - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx — the whole file; note the `triState` helper's shape, the classNames, and the doc comment forbidding a local boolean tally for the badge
    - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx — `FilterFacetRow`'s props, so the new row is one more call to an existing component and not a new one
    - meta/i18nGateScope.json — confirm `FilterMoreGroup/index.tsx` is in scope (it is), so every new user-facing string must be `t()`-wrapped with literal key AND literal default
    - .claude/skills/sketch-findings-gamelib/references/library-filtering.md § CSS Patterns — the row/chip visual contract this row inherits unchanged
  </read_first>
  <action>
    In `Library/index.tsx`, add a validator beside `migrateFilterMode`:
    `const readNoStorePageMode = (key: string, defaultValue: NoStorePageMode): NoStorePageMode` that
    accepts only the literals `'off' | 'only' | 'hide'` from `storage.getItem(key)` and returns
    `defaultValue` for anything else (including a legacy `'show'` written by some future edit).
    Do NOT widen `migrateFilterMode` to serve both — the two unions differ and a shared validator
    would accept `'show'` here.

    Add the state pair using localStorage key `no_store_page`:
    `const [noStorePage, setNoStorePage_] = useState<NoStorePageMode>(readNoStorePageMode('no_store_page', 'off'))`
    plus a `handleNoStorePage(value)` that persists then sets, exactly mirroring
    `handleShowNonAvailable`'s shape.

    Add `noStorePage` to BOTH the `engineState` memo's object literal AND its dependency array — a
    field added to one and not the other is a stale-memo defect that renders as "the filter does
    nothing until something else changes".

    Add `noStorePage` and `setNoStorePage: handleNoStorePage` to the `LibraryContext.Provider` value
    object, and add `noStorePage: 'off'` / `setNoStorePage: () => null` to `LibraryContext.tsx`'s
    default object.

    In `FilterMoreGroup/index.tsx`, destructure `noStorePage` and `setNoStorePage` from
    `LibraryContext`. Add a SECOND local helper beside `triState` — name it `hideOnlyTriState` —
    taking `(value: NoStorePageMode, label, onToggle, onOnly)`. It renders the identical JSX
    (`FilterMoreGroup__triState` wrapper, `FilterFacetRow`, `FilterMoreGroup__only` button) with
    `checked={value !== 'off'}` and `aria-pressed={value === 'only'}`. Do NOT reuse `triState`
    unmodified: its `FilterMode` parameter type does not admit `'hide'`, and its sub-state semantics
    differ.

    Add the two cycle functions:
    - row click: `off -> hide`, `hide -> off`, `only -> hide`;
    - "only" button: `only -> off`, anything else `-> only`.
    These mirror the neighbours' structure with `'hide'` substituted for `'show'` (D-11).

    Render the new row via `hideOnlyTriState` as the THIRD entry inside the group, immediately after
    the "Show non-Available games" row and before the three boolean rows (D-10: beside "Show Hidden"
    and "Show non-Available games", inside the existing group, no new facet group). Its label is
    `tGamelib('gamelib:library.filterPanel.noStorePage', 'No store page')` — literal key, literal
    default, both required by `i18next-parser`. Follow the same call shape the group's own
    `selectedCountLabel` already uses.

    Do not touch `selectedCount` — it already reads `countDescriptorsOfKind(activeFilterDescriptors,
    MORE_FILTER_KINDS)` and Task 1 added the sixth kind, so the badge counts the new row for free.
    A local boolean tally here is explicitly forbidden by this file's own doc comment.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/__tests__/ src/frontend/components/UI/NavShell/__tests__/ --silent && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "noStorePage" src/frontend/screens/Library/index.tsx` is at least 5 (validator, state, handler, engineState literal, engineState dep array, provider value) and the engineState memo's dependency array literally contains `noStorePage` — verify by reading the array, not by counting file-wide hits.
    - `grep -n "no_store_page" src/frontend/screens/Library/index.tsx` shows both a `getItem` and a `setItem`.
    - `grep -n "hideOnlyTriState" src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx` shows a definition and exactly one call site.
    - `grep -c "migrateFilterMode" src/frontend/screens/Library/index.tsx` is unchanged from its pre-task value — the existing validator was not widened.
    - The new label call is `tGamelib('gamelib:library.filterPanel.noStorePage', 'No store page')` with BOTH arguments as string literals. `grep -n "filterPanel.noStorePage" src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx` shows no template literal and no variable.
    - `npx jest meta/__tests__ --silent` passes — in particular the hardcoded-string gate over `FilterMoreGroup/index.tsx`.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors.
  </acceptance_criteria>
  <done>The row renders in More filters, cycles off -> hide -> off with a working "only" button, persists across navigation, and the group badge counts it.</done>
</task>

<task type="auto">
  <name>Task 3: Chip, badge, and the NEW catalog keys</name>
  <files>src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts, src/frontend/screens/Library/components/FilterChipRow/index.tsx, src/frontend/screens/Library/components/GameCard/index.tsx, public/locales/en/gamelib.json</files>
  <read_first>
    - src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts ~:110-175 — the `showHidden` and `showNonAvailable` cases and the returned `{ ns, key, defaultText }` spec shape
    - src/frontend/screens/Library/components/FilterChipRow/index.tsx ~:130-160 — the x-button switch and the D-27 comment
    - src/frontend/screens/Library/components/GameCard/index.tsx :108-110 (the three translation hooks, `tGamelib` already in scope) and :530-545 (the badge)
    - public/locales/en/gamelib.json — the `library.filterPanel` block, to place new keys in the existing alphabetical order
    - public/locales/en/translation.json around the `library.delisted` entry — READ ONLY. Confirm with your own eyes that `library.delisted` exists with the value "Game no longer available"; that is what makes a default-argument rename a silent no-op. Do not edit this file.
    - .planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-CONTEXT.md § D-12
  </read_first>
  <action>
    In `chipLabels.ts`, add `case 'noStorePage'` immediately after the `showNonAvailable` case, with
    a nested switch on `descriptor.value`:
    - `'only'` -> `{ ns: 'gamelib', key: 'gamelib:library.filterPanel.chipNoStorePageOnly', defaultText: 'No store page only' }`
    - `'hide'` -> `{ ns: 'gamelib', key: 'gamelib:library.filterPanel.chipNoStorePageHidden', defaultText: 'Hiding no store page' }`
    - `default` -> `null`
    Do not copy the `showNonAvailable` case wholesale: its sub-values are `'only'`/`'show'` and a
    copy-paste would leave a dead `'show'` arm and no `'hide'` arm.

    In `FilterChipRow/index.tsx`, add `case 'noStorePage': setNoStorePage('off'); break` to the
    x-button switch, and destructure `setNoStorePage` from `LibraryContext`. Per D-27 the x always
    returns the filter to `'off'`; it never steps the cycle.

    In `GameCard/index.tsx`, replace BOTH `t2('library.delisted', 'Game no longer available')` calls
    (the `aria-label` and the rendered text) with
    `tGamelib('gamelib:library.noStorePage', 'No store page')`. `tGamelib` is already in scope at
    line 110 — do not add a fourth hook. This is a NEW KEY, not a default-argument edit: i18next
    renders a catalog value in preference to a call-site default once the key exists, and
    `library.delisted` DOES exist in `translation.json`, so editing the default would render the old
    string forever. Leave the `gameCardDelistedBadge` className and the `isDelisted` variable name
    alone — renaming them is churn with no user-visible effect and would widen the diff across the
    stylesheet.

    Add four keys to `public/locales/en/gamelib.json`, each placed in the existing alphabetical
    position of its block:
    - `library.noStorePage` -> `"No store page"`
    - `library.filterPanel.noStorePage` -> `"No store page"`
    - `library.filterPanel.chipNoStorePageHidden` -> `"Hiding no store page"`
    - `library.filterPanel.chipNoStorePageOnly` -> `"No store page only"`
    Hand-edit this ONE file. Do NOT run `pnpm i18n`, `pnpm gen-i18n-gate-scope`, or
    `pnpm gen-i18n-scope:rewrite` — regenerating an artifact to satisfy a gate has, in this repo,
    broken the pins that guard it and taken the suite from 1 failure to 5. Do NOT touch
    `translation.json`, `gamepage.json` or `login.json`: `meta/i18nCatalogChurnGuard.ts`'s live-tree
    assertion inside `pnpm test:ci` fails on any non-`gamelib` path under `public/locales/`.
    Leave `library.delisted` in `translation.json` in place, unused.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/components/FilterChipRow meta/__tests__/i18nCatalogChurnGuard.test.ts --silent</automated>
  </verify>
  <acceptance_criteria>
    - `node -e "const c=require('./public/locales/en/gamelib.json'); const g=(o,p)=>p.split('.').reduce((a,k)=>a&&a[k],o); for (const k of ['library.noStorePage','library.filterPanel.noStorePage','library.filterPanel.chipNoStorePageHidden','library.filterPanel.chipNoStorePageOnly']) { if (g(c,k)!==undefined && g(c,k)!=='') continue; throw new Error('missing or empty: '+k) } console.log('ok')"` prints `ok`. This asserts PRESENCE AND NON-EMPTINESS — an empty catalog value is exactly what a non-literal `t()` argument produces, and it renders as a blank row.
    - `grep -c "library.delisted" src/frontend/screens/Library/components/GameCard/index.tsx` returns `0`.
    - `grep -n "gamelib:library.noStorePage" src/frontend/screens/Library/components/GameCard/index.tsx` shows two hits (aria-label and text), each with both arguments as string literals.
    - `git status --short public/locales/` lists ONLY `public/locales/en/gamelib.json`.
    - `npx jest meta/__tests__/i18nCatalogChurnGuard.test.ts --silent` passes.
    - `pnpm lint-translations:gamelib` runs and its output is captured in the SUMMARY. Missing translations in the other 48 locales are EXPECTED and are not a failure — the script is informational and is not wired into CI.
    - `npx jest meta/__tests__ --silent` passes — the hardcoded-string gate over `GameCard/index.tsx`.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors.
  </acceptance_criteria>
  <done>The chip, the card badge and the filter row all read "No store page" from new, non-empty gamelib keys.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: LIVE GATE — Dead Island renders and launches; header count confirmed on the same restart</name>
  <what-built>
    Plan 37-03a removed the delisted forced hide from both `SteamGame.isGameAvailable()` and
    `filterEngine.isNonAvailableGame`, and lifted the same hide out of Console Mode. This plan added
    an opt-in "No store page" tri-state row (off / only / hide) to More filters, a matching chip, and
    a renamed card badge sourced from new `gamelib` catalog keys.
  </what-built>
  <how-to-verify>
    A green suite does NOT close REQ-37-02. This repo's ledger records a live gate beating a green
    suite three separate times, and `37-VALIDATION.md`'s Manual-Only table binds three rows to this
    single run. Discharge all three in ONE session.

    **Setup — a FULL CLEAN APP RESTART, not a reload.** A reload can preserve pre-existing
    localStorage, and `nonAvailableGames` is localStorage-backed. Quit the app entirely, then start
    it with `pnpm tauri:dev` (NOT `tauri dev` — that serves a stale static bundle). Set
    `GAMELIB_DEV_SECRET_VAULT=1` if you want to avoid Keychain prompts.

    Row 1 — Dead Island (appid 91310), delisted AND installed on this machine:
    1. With NO filter changes at all, confirm 91310 appears in the Games grid.
    2. Confirm its card carries a badge reading exactly **"No store page"** — not "Game no longer
       available", and not blank. A blank badge means the catalog value is empty, which is the
       `i18next-parser` non-literal-argument trap.
    3. Launch it. Confirm it launches.
    4. Switch to Console Mode. Confirm 91310 appears in that grid too and can be activated.
    5. Return to the Games tab, open **More filters**, and confirm a row labelled **"No store page"**
       is present and reads as UNCHECKED on this virgin state, with **no chip** in the chip row and
       **no "N selected"** badge on the More filters group. Then click the row once; confirm 91310
       disappears from the grid and a chip appears. Click the chip's x; confirm 91310 returns.
       Click the row's "only" button; confirm the grid shows the delisted set only.

    Row 2 — the owed confirmation, discharged in the SAME restart:
    6. At FIRST PAINT after the restart, before touching any filter, record the library header count
       verbatim. The sibling item "22 owned Steam games never reach the rendered library" was fixed
       on 2026-08-22 (commit `51b175d74`) and is open only pending this confirmation.
       **The header counts the cross-store UNION, not a per-runner sync count.** Comparing it to a
       Steam sync count is a category error that has cost a whole session in this repo. Record the
       number; do not compute a delta against anything.
       **Closing REQ-37-02 explains 9 of those 22 and will NOT close that item.** State that
       explicitly in the SUMMARY.

    Row 3 — the copy renders at all:
    7. Steps 2 and 5 above already cover it. Additionally confirm the chip text reads
       "Hiding no store page" when the row is set to hide and "No store page only" when set to only.

    Do NOT `git stash` at any point. There is concurrent work in this tree (modified files under
    `.planning/phases/32-*` and `meta/`, plus untracked directories under `.planning/quick/`). An
    executor `git stash` has stranded a concurrent session's work in this repo twice. Do not clean,
    revert or compare against a clean tree.
  </how-to-verify>
  <acceptance_criteria>
    - The SUMMARY records, for step 1, whether 91310 appeared: yes/no, with the observed grid state.
    - The SUMMARY quotes the badge text observed in step 2 VERBATIM. "Looks right" is not acceptable.
    - Steps 3 and 4 are recorded as separate outcomes — the library screen and Console Mode are two independent readers and 37-03a fixed them separately.
    - Step 5 records four observations: row present and unchecked, no chip on virgin state, hide removes 91310, chip x restores it.
    - Step 6 records the header count at first paint as a raw number with the note that it is a cross-store union and that REQ-37-02 explains 9 of the 22.
    - The run was performed after a full app quit and relaunch under `pnpm tauri:dev`. The SUMMARY states this explicitly.
    - Any FAIL is recorded as a FAIL with its observation, not smoothed into a partial pass.
  </acceptance_criteria>
  <files>(no files modified — observation only; record findings in 37-03b-SUMMARY.md)</files>
  <action>Observe and record. Do not modify code during this run. If a step FAILS, stop and record the observation verbatim — this gate exists because a green suite has beaten a live gate three separate times in this repo, so a failure here outranks the suite and must open a gap rather than be patched mid-session. Do not `git stash`, clean or revert anything: concurrent work is present in this tree.</action>
  <verify>
    <automated>MISSING BY DESIGN — 37-VALIDATION.md's Manual-Only table binds rows 1, 2 and 3 to this run; no `testEnvironment: 'node'` suite can observe a rendered grid, a launch, or an i18next-resolved label. The automated precondition, which must be green before this task is entered, is `npx jest src/frontend/screens/Library/ src/frontend/components/UI/NavShell/ meta/__tests__/ --silent`.</automated>
  </verify>
  <done>All three Manual-Only rows are discharged in one clean-restart session, with the badge text quoted verbatim and the first-paint header count recorded as a raw number.</done>
  <resume-signal>Type "approved" with the recorded observations, or describe what failed.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage -> renderer | `no_store_page` is read back from browser-local storage into a typed union that drives filtering |
| catalog file -> rendered UI | `gamelib.json` values are interpolated into user-visible labels |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-37-08 | Tampering | `readNoStorePageMode` reads an untyped `localStorage` string into `NoStorePageMode` | mitigate | The reader accepts ONLY the three literals `'off' | 'only' | 'hide'` and falls back to `'off'` for anything else, including a legacy `'show'`. This mirrors `migrateFilterMode`'s existing discipline. A deliberately separate validator is used rather than widening the existing one, so the two unions cannot silently accept each other's values. |
| T-37-09 | Information Disclosure | The badge and chip render text derived from a catalog file | accept | The values are static English strings authored in-repo; no user or network data is interpolated. `{{count}}` is avoided as an interpolation name (reserved by i18next). No new interpolation is introduced by this plan at all. |
| T-37-SC | Tampering | npm/pip/cargo installs | n/a | This plan installs zero packages. `37-RESEARCH.md` § Package Legitimacy Audit records the phase as install-free. |

**Not a security boundary:** this is a client-side filter-UI change. Per `37-RESEARCH.md` § Security
Domain, V5 Input Validation applies to 37-10 ONLY; V2 Authentication, V3 Session Management,
V4 Access Control and V6 Cryptography are all untouched here. Per D-14 the "Install with options…"
doors in `src/frontend/helpers/steamInstallOptionsEntry.ts` stay CLOSED and that file is not in this
plan's `files_modified`.
</threat_model>

<verification>
- `npx jest src/frontend/screens/Library/ src/frontend/components/UI/NavShell/ meta/__tests__/ --silent` — Library, NavShell and meta gates green.
- `npx tsc --noEmit -p tsconfig.json` — clean. ts-jest is TRANSPILE-ONLY and cannot see type errors.
- `npx eslint src/frontend/screens/Library/filterEngine.ts src/frontend/screens/Library/index.tsx src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx src/frontend/screens/Library/components/GameCard/index.tsx src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts -f json` — zero entries with `severity === 2`. A `tsc`-only gate in this repo once passed code CI lint rejected.
- `git status --short public/locales/` lists only `public/locales/en/gamelib.json`.
- `pnpm test:ci` at end of wave.
- Task 4's live gate is BLOCKING and is the only thing that closes REQ-37-02.
</verification>

<success_criteria>
- A "No store page" row exists inside More filters with states off / only / hide, defaulting to off.
- On a virgin library the row emits no descriptor, no chip and no group-badge count.
- `MORE_FILTER_KINDS` and `describeActiveFilters` both carry six More filters, pinned by the tripwire.
- The card badge and the row label both read "No store page" from non-empty `gamelib.json` keys.
- Only `public/locales/en/gamelib.json` changed under `public/locales/`.
- Dead Island (91310) renders, launches, and appears in Console Mode after a full clean restart, with the header count at first paint recorded.
</success_criteria>

<output>
Create `.planning/phases/37-steam-defect-cluster-depot-decode-failure-false-delisted-gam/37-03b-SUMMARY.md` when done.
</output>
