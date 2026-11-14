---
created: 2026-11-14T00:00:00.000Z
title: 'sidecarExitCheck --mode eof leaks its fake-HOME profile and leaves a hung sidecar running'
area: tests
files:
  - meta/sidecarExitCheck.ts (214-229 finish/invalid, 307-362 runEof)
  - meta/__tests__/sidecarExitCheck.test.ts
severity: medium
platform: any
ready: code
---

## Problem

From 66.4-REVIEW WR-03. `runEof` is shaped
`try { ... return invalid(...) / return finish(...) } finally { profile.dispose() }`, but both
`finish()` and `invalid()` end in `process.exit(...)`. That exits synchronously, so the `finally`
never runs:

- The fake-HOME profile is never disposed. It holds the sidecar's logs and config, which the
  fake-HOME convention says the harness must clean up (quick `260913-901` left 103 MB of unredacted
  captures this way).
- On the `invalid('eof', 'sidecar never wrote the READY sentinel')` path the sidecar child is left
  running, which is the hang this tool exists to detect. It also keeps writing into the undeleted
  profile directory.

## Solution

- Make the drivers return a verdict (`Report`) instead of exiting, and call `finish(report)` only
  after `runEof`'s `finally` has disposed the profile. Or call `profile.dispose()` and `child.kill()`
  explicitly before `finish()`/`invalid()`.
- On every INVALID path, `child.kill('SIGKILL')` the sidecar (the script's own child) before
  returning.
- Add a test: a stub sidecar that never writes READY. Assert that the profile directory is gone and
  the child is dead after the check returns.
- Check the same pattern in `--mode live`.
- The tool reads `ps -axo` and has no win32 branch, so live verification needs macOS/Linux. The fix
  and its unit test are platform-independent.

## Resolved by quick 261114-2yj

- Driver contract: `runLive()` and `runEof()` now return a `Report`; `finish()` (print plus `process.exit(exitCodeFor(...))`) is called only from the CLI guard (`job.then(finish, onRejected)`). Outside comments `process.exit(` occurs twice in `meta/sidecarExitCheck.ts`: `finish` and the guard's rejection handler. No exit can run inside `runEof`'s `try`, so its `finally` always runs.
- Reap then dispose: the `finally` calls `reapOwnChild` (SIGKILL through the spawned `ChildProcess` handle, 5000 ms bounded wait on a cleared timer) and then `profile.dispose()` in an inner `finally`, so dispose runs even if the reap throws. The order matters: disposing under a live child leaves it writing into a half-deleted tree, and on Windows `rmSync` over files a live process holds open fails with EBUSY, which `dispose()` swallows, stranding the profile silently. The kill goes only through the handle, never a pid-based kill or a pid read from `ps`, and the verdict is fixed before the `finally` runs. Surviving descendants are still reported, not killed.
- Live-mode finding (the todo's "check the same pattern" item): `runLive` owns no profile and no child (its only spawns are `spawnSync` calls), so the old `process.exit` skipped nothing there and no leak existed. It was converted to return a `Report` only so the process has one exit point.
- Tests: T8 drives `runEof` against a stub sidecar that never prints READY and asserts INVALID with no `process.exit`, the child exited and a signal-0 probe on its pid throws, the profile root is gone, and (via a dispose wrapper) that the child was already dead and the marker file was inside the profile when `dispose()` ran. T9 pins `exitCodeFor` (PASS/WARN 0, FAIL 1, INVALID 2). Neither needs `ps`, so both run on Windows and on CI.
- Docblocks: the "REPORT-ONLY and never kills anything" and "untested" claims are replaced with the real scope (live signals nothing; eof SIGKILLs only its own child, after the verdict is fixed) and the one-exit-point rule.
- Commits: `ab6986aa7` (fix: Report-returning drivers, reap-then-dispose, T8), `15530b186` (refactor: `exitCodeFor`, T9, docblocks).
- Not run: the live `pnpm build:sidecar && pnpm smoke:exit-check -- --mode eof` and `--mode live` runs need macOS or Linux (`ps -axo`, no win32 branch) and were not run on the operator's Windows box. This is not a regression gate here, because T8 covers the fixed path on every OS.
