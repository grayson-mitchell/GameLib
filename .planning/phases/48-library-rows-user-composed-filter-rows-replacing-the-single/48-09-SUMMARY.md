---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 09
subsystem: ui
tags: [css, gamecard, focus-ring, controller-mode, source-gate, jest]
gap_closure: true
gap_ids: [G-48-8a, G-48-8b]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: FocusRowStrip and the persisted focus row (plans 01-08) whose UAT item 8 raised both gaps
provides:
  - "Controller mode never resizes a GameCard: no `.gamepad` sizing rule exists, strip or grid (G-48-8a)"
  - "Every GameCard's mouse hover wears the console-style 3px ring from one grouped hover/focus rule (G-48-8b)"
  - "Exactly one tile rings library-wide: parked-cursor rule in controller mode, `.listing`-scoped stale-focus rule in mouse mode"
affects: [48-10, 48-11, FocusRowStrip, GameCard, gap G-48-8c]

actuals:
  tokens: 21000
  tasks: 2
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Source gate over comment-stripped CSS with a brace-depth rule walk (gameCardControllerGeometry.test.ts) plus arithmetic over values parsed from the shipped stylesheet"
    - "Single-selector rules anchored on start-of-file or a preceding `}` so they cannot match the second line of a grouped selector list"

key-files:
  created:
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts
  modified:
    - src/frontend/screens/Library/components/GameCard/index.css
    - src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts
    - src/frontend/themes.scss
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-09-PLAN.md

key-decisions:
  - "Both GameCard changes are global, not strip-only (operator ruling 2026-10-07): controller mode has no geometry override anywhere; every GameCard hover is the console ring"
  - "Hover and focus share ONE grouped ring rule; the two single-selector rules carry z-index only, so they cannot drift (T-48-30)"
  - "The stale-focus suppression is scoped to `.listing:hover`, the nearest common ancestor of the strip's and the grid's `.gameList`, not to a single `.gameList` (operator observation 2)"
  - "The `.gameListItem` 260926-acw hover/focus split is unchanged apart from the same `.listing` scope"

patterns-established:
  - "Two lists, one library: any `:hover` scope meant to cover 'the library' must name `.listing`, not `.gameList`, because the focus-row strip owns a separate `.gameList`"

requirements-completed: [R3]

coverage:
  - id: D1
    description: "G-48-8a: switching between mouse and controller never changes a GameCard's box size (strip and grid); controller-mode art fits the flattened 35px badge bar"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts#no rule whose selector mentions .gamepad declares a sizing property"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts#a 156px controller-mode card is tall enough for its art above the 35px badge bar"
        status: pass
      - kind: manual_procedural
        ref: "operator live check 2026-10-07, Windows 11, dev shell, physical controller: 'height is fixed'"
        status: pass
    human_judgment: true
    rationale: "Operator-observed live, pass (2026-10-07, Windows 11, dev shell, physical controller). Pixels cannot be asserted in the node-environment jest project, so the live observation is the proof; the source gate covers the stylesheet half."
  - id: D2
    description: "G-48-8b: every GameCard's mouse hover wears the same 3px console-style ring (offset +2px, halo, glow) that controller focus wears, from one shared rule; hover and focus ring widths agree at 3px"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#Test A: exactly one grouped .gameCard:hover, .gameCard:focus-within rule declares the ring, consuming the shared tokens, at +2px offset with halo and glow"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#Test C: the single-selector .gameCard:hover rule is z-index 2 and the single-selector .gameCard:focus-within rule is z-index 3, and neither declares an outline"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#Test D: the resting .gameCard outline has the ring geometry, a transparent 3px at +2px, so only colour and shadow animate"
        status: pass
    human_judgment: true
    rationale: "Whether the ring reads as the console-style ring against cover art in every theme is a visual judgment; the live re-check (human-check steps 1 and 3) is pending and is harvested into 48-UAT.md at end of phase."
  - id: D3
    description: "G-48-8b: in controller mode a parked cursor's hover does not ring a second tile; only the focused card rings"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#Test E: body.controllerLayout .gameCard:hover:not(:focus-within) returns a parked-cursor card to rest"
        status: pass
    human_judgment: true
    rationale: "One-ring-at-a-time depends on real :hover/:focus-within behaviour across an input handoff, which no source gate can assert; live re-check (human-check step 2) pending."
  - id: D4
    description: "G-48-8b operator observation 2: a strip card left controller-focused returns to rest while the mouse moves over the main grid (stale-focus suppression scoped to .listing:hover, not a single .gameList); exactly one ring in the whole library"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#no stale-focus rule is still scoped to a single .gameList or .gameListLayout: the strip and the grid are separate .gameList elements, so that scope let the strip card re-ring while mousing in the grid"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts#two body:not(.controllerLayout) .listing:hover .gameCard:focus-within:not(:hover) rule bodies exist -- ring and scale"
        status: pass
    human_judgment: true
    rationale: "Cross-element hover scoping between the strip and the grid is real-DOM behaviour; live re-check (human-check step 4) pending."

