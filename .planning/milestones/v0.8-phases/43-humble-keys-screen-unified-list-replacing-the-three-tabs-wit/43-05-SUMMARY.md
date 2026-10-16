---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 05
subsystem: ui
tags: [react, css-grid, humble, testing, jest]

# Dependency graph
requires:
  - phase: 42
    provides: HumbleKeyRow's D-42/D-42-01/D-42-03 affordances (claim, gift, settle-undo, ownership override, store indicator) and their D-22 read-only contract
provides:
  - Three-column CSS Grid (TYPE/GAME/KEY) shared by the header row and every data row via one grid-template-columns declaration on the combined .humbleKeysColumnHeader, .humbleKeyRow selector
  - HumbleKeyRow restructured into exactly three grid children in source order, with every interactive affordance relocated into the KEY cell
  - The D-43-17 "interactivity lives in KEY only" contract, replacing the retired D-22 "read-only, N sanctioned exceptions" contract
  - 55 passing component tests (47 re-pinned + 8 new structural gates for REQ-43-13/14/15), including a mutation-proven, non-vacuous zero-interactivity gate
affects: [43-06, 43-07, 43-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared CSS Grid template declared once via a combined selector (.humbleKeysColumnHeader, .humbleKeyRow) so a header row and its data rows can never drift apart in column geometry"
    - "Row separators live on the grid container, never on a fractional (1fr) grid track (WKWebView 1px-border-on-fractional-track trap)"
    - "Structural interactivity gates walk a subtree (TYPE/GAME) for button/a/onClick against a maximally-configured fixture, proven non-vacuous by asserting the same fixture DOES render those elements elsewhere (KEY)"

key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx

key-decisions:
  - "Rescoped .humbleKeyRowAction > .humbleKeyGiftButton/.humbleKeyClaimGroup { width: 100% } as a descendant selector under .humbleKeyColumnCell .humbleKeyActionRow (not a direct-child selector on the cell itself), since the button/group is nested one level inside the renamed action-row wrapper, not a direct child of the KEY cell"
  - "No explicit grid-column numbers on the three cell classes — implicit CSS Grid source-order placement keeps the row's three children compatible with the header row's differently-named columnType/columnGame/columnKey classes (plan 43-07) under the same shared grid template"
  - "Single uniform --space-sm gap across .humbleKeysHeaderTop rather than an asymmetric per-sibling override, since the UI-SPEC only pins the search-box-to-refresh-button gap"

requirements-completed: [REQ-43-13, REQ-43-14, REQ-43-15, REQ-43-19, REQ-43-23]

# Metrics
duration: ~35min
completed: 2026-09-10
---

# Phase 43 Plan 05: Humble Key Row Column Geometry Contract Summary

**Converted the Humble Keys row from a six-cell flex strip to a three-column CSS Grid (TYPE/GAME/KEY) sharing one grid template with the header row, moved every interactive affordance into the KEY cell, and replaced the row's D-22 read-only contract with D-43-17's mutation-proven "interactivity lives in KEY only" gate.**

## Performance

- **Duration:** ~35 min (measured from the first CSS commit to the test-suite commit; earlier read/planning work in this session is not included)
- **Completed:** 2026-09-10
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 3

## Accomplishments

- `index.css`'s `.humbleKeyRow` converted from `display: flex` to the UI-SPEC's `grid-template-columns: 6.5rem minmax(0, 1fr) 20rem` on a single combined selector (`.humbleKeysColumnHeader, .humbleKeyRow`), with the row separator kept on the grid container (never a fractional track) and the old fixed-basis `.humbleKeyRowAction`/`.humbleKeyRowInfo` rules deleted
- `HumbleKeyRow` restructured into exactly three direct children — `humbleKeyTypeCell`, `humbleKeyGameCell`, `humbleKeyColumnCell` — in that order, with every condition, handler, i18n key, default string and className on the affordances themselves left unchanged (verified byte-for-byte via diffed t()/tGamelib() key sets, onClick handler sets, and window.api call sets against the pre-move file)
- Old D-22 "read-only, N sanctioned exceptions" contract comment replaced with the new D-43-17 "interactivity lives in KEY only" contract; the WR-04 undo-override comment's stale tab-hop explanation rewritten for the unified list
- 55 component tests passing (47 pre-existing, re-pinned to the new tree shape, plus 8 new tests for the three-children shape, REQ-43-15's non-vacuous zero-interactivity gate, REQ-43-13's status-line placement, REQ-43-14's UrgencyBadge placement, ownership-badge/override placement, and a CSS source-census check)
- REQ-43-15's zero-interactivity gate mutation-proven in both directions (see Deviations/Issues section below for the transcript)

## Task Commits

Each task was committed atomically:

1. **Task 1: Convert index.css to the Column Geometry Contract** - `50d8eba9a` (feat)
2. **Task 2: Regroup HumbleKeyRow into three grid children and rewrite the interactivity contract** - `c61b3ef9c` (feat)
3. **Task 3: Re-pin the 47 row tests against the three-column structure** - `686c38794` (test)

_Note: per this execution's explicit constraints, STATE.md/ROADMAP.md/REQUIREMENTS.md are intentionally not modified or committed by this plan — that is handled centrally by the orchestrator across all plans in this phase. No separate "plan metadata" commit was created; this SUMMARY.md is committed on its own._

## Files Created/Modified

- `src/frontend/screens/Humble/Keys/index.css` - One shared `grid-template-columns` declaration for header + data rows, three cell classes (`humbleKeyTypeCell`/`humbleKeyGameCell`/`humbleKeyColumnCell`), action-row/status-line chrome, controls-row/column-header/filtered-empty-state/sort-picker chrome; `.humbleKeyRowAction`/`.humbleKeyRowInfo` deleted
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` - Restructured into three grid children (TYPE/GAME/KEY); D-22 comment replaced with D-43-17; WR-04 tab-hop comment reworded
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` - 47 tests re-pinned to the new tree shape, 8 new structural tests added

## Decisions Made

See `key-decisions` in the frontmatter above (CSS descendant-selector rescoping, no explicit `grid-column` numbers, uniform header-row gap).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a self-inflicted literal-substring grep failure in the CSS Column Geometry Contract comment**
- **Found during:** Task 1
- **Issue:** The first draft of the explanatory comment above the shared `grid-template-columns` declaration contained the literal substring `grid-template-columns` (quoted inside backticks while describing the rule itself), which would have made the Task 1 acceptance criterion `grep -c 'grid-template-columns' index.css` return `2` instead of the required `1`.
- **Fix:** Reworded the comment to say "column-template declaration" instead of quoting the property name.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.css`
- **Verification:** `grep -c 'grid-template-columns' src/frontend/screens/Humble/Keys/index.css` returns `1`, confirmed before committing.
- **Committed in:** `50d8eba9a` (Task 1 commit — fixed pre-commit, not a separate commit)

**2. [Rule 1 - Bug] Fixed the same class of self-inflicted literal-substring grep failure in the new D-43-17 contract comment**
- **Found during:** Task 2
- **Issue:** The first draft of the D-43-17 comment, while explaining that the old D-22 premise is retired, quoted the retired premise as `"the row is read-only, with FOUR sanctioned exceptions"` — containing the literal substring `FOUR sanctioned exceptions`, which would have made the Task 2 acceptance criterion `grep -c 'FOUR sanctioned exceptions' index.tsx` return `1` instead of the required `0`.
- **Fix:** Reworded the retired-premise description to avoid quoting the exact phrase: "the row was read-only apart from a small, fixed count of sanctioned exceptions".
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`
- **Verification:** `grep -c 'FOUR sanctioned exceptions' src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` returns `0`, confirmed before committing. `grep -c 'D-22'` returns `1` (the one intentional reference, naming what the contract replaces).
- **Committed in:** `c61b3ef9c` (Task 2 commit — fixed pre-commit, not a separate commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — self-authored comment-wording bugs caught by the plan's own acceptance-criteria greps before committing).
**Impact on plan:** Both fixes are wording-only changes to explanatory comments; no behavior, structure, or test outcome was affected. No scope creep.

## Issues Encountered

None blocking. One verification step worth recording in full: the REQ-43-15 mutation proof.

**Mutation proof for REQ-43-15 (zero-interactivity in TYPE/GAME), both directions:**

1. Baseline: `npx jest --selectProjects Frontend src/frontend/screens/Humble/Keys/components/HumbleKeyRow` → `Tests: 55 passed, 55 total`.
2. Mutated `HumbleKeyRow/index.tsx` (via a scripted, reversible edit) to move the fuzzy-match "Not the same game" `<button>` out of `humbleKeyColumnCell` and into `humbleKeyGameCell` (right after `UrgencyBadge`).
3. Re-ran the same command. Result: `Tests: 2 failed, 53 passed, 55 total`, with the two failures being, by name:
   - `HumbleKeyRow three-column structure (43-05, D-43-13/14/15/17) › renders zero interactive elements (button/a/onClick) inside humbleKeyGameCell, for a fully-affordanced row (REQ-43-15)` — failed with `Expected length: 0, Received length: 1`, showing the moved `<button className="humbleKeyOwnedOverride">...</button>`.
   - `HumbleKeyRow three-column structure (43-05, D-43-13/14/15/17) › renders every configured affordance as an interactive element inside humbleKeyColumnCell, for a fully-affordanced row (REQ-43-15)` — failed with `Expected: >= 4, Received: 3` (the moved button no longer counted inside KEY).
   - The `humbleKeyTypeCell` zero-interactivity test correctly stayed green (the mutation never touched TYPE), confirming the gate is scoped per-cell and not a blanket false-positive detector.
4. Reverted via `cp` from a pre-mutation backup copy. `git diff --quiet src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` confirmed byte-for-byte parity with the committed `HEAD` state.
5. Re-ran the suite: `Tests: 55 passed, 55 total` again, and `npx tsc --noEmit` clean.

This proves the REQ-43-15 gate is neither vacuous (it fires on a real regression) nor a false detector (it doesn't fire on the untouched cell), in both the failing and the passing direction.

**Additional verification performed (all green, not deviations):**
- `npx tsc --noEmit` — zero errors, run after each of Tasks 2 and 3.
- `node meta/lintScoped.cjs --tests` — `638 problems (0 errors, 638 warnings)`, `tests: PASS` (exactly at the documented 638 ceiling, zero padding).
- `node meta/lintScoped.cjs --src` — `1123 problems (0 errors, 1123 warnings)`, `production: PASS` (exactly at the documented 1123 ceiling, zero padding).
- `grep -c 'getComputedStyle\|offsetWidth\|clientWidth\|getBoundingClientRect\|toHaveStyle' __tests__/index.test.tsx` returns `0` — no test in this DOM-less (no-jsdom) project claims to measure rendered geometry.
- No claim is made here that the backend suite or the repo-wide `pnpm lint`/`prettier --check` are green — both are documented as red at HEAD against an existing allowlist ledger, unrelated to this plan's scope. `npx prettier --check` on the two touched files also reports pre-existing formatting drift that was already present in the file before this plan's changes (confirmed against a pre-Task-2 copy of `HumbleKeyRow/index.tsx`), consistent with the repo-wide "prettier gate is red" condition; this plan did not attempt to fix it, as doing so is out of this plan's scope and would risk unrelated reformatting noise.

## Known Stubs

None. This plan is a pure structural move (behavior-preserving); no new UI surface was introduced that lacks a data source.

## Threat Flags

None. All three modified files were already in this plan's declared `files_modified` list and threat register (T-43-01, T-43-15, T-43-16, T-43-17, T-43-18); no new network endpoint, auth path, file-access pattern, or schema change at a trust boundary was introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The three-column grid and the `humbleKeyTypeCell`/`humbleKeyGameCell`/`humbleKeyColumnCell` class names are now available for plan 43-06 (the five-scenario KEY-cell redesign) and plan 43-07 (the column-header row and controls-row markup, which shares the same grid template via `.humbleKeysColumnHeader`).
- REQ-43-19 (rendered column geometry) is intentionally NOT verified by this plan's test suite — this project has no jsdom/browser automation, so only a source-census test (proving the CSS string was written) exists here. Actual pixel-geometry verification is plan 43-09's live gate, as scoped by the plan's own acceptance criteria.
- No blockers for downstream plans.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*

## Self-Check: PASSED

- Commit `50d8eba9a` (Task 1): FOUND in `git log --oneline --all`
- Commit `c61b3ef9c` (Task 2): FOUND in `git log --oneline --all`
- Commit `686c38794` (Task 3): FOUND in `git log --oneline --all`
- `src/frontend/screens/Humble/Keys/index.css`: FOUND
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`: FOUND
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx`: FOUND
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-05-SUMMARY.md`: FOUND

No missing items.
