---
quick_id: 260815-nmq
slug: collections-expandable-group
description: Make the Collections section of the Games filter panel expandable like Store / Runnability / More filters
date: 2026-08-15
status: planned
---

# Quick Task 260815-nmq: Collections becomes an expandable facet group

## Goal

In the Games tier-2 filter panel, `Collections` currently renders as a flat,
always-open `<section>` with a plain `<span>` header, while `Store`,
`Runnability` and `More filters` are collapsible groups built on
`FilterFacetGroup` (which wraps `Dropdown`). Make `Collections` the same:
a clickable, caret-bearing group header that expands and collapses its rows.

## Scope boundary

- Only `Collections` changes. `Views` (`FilterViewList`) stays flat — the user
  asked for Collections, not Views.
- Row behaviour is untouched: still `NavItem` rows, still single-select, still
  clearable by re-clicking the active row, still `setShowCategories(true)` for
  the two action rows. This is a container swap, not a semantics change.
- No new i18n keys. The group title reuses the existing
  `gamelib:library.filterPanel.collections` ("Collections") key that the
  retired `<span>` header already used.

## Tasks

### Task 1 — Wrap the section in `FilterFacetGroup`

**Files:** `src/frontend/components/UI/NavShell/components/FilterCollectionList/index.tsx`

**Action:** Replace the `<section className="FilterCollectionList">` +
`<span className="FilterCollectionList__header">` pair with
`<FilterFacetGroup title={tGamelib('gamelib:library.filterPanel.collections', 'Collections')} className="FilterCollectionList">`.
Children (empty-state span, category rows, Uncategorized row, the two action
rows) move inside unchanged.

**Verify:** `Collections` renders a `dropdownButton` header with the shared
caret; rows live in the collapsible `dropdown` panel.

**Done:** No `FilterCollectionList__header` element remains; the component's
root element is `FilterFacetGroup`.

### Task 2 — Reclaim the `Dropdown` stylesheet leak for `NavItem` rows

**Files:** `src/frontend/components/UI/NavShell/components/FilterCollectionList/index.scss`

**Action:** `Dropdown/index.scss` ships `.dropdownContainer .dropdown button`
(0,2,1) — `margin-inline-start: 0.5rem; align-self: center; font-size: 1rem;
padding: 0.3rem 0.8rem` — written for the Game-page MainButton menu. `NavItem`'s
own rule is `.NavShell__tier2 .NavItem` at (0,2,0), so moving these rows inside
a `Dropdown` panel makes the leak WIN on all four properties: the exact
260815-mk1 defect `FilterFacetGroup/index.scss:122-139` already documents for
`.FilterFacetRow`. Add a (0,4,0) rule
(`.NavShell__tier2Portal .FilterCollectionList .dropdown .NavItem`) restoring
tier-2 row metrics, so the win is specificity-ordered and not source-order
dependent (the two stylesheets are imported by different components).

Also: drop the now-dead `.FilterCollectionList__header` rule and the
`display: flex` / `flex-direction: column` on `.FilterCollectionList` — that
class now lands on `Dropdown`'s `.dropdownContainer`, whose `position: relative`
layout the other facet groups leave alone. `margin-block-end` is already
supplied by `.FilterFacetGroup`.

**Verify:** Rows sit at the same 12px gutter as the group header, same
`--text-md` size, no 0.8rem double padding.

**Done:** `.FilterCollectionList__header` gone from the stylesheet; a
`.dropdown .NavItem` reset exists with the leak documented in a comment.

### Task 3 — Update the structural tests

**Files:** `src/frontend/components/UI/NavShell/__tests__/FilterCollectionList.test.tsx`

**Action:** Add the mocks the sibling facet tests already use for this exact
import chain (`FilterFacetGroup/index.scss`, `../../Dropdown`,
`@fortawesome/react-fontawesome`) — jest has no `moduleNameMapper` for `.scss`
and its `transform` only covers `.tsx?`, so an unmocked stylesheet import is a
hard `SyntaxError`, not a silent no-op. Add a test asserting the root element is
`FilterFacetGroup` carrying the Collections title (this is the collapsibility
gate — it is what fails if someone reverts to a flat `<section>`). Retitle the
empty-state test, whose name says "renders its header" but whose assertions
only ever covered the empty message and the row labels.

**Verify:** `pnpm test:frontend` — `FilterCollectionList` suite green.

**Done:** All existing assertions still pass unchanged; one new
collapsibility assertion added.

## must_haves

**truths:**
- Clicking the `Collections` header toggles its rows, exactly as `Store` does.
- Selecting / clearing a collection still calls `setCurrentCollection` with a
  bare string or `null` — never an array.
- No new translation key is introduced.

**artifacts:**
- `FilterCollectionList/index.tsx` renders `FilterFacetGroup` as its root.
- `FilterCollectionList/index.scss` carries a `.dropdown .NavItem` specificity
  reset against the `Dropdown` leak.

**key_links:**
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.tsx`
- `src/frontend/components/UI/Dropdown/index.scss`