duration: 85min
completed: 2026-10-07
status: complete
plan_head_before: 926383bd60fbf03c1988d76fedac11dd0cf8ed6e
plan_head_after: dfe993528cbbe96c82aa89993e8b18069be0b1ad
commits: 5
---

# Phase 48 Plan 09: GameCard controller geometry and hover ring Summary

**GameCard controller mode no longer resizes any card (the `.gamepad` aspect-ratio overrides are deleted, strip and grid), mouse hover now wears the same 3px console-style ring as controller focus from one grouped rule, and exactly one tile rings library-wide because the stale-focus suppression is re-scoped from `.gameList:hover` to their common ancestor `.listing:hover`.**

## Performance

- **Duration:** about 85 min wall-clock for the whole plan, including the live operator check between the two executor segments (Task 1 segment began 2026-10-07 22:30 +13:00; Task 2 segment committed at 23:55 +13:00)
- **Tasks:** 2 of 2 (Task 1 tracer, Task 2 auto; both `tdd="true"`)
- **Files modified:** 5 (4 source, 1 plan text); 4 new/changed source files in the diff plus this SUMMARY

## Accomplishments

- G-48-8a: deleted `.gameCard.gamepad` (3/4) and `.gameCard.gamepad.justPlayed` (328/205). A 156px card keeps its 248px mouse-mode box in controller mode, and the 35px badge bar leaves 213px against 208px of art. Gated by `gameCardControllerGeometry.test.ts` (no `.gamepad` sizing rule, non-vacuity walk, art-fits arithmetic over parsed stylesheet values).
- G-48-8b: one grouped `.gameCard:hover, .gameCard:focus-within` rule now carries the ring (`var(--focus-ring-width, 3px)`, `outline-offset: 2px`, halo, drop, glow); the single-selector rules carry z-index only (hover 2, focus 3). The resting outline shares the same 3px/+2px geometry so only colour and shadow animate.
- `body.controllerLayout .gameCard:hover:not(:focus-within)` returns a parked cursor's tile to rest (threat T-48-29); `:not(:focus-within)` keeps the hover-seeded handoff card ringed.
- Operator observation 2 closed in the same task (see Deviations): the mouse-mode stale-focus suppression (ring, scale, and the list-row variant) is scoped to `body:not(.controllerLayout) .listing:hover`.
- `themes.scss` focus-token note now names `.gameCard:hover` as the one sanctioned hover consumer of the ring tokens.

## Task Commits

1. **Task 1: TRACER - controller mode never resizes a card (G-48-8a)**
   - RED `e9112eed5` test(48-09): failing source gate for controller-mode card geometry
   - GREEN `a512ccb10` feat(48-09): controller mode no longer resizes a GameCard
   - Live result (operator, 2026-10-07, Windows 11, dev shell, physical controller): **PASS** - "height is fixed".
