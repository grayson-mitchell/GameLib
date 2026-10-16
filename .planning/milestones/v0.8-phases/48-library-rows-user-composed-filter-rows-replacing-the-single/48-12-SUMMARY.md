---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 12
subsystem: ui
tags: [css, grid-parity, resize-observer, layout-effect, focus-row, source-gate, jest]
gap_closure: true
gap_ids: [G-48-8c]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: FocusRowStrip, its 15px-class clearance and clearance-aware scroll-into-view (48-10), the opaque chevron disc (48-11)
provides:
  - "A focus-row strip card is the width one grid column takes at every container width, derived by the grid's own auto-fill/minmax arithmetic over the strip's content box and written as `--focus-row-card-width` before first paint and on every resize (G-48-8c)"
  - "`pageScrollDelta` pages exactly one grid row in the zero-slack geometry (1px whole-card tolerance)"
  - "End-card rings stay unclipped across the 156-336px card range: 15px inline clearance and bleed, width-scaled vertical room"
  - "A resize feedback guard: 0.5px write epsilon plus a 250ms A-to-B-to-A hold"
affects: [48-UAT items 5 and 6, /gsd-verify-work 48, FocusRowStrip, gap G-48-8c]

plan_head_before: d24e768183c23dcf249e8719f5e005c79d0d83b5
plan_head_after: ae9054a549d07b8fd2fcc26e6c5a0c133d70d860

actuals:
  tokens: 9000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "Derive, do not read: a pure function over the same inputs the grid uses, so the strip never depends on grid mount state (SPEC R4 independence)"
    - "Source gates parse both stylesheets and the exported JS mirror and compare them; an absent match throws instead of falling back to a literal"
    - "Per-element write history with an injectable clock for a feedback-loop guard"

key-files:
  created: []
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts
    - src/frontend/screens/Library/components/FocusRowStrip/index.tsx
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts

key-decisions:
  - "Card width is derived (gridColumnWidth over the track's content box), not read from the rendered grid: same input so identical by construction, no dependency on grid mount state, provable at the desk"
  - "The width is an inline custom property on `.focusRowTrack`, consumed as `flex: 0 0 var(--focus-row-card-width, 156px)`; 156px is the grid floor and the pre-measurement fallback"
  - "Horizontal clearance and viewport bleed go 12px to 15px (13.65px reach at the 336px supremum, 1.35px headroom, under the 16px gutter); vertical room is `max(var(--space-md), 0.04 x card width + 6.5px)` rather than a fixed 19px"
  - "The property name is a string literal at the setProperty call so cssTokenSweep's SET_PROPERTY detector counts it as declared"
  - "A write that undoes the write before last within 250ms is held; the cost is the strip staying about 10/n px narrower than the grid inside a scrollbar-flip band, until the next real resize"

patterns-established:
  - "cssBlocks(source, selectorPattern) returns every block for a selector, for grouped rules that appear twice in a stylesheet"

requirements-completed: [R3]

