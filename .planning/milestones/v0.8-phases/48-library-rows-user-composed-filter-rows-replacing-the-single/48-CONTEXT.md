# Phase 48: Focus row — move the library top section into the panel and widen it - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the library's top-lane choice out of Settings into the Games tier-2 panel, widen what it can
show from 4 hardcoded options to any view / collection / store / runnability value, and render it
as a horizontal strip above an **unchanged** grid.

One focus row. Not N rows — that was scope-reduced mid-spec and is a possible follow-up phase.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `48-SPEC.md` for full requirements, boundaries, and acceptance
criteria.

Downstream agents MUST read `48-SPEC.md` before planning or implementing. Requirements are not
duplicated here.

**In scope (from SPEC.md):**

- One persisted focus-row selection (`{ kind, value }` or off) in GlobalConfig
- A `FOCUS ROW` single-select, clearable section in the Games tier-2 panel
- Widening the value space from 4 hardcoded options to views + collections + stores + runnability
- Horizontal single-row strip rendering that fills the available width
- Removing both Settings controls (`LibraryTopSection`, `MaxRecentGames`) and the barrel export
- A fixed stored-history bound in `recent_games.ts`
- One-time migration from the four existing `libraryTopSection` values

**Out of scope (from SPEC.md):**

- Multiple rows (no `+`, no row list, no cap on row count, no reordering, no duplicate policy)
- A `Recently added` / `Date purchased` pick — keeps cross-store acquisition-date coverage out
- Arbitrary saved filter states as the pick
- Any change to the games grid
- Making the focus row honour facets
- A global sort-field menu
- Sketch 005 variant D implementation
- Removing the orphaned locale keys

**SPEC amended during this discussion.** R3 gained the 20-item cap, the fixed 156px card width and
the scroll controls, plus 4 acceptance criteria. Recorded on R3 itself as an `Amended 2026-10-03`
note — the SPEC is the contract, so a discussion decision that extends a requirement belongs there
and not only here.

</spec_lock>

<decisions>
## Implementation Decisions

### Strip card sizing

- **D-01:** Strip cards are a **fixed 156px wide**; the grid's `minmax(156px, 1fr)` is left exactly
  as it is. Forced by SPEC R3's locked acceptance criterion *"the grid's output is unchanged against
  a pre-phase baseline"* — folding the adjacent tile-width todo would break it. **Reversibility:**
  reversible — a container-level track/flex-basis value, no card change.
- **D-02:** The visible size difference between strip cards (constant 156px) and grid cards
  (stretched) is **accepted, not a defect**. On a 1600px window that is roughly 156px vs ~190px,
  vertically adjacent. A shelf looking different from a grid is the Steam/Netflix convention.
  Do not file this as a bug against the phase.
- **D-03:** `.gameCard { width: 100% }` (`GameCard/index.css:4`), so the card fills whatever track
  it is given — this is a **container** change, not a card change. Measured: all card art is
  `aspect-ratio` (`173/275`, `3/4`, `275/205`, `328/205`, `16/10`), so height follows width and
  nothing distorts at a fixed width.

### Overflow and row size

- **D-04:** The row holds **at most 20 games** regardless of how many the pick matches. The row is
  a **preview**, not a second grid — uncapped, a `GOG` row on a large library is a worse browse
  surface than the grid directly below it. Steam and Netflix rows are curated subsets, not complete
  catalogues. **Reversibility:** reversible — a slice bound.
- **D-05:** Overflow is reached by **forward/back controls** (the `>` convention the operator
  named), not by truncation. Truncation was explicitly rejected: a row that looks complete but
  silently hides games is the same dishonesty the SPEC already rejected for a `Recently added` row,
  and nothing on screen would say "11 more".
- **D-06:** Gamepad focus moving past the last visible card **must scroll it into view**. This is
  not optional polish: `helpers/gamepad.ts` navigates `.gameCard` elements directly (class tests at
  `:395` and `:468`, reaching inside for `.playIcon` / `.downIcon` at `:480` / `:493`), so controller
  focus already traverses library cards and will land off-screen the moment a row holds more than
  fits.
- **D-07:** A wheel-only scroll is **not acceptable on its own** — it is unreachable by keyboard and
  gamepad. The forward/back controls must be real focusable controls with i18n'd accessible names.

### Panel section placement and shape