2. **Task 2: hover wears the console ring on every GameCard (G-48-8b)**
   - RED `d163cb333` test(48-09): failing gate (Tests A-F, plus the `.listing` scope assertions, Test G); `check tdd-red-evidence` returned `RED_EVIDENCE_OK` (target Test A failed on its assertion; 11 of 18 tests failed, 7 passed)
   - GREEN `dfe993528` feat(48-09): grouped ring rule, parked-cursor rule, `.listing` re-scope, themes.scss note

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md, REQUIREMENTS.md and the human-check text in 48-09-PLAN.md.

Measured `commits: 5` (`git rev-list --count 926383bd6..dfe993528`) includes `3b73c23f7`, an orchestrator docs commit recording gap G-48-8c; this plan's own commits are 4.

## Files Created/Modified

- `src/frontend/screens/Library/components/GameCard/index.css` - geometry overrides removed; grouped ring rule; resting 3px/+2px outline; parked-cursor rule; stale-focus rules re-scoped to `.listing:hover`
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts` - new source gate (Tests 1-3)
- `src/frontend/screens/Library/components/GameCard/__tests__/gameCardFocusRing.test.ts` - rewritten: Tests A-F, `.gameListItem` split describe, stale-focus describe updated to the `.listing` scope with Test G
- `src/frontend/themes.scss` - comment-only change to the focus-ring token note
- `.planning/phases/48-.../48-09-PLAN.md` - Task 2 human-check extended with step (4)

## Decisions Made

- Global rather than strip-only, per the operator's 2026-10-07 ruling recorded in the plan objective.
- Common ancestor is `.listing` (`Library/index.tsx:1129`), the `div` that directly contains both `FocusRowStrip` (with its own `.focusRowTrack .gameList`) and `GamesList` (`.gameList`). `.listing` is used by no other screen. The `.gameListItem` rule was moved to the same ancestor for consistency; list rows never appear in the strip, so its behaviour is unchanged.
- `body:not(.controllerLayout)` scope kept on all three suppression rules: a parked cursor in controller mode must not erase controller focus.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale-focus suppression was scoped to one `.gameList`, so the strip's focused card re-ringed while mousing the grid**
- **Found during:** Task 2, from the operator's live observation 2 (2026-10-07): with the pointer over the tiles of one row, one tile had the 3px ring and the rest 2px; the thick ring was where the controller last was; moving down a row, "the focus row border will come back on that same tile" while the mouse moved the highlight in lower rows.
- **Issue:** `body:not(.controllerLayout) .gameList:hover .gameCard:focus-within:not(:hover)` (`index.css` ring rule and scale rule) required the pointer to be over the SAME `.gameList` as the focused card. The focus-row strip and the main grid are separate `.gameList` elements, so a pointer in the grid was outside the strip's `.gameList:hover` and the strip card's `:focus-within` ring returned, beside the hovered tile. (The "2px vs 3px" half of the observation is observation 1, which the grouped ring rule already fixes: hover is now 3px.)
- **Fix:** Re-scoped both `.gameCard` suppression rules and the `.gameListItem` row rule to `body:not(.controllerLayout) .listing:hover ...`. Rewrote the comment above the ring suppression to record the 2026-10-07 observation and why `.gameList` scope was insufficient (two lists). Added Test G and updated the stale-focus describe block rather than deleting it; the changed assertions failed RED before the CSS edit, like Tests A-E.
- **Files modified:** `GameCard/index.css`, `GameCard/__tests__/gameCardFocusRing.test.ts`
- **Verification:** 5-suite jest battery (113 tests) and the wider `GameCard|focusIndicator|themeTokens|cssTokenSweep` run (7 suites, 140 tests) pass; live re-check is human-check step 4 below.
- **Committed in:** `d163cb333` (RED), `dfe993528` (GREEN)

### Other changes beyond the plan text

- The plan's `<human-check>` for Task 2 was extended with step (4) for observation 2, as instructed by the orchestrator.
- Test B/F were kept as the plan specified; Test G was added (not in the plan) to pin the `.listing` scope.

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** The fix is inside G-48-8b's stated purpose ("exactly one tile rings"); no new files, no scope creep beyond three selector rescopes.

## Issues Encountered

- A first draft of the not-unscoped lookbehind in the stale-focus gate used a fixed-width `\s`; with the multi-line prettier-wrapped `.gameListItem` selector it needed `\s+`. Fixed before RED evidence was recorded.
- `python3` is not installed on this machine, so `pnpm planning-gates` was not run (it is a planning-artifact CI gate; no todo or UAT item was touched by this plan).

## Human checks owed (harvested into 48-UAT.md at end of phase, `human_verify_mode` end-of-phase)

- **G-48-8a** - Task 1: operator PASS 2026-10-07 ("height is fixed"). Record as a `48-UAT.md` item with result pass naming G-48-8a.
- **G-48-8b** - Task 2 steps: (1) hover a grid card and a strip card with the mouse: thick accent ring with halo and glow, `outlineWidth` 3px and `outlineOffset` 2px from a delayed console probe; (2) press a controller button with the cursor parked over a card, then navigate two cards away: exactly one ring (the focused card), the parked-over card at rest; (3) move the mouse: controller mode ends, hover rings again; (4) controller-focus a strip card, then hover a grid card in a lower row: the strip card goes to rest, exactly one ring in the whole library, and it does not come back moving the mouse up and down. Pending (human_judgment true).

## Known Stubs

None.

## Threat Flags

None. Stylesheet and source-gate changes only; no input, IPC, storage or network surface added. T-48-29 (suppression erasing controller focus) is mitigated: the parked-cursor selector excludes `:focus-within` and Test E pins the exact selector text. T-48-30 (hover/focus drift) is mitigated by the grouped rule plus Test C.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 48-10 (strip-end ring clipping, track stacking context, G-48-9) and 48-11 can proceed; the ring is now 3px at +2px offset for hover as well as focus, so 48-10's inline-padding budget must cover the hover ring too.
- The orchestrator recorded gap G-48-8c (`3b73c23f7`: strip cards must match grid card width, amending D-01). It is not part of this plan; the controller-geometry gate's 156px reference width is the strip pin D-01 set and may need revisiting there.
- Live confirmation of G-48-8b is outstanding (human_judgment true on D2-D4).

## TDD Gate Compliance

Task 1: `test(48-09)` `e9112eed5` then `feat(48-09)` `a512ccb10`. Task 2: `test(48-09)` `d163cb333` then `feat(48-09)` `dfe993528`; RED evidence verified with `gsd_run check tdd-red-evidence` (`RED_EVIDENCE_OK`, target Test A). No refactor commit (none needed).

## Verification Results

- `npx jest --selectProjects Frontend --testPathPattern "gameCardFocusRing|gameCardControllerGeometry|focusIndicator|cssTokenSweep|themeTokens"`: 5 suites, 113 tests passed
- `npx jest --selectProjects Frontend --testPathPattern "GameCard|focusIndicator|themeTokens|cssTokenSweep"`: 7 suites, 140 tests passed
- `pnpm codecheck`: exit 0
- `pnpm lint`: 0 errors, `production: PASS | tests: PASS`
- `npx prettier --check` over `GameCard/index.css`, `gameCardFocusRing.test.ts`, `themes.scss`: pass (all three probed non-ignored)
- Acceptance: jest passes with 5 suites; `gameCardFocusRing.test.ts` contains Tests A-E by name and still has the `.gameListItem` and stale-focus describes; `git show HEAD -- src/frontend/themes.scss` changes only comment lines; `git grep gamepad` over `index.css` lists only the two `.gameCard.gamepad > .icons` rules plus comment lines.

## Self-Check: PASSED

- Files found: `GameCard/index.css`, `gameCardControllerGeometry.test.ts`, `gameCardFocusRing.test.ts`, `themes.scss`
- Commits found: `e9112eed5`, `a512ccb10`, `d163cb333`, `dfe993528`

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-07*
