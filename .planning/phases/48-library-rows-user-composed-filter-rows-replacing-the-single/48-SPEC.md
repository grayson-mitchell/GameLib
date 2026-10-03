# Phase 48: Library rows — user-composed filter rows in the tiles panel — Specification

**Created:** 2026-10-03
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

The Games library renders **up to 10 user-chosen horizontal rows inserted above the games
grid**, each row being one value picked from a list (a view, a collection, a store or a
runnability value), persisted across restart, independent of the active filter state, and
composed from a `ROWS` section in the Games tier-2 panel — replacing the single lane chosen from
the `libraryTopSection` Settings dropdown.

## Background

Measured against the codebase on 2026-10-03.

**Exactly one lane can exist today, ever.** `showRecentGames` requires
`libraryTopSection.startsWith('recently_played')` (`Library/index.tsx:577`) and `showFavourites`
requires `libraryTopSection === 'favourites'` (`:596`), so the two are mutually exclusive. The
choice lives in a four-option Settings dropdown — `recently_played`,
`recently_played_installed`, `favourites`, `disabled` (`Settings/components/LibraryTopSection.tsx:30-46`).

**Lanes are not horizontal.** `.gameList` is
`display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))`
(`Library/index.css:1-8`), a full-width wrapping grid. `.gameList.firstLane` changes **padding
only** (`:10-12`). Nothing in this codebase scrolls games sideways. **The horizontal strip is
net-new work** — the composition half of this phase is a generalisation of shipped code, the
rendering half is not.

**The header shape already exists.** The favourites lane pairs a `library-section-header` +
`h3.libraryHeader` with a `GamesList` (`Library/index.tsx:1228-1236`), and `GamesList` already
takes `isFirstLane` / `isRecent` / `isFavourite`. `filterEngine.ts` already exports
`passesHiddenLaneFilter`, which exists specifically so lanes honour the hidden-games setting.

**Row definitions do not exist in any form.** The nearest persistence analog is
`customCategories` as `Record<string, string[]>` under `configStore` key
`games.customCategories` (`GlobalState.tsx:505,698`) — manual per-game membership, not a filter.

**Lane-versus-filter behaviour is already a deliberate decision.** `Library/index.tsx:1205-1212`
is labelled *"KNOWN NUANCE -- do not 'correct' this back"*: the lane receives `showHidden` and
`onlyInstalled` but **not** the store or runnability facets, the operator was told this and chose
it, and making the lane honour the remaining facets is recorded as explicitly out of scope. This
phase does not scale that inconsistency — it rules rows fully independent of filter state, which
turns the nuance into the intended design.

## Requirements

1. **Row definition persistence**: An ordered list of row definitions survives app restart.
   - Current: No row definitions exist. `libraryTopSection` is a single enum string in Settings; `games.customCategories` holds manual membership, not filters.
   - Target: A new `configStore` key holds an ordered list of row definitions, each `{ kind, value }` where `kind` is one of view / collection / store / runnability.
   - Acceptance: Add two rows, quit, relaunch — both rows are present in the same order.

2. **ROWS section with a pick-list `+`**: The Games tier-2 panel gains a `ROWS` section listing current rows, with a `+` that opens a pick list.
   - Current: No `ROWS` section exists. Lane choice is a `MenuItem` dropdown in Settings, not in the library panel.
   - Target: `ROWS` section renders in the Games tier-2 panel below the existing filter groups. `+` opens a pick list grouped as VIEWS, COLLECTIONS, STORES, RUNNABILITY. Picking one value adds exactly one row, auto-named from the pick.
   - Acceptance: `+` lists every view, every existing collection, every store and every runnability value; picking one adds exactly one row whose visible name equals the picked value's existing label.

3. **Rows render as horizontal strips above the grid**: Each row is one row tall with horizontal overflow, inserted above the grid, leaving the grid unchanged.
   - Current: A lane is a full-width wrapping grid (`.gameList`, `auto-fill minmax(156px, 1fr)`); at most one exists; `.firstLane` alters padding only.
   - Target: Each row renders as a single-row horizontal strip with a `library-section-header`-style header, inserted at the existing lane position (`Library/index.tsx:1218-1238`). The grid below renders identically to today.
   - Acceptance: With 3 rows configured, each strip renders exactly one card tall and overflows horizontally rather than wrapping; the grid's rendered output is unchanged against a pre-phase baseline for the same filter state.