coverage:
  - id: D1
    description: "G-48-8c: gridColumnCount/gridColumnWidth reproduce repeat(auto-fill, minmax(156px, 1fr)) (172.4px at 5 columns over 958, 198px over 198, breakpoint at C = 336 at equality, 156 to 4000 sweep)"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#grid column arithmetic (G-48-8c)"
        status: pass
    human_judgment: true
    rationale: "Desk arithmetic only; the jest project has no CSS engine. Live parity within 1px at 1280 and at a narrower width is owed to /gsd-verify-work 48."
  - id: D2
    description: "The width is written before first paint and on every resize, only on a 0.5px change, and is independent of grid state (S1-S4, wiring gates)"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#strip card width sync (G-48-8c)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#FocusRowStrip -- width sync wiring (G-48-8c)"
        status: pass
    human_judgment: true
    rationale: "No 156px-then-wide jump on first paint, and an unchanged card width when a filter empties the grid or the layout flips to list, need a rendering engine."
  - id: D3
    description: "Parity gates: strip flex fallback, JS GRID_CARD_MIN_WIDTH and the grid minmax floor are equal; strip gap and gutter equal the grid's; the grid stylesheet is untouched"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#strip/grid parity (G-48-8c)"
        status: pass
      - kind: other
        ref: "git diff --exit-code 151e2cba2 -- Library/index.css GameCard/index.css GamesList/index.tsx (exit 0)"
        status: pass
    human_judgment: false
  - id: D4
    description: "One page is exactly one grid row: pageScrollDelta returns n x pitch for C swept 156-3000 with clientWidth rounded or floored"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#P1: pages exactly one grid row in the zero-slack geometry"
        status: pass
    human_judgment: true
    rationale: "UAT item 5: one real click advances exactly one grid row; forward disabled at the end of travel; no controls on a 2-card collection."
  - id: D5
    description: "Ring clearance proven by arithmetic over parsed stylesheet values: Test F (15px >= 13.65), Test V (vertical room covers 11.45 at 156 and 18.60 at 336, slope dominates), Tests G and H unchanged"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#strip-end clearance (G-48-8a / G-48-8b / G-48-8c)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts"
        status: pass
    human_judgment: true
    rationale: "The unclipped 3px ring on all four sides at the first and last card, at 1280 and in the single-column band, needs a rendering engine."
  - id: D6
    description: "Resize feedback guard: A-B-A within 250ms is held, a slow round trip and a distinct width are written, a new element resets history"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts#strip card width resize feedback guard (G-48-8c, T-48-36)"
        status: pass
    human_judgment: true
    rationale: "No sustained strip-width flicker and no ResizeObserver loop error while dragging the window through the scrollbar threshold needs the running shell."

duration: 12min
completed: 2026-10-08
status: complete
---

# Phase 48 Plan 12: Strip cards match the grid Summary

**Focus-row strip cards now take the grid's own auto-fill/minmax column width, derived from the strip's content box (172.4px at window 1280 and 198px at window 520 on the UAT geometry) and written as an inline custom property before first paint, with one-grid-row paging, 15px ring clearance with width-scaled vertical room, and a 250ms flip-flop hold against resize feedback.**

## Performance

- **Duration:** about 12 min (19:07Z to 19:19Z)
- **Started:** 2026-10-07T19:07:21Z
- **Completed:** 2026-10-07T19:19Z (2026-10-08 local)
- **Tasks:** 3
- **Files modified:** 6 (all under `src/frontend/screens/Library/components/`)

## Accomplishments

- **Task 1 (tracer, G-48-8c):** `focusRowOverflow.ts` gained `GRID_CARD_MIN_WIDTH`, `gridColumnCount`, `gridColumnWidth` and `createStripCardWidthSync`. `index.tsx` holds one sync per mount in `useState`, calls it from a `useLayoutEffect` (first paint) and from the existing ResizeObserver callback. `index.css` consumes `flex: 0 0 var(--focus-row-card-width, 156px)`. `pageScrollDelta` counts whole cards as `floor((clientWidth + 1) / pitch)`. The tracer feedback gate: `HUMAN_VERIFY_MODE` defaulted to `end-of-phase`, the `<verify>` carries an automated block plus a `<human-check>` that the plan itself assigns to `/gsd-verify-work 48`; the automated block was re-run end to end (jest 4 suites, codecheck, lint, prettier, grid diff) and passed, so expansion continued, as 48-11 did. Logged: tracer verified end-to-end, expanding.
- **Task 2:** list `padding-inline` and viewport `margin-inline` go 12px to 15px; list gains `margin-block: max(var(--space-md), calc(var(--focus-row-card-width, 156px) * 0.04 + 6.5px))`. Test F's bound is now the ring reach at the 336px supremum (13.65px), Test V is new, and `gameCardControllerGeometry.test.ts` parses its card width from the grid's `minmax()` floor and gains a margin-grows-with-width test. Every number is parsed from `Library/index.css`, `GameCard/index.css`, `themes.scss` and `_typography.scss`, and an absent match throws.
- **Task 3:** `createStripCardWidthSync(now?)` keeps a per-element two-write history and holds a write that undoes the write before last within `FLIP_WINDOW_MS = 250`.

