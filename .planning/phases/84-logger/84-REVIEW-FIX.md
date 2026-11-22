---
phase: 84-logger
fixed_at: 2026-11-22T04:11:26Z
review_path: .planning/phases/84-logger/84-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 84: Code Review Fix Report (round 4)

**Fixed at:** 2026-11-22T04:11:26Z
**Source review:** .planning/phases/84-logger/84-REVIEW.md
**Iteration:** 1
**Scope:** all (warnings + info)

**Summary:**

- Findings in scope: 4 (WR-11, WR-12, IN-11, IN-12; no critical findings)
- Fixed: 4 (WR-11 and WR-12 change behaviour; IN-11 changes only docs; IN-12 changes only a test)
- Skipped: 0

WR-11 and WR-12 were fixed test-first. Each new test was run and failed against the unfixed code, then
passed after the fix. IN-12 was checked by a mutation: with `tz` taken at settle time in `forwarder.ts`, the
rewritten test failed. The mutation was then reverted.

**Where verification ran:** in the main checkout (`workflow.use_worktrees` is `false`, so no worktree was
created). The numbers below can be reproduced from this tree.

## Fixed Issues

### WR-11: One rejecting link makes `flush` stop waiting at once, for every other link and for the transport

**Files modified:** `src/backend/logger/forwarder.ts`, `src/backend/logger/__tests__/forwarder.test.ts`
**Commit:** 01dca3681
**Status:** fixed: requires human verification (logic fix)
**Applied fix:** `#settleChains` now races `Promise.allSettled([...chains, ...writerLinks])` in place of
`Promise.all`. A rejecting link now counts as settled, and the wait goes on for the other links and then for
the transport. This also covers the forwarder's own `#chains` links, not only `trackSettle` registrations.
The `trackSettle` doc now says what happens to a rejecting link. New test
`flush still waits for a slow link and the transport when another link rejects early (WR-11)`. It uses a
1,500 ms link, a link that rejects at 20 ms, and a write callback that is held. The flush must still be
pending at 100 ms and again after the slow link settles, and it resolves only once the write callback runs.
Before the fix it resolved by 100 ms.

### WR-12: `#settleChains` has no clock-step-back clamp, so `flush` can wait far past `LOG_FLUSH_TIMEOUT_MS`

**Files modified:** `src/backend/logger/forwarder.ts`, `src/backend/logger/__tests__/forwarder.test.ts`
**Commit:** 915500558
**Status:** fixed: requires human verification (logic fix)
**Applied fix:** `flush` takes its single deadline from `performance.now()`, which is monotonic. Both the
chain wait in `#settleChains` and the transport wait measure what is left against that deadline. The
transport wait's `Math.min(this.#flushTimeoutMs, ...)` clamp is now unnecessary and was removed. Only the
`Math.max(0, ...)` floor remains. The flush doc names the monotonic clock. New test
`flush resolves within LOG_FLUSH_TIMEOUT_MS when the clock steps back 60 s mid-wait (WR-12)`. A link settles
at 100 ms. At 50 ms, `jest.setSystemTime` steps the wall clock back 60 s and a link that never settles is
registered. The second pass must then compute what is left after the step. The flush must be pending at
1,999 ms and resolved at 2,001 ms of fake time. The assertion is checked before the await, so a regression
fails cleanly and does not hang. Before the fix it was still pending at 2,001 ms. Jest 29's modern fake
timers fake `performance.now()` and `setSystemTime` does not move it, which is the property the fix relies
on.

### IN-11: `logErrorSettled` / `logInfoSettled` now also wait on every writer's held Promise messages

**Files modified:** `src/backend/logger/index.ts`
**Commit:** b60933290
**Status:** fixed (documented; behaviour deliberately kept)
**Applied fix:** I kept the behaviour and documented it, and did not split out a queue-only settle.
`logErrorSettled` has one production caller: the fatal `uncaughtException` log sink
(`src/backend/sidecar/bootstrap.ts:1543`, Phase 72 D-04). That is the exit path WR-09 exists for. A settle
that skipped `#writerLinks` would lose a game or runner writer's held lines on a fatal exit. `logInfoSettled`
has no production caller; its only uses are tests and the `meta/logSecretGate.ts` name list. Splitting it
off alone would add an API difference with nothing to measure it against. The coupling and its cost are now
documented on `logErrorSettled`, `logInfoSettled` and `trackLogSettle`. The cost: while any writer holds a
Promise message that never settles, each call takes the full `LOG_FLUSH_TIMEOUT_MS`. There is no runtime
change.

### IN-12: The WR-10 test's `tz` assertions cannot fail, because no offset change happens inside the window

**Files modified:** `src/backend/logger/__tests__/targetWriter.test.ts`
**Commit:** 279f4facd
**Status:** fixed
**Applied fix:** The first WR-10 test now pins the offset source with
`jest.spyOn(Date.prototype, 'getTimezoneOffset')`. It returns 240 before 2026-11-01 06:00Z (the New York
DST end) and 300 after, and is restored in a `finally`. I mocked the offset instead of setting
`process.env.TZ` so the test works on every host OS, and does not depend on jest's sandboxed `process.env`
reaching ICU. The clock starts 10 s before the change. Both log calls are made before it (-240), and the
release and flush run 20 s after it (-300, asserted inline). Both entries must carry the literal
`tz: -240`. Mutation check: changing `forwarder.ts` to stamp `tz` from the settle-time clock makes the test
fail. The test's title still says "and tz", which is now true.

## Verification

- `npx jest src/backend/logger`: 6 suites, 127 tests pass (125 before this round, plus the WR-11 and WR-12
  tests).
- `npx jest` on the three sidecar suites that consume `flush` (`sidecarStdoutFramesOnly`,
  `sidecarRejectionGuard`, `stdinEofRelease`): 63 tests pass. This was a read-only run, and those files were
  not touched.
- `npx tsc --noEmit -p tsconfig.json`: 0 errors in the whole project.
- `npx prettier --check` on the exact paths written: `src/backend/logger/forwarder.ts`,
  `src/backend/logger/index.ts`, `src/backend/logger/__tests__/forwarder.test.ts` and
  `src/backend/logger/__tests__/targetWriter.test.ts` all pass.
- `npx eslint` on the same four files: clean, apart from one warning that was already there
  (`index.ts` `createGameLogWriter` require-await). These fixes did not touch it.

Commits were made with plain `git commit -- <paths>` on explicit paths, not with the gsd-tools commit
command, so no dirty `.planning/` file from the concurrent Phase 85 session could be swept in. Each commit
contains only its own files under `src/backend/logger/`.

**Side effect to note:** the IN-12 mutation check was reverted with `git checkout -- forwarder.ts`. That
fired the repo's `.husky/post-checkout` hook, which runs `pnpm i` and `pnpm download-helper-binaries`.
`pnpm i` reported the lockfile up to date and pruned 168 packages from `node_modules` that were not in the
lockfile. No tracked file changed. Jest, tsc, prettier and eslint all re-ran green afterwards. A concurrent
session relying on a package that is installed but not in the lockfile would need to reinstall it.

---

_Fixed: 2026-11-22T04:11:26Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
