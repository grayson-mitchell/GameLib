---
phase: quick-260821-nyh
plan: 01
type: execute
status: complete
requirements: [QUICK-NYH-01, QUICK-NYH-02]
---

# Summary: Fix resumed Steam depot install progress percent

## What was done

Made the native Steam depot install's progress numerator (`doneBytes`) and
denominator (`totalBytes`) agree on the same set of bytes, so a resumed
install starts at the real fraction already on disk and can reach 100%.

**Task 1 (RED, commit `38e8fce01`)**: added a regression test to
`src/backend/storeManagers/steam/__tests__/depot.test.ts` — pre-writes a
99-byte file to disk that the reconciler sha1-verifies and skips, plus a
1-byte file that must be fetched. `plan.totalBytes = 100` (the honest sum).
Asserts (1) anti-vacuity: `fetchChunk` called exactly once and never with
the skip chunk's sha, (2) terminal `progress.percent === 100`, (3) `eta`/
`downSpeed`/`diskSpeed` stay sane. Committed standalone before touching any
source file.

**Task 2 (GREEN, commit `f6e87298e`)**:
- `src/backend/storeManagers/steam/depot/reconcile.ts` — `ReconcileResult`
  gained `skippedBytes: number`; `reconcilePartialState` accumulates
  `Number(file.size)` for every entry that hits the `if (verified) continue`
  branch and returns it.
- `src/backend/storeManagers/steam/depot.ts` — hoisted
  `reconciledSkippedBytes` from the reconcile call site (stays 0 on the
  catch-fallback path); seeded `doneBytes` and `lastEmitBytes` with it;
  added a `runStartBytes` baseline so the ETA's `avgBytesPerSec` stays
  run-scoped (`(doneBytes - runStartBytes) / elapsedSec`) instead of
  including the seeded bytes.
- `src/backend/storeManagers/steam/__tests__/reconcile.test.ts` — two new
  unit tests: `skippedBytes === 0` on a fresh install, and an exact-sum
  assertion (not `> 0`) that only the verified entry's bytes are counted,
  excluding missing/mismatched entries.

## Red/Green pair

Command (identical both times):
```
pnpm test -- src/backend/storeManagers/steam/__tests__/depot.test.ts -t "reconciled-skip"
```

**Task 1 red** (captured verbatim from the actual run):
```
● downloadDepotFiles › a resumed install whose reconciler skipped a NON-EMPTY set
  of files still reports a terminal percent of 100 (todo 2026-08-19: run-scoped
  numerator vs plan-scoped denominator)

  expect(received).toBe(expected) // Object.is equality

  Expected: 100
  Received: 1

    3954 |     expect(progress.percent).toBe(100)
         |                              ^
```
Anti-vacuity assertion (`fetchChunk` called exactly once, never with sha
`s-skip`) PASSED in that same run — the failure landed on the percent
assertion, not the skip-set assertion, so the fixture was valid on the
first attempt (no fixture fix needed). 154 other tests in the suite passed;
only the new test was red.

**Task 2 green** (same command, after the fix): 155/155 passed, including
the target test.

## Verify steps (plan's numbered list)

1. RED→GREEN on the same command — PASS. Pair recorded above.
2. Fresh-install regression, full `depot.test.ts` suite — PASS, 155/155.
   The `:3252`-region summed-denominator test still asserts `percent === 1`
   (its own scenario, unaffected — `totalBytes: 400` there is deliberately
   inflated so nothing is skipped) and the WR-03 clamp test still passes.
3. `reconcile.test.ts` — PASS, 11/11, including the two new exact-sum
   `skippedBytes` assertions.
4. `depot.finalize.test.ts` — PASS, 8/8. Confirms the StateFlags=4 path
   (D-UAT-09, D-08, Task 3/23.2-03 scenarios) is unaffected.
5. `pnpm codecheck` (`tsc --noEmit`) — PASS, exit 0, no output (clean).
6. `grep -n "skippedBytes" reconcile.ts` and
   `grep -n "reconciledSkippedBytes\|runStartBytes" depot.ts` both returned
   hits (5 and 5 respectively, listed in the commit's verification). `git
   diff --stat` for Task 2 touched exactly the three files in
   `files_modified` beyond the Task 1 test file — no file outside plan
   scope was changed.

## Deviations from the plan

None. The fixture was correct on the first run (the plan's contingency for
an invalid red observation — fixture size/sha mismatch — was not needed).
All line-number references in the plan's `<interfaces>`/`<action>` sections
matched the current working tree exactly.

## Scope discipline

Confirmed reporting-only: no change to what lands on disk, the reconcile
skip decision, `healReconciledFileModes`, or the `StateFlags=4` finalize
gate. `depot.finalize.test.ts` (8/8) and the reconciliation-wiring describe
block inside `depot.test.ts` (unchanged, still passing) serve as the
guards for that boundary.

## Commits

- `38e8fce01` — `test(quick-260821-nyh): RED — resumed install with
  non-empty reconciled-skip set terminates at 1%, not 100%`
- `f6e87298e` — `fix(quick-260821-nyh): GREEN — seed doneBytes with
  reconciled-skip bytes so a resumed Steam install reaches 100%`

## Files touched

- `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- `src/backend/storeManagers/steam/depot/reconcile.ts`
- `src/backend/storeManagers/steam/depot.ts`
- `src/backend/storeManagers/steam/__tests__/reconcile.test.ts`

## Not done by this executor (orchestrator's docs commit)

- Moving `.planning/todos/pending/2026-08-19-resumed-install-progress-percent-starts-at-zero-and-never-reaches-100.md`
  to `.planning/todos/completed/` and setting `status: CLOSED`.
- Committing this SUMMARY.md / STATE.md / the PLAN.md.
