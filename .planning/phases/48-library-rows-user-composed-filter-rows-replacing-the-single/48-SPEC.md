# Phase 48: Focus row — move the library top section into the panel and widen what it can show — Specification

**Created:** 2026-10-03
**Revised:** 2026-10-03 — scope reduced from N rows to ONE focus row (operator decision, see Interview Log round 4)
**Revised:** 2026-10-04 — R6's stored-history bound dropped (operator ruling at plan-phase) after the Background claim that justified it was measured false; see the CORRECTED note in Background and the Amended note on R6
**Ambiguity score:** 0.12 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

The single lane above the games grid stops being a four-option dropdown buried in Settings and
becomes a **focus row** chosen from the Games tier-2 panel, pickable from **any view,
collection, store or runnability value**, rendered as a horizontal strip that fills the
available width — with the `Recent Games to Show` number setting removed and the row sized by
what fits instead.

## Background

Measured against the codebase on 2026-10-03.

**The feature already half-exists, and that is the starting point, not a problem.** The operator
found it in Settings mid-spec. `libraryTopSection` is a four-option `SelectField` —
`recently_played`, `recently_played_installed`, `favourites`, `disabled`
(`Settings/components/LibraryTopSection.tsx:30-47`) — and it is a real GlobalConfig setting, not
frontend-only state: `LibraryTopSectionOptions` is declared in `common/types.ts:170` and
defaulted in the backend at `config.ts:349`. It reaches **9 non-test files**: both `types.ts`,
`ContextProvider.tsx`, `GlobalState.tsx` (3 sites), its Settings component,
`Library/index.tsx` (4 sites), an `engineWiring.ts:175` doc comment that asserts its
`'disabled'` default, and `config.ts`.

**Exactly one lane can exist today, which is why the single-row model is a small change rather
than a rewrite.** `showRecentGames` needs `libraryTopSection.startsWith('recently_played')`
(`Library/index.tsx:577`); `showFavourites` needs `=== 'favourites'` (`:596`). They are mutually
exclusive by construction.

**The lane is not horizontal.** `.gameList` is
`display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr))`
(`Library/index.css:1-8`), a full-width wrapping grid; `.gameList.firstLane` changes **padding
only** (`:10-12`). Nothing in this codebase scrolls games sideways. **The horizontal strip is
the one genuinely net-new piece of this phase.**

**The header shape already exists** — `library-section-header` + `h3.libraryHeader` wrapping a
`GamesList` (`Library/index.tsx:1228-1236`) — and `GamesList` already takes `isFirstLane` /
`isRecent` / `isFavourite`.

**CORRECTED 2026-10-04 (plan-phase). The paragraph this replaces was wrong, and it was wrong in
the direction that invents work.** It read: *"The number selector has a second, backend
consumer … `recent_games.ts:15` also does `games.slice(0, await maxRecentGames())` — so it bounds
what is **stored** in `games.recent`, not only what is displayed."* Both halves are false, and the
path it cited does not exist. Measured on the tree at plan time:

- **The file is `src/backend/recent_games/recent_games.ts`**, not `src/backend/recent_games.ts`.
  `git ls-files | grep recent_games` returns exactly that path and `ipc_handler.ts`.
- **`maxRecentGames` does not bound stored history.** The slice sits in
  `getRecentGames(options?: { limited: boolean })` (~:12-19) behind `if (options?.limited)`, and it
  slices a value it *returns*; it never writes back. The only writer, `setRecentGames` (~:21-28),
  does a bare `configStore.set('games.recent', recentGames)` with no slice. `addRecentGame`
  (~:30-50) calls `getRecentGames()` with **no arguments**, so the branch is skipped and it
  operates on the full list. **`games.recent` is unbounded today.**
- **That branch is dead.** `git grep -nE 'getRecentGames\(\s*\{' -- src/` and
  `git grep -nE '\blimited\s*:' -- src/` both return zero hits — nothing passes `{ limited: true }`.
  `maxRecentGames()` (~:7-9) is reachable only from it, so it has **no live backend consumer at
  all**. The `ts-prune` / `find-deadcode` note at ~:61-66 already records it as used-in-module only.
