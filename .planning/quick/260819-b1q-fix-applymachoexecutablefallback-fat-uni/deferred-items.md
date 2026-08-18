# Deferred Items — quick task 260819-b1q

Out-of-scope issues discovered during execution, NOT fixed (scope boundary: only
auto-fix issues directly caused by this task's own changes).

## Pre-existing hang/failure in depot.finalize.test.ts, Tests D and E (unrelated to this task)

`pnpm jest depot.finalize.test.ts` (run alone, `--runInBand`, with an enlarged heap to
rule out the OOM below) reports `Tests: 2 failed, 2 passed, 4 total` — Test D ("no
regression — a genuine complete run... still earns StateFlags=4") and Test E ("a run
whose manifest claims an executable-flagged entry but never actually chmods it...
finalizes StateFlags 1026, never 4") both exceed their timeout (5000ms default, still
fails at 30000ms), and a dangling `setTimeout`/`setInterval` inside `emitProgress`
(depot.ts, the progress-heartbeat code near line ~2100/2226) fires AFTER the test
process has torn down its mocks, throwing `TypeError: (0, utils_1.sendProgressUpdate)
is not a function` — an unhandled rejection outside any test's own try/catch.

**Confirmed pre-existing, not caused by this task's changes:** reproduced the identical
failure (`2 failed, 2 passed, 4 total`, same Tests D/E, same dangling-timer
`TypeError`) against the pre-plan baseline commit `9cd72e40c` (the last commit before
this task's Task 1/Task 2 edits), via `git archive 9cd72e40c` into an isolated scratch
directory (symlinked `node_modules`, no working-tree mutation) and running
`node_modules/.bin/jest depot.finalize.test.ts --runInBand --testTimeout=30000` there
directly. Neither `classifyMachOProbe`, `isThinMachOExecutable`, nor
`applyMachOExecutableFallback` (this task's only edits) are anywhere near the
StateFlags/emitProgress code path this failure lives in.

Also note: running `depot.finalize.test.ts` together with `depot.test.ts` and
`depotPrimitives.test.ts` in the same jest invocation (as Task 3's verify command
specifies) OOMs the jest worker outright (`FATAL ERROR: Ineffective mark-compacts
near heap limit`) before Tests D/E's timeout is even reached — this is separate,
additive memory pressure from running all three suites in one process, on top of the
pre-existing D/E flake. `depot.test.ts` and `depotPrimitives.test.ts` (198 tests,
including all 16 in the Mach-O describe block) pass cleanly on their own.

Left as-is per the executor scope boundary — not touched by, and not caused by, this
task's Task 1/2 edits.
