# Quick 261027-d5i: Per-depot chunk attempt counts in chunk-stream stats

Added a `depots=[<id>[a= ok= to= err=] ...]` segment (worst-first by timeouts+errors, max 6) appended last on the `[Timing] chunk-stream stats` line in `depot.ts`, via a per-job wrapper around `onAttempt`. Purely observational; no retry/rotation/host behaviour changed.

## Commits
- e1403be3b: feat - depotStats accumulator, wrapper at downloadSingleFile call, depots segment, new jest test
- 04c0e953b: docs - pending todo updated (stays pending, ready: live-gate)

## Verification
- depot.test.ts: 209/209 pass (new test failed first, RED confirmed)
- pnpm codecheck: exit 0
- prettier --check on both src paths: pass (not ignored)
- pnpm planning-gates: 12/12 pass

## Deviations
None.