- **The live cap is frontend-only.** `RecentlyPlayed/index.tsx` declares its own local
  `getRecentGames(libraries, limit, onlyInstalled)` at `:16` — a different binding sharing the name
  — reading `configStore.get('games.recent', [])` directly, with `limit` from
  `await window.api.requestAppSettings()` at `:52`.

The consequence is recorded against R6 below: what this SPEC framed as relocating an existing
storage bound would in fact have **introduced** an eviction policy on persisted play history.

**Lane-versus-filter behaviour is already a deliberate decision.** `Library/index.tsx:1205-1212`
is labelled *"KNOWN NUANCE -- do not 'correct' this back"*: the lane honours `showHidden` and
`onlyInstalled` but **not** store or runnability facets; the operator was told this and chose it;
making the lane honour the rest is recorded as explicitly out of scope. This phase rules the
focus row fully independent of filter state, which turns that nuance into the intended design.

## Requirements

1. **Single persisted focus-row selection**: One selection, or off, persists across restart.
   - Current: `libraryTopSection` persists one of four hardcoded enum values in GlobalConfig; the value space cannot express a store, a collection or a runnability value.
   - Target: A single focus-row selection of `{ kind, value }` — where `kind` is view / collection / store / runnability — or off, persisted in GlobalConfig.
   - Acceptance: Select a collection as the focus row, quit, relaunch — the same collection is still the focus row.

2. **FOCUS ROW section in the tier-2 panel**: Single-select, clearable, replacing the Settings dropdown as the place the choice is made.
   - Current: The choice is a `SelectField` in Settings → General. Nothing in the library panel controls it.
   - Target: A `FOCUS ROW` section in the Games tier-2 panel single-selects from every view, every collection, every store and every runnability value. Re-clicking the active entry clears it to off — the clearable single-select behaviour `FilterCollectionList` already implements.
   - Acceptance: The section lists every view, every existing collection, every store and every runnability value; picking one makes it the focus row; re-clicking the same entry clears the row.

3. **The focus row renders as one horizontal strip**: One row tall, filling the available width, above an unchanged grid.
   - Current: The lane is a full-width wrapping grid capped at `maxRecentGames` items; at most one lane exists; `.firstLane` alters padding only.
   - Target: The focus row renders as a single-row horizontal strip with the existing header treatment, inserted at the current lane position (`Library/index.tsx:1218-1238`), at a **fixed 156px card width**, holding **at most 20 games**, with forward/back controls revealing any that do not fit. The grid below renders identically to today.
   - Acceptance: The strip renders exactly one card tall; it holds at most 20 cards however many the pick matches; with more cards than fit, a forward control is present and reveals the remainder; the grid's output is unchanged against a pre-phase baseline for the same filter state.
   - **Amended 2026-10-03 (discuss-phase):** the 20-item cap, the fixed 156px width and the scroll controls were added during `/gsd-discuss-phase`. The cap makes the row a **preview**, not a second grid — uncapped, a `GOG` row on a large library would be a worse browse surface than the grid it sits above.

4. **The focus row is independent of filter state**: Hidden-games visibility is the sole exception.
   - Current: The lane honours `showHidden` and `onlyInstalled` but ignores store and runnability facets — a deliberate, documented asymmetry (`Library/index.tsx:1205-1212`).
   - Target: No view, collection, store facet, runnability facet, search term or alphabet letter changes the focus row's contents. It calls `passesHiddenLaneFilter`, so a hidden game never appears.
   - Acceptance: With Store = GOG active, the focus row still contains non-GOG games while the grid contains GOG only; a game hidden via its context menu appears in no focus row.

5. **Focus-row ordering**: Natural order for the pick, title order otherwise.
   - Current: The recently-played lane uses insertion order of `configStore` `games.recent` (`RecentlyPlayed/index.tsx:21-33`); the favourites lane uses favourites-list order.
   - Target: A recently-played focus row orders by recency. Every other pick orders by title using the existing leading-`The `-stripped `localeCompare` (`Library/index.tsx:916-922`).
   - Acceptance: A GOG focus row is alphabetical by title; a recently-played focus row leads with the most recently played game.

