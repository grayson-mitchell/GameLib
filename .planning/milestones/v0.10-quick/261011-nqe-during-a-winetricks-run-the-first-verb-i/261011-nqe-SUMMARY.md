---
phase: quick
plan: 261011-nqe
subsystem: winetricks
tags: [winetricks, ipc-race, revision-ordering, tdd]
status: complete
plan_head_before: "165103156"
plan_head_after: "3c6dbb3aacf1ab44637e0da163c29b4b4b22c4cb"
commits:
  - aff474c69b0facd3cabf08fa2d2e25ae9b327bd5
  - 6e1ea7ee4
  - 3c6dbb3aa
actuals:
  tasks: 3
  commits: 3
---

# Quick Task 261011-nqe: During a Winetricks run the first verb intermittently renders as Queued with Cancel disabled — Summary

A process-wide `revision` counter on every `WinetricksQueueState` snapshot, plus a single
`takeQueueState()` guard the renderer routes every state source through (mount read, live push,
apply reply, cancel reply), closes the 45-12 G3 race where a stale IPC reply could regress the
in-flight first verb back to Queued with Cancel disabled; the backend's `apply()` reply is now
also snapshotted after the run's own first push, so it is never older by send order either.

## Tasks

1. **Tracer — revision ordering end to end** (`aff474c69`): `WinetricksQueueState` gained
   `revision: number`; `winetricksQueue.ts` stamps it via a module-level counter in `getState()`;
   `index.tsx` gained `appliedRevision` + `takeQueueState()`, wired into the mount read, the live
   push, and the apply-reply path.
2. **Expand — guard the cancel and remount replies, keep D-15 and the reload honest, snapshot the
   apply reply after the first push** (`6e1ea7ee4`): extended `takeQueueState()` to the cancel
   reply and (already-guarded) remount read; `onQueueChanged`'s done-reload check now reads
   `latestRun.current` instead of the incoming push's own `state.run`; `applyVerbs`'s D-15 clear
   now folds the newest applied run's outcomes back over the clear; `winetricksQueue.ts`
   `apply()`'s reply snapshot moved to after `void runLoop(run).catch(...)`.
3. **Close the todo** (`3c6dbb3aa`): moved
   `.planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md`
   to `completed/` via `git mv`, appended a `## Fix` section in the sibling kqx closure's style.

## RED evidence

- **Task 1, test 1** (G3 race, apply reply lands last): RED on pre-fix code —
  `findByClass(afterReply, 'WinetricksRow--installing')` → `Expected length: 1, Received length:
  0, Received array: []`, with the pre-reply anchor assertion (Installing, Cancel enabled)
  passing first. GREEN after the fix. Regenerated against `165103156` during this session (via
  `git show`+`cp`, never `git checkout --`) to confirm, since the original RED capture predates
  this continuation.
- **Task 1, test 3** (control: fresh reply IS applied): green throughout, confirmed both before
  and after, unaffected by the fix.
- **Task 2, test 2 / F5** (run finishes before its reply): RED on Task-1-only code —
  `findByClass(tree, 'WinetricksRow--errored')` → `Expected length: 1, Received length: 0,
  Received array: []`. GREEN after the D-15 fold.
- **Task 2, test 4** (stale cancel reply): RED on Task-1-only code — `findByClass(tree,
  'WinetricksStickyBar--done')` → `Expected length: 1, Received length: 0, Received array: []`.
  GREEN after routing the cancel reply through `takeQueueState`.
- **Task 2, test 5** (stale remount read): RED on Task-1-only code — `findByClass(tree,
  'WinetricksStickyBar--inFlight')` → `Expected length: 1, Received length: 0, Received array:
  []`. GREEN after routing the mount read through `takeQueueState`.
- **Task 2, test 6** (dropped stale done push still reloads once): green on Task-1-only code
  already; stays green after Task 2.
- **Task 2, backend test (i)** (apply reply's place in the push order): RED on Task-1-only code —
  `result.state.run?.currentVerb` → `Expected: "xact", Received: ""`. GREEN after moving the
  snapshot.
- **Task 2, backend tests (ii)/(iii)** (pins): green on Task-1-only code, green after.

## Test counts

- Frontend (`WinetricksSettings` + `DeferredChannelCallSiteGuard`): 15 suites, 239 tests, all
  passing.
- Backend (`winetricksQueue.test.ts` + 4 sidecar suites): 5 suites, 222 tests, all passing.
- `pnpm codecheck`, `npx eslint` (0 errors; one pre-existing `react-hooks/rules-of-hooks` warning
  at `index.tsx:217`, confirmed present in the Task-1-committed code too — out of scope, not
  introduced by this task), and `npx prettier --check` on all touched source files: all clean.
- `pnpm planning-gates`: 12/12 passed.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 - blocking issue] Backend test (i) left `currentRun` stuck `running`, refusing the
next test's `apply()` as busy.**
- **Found during:** Task 2, capturing backend RED evidence.
- **Issue:** Test (i) called `await finishChild(0, 0); await finishChild(1, 0)` back-to-back with
  no intervening `await spawned(2)`, mirroring a gap rather than the established pattern used
  elsewhere in the file (e.g. "WinetricksQueue.apply order (D-11)"). Under RED specifically, the
  test's own `expect` on `currentVerb` throws before reaching the `finishChild` calls at all,
  leaving the run's children never drained and the module-level `currentRun` singleton stuck
  `running` for the next test in the same file.
