---
phase: quick-261029-riq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Header/index.css
  - src/frontend/components/UI/Header/index.tsx
  - src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx
  - src/frontend/screens/Library/components/FocusRowStrip/index.css
  - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
  - src/frontend/components/UI/Dropdown/index.tsx
  - src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx
autonomous: true
requirements: [QUICK-261029-RIQ]

must_haves:
  truths:
    - "The Filters heading in the Games panel reads as a centred label with a horizontal rule on each side (rule, Filters, rule)"
    - "The Focus row strip heading text starts at the same x as the first tile's left edge in the strip and the grid"
    - "Sort by opens a themed in-panel list (no OS-native popup); picking a field sets it and closes the list; Escape closes it; it is reachable by Tab and by controller"
    - "No locale file is edited by this plan; every visible string comes from an existing key"
  artifacts:
    - path: "src/frontend/components/UI/Dropdown/index.tsx"
      provides: "Opt-in closeOnSelect (click on a panel button or Escape collapses and refocuses the trigger)"
      contains: "closeOnSelect"
    - path: "src/frontend/components/UI/Header/index.tsx"
      provides: "Sort field picker built on Dropdown + NavItem rows; no <select>"
      contains: "Header__sortDropdown"
    - path: "src/frontend/screens/Library/components/FocusRowStrip/index.css"
      provides: "Focus-row heading inline padding zeroed"
      contains: "padding-inline: 0"
  key_links:
    - from: "src/frontend/components/UI/Header/index.tsx"
      to: "src/frontend/components/UI/Dropdown/index.tsx"
      via: "<Dropdown closeOnSelect className=\"Header__sortDropdown\">"
      pattern: "closeOnSelect"
---

<objective>
Follow-up polish to quick 261029-quw, part 1 of 2. This plan covers items 1, 2 and 4. Item 3 (the console-style filter chips and the model change behind them) is in `261029-riq-02-PLAN.md`. The two plans share no files and can run in either order.

User items covered here, verbatim:
1. "for the filter heading include a seperator line like '--- Filters ---'"
2. "have focus heading right justified (same starting point as first tile)"
4. "sort by has a popup that looks out of place, not themed (native macos?). make themed"

Interpretations (confirmed against code during planning):

- Item 1: `.Header__filtersHeading` (the `h2` added in 261029-quw, `Header/index.css:87`) becomes a flex row with `::before` / `::after` 1px rules either side of the centred text. Text and DOM unchanged.
- Item 2: the qualifier is the requirement. Root cause found: `.libraryHeader` (`Library/index.css:49`) pads all four sides by `var(--space-md-fixed)`, and it sits INSIDE `.focusRowStrip`, which also pads inline by `var(--space-md-fixed)` (`FocusRowStrip/index.css:2`). The first strip card sits at the strip's padding edge (the viewport's -15px start bleed cancels the list's 15px padding-inline) and the grid's first tile sits at `.gameList`'s `var(--space-md-fixed)` padding edge. So the heading text is indented one extra `--space-md-fixed` (16px) past the first tile. Fix: zero the heading's inline padding inside the strip.
- Item 4: `Header/index.tsx:260-283` renders a native `<select>`, whose popup is OS-drawn on macOS. The codebase's themed disclosure is `components/UI/Dropdown`, which the tier-2 facet groups already use through `FilterFacetGroup`, and which `gamepad.ts` handles via its `.dropdownButton` class. It expands in-flow inside the panel (the Dropdown test pins that it is NOT absolutely positioned), so no clipping in the scroll-clipped tier-2 column. The options are `NavItem` button rows, the themed tier-2 row spec. Dropdown gains one opt-in prop, `closeOnSelect`, so choosing an option collapses it.

Purpose: the panel reads as one designed surface across all themes instead of plain text and an OS-native popup.
Output: CSS and component changes above, with the tests that pinned the old layout updated, not deleted.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261029-quw-library-screen-tidy-ups/261029-quw-SUMMARY.md

Load `Skill("gamelib-conventions")` (the `<verify>` prettier rule) and `Skill("sketch-findings-gamelib")` (multi-theme survival). Verify against midnightMirage, gruvbox_dark and dracula. Dracula's navbar is lighter than its body, so define colours relationally.