6. **`Recent Games to Show` removed**: The user-facing number control goes, along with the dead backend code behind it.
   - Current: `MaxRecentGames.tsx` exposes the count and the lane reads it at `RecentlyPlayed/index.tsx:52`. On the backend, `maxRecentGames()` and the `options?.limited` branch in `recent_games/recent_games.ts` are both dead — zero callers. Nothing bounds `games.recent`.
   - Target: The Settings control and its barrel export are removed, the `maxRecentGames` field leaves `common/types.ts` and its default leaves `config.ts`, and the three dead backend things come out: `maxRecentGames()` (~:7-9), the `if (options?.limited)` branch (~:14-16), and the then-unused `options?: { limited: boolean }` parameter. Display count is whatever fits the strip width, capped by R3's 20-**card** strip cap.
   - Acceptance: No `Recent Games to Show` control appears in Settings; `grep -r maxRecentGames src/` returns zero hits; `getRecentGames` takes no parameters.
   - **Amended 2026-10-04 (plan-phase), operator ruling.** As filed, this requirement also bounded stored history at a fixed **20**. That was justified by the Background claim corrected above — that the setting already governed retained history — and with that claim false, the bound was not a relocation but a **net-new irreversible eviction policy on persisted user data**. The operator ruled it out: *a phase whose own ROADMAP entry says "this is mostly a move, not a build" is the wrong place to introduce one, and the only argument for it was a misreading of the code.* A bound on `games.recent`, if ever wanted, is a standalone change judged on its own merits. **Beware the two 20s this phase now carries:** R3's 20 is a display cap on strip *cards* and survives; R6's 20 was a storage cap on persisted *entries* and is gone. They must not share a constant.

7. **`Library Top Section` removed from Settings and migrated once**: The old dropdown's value seeds the new selection and the control disappears.
   - Current: The `SelectField` is rendered in Settings → General; `libraryTopSection` is read directly at render time in `Library/index.tsx` at 4 sites.
   - Target: The Settings control is removed. On first run after upgrade, `recently_played` → a Recently-played focus row; `recently_played_installed` → a Recently-played focus row with installed-only semantics; `favourites` → a Favourites focus row; `disabled` → off. Seeding runs once, guarded by presence of the new key.
   - Acceptance: No `Library Top Section` control appears in Settings; a profile set to `favourites` shows a Favourites focus row on first upgraded launch; clearing the focus row and relaunching does not restore it.

## Boundaries

**In scope:**

- One persisted focus-row selection (`{ kind, value }` or off) in GlobalConfig
- A `FOCUS ROW` single-select, clearable section in the Games tier-2 panel
- Widening the value space from 4 hardcoded options to views + collections + stores + runnability
- Horizontal single-row strip rendering that fills the available width
- Removing both Settings controls (`LibraryTopSection`, `MaxRecentGames`) and the barrel export
- Removal of the dead `maxRecentGames()` helper and dead `options?.limited` branch in `recent_games/recent_games.ts`
- One-time migration from the four existing `libraryTopSection` values

**Out of scope:**

- **Multiple rows.** Operator decision round 4: ship one focus row, *"can always consider adding more rows later if required."* No `+`, no cap, no row list, no reordering, no duplicate policy. The N-row model is a possible follow-up phase and nothing here should preclude it.
- **A `Recently added` / `Date purchased` pick** — acquisition date does not exist for Epic, Amazon or sideloaded, is license-grant-not-purchase for Steam, and is clean only for GOG. This keeps the cross-store data-coverage problem wholly outside this phase; it stays owned by the `library-sorting-is-title-only` todo.
- **Arbitrary saved filter states as the pick** — the section is a single-select over existing single values, not a filter builder.
- **Any change to the games grid** — filtering, layout and sort behave exactly as today. The focus row is an insertion above it.
- **Making the focus row honour facets** — ruled independent, so `Library/index.tsx:1205-1212`'s KNOWN NUANCE is not revisited.
- **A global sort-field menu** — superseded in intent by natural per-pick ordering; the todo it came from is rewritten down to the data-coverage decision, not closed.
- **Sketch 005 variant D implementation** — the Views segmented control is a separate, already-sketched change. The focus row being an insertion means D is unaffected.
- **Removing the orphaned locale keys** — see Constraints; key removal has measured traps and is a discuss-phase decision, not a spec requirement.

