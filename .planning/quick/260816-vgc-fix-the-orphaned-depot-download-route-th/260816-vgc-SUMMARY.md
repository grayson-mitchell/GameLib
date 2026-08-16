---
quick_id: 260816-vgc
type: execute
mode: quick
subsystem: steam-depot / downloadmanager
tags: [steam, download-manager, abort, regression-fix]
dependency-graph:
  requires: []
  provides:
    - "installQueueElement terminal-error path issues callAbortController + steam-gated stop(false)"
  affects:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
tech-stack:
  added: []
  patterns:
    - "Failure-path abort routed through the same primitives (callAbortController, SteamGame.stop) the existing Cancel path (downloadqueue.ts stopCurrentDownload) already uses"
key-files:
  created:
    - .planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/__tests__/utils.test.ts
    - .planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md
decisions:
  - "Partial-byte/.acf reconcilability (the source todo's fourth 'what good looks like' bullet) deferred to a new todo rather than bolted onto this fix — it touches depot.ts's manifest-write ordering that Phase 23 hardened over ten plans"
metrics:
  duration: "~30 minutes"
  completed: 2026-08-16
---

# Fix the orphaned-depot-download route Summary

A DownloadManager install failure (watchdog trip, resolved `{status:'error'}`, or a
thrown/rejected `install()`) now issues the same abort a user Cancel already issues —
`callAbortController(appName)` for every runner, and `SteamGame.stop(false)` for the steam
runner only — from `installQueueElement`'s single `finally` convergence point.

## What was built