Hard constraints:
- `public/locales/en/gamepage.json` has an unrelated uncommitted user edit. Do not touch, stage or format it. This plan adds NO new strings; it reuses `header.filters`, `gamelib:library.sort.label` and the three `gamelib:library.sort.field.*` keys. Header/index.tsx and Dropdown/index.tsx are already in `meta/i18nGateScope.json` and `meta/i18nForkTouchedFiles.json`.
- i18next-parser only extracts literal `t('key', 'Default')` calls. Keep every label a literal call site.
- `tier2Portal.test.ts` forbids `justify-content: space-between` and `position: sticky` anywhere in `Header/index.css`.
- Colour tokens: use `var(--border-color)` for rule lines, NOT `var(--divider)`. themes.scss:10-28 documents --divider as invisible in most themes, while --border-color is held to 3:1 by themeTokens.test.ts.
- jest has no jsdom (`testEnvironment: 'node'`). Component tests call the component as a function against mocked hooks and inspect the element tree. Do not add new React hooks (`useRef` etc.) to Dropdown: its test harness mocks only `useState`/`useContext`/`useEffect`, so an unmocked hook throws "Invalid hook call".

<interfaces>
From src/frontend/screens/Library/librarySort.ts:
- `export type LibrarySortField = 'name' | 'lastPlayed' | 'installSize'`
- `export const LIBRARY_SORT_FIELDS: readonly LibrarySortField[]` (order: name, lastPlayed, installSize)

From src/frontend/components/UI/Dropdown/index.tsx (current):
- `Props = { title?: ReactNode | string; children: ReactNode; className?: string; buttonClass?: string }`
- Root `div.dropdownContainer {className}` with `onBlur`, which collapses when focus leaves the container.
- `button.dropdownButton` with `aria-expanded` and `onClick={toggle}`. `toggle` computes `next = !isExpanded` from the render value, deliberately not a functional updater, and calls `window.api.gamepadAction({ action: 'tab' })` on expand.
- Panel `div.dropdown.expanded|collapsed` with `onFocus={() => setIsExpanded(true)}`.
- `Dropdown/index.scss` nests `.dropdownContainer .dropdown button { margin-inline-start: 0.5rem; align-self: center; font-size: 1rem; padding: 0.3rem 0.8rem }`. This will hit NavItem rows placed in the panel, so override it at higher specificity in Header/index.css.

From src/frontend/components/UI/NavShell/components/NavItem: `elementType="button"`, `label`, `active`, `onClick`, `className` (button branch renders `button.NavItem.{className}.active?`).

Model for styling a Dropdown trigger in the tier-2 panel: the `.FilterFacetGroup .dropdownButton` rules in `NavShell/components/FilterFacetGroup/index.scss:52-140`. Read that block; do not import it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Filters heading rule lines (item 1) and Focus-row heading aligned to the first tile (item 2)</name>
  <files>src/frontend/components/UI/Header/index.css, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx, src/frontend/screens/Library/components/FocusRowStrip/index.css, src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</files>
  <behavior>
    - headerTourAnchors: the existing "Filters heading reads header.filters" test still passes unchanged (h2, children 'Filters'). A new CSS-gate test, using the file's existing `cssBlock` helper, asserts `.Header__filtersHeading` declares `display: flex` and `align-items: center`. It also asserts that `.Header__filtersHeading::before, .Header__filtersHeading::after` (one rule, both arms) declares `content: ''`, `flex: 1` and a 1px `border-block-start` using `var(--border-color)`, and does not use `var(--divider)`.
    - focusRowStripSource: a new test asserts `.focusRowStrip .libraryHeader` declares `padding-inline: 0`. A non-vacuity companion parses the two inputs that cause the bug: `.libraryHeader` in `screens/Library/index.css` declares `padding: var(--space-md-fixed)` on all sides, and `.focusRowStrip` declares inline padding `var(--space-md-fixed)`. Without the override, the heading text would sit one `--space-md-fixed` past the first card.
  </behavior>
  <action>
Item 1 (Header/index.css, `.Header__filtersHeading` block at line ~87): keep the existing font and colour declarations, and add `display: flex; align-items: center; gap: var(--space-xs); text-align: center;`. Add one new rule, `.Header__filtersHeading::before, .Header__filtersHeading::after`, with `content: ''; flex: 1; border-block-start: 1px solid var(--border-color);`. Use --border-color, not --divider. Update the comment above the block to cite quick 261029-riq item 1, "rule, Filters, rule". Do NOT change Header/index.tsx's heading markup or its eight-children order.