## Constraints

- **Removing a locale key has three measured traps in this repo** (affected-locale count is not what it appears, `da`/`id`/`nl` behave differently, and `_one` plural suffixes are load-bearing). The strings being orphaned — `setting.library_top_section`, `setting.library_top_option.*`, `setting.maxRecentGames` — live in `public/locales/en/translation.json`. Whether to remove them or leave them orphaned is a **discuss-phase decision**; this phase must not remove them casually as part of deleting the components.
- **New strings go in `public/locales/en/gamelib.json` via `pnpm i18n`**, never `translation.json`, and the l10n fill across the shipped locales is part of the work.
- **Collection names are user data** and render as-is. Only the section label and the four view names are translatable.
- **`.libraryHeader` is `position: sticky; top: 0; z-index: 9`** (`Library/index.css:42-50`). With one focus row this is benign — noted because the N-row follow-up would make it a collision.
- **`.gameList.firstLane > div:has(.justPlayed) { grid-column: span 2 }`** (`Library/index.css:14-16`) is a grid-only emphasis rule with no meaning in a horizontal strip. Decide its fate explicitly rather than carrying it forward dead.
- **The focus row must reuse `GamesList`** rather than forking a card renderer — it already carries `isFirstLane` / `isRecent` / `isFavourite` and the `GameCard` wiring.
- **`engineWiring.ts:175` asserts `libraryTopSection` defaults to `'disabled'`** in a doc comment. That comment goes stale on migration and must be updated, not left to mislead.
- **No gate pins either setting by name** — a census of `meta/` and `src/**/__tests__/` returned no reference. Deleting a frontend file has previously reddened only the Meta jest project in this repo, so run that project explicitly after the deletion rather than assuming the absence of a name reference means the absence of a gate.

## Acceptance Criteria

- [ ] A collection selected as the focus row is still the focus row after quit and relaunch
- [ ] The `FOCUS ROW` section lists every view, every existing collection, every store and every runnability value
- [ ] Picking an entry makes it the focus row; re-clicking the same entry clears the row to off
- [ ] With no collections, the section omits the collections group
- [ ] The section's groups render in a fixed order
- [ ] The strip renders exactly one card tall
- [ ] Narrowing the window reduces the visible card count without wrapping to a second row
- [ ] Strip content narrower than the available width shows no overflow affordance
- [ ] The strip holds at most 20 cards however many games the pick matches
- [ ] With more cards than fit, a forward control is present and reveals the remainder
- [ ] Gamepad focus moving past the last visible card scrolls that card into view
- [ ] Strip cards are a fixed 156px wide and do not change size as the window resizes
- [ ] A pick matching zero games renders no strip at all
- [ ] A persisted selection naming a deleted collection renders no strip and does not crash
- [ ] The grid's output is unchanged against a pre-phase baseline for the same filter state
- [ ] With Store = GOG active, the focus row contains non-GOG games and the grid contains GOG only
- [ ] A filter state yielding zero grid results still renders the focus row
- [ ] A GOG focus row is alphabetical by title; a recently-played focus row leads with the most recently played game
- [ ] Two games with identical titles order stably, tie-broken on `app_name`
- [ ] No `Recent Games to Show` control appears in Settings
- [ ] ~~Playing a 21st distinct game evicts the oldest entry from `games.recent`~~ — **struck 2026-10-04**, R6 amendment: no storage bound is introduced
- [ ] ~~A profile whose `games.recent` already holds more than 20 entries loses none on upgrade~~ — **struck 2026-10-04**, R6 amendment: nothing in this phase writes to `games.recent`
- [ ] `grep -r maxRecentGames src/` returns zero hits and `getRecentGames` takes no parameters
- [ ] The stored recent-games list preserves recency order
- [ ] No `Library Top Section` control appears in Settings
- [ ] `libraryTopSection: favourites` yields a Favourites focus row on first upgraded launch
- [ ] `libraryTopSection: recently_played_installed` yields a Recently-played focus row with installed-only semantics
- [ ] `libraryTopSection: disabled` yields no focus row
- [ ] Clearing the focus row and relaunching does not restore it from the old setting
- [ ] **MUST NOT**: the focus row never renders a hidden game
- [ ] **MUST NOT**: removing the number setting never deletes already-stored `games.recent` entries
- [ ] **MUST NOT**: `games.customCategories` is not written by any focus-row code path
- [ ] **MUST NOT**: the focus row's visible name is never a raw i18n key

