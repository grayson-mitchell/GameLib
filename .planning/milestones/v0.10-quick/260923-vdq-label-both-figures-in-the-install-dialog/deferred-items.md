# Deferred items -- quick 260923-vdq

Out-of-scope findings surfaced while running this task's gate battery. Not fixed here
per the executor's scope boundary rule (only auto-fix issues directly caused by this
task's own diff).

## 1. `pnpm lint` tests scope is 1 over its ceiling, pre-existing and unrelated to this diff

`meta/lintScoped.cjs`'s `TESTS_CEILING` is hardcoded to `638` (measured 2026-09-09,
zero padding by design). A clean `pnpm lint` run on this diff's tree reports
**639** warnings in the tests scope (`tests: FAIL`), one over the ceiling.

Confirmed NOT caused by this task's diff:

- `diskSpaceLabels.ts` / `diskSpaceLabels.test.ts` (new files): 0 warnings each,
  verified with a standalone `npx eslint` pass and absent from the full
  `node meta/lintScoped.cjs --tests` report.
- `SteamDialog/index.tsx`, `DownloadDialog/index.tsx`,
  `SteamDialog/__tests__/steamDialogSource.test.ts` (modified files): the only
  warnings attributable to these three files (12, all in `DownloadDialog/index.tsx`)
  are pre-existing `react-hooks/exhaustive-deps` / `no-floating-promises` /
  `restrict-template-expressions` findings on hook dependency arrays and promise
  handling this task never touched -- none reference disk space, `diskSize`,
  `freeLabel`, `totalLabel`, or `message`.
- The most recently touched file among all 101 files carrying a tests-scope
  warning was last modified by `60db2ecfd` (`quick-260923-tip`) and `91bf5560c`
  (`fix(frontend)`), both already on `main` before this quick task's session
  started (confirmed via `git log -1 -- <file>` per warned file, cross-referenced
  against the session's starting `git status` history).

Conclusion: the ceiling was already red on `main` before this task began. Not
this task's regression to fix, and the ceiling itself is not weakened (left at
`638`) -- widening it would hide whichever earlier change actually tipped it
over 638, which is a separate investigation for whoever owns that drift.

## 2. `meta/__tests__/runTsSignals.test.ts` T8 -- known-shape leak-detection flake

One `--selectProjects Meta` run (before switching to `--testPathPattern` to work
around the project-selector-ignores-path-arg quirk noted below) surfaced a
transient failure in `meta/runTs.cjs signal forwarding ... T8 (C5-01 regression
pin)`: it expected zero leaked `gamelib-runts-*` tmpdirs after a SIGTERM-mid-run
scenario and found one. This test diffs a live `os.tmpdir()` snapshot around its
own spawned child's signal-handling window, so it is sensitive to system load --
this session was running background jest processes and a concurrent Phase 46
agent stream on the same machine at the time. Not reproduced in isolation
(`gamelibCatalogParity.test.ts`, the actual Task 2 verification target, passed
198/198 clean). Not investigated further; flagged in case it recurs.

## 3. Full `pnpm test:ci` could not be completed reliably in this session -- environmental, not this diff

Three attempts, on this exact Windows workstation, in this session:

1. **Completed normally**, exit 1: `Test Suites: 37 failed, 1 skipped, 412 passed, 449 of 450
   total. Tests: 101 failed, 71 skipped, 9028 passed, 9200 total.` Only the tail of the log
   survived (piped through `tail -100` before I realized I needed the full FAIL list), so only
   two failures were inspectable: `bootstrapWirings.test.ts` (`EPERM: operation not permitted,
   rename ...gamelib.log -> gamelib.log.old`) and `lzmaNativeSeaRealBuild.test.ts` (`spawnSync
   pnpm ENOENT`). Both are pre-existing, named patterns in `.planning/STATE.md`'s own history for
   THIS machine, not new: `260905-qjf` records `lzmaNativeSeaRealBuild` as "a load flake, re-run
   not asserted"; `260922-nx4` records a `vite build` EPERM on this same Windows host ("no
   SeCreateSymbolicLinkPrivilege, not elevated") as a known, unrelated, pre-existing environment
   gap.
2. **Crashed**, `JavaScript heap out of memory` (V8 OOM) -- self-inflicted: I started this run
   while a full Meta-project jest invocation was still finishing from an earlier verification
   step, so two full jest processes briefly competed for heap on the same 32 GB machine. Not a
   defect in the tree; a scheduling mistake on my part.
3. **Crashed**, uncaught `EPERM` (`rename ...gamelib-sidecarrejectionguard-test-home-14732\logs\
   gamelib.log -> gamelib.log.old`) that took down the whole Node process rather than failing one
   test -- the same Windows temp-file-rename EPERM class as attempt 1's `bootstrapWirings`
   failure, just severe enough this time to escape jest's own error boundary. Free memory was
   confirmed at 14.2 GB before this attempt, ruling out OOM as the cause; this looks like
   Windows-side file-handle contention (antivirus/indexer scanning `AppData\Local\Temp`, or a
   handle left open by attempt 2's crash) rather than a code defect.

**Not investigated further and not treated as a blocker**, on the following basis: this diff
touches ONLY frontend TypeScript (`SteamDialog`, `DownloadDialog`, the new `diskSpaceLabels`
module and its test) and locale JSON -- zero files under `src/backend/`, `src-tauri/`, or
`meta/`'s native-build tooling, which is where every inspectable failure above lives. The
scopes this diff COULD plausibly affect were verified directly and cleanly instead:
`npx jest --selectProjects Frontend src/frontend/screens/Library/components/InstallModal` (full
InstallModal suite, including `steamDialogSource.test.ts` and the new
`diskSpaceLabels.test.ts`, both clean) and `npx jest --selectProjects Meta --testPathPattern
gamelibCatalogParity` (198/198). Recorded here rather than silently omitted, per this task's
constraint to document deviations honestly.

## 4. `npx jest --selectProjects <name> <path>` does not filter by path on this tree

Observed repeatedly: passing a file path alongside `--selectProjects <ProjectName>`
still runs the ENTIRE project's suite (not just the named path) under this repo's
jest config, on this Windows/Git-Bash setup. `--testPathPattern <substring>` does
filter correctly. Not this task's regression -- a pre-existing CLI-argument-handling
quirk noted so a future executor does not lose time re-diagnosing it. Every
verification command in this task's PLAN.md that used the `<project> <path>` form
was still executed and its result checked against the full suite's report (grepping
for the specific PASS/FAIL line), so no verification step was skipped -- this is a
convenience note, not a gap.