4. **Rows are independent of filter state**: No filter affects row contents; hidden-games visibility is the sole exception.
   - Current: The one lane honours `showHidden` and `onlyInstalled` but ignores store and runnability facets — a deliberate, documented asymmetry (`Library/index.tsx:1205-1212`).
   - Target: No view, collection, store facet, runnability facet, search term or alphabet letter changes any row's contents. Rows call `passesHiddenLaneFilter` so a hidden game never appears.
   - Acceptance: With Store = GOG active, rows still contain non-GOG games while the grid contains GOG only; a game hidden via its context menu appears in no row.

5. **Per-row ordering**: Natural order for the pick, title order otherwise.
   - Current: The recently-played lane uses the insertion order of `configStore` `games.recent` (`RecentlyPlayed/index.tsx:21-33`); the favourites lane uses favourites-list order.
   - Target: A recently-played row orders by recency. Every other row orders by title using the existing leading-`The `-stripped `localeCompare` (`Library/index.tsx:916-922`).
   - Acceptance: A GOG row is alphabetical by title; a recently-played row's first card is the most recently played game.

6. **Row cap of 10**: At most 10 rows exist, and exceeding it is prevented, not silently truncated in storage.
   - Current: No cap exists because no rows exist.
   - Target: The `+` control is unavailable once 10 rows exist, with a visible reason. A persisted list already holding more than 10 renders the first 10 and never deletes the excess.
   - Acceptance: With 10 rows, `+` is unavailable and states why; with a hand-written 12-row config, 10 strips render and the stored list still holds 12 after a restart.

7. **Row removal**: Each row can be removed, and removal persists.
   - Current: No rows, no removal affordance.
   - Target: Each entry in the `ROWS` section can be removed. Removal persists across restart and preserves the order of the remaining rows.
   - Acceptance: Remove the middle of 3 rows — the other two render in their original relative order, and still do after relaunch.

8. **Migration from `libraryTopSection`**: The existing setting seeds the initial row set once.
   - Current: `libraryTopSection` drives the single lane directly at render time; there is no row list to seed.
   - Target: On first run after upgrade, `recently_played` seeds one Recently-played row; `recently_played_installed` seeds one Recently-played row carrying installed-only semantics; `favourites` seeds one Favourites row; `disabled` seeds none. Seeding runs once, guarded by presence of the new key.
   - Acceptance: A profile set to `favourites` shows exactly one Favourites row on first launch after upgrade; removing that row and relaunching does not bring it back.

## Boundaries

**In scope:**

- A persisted, ordered list of up to 10 row definitions (`{ kind, value }`)
- A `ROWS` section in the Games tier-2 panel, listing rows, with a pick-list `+` and per-row removal
- Horizontal single-row strip rendering with a header, inserted above the grid
- Per-row ordering: recency for recently-played, title for everything else
- One-time migration seeding from the four existing `libraryTopSection` values
- Row self-suppression when a row's pick matches zero games

**Out of scope:**

- **Arbitrary saved filter states as rows** — the `+` is a pick list, one value per row. Saving a composed multi-facet filter as a row is a possible follow-up, deliberately not this phase.
- **A `Recently added` / `Date purchased` row** — acquisition date does not exist for Epic, Amazon or sideloaded, is license-grant-not-purchase for Steam, and is clean only for GOG. Keeping it out keeps the cross-store data-coverage problem entirely outside this phase. It stays owned by the `library-sorting-is-title-only` todo.
- **Drag-to-reorder rows** — operator decision: "reorder later". New rows append.
- **Any change to the games grid** — the grid's filtering, layout and sort behave exactly as today. Rows are an insertion above it.
- **Making rows honour facets** — ruled independent. This also means `Library/index.tsx:1205-1212`'s KNOWN NUANCE is not revisited.
- **A global sort-field menu** — superseded in intent by per-row natural ordering; the todo it came from is rewritten down to the data-coverage decision, not closed.
- **Duplicate prevention across rows** — `Installed` and `Steam` legitimately overlap. The cap of 10 is the control on vertical space, not a duplicate rule.
- **Sketch 005 variant D implementation** — the Views segmented control is a separate, already-sketched change. Rows being an insertion means D is unaffected and no longer blocked, but it is not this phase's deliverable.

## Constraints

