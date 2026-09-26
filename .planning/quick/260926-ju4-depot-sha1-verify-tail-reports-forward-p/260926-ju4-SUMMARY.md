---
quick_id: 260926-ju4
title: Report forward progress from inside sha1File so a long depot verify tail cannot be misread as a stalled run
date: 2026-09-26
status: complete
tasks_completed: 3
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - .planning/todos/completed/2026-09-26-depot-stall-bound-can-over-fire-on-a-long-sha1-verify-tail.md
commits:
  - a8e33d352 fix(quick-260926-ju4): report sha1 verify-tail progress to the run stall clock
  - da85a92a2 test(quick-260926-ju4): pin that a slow verify tail is forward progress
---

# Quick Task 260926-ju4 — Summary

## What shipped

`sha1File` (`src/backend/storeManagers/steam/depot.ts`) now takes an optional
`onProgress?: (bytesRead: number) => void` and fires it once per stream `data` event, after
`hash.update`. `downloadSingleFile`'s whole-file verify call site passes
`() => stallTracker?.recordProgress()`, so the post-chunk verify tail — previously a silent gap
between the two existing progress signals — is visible to the run's forward-progress clock.

The signal is unreachable on the failure path the bound exists for: reaching that line requires
every one of the file's chunks to have already landed on disk, and the 2026-08-27 Californium run
completed zero files. The bound is not weakened.

Todo closed: `.planning/todos/completed/2026-09-26-depot-stall-bound-can-over-fire-on-a-long-sha1-verify-tail.md`.
Its W-2 sibling (`2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md`) stays
open in `pending/`, untouched.

## The correction this task made to the todo's own premise

**The todo's stated trigger was wrong, and getting it right is what made a deterministic test
possible.** It said: "if every worker is simultaneously inside one file's post-chunk verify tail
for longer than `STALL_TIMEOUT_MS`, the run is still misread as stalled and killed." Traced against
the worker loop:

```
while (queue.length) { hasStalled()? → job → downloadSingleFile(...) → recordProgress() }
```

the success-path `recordProgress()` is the **last statement before the loop returns to its own
consult, with no await in between**. A worker that succeeds can therefore never read a clock its
own tail made stale, and no other worker sits at that line without having just recorded progress
itself. **On an all-success run the residual is unreachable at the worker-loop consult** — the
in-situ comment claiming otherwise has been corrected in place.

The consults a long tail could actually poison are:

1. **the per-file catch** — `downloadSingleFile` threw (sha1 mismatch, or a mode failure), so
   nothing recorded progress and the clock is stale by the whole length of the tail that preceded
   the throw. One honest per-file failure is escalated into a run-level give-up that abandons the
   rest of the queue.
2. **`downloadFileChunks`' per-chunk guard**, consulted by a *different* worker mid-tail — one
   transient chunk error fails a whole file, which is the exact outcome `StallTracker` was
   introduced to prevent.

Both are closed by the same signal. The regression test drives (1), which is deterministic inside
a single worker; (2) needs a cross-worker interleaving that would be a race, not a proof.

## Tests

**Consequence arm, observed RED before it was green.** With the call site reverted to the
one-argument `sha1File(dest)`, the test returned **33** failures instead of 32 — the extra one:

```
file="(run)"  download stalled: no forward progress for 239000ms across the whole run
              — giving up with 8 file(s) unattempted
```

with `tail-07.bin` absent from disk. Restored, it is green.

**Virtual time is driven by the verify READ** — one tick per 64 KB stream event, i.e. "each read
costs a second on a slow disk". This is the only honest driver for this defect: the thing that has
to make time pass is the tail, and the tail makes no `hasStalled()` consults, so the
consult-driven clock the existing W-1 arm uses leaves both arms identical here. A clock driven by
`recordProgress()` would be circular — it is the signal under test.

**Unit arm** pins that `sha1File` reports *mid*-stream (more than once), not once at the end, that
the digest is unchanged, and that the no-callback form `reconcile.ts:144` uses still works.