## Task Commits

1. **Task 1 (tracer, TDD): derived grid-matched width**
   - RED `d14785db6` test(48-12): add failing gates for strip cards matching the grid column width (G-48-8c)
   - GREEN `7ee338487` feat(48-12): strip cards take the grid's column width, derived and written before first paint (G-48-8c)
2. **Task 2 (TDD): ring clearance at grid-matched widths**
   - RED `e5c9f5a5a` test(48-12): add failing ring-clearance gates for grid-matched strip widths (G-48-8c)
   - GREEN `f9f874355` feat(48-12): strip-end clearance covers the ring at every grid-matched width (G-48-8c)
3. **Task 3 (TDD): resize feedback guard**
   - RED `851376775` test(48-12): add failing flip-hold gates for the strip width sync (G-48-8c, T-48-36)
   - GREEN `ae9054a54` feat(48-12): hold a width write that undoes the write before last within 250ms (G-48-8c, T-48-36)

**Plan metadata:** the `docs(48-12): complete ...` commit carrying this file.

`commits: 6` is measured from the persisted ledger (`plan_head_before` to `plan_head_after`) and all six carry the `(48-12)` scope.

### RED evidence

`gsd_run` is not available in this shell and `workflow.tdd_mode` is false, so `gsd_run check tdd-red-evidence` was not run. The RED runs, from `npx jest --selectProjects Frontend --testPathPattern ...`:

- Task 1: `Tests: 22 failed, 78 passed`. Failing: W1-W6 and the defaults test (`gridColumnCount`/`gridColumnWidth` not exported), S1-S4 (`createStripCardWidthSync is not a function`), P1 (same cause: it calls `gridColumnCount`, so it is red on the missing export rather than on the 4951-mismatch floor assertion), the re-pointed `measureCardPitch` fallback test (`GRID_CARD_MIN_WIDTH` undefined), the replaced `> *` source tests (no `var(--focus-row-card-width` in the CSS) and the four wiring tests.
- Task 2: `Tests: 2 failed, 124 passed`. Exactly Test F (15 needed, 12 shipped) and Test V (no `margin-block` declared). The non-vacuity test, Tests G and H, and the controller-geometry suite stayed green, as the plan expected.
- Task 3: `Tests: 2 failed, 57 passed`. G1 (`Expected: 170.4  Received: 172.4`, the third call wrote) and the G4 hold case (call count 4, expected 3). The G2, G3 and G4 element-reset cases pass before the guard exists: with no history there is nothing for a missing reset to break, and a fresh element writes either way. They are regression pins for the guard, not RED targets.

### Desk predictions as printed by the tests

| Check | Expected | Observed |
|-------|----------|----------|
| `gridColumnWidth(958)` (window 1280) | 172.4, 5 columns | passes, `toBeCloseTo(172.4, 9)` |
| `gridColumnWidth(198)` (window 520) | 198, 1 column | passes, exact |
| Breakpoint C = 336 / 335.9 | 2 columns of 156 / 1 column of 335.9 | passes |
| W5 sweep 156-4000 step 0.37 | fill exact within 1e-6, one more column never fits | passes |
| P1 sweep 156-3000 step 0.37, clientWidth rounded and floored | page = n x pitch | passes |
| Ring reach at 336px | 13.65 horizontal, 18.60 vertical | non-vacuity test passes (`toBeCloseTo`) |
| Vertical room at 156 / 336 | 12.74 / 19.94 against 11.45 / 18.60 | Test V passes |

## Files Created/Modified

