---
phase: quick-260908-wk0
plan: 01
subsystem: tauri-sidecar
tags: [bootstrap, gog, playtime-sync, runOnceWhenOnline, jest, mutation-testing]

requires:
  - phase: quick-260907-odi
    provides: "Block D — clearStrandedPlaytimeSyncLock(), the stranded-lock clear that Block G must run strictly after"
provides:
  - "Block G — exported syncQueuedPlaytimeWhenOnline() in bootstrap.ts, wired into init() after Block D, draining the GOG queued-playtime queue once online at boot"
  - "Dedicated jest suite (playtimeQueueBootDrain.test.ts) proving wiring, ordering, both setting arms, and both never-fail-boot arms, load-bearing per 4 mutations"
  - "Closed todo: 2026-09-06-queued-gog-playtime-never-drains-at-boot.md, RESOLVED"
affects: [gog-library-manager, sidecar-bootstrap-sequence]

tech-stack:
  added: []
  patterns:
    - "Three-guard defensive pattern (outer try / inner try / explicit .catch()) reused a fourth time for a never-fails-boot deferred callback"
    - "Non-vacuous ordering proof: recording precondition state inside the mock's own side effect at call time, validated load-bearing via mutation testing"

key-files:
  created:
    - src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - .planning/todos/completed/2026-09-06-queued-gog-playtime-never-drains-at-boot.md

key-decisions:
  - "Block G is sequenced strictly AFTER Block D (stranded-lock clear): syncQueuedPlaytime()'s first statement is `if (playtimeSyncQueue.has('lock')) return`, so running Block G before Block D would let a lock stranded by process death silently no-op the drain for exactly the users whose previous sync died mid-flight."
  - "Settings (disablePlaytimeSync) are read synchronously outside the runOnceWhenOnline callback, matching the deleted main.ts's whenReady()-time read, not an online-time read."
  - "The disabled-arm logDebug line is kept verbatim and unprefixed per the house rule Block E established (ported log literals keep their original form); the two new catch-arm diagnostics take the local [bootstrap] prefix, naming the function."
  - "gogPresence.setPresence (main.ts:477, the very next line of the deleted source) was deliberately NOT ported — left to its own already-open todo."

requirements-completed:
  - TODO-2026-09-06-queued-gog-playtime-never-drains-at-boot

duration: ~13min (span between Task 1 and final Task 3 fix commit; excludes earlier planning/investigation time from the prior session segment)
completed: 2026-09-08
---

# Quick Task 260908-wk0: Port boot-time GOG queued-playtime drain Summary

**Restored `syncQueuedPlaytimeWhenOnline()` as Block G of the Tauri sidecar's `bootstrap.ts` `init()`, sequenced strictly after Block D's stranded-lock clear, with a dedicated 6-case jest suite proven load-bearing by 4 required mutations.**

## Performance

- **Started:** 2026-09-08T23:37:55+12:00 (Task 1 commit)
- **Completed:** 2026-09-08T23:50:11+12:00 (final Task 3 fix commit)
- **Tasks:** 3 (all `type="auto"`, no checkpoints)
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- GOG playtime queued while offline now drains at boot once online, instead of waiting for the next completed GOG game session — closing the gap left when `main.ts` was deleted in `5643c7583`.
- The drain observes an already-cleared stranded lock (Block D runs first), so a lock stranded by a prior process death cannot silently no-op this drain.
- Neither a synchronous throw nor a promise rejection anywhere in the new path can fail sidecar boot or escape to `processGuards` — proven by two dedicated never-fails-boot test cases plus two mutations that turn each RED when the corresponding guard is removed.
- The ordering invariant (Block G after Block D) is proven non-vacuous: the test records `playtimeSyncQueue.has('lock')` inside the mock's own call-time side effect, and Mutation 2 (moving Block G above Block D) correctly flips the recorded array from `[false]` to `[true]`, failing the assertion.
- The pre-existing boot-time todo (`2026-09-06-queued-gog-playtime-never-drains-at-boot.md`) is closed with a RESOLVED status naming what shipped and what remains explicitly open.

## Task Commits

Each task was committed atomically:

