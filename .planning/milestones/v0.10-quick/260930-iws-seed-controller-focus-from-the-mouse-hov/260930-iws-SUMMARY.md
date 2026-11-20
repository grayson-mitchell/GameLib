---
phase: quick-260930-iws
plan: 01
subsystem: gamepad-input
tags: [gamepad, controller, dom-focus, hover, jest, typescript]

requires: []
provides:
  - "gamepadHoverSeed.ts: resolveHoveredCard()/isDirectionalAction() -- total, listener-free :hover resolver"
  - "gamepad.ts checkAction: mouse-to-controller handoff focus seed, land-first, directional-only, guarded"
  - "18-case jest suite (R1-R6 unit, I1-I10 integration) proving the seed and its guards"
  - "2026-09-25-mouse-highlight-does-not-confer-dom-focus.md closed to completed/, ready: live-gate"
affects: [gamepad-focus todos, Phase 38 controller UAT, 260925-pga, 260926-acw]

actuals:
  tokens: 9712
  tasks: 3
  commits: 4
plan_head_before: 4cfafe7d3793aefde764a253e12e6cd687875771
plan_head_after: a74c367ceb579cd6e006f76c2e7a7a24e94fa64f

tech-stack:
  added: []
  patterns:
    - "Query :hover at dispatch time instead of tracking pointer state with a listener -- nothing to go stale, nothing to tear down"
    - "Land-first handoff: consume the triggering press to seed focus, let the NEXT press navigate, so the operator sees the transfer before anything moves"

key-files:
  created:
    - src/frontend/helpers/gamepadHoverSeed.ts
    - src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts
  modified:
    - src/frontend/helpers/gamepad.ts
    - .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
    - .planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md

key-decisions:
  - "Seed at controller-dispatch time (checkAction), not focus-follows-mouse, so nothing moves until a controller press arrives and typing near a hovered card can never be interrupted"
  - "Resolve the hovered card via document.querySelectorAll(':hover') at press time rather than a pointer-tracking listener -- the operator's visible highlight IS this CSS state by construction, and a listener needs its own staleness/cleanup rules a query does not"
  - "Land-first: the handoff press is consumed (focus lands on the card, nothing navigates); the NEXT press navigates from it, so the acw focus ring visibly lands on the card before anything moves"
  - "Directional actions only (padUp/Down/Left/Right, leftStick*) may seed; mainAction/altAction never do, so a controller press can never play or install a card it never actually focused"
  - "Guards (VK active, inside a dialog/dropdown/MUI popover, focus already inside the hovered card) sit AFTER the resolve, so with no card hovered none of them ever run"

patterns-established:
  - "gamepadHoverSeed.ts: a pure, total, listener-free DOM resolver pattern for gamepad.ts's other closures to follow if a similar hover/focus reconciliation is needed elsewhere"

requirements-completed: [QUICK-260930-iws]

coverage:
  - id: D1
    description: "Handoff press with a hovered card lands focus on the card's link and consumes the press; the next press navigates from it"
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts#I1"
        status: pass
    human_judgment: true
    rationale: "The live mouse-to-controller handoff sweep on the library route (this todo's own Verification section) has not been performed on real hardware -- desk-level tests prove the mechanism, not the operator-visible outcome."
  - id: D2
    description: "Search-field-focused and stale-card-focused handoffs both redirect to the hovered card instead of the search field or the stale card"
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts#I4"
        status: pass
      - kind: unit
        ref: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts#I5"
        status: pass
    human_judgment: false
  - id: D3
    description: "No seed with no card hovered, with no controller input, mid-session without a mousemove, with the virtual keyboard active, inside a dialog/dropdown overlay, when focus is already inside the hovered card, or for mainAction/altAction"
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts#I2,I3,I6a,I6b,I7,I8,I9a,I9b,I10"
        status: pass
    human_judgment: false
  - id: D4
    description: "resolveHoveredCard resolves the wrapper and its link across grid/list layouts and nested hover targets, and is total (never throws)"
    verification:
      - kind: unit
        ref: "src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts#R1-R6"
        status: pass
    human_judgment: false
  - id: D5
    description: "Todo closed to completed/ with an honest resolution note stating the live check is outstanding; todo A's cross-reference repointed"
    verification:
      - kind: other
        ref: "Task 3 <verify> block (file-shape assertions) -- see Self-Check below"
        status: pass
    human_judgment: false