## Edge Coverage

**Coverage:** 14/21 rows resolved (12 explicit + 2 backstop) · 0 unresolved · 5 dismissed · 2 struck 2026-10-04 (both R6, see the amendment)

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ✅ covered (explicit) | Probe matched no shape cue; reviewed manually — a selection naming a deleted collection or signed-out store renders no strip and does not crash |
| adjacency | R2 | ✅ covered (explicit) | Re-clicking the active entry clears to off, per `FilterCollectionList`'s shipped behaviour |
| empty | R2 | ✅ covered (explicit) | No collections → collections group omitted, per the `FilterCollectionList__empty` precedent |
| ordering | R2 | ✅ covered (explicit) | Section groups render in a fixed order |
| idempotency | R2 | ✅ covered (explicit) | Selecting the active value twice is clear-then-set, the same criterion as R2 adjacency |
| concurrency | R2 | ⛔ dismissed | Single-instance app (Phase 46 owns that guard); GlobalConfig writes are synchronous |
| unclassified | R3 | ✅ covered (explicit) | Reviewed manually — zero-match pick renders no strip; content narrower than the viewport shows no overflow affordance |
| adjacency | R4 | 🧪 backstop | Held-out test: no filter combination alters focus-row contents |
| empty | R4 | ✅ covered (explicit) | Zero grid results still renders the focus row; `FilterZeroResult` governs the grid only |
| ordering | R4 | ⛔ dismissed | The requirement is a negative — nothing is ordered by it |
| idempotency | R4 | ⛔ dismissed | The requirement is a negative — nothing is applied by it |
| concurrency | R4 | ⛔ dismissed | Same as R2 concurrency |
| adjacency | R5 | ✅ covered (explicit) | Identical titles tie-break stably on `app_name` |
| empty | R5 | 🧪 backstop | Held-out test: 0-game and 1-game rows order without error |
| ordering | R5 | ✅ covered (explicit) | Same tie-break criterion as R5 adjacency |
| boundary | R6 | ⛔ struck 2026-10-04 | Described the storage bound the R6 amendment drops — there is no boundary left to cover |
| adjacency | R6 | ⛔ struck 2026-10-04 | Described the same dropped bound; with no writer, no stored list can be truncated |
| empty | R6 | ✅ covered (explicit) | No recent games → no strip, same criterion as R3 |
| ordering | R6 | ✅ covered (explicit) | Recency order preserved — nothing in this phase now alters the stored list |
| precision | R6 | ⛔ dismissed | The bound is an integer literal in source, not user input — there is no precision surface |
| unclassified | R7 | ✅ covered (explicit) | Reviewed manually — migration runs once, guarded by presence of the new key; clearing the row and relaunching does not restore it |

