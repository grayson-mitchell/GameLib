---
phase: quick-260907-dbh
plan: fix-pause-cancel-button-opening-install-modal
subsystem: ui
tags: [react, jest, frontend, game-page, install-flow]

# Dependency graph
requires: []
provides:
  - "MainButton install onClick now tests !is.installing before opening the fresh-install modal"
  - "Type-enforced census (MainButton.installClickRouting.test.tsx) over every GameContextType['is'] key, guarding against a future flag silently re-introducing this defect shape"
affects: [frontend-game-page, install-flow, steam-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Element-graph jest testing (no jsdom/react-test-renderer): call the component as a plain function, walk the returned React element object graph via findAll(node, predicate)"
    - "Structural label identification by icon element type (e.g. `n.type === Download`), never by translated text"
    - "Compute-then-assert census: run probe() once per flag into a results table, then assert over the whole table so a failure names every offending flag, not just the first"

key-files:
  created:
    - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx
  modified:
    - src/frontend/screens/Game/GamePage/components/MainButton.tsx
    - .planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md (moved from pending/)

key-decisions:
  - "Fix scope stayed to the one conjunct the plan specified (!is.installing) — the census (R2) proved no second reachable disagreement exists, so no additional guard changes were made"
  - "Play button read-verified as already correct (handlePlay's isPlaying||isUpdating guard matches the Stop label) and left untested — out of the defect shape, no code changed there"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-09-07
---

# Quick Task 260907-dbh: Fix Pause/Cancel Button Opening Install Modal Summary

**One-line guard fix (`!is.installing`) on `MainButton.tsx`'s install-button `onClick`, backed by a type-enforced census test proving it was the only reachable label/action disagreement across all 24 `GameContextType['is']` flags.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-07 (session start)
- **Completed:** 2026-09-07T09:50:45+12:00
- **Tasks:** 3 (plus one corrective follow-up commit, see Issues Encountered)
- **Files modified:** 3 (1 created, 1 source file modified, 1 todo moved+rewritten)

## Accomplishments

- Fixed the defect the todo named: mid-download of a non-steam game (legendary/gog/nile/sideload), clicking the Pause/Cancel-labeled main button now falls through to `handleInstall` (the pause/cancel path) instead of reopening the install modal. Steam was already unaffected and stays unaffected.
- Delivered the census the todo explicitly asked for: a type-enforced test over every key of `GameContextType['is']` proving exactly one flag (`installing`) produced a reachable label/action disagreement — not a hand-picked sample.
- Gave the todo's three named siblings (`is.updating`, `is.reparing`, `is.moving`) a measured, asserted verdict (R4): they never change the button label, and the button is disabled while they hold — cleared, not just claimed.
- Re-verified (not assumed) the two downstream source cites the fix depends on: `downloadmanager/utils.ts:182`'s `folder: path` emission and `helpers/library.ts:55`'s `isInstalling` routing to `handleStopInstallation`. Neither had moved.
- Closed the todo with a full per-flag audit table, RED→GREEN evidence, and an explicit Limits section (routing/disabled proven by the element-graph suite; a live download actually stopping rests on read evidence, not runtime evidence).

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — census the label/action disagreement** - `f638420bb` (test)
2. **Task 2: GREEN — add `!is.installing` to the guard** - `7993607ec` (fix)
3. **Task 3: Close the todo with the measured audit table** - `fa2d995af` (docs, incomplete — see below) + `1a269c03c` (docs, corrective follow-up)

_Note: Task 3 required a corrective follow-up commit — see "Issues Encountered."_

## Files Created/Modified

- `src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx` - New suite: R1 direct-defect probe, R2 type-enforced census, R3 label-changing partition pin, R4 todo-named-sibling verdicts, R5 steam-unchanged pins. 8 tests.
- `src/frontend/screens/Game/GamePage/components/MainButton.tsx` - Install-button `onClick` guard at (now) line 305-320 gained a `!is.installing` conjunct, with a comment citing the quick task and tracing the downstream path.
- `.planning/todos/completed/2026-08-29-pause-button-opens-install-modal-for-non-steam-games.md` - Moved from `pending/`; appended Resolution, per-flag audit table, and Limits sections.

## Decisions Made

- Kept the fix to exactly the one conjunct the plan specified. The census (R2) is the evidence that nothing else needed to change — it asserts `violations === []` over all 24 flags, and that assertion is what would have caught a second defect had one existed.
- Left the play button untouched and untested for this defect shape: read-verified (`GamePage/index.tsx:662`) that `handlePlay`'s `isPlaying || isUpdating` guard already matches its `Stop` label, and every other flag `getPlayLabel()` reads sits in `disabledPlayButtons`. This is documented as a read-verified finding in the todo's Resolution section, not a measured one — consistent with the plan's own instruction not to spend a task on it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a mock-leak bug in the RED test's own `probe()` helper**
- **Found during:** Task 1, first RED run
- **Issue:** `openInstallGameModal` is a module-level jest mock shared across every `probe()` call within a single `it()`. R2/R3 call `probe()` once per flag in a loop without resetting that mock between iterations, so a call recorded for an earlier flag (`installing`, processed first, alphabetically first in insertion order) leaked into every later flag's `opensModal` reading. The first RED run consequently reported R2's violation list as `["installing", "queued"]` — which would have tripped the plan's "R2 names a flag other than installing → stop and report a second defect" rule had it been real.
- **Fix:** Added `(openInstallGameModal as jest.Mock).mockClear()` at the top of `probe()`, before invoking `MainButton`.
- **Files modified:** `src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx` (fixed before the RED commit was made — the committed RED output is the corrected one, violation list exactly `["installing"]`).
- **Verification:** Re-ran the suite as its own command after the fix; RED shape matched the plan's expectation exactly (R1/R2 fail, R2 names only `installing`, R3/R4/R5 pass). Confirmed this was a test bug, not a second real defect, by hand-tracing the guard logic for `is.queued` (the guard's own `!is.queued` conjunct already excludes it from opening the modal, independent of this fix).
- **Committed in:** `f638420bb` (the RED test file as committed already contains this fix; there is no separate "broken RED" commit).