- `src/frontend/screens/Library/components/FocusRowStrip/focusRowOverflow.ts` - grid arithmetic, width sync with write epsilon and flip hold, `pageScrollDelta` tolerance, `GRID_CARD_MIN_WIDTH`
- `src/frontend/screens/Library/components/FocusRowStrip/index.tsx` - sync wired into a layout effect and the ResizeObserver callback
- `src/frontend/screens/Library/components/FocusRowStrip/index.css` - derived flex basis, 15px clearance and bleed, width-scaled vertical margin, rewritten comments
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowOverflow.test.ts` - W1-W6, S1-S4, P1, G1-G4, re-pointed fallback test
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts` - parity, wiring, ring-reach and vertical-room gates; `cssBlocks` and `parsed` helpers
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts` - floor parsed from `Library/index.css`, margin-grows-with-width test

Not touched, by gate: `Library/index.css`, `GameCard/index.css`, `GamesList/index.tsx` (`git diff --exit-code 151e2cba2` exits 0), 48-11's `.focusRowStrip__control*` blocks and their describe, `48-SPEC.md`, `48-UI-SPEC.md`, `48-CONTEXT.md`.

## Decisions Made

See `key-decisions`. All followed the plan exactly; the amendment of D-01 and D-02 by the 2026-10-07 "match the grid" ruling was recorded by the planner in `100bbfa7d` and is cited in the code comments.

## Deviations from Plan

None - plan executed exactly as written.

(Non-deviations to record. A first attempt to apply a test edit through `python -` hung because `python` on this machine is the Microsoft Store stub; nothing was written and the edits were redone with the Edit tool. A shell heredoc expanded backticks in a test comment and dropped template-literal arguments; this was caught by diffing before committing and fixed. The pre-existing lint rule `no-unnecessary-type-assertion` flagged one `as unknown as HTMLElement` in the new test helper during Task 1, fixed before the GREEN commit.)

## Issues Encountered

- `pnpm planning-gates` was not run: python3 is not installed on this Windows machine (as in 48-10 and 48-11). This plan writes no todo or UAT file, so there was nothing to gate.
- Windows jest note: only the plan's named suites were run (`FocusRowStrip|GameCard|cssTokenSweep|themeTokens|filterChipRowPlacement`: 10 suites, 280 tests, all passed). No unrelated failure appeared in them.
- Unrelated working-tree changes (`.planning/state.json`, untracked `.planning/debug/rust-test-ci-missing-sidecar.md` and `.planning/milestone.lock`) predate this plan and were left unstaged.

## Verification

- `npx jest --selectProjects Frontend --testPathPattern "focusRowStripSource|focusRowOverflow|focusRowSelectors|cssTokenSweep"` (Task 1 final): 4 suites, 133 tests passed.
- `npx jest --selectProjects Frontend --testPathPattern "focusRowStripSource|focusRowOverflow|gameCardControllerGeometry|gameCardFocusRing|cssTokenSweep"` (Task 2 final): 5 suites, 126 tests passed.
- `npx jest --selectProjects Frontend --testPathPattern "focusRowOverflow|focusRowStripSource|cssTokenSweep"` (Task 3 final): 3 suites, 109 tests passed.
- Plan-level `npx jest --selectProjects Frontend --testPathPattern "FocusRowStrip|GameCard|cssTokenSweep|themeTokens|filterChipRowPlacement"`: 10 suites, 280 tests passed.
- `pnpm codecheck`: no `error TS` (re-run after each task).
- `pnpm lint`: 0 errors (638 pre-existing warnings), `production: PASS | tests: PASS`.
- `npx prettier --check` over every written path: `All matched files use Prettier code style!` (all `"ignored": false` per the plan's probe).
- `git diff --exit-code 151e2cba2 -- Library/index.css GameCard/index.css GamesList/index.tsx`: exit 0.
- `git show --stat` of the Task 3 GREEN commit lists only `focusRowOverflow.ts`; `index.tsx` was untouched by Task 3.
- `graphify update .` ran after the last code commit: graph.json updated.

## Human checks owed (end-of-phase UAT, not stopped for)

For harvest into 48-UAT.md by `/gsd-verify-work 48`. Dev shell; the 48-UAT.md `## Protocol` P1-P4 profile guards apply (Windows profile files: `$APPDATA/gamelib/config.json` and `$APPDATA/gamelib/store/config.json`; declare the capture route in `## Protocol` before recording a number).