duration: not recorded (record_start_time step was skipped at session start)
completed: 2026-09-30
status: complete
---

# Quick Task 260930-iws: Seed Controller Focus From the Mouse-Hovered Card Summary

**Mouse-to-controller handoff now lands DOM focus on the hovered game card via a listener-free `:hover` query in `gamepad.ts`'s `checkAction`, closing the todo where a post-mouse controller press acted on the search field or nothing instead of the visually-highlighted card.**

## Performance

- **Duration:** not recorded (the `record_start_time` step was skipped at the start of this session; see Deviations)
- **Tasks:** 3/3 completed
- **Files modified:** 3 source files (2 new, 1 modified) + 2 todo files

## Accomplishments

- New `src/frontend/helpers/gamepadHoverSeed.ts`: a total, listener-free `resolveHoveredCard()`/`isDirectionalAction()` pair that resolves the CSS-`:hover`-highlighted game card at controller-dispatch time
- Wired a land-first handoff seed step into `gamepad.ts`'s `checkAction`: the first directional press after the mouse moved now focuses the hovered card's link instead of falling through to stale search-field focus or the viewport-edge recovery origin
- Guarded the seed against the virtual keyboard being active, focus sitting inside a dialog/dropdown/MUI popover overlay, and focus already being inside the hovered card
- 18-case jest suite (`gamepadHoverSeed.test.ts`, R1-R6 unit + I1-I10 integration) proving the resolver and the full handoff/guard matrix through the real `initGamepad()` rAF loop
- Closed `2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` to `completed/` with `ready: live-gate` and an honest resolution note stating the live sweep is still outstanding; repointed todo A's cross-reference

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "handoff press lands on the hovered card" -- resolver, checkAction wiring, integration test** - `8217ded23` (feat)
2. **Task 2: Expansion -- guards and the full handoff matrix** - `841c36414` (feat)
3. **Task 3: Close the todo -- git mv to completed/ with a resolution note, repoint todo A's cross-reference** - `7ba5ce261` (docs), completed by `a74c367ce` (fix -- see Deviations)

_TDD tasks (1 and 2) each carry RED verification recorded below rather than a separate RED commit -- one commit per task, after GREEN, per this repo's task_commit_protocol._

## Files Created/Modified

- `src/frontend/helpers/gamepadHoverSeed.ts` - New. `resolveHoveredCard(doc)` and `isDirectionalAction(action)`.
- `src/frontend/helpers/gamepad.ts` - Modified. Handoff detection (`controllerWasNotCurrent`/`isHandoffPress`) plus the guarded seed step in `checkAction`, before the existing `switch (action)`.
- `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts` - New. 18 cases across two families (resolver unit cases, `initGamepad()` integration cases).
- `.planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` - Moved from `pending/`, `ready: live-gate`, `## Resolution (quick 260930-iws)` appended.
- `.planning/todos/completed/2026-09-25-controller-focus-has-no-perceptible-affordance.md` - Cross-reference repointed at the completed path.

## Decisions Made

