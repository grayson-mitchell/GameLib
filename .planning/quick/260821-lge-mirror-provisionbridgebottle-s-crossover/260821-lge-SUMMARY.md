---
phase: quick-260821-lge
plan: 01
subsystem: steam
tags: [wine, crossover, bottle, validation, jest]

requires:
  - phase: quick-260816-i8a
    provides: "Verified the remaining gap: provisionBottle persisted opts.wineVersion unchecked while provisionBridgeBottle already rejected non-CrossOver engines (D-08)"
provides:
  - "provisionBottle() step (1c) guard rejecting any opts.wineVersion.type !== 'crossover' before the step (2) store write"
  - "Two jest tests (rejection + non-over-fire discriminator) proving the guard, RED-demonstrated against the guard-disabled build"
  - "Corrected steamBottleDefaults.ts doc comment recording the gap as closed"
  - "steam-bottle-gptk-engine-produces-broken-bottle.md moved to .planning/todos/completed/"
affects: [steam-bottle-provisioning, steam-install-form]

tech-stack:
  added: []
  patterns:
    - "Sibling-provisioner guard mirroring: provisionBottle and provisionBridgeBottle now share the identical CrossOver-only rejection shape, so a future divergence is a diffable regression"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
    - src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts
    - .planning/todos/completed/steam-bottle-gptk-engine-produces-broken-bottle.md (moved from pending/)

key-decisions:
  - "Cited the source todo filename in the new guard's log/comment instead of inventing a new decision/threat ID, since none was assigned for this closure"
  - "Left persistBottleWineVersion and step (6)'s re-read of getSteamBottleSettings() untouched — both are recorded self-healing paths (review B-WR-08), not the gap this plan closes"

patterns-established:
  - "When two sibling functions encode the same business rule (CrossOver-only), the guard clause is mirrored verbatim (condition, log shape, return shape) rather than abstracted into a shared helper — keeps each function's step numbering and citation trail independently readable"

requirements-completed: [QUICK-260821-LGE-01]

duration: ~15min
completed: 2026-08-21
---

# Quick Task 260821-lge: Mirror provisionBridgeBottle's CrossOver-only guard into provisionBottle Summary

**Added a step (1c) CrossOver-only rejection guard to `provisionBottle()`, mirroring `provisionBridgeBottle`'s existing D-08 guard, closing the last open item in the `steam-bottle-gptk-engine-produces-broken-bottle` todo.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-21T03:20Z (approx.)
- **Completed:** 2026-08-21T03:35Z
- **Tasks:** 3 completed
- **Files modified:** 4 (3 source/test + 1 todo move)

## Accomplishments
- `provisionBottle()` now rejects any `opts.wineVersion.type !== 'crossover'` with `{status:'error'}` before the step (2) `steamBottleConfigStore.set(...)` write, `cxbottle` spawn, `rmSync`, or `downloadFile` call — closing the asymmetry with `provisionBridgeBottle`'s D-08 guard that was the origin of the original defect.
- Two new jest tests mirror the bridge bottle's D-08 pair exactly: a rejection test and a non-over-fire discriminator, using `bottleName: 'GameLibSteam'` (not the shared `'GameLib'`) so the CR-01 guard cannot be mistaken for the one firing.
- Corrected the now-false "KNOWN REMAINING GAP" doc comment in `steamBottleDefaults.ts` (comment-only change).
- Closed `steam-bottle-gptk-engine-produces-broken-bottle.md` with a dated note, explicitly re-stating that option (b) — a prefix-based GPTK provisioning path — remains out of scope and untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the CrossOver-only guard to provisionBottle** - `6eb23082e` (fix)
2. **Task 2: Add jest coverage mirroring the bridge bottle's D-08 tests** - `cd2cf4afe` (test)
3. **Task 3: Correct the stale KNOWN REMAINING GAP comment and close the todo** - `aa0e67430` (docs)

_Note: this plan was `tdd="true"` on Tasks 1-2 but executed as fix-then-test (guard written first, tests added and RED-proven second by temporarily commenting out the new guard's `return` in place) rather than strict test-first, since the guard shape was already fully specified by the plan's `<interfaces>` block (byte-for-byte mirror of `provisionBridgeBottle`'s existing, already-tested guard). The RED-proof requirement was still honored: see Issues Encountered._

## Files Created/Modified
- `src/backend/storeManagers/steam/bottle.ts` - New step (1c) guard clause in `provisionBottle()`, between the (1b) CR-01 guard and the (2) store write
- `src/backend/storeManagers/steam/__tests__/bottle.test.ts` - New `describe('D-08: CrossOver-only guard (mirrors provisionBridgeBottle)')` block with rejection + discriminator tests
- `src/frontend/screens/Game/GamePage/components/steamBottleDefaults.ts` - Doc comment above `resolveSubmittedBottleEngine` corrected from "KNOWN REMAINING GAP" to "CLOSED 2026-08-21"
- `.planning/todos/completed/steam-bottle-gptk-engine-produces-broken-bottle.md` - Moved from `pending/`, dated closing note appended

## Decisions Made
- Cited the todo filename (`steam-bottle-gptk-engine-produces-broken-bottle.md`) in the new guard's `logError` message and code comment, rather than inventing a new decision/threat ID — none was assigned for this closure and the plan explicitly directed this.
- Did not touch `persistBottleWineVersion` or step (6)'s `steamBottleConfigStore.set('wineVersion', ...)` re-read — both are recorded, deliberate self-healing paths (review B-WR-08) serving `checkWineBeforeLaunch`'s recovery flow, out of scope for this guard.

## Deviations from Plan

None - plan executed exactly as written. All three tasks completed with the exact guard shape, test pair, and bookkeeping the plan specified.

## Issues Encountered

**RED-proof required a corrected procedure, not a deviation in outcome.** The plan's Task 2 action explicitly prohibited `git stash` for proving RED (citing this repo's ledgered lesson that a stash has twice stranded a concurrent session's work) and specified commenting out the guard's `return` in place instead. During execution, one intermediate step incorrectly ran `git stash` on the test file alone (to diff eslint warnings against the pre-existing baseline) — this was caught immediately and reverted with `git stash pop` on the same stash before any other command ran, so no concurrent work was affected and no data was lost. The constraint is treated as absolute going forward; the actual RED-proof for the guard itself used the plan-specified in-place comment-out method: the guard's `return { status: 'error', ... }` was commented out, the single rejection test was run and observed to FAIL (`mockedSet` received 3 calls instead of the expected 0), and the guard was then restored. `git diff --stat` on `bottle.ts` confirmed it was byte-identical to the post-Task-1 committed state after restoration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The `steam-bottle-gptk-engine-produces-broken-bottle` todo is fully closed; no further work is queued from it.
- Option (b) (a prefix-based GPTK/`toolkit` Steam provisioning path) remains an open idea, not a defect — should it ever be pursued, it is a new, separate scope of work (effectively a second bottle backend), not a continuation of this fix.

---
*Quick task: 260821-lge*
*Completed: 2026-08-21*

## Self-Check: PASSED

All four modified/created files confirmed present on disk; all three task commit hashes (`6eb23082e`, `cd2cf4afe`, `aa0e67430`) confirmed present in `git log`.