- **D-08:** The `FOCUS ROW` section is a **collapsible `FilterFacetGroup`, collapsed by default** —
  the same shape STORE uses. The pick space is 15–25 entries and would dominate a 204px column as a
  static list. `FilterFacetGroup` is already theme-swept across 11 themes and already enrolled in
  `themeTokens.test.ts`'s `--navbar-active` census, so it costs nothing new.
- **D-09:** **Do NOT use a dropdown-style select**, even though Settings used one.
  `Dropdown/index.scss` styles its panel *contents*, and `FilterFacetGroup/index.scss:203-220`
  documents the resulting specificity fight — rules written for the Game-page MainButton menu
  outranked the facet rows at (0,2,1) and pushed every checkbox ~33px in. A second Dropdown usage
  in this panel re-opens that. **Reversibility:** costly — undoing means re-fighting that cascade
  across two stylesheets owned by different components.
- **D-10:** Position is **between COLLECTIONS and the facet groups**, in its **own group div** —
  not inside `Header__categoriesGroup` and not inside `Header__filtersGroup`. Rationale: every
  other control in the panel governs the grid; the focus row governs a different surface. Sitting
  on the boundary between "which set am I looking at" and "narrow it down" is honest about being
  neither, keeps it above the fold so the uppercase label stays discoverable, and the separate
  group div makes the CSS say it is a third category. This is sketch 005's lesson applied: position
  and treatment should encode what kind of thing a control is.
- **D-11:** Rejected: **last, after MORE FILTERS** — it buries the feature at the bottom of a
  scrolling panel, partly reproducing the Settings discoverability problem that motivated the
  phase. Rejected: **first, above VIEWS** — competes with VIEWS for primacy, and VIEWS is used
  constantly.

### Strip header content

- **D-12:** The strip header **echoes the pick** — "Recently Played", "GOG", "Roguelikes" — not a
  constant "Focus row" and not a combined "Focus row · GOG". Three reasons: the shipped favourites
  lane already does exactly this (`Library/index.tsx:1229` renders `t('favourites', 'Favourites')`
  into `h3.libraryHeader`); a constant label spends the header telling the user something they
  chose themselves; and echoing costs zero new i18n because view keys already exist and collection
  names are user data rendered as-is.

### Claude's Discretion

- **Strip header content (D-12)** was not discussed — the operator selected areas 1, 2 and 3 only.
  D-12 is Claude's call, grounded in the shipped favourites-lane precedent. Flag it for review if
  it reads wrong in the live gate.
- The `{ kind, value }` persistence shape, and whether `libraryTopSection` is widened in place or
  replaced by a new GlobalConfig key, are left to research/planning. Note that keeping the old key
  makes migration free but leaves a name that lies about what it holds.
- Whether the orphaned locale keys are removed or left is **deliberately still open** — see
  Canonical References for why it is not a casual deletion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements

- `.planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-SPEC.md` — **Locked requirements — MUST read before planning.** 7 requirements, 32 acceptance criteria, 21 edge rows, 4 prohibitions. R3 carries an `Amended 2026-10-03` note from this discussion.

### Design contracts

- `.claude/skills/sketch-findings-gamelib/references/library-filtering.md` — the tier-2 panel's validated section vocabulary: uppercase `--text-xs` micro-labels, collapsible facet groups, chips, and the "do not hide filter state in the panel alone" rule. Also the CSS patterns for panel width, facet rows and collapsible groups.
- `.claude/skills/sketch-findings-gamelib/references/navigation-shell.md` — the two-tier shell the panel lives in, and the multi-theme survival rules.
- `.planning/sketches/005-views-section-distinction/README.md` — winner variant D. Relevant for the lesson applied in D-10, and because the focus row being an insertion above an unchanged grid means D is **unaffected and no longer blocked**. Not this phase's deliverable.
- `.planning/sketches/MANIFEST.md` — sketch table and winners.

### Adjacent todos (reviewed, NOT folded — see Deferred)

- `.planning/todos/pending/2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md`
- `.planning/todos/pending/2026-10-03-library-sorting-is-title-only-add-a-sort-field-menu-playnite.md`

### Code the phase must not break