Backstop rows (R4 adjacency, R5 empty) must be carried into plan-phase `must_haves`.

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT render a hidden game in the focus row | R4 | resolved | test — a game you explicitly hid reappearing in a shelf is a trust break, not an independence feature |
| MUST NOT delete already-stored `games.recent` entries when removing the number setting | R6 | resolved | **structural, not test** (revised 2026-10-04) — the original rationale was inverted: the setting never governed retained history, so its removal cannot destroy play history. The prohibition is KEPT because it still correctly constrains the phase, and after the R6 amendment no task writes to `games.recent` at all, so no code path exists that could delete an entry. Verified by the absence of a writer, not by a behavioural test |
| MUST NOT mutate `games.customCategories` | R2 | resolved | test — the section READS collections; writing that shared key would corrupt CategoriesManager state |
| MUST NOT ship a raw i18n key as the focus row's visible name | R2 | resolved | test — this repo has a whole phase (41) on i18n gate honesty; a visible `gamelib:…` key is a shipped defect |

**Dropped at Stage 2 as routine engineering** (owned by the edge probe or code review): must not throw
on a malformed persisted selection; must not mutate its input list; must not make grid behaviour
depend on the focus row.

**Canon-referral breadcrumb:** *"must not send the selection off-device"* is canon privacy and has
no network path in this feature — not minted here.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                              |
|--------------------|-------|------|--------|--------------------------------------------------------------------|
| Goal Clarity       | 0.94  | 0.75 | ✓      | Single-row model removes the cap/duplicate/reorder question space  |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | 8 explicit out-of-scope items; N-rows deferred by operator decision |
| Constraint Clarity | 0.82  | 0.65 | ✓      | `maxRecentGames`'s backend consumer and the locale-key trap named   |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 24 positive + 4 negative pass/fail criteria                        |
| **Ambiguity**      | 0.12  | ≤0.20| ✓      |                                                                    |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher (scout) | What exists today? | Exactly 1 lane max; lanes are wrapping grids not strips; header shape exists; no row definitions anywhere |
| 1 | Researcher | Rows vs the grid vs Views? | **Rows are INSERTED above the grid; the grid behaves as it does now.** None of the three options offered — it maps 1:1 onto the existing lane insertion point |
| 2 | Researcher | Do rows honour active filters? | **Independent — filters are ignored.** Turns `Library/index.tsx:1205`'s KNOWN NUANCE into intended design |
| 3 | Simplifier | Hidden games under "independent"? | **Keep hidden hidden** via `passesHiddenLaneFilter` |
| 3 | Boundary Keeper | Order, cap, reordering? | **Natural order per pick, title otherwise.** Implies no `Recently added` pick, keeping acquisition-date coverage out of this phase |
| 4 | Simplifier | Operator found `libraryTopSection` in Settings. Rename to "Focus row" — one row or N? | **ONE focus row.** *"Simpler change, can always consider adding more rows later if required."* Cap, duplicates, reordering and the `+` all leave scope; R1/R2/R6/R7 rewritten |
| 4 | Failure Analyst | Dropping the number selector — consequences? | `maxRecentGames` has a **second, backend consumer** bounding stored history (`recent_games.ts:15`). Display becomes width-driven; storage gains a fixed bound of 20, and existing longer lists must not be truncated |

**Scope reduction recorded, not hidden.** This SPEC was first written for N rows with a cap of 10
(commit `c6e294020`). The operator then found the shipped `libraryTopSection` feature and chose the
single-row model. The `+`-adds-many model was the interviewer's inference from *"you can add + and
select a row filter list"*, not a stated requirement — the N-row framing originated here, not with
the operator.

**Interviewer corrections also recorded:** round 1's three-option menu missed the actual answer
(insertion); the phase-number and `Depends on` reasoning preceding this spec was wrong on both
counts (see the ROADMAP entry and STATE Roadmap Evolution note); and the first Edge Coverage header
in `c6e294020` reported `16/28 · 12 dismissed` from a hand count against a table that actually held
`18 + 2 + 8`.

---

*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Spec created: 2026-10-03 · revised 2026-10-03 (N rows → one focus row)*
*Next step: /gsd-discuss-phase 48 — implementation decisions (strip sizing mechanism, whether the FOCUS ROW section reuses `FilterFacetGroup`, persistence shape for `{kind,value}`, and whether the orphaned locale keys are removed or left)*