- **Fix:** Inserted `await spawned(2)` between the two `finishChild` calls.
- **Files modified:** `src/backend/tools/__tests__/winetricksQueue.test.ts`
- **Commit:** `6e1ea7ee4`

**2. [Rule 1 - bug] Unused `settled` variable in the new test 4, caught by eslint.**
- **Found during:** Task 2 verify.
- **Issue:** `const settled = await mountTab(...)` in test 4 was never read (test 4 is a
  push-only setup with no checkbox press), tripping `@typescript-eslint/no-unused-vars`.
- **Fix:** Dropped the capture (`await mountTab(...)`), matching the no-capture pattern already
  used by tests 5 and 6 in the same file.
- **Files modified:** `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx`
- **Commit:** `6e1ea7ee4`

**3. [Rule 3 - blocking issue] Prettier formatting drift in the backend test file after the
`spawned(2)` insertion.**
- **Found during:** Task 2 verify.
- **Fix:** `npx prettier --write` on the one file, then re-confirmed `--check` clean.
- **Files modified:** `src/backend/tools/__tests__/winetricksQueue.test.ts`
- **Commit:** `6e1ea7ee4`

## Plan deviation: mutation proof for test 6 did not reproduce the predicted failure

The plan's mutation proof for test 6 (revert `onQueueChanged`'s reload-check source from
`latestRun.current` back to the incoming push's own `state.run`, expect test 6 to FAIL with the
installed-list call count at 1) was performed exactly as specified, via `cp` to/from a scratchpad
copy (never `git checkout --`), shasum-verified on restore
(`61869d2b8932b68f0d55d4fdbeb06ad65feb02dc`). It did **not** fail: the suite stayed 6/6 green,
test 6's exact-2-calls assertion unchanged.

**Why:** in test 6's scripted scenario, the cancel reply resolves FIRST (applying the done state
to `latestRun.current`), and the stale done push delivered afterward carries the *same* `runId`
and `'done'` status as what was just applied — `takeQueueState(state)` drops the push itself (its
revision is older), but the two possible sources for the reload check's "newest run" argument
(`latestRun.current` vs. the dropped push's own `state.run`) happen to agree on content in this
specific test, so swapping the source makes no observable difference here.

This was flagged as a live risk during planning review (recorded in this session's reasoning
before the mutation was run) and the empirical result confirms it: no test in the file currently
isolates the `latestRun.current`-vs-`state.run` choice in `onQueueChanged`. The choice is correct
by code read (a dropped push's own content is, by construction, exactly what the revision guard
just rejected as stale) but is not red-proven by any test here. Documented in the closed todo's
`## Fix` section under "What is unit-proven" rather than silently claimed as passing mutation
evidence.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes. All changes are renderer-
and backend-local state ordering within the existing Winetricks IPC surface.

## Self-Check: PASSED

- `src/backend/tools/winetricksQueue.ts`, `src/frontend/screens/Settings/sections/WinetricksSettings/index.tsx`,
  `src/backend/tools/__tests__/winetricksQueue.test.ts`,
  `src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/queueStateOrdering.test.tsx`:
  FOUND, confirmed on disk matching the GREEN scratchpad shasums restored after the mutation
  proof.
- `.planning/todos/completed/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md`:
  FOUND. `.planning/todos/pending/2026-10-11-winetricks-run-first-verb-renders-queued-and-cancel-stays-disabled.md`:
  confirmed absent.
- Commits `aff474c69`, `6e1ea7ee4`, `3c6dbb3aa`: all FOUND in `git log --oneline -3`.
- `.planning/milestone.lock` was never staged in any commit (confirmed via `git status --short`
  before every commit in this session).
- `45-UAT.md` confirmed byte-unchanged since `165103156` (`git diff --quiet`).
- `graphify update .` ran successfully; output is gitignored, nothing to commit.

## Not done / left for later

- **Live verification of 45-12 G3 is owed.** This fix is unit-proven only. A live re-run (press
  Cancel remaining during the first verb of a fresh three-verb run, confirm Cancel enabled and
  the row shows Installing throughout) is required before 45-UAT.md item 3 can be re-scored from
  `issue`. Not attempted in this session — deliberately out of scope per the plan.
- **G1/G7 run-frame recheck** (first verb shows a spinner and phase word in every launch ordinal,
  not only launch 4) is also owed and not attempted here.
- **F3 open observation** (the stale reply also regressed `latestRun.current`, which gates
  `onProgress`, dropping the first verb's progress lines/percent while the reply was in effect) is
  recorded in the closed todo as unmeasured — no claim made about whether this fix affects
  45-UAT.md item 12 (`blocked`).
- **The test-6 mutation-proof gap** described above: no test currently isolates the
  `latestRun.current`-vs-`state.run` choice in `onQueueChanged`'s done-reload check. A future task
  could add a scenario where the dropped push's content and the already-applied run genuinely
  differ (e.g. the push reports a different failed count than the applied run) to give this guard
  a real mutation-killing test.
