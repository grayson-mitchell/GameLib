---
phase: quick-260926-acw
plan: 01
subsystem: ui
tags: [css, scss, focus-indicator, gamepad, accessibility, theming, gamecard]

requires:
  - phase: quick-260925-pga
    provides: the unified .gameCard/.gameListItem hover+focus ring this plan splits back apart
provides:
  - Shared --focus-ring-color / --focus-ring-halo / --focus-ring-width / --focus-ring-fill tokens in themes.scss's base body {} block
  - A canonical X:focus-visible, X:focus:is(body.controllerLayout *) selector pair applied to Console Mode chips/pills, the game-page Steam install caret, and the tier-2 filter panel (FilterFacetGroup header/row, FilterMoreGroup "only", NavItem)
  - A theme-survival fix for NavItem's focus outline (was consuming the undefined --text-hover token in gruvbox_dark and dracula)
  - Split hover/focus looks on .gameCard and .gameListItem, with the pga stale-focus suppression rescoped to body:not(.controllerLayout)
  - A cross-surface source-text gate (focusIndicator.test.ts) plus a rewritten gameCardFocusRing.test.ts
  - The actioned todo moved to ready: live-gate with a live-sweep checklist
affects: [gamepad-focus, console-mode, navshell, library-grid, theming]

tech-stack:
  added: []
  patterns:
    - "Canonical dual-arm focus selector: X:focus-visible, X:focus:is(body.controllerLayout *) — the suffix form, never a body.controllerLayout X prefix, because tier-2 rules nest inside .NavShell__tier2Portal where a prefix form cannot match"
    - "OUTSET recipe (outline + outline-offset: 2px + box-shadow halo) for elements with clearance; INSET recipe (negative outline-offset + inset box-shadow + background fill) for rows inside the scroll-clipped tier-2 panel"
    - "Focus tokens declared on body, not :root, so var(--accent) resolves against the active body.<theme> block"

key-files:
  created:
    - src/frontend/styles/__tests__/focusIndicator.test.ts
  modified:
    - src/frontend/themes.scss
    - src/frontend/screens/ConsoleMode/index.scss
    - src/frontend/screens/Game/GamePage/index.css
    - src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss
    - src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss
    - src/frontend/components/UI/NavShell/components/NavItem/index.scss
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
    - .planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md
    - .planning/quick/260926-acw-give-controller-keyboard-focus-a-percept/260926-acw-PLAN.md

key-decisions:
  - "Kept the pga round-3 'hover wins while mousing' suppression for mouse-only sessions, but scoped it to body:not(.controllerLayout) so a resting cursor no longer erases gamepad focus once a controller is active"
  - "Raised .FilterFacetRow's focus rule to carry the .FilterFacetGroup ancestor (specificity 0,3,0) so it outranks .FilterFacetGroup .FilterFacetRow--checked (0,2,0) regardless of source order, keeping the ring/fill visible on a checked+focused row"
  - "Did not touch NavTabs tier-1's own :focus-visible rule (also consumes --text-hover) — recorded as a remaining gap in the todo rather than swept in scope"

requirements-completed: [QUICK-260926-acw]

duration: 45min
completed: 2026-09-26
---

# Quick Task 260926-acw: Give controller/keyboard focus a perceptible indicator — Summary