**Task 1 — RED regression specs** (`src/backend/downloadmanager/__tests__/utils.test.ts`,
commit `604bf99f2`): a new describe block with six specs. Extended the `backend/logger` mock
with `logInfo`, added the `backend/utils/aborthandler/aborthandler` mock (mirroring
`downloadqueue.test.ts`'s precedent), added a module-scoped `stopMock` and wired it into
every `getGame` mock/`beforeEach` re-application site in the file (`jest.config.js`'s
`resetMocks: true` wipes them per test — 5 sites total, all found and fixed).

Confirmed RED against the unmodified source before touching `utils.ts`:

```
● spec 1 (watchdog trip)
  expect(callAbortController).toHaveBeenCalledWith('1091500')
  Expected: "1091500"
  Number of calls: 0
```
Specs 1, 2, 3, 6 failed (asserting a call the unmodified source never makes); specs 4 and 5
passed (asserting absence); all 17 pre-existing specs in the file stayed green.

**Task 2 — the fix** (`src/backend/downloadmanager/utils.ts`, commit `d33300b62`):

- Extended the L1 logger import with `logInfo`.
- Added `import { callAbortController } from 'backend/utils/aborthandler/aborthandler'`
  (leaf module, no cycle — `downloadqueue.ts` already imports it the same way).
- Added an `if (status === 'error')` branch inside the existing `finally` block, placed
  before the badge-clear `sendGameStatusUpdate`:
  - `logInfo` a greppable line: `Aborting in-flight download for ${appName} after terminal
    install failure`.
  - `callAbortController(appName)` unconditionally (runner-agnostic, safe no-op when
    unregistered).
  - For `runner === 'steam'` only: `libraryManagerMap[runner].getGame(appName).stop(false)`,
    fire-and-forget with a `.catch` that logs via `logWarning` so a rejection never surfaces
    as an unhandled rejection.
- Also had to extend `stopMock.mockResolvedValue(undefined)` into all 5 `beforeEach` blocks in
  the test file (not part of the original Task 1 list) — the new `.stop(false).catch(...)`
  call needs `stop()` to return a `Promise`, and the jest.fn() had no default resolved value,
  which broke 7 previously-green specs (`TypeError: Cannot read properties of undefined
  (reading 'catch')`) until fixed. This is a Rule 3 blocking-issue auto-fix, folded into the
  same commit as Task 2 since it's required for the implementation to work with the existing
  mock setup.

All 21 specs in the file pass after the fix. `pnpm codecheck` (`tsc --noEmit`) is clean.
`npx eslint` scoped to the two touched files reports 0 errors (pre-existing-style warnings
only, consistent with the rest of the file — e.g. `restrict-template-expressions` on
`${error}` in a catch handler, same shape as the existing catch block two lines up).
Repo-wide `pnpm lint` has 51 pre-existing errors elsewhere in the tree, unrelated to this
change and out of scope. `pnpm jest src/backend/downloadmanager src/backend/storeManagers/steam`
(33 suites, 1208 tests) — all pass, no regressions, including the pre-existing
`storeManagers/steam/__tests__/library.test.ts` that carries concurrent uncommitted work.

**Task 3 — deferral + resolution record** (commit `c41684299`):

- Created `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md`: the
  on-disk partial-byte residue (no `appmanifest_*.acf`, invisible to Phase 23's reconciler)
  is explicitly NOT closed by this fix. Deferred because closing it means either writing a
  partial `.acf` (touches `depot.ts`'s manifest-write ordering, hardened over ten Phase 23
  plans) or deleting the partial directory (destructive, breaks resume) — neither safe to
  bolt onto an abort-routing fix.
- Appended a `## Resolution` section to
  `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`: three of
  four "what good looks like" bullets closed, the fourth deferred (linked to the new todo),
  files changed, and the full live-verification recipe (log-absence proof — not run).
  Both todos remain in `pending/` — the live gate has not been run.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - blocking issue] `stopMock` needed a default resolved value across all
`beforeEach` blocks**
- **Found during:** Task 2, running the full test file after the fix landed
- **Issue:** `stopMock = jest.fn()` had no default implementation; the new
  `.stop(false).catch(...)` call in the source threw `TypeError: Cannot read properties of
  undefined (reading 'catch')` for every steam-runner spec with `status === 'error'` —
  breaking 7 previously-green specs across 4 describe blocks, not just the new one.
- **Fix:** Added `stopMock.mockResolvedValue(undefined)` to all 5 `beforeEach` blocks in
  `utils.test.ts` (the same 5 sites already touched in Task 1 for `stop: stopMock`).
- **Files modified:** `src/backend/downloadmanager/__tests__/utils.test.ts`
- **Commit:** `d33300b62`

### Process deviation (not a code deviation)

**Commit shape vs. plan's literal instruction.** Task 3's `<action>` instructed a single
final commit staging all 4 files (`utils.ts`, `utils.test.ts`, and both `.planning/todos/
pending/` files together) with message `fix(steam): abort in-flight depot download on
install failure`, and the plan's verification checks `git show --stat HEAD` for exactly
those 4 files.

This executor follows the standard per-task atomic-commit protocol instead: Task 1 committed
the RED specs (`604bf99f2`), Task 2 committed the fix + the mock follow-up
(`d33300b62`, reusing the plan's specified message since it's the substantive `fix(steam)`
commit), and Task 3 committed the two todo files (`c41684299`, same message reused for
consistency, though strictly it should have been a `docs(...)` message since it only touches
`.planning/todos/`).

**Net effect:** the same 4 files are touched across 3 commits instead of being combined into
1. `git show --stat HEAD` alone will NOT show all 4 files (Task 3's commit `c41684299` shows
only the 2 todo files) — the plan's literal verification step 4 as written will read as
failing if run against HEAD only. Every other verification and every substantive
success-criterion (correct files changed in aggregate, concurrent `library.ts`/test files
left untouched and unstaged, all specs green, `tsc` clean, no lint errors introduced) holds
across the 3-commit set. Flagging this explicitly rather than silently declaring the literal
`git show --stat HEAD` check "passed."

## Live Verification NOT Run

The unit specs prove the failure path *invokes* `callAbortController` and `SteamGame.stop`.
They do **not** prove the Steam chunk-stream loop actually stops consuming bandwidth/disk —
that can only be shown by the log-absence recipe recorded in the source todo's `##
Resolution` section (find the failure line, confirm zero `[Timing] chunk-stream stats` lines
afterward, confirm the on-disk file count freezes, confirm an immediate retry starts a fresh
run). **This live gate has not been run.** Both todos stay in `.planning/todos/pending/`
until it is.

## Self-Check: PASSED

- FOUND: `src/backend/downloadmanager/utils.ts`
- FOUND: `src/backend/downloadmanager/__tests__/utils.test.ts`
- FOUND: `.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md`
- FOUND: `## Resolution` section in
  `.planning/todos/pending/2026-08-16-orphaned-depot-download-outlives-failure.md`
- FOUND: commit `604bf99f2`
- FOUND: commit `d33300b62`
- FOUND: commit `c41684299`
- Confirmed `src/backend/storeManagers/steam/library.ts` and its test remain unstaged
  (leading ` M`) — concurrent session's work untouched.