Item 2 (FocusRowStrip/index.css, existing `.focusRowStrip .libraryHeader` rule at line ~184): add `padding-inline: 0;` and extend the comment with the root cause. `.libraryHeader` pads all sides by --space-md-fixed (Library/index.css) and the strip already pads inline by the same token, so the text sat 16px right of the first card. Zeroing the heading's inline padding puts the text start on the strip padding edge, which is where the first strip card and the first grid tile start. Keep the block padding. Do not touch the base `.libraryHeader` rule in Library/index.css. Use the logical property only (RTL locales ship).

Write the tests from <behavior> first (they fail), then the CSS.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/components/UI/Header src/frontend/screens/Library/components/FocusRowStrip src/frontend/screens/Library/__tests__/tier2Portal.test.ts && npx prettier --check src/frontend/components/UI/Header/index.css src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx src/frontend/screens/Library/components/FocusRowStrip/index.css src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts</automated>
  </verify>
  <done>The heading renders rule, Filters, rule in CSS source. `.focusRowStrip .libraryHeader` has `padding-inline: 0` with a root-cause comment. Both new tests pass, and fail when the declaration is removed. All existing Header, FocusRowStrip and tier2Portal tests pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Themed Sort by picker on Dropdown + NavItem rows, replacing the native select (item 4)</name>
  <files>src/frontend/components/UI/Dropdown/index.tsx, src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx, src/frontend/components/UI/Header/index.tsx, src/frontend/components/UI/Header/index.css, src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx</files>
  <behavior>
    - dropdownDisclosure: existing tests stay untouched and green.
      - Without `closeOnSelect`: firing the panel's onClick (if any) with a target inside a button leaves the panel expanded.
      - With `closeOnSelect`, after expanding: a panel click whose `target.closest('button')` is non-null collapses the panel and calls `.focus()` on the container's `.dropdownButton`. Use fake event objects: `target.closest`, and `currentTarget.parentElement.querySelector` returning a stub with a jest.fn focus. A click on non-button panel space does not collapse.
      - With `closeOnSelect` and expanded: a root onKeyDown with key 'Escape' collapses, refocuses the trigger and calls `stopPropagation`. A non-Escape key does nothing. Escape while collapsed does nothing.
    - headerTourAnchors: the sort describe is rewritten, not deleted.
      - No `select` element exists anywhere in the Header tree.
      - The sort row (`data-tour="library-sort"`) contains exactly one Dropdown element with `className` containing `Header__sortDropdown` and `closeOnSelect` true.
      - Its children are exactly three NavItem button rows, in the order of `[...LIBRARY_SORT_FIELDS]`. The row for the current `sortField` has `active` true and the others false.
      - Firing a row's onClick calls `setSortField` once with that row's literal field. This replaces the old "onChange validates" test.
      - The Dropdown `title` contains the 'Sort by' label and the current field's label: 'Name' for sortField 'name', 'Last played' for 'lastPlayed'.
      - The direction-button tests (flip, WR-03 aria) and the eight-children panel order test stay unchanged.
  </behavior>
  <action>
Dropdown is a shared primitive, and existing consumers must be byte-for-byte unaffected. Add optional prop `closeOnSelect?: boolean` (default false), with a docstring citing quick 261029-riq. When true only:
(1) Give the panel div an `onClick`. When `(event.target as Element).closest('button')` is non-null, it calls `setIsExpanded(false)` and refocuses the trigger via `event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(':scope > .dropdownButton')?.focus()`. Moving focus to the trigger keeps focus inside the container, so the onBlur collapse does not fight it. It also means a collapsed panel child never keeps focus; a focused collapsed child would re-expand via onFocus.
(2) Give the root div an `onKeyDown`. When expanded and `event.key === 'Escape'`, it collapses, refocuses the trigger the same way and calls `event.stopPropagation()`.
When false, pass `undefined` for both handlers. Add NO new hooks. Do not touch the toggle's render-value logic or the gamepadAction call.

Header/index.tsx: replace the `<label htmlFor="library-sort-field">` + `<select>` (lines ~257-283) with `<Dropdown closeOnSelect className="Header__sortDropdown" title={...}>`.
- Build the three sort rows as a literal array `Array<{ value: LibrarySortField; label: string }>` in LIBRARY_SORT_FIELDS order. Each label is a literal `tGamelib('gamelib:library.sort.field.name', 'Name')` call, using the same keys as today.
- The title is `<span className="Header__sortLabel">{tGamelib('gamelib:library.sort.label', 'Sort by')}</span><span className="Header__sortValue">{current row label}</span><FontAwesomeIcon icon={faChevronDown} className="Header__sortCaret" />`. The trigger's accessible name is then "Sort by Name". Find the current row by `sortField`, falling back to the first row.
- Children are `NavItem elementType="button" className="Header__sortOption" label active={sortField === row.value} onClick={() => setSortField(row.value)}`.
- Keep `data-tour="library-sort"` on `.Header__sortRow`, and keep the direction button exactly as is.
- Import Dropdown from `frontend/components/UI/Dropdown`, NavItem from `../NavShell/components/NavItem`, and `faChevronDown`.
- The headerTourAnchors test needs `jest.mock` entries for the Dropdown and NavItem modules, following the file's existing mock pattern.