- `src/frontend/screens/Library/index.tsx:1205-1212` — the `KNOWN NUANCE -- do not 'correct' this back` comment on lane-versus-facet behaviour. SPEC R4 rules the focus row fully independent, which turns this into the intended design. Do not "fix" it.
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss:203-220` — the Dropdown specificity fight behind D-09. Read before adding any `Dropdown` usage to the tier-2 panel.
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts:92-99` — `NAVBAR_ACTIVE_CONSUMERS` is hand-enumerated. Any new stylesheet consuming `--navbar-active` must be added and must redeclare the `var(--navbar-active, var(--accent-overlay, var(--accent)))` chain locally rather than inheriting a sibling's.
- `src/backend/recent_games/recent_games.ts:15` — `games.slice(0, await maxRecentGames())`. The number setting bounds **stored** history, not just display. `:61-63` carries a `ts-prune` / `find-deadcode` note naming `MaxRecentGames.tsx` that goes stale on removal.
- `src/frontend/screens/Library/engineWiring.ts:175` — a doc comment asserting `libraryTopSection` defaults to `'disabled'`. Goes stale on migration; update it, do not leave it to mislead.

### i18n

- `public/locales/en/gamelib.json` — **new** strings go here via `pnpm i18n`, never `translation.json`.
- `public/locales/en/translation.json` — holds the strings being orphaned: `setting.library_top_section`, `setting.library_top_option.*`, `setting.maxRecentGames`. **Key removal in this repo has three measured traps** (affected-locale count is not what it appears, `da`/`id`/`nl` behave differently, `_one` plural suffixes are load-bearing). Removing them is a decision, not a side effect of deleting the components.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`FilterFacetGroup`** (`NavShell/components/FilterFacetGroup/index.tsx`) — the collapsible section wrapper the `FOCUS ROW` section should be (D-08). Already theme-swept, already census-enrolled, carries the caret and an optional badge slot.
- **`NavItem`** (`NavShell/components/NavItem/`) — the tier-2 row primitive. `FilterViewList` and `FilterCollectionList` both use it; the focus-row entries should too rather than forking a row component.
- **`FilterCollectionList`** (`NavShell/components/FilterCollectionList/index.tsx:58-60`) — the **clearable single-select** pattern SPEC R2 requires: re-clicking the active row calls the setter with `null`. Copy this, not `FilterViewList`, whose selection is deliberately idempotent with no off state.
- **`GamesList`** (`Library/components/GamesList/`) — already takes `isFirstLane` / `isRecent` / `isFavourite` / `layout`. The strip must reuse it rather than forking a card renderer.
- **`RecentlyPlayed`** (`Library/components/RecentlyPlayed/index.tsx`) — the existing lane. Its `getRecentGames` already does limit + `onlyInstalled` + `is_dlc` filtering and calls `passesHiddenLaneFilter`; the focus row generalises it rather than replacing it wholesale.
- **`passesHiddenLaneFilter`** (`Library/filterEngine.ts`) — exists specifically so lanes honour hidden-games visibility. SPEC R4 requires the focus row call it.
- **`library-section-header` + `h3.libraryHeader`** (`Library/index.tsx:1228-1236`, `index.css:42-50`) — the header treatment already exists and is already used by the favourites lane.

### Established Patterns

- **Tier-2 section shape:** uppercase `--text-xs`, `--bold`, `0.1em` tracking, `text-transform: uppercase` on the group header (`FilterFacetGroup/index.scss:79-100`). A new section that does not match this reads as foreign.
- **Theme survival:** `--navbar-active` resolves in only **4 of 11** theme blocks; `--navbar-active-background` in 11 of 11 but as a desaturated grey in 10 of them. Every consumer carries the full fallback chain. Measured during sketch 005.
- **Inset focus rings** inside the scroll-clipped tier-2 column — `outline` + negative `outline-offset` + inset `box-shadow`, with a `body.controllerLayout` arm because Tauri gamepad focus is a script `.focus()` that `:focus-visible` alone can miss (`NavItem/index.scss:65-73`).
- **Scoping discipline:** every tier-2 stylesheet nests under `.NavShell__tier2Portal`. An unscoped `.MuiTabs-root` rule leaked 8px app-wide once (34.10 postmortem) and generic class names here collide the same way.
- **i18n call sites must be string literals.** `FilterViewList/index.tsx:18-28` records the measured failure: a first draft stored `{value, key, defaultText}` in a lookup array and `pnpm i18n` added **zero** of the four keys, while sibling literal call sites landed correctly in the same run. The focus-row entry labels must be literal `t()` calls, not table lookups.