Non-vacuity is asserted inside the consequence test rather than assumed: the window must sit
strictly inside one tail (`0 < WINDOW_MS < TICKS_PER_TAIL * TICK_MS`), and the observed tick count
must have crossed it. If `highWaterMark` or the fixture size ever drifts, the test goes red rather
than going quietly vacuous.

## New, measured, and not anticipated by the plan

**`jest.spyOn(fs, 'createReadStream')` cannot work in this project; a module factory can.** Probed
both. `spyOn` throws `TypeError: Cannot redefine property: createReadStream` — Node's `fs` exports
are non-configurable. A partial module mock, `{ ...jest.requireActual('node:fs'), createReadStream:
jest.fn() }`, intercepts `depot.ts`'s call cleanly (300 KB → 5 `data` events, digest unchanged).

This **narrows rather than contradicts** the long-standing comment on this file's decompress mock,
which says "jest.mock/jest.spyOn cannot reliably intercept a specific fs call". For `spyOn` that is
exactly right and was re-measured; a module factory is a different mechanism (registry replacement,
not property redefinition). That comment is also about `node:fs/promises`, a separate module, still
untouched.

**The partial mock needs a file-level `beforeEach` and that is load-bearing, not tidiness.**
`resetMocks: true` wipes the `jest.fn()`'s implementation before *every* test in the file, so
without the restore every pre-existing test that reaches `sha1File` gets `undefined` back from
`createReadStream`. Measured green afterwards at the same 182 tests the file had before.

**`reconcile.ts` is out of scope by construction, not by choice.** `reconcilePartialState` runs at
`depot.ts:2187`; the `StallTracker` is constructed at `:2280`. The reconciler's own whole-file SHA1
pass completes before the clock exists, so it can neither arm this defect nor use the signal —
which is why the new parameter had to be optional.

## Verification

| gate | result |
| --- | --- |
| Backend jest project | 221 suites, **5067 passed**, 3 skipped, 0 failed (baseline 5065 + the 2 new) |
| `depot` + `depot.finalize` + `depotPrimitives` + `reconcile` | 4 suites, 288 passed |
| RED arm of the consequence test | confirmed against the unfixed call site (33 failures, `(run)` stall, `tail-07.bin` absent) |
| `pnpm codecheck` | exit 0 |
| `pnpm lint` | `production: PASS \| tests: PASS` |
| `npx prettier --check` on both written paths | clean |
| `pnpm planning-gates` | 13/13 |

One lint error was introduced and fixed en route: `jest.requireActual('node:fs') as typeof
import('node:fs')` tripped `@typescript-eslint/no-unnecessary-type-assertion` (the generic defaults
make the assertion a no-op). Rewritten as `jest.requireActual<typeof import('node:fs')>('node:fs')`.
Lint was measured at HEAD first (exit 0, both ceilings PASS) so the error was known to be ours and
not pre-existing.

## Deviation from the workflow

`workflow.use_worktrees` is `false` for this project, so no worktree was involved. The three tasks
were executed **inline by the orchestrator rather than dispatched to a `gsd-executor`**: the
measured findings that shaped the plan (the reachability correction, and the `spyOn`-vs-factory
probe) were established during planning in this same context, and re-deriving them in a subagent
would have risked a weaker test. Commits are still atomic and per-task; every `<verify>` block in
the plan was run as written.

## Still open

- **W-2**, `.planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md`
  — the run-level record is counted alongside per-file failures, so the aggregate log reports N+1
  for N failed files. Deliberately untouched: it is a shape decision about the `failures` array.
  Note that this task's own RED measurement is a fresh instance of that miscount (33 reported for
  32 failed files).
- The second reachable consult, `downloadFileChunks`' per-chunk guard at `depot.ts:1462`, is fixed
  by the same signal but is **not** pinned by a test — a cross-worker interleaving arm would be
  racy. It is named in the in-situ comment so a future reader knows it is unpinned rather than
  unconsidered.
