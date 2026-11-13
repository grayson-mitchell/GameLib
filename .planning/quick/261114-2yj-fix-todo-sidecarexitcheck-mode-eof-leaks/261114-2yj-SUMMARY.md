---
phase: quick-261114-2yj
plan: 01
subsystem: meta-tooling
tags: [sidecar, exit-check, fake-home, process-cleanup, wr-03]
requires: []
provides:
  - "runEof returns a Report; only the CLI guard exits, so runEof's finally always runs"
  - "finally-scoped reap (SIGKILL own child, bounded wait) then profile.dispose()"
  - "exported runEof, EofOptions, Report, exitCodeFor"
affects: [meta/sidecarExitCheck.ts, meta/__tests__/sidecarExitCheck.test.ts]
tech-stack:
  added: []
  patterns: ["drivers return a result, one exit point in the CLI guard", "reap own child via ChildProcess handle, then dispose"]
key-files:
  created: []
  modified:
    - meta/sidecarExitCheck.ts
    - meta/__tests__/sidecarExitCheck.test.ts
    - .planning/todos/completed/2026-11-14-sidecar-exit-check-eof-leaks-profile-and-child.md
decisions:
  - "Kill only through the spawned ChildProcess handle, never a pid-based kill or a ps-derived pid"
  - "Reap before dispose: dispose() swallows EBUSY on Windows and would strand the profile"
metrics:
  duration: ~25m
  completed: 2026-11-14
status: complete
commits: 3
plan_head_before: 48d9ee64bb27710ef3ac67e178a0216834d26a2b
plan_head_after: d033e88f69dbf25983b693dd11c92c67b0df8890
actuals:
  tokens: 12000
  tasks: 2
  commits: 3
---

# Phase quick-261114-2yj Plan 01: sidecarExitCheck eof leak fix Summary

`runEof` now reaps its own sidecar child and disposes its fake-HOME profile on every path, because the drivers return a `Report` and only the CLI guard calls `process.exit`.

## What changed

- `meta/sidecarExitCheck.ts`: `invalid()` became pure `invalidReport()`. `runLive`/`runEof` return `Promise<Report>`. `runEof` is exported with `EofOptions` seams (`sidecarJs`, `readyWaitMs`, `createProfile`, `onSpawn`). Its `finally` awaits `reapOwnChild` (SIGKILL via the handle, 5000 ms bounded wait on a cleared timer, one `console.error` if still alive) and then `profile.dispose()` in an inner `finally`. `hasExited()` replaces the `exitCode === null` tests so signal-killed children are noticed. `exitCodeFor(verdict)` is extracted and exported. The CLI guard is `job.then(finish, onRejected)`. Outside comments `process.exit(` appears twice (`finish`, guard rejection handler); no `process.kill` in the file.
- Docblocks: the "REPORT-ONLY, never kills" and "untested" claims replaced with the real scope (live signals nothing; eof SIGKILLs only its own child after the verdict is fixed; descendants are reported, not killed) and the one-exit-point rule.
- Tests: T8 (never-READY stub sidecar under an isolated fake-HOME profile: INVALID Report, no `process.exit`, child exited, signal-0 probe throws, profile root gone, and at `dispose()` time the child was already dead and the marker file was inside the profile). T9 pins `exitCodeFor`. The stub is written at test time to a temp dir, no committed fixture.
- Todo moved to `.planning/todos/completed/` with a `## Resolved by quick 261114-2yj` section.

## Live-mode finding (todo's "check the same pattern" item)

`runLive` owns no profile and no child (only `spawnSync` calls), so its old `process.exit` skipped nothing; no leak existed there. It was converted to return a `Report` only to give the process a single exit point. Live mode still signals nothing.

## Commits

- `ab6986aa7` fix: Report-returning drivers, reap-then-dispose, T8 (RED confirmed first: `runEof is not a function`)
- `15530b186` refactor: `exitCodeFor`, T9, docblocks (RED confirmed first)
- `d033e88f6` docs: close the todo

## Verification (all run on the operator's Windows box)

- `pnpm jest --selectProjects Meta --runTestsByPath meta/__tests__/sidecarExitCheck.test.ts`: 9/9 (T1-T9).
- `npx tsc -p tsconfig.meta.json --noEmit`: exit 0. `npx eslint --max-warnings 0` over both files: 0 problems.
- `fakeHomeIsolation.test.ts`: 7/7. `npx prettier --check` over both `.ts` paths: clean (paths confirmed not ignored at plan time).
- `process.exit(` count outside comments = 2; no `process.kill` in `meta/sidecarExitCheck.ts`; stale docblock phrases gone.
- No `gamelib-sidecarExitCheck-*` directories left in the temp dir after the runs.

## Not run

- `pnpm build:sidecar && pnpm smoke:exit-check -- --mode eof` and `--mode live`: need macOS or Linux (`ps -axo`, no win32 branch). Not a regression gate here since T8 covers the fixed path on every OS and CI (ubuntu) runs the same suite.

## Deviations from Plan

None in substance. Minor: `spawn()`'s result is held in a local `spawned` const (to keep the piped-stdio types) and then assigned to the outer `child` for the `finally`; behaviour is as planned.

## Known Stubs

None.

## Threat Flags

None. T-261114-2yj-01..04 mitigated as planned (finally always runs; reap via own handle only; reap-before-dispose asserted by T8).

## Notes

- Unrelated working-tree changes (`.planning/state.json`, the humble-login todo, `.planning/debug/*`, `di-gate-before.txt`, and a modified `src/backend/humble/__tests__/steamAppIdResolver.test.ts` that appeared during the run and is not mine) were left unstaged.
- `graphify update .` was started after the code commits and was still running in the background at hand-off.

## Self-Check: PASSED

Commits `ab6986aa7`, `15530b186`, `d033e88f6` exist; `meta/sidecarExitCheck.ts`, its test file, and the completed todo exist; the pending todo is gone.