- **`.libraryHeader` is `position: sticky; top: 0; z-index: 9`** (`Library/index.css:42-50`). N row headers will all try to stick to the same offset and collide. The planner must resolve this; it is a known mechanical consequence, not an open question.
- **`.gameList.firstLane > div:has(.justPlayed) { grid-column: span 2 }`** (`Library/index.css:14-16`) is a grid-only emphasis rule with no meaning in a horizontal strip. Decide its fate explicitly rather than carrying it forward dead.
- **Rows must reuse `GamesList`** rather than forking a card renderer — it already carries `isFirstLane` / `isRecent` / `isFavourite` and the `GameCard` wiring.
- **Row names are user-facing strings.** New copy goes in `public/locales/en/gamelib.json` via `pnpm i18n`, never `translation.json`, and the l10n fill is part of the work.
- **Collection names are user data** and must render as-is; only the group label and the four view names are translatable.
- Vertical space is the scarce resource: 10 rows plus a chip row plus a grid must still leave the grid reachable. The cap is the agreed control.

## Acceptance Criteria

- [ ] Two added rows persist across quit and relaunch, in the same order
- [ ] `+` lists every view, every existing collection, every store and every runnability value
- [ ] Picking one pick-list value adds exactly one row, named with that value's existing label
- [ ] A pick already present as a row is marked already-added and cannot be added twice
- [ ] Zero configured rows renders no strips, and the grid is identical to today
- [ ] With no collections, the pick list omits the COLLECTIONS group
- [ ] Each strip renders exactly one card tall and overflows horizontally rather than wrapping
- [ ] A strip whose content fits the viewport shows no overflow affordance
- [ ] Strips render in row-definition order
- [ ] A row whose pick matches zero games self-suppresses
- [ ] With Store = GOG active, rows contain non-GOG games and the grid contains GOG only
- [ ] A filter state yielding zero grid results still renders the rows; `FilterZeroResult` governs the grid only
- [ ] A GOG row is alphabetical by title; a recently-played row leads with the most recently played game
- [ ] Two games with identical titles order stably, tie-broken on `app_name`
- [ ] With 10 rows, `+` is unavailable and states why
- [ ] A hand-written 12-row config renders 10 strips and still holds 12 entries after relaunch
- [ ] Removing the middle of 3 rows preserves the other two in relative order, across relaunch
- [ ] Removing the last remaining row returns the screen to grid-only
- [ ] `libraryTopSection: favourites` seeds exactly one Favourites row on first upgraded launch
- [ ] `libraryTopSection: recently_played_installed` seeds one Recently-played row with installed-only semantics
- [ ] `libraryTopSection: disabled` seeds zero rows
- [ ] Migration does not re-seed on subsequent launches after a row is removed
- [ ] **MUST NOT**: no row renders a hidden game
- [ ] **MUST NOT**: row definitions beyond the cap are never deleted from storage
- [ ] **MUST NOT**: `games.customCategories` is not written by any rows code path
- [ ] **MUST NOT**: no row's visible name is a raw i18n key

## Edge Coverage

**Coverage:** 20/28 applicable edges resolved (18 explicit + 2 backstop) · 0 unresolved · 8 dismissed

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| adjacency | R1 | ✅ covered (explicit) | Pick already present is marked already-added, cannot be added twice |
| empty | R1 | ✅ covered (explicit) | Zero rows → no strips, grid identical to today |
| ordering | R1 | ✅ covered (explicit) | Row list is insertion-ordered and stable |
| idempotency | R1 | ✅ covered (explicit) | Migration seeds once, guarded by presence of the new key |
| concurrency | R1 | ⛔ dismissed | Single-instance app (Phase 46 owns that guard) and `configStore` writes are synchronous |
| adjacency | R2 | ✅ covered (explicit) | Same already-added criterion as R1 |
| empty | R2 | ✅ covered (explicit) | No collections → COLLECTIONS group omitted, per `FilterCollectionList__empty` precedent |
| ordering | R2 | ✅ covered (explicit) | Pick-list groups render in fixed order: views, collections, stores, runnability |
| idempotency | R2 | ⛔ dismissed | Opening a menu twice is a no-op by construction |
| concurrency | R2 | ⛔ dismissed | Same as R1 concurrency |
| adjacency | R3 | ✅ covered (explicit) | Content that exactly fits shows no overflow affordance |
| empty | R3 | ✅ covered (explicit) | Row matching zero games self-suppresses, matching the shipped `showFavourites && !!favouriteGamesList.length` rule |
| ordering | R3 | ✅ covered (explicit) | Strips render in definition order |
| adjacency | R4 | 🧪 backstop | Held-out test: no filter combination alters row contents |
| empty | R4 | ✅ covered (explicit) | Zero grid results still renders rows; `FilterZeroResult` governs the grid only |
| ordering | R4 | ⛔ dismissed | The requirement is a negative — nothing is ordered by it |
| idempotency | R4 | ⛔ dismissed | The requirement is a negative — nothing is applied by it |
| concurrency | R4 | ⛔ dismissed | Same as R1 concurrency |
| adjacency | R5 | ✅ covered (explicit) | Identical titles tie-break stably on `app_name` |
| empty | R5 | 🧪 backstop | Held-out test: 0-game and 1-game rows order without error |
| ordering | R5 | ✅ covered (explicit) | Same tie-break criterion as R5 adjacency |
| unclassified | R6 | ✅ covered (explicit) | Probe matched no shape cue; reviewed manually — a config already holding >10 rows renders 10 and deletes nothing |
| adjacency | R7 | ✅ covered (explicit) | Removing the last row returns to grid-only |
| empty | R7 | ⛔ dismissed | Unreachable — no remove control exists when there are no rows |
| ordering | R7 | ✅ covered (explicit) | Removal preserves the relative order of remaining rows |
| adjacency | R8 | ✅ covered (explicit) | `recently_played_installed` seeds one Recently-played row with installed-only semantics |
| empty | R8 | ✅ covered (explicit) | `disabled` seeds zero rows |
| ordering | R8 | ⛔ dismissed | Migration seeds at most one row — nothing to order |