### Integration Points

- **`Header/index.tsx:284-298`** — where the panel's groups are assembled. The new group div goes between `Header__categoriesGroup` and `Header__filtersGroup` (D-10).
- **`Library/index.tsx:1218-1238`** — the current lane insertion point; the strip replaces both the `showRecentGames` and `showFavourites` branches here.
- **`Library/index.tsx:577,596-597`** — the two mutually-exclusive lane flags that collapse into one focus-row selection.
- **`LibraryContext` / `GlobalState.tsx:798`** — `handleLibraryTopSection` is the existing setter; the focus-row selection needs an equivalent.
- **`common/types.ts:170` + `config.ts:349`** — `LibraryTopSectionOptions` and its backend default. This is a real GlobalConfig setting, so the new shape touches backend types too, not just frontend state.
- **`Settings/components/index.ts:44`** — barrel export of `MaxRecentGames`, removed with the component.
- **`Settings/sections/GeneralSettings/index.tsx:16,80`** — where both Settings controls are rendered.

</code_context>

<specifics>
## Specific Ideas

- **"What every other platform does is have a `>` symbol at the end of the row and you can scroll further across to see the remainder."** The operator named the convention directly — Steam, Netflix, Apple TV. D-05 implements it.
- **"Capped at 20 as you say is a 'preview'."** The operator's own word for what the row is. Carry that framing: a preview is not a second grid, and anything that makes the row behave like a complete catalogue view is wrong.
- **"Title can also be improved to something like 'Focus row'."** The phase and the panel section are named Focus row; the strip's own header echoes the pick instead (D-12).
- The operator found the shipped `libraryTopSection` feature in Settings themselves and said *"that option should definitely come out of settings and go into the left panel of library"* — discoverability is a motivation for this phase, which is why burying the section at the bottom of the panel was rejected (D-11).

</specifics>

<deferred>
## Deferred Ideas

- **N focus rows** — the original idea: a `ROWS` section with a `+` adding many rows, cap 10, with duplicate and reorder policies. Scope-reduced mid-spec on the operator's decision: *"simpler change, can always consider adding more rows later if required."* The full N-row spec was written and is recoverable from commit `c6e294020` if it is ever picked up. Nothing in this phase should preclude it — in particular, `.libraryHeader`'s `position: sticky; top: 0; z-index: 9` is benign with one row and becomes a collision with several.
- **Grid tile-width consistency** — making grid tiles a fixed width too, so strip and grid cards match. Blocked by SPEC R3's locked "grid unchanged" criterion; would need a SPEC amendment. See the reviewed todo below.

### Reviewed Todos (not folded)

- **`library-tiles-stretch-with-window-width-consider-a-set-size`** (`ready: human`, `minor`) — overlaps genuinely, deliberately not folded: folding it would break SPEC R3's locked "grid unchanged" acceptance criterion. **But this phase de-risks it.** The todo asks to "check how `GameCard` art, the list view and the controller layout cope with a fixed width before choosing" — all three were measured during this discussion and all three are benign: art is `aspect-ratio` throughout, list view is a separate `.gameListLayout` path, and every `controllerLayout` rule in `GameCard/index.css` is hover/focus scoping, not sizing. The todo is now close to a one-line change (`minmax(156px, 1fr)` → `repeat(auto-fill, 156px)` plus `justify-content`). Worth updating the todo with these measurements.
- **`library-sorting-is-title-only-add-a-sort-field-menu-playnite`** (`ready: human`, `minor`) — already handled at the SPEC level: partially superseded in intent (per-pick natural ordering), but its blocker — cross-store acquisition-date coverage — is untouched and stays its own. **Rewrite it down to the data-coverage decision; do not close it.** Its measured per-store inventory (2026-10-03) is the expensive part.
- The other **11** matches from `todo.match-phase` were keyword false positives (Windows code-signing, blank `.app` render, login-sheet scrollbar, Humble keyring, RPC timeout, `audit-uat` body fields, Epic in-embed sign-in, i18n gate scope, OAuth retry, runner-tile spinner a11y, `--border-color` contrast). Scored 0.6–0.9 on generic token overlap. Not folded, not relevant.

</deferred>

---

*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Context gathered: 2026-10-03*
