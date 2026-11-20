---
quick_id: 260815-opt
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
  - src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts
  - src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx
  - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterFacetGroup.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts
  - src/frontend/components/UI/NavShell/__tests__/facetGroupBadgeStyles.test.ts
  - src/frontend/components/UI/NavShell/__tests__/FilterStoreFacet.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterRunnabilityFacet.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/components/LibraryHeader/index.tsx
  - src/frontend/screens/Library/components/LibraryHeader/index.css
  - src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
  - src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
  - public/locales/en/gamelib.json

must_haves:
  truths:
    - "A collapsed Store / Runnability / More-filters group header shows a numeric badge when that group holds active selections, and shows nothing when it holds none."
    - "The badge number for each group comes from activeFilterDescriptors, not from a second re-derivation of what counts as active."
    - "With no filters active, the library header renders exactly what it renders today."
    - "With at least one filter active, the library header renders a filtered-vs-total form whose denominator equals the count that would show with every filter cleared."
  artifacts:
    - path: "src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts"
      provides: "Pure descriptor-kind counter shared by all three facet groups"
    - path: "src/frontend/screens/Library/components/LibraryHeader/gameCount.ts"
      provides: "Pure DLC-excluding game counter used for BOTH numerator and denominator"
    - path: "src/frontend/components/UI/NavShell/__tests__/facetGroupBadgeStyles.test.ts"
      provides: "sass-compiled emitted-selector gate for the badge rule (Dropdown cascade hazard)"
  key_links:
    - from: "FilterStoreFacet / FilterRunnabilityFacet / FilterMoreGroup"
      to: "FilterFacetGroup selectedCount prop"
      via: "countDescriptorsOfKind(activeFilterDescriptors, ...)"
    - from: "src/frontend/screens/Library/index.tsx"
      to: "LibraryHeader totalGames prop"
      via: "filterLibrary(libraryUnion, DEFAULT_FILTER_ENGINE_STATE, engineDeps)"
---

<objective>
Two library-filter visibility fixes, both about telling the user that filtering is
happening at all.

1. **Collapsed facet groups are silent.** `FilterFacetGroup` renders a title + caret and
   nothing else, so a collapsed `Store` group with two stores ticked looks identical to an
   untouched one. Add a selection badge to the header.

2. **The library header has no denominator.** `LibraryHeader` renders `numberOfGames` --
   the count of the ALREADY-FILTERED `libraryToShow` -- beside a title that always reads
   "All Games". `42` beside "All Games" is indistinguishable from a 42-game library.
   Render a filtered-vs-total form when, and only when, filters are active.

Purpose: close the "why am I looking at 6 games instead of 214?" gap that
`sketch-findings-gamelib` names as the decisive argument for the chip row -- the chip row
answers it for the grid, but the panel's collapsed groups and the header count still do not.

Output: a badge prop on the shared group primitive, three wired callers, a filtered-vs-total
header count, two new i18n keys, and five test surfaces including an emitted-selector gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/sketch-findings-gamelib/references/library-filtering.md

Source files this plan touches are enumerated in `files_modified`. Read each once before
editing; do not re-read a range already in context.
</context>

<standing_constraints>
Carried in from prior incidents on this codebase. NOT to be rediscovered, re-litigated, or
"simplified".

**C1 -- `git stash` and `git checkout -- <file>` are FORBIDDEN, no exceptions.**
A concurrent session holds uncommitted work in this shared working tree
(`src/frontend/screens/Library/components/InstallModal/index.tsx` is currently modified and
is NOT part of this task -- do not touch, stage, or commit it). Additionally
`.husky/post-checkout` runs a binary download that fails deterministically, so any checkout
operation is hard-blocked. Every revert in this plan (there are several deliberate-breakage
mutations) is performed by a direct `Edit` back to the recorded original text, verified with
`diff` against a scratchpad copy taken BEFORE the mutation.

**C2 -- `Dropdown/index.scss` cascade hazard (two prior recurrences).**
`FilterFacetGroup` renders through `components/UI/Dropdown`. Dropdown's stylesheet styles
its panel's CONTENTS, and has already out-specified two new row primitives
(`.FilterFacetRow`, then `.NavItem`). Its dangerous rules are `.dropdownContainer .dropdown`
(0,2,0), `.dropdownContainer .dropdown button` (0,2,1), and `.dropdownContainer .button`
(0,2,0) -- the last of which matches ANY descendant carrying class `.button`. Any new
element must out-specify **by class count, not source order**: the two stylesheets are
imported by different components, so source order is not under this task's control. Task 1
ships a gate that COMPILES the SCSS with `sass` and inspects the EMITTED selector rather
than assuming the rule wins. Do not name any new element `.button`.

**C3 -- `FilterFacetGroup` is deliberately pure presentation.**
Its header comment states: no context read, no translation hook, no string literals; every
caller supplies already-translated labels. PRESERVE THAT CONTRACT. The count arrives as a
prop. Any new user-facing string is authored at the CALLER. A bare integer rendered as a
text child is data, not copy, and does not violate this.