Backstop rows (R4 adjacency, R5 empty) must be carried into plan-phase `must_haves`.

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT render a hidden game in any row | R4 | resolved | test — a game you explicitly hid reappearing in a shelf is a trust break, not an independence feature |
| MUST NOT delete persisted row definitions above the cap | R6 | resolved | test — truncation is display-only; silently discarding user config is data loss |
| MUST NOT mutate `games.customCategories` | R2 | resolved | test — rows READ collections; writing that shared key would corrupt CategoriesManager state |
| MUST NOT ship a raw i18n key as a row's visible name | R2 | resolved | test — this repo has a whole phase (41) on i18n gate honesty; a visible `gamelib:…` key is a shipped defect |

**Dropped at Stage 2 as routine engineering** (owned by the edge probe or code review): must not throw
on malformed persisted row data; must not mutate its input list; must not make grid behaviour depend
on rows.

**Canon-referral breadcrumb:** *"must not send row definitions off-device"* is canon privacy and has
no network path in this feature — not minted here.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Insertion model settled in round 1; pick-list in round 3     |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | 8 explicit out-of-scope items, each with a reason            |
| Constraint Clarity | 0.75  | 0.65 | ✓      | Sticky-header collision and the `justPlayed` span named      |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 22 positive + 4 negative pass/fail criteria                  |
| **Ambiguity**      | 0.16  | ≤0.20| ✓      |                                                              |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher (scout) | What exists today? | Exactly 1 lane max; lanes are wrapping grids not strips; header shape already exists; no row definitions anywhere |
| 1 | Researcher | Rows vs the grid vs Views? | **Rows are INSERTED above the grid; the grid behaves as it does now.** None of the three offered options — it maps 1:1 onto the existing lane insertion point |
| 2 | Researcher | Do rows honour active filters? | **Rows ignore filters entirely — independent.** Turns the KNOWN NUANCE at `Library/index.tsx:1205` into intended design rather than a scaled inconsistency |
| 3 | Simplifier | Hidden games under "independent"? | **Keep hidden hidden** — rows call `passesHiddenLaneFilter` like today's lanes |
| 3 | Simplifier | What does `+` offer — compose or pick? | **A pick list.** One row = one picked value, auto-named, cannot be empty by construction |
| 3 | Boundary Keeper | Row order, cap, reordering? | **Natural order per pick, title otherwise. Cap 10. Reorder later.** Implies no `Recently added` row, which keeps the acquisition-date problem out of this phase |

**Operator corrections to the interviewer, recorded:** round 1's three-option menu missed the
actual answer (insertion), and the `Depends on`/phase-number reasoning that preceded this spec was
wrong on both counts — see the ROADMAP entry and the STATE Roadmap Evolution note for Phase 48.

---

*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Spec created: 2026-10-03*
*Next step: /gsd-discuss-phase 48 — implementation decisions (strip scroll mechanism, sticky-header resolution, persistence shape, pick-list component reuse)*
