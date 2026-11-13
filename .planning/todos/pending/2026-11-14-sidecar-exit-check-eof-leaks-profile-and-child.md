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