**C4 -- i18n extraction.** i18next-parser's JavascriptLexer only resolves STRING-LITERAL
arguments to `t()` / `tGamelib()`. A variable key is invisible to the extractor; a literal
key with a non-literal default extracts an EMPTY default, and once the key exists in the
bundle i18next renders that empty value instead of the call-site default -- i.e. blank UI
text. Every new key needs a literal key AND a literal default at every call site. See the
comment blocks in `FilterChipRow/index.tsx` and `FilterRunnabilityFacet/index.tsx`.

**C5 -- Never rename a label by editing the `t()` DEFAULT argument.** i18next reads the 2nd
arg only on a MISSING key. Both strings this plan adds are therefore NEW keys. Do not reuse
`title.allGames`, any `header.*` key, or any existing `library.filterPanel.*` key with new
text.

**C6 -- `count` is a RESERVED interpolation name in i18next** (it triggers plural key
resolution, `_one` / `_other`). Neither new key may use `{{count}}`. Use `{{selected}}`,
`{{shown}}`, `{{total}}`.

**C7 -- Every assertion must be proven to FAIL against a known-bad input, and `ts-jest` in
this repo is TRANSPILE-ONLY** (`tsconfig.json` sets `isolatedModules: true`). A "RED proof"
that relies on a TYPE error is VACUOUS -- the diagnostic never surfaces as a jest failure.
Every RED proof in this plan is runtime or behavioural.

**C8 -- No jsdom, no react-test-renderer in this project** (`testEnvironment: 'node'`).
Components are tested by DIRECT INVOCATION as plain functions, inspecting the returned
React-element object graph, with colocated stylesheets and heavy children `jest.mock`ed --
see `FilterFacetGroup.test.tsx` / `FilterStoreFacet.test.tsx` for the exact idiom.
Components with a large transitive import graph (`LibraryHeader`, `Library/index.tsx`) are
covered by comment-stripped SOURCE gates instead -- see `downloadsRingStyles.test.ts` and
`backend/testUtils/stripSourceComments`.