Header/index.css:
- `.Header__sortRow` becomes `grid-template-columns: 1fr auto; align-items: start;`.
- Delete the `.Header .Header__sortSelect` rules (base and `:focus-visible`).
- Add a trigger rule modelled on the old select styling: `.Header .Header__sortDropdown .dropdownButton { display: flex; align-items: center; gap: var(--space-xs); inline-size: 100%; min-inline-size: 0; padding-block: var(--space-3xs); padding-inline: var(--space-xs); border-radius: var(--space-3xs); border: 1px solid var(--navbar-active-background); background: var(--input-background); color: var(--text-default); font-family: inherit; font-size: calc(var(--text-xs) + 2px); cursor: pointer; text-align: start; }`.
- Add `.Header__sortValue { flex: 1; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-default); }`.
- Rotate the caret off `[aria-expanded='true']`, as FilterFacetGroup does.
- Add a separate focus rule for `.Header .Header__sortDropdown .dropdownButton:focus-visible, .Header .Header__sortDropdown .dropdownButton:focus:is(body.controllerLayout *)`, using the inset ring shape of `.Header__utilityButton`. Keep hover in its own rule.
- Override Dropdown's nested button rule for the option rows: `.Header .Header__sortDropdown .dropdown .Header__sortOption { margin-inline-start: 0; align-self: stretch; font-size: calc(var(--text-xs) + 2px); }`.
- Set the panel padding: `.Header .Header__sortDropdown .dropdown { padding: var(--space-3xs) 0; }`.
- No `space-between` and no `position: sticky`.

Tests first (red), then implementation.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/components/UI/Dropdown src/frontend/components/UI/Header src/frontend/components/UI/NavShell src/frontend/screens/Library/__tests__/tier2Portal.test.ts src/frontend/screens/Game/GamePage/components/__tests__ src/frontend/styles/__tests__ meta/__tests__/hardcodedStringGate.test.ts && pnpm codecheck && npx eslint src/frontend/components/UI/Dropdown/index.tsx src/frontend/components/UI/Header/index.tsx && npx prettier --check src/frontend/components/UI/Dropdown/index.tsx src/frontend/components/UI/Dropdown/__tests__/dropdownDisclosure.test.tsx src/frontend/components/UI/Header/index.tsx src/frontend/components/UI/Header/index.css src/frontend/components/UI/Header/__tests__/headerTourAnchors.test.tsx</automated>
  </verify>
  <done>No `<select>` remains in Header. Sort by opens an in-panel themed list of three NavItem rows. Choosing one sets the field, closes the list and returns focus to the trigger, and Escape also closes it. Existing Dropdown consumers (FilterFacetGroup, MainButton) behave identically because the prop is absent. codecheck, eslint and the listed suites pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Presentational change inside the renderer. Sort values are typed literals. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-riq-01 | Tampering | Header sort onClick -> setSortField | accept | Values are compile-time `LibrarySortField` literals; `readLibrarySortPrefs` still validates on read. |
| T-riq-02 | Denial of service | Dropdown closeOnSelect / Escape | mitigate | The prop is opt-in and off by default. Escape calls `stopPropagation` only when the panel was open. Pinned by dropdownDisclosure tests. |
</threat_model>

<verification>
- Both tasks' automated verify commands pass. Run `graphify update .` after the code changes.
- Owed to the operator (live check; jest has no layout engine). List these in the SUMMARY:
  1. The Filters heading shows rule, Filters, rule in midnightMirage, gruvbox_dark and dracula.
  2. The Focus row heading lines up with the first tile at two tile-slider sizes.
  3. Sort by opens in-panel with no native popup, closes on choose and on Escape, and is reachable by Tab and by controller.
</verification>

<success_criteria>
- Items 1, 2 and 4 delivered as interpreted. The headerTourAnchors sort describe is rewritten in place. No locale file is modified.
</success_criteria>

<output>
Create `.planning/quick/261029-riq-library-filter-panel-polish/261029-riq-SUMMARY.md` when done. Plan 02 appends its own section to the same SUMMARY.
</output>
