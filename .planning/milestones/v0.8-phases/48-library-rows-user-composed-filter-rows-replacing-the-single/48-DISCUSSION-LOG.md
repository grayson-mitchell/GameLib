# Phase 48: Focus row — move the library top section into the panel and widen it - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 48-library-rows-user-composed-filter-rows-replacing-the-single
**Areas discussed:** Strip card sizing, Overflow behaviour, Panel section placement and shape
**Area not discussed (Claude's discretion):** Strip header content

Presented in prose rather than `AskUserQuestion` menus — the operator declined the menu format
twice during `/gsd-spec-phase` and answered in prose both times, so the preference was taken as
learned rather than re-tested.

---

## Strip card sizing

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed width in the strip only | Strip cards constant 156px; grid keeps `minmax(156px, 1fr)` and goes on stretching. Strip and grid cards visibly differ in size on a wide window. | ✓ |
| Fixed width everywhere | Resolves the adjacent `library-tiles-stretch` todo; strip and grid consistent. Requires amending SPEC R3. | |
| Keep stretch in the strip too | Rejected before presenting — `1fr` in a horizontal strip stretches a handful of cards across the whole width, making "as many as fit" meaningless. | |

**User's choice:** not separately answered — the operator moved to overflow. Taken as settled
because **SPEC R3's locked acceptance criterion forces it**: *"the grid's output is unchanged
against a pre-phase baseline for the same filter state."* Folding the tile-width todo would break
a locked criterion, so strip-only is the only option consistent with the SPEC.

**Notes:** The three unknowns the tile-width todo asked to check were measured during this
discussion and are all benign — `.gameCard { width: 100% }` so sizing is a container decision;
all card art is `aspect-ratio` so height follows width; every `controllerLayout` rule in
`GameCard/index.css` is hover/focus scoping, not sizing; list view is a separate
`.gameListLayout` path. The consequence accepted explicitly: strip cards ~156px beside grid cards
~190px on a 1600px window, read as intentional per the Steam/Netflix convention.

---

## Overflow behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| `>` controls + horizontal scroll | The convention the operator named from Steam/Netflix/Apple TV. No silent hiding. Needs `scrollIntoView` for gamepad focus and focusable controls with accessible names. | ✓ |
| Truncate to what fits | *"Just whatever can render on screen you can select."* Simplest build; gamepad-safe by construction since nothing is off-screen. But hides games with no on-screen signal, and row contents change on window resize. | |

**User's choice:** `>` controls plus scroll, **with rows capped at 20 items** — *"yes capped at 20
as you say is a 'preview'"*.

**Notes:** The operator raised both options themselves. The deciding input was that
`helpers/gamepad.ts` already navigates `.gameCard` elements directly (class tests at `:395`,
`:468`; reaches `.playIcon` / `.downIcon` at `:480`, `:493`), so controller focus will land
off-screen the moment a row holds more than fits — making `scrollIntoView` necessary regardless,
and making a wheel-only scroll insufficient on its own.

The cap was the real question underneath overflow and was surfaced as such: the SPEC bounded
stored recents at 20 but said nothing about a `GOG` row, which could be 200+ games. Uncapped, the
strip becomes a worse browse surface than the grid beneath it. The operator adopted the "preview"
framing explicitly, which is now carried in CONTEXT.md as the governing idea.

**SPEC amended as a result:** R3 gained the 20-item cap, the fixed 156px width and the scroll
controls, plus 4 acceptance criteria.

---

## Panel section placement and shape

| Option | Description | Selected |
|--------|-------------|----------|
| Between COLLECTIONS and the facets, own group div | Sits on the boundary between "which set am I looking at" and "narrow it down" — honest about being neither. Above the fold, so the label stays discoverable. | ✓ |
| Last, after MORE FILTERS | Signals "different kind of thing" and keeps the filter chain unbroken, but buries the feature at the bottom of a scrolling panel — partly reproducing the Settings discoverability problem that motivated the phase. | |
| First, above VIEWS | Maximally discoverable, but competes with VIEWS for primacy, and VIEWS is used constantly. | |

**Shape options:**

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsible `FilterFacetGroup`, collapsed by default | Same shape STORE uses. Handles 15–25 entries without dominating a 204px column. Already theme-swept across 11 themes and already census-enrolled. | ✓ |
| Static always-open list like `FilterViewList` | Matches VIEWS, but 15–25 entries would dominate the column. | |
| Dropdown-style select | Closest to what Settings used. **Rejected on measured grounds:** `Dropdown/index.scss` styles its panel *contents*, and `FilterFacetGroup/index.scss:203-220` documents the specificity fight that caused — Game-page MainButton menu rules outranked facet rows at (0,2,1) and pushed every checkbox ~33px in. | |

**User's choice:** *"between collections and facets"*, with the collapsible group shape.

**Notes:** The rationale recorded in CONTEXT.md D-10 is sketch 005's lesson applied — a control's
position and treatment should encode what kind of thing it is. The focus row is the only control
in the panel that does not govern the grid, so it gets its own group div rather than joining
`Header__categoriesGroup` or `Header__filtersGroup`.

---

## Claude's Discretion

- **Strip header content** — not selected for discussion. Decided: the header **echoes the pick**
  ("Recently Played", "GOG", "Roguelikes"), not a constant "Focus row" and not a combined
  "Focus row · GOG". Grounded in the shipped favourites lane, which already does exactly this
  (`Library/index.tsx:1229` renders `t('favourites', 'Favourites')` into `h3.libraryHeader`).
  Flagged in CONTEXT.md for review if it reads wrong in the live gate.
- **`{ kind, value }` persistence shape**, and whether `libraryTopSection` is widened in place or
  replaced by a new GlobalConfig key — left to research/planning.
- **Whether the orphaned locale keys are removed or left** — deliberately left open; key removal
  in this repo has three measured traps, so it is a decision rather than a side effect of
  deleting the components.

## Deferred Ideas

- **N focus rows** — the original idea (a `ROWS` section, `+` to add many, cap 10, duplicate and
  reorder policies). Scope-reduced mid-spec: *"simpler change, can always consider adding more
  rows later if required."* The full N-row SPEC is recoverable from commit `c6e294020`. Nothing in
  this phase should preclude it — note that `.libraryHeader`'s `position: sticky; top: 0` is
  benign with one row and becomes a collision with several.
- **Grid tile-width consistency** — making grid tiles fixed-width too so strip and grid match.
  Blocked by SPEC R3's locked "grid unchanged" criterion; needs a SPEC amendment. The adjacent
  todo is now de-risked by this discussion's measurements and close to a one-line change.