**Added shared two-tone `--focus-ring-*` CSS tokens and a dual-arm `:focus-visible` / `:focus:is(body.controllerLayout *)` selector pair across Console Mode, the game-page caret, the tier-2 filter panel and the library grid, so gamepad-driven focus (a bare untrusted `.focus()` call that browsers often don't treat as `:focus-visible`) paints a visible, hover-distinct ring; also fixed a theme-survival bug that dropped NavItem's focus outline entirely in gruvbox_dark and dracula.**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-09-26T00:19:00Z (approx, per orchestrator dispatch)
- **Completed:** 2026-09-26T01:04:09Z
- **Tasks:** 3/3 completed
- **Files modified:** 10 (1 created, 9 modified)

## Resume context

This was a **resume of an already-committed, never-executed plan** (authored 2026-09-26 10:22,
commit `21ee6feaa`). The plan directory contained only `260926-acw-PLAN.md` with no
`260926-acw-SUMMARY.md`, and no implementation commit touched any of its `files_modified` paths
before this session. All three tasks were executed fresh in this session.

**Plan verify-block fix (pre-existing, orchestrator-applied, committed here).** Before execution
began, the orchestrator found all three `<verify>` blocks in `260926-acw-PLAN.md` prefixed with a
Windows path (`cd /c/Users/grays/Projects/GameLib && `) from the machine the plan was authored on.
On this Mac every verification would have failed at the first command before running anything
real. The orchestrator stripped the prefix from all three occurrences before dispatch; that edit
was uncommitted at the start of this session and is included in Task 1's commit
(`4081e1f0b`), since the commands now run correctly from the repo root. No other Windows-specific
assumptions were found in the plan.

## Accomplishments

- Four shared focus tokens (`--focus-ring-color`, `--focus-ring-halo`, `--focus-ring-width`,
  `--focus-ring-fill`) added to `themes.scss`'s base `body {}` block, resolving per-theme via
  `var(--accent)` / `var(--body-background)`.
- Nine focus rules across six files rewritten to the canonical
  `X:focus-visible, X:focus:is(body.controllerLayout *)` selector pair, using an OUTSET recipe
  where the element has clearance (Console Mode chips/pills, the game-page caret) and an INSET
  recipe where it doesn't (the scroll-clipped tier-2 filter panel rows).
- Fixed a theme-survival bug: NavItem's old focus outline consumed the undefined `--text-hover`
  token in gruvbox_dark and dracula, silently dropping the whole declaration and leaving
  `FilterCollectionList__row` with no focus outline at all in those two themes.
- Split `.gameCard`/`.gameListItem` hover and focus back apart (260925-pga had unified them) and
  rescoped all three stale-focus suppression rules to `body:not(.controllerLayout)`, so a mouse
  cursor merely resting over the library grid no longer erases gamepad focus while a controller is
  active.
- Added `focusIndicator.test.ts`, a 28-assertion cross-surface source-text gate compiling every
  touched SCSS file with `sass` and checking token presence/resolution, both selector arms, token
  consumption, the hover/focus split, the prefix-nesting trap, and the `--text-hover` regression.
- Rewrote `gameCardFocusRing.test.ts`'s 11 original assertions into 16 assertions matching the new
  split contract.
- Moved the actioned todo to `ready: live-gate` with a corrected pga-adjacency finding, the F1/F2
  mechanism, the restyled-surface list, remaining unswept surfaces, and a 7-item live-sweep
  checklist. **The todo remains in `pending/` — it is not closed by this task.**

## Task Commits

1. **Task 1: Shared focus tokens, Console Mode, caret, tier-2 panel** - `4081e1f0b` (feat)
2. **Task 2: Split game-card hover/focus, scope stale-focus suppression** - `c35d55bdf` (feat)
3. **Task 3: Cross-surface gate, todo moved to ready: live-gate** - `00bc6fa1f` (test)

_No separate plan-metadata commit was made per this task's constraints — the orchestrator handles
the docs commit for STATE.md/ROADMAP.md; this SUMMARY.md and the todo's status change are the only
docs artifacts here, and the todo change was committed as part of Task 3 since it was one of that
task's own `files_modified`._

## Files Created/Modified

- `src/frontend/themes.scss` - shared `--focus-ring-*` tokens in the base `body {}` block
- `src/frontend/screens/ConsoleMode/index.scss` - split hover/focus on `.consoleChip`,
  `.consoleChip.active`, `.consoleQuitButton`, `.consoleQuitButton.danger`
- `src/frontend/screens/Game/GamePage/index.css` - new focus rule for
  `.SteamInstallCaret .dropdownButton`
- `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss` - INSET focus on
  the group header and `.FilterFacetRow`, ancestor-raised for checked-row precedence
- `src/frontend/components/UI/NavShell/components/FilterMoreGroup/index.scss` - INSET focus on
  `.FilterMoreGroup__only`
- `src/frontend/components/UI/NavShell/components/NavItem/index.scss` - INSET focus, replacing the
  undefined-token outline
- `src/frontend/screens/Library/components/GameCard/index.css` - split `.gameCard`/`.gameListItem`
  hover vs. focus, rescoped 3 stale-focus suppression rules
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts` -
  rewritten to the split contract
- `src/frontend/styles/__tests__/focusIndicator.test.ts` - new cross-surface gate
- `.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md` -
  `ready: code` → `ready: live-gate`, desk-fix section and live-sweep checklist appended
- `.planning/quick/260926-acw-give-controller-keyboard-focus-a-percept/260926-acw-PLAN.md` -
  Windows path prefix stripped from all 3 `<verify>` blocks

## Deviations from Plan

### Auto-fixed Issues

None in the Rule 1/2/3 sense — no bugs, missing critical functionality, or blockers were found
requiring an unplanned fix. Two judgment calls the plan explicitly delegated to the executor:

**1. [Plan-delegated judgment] `.FilterFacetRow` focus rule raised to carry the `.FilterFacetGroup`
ancestor.** The plan's Task 1 step 5 identified that `.FilterFacetGroup .FilterFacetRow--checked`
(specificity 0,2,0) sits after the bare `.FilterFacetRow:focus-visible` (also 0,2,0) in source
order, so a checked+focused row's background could win over the focus fill by cascade order alone,
and offered two options: reorder the rules, or raise the focus rule's specificity. Chose the
specificity route — added the `.FilterFacetGroup` ancestor to the focus selector, taking it to
0,3,0 — so the fill wins regardless of future reordering, consistent with the existing
`--checked` rule's own precedent for using an ancestor prefix to win specificity fights in this
file.
- Files: `src/frontend/components/UI/NavShell/components/FilterFacetGroup/index.scss`
- Commit: `4081e1f0b`

**2. [Plan-delegated judgment, per CLAUDE.md's mandatory prettier-check-in-verify rule] Ran
`npx prettier --write` on `themes.scss` before the Task 1 commit.** The plan's own verify block
only ran `--check`; adding the tokens produced one prettier violation (the multi-line
`color-mix()` value), which was reformatted in place before committing. This satisfies CLAUDE.md's
"A formatter check belongs in every task's `<verify>`" convention rather than leaving a violation
for a later gate to catch.
- Files: `src/frontend/themes.scss`
- Commit: `4081e1f0b`

### pga Round-3 Correction (recorded per plan's `<verification>` requirement)

The todo's original "Adjacency to quick `260925-pga`" section speculated that pga's hover/focus
unification "may compound this defect". Investigation at plan time (F3, carried into this
execution) found the actual mechanism more specific: pga did **not** touch `:focus-visible` and
did **not** touch any of the three surfaces this todo names (Console Mode, the tier-2 filter
panel, the game-page caret) — it only unified `.gameCard`/`.gameListItem` hover and focus. The real
compounding effect was pga's "hover wins while mousing" stale-focus suppression firing whenever the
mouse cursor was merely *resting* over the grid (not just while actively mousing), erasing gamepad
focus on library cards. This correction is recorded in the todo's desk-fix section (commit
`00bc6fa1f`).

**`body:not(.controllerLayout)` scoping, as a deviation from pga round 3:** pga's three stale-focus
suppression rules now only fire in mouse-only sessions. This preserves the operator's original
"hover wins while mousing" choice for mouse-only use, while stopping it from firing during a
controller session. pga's own pending Task 3 human check (steps 1-3 and 5) is superseded by this
plan's split — those steps assumed the unified hover/focus contract that Task 2 here replaces.

## Known Stubs

None. No hardcoded empty values, placeholder text, or unwired data sources were introduced — all
changes are CSS selectors/tokens and source-text test assertions.

## Threat Flags

None. This plan's own threat model (T-acw-01, T-acw-SC) covers the full scope: CSS and
source-text-test changes only, no new trust boundary, no package installs (`sass` was already a
devDependency). No new network endpoint, auth path, file access pattern, or schema change was
introduced.

## Live Verification Pending

**Live verification pending: the todo remains in `pending/` with `ready: live-gate`; see its
live-sweep checklist.** This plan proves (via `pnpm codecheck`, `pnpm lint`, `pnpm planning-gates`,
`sass` compilation of every touched SCSS file, and the two jest source-text gates) that the focus
rules exist, are shaped correctly, and consume the shared tokens — it does **not** prove the
indicator is actually perceptible to an operator on real hardware in real themes. Only the
operator's live controller sweep (checklist in the todo) can close that gap and move the todo to
`completed/`.

## Verification Results

- `npx prettier --check` on every written/modified path in all three tasks: **clean** (one
  violation in `themes.scss` was fixed in place before committing).
- `sass.compile()` on all five touched SCSS files (`themes.scss`, `ConsoleMode/index.scss`,
  `FilterFacetGroup/index.scss`, `FilterMoreGroup/index.scss`, `NavItem/index.scss`): **all
  compile cleanly**.
- Compiled-selector assertions (no prefix-form `body.controllerLayout` leak; the
  `.FilterFacetRow:focus:is(body.controllerLayout *)` gamepad arm present): **pass**.
- `npx jest src/frontend/styles/__tests__/focusIndicator.test.ts
  src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts`: **44/44
  tests pass**.
- `pnpm codecheck`: **pass** (no output, `tsc --noEmit` clean on both project configs).
- `pnpm lint`: **pass** — 0 errors, 638 pre-existing warnings unrelated to this change
  (`production: PASS | tests: PASS`).
- `pnpm planning-gates`: **13/13 gates pass**, including `todo-frontmatter-gate.py` (validates the
  todo's `severity`/`platform`/`ready` frontmatter) and `uat-visibility-gate.py`.
- `grep -c "^ready: live-gate$"` on the todo file: **1** (confirmed).

## Self-Check: PASSED

Verified the following exist on disk / in git history:
- `src/frontend/styles/__tests__/focusIndicator.test.ts` — FOUND
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts` (rewritten)
  — FOUND
- Commit `4081e1f0b` (Task 1) — FOUND in `git log`
- Commit `c35d55bdf` (Task 2) — FOUND in `git log`
- Commit `00bc6fa1f` (Task 3) — FOUND in `git log`
- `.planning/todos/pending/2026-09-25-controller-focus-has-no-perceptible-affordance.md` still in
  `pending/` (not moved to `completed/`), `ready: live-gate` present — FOUND
- `git status --short` at end of session: clean working tree — CONFIRMED