See `key-decisions` in the frontmatter above (P-1 through P-5/P-7 from the plan, carried through into code comments in `gamepadHoverSeed.ts` and `gamepad.ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `record_start_time` step skipped at session start**
- **Found during:** writing this SUMMARY
- **Issue:** The executor workflow's `record_start_time` step (capturing `PLAN_START_TIME`/`PLAN_START_EPOCH` before task execution) was not run before Task 1 began, so no wall-clock duration is available for this SUMMARY.
- **Fix:** None possible retroactively -- documented honestly as "not recorded" rather than fabricating a duration figure.
- **Files modified:** None (process gap, not a code defect).
- **Committed in:** N/A (documentation-only, noted here for the record).

**2. [Rule 1 - Bug] Prettier reformatted the test file mid-task, twice**
- **Found during:** Tasks 1 and 2, running the `<verify>` block's `npx prettier --check`
- **Issue:** Manually written multi-line `const { x } = require(...)` destructures did not match this repo's prettier config; `--check` failed on `gamepadHoverSeed.test.ts`.
- **Fix:** Ran `npx prettier --write` on the file and re-verified with `--check`; where prettier's reformatting moved an `// eslint-disable-next-line` comment away from the line it needed to disable (three `no-require-imports` lint errors surfaced by `pnpm lint`), restructured those three destructures to match the working `R3` pattern (comment inside the destructuring braces, immediately before the `require(...)` line) rather than fighting the formatter.
- **Files modified:** `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts`
- **Verification:** `npx prettier --check` clean; `pnpm lint` reports `0 errors` afterward (both ceilings PASS).
- **Committed in:** `8217ded23` (Task 1), `841c36414` (Task 2)

**3. [Rule 1 - Bug] Task 3's `git commit -- <pathspec>` split the rename, leaving a duplicate todo in HEAD's tree**
- **Found during:** post-commit verification, re-running the Task 3 `<verify>` block's own assertions against `HEAD`'s tree rather than only the filesystem
- **Issue:** `git mv` correctly staged the pending-path deletion together with the completed-path addition, but the Task 3 commit was run as `git commit -m "..." -- <completed-path-A> <completed-path-B>` -- an explicit pathspec that does not include the pending path. `git commit -- <pathspec>` commits ONLY changes to the listed paths, leaving any other staged change (here, the pending-file deletion) sitting uncommitted in the index. The working tree and index were both correct (file physically moved, deletion staged) the whole time, which is why `test ! -e pending/...` passed on disk -- but `HEAD`'s committed tree still contained BOTH the old pending copy and the new completed copy until this was caught.
- **Fix:** Committed the leftover staged deletion in a follow-up commit (`a74c367ce`) rather than amending the already-pushed-to-history Task 3 commit, per this repo's "always create NEW commits" convention.
- **Files modified:** `.planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md` (deletion only; no content change).
- **Verification:** `git ls-tree HEAD -- .planning/todos/pending/...` now returns nothing; re-ran all 7 of Task 3's `<verify>` assertions against the corrected `HEAD`; `PYTHONUTF8=1 pnpm planning-gates` still 12/12.
- **Committed in:** `a74c367ce`

**4. [Rule 1 - Bug] `FakeElement | undefined` vs `FakeElement | null` type mismatch**
- **Found during:** Task 2, running `pnpm codecheck`
- **Issue:** `buildCard()`'s `link` field is `FakeElement | undefined` (it's absent when `withLink: false`), but `harness.setFocused()` was typed to accept only `FakeElement | null`, so `harness.setFocused(staleLinkB)` and `harness.setFocused(link)` in the new I5/I6a cases failed to typecheck.
- **Fix:** Widened `setFocused`'s parameter type to `FakeElement | null | undefined` and normalized internally with `el ?? null`.
- **Files modified:** `src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts`
- **Verification:** `pnpm codecheck` passes cleanly; all 18 test cases still pass.
- **Committed in:** `841c36414` (Task 2)

---

**Total deviations:** 4 (1 process gap noted rather than fixed, 3 auto-fixed per Rule 1/3)
**Impact on plan:** All auto-fixes were mechanical (formatting/typing) with no behavioral change to the implementation described in the plan. No scope creep.

## Issues Encountered

None beyond the deviations above.

## RED/GREEN Evidence (TDD tasks)

**Task 1** (before `gamepadHoverSeed.ts` existed): `npx jest gamepadHoverSeed.test.ts` reported **5 failed, 2 passed, 7 total** -- R1/R2/R3/R4 failed with "Cannot find module '../gamepadHoverSeed'"; I1 failed on `link.focus` never being called (0 calls, expected 1). I2 and I3 passed by design (contract preservation of pre-existing unguarded behavior). After implementing `gamepadHoverSeed.ts` and wiring `gamepad.ts`: all 5 target suites (47 tests) passed.

**Task 2** (before the P-5 guards were added): extending the suite to 18 cases (adding I4-I10, R5-R6) measured **5 failed, 13 passed, 18 total** -- I6a, I6b, I8, I9a, I9b failed exactly as the plan predicted (the containment/VK/overlay guards did not yet exist). I4, I5, I7, I10, R5, R6 passed pre-guard by design -- they exercise the core land-first mechanism and the directional-only scope already built in Task 1, not the new guards, so their pass is contract preservation rather than vacuity. After adding the guards: all 5 target suites (58 tests) passed.