1. **Task 1: Port Block G into bootstrap.ts** - `1342fd9b4` (feat) — new import (`libraryManagerMap`), new guard flag (`playtimeQueueDrainInitialized`), new exported `syncQueuedPlaytimeWhenOnline()` helper, new guarded call site in `init()` after Block F / before `READY_SENTINEL`.
2. **Task 2: Dedicated jest suite + containment registration** - `9c518da0c` (test) — `playtimeQueueBootDrain.test.ts` (6 cases) plus `testContainment.test.ts` registration in `STRUCTURALLY_CONTAINED_SUITES`.
3. **Task 3: Regression sweep, bundle receipt, close the todo** - `7aa263c6e` (chore, pure rename) + `97131668e` (fix, content correction — see Deviations below) — moved the todo `pending/` → `completed/` and applied the RESOLVED frontmatter rewrite.

**Plan metadata:** not yet committed (orchestrator's responsibility per explicit constraint — this SUMMARY.md, STATE.md, ROADMAP.md are NOT committed by this execution).

_Note: Task 2 is a single `test` commit (suite + registration together) since this plan's tasks are not individually TDD-gated (`type="auto"`, not `tdd="true"`)._

## Files Created/Modified

- `src/backend/sidecar/bootstrap.ts` - Adds Block G: exported `syncQueuedPlaytimeWhenOnline()` and its guarded call site in `init()`, sequenced after Block D.
- `src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts` - New dedicated suite: fused wiring+ordering proof through `init()`, both setting arms (enabled/disabled), both never-fail-boot arms (async rejection, sync throw).
- `src/backend/sidecar/__tests__/testContainment.test.ts` - Registers the new suite in `STRUCTURALLY_CONTAINED_SUITES`; docstring records the measured recount (65 total `*.test.ts` files: 4 `IN_SCOPE_SUITES` + 61 `STRUCTURALLY_CONTAINED_SUITES`).
- `.planning/todos/completed/2026-09-06-queued-gog-playtime-never-drains-at-boot.md` - Moved from `pending/`, status rewritten to `RESOLVED 2026-09-08 by quick-260908-wk0`.

## Verification Evidence

### Mutation testing (all 4 required, each observed RED then reverted)

Bootstrap.ts confirmed byte-identical to the Task 1 commit both before mutation testing began and after all 4 mutations were reverted: `git diff 1342fd9b4 -- src/backend/sidecar/bootstrap.ts` produces 0 lines of output, and `grep -n "MUTATION" src/backend/sidecar/bootstrap.ts` exits 1 (no matches) in the final state.

**Mutation 1** — commented out the `syncQueuedPlaytimeWhenOnline()` call inside Block G's guard. Result: RED, case 1 assertion (a):
```
expect(jest.fn()).toHaveBeenCalledTimes(expected)
Expected number of calls: 1
Received number of calls: 0
```

**Mutation 2** (the load-bearing one) — moved Block G's entire `if (!playtimeQueueDrainInitialized)` block to sit immediately BEFORE Block D's `if (!playtimeLockClearInitialized)` block. Result: RED, case 1 assertion (b), the recorded array flips from the expected `[false]` to the received `[true]`:
```
expect(received).toEqual(expected) // deep equality
- Expected  - 1
+ Received  + 1
  Array [
-   false,
+   true,
  ]
```
This proves the ordering assertion measures the real precondition state at call time, not merely that the mock was invoked.

**Mutation 3** — deleted the `.catch(...)` from the `syncQueuedPlaytime()` call inside the deferred callback. Result: RED, case 4 (the rejection escapes uncaught and the expected `logWarning` never fires):
```
gameplay.gog.com unreachable
  > 188 | .mockRejectedValue(new Error('gameplay.gog.com unreachable'))
...
expect(received).toBe(expected) // Object.is equality
Expected: true
Received: false
```

**Mutation 4** — deleted the inner `try/catch` inside the deferred callback (leaving only the outer try and the `.catch()`). Result: RED, case 6 (the synchronous throw escapes uncaught):
```
expect(received).not.toThrow()
Error name:    "Error"
Error message: "synchronous failure"
  at GOGLibraryManager.<anonymous> (...):242:17
  at src/backend/sidecar/bootstrap.ts:533:32
```

### testContainment.test.ts measured counts

Measured (not carried forward) at execution time via `ls *.test.ts | wc -l` in `src/backend/sidecar/__tests__/`: **65** total suites = 4 `IN_SCOPE_SUITES` + 61 `STRUCTURALLY_CONTAINED_SUITES`. This matches the count recorded in the docstring added to `testContainment.test.ts`, and was re-verified identical after all mutation-testing round-trips (no suite files were added or removed).

### Bundle-level receipt (`pnpm build:sidecar`)

Build succeeded: `build/main/sidecar.js`, **1,373,257 bytes**, mtime **Sep 8 23:45:12 2026**.

Raw grep count of the literal substring `syncQueuedPlaytime()` in the bundle: **4** matches (not directly comparable to the todo's originally recorded count of 1, since the todo's methodology is unknown and the definition line itself also matches this substring — see breakdown below, which is the honest receipt):

```
24157:          runOnceWhenOnline(() => libraryManagerMap["gog"].syncQueuedPlaytime());
24316:      async syncQueuedPlaytime() {
38332:        libraryManagerMap["gog"].syncQueuedPlaytime().catch((error) => {
38334:            `[bootstrap] syncQueuedPlaytimeWhenOnline: syncQueuedPlaytime() failed: ${String(error)}`,
```

- Line 24157: the pre-existing production call site (`gog/games.ts:1391`, post-game-session — unchanged by this task).
- Line 24316: the `syncQueuedPlaytime()` method definition itself (`gog/library.ts`).
- Line 38332: **new** — the Block G call site added by this task.
- Line 38334: a log-message string literal containing the substring, not an invocation.

**Real invocation call-site count: 2** (1 pre-existing + 1 new), which is the accurate delta this task adds: the boot-time drain is now a second real caller of `syncQueuedPlaytime()`, alongside the pre-existing post-game-session call.

Disabled-arm skip-log receipt: `grep -c 'Skipping playtime sync queue upload' build/main/sidecar.js` → **1** match, at bundle line 38325, confirmed to be the new Block G disabled-arm `logDebug` line (verbatim/unprefixed per D6), immediately preceding the call-site cluster above.

### Regression sweep

- `npx jest src/backend/sidecar/__tests__/` (full sidecar suite, re-run after all mutation-testing round-trips): **64/65 suites, 1431/1432 tests passed.** The one failure is `electronUntouched.test.ts`'s "by-construction gate" test — see Pre-existing Failure below.
- `npx jest src/backend/storeManagers/gog/__tests__/`: **4/4 suites, 40/40 tests passed**, fully green.
- `npx jest src/backend/sidecar/__tests__/bootstrapWirings.test.ts`: **1/1 suite, 13/13 tests passed**, fully green (idempotency-family suite, unaffected by Block G).
- `pnpm planning-gates`: **9/9 gates passed** (re-confirmed after the Task 3 content-fix commit).

### Pre-existing failure (classified, not fixed)

`electronUntouched.test.ts`'s "by-construction gate: keyringTokenStore.ts and bootstrap.ts never reference configStore/TOKEN_STORE_KEY/TOKEN_PREFIX (comments stripped)" fails at current HEAD. This is **NOT caused by this task's changes** — Block G only imports/uses `GlobalConfig`, `logDebug`, `logWarning`, `runOnceWhenOnline`, and `libraryManagerMap`; it never references `configStore`.

Proven pre-existing at baseline sha `80de085d9` (the HEAD commit before any of this task's Task 1/2/3 commits):
```
git show 80de085d9:src/backend/sidecar/bootstrap.ts | grep -n "configStore"
```
returns 5 matches, including line 91 (`import { configStore } from '../constants/key_value_stores'`) and line 413 (`configStore.delete('userInfo')`), both inside the pre-existing `reconcileStoreUsersWhenOnline()` function (Block E, ported by an earlier quick task, `quick-260908-fre`). This gate was already RED before this task began; per the plan's explicit instruction, it was not adjusted or fixed.

## Decisions Made

- **D2 (load-bearing ordering):** Block G placed strictly after Block D. `syncQueuedPlaytime()`'s first statement (`if (playtimeSyncQueue.has('lock')) return`) means running Block G before Block D would let a stranded lock silently no-op the drain for exactly the users the fix targets.
- **D4 (three guards, not one):** outer try (registration + synchronous settings read) / inner try (deferred callback body) / explicit `.catch()` on the floated async call — because `runOnceWhenOnline`'s deferred case runs the callback on a later turn, outside any `try` wrapping the registration call, and `syncQueuedPlaytime()` can reject (its `try/finally` re-throws rather than swallowing).
- **D5 (settings read outside the callback):** `GlobalConfig.get().getSettings()` runs synchronously at helper-entry time, matching the deleted `main.ts`'s `whenReady()`-time read, for both fidelity and determinism.
- **D6 (verbatim/unprefixed skip log, with an honest limit):** the ported `logDebug` line keeps its original unprefixed form per the house rule Block E established, but — unlike Block E's own string — this string is NOT itself the todo's bundle-level evidence; that evidence is the `syncQueuedPlaytime()` call-site count. The verbatim decision here rests on port fidelity and the house rule, not on protecting a named grep, though it remains an independent receipt for the disabled arm specifically (the string appears zero times elsewhere in `src/`).
- **D13 (explicitly out of scope):** `runOnceWhenOnline(gogPresence.setPresence)` sat on the very next line of the deleted `main.ts:477`. It was seen and deliberately left to its own already-open todo (`2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md`); `gogPresence` is not imported by this function.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `git mv` staged a pure rename with zero content change, silently dropping the frontmatter edit**
- **Found during:** Task 3, immediately after committing the todo closure.
- **Issue:** The todo's frontmatter was edited (status: OPEN → RESOLVED, plus the line-drift note) on disk BEFORE running `git mv pending/... completed/...`. `git status --short` correctly showed `RM` (renamed + modified) at that point, but the resulting commit (`7aa263c6e`) turned out to be a pure 100%-similarity rename with `0 insertions(+), 0 deletions(-)` — the frontmatter edit never actually reached the committed blob, even though the working tree still had it after the commit.
- **Fix:** Re-verified the working tree still held the correct edited content (`git diff` against HEAD showed the intended 2-line frontmatter change), staged only that file explicitly (`git add .planning/todos/completed/2026-09-06-....md`), confirmed via `git diff --cached --name-only` that nothing else was staged, and committed the content separately.
- **Files modified:** `.planning/todos/completed/2026-09-06-queued-gog-playtime-never-drains-at-boot.md` (same file, second commit).
- **Verification:** `git show HEAD:.planning/todos/completed/2026-09-06-....md` confirmed the RESOLVED status and drift note are present in the committed blob; `pnpm planning-gates` re-run and confirmed 9/9 green afterward.
- **Committed in:** `97131668e`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug).
**Impact on plan:** No scope creep; this was a git-mechanics correction to ensure the plan's own required deliverable (the RESOLVED frontmatter) actually landed. The final committed state matches the plan's `must_haves.artifacts` entry for this file (`contains: "RESOLVED 2026-09-08 by quick-260908-wk0"`) exactly.

## Issues Encountered

The pre-existing `electronUntouched.test.ts` failure (see Verification Evidence above) required investigation to confirm it was not introduced by this task. Resolved by tracing the offending `configStore` references to baseline sha `80de085d9`, predating this task, inside the unrelated `reconcileStoreUsersWhenOnline()` function (Block E, `quick-260908-fre`). Not fixed, per the plan's explicit "do NOT adjust a test to make it green" instruction for pre-existing red.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Block G is complete, tested, and mutation-proven. The sibling gap this task deliberately left open — `gogPresence.setPresence` never being called at boot — remains tracked at `.planning/todos/pending/2026-09-06-gog-presence-never-set-at-startup-and-its-keepalive-never-arms.md` for a future quick task. The pre-existing `electronUntouched.test.ts` red (baseline `80de085d9`) also remains open and un-actioned by this task, tracked implicitly by that suite's own continued red state (not separately filed as a todo by this task, since filing it was outside this task's scope).

## Self-Check: PASSED

- Created files: all 3 confirmed present (`playtimeQueueBootDrain.test.ts`, closed todo at `completed/`, this SUMMARY.md).
- Modified files: both confirmed present (`bootstrap.ts`, `testContainment.test.ts`).
- Confirmed absent: the old `pending/` path for the closed todo no longer exists.
- Commit hashes: all 4 confirmed present in `git log --oneline --all` (`1342fd9b4`, `9c518da0c`, `7aa263c6e`, `97131668e`).

---
*Phase: quick-260908-wk0*
*Completed: 2026-09-08*