---

**Total deviations:** 1 auto-fixed (1 bug, in test infrastructure, not shipped source)
**Impact on plan:** No scope creep — the underlying census logic and assertions are exactly as the plan specified; only the mock-hygiene bug in the harness was fixed. No second defect was found or needed fixing.

## Issues Encountered

**Task 3 staging bug (self-caused, corrected in-session, not a plan deviation).** After using `git mv` to stage the todo's rename and then appending ~128 lines of Resolution/audit-table/Limits content via the Edit tool, I staged the commit with `git add pathA pathB` where `pathB` (the old `pending/` path) no longer existed. `git add` with a nonexistent pathspec fails atomically and stages nothing — but the rename from the earlier `git mv` was already in the index, so the commit (`fa2d995af`) went through with 0 insertions/deletions, capturing only the bare rename with pre-resolution (68-line) content. Caught immediately by diffing the committed blob against the working tree (`git show <hash>:<path> | wc -l` vs `wc -l` on disk: 68 vs 196). Fixed with a follow-up commit (`1a269c03c`, 128 insertions) that added the actual content. Final state verified: `git diff HEAD -- <path>` is empty, and the todo's completed-path content matches what was written (196 lines, `grep -c "MEASURED"` returns 1, `pending/` no longer contains the file).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The fix is shipped, tested, and the todo is closed. No follow-on work identified — the census in `MainButton.installClickRouting.test.tsx` is type-enforced (`DEFAULT_IS: GameContextType['is']`), so a future flag added to that type will fail `tsc` until the census test is updated, preventing this defect shape from silently reappearing.
- Not run (deliberately, per plan): `pnpm test:ci` (RED at HEAD from an unrelated leaked 60s timer in `sidecarRpc.ts:339`) and `pnpm lint` (above its Phase 39 warning ceiling). Neither is this task's to fix; both are pre-existing and tracked elsewhere.

---
*Quick task: 260907-dbh*
*Completed: 2026-09-07*

## Self-Check: PASSED

All 4 claimed files verified present on disk (including confirming the pending-path todo is absent), and all 4 claimed commit hashes verified present in `git log --oneline --all`.