- **New item, width parity (Task 1):** at window 1280 and at a narrower width that still shows the strip (520px or the platform's narrowest non-zero track), the first `.focusRowTrack .gameCard` and the first `.listing > .gameList .gameCard` rects (neither hovered) are within 1px in width, and left edges within 1px at `scrollLeft` 0. Desk prediction on the UAT item 4 macOS geometry: 172.4px at 1280, 198px at 520; on another platform parity is the criterion. Filter to an empty grid (`FilterZeroResult`), then switch to list layout: the strip card width does not change. Watching the window from launch shows no 156px-then-wide jump on first paint.
- **UAT item 5 recheck (Task 1):** forward enabled at `scrollLeft` 0; one click advances exactly one grid row (5 x 196.4 = 982px at 1280 on that geometry); forward `disabled` once `scrollLeft + clientWidth >= scrollWidth - 1`; a 2-card collection shows neither control.
- **UAT item 6 recheck (Task 1):** at 1280 and 520, no title rect exceeds its card rect, the strip is one card tall, and it holds at most 20 cards (D-04).
- **New item, ring clearance in the single-column band (Task 2):** at 1280, and in the band where the grid shows one column of a card wider than about 270px (about 592-658px window on the UAT item 4 macOS geometry), hover the first strip card at `scrollLeft` 0 and the last at end of travel: the whole 3px ring is visible on all four sides, and the first strip card's left edge still equals the grid's within 1px. With a controller, moving focus right past the last fully visible card leaves each newly focused card's ring inside `track.getBoundingClientRect()` by at least 3px each side. This is 48-10's owed checks 1, 2 and 5 at grid-matched widths.
- **New item, resize sanity (Task 3):** with a focus row and a filter state whose grid is about one viewport tall, drag the window height slowly through the point where the main scrollbar appears and disappears, then drag the width across a column breakpoint: no sustained strip-width flicker, no `ResizeObserver loop` error in the devtools console, and after a normal resize the strip again matches the grid within 1px.

## Known Stubs

None.

## Threat Flags

None. T-48-36 (render loop) is mitigated by the 0.5px write epsilon and the 250ms hold, with the live check owed above. T-48-37 (exception in a layout effect or observer) is mitigated by a total sync (S3, W6). T-48-38 (vacuous gate or drift) is mitigated by the parity gates and the throw-on-missing parsers. T-48-39 holds (the amendment was recorded in `100bbfa7d`). No new network, auth, storage or IPC surface.

## Next Phase Readiness

- G-48-8c is closed at the desk. Its live proof, plus UAT items 5 and 6, is owed to `/gsd-verify-work 48`; the gap entry keeps `status: failed` until that run reconciles it.
- The open todo `2026-10-01-library-tiles-stretch-with-window-width-consider-a-set-size.md` stays open: if the grid ever changes, the parity gates go red and force the strip to follow.

## Self-Check: PASSED

- Files exist: all six modified paths above, and this SUMMARY.
- Commits present in `git log`: `d14785db6`, `7ee338487`, `e5c9f5a5a`, `f9f874355`, `851376775`, `ae9054a54`.
- Acceptance criteria re-run: Task 1 (jest 4 suites pass; W/S/P1, the replaced `> *` tests and the parity and wiring tests failed before the implementation; pre-existing `canScroll*`, `pageScrollDelta`, `scrollFocusedCardIntoViewHorizontally` and `measureCardPitch` tests pass unmodified except the one re-pointed fallback test; grid diff exits 0) PASS. Task 2 (jest 5 suites pass; Tests F and V failed before the CSS edit; Tests G and H textually unchanged and pass at 15px; `CARD_WIDTH` assigned from the parsed `minmax()` floor) PASS. Task 3 (jest 3 suites pass; G1 and the G4 hold case failed before the guard; Task 3 commit lists only `focusRowOverflow.ts`) PASS.
- Judgment call on a statement in Task 3's acceptance criteria: it says "the executor's log shows G1 and G4's element-reset case failing". The reset case cannot fail before any history exists (see RED evidence), so the log shows G1 and the G4 hold case failing instead.

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-08*