**C9 -- theme-token survival.** An undefined custom property with no fallback drops the
ENTIRE declaration at computed-value time, silently, in whichever theme lacks it. Inside
`FilterFacetGroup/index.scss`, reuse the file-local `--filter-active-color` chain already
declared on `.NavShell__tier2Portal` -- do NOT redeclare it and do NOT introduce a bare
`--navbar-active` consumer (that would trip `themeTokens.test.ts`'s census). Outside that
file, `--accent` is the only colour token confirmed to resolve in all 11 theme blocks.
Introduce NO new hard-coded colours and NO new foreground/background contrast pair.

**C10 -- OUT OF SCOPE, explicitly deferred by the user.** Do not hoist or make sticky the
`FilterChipRow`. Do not add a badge to the Games nav tab. Do not auto-expand groups that
have selections. Do not modify, relocate or restyle `FilterChipRow` or `FilterZeroResult`.
</standing_constraints>

<design_decisions>
Decided during planning from the source and from `sketch-findings-gamelib`. The executor
implements these; it does not re-open them.

**D1 -- the group indicator is a NUMBER, not a dot.** The panel's established idiom is
counts (`FilterFacetRow__count`; sketch 004's `.item .ct`). A dot would be a second, weaker
vocabulary in the same 204px column. `2` on the `STORE` header reads immediately against the
row counts beneath it, and it answers "how many", which a dot cannot.

**D2 -- the badge is coloured TEXT, never a filled pill.** A filled accent pill needs a
legible foreground ON the accent fill, which is a NEW contrast pair across 11 themes -- the
exact class of regression this project has been burned by repeatedly (C9; the CR-03 incident
documented in `FilterFacetGroup/index.scss`'s own header comment, where the checked-checkbox
fill silently stopped painting in 7 of 11 themes). Bold accent-coloured text on the panel
background reuses `.FilterFacetRow--checked`'s ALREADY-SHIPPED, already-live-swept
`color: var(--filter-active-color)` relationship verbatim. Zero new contrast pairs.

**D3 -- the badge number comes from `activeFilterDescriptors`, not from `storeFacet.length`
or a hand-rolled More-filters tally.** `describeActiveFilters` is the single declared source
of truth for "what is active" (34.11 D-26; `FilterChipRow`'s header comment states the rule
outright). `storeFacet.length` happens to agree today, but a hand-rolled five-term boolean
tally in `FilterMoreGroup` would be a second implementation that can drift from the chips.
All three groups therefore go through one pure helper keyed on
`ActiveFilterDescriptor['kind']`.

**D4 -- no new `LibraryContext` field is needed, and none is added.**
Verified per-file: `FilterStoreFacet` (lines 19-20), `FilterRunnabilityFacet` (lines 71-72)
and `FilterMoreGroup` (lines 19-30) all already `useContext(LibraryContext)`.
`activeFilterDescriptors` is already declared on `LibraryContextType`
(`frontend/types.ts:342`), already supplied by the real provider (`Library/index.tsx:917`)
and already present in `initialContext` (`LibraryContext.tsx:67`). This task therefore adds
NOTHING to `LibraryContext.tsx`, `frontend/types.ts`, or the provider value object.

**D5 -- the header denominator is "what would show with every filter cleared", not
`libraryUnion.length`.** `libraryUnion` includes hidden and non-available games the default
state never displays, so `of 318` would name a number the user can never reach. Running
`filterLibrary` once against a DEFAULT engine state gives a denominator exactly reachable by
clicking `Clear all` -- that self-consistency IS the feature. It also yields a load-bearing,
RED-provable invariant tying the denominator to the gate:
`describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '')` must return `[]`, i.e. the state
that produces the denominator is by construction the state in which `activeFilterCount === 0`
and the new form is not rendered at all.

**D6 -- numerator and denominator share ONE counting function.** Today's numerator excludes
DLC (`lib.runner !== 'sideload' && lib.install.is_dlc`). A denominator not applying the same
exclusion could print `42 of 41`. Both go through `countGamesExcludingDlc`.

**D7 -- the header title text is NOT changed.** "All Games" / "Favourites" stay. The
denominator is the discriminator the user asked for, `FilterChipRow` sits directly beneath
enumerating every active filter by name, and rewriting the title would collide with the
`showFavourites` branch for no added information.

**D8 -- the alphabet filter is deliberately NOT in the denominator.** `AlphabetFilter` is
applied inside `libraryToShow` AFTER the engine and contributes no `ActiveFilterDescriptor`,
so with only a letter selected `activeFilterCount === 0` and today's rendering is preserved
unchanged. With a letter AND a facet, the numerator is letter-narrowed while the denominator
is the full unfiltered count. This is accepted and is the correct reading of "showing N of
your M games". Record it in the header comment; do not "fix" it.
</design_decisions>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Selection badge on the shared facet-group primitive</name>
  <files>
src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx
src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
src/frontend/components/UI/NavShell/components/FilterFacetGroup/selectionCount.ts
src/frontend/components/UI/NavShell/__tests__/FilterFacetGroup.test.tsx
src/frontend/components/UI/NavShell/__tests__/facetSelectionCount.test.ts
src/frontend/components/UI/NavShell/__tests__/facetGroupBadgeStyles.test.ts
  </files>

  <behavior>
`selectionCount.ts` (new, pure -- zero React, only a `type`-only import of
`ActiveFilterDescriptor` from `frontend/types`):
  - `MORE_FILTER_KINDS` -- a `readonly` tuple of exactly the five More-filters descriptor
    kinds: `'showHidden'`, `'showNonAvailable'`, `'showSupportOfflineOnly'`,
    `'showThirdPartyManagedOnly'`, `'showUpdatesOnly'`.
  - `countDescriptorsOfKind(descriptors, kinds)` -- how many entries of `descriptors` have a
    `kind` present in `kinds`.
    - empty descriptor list -> 0
    - non-matching kinds only -> 0
    - `[store, store, runnability]` asked for `['store']` -> 2
    - `[store, store, runnability]` asked for `['runnability']` -> 1
    - `[showHidden, showUpdatesOnly, search]` asked for `MORE_FILTER_KINDS` -> 2
    - `MORE_FILTER_KINDS` has exactly 5 entries, no duplicates (guard: this tuple is a
      manual transcription of `describeActiveFilters`'s More branches and can drift).

`FilterFacetGroup` (direct-invocation element-graph specs, extending the existing suite):
  - `selectedCount` omitted -> the Dropdown `title` fragment has exactly the two children it
    has today (title span, caret) and no element with className `FilterFacetGroup__badge`.
  - `selectedCount={0}` -> still NO badge element (a group with nothing selected is silent).
  - `selectedCount={3}` -> a badge element exists, its text child is the NUMBER `3` (not the
    string `'3'`), and it sits BETWEEN the title span and the caret in the children array.
  - `selectedCount={3}` + `selectedCountLabel='3 selected'` -> the badge's `aria-label` and
    `title` are both `'3 selected'` and its `role` is `'img'`.
  - `selectedCount={3}` with `selectedCountLabel` omitted -> the badge's `aria-label` and
    `title` are `undefined` (C3: this file authors no copy of its own).

`facetGroupBadgeStyles.test.ts` (emitted-selector gate -- the C2 control):
  - Compiles `FilterFacetGroup/index.scss` through the `sass` package and asserts against the
    EMITTED CSS, not the source text.
  - A selector for `.FilterFacetGroup__badge` is emitted.
  - That selector carries at least THREE class components (`.NavShell__tier2Portal`,
    `.FilterFacetGroup`, `.FilterFacetGroup__badge`) -- strictly more than the (0,2,1) of
    `.dropdownContainer .dropdown button` and the (0,2,0) of `.dropdownContainer .dropdown`,
    so it wins on class count regardless of source order.
  - A selector for `.FilterFacetGroup__title` is emitted and likewise carries >= 3 class
    components.
  - No emitted selector in this stylesheet contains `.button` as a whole class token
    (guards against `.dropdownContainer .button { padding-inline: 2rem }`).
  - The badge rule's declaration block contains `var(--filter-active-color)` and contains NO
    bare `var(--navbar-active` occurrence (C9 / `themeTokens.test.ts` census).
  </behavior>

  <action>
Read all six files first (three are new and do not exist yet).

**Create `selectionCount.ts`** implementing D3's helper exactly as specified in
`<behavior>`. Use a `type`-only import so the module stays runtime-free. Header comment:
this is the ONLY place a facet group derives "how many of my filters are active"; its input
is `describeActiveFilters`'s output rather than the raw facet arrays; and why (D3 -- a second
tally can disagree with the chip row).

**Extend `FilterFacetGroup/index.tsx`:**
  - Add `selectedCount?: number` and `selectedCountLabel?: string` to
    `FilterFacetGroupProps`. Both optional, so existing callers keep compiling.
  - Inside the `title` fragment, BETWEEN the `FilterFacetGroup__title` span and the
    `FontAwesomeIcon` caret, render -- only when
    `selectedCount !== undefined && selectedCount > 0` -- a
    `<span className="FilterFacetGroup__badge" role="img" aria-label={selectedCountLabel} title={selectedCountLabel}>{selectedCount}</span>`.
  - Comment why `role="img"` is present: it is the one-element pattern that gives a bare
    numeral an accessible name; a `<span>` carrying `aria-label` with no role is not
    reliably exposed. And comment why the label is a PROP rather than a `t()` call here (C3).
  - Extend the file header comment: the pure-presentation contract is UNCHANGED -- the
    number is data, the label arrives already translated.
  - Do NOT add `useTranslation`, `useContext`, or any string-literal copy to this file.

**Extend `FilterFacetGroup/index.scss`** -- new rules go INSIDE the existing
`.NavShell__tier2Portal { ... }` block, beside the existing `.FilterFacetGroup ...` rules:
  - `.FilterFacetGroup .FilterFacetGroup__title` -- `flex: 1 1 auto; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: start;`
    This is REQUIRED, not cosmetic: `.dropdownButton` is `display: flex` with
    `justify-content: space-between`, so a third child would otherwise be spaced apart from
    the caret rather than sitting beside it. Making the title the flexible child absorbs the
    free space and keeps badge + caret together at the end. Say exactly this in the comment.
  - `.FilterFacetGroup .FilterFacetGroup__badge` -- `flex: 0 0 auto;
    margin-inline-end: var(--space-2xs); font-size: var(--text-xs);
    font-weight: var(--bold); font-variant-numeric: tabular-nums; line-height: 1;
    color: var(--filter-active-color);`
  - Both rules carry the `.FilterFacetGroup` ancestor for the (0,3,0) class count. Comment
    it the way the existing `.FilterFacetGroup .FilterFacetRow` rule is commented: the
    ordering-independence is the point, since Dropdown's stylesheet is imported by a
    different component.
  - `--filter-active-color` is REUSED from the block's existing declaration. Do not
    redeclare it. Do not write a bare `var(--navbar-active)` anywhere (D2 / C9).
  - `font-variant-numeric: tabular-nums` matches `.FilterFacetRow__count` and stops the
    badge jittering as the number changes.

**Write the three test surfaces.** In `facetGroupBadgeStyles.test.ts`, compile with the
`sass` package's synchronous API (`sass.compile(STYLESHEET_PATH).css`) -- `sass@1.89.0` is
already a devDependency and this stylesheet is self-contained (no `@use` / `@import`), so it
compiles standalone. If the package's own types do not resolve under this project's tsconfig,
use `require('sass')` with a locally declared minimal signature plus a targeted eslint
disable. Do NOT add a dependency, and do NOT shell the compile through a pipe -- an
`esbuild ... | node -`-style pipeline swallows the non-zero exit and would report SUCCESS on
a compile failure. Parse the emitted CSS by splitting on `}` and reading each selector
prelude; count class components with a `/\.[A-Za-z_-][\w-]*/g` match.

**RED PROOFS** (runtime/behavioural per C7 -- run each BEFORE the corresponding
implementation and record the observed failure output):
  1. Run `facetSelectionCount.test.ts` before creating `selectionCount.ts`. Expect module
     resolution / "is not a function" failures naming both exports.
  2. Run the new `FilterFacetGroup` badge specs before editing `index.tsx`. Expect the
     badge-present specs to FAIL while the `selectedCount` omitted / `=0` specs PASS -- that
     split is itself the discriminator and must be recorded; two specs passing in RED is
     expected here, not a smell.
  3. Run `facetGroupBadgeStyles.test.ts` before editing `index.scss`. Expect the badge and
     title selector assertions to FAIL.

**NON-VACUITY MUTATION (mandatory -- this is the C2 control).** After GREEN, take a
scratchpad copy of `index.scss`, then temporarily rewrite the badge rule WITHOUT its
`.FilterFacetGroup` ancestor (i.e. a bare `.FilterFacetGroup__badge { ... }`, making it
(0,2,0)). Re-run `facetGroupBadgeStyles.test.ts` and confirm the class-count assertion
FAILS. Revert by direct `Edit` back to the recorded text and confirm `diff` against the
scratchpad copy is empty. NEVER `git checkout`, NEVER `git stash` (C1). Record the observed
failing spec name.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --config src/frontend/jest.config.js --testPathPattern "(FilterFacetGroup|facetSelectionCount|facetGroupBadgeStyles)" && npx tsc --noEmit</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && node_modules/.bin/sass src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss | grep -v '^ *\/\*' | grep -c "NavShell__tier2Portal .FilterFacetGroup .FilterFacetGroup__badge"</automated>
  </verify>

  <done>
`selectionCount.ts` exists and is pure. `FilterFacetGroup` accepts `selectedCount` /
`selectedCountLabel`, renders the badge only when the count is > 0, and still contains no
`useTranslation`, no `useContext` and no user-facing string literal. The emitted badge and
title selectors each carry >= 3 class components. All three RED proofs and the specificity
mutation are recorded with their observed failing spec names. `npx tsc --noEmit` clean and
`npx eslint` clean on the touched files.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the three facet-group callers to the badge</name>
  <files>
src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx
src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx
src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx
src/frontend/components/UI/NavShell/__tests__/FilterStoreFacet.test.tsx
src/frontend/components/UI/NavShell/__tests__/FilterRunnabilityFacet.test.tsx
src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx
public/locales/en/gamelib.json
  </files>

  <behavior>
For each of the three callers, with `activeFilterDescriptors` supplied by the mocked
`LibraryContext` value:
  - Descriptor list empty -> `FilterFacetGroup` receives `selectedCount` `0` (so no badge
    renders) and every OTHER prop is unchanged from today.
  - `FilterStoreFacet` given `[{kind:'store'},{kind:'store'},{kind:'runnability'}]` ->
    receives `selectedCount` `2`.
  - `FilterRunnabilityFacet` given that same list -> receives `selectedCount` `1`.
  - `FilterMoreGroup` given `[{kind:'showHidden'},{kind:'showUpdatesOnly'},{kind:'store'}]`
    -> receives `selectedCount` `2`.
  - Each caller passes a non-empty `selectedCountLabel` string when its count is > 0, and
    `undefined` when it is 0.
  - Pre-existing regression guards stay green and are NOT modified: `FilterStoreFacet` still
    returns `null` when `connectedStores` is empty; `FilterRunnabilityFacet` still returns
    `null` when `runnabilityRows` is empty.
  </behavior>

  <action>
Read the three caller components and their three existing test files first.

**Add ONE new i18n key**, used by all three callers:
```
key:     gamelib:library.filterPanel.groupSelectedCount
default: {{selected}} selected
```
Every call site must be a LITERAL key + LITERAL default (C4). Use `{{selected}}`, NOT
`{{count}}` (C6: `count` triggers i18next plural key resolution and would look for
`groupSelectedCount_one` / `_other`, which do not exist, producing a missing-key render).
Three identical literal call sites -- one per caller -- is correct and intended; do NOT
factor the call into a helper that takes the key as a variable, which is precisely what the
extractor cannot see.

**In each caller:**
  - Import `countDescriptorsOfKind` (plus `MORE_FILTER_KINDS` in `FilterMoreGroup`) from
    `../FilterFacetGroup/selectionCount`.
  - Pull `activeFilterDescriptors` out of the EXISTING `useContext(LibraryContext)`
    destructure. These three files already read `LibraryContext` (verified: lines 19-20,
    71-72 and 19-30 respectively), so this adds no new context field anywhere (D4). Do NOT
    touch `LibraryContext.tsx`, `frontend/types.ts`, or the provider value in
    `Library/index.tsx` in this task.
  - Compute `const selectedCount = countDescriptorsOfKind(activeFilterDescriptors, [...])`
    with `['store']`, `['runnability']` and `MORE_FILTER_KINDS` respectively.
  - Pass to `FilterFacetGroup`:
    `selectedCount={selectedCount}` and
    `selectedCountLabel={selectedCount > 0 ? tGamelib('gamelib:library.filterPanel.groupSelectedCount', '{{selected}} selected', { selected: selectedCount }) : undefined}`
  - `FilterMoreGroup` already has both `t` and `tGamelib` in scope; `FilterStoreFacet` and
    `FilterRunnabilityFacet` already have `tGamelib`. No new hook in any of them.
  - Add a one-line comment at each site naming D3: the number comes from the descriptor
    list, never from `storeFacet.length` or a local boolean tally, so it cannot disagree
    with the chip row.

**Catalog:** run `pnpm i18n` and commit ONLY the delta for the new key. This repo has a
known catalog-drift problem -- inspect the FULL diff and revert any hunk unrelated to
`groupSelectedCount` (and to Task 3's key if the runs are combined) by direct `Edit`, never
by `git checkout` (C1). `meta/i18nGateScope.json` needs NO regeneration: all three caller
files are already listed in it, and `selectionCount.ts` contains no `t()` call. Do not run
`pnpm gen-i18n-gate-scope` -- a full regeneration risks sweeping in the concurrent session's
unrelated edits.

**RED PROOF (C7):** run the three extended suites BEFORE editing the callers. Expect the
`selectedCount` assertions to fail with `undefined` received, in all three files. Record the
failed/passed spec counts per file -- pre-existing specs must stay green in RED.

**NON-VACUITY MUTATION:** after GREEN, take a scratchpad copy of `FilterMoreGroup/index.tsx`,
temporarily replace its
`countDescriptorsOfKind(activeFilterDescriptors, MORE_FILTER_KINDS)` call with the literal
`0`, and confirm ONLY the `FilterMoreGroup` count specs fail while `FilterStoreFacet` and
`FilterRunnabilityFacet` stay green. Revert by direct `Edit`; confirm `diff` against the
scratchpad copy is empty.
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --config src/frontend/jest.config.js --testPathPattern "(FilterStoreFacet|FilterRunnabilityFacet|FilterMoreGroup)" && npx tsc --noEmit</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -c "groupSelectedCount" public/locales/en/gamelib.json && grep -l "countDescriptorsOfKind" src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx src/frontend/components/UI/NavShell/components/FilterRunnabilityFacet/index.tsx src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.tsx | wc -l | grep -q 3</automated>
  </verify>

  <done>
All three groups pass a descriptor-derived `selectedCount` and an already-translated
`selectedCountLabel`. `groupSelectedCount` is present in `public/locales/en/gamelib.json`
with the `{{selected}} selected` default and no `{{count}}` anywhere. No file outside
`files_modified` is touched -- specifically `LibraryContext.tsx`, `frontend/types.ts` and
`meta/i18nGateScope.json` are unchanged. RED proof and the `FilterMoreGroup` mutation are
recorded with observed spec counts.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Filtered-vs-total denominator in the library header</name>
  <files>
src/frontend/screens/Library/filterEngine.ts
src/frontend/screens/Library/components/LibraryHeader/gameCount.ts
src/frontend/screens/Library/components/LibraryHeader/index.tsx
src/frontend/screens/Library/components/LibraryHeader/index.css
src/frontend/screens/Library/index.tsx
src/frontend/screens/Library/__tests__/libraryHeaderVisibility.test.ts
public/locales/en/gamelib.json
  </files>

  <behavior>
`filterEngine.DEFAULT_FILTER_ENGINE_STATE` (new export) and `gameCount.ts` (new pure
module) -- direct unit specs:
  - `DEFAULT_FILTER_ENGINE_STATE` has `view: 'all'`, `collection: null`, `stores: []`,
    `runnability: []`, `searchMatchedKeys: null`, `showHidden: 'off'`,
    `showNonAvailable: 'off'`, and all three booleans `false`.
  - **The load-bearing invariant (D5):**
    `describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '')` returns `[]`. This is what ties
    the denominator to the `activeFilterCount > 0` gate: the state producing the denominator
    is exactly the state in which the new form does not render.
  - `filterLibrary(union, DEFAULT_FILTER_ENGINE_STATE, deps)` over a fixture union
    containing one hidden game and one non-available game returns the union MINUS those two
    -- i.e. the denominator is reachable, not `union.length`.
  - `countGamesExcludingDlc([])` -> 0.
  - `countGamesExcludingDlc(undefined)` and `(null)` -> 0 (today's `if (!list) return 0`).
  - A 5-entry list with 2 non-sideload DLC entries -> 3.
  - A sideload entry whose `install.is_dlc` is `true` is COUNTED (today's predicate is
    `lib.runner !== 'sideload' && lib.install.is_dlc`) -- transcribe the rule, do not
    "improve" it.
  - An entry whose `install` object has no `is_dlc` key does not throw and is counted.

`LibraryHeader` + `Library/index.tsx` -- comment-stripped SOURCE gates (C8: both have import
graphs too large to invoke directly; use `stripSourceComments` from
`backend/testUtils/stripSourceComments`, and prove the stripper itself is load-bearing
against an inline specimen before relying on it):
  - `LibraryHeader/index.tsx` reads `activeFilterCount` from `LibraryContext`.
  - It contains the literal token `activeFilterCount > 0` (the gate).
  - It contains the literal key `'gamelib:library.header.filteredOfTotal'` and the literal
    default `'{{shown}} of {{total}}'`.
  - It contains NO `{{count}}` token (C6).
  - It calls `countGamesExcludingDlc` and contains NO remaining inline
    `install.is_dlc` filter (proving the numerator moved to the shared helper, D6).
  - `Library/index.tsx` passes `totalGames=` to `<LibraryHeader` and derives it via
    `DEFAULT_FILTER_ENGINE_STATE`.
  - Each gate is proven against an executable known-bad specimen string, not only against
    the real file.
  </behavior>

  <action>
Read all files first. `Library/index.tsx` is large -- read only the ranges you need
(`grep -n` first, then `Read` with `offset`/`limit`): the `engineState` memo (~line 705),
the `gridPipeline` memo (~line 749), the `activeFilterDescriptors` memo (~line 828), and the
`<LibraryHeader list={libraryToShow} />` call site (~line 954).

**1. `filterEngine.ts`** -- add an exported `DEFAULT_FILTER_ENGINE_STATE: FilterEngineState`
constant beside `describeActiveFilters`. Comment it as D5's denominator state and state the
invariant it must satisfy (`describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '')` is `[]`)
so a future field added to `FilterEngineState` without a default here is caught by the test,
not by a user. Change nothing else in this file.

**2. `gameCount.ts`** (new, pure, no React) -- export
`countGamesExcludingDlc(list: GameInfo[] | undefined | null): number`, transcribing
`LibraryHeader`'s current `numberOfGames` rule VERBATIM: `if (!list) return 0`, subtract
entries where `lib.runner !== 'sideload' && lib.install.is_dlc`. Header comment: this is the
single counting function for BOTH numerator and denominator (D6) and why -- a denominator
that skipped the DLC exclusion could print `42 of 41`.

Note in the comment that today's expression returns `` `${total}` `` for `total > 0` and the
number `0` otherwise, while this helper always returns a number: the rendered output is
byte-identical in both branches (React renders `0` and `'0'` identically), so the unfiltered
path is unchanged. State this explicitly so nobody "restores" the string form.

**3. `Library/index.tsx`** -- add ONE memo beside the existing `activeFilterDescriptors`
memo:
```
const unfilteredGameCount = useMemo(
  () => countGamesExcludingDlc(
    filterEngine.filterLibrary(libraryUnion, filterEngine.DEFAULT_FILTER_ENGINE_STATE, engineDeps)
  ),
  [libraryUnion, engineDeps]
)
```
and pass `<LibraryHeader list={libraryToShow} totalGames={unfilteredGameCount} />`.
Do NOT modify `buildGridPipeline` or `engineWiring.ts` -- that seam is heavily gated by
`engineWiring.test.ts` and CR-01's comment block, and this denominator is deliberately a
separate call that skips no stage. Comment the memo with D5's reasoning and D8's accepted
alphabet-filter nuance. Do not touch the provider value object.

**4. `LibraryHeader/index.tsx`:**
  - Add `totalGames: number` to `Props` (required -- an optional prop would silently render
    `of undefined`). There is exactly one call site; confirm with
    `grep -rn "<LibraryHeader" src/frontend`.
  - Pull `activeFilterCount` out of the existing `useContext(LibraryContext)` destructure
    (the file already imports and reads `LibraryContext` for `showFavourites`).
  - Add `const { t: tGamelib } = useTranslation('gamelib')` alongside the existing `t` --
    the same dual-hook pattern `FilterChipRow` already uses.
  - Replace the `numberOfGames` memo body with
    `useMemo(() => countGamesExcludingDlc(list), [list])`.
  - Render:
    - when `activeFilterCount === 0`: `<span className="numberOfgames">{shown}</span>` --
      today's exact element, class and content.
    - when `activeFilterCount > 0`:
      `<span className="numberOfgames numberOfgames--filtered">{tGamelib('gamelib:library.header.filteredOfTotal', '{{shown}} of {{total}}', { shown, total: totalGames })}</span>`
  - `library.header.filteredOfTotal` is a NEW key (C5 -- do not reuse `title.allGames` or
    any `header.*` key). `{{shown}}` / `{{total}}`, never `{{count}}` (C6).
  - Leave the title text, the sync spinner, the stale indicator and `AddGameButton`
    untouched (D7).

**5. `LibraryHeader/index.css`** -- add ONLY:
```
.numberOfgames--filtered {
  font-variant-numeric: tabular-nums;
}
```
Deliberately NO colour change (D2 / C9): the base `.numberOfgames` already paints
`var(--input-background)` behind inherited text, and recolouring the foreground would create
a new contrast pair to validate in 11 themes for no informational gain -- the string
"42 of 318" is itself the signal. `tabular-nums` stops the pill resizing as the numerator
changes. Introduce no new custom property and no hard-coded colour.

**6. Catalog:** run `pnpm i18n`; commit only the `filteredOfTotal` delta, reverting unrelated
drift by direct `Edit`. `LibraryHeader/index.tsx` and `Library/index.tsx` are already in
`meta/i18nGateScope.json`; `gameCount.ts` has no `t()` call, so no regeneration.

**RED PROOFS (C7 -- runtime/behavioural, never type-based):**
  1. Run the `DEFAULT_FILTER_ENGINE_STATE` / `countGamesExcludingDlc` specs before creating
     either -- expect "is not a function" / `undefined` property failures naming both.
  2. Run the source gates before editing `LibraryHeader/index.tsx` and `Library/index.tsx`
     -- expect every new-token gate to FAIL and the "no inline `install.is_dlc`" gate to
     FAIL (the inline filter is still there).
  3. Prove the comment stripper is load-bearing: assert that a specimen containing
    `activeFilterCount > 0` inside BOTH a `//` comment and a `/* */` comment does NOT
    satisfy the gate.

**NON-VACUITY MUTATION:** after GREEN, scratchpad-copy `LibraryHeader/index.tsx`, then
temporarily delete the `activeFilterCount > 0` gate so the filtered form renders
unconditionally. Confirm the gate spec FAILS. Revert by direct `Edit`; `diff` against the
scratchpad copy must be empty. NEVER `git checkout` / `git stash` (C1).
  </action>

  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --config src/frontend/jest.config.js --testPathPattern "(libraryHeaderVisibility|filterEngine|libraryPipeline|engineWiring)" && npx tsc --noEmit</automated>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && grep -c "filteredOfTotal" public/locales/en/gamelib.json && grep -rn "{{count}}" src/frontend/screens/Library/components/LibraryHeader/index.tsx | wc -l | grep -q '^ *0$'</automated>
  </verify>

  <done>
`DEFAULT_FILTER_ENGINE_STATE` is exported and provably yields zero active-filter
descriptors. `countGamesExcludingDlc` is the sole DLC-exclusion implementation and is used
for both numerator and denominator. With `activeFilterCount === 0` the header renders
today's exact `<span className="numberOfgames">` content; with it > 0 the header renders the
`{{shown}} of {{total}}` form. `filteredOfTotal` is a NEW key. `engineWiring.ts` and
`buildGridPipeline` are byte-unchanged. All RED proofs, the stripper proof and the gate
mutation are recorded.
  </done>
</task>

</tasks>

<verification>
**Full regression gate (run once, after Task 3):**
```
cd /Users/graysonmitchell/Projects/GameLib
npx tsc --noEmit
pnpm codecheck
pnpm test:ci
```
`pnpm test:ci` must be at or above the current baseline (265 suites) with zero regressions
and exit 0. Six new/extended suites are expected.

**Working-tree hygiene (C1):**
```
git status --porcelain
```
must show ONLY this task's files plus the pre-existing, untouched modification to
`src/frontend/screens/Library/components/InstallModal/index.tsx`. If any file from a
concurrent session appears staged, unstage it with `git restore --staged <path>` (which does
not touch working-tree contents and does not trigger the post-checkout hook) -- never
`git checkout`, never `git stash`.

**Cascade verification (the C2 control, run manually as well as via the committed gate):**
```
node_modules/.bin/sass src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss \
  | grep -n "FilterFacetGroup__badge\|FilterFacetGroup__title"
node_modules/.bin/sass src/frontend/components/UI/Dropdown/index.scss | grep -n "^\..*{"
```
Confirm by eye that no emitted Dropdown selector can match a
`<span class="FilterFacetGroup__badge">` nested inside `.dropdownButton` (which is a SIBLING
of `.dropdown`, not a descendant), and that the badge selector carries three classes.

**Human gate -- NOT provable by jest in this project (no jsdom, no CSS engine, WKWebView
rendering differences).** These four observations are owed to the developer before this task
is considered live-correct, and no automated result substitutes for them:
1. Collapse the `STORE` group with 2 stores ticked -- a `2` appears on the header, left of
   the caret, and the header title is not pushed off-centre or truncated prematurely.
2. Untick both -- the badge disappears entirely (no `0`, no empty gap).
3. Cycle every shipped theme with a badge visible and a filtered header: the badge stays
   legible on the panel surface in all of them (this is the repeatedly-burned failure mode;
   `gruvbox_dark` and `dracula` are the two that historically lack tokens).
4. Apply one store facet -- the header reads e.g. `42 of 318`; click `Clear all` -- the
   header returns to the bare `318` in today's exact form and the number MATCHES the
   denominator that was showing.
</verification>

<success_criteria>
- A collapsed facet group with active selections shows a numeric badge; one without shows
  nothing.
- All three groups derive that number from `activeFilterDescriptors` via one shared pure
  helper -- `grep -c "storeFacet.length"` and any hand-rolled More-filters boolean tally
  return 0 in the three caller files.
- `FilterFacetGroup/index.tsx` still contains zero `useTranslation`, zero `useContext` and
  zero user-facing string literals (C3 contract intact).
- The emitted badge selector carries >= 3 class components, verified by compiling the SCSS,
  and the specificity assertion is proven to fail when the ancestor is dropped.
- No new field on `LibraryContext.tsx` / `frontend/types.ts` / the provider value object.
- `activeFilterCount === 0` renders the header byte-identically to today.
- `activeFilterCount > 0` renders `{{shown}} of {{total}}` where the denominator equals the
  count reachable by `Clear all`.
- Two new i18n keys, both extracted by `pnpm i18n`, both with literal key + literal default
  at every call site, neither using `{{count}}`.
- No new hard-coded colour, no new custom property, no new bare `--navbar-active` consumer.
- `pnpm test:ci` green at or above the 265-suite baseline; `pnpm codecheck` clean;
  `npx tsc --noEmit` clean.
- Zero `git stash` / `git checkout -- <file>` invocations across the whole execution.
</success_criteria>

<output>
Create `.planning/quick/260815-opt-library-filter-visibility-facet-group-se/260815-opt-SUMMARY.md`
when done. It must record, per task: the observed RED failure output, the observed result of
each non-vacuity mutation (which specs failed, and confirmation the revert diff was empty),
any Rule-1 deviation from this plan, and the four human-gate items as OWED (not as passed --
no automated evidence in this plan speaks to rendering, layout or per-theme legibility).
</output>
