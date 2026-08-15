---
quick_id: 260815-nmq
slug: collections-expandable-group
description: Make the Collections section of the Games filter panel expandable like Store / Runnability / More filters
date: 2026-08-15
status: complete
commit: 2ebc88505
---

# Quick Task 260815-nmq — Summary

## What changed

`Collections` in the Games tier-2 filter panel is now a collapsible group,
matching `Store`, `Runnability` and `More filters`. It was the only section in
the panel below `Views` that was permanently open.

| File | Change |
|------|--------|
| `FilterCollectionList/index.tsx` | Root swapped from `<section>` + `<span class="…__header">` to `<FilterFacetGroup title={…} className="FilterCollectionList">`. Children unchanged. |
| `FilterCollectionList/index.scss` | Dropped the dead `__header` rule and the `.FilterCollectionList` flex box (the class now lands on `Dropdown`'s `.dropdownContainer`; `margin-block-end` already comes from `.FilterFacetGroup`). Added a (0,4,0) `.dropdown .NavItem` reset. |
| `__tests__/FilterCollectionList.test.tsx` | Added the three mocks the sibling facet tests use for this import chain; added the collapsibility gate; retitled the empty-state test. |

## Decisions

- **Rows stay `NavItem`, not `FilterFacetRow`.** `FilterFacetRow` carries
  `role="checkbox"` + `aria-checked`. Collections is single-select with a
  clearable active row — checkbox semantics would be an a11y lie. Only the
  container changed; row behaviour (D-17/D-19/D-20/D-21) is byte-identical.
- **No new i18n key.** The group title reuses
  `gamelib:library.filterPanel.collections`, the same key the retired `<span>`
  header rendered. Zero catalogue churn, so the localisation gate is untouched.
- **`Views` left flat.** The request named Collections. `FilterViewList` still
  renders its own header; if the panel should be uniformly collapsible that is
  a separate call.

## The non-obvious part — the Dropdown stylesheet leak, second occurrence

`Dropdown/index.scss` styles not just its panel but the panel's **contents**,
for its other consumer (the Game-page MainButton menu):

```
.dropdownContainer .dropdown button   (0,2,1)
  margin-inline-start: 0.5rem; align-self: center;
  font-size: 1rem; padding: 0.3rem 0.8rem;
```

`NavItem`'s own rule is `.NavShell__tier2 .NavItem` at **(0,2,0)** — it loses.
So the moment these rows moved inside a `Dropdown` panel, every one of those
four properties flipped to MainButton's values: rows would have sat ~33px in
with 0.8rem of their own padding while the header they belong to sat at 12px.

This is the identical defect `FilterFacetGroup/index.scss:122-139` records as
260815-mk1 for `.FilterFacetRow` — **the class of bug recurs for every new row
primitive moved into a Dropdown**, not just for the one that hit it first.

Fixed by out-specifying at **(0,4,0)**
(`.NavShell__tier2Portal .FilterCollectionList .dropdown .NavItem`, verified by
compiling the stylesheet with `sass`), not by editing `Dropdown/index.scss`
which MainButton depends on. Class count beats (0,2,1) regardless of source
order — that ordering independence is load-bearing, because
`NavItem/index.scss` and this file are imported by different components and
neither can rely on loading after the other.

The reset restores `NavItem`'s own values verbatim rather than inventing new
ones, so the tier-2 row spec is not forked. It does also outrank NavItem's
`&:hover { padding-inline-start: 12px }` at (0,3,0) — nothing is lost:
`--tier2-row-padding-inline` is `--space-sm` = `0.75em` = exactly 12px at the
default root size, so that hover indent was already a visual no-op, and the
em-relative token is the more correct value at non-default text sizes.

## Verification

- **RED proof of the new gate.** Reverted the component to the flat
  `<section>` and re-ran: the new `renders as a collapsible FilterFacetGroup`
  test was the **only** failure — all 13 pre-existing tests stayed green. Those
  13 inspect rows, and rows do not change, so none of them could ever have
  caught this regression. The gate measures the container, which is the thing
  that actually changed.
- `npx tsc --noEmit -p tsconfig.json` — clean.
- Frontend jest — **88 suites / 1326 tests passed**, including
  `themeTokens.test.ts` (this change adds no bare `--navbar-active` consumer)
  and `GamesPanel.test.tsx`.
- `eslint` on the changed files — clean. One `no-unsafe-member-access` warning
  on `mock.calls[0][0]` is pre-existing and unmodified.
- `prettier --check` — clean after `--write`.

## Not done

- **No live/visual confirmation.** The specificity claim is verified
  statically (compiled selector + arithmetic), not by running the app. Worth an
  eyeball in `pnpm tauri:dev`: click the `Collections` header, confirm it
  collapses and that the rows line up at the same 12px gutter as the header.
- `pnpm test:ci` (full 258-suite run) not executed — only the frontend project.

## Concurrency note

`src/backend/storeManagers/steam/games.ts` was modified by a concurrent session
during this task. It was left unstaged and untouched; this commit contains only
the three files above.