## Verification Results

- **Jest:** 5 suites / 58 tests pass (`gamepadHoverSeed.test.ts`, `gamepadRepeatTiming.test.ts`, `gamepadDisconnect.test.ts`, `nintendoLayout.test.ts`, `gamepadActionRouting.test.ts`), trailing `Ran all test suites matching` confirmed present.
- **Prettier:** `npx prettier --check` clean on the exact three `src/` paths written.
- **Structural gates:** `gamepad.ts` addEventListener count still 5 (focus, blur, mousemove, gamepadconnected, gamepaddisconnected); `gamepadHoverSeed.ts` registers none; the three pre-existing gamepad harnesses and `tauriGamepadInput.ts` are byte-unchanged (`git diff --quiet` confirmed).
- **`pnpm codecheck`:** clean (`tsc --noEmit` both configs).
- **`pnpm lint`:** `production: PASS | tests: PASS` -- 0 errors, 638 warnings (at, not over, the repo's warning ceiling).
- **`PYTHONUTF8=1 pnpm planning-gates`:** **12/12 planning gates passed.**
- **Plain `pnpm planning-gates`:** measured to still crash on this Windows machine with the pre-existing `cp1252 UnicodeEncodeError` at `planning-frontmatter-gate.py` (11/12, exit code 1) -- this is the documented pre-existing baseline defect, NOT introduced by this task, and is explicitly not claimed as a pass.
- **Todo file-shape checks (Task 3 `<verify>` block):** all 7 assertions passed against `HEAD` after the deviation-3 fix (pending path absent from both disk AND `git ls-tree HEAD`, completed path present, exactly one `## Resolution` heading, outstanding-live-check sentence present, `ready: live-gate` present, todo A repointed, no remaining `pending/...` references under `.planning/todos`, `src`, or `meta`).
- **`graphify update .`:** ran best-effort, completed successfully (49956 nodes, 65626 edges); `graphify-out/` is gitignored, not committed.

## Known Stubs

None. No hardcoded empty/placeholder values were introduced.

## Threat Flags

None beyond what the plan's own `<threat_model>` already registered (T-iws-01 through T-iws-04, all `mitigate`, all pinned by the test cases named in each row: I10 for T-iws-01, the three unmodified harnesses plus the resolver's own try/catch for T-iws-02, I3 for T-iws-03, I7 for T-iws-04). No new network endpoints, auth paths, or schema changes were introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The desk-level fix is complete and gated green; the todo is closed to `completed/` but carries `ready: live-gate` because **the live mouse-to-controller handoff sweep on the library route has NOT been performed on real hardware.** A future controller sitting (or a `/gsd-verify-work` pass with a controller attached) should run the todo's own Verification section: hover/click a card with the mouse, switch to the controller, press a directional input, and confirm the NEXT element acted on is the hovered card (or an adjacent one via normal spatial navigation) -- never the search field.
- The `[GAMEPAD-ACT]` instrument this todo's original corroborating evidence relied on was removed in `5a4dffc0e` (per the plan's staleness note); a live sitting will need to either observe the focus ring by eye or re-add a temporary probe.
- No blockers for other in-flight work: this plan touched only `gamepad.ts`/`gamepadHoverSeed.ts`/its test file and the two todo files; no shared state, schema, or API surface was changed.

## Self-Check

```
FOUND: src/frontend/helpers/gamepadHoverSeed.ts
FOUND: src/frontend/helpers/__tests__/gamepadHoverSeed.test.ts
FOUND: .planning/todos/completed/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
MISSING (expected): .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
MISSING from HEAD tree (expected, confirmed via git ls-tree HEAD): .planning/todos/pending/2026-09-25-mouse-highlight-does-not-confer-dom-focus.md
FOUND: 8217ded23 (git log --oneline --all)
FOUND: 841c36414 (git log --oneline --all)
FOUND: 7ba5ce261 (git log --oneline --all)
FOUND: a74c367ce (git log --oneline --all)
```

## Self-Check: PASSED

---

*Quick task: 260930-iws*
*Completed: 2026-09-30*
