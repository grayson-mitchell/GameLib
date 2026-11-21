---
phase: quick-261121-p6z
plan: 01
subsystem: testing
tags: [jest, flaky-test, real-time-wait, yieldUntil, bootstrap, legacy-zoom]
requires: []
provides:
  - "src/backend/testUtils/yieldUntil.ts: the one shared real-time-bounded wait helper"
affects:
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
tech-stack:
  added: []
  patterns:
    - "wait on real elapsed time via a clock captured at module load (immune to jest fake-timer clock freeze)"
key-files:
  created:
    - src/backend/testUtils/yieldUntil.ts
    - src/backend/testUtils/__tests__/yieldUntil.test.ts
  modified:
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
    - src/backend/__tests__/steamBridgeKnownFixes.test.ts
    - .planning/todos/completed/2026-11-21-bootstrap-legacy-zoom-turn-counted-wait.md
decisions:
  - "Extract yieldUntil to src/backend/testUtils (third user, as the steamBridgeKnownFixes comment asked); delete both local copies"
  - "Drop all four sibling candidates; only bootstrap.test.ts waited by turn count on real I/O"
metrics:
  tasks: 3
  completed: 2026-11-21
status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 2
commits_note: "measured by git log --grep='quick-261121-p6z' (2 commits). plan_head_before ledger is not used: HEAD moved under a concurrent Phase 84 executor, so rev-list over the ledger would count their commits."
plan_head_before: 818bbce5a845afd7b8f720d9f8ca4af7bbeb4066
---

# Phase quick-261121-p6z Plan 01: bound the bootstrap legacy-zoom wait by real time Summary

The legacy-zoom cleanup wait in bootstrap.test.ts now runs on a shared real-time-bounded `yieldUntil` (15 s real ceiling inside a 30 s per-test timeout) instead of a 50-turn `setImmediate` count, with a slowed-rm regression test and both pre-existing local copies of the helper replaced by an import.

## Commits

- `1ffdec537` test(quick-261121-p6z): shared yieldUntil, its unit test, bootstrap legacy-zoom wait + slowed-rm regression test
- `ded4cd2b8` refactor(quick-261121-p6z): sharedRedistInstall and steamBridgeKnownFixes use the shared yieldUntil

Each is a pathspec commit holding only its own task's paths (3 and 2). Neither touches games.test.ts.

## RED / GREEN evidence

**Slowed-rm regression test against the old 50-turn loop (RED):**

```
● register-handlers boot step (D-08, C-03) › legacy-zoom cleanup still lands when the real rm is held back past the old turn-counted window
    expect(received).toBe(expected) // Object.is equality
    Expected: false
    Received: true
    > 697 |       expect(existsSync(seeded)).toBe(false)
```

The `expect(rmSpy).toHaveBeenCalledWith(seeded, { recursive: true })` line just above it passed, so the spy did intercept the cleanup and the failure is the defect, not a missed spy. The helper tests failed at the same time with "Cannot find module '../yieldUntil'". After switching to `yieldUntil` both bootstrap legacy-zoom tests and the 4 helper tests pass (30/30 across the two files).

**Mutation check on the module-load clock capture:** with the two `realNow()` reads in the loop temporarily replaced by the live `performance.now()`, the fake-timer test ("still expires on real elapsed time while fake timers are installed with setImmediate left real") failed with `Exceeded timeout of 5000 ms for a test` (3 of 4 passed). Reverted; the committed file contains no live `performance.now()` call.

## Loaded repeat run (corroboration, not proof)

30 self-terminating busy-loop node processes (one per available core), 7 files x 5 runs (yieldUntil unit test, bootstrap, sharedRedistInstall, steamBridgeKnownFixes, plus the clean siblings playAdoption, outboundHttpRegistry, humble library): runs 1 to 5 green, 12 to 13 s each, 5/5. At HEAD this stress did not reproduce the original full-suite failure (planning measured 3/3 green and 6/6 green under UV_THREADPOOL_SIZE=1), so this corroborates only. The proof is the slowed-rm RED/GREEN above and the helper mutation check. games.test.ts was left out because it carries the user's uncommitted edits.

## Repo gates

- `pnpm exec jest --selectProjects Backend` over the touched files: 149 tests (sharedRedistInstall, steamBridgeKnownFixes, yieldUntil) and 30 tests (yieldUntil, bootstrap) pass
- `pnpm codecheck` clean; `npx prettier --check` over the five TS paths clean
- `pnpm lint`: exit 0, production PASS, tests PASS (0 errors)
- `pnpm find-deadcode`: PASS, 312 baselined findings, no new finding from the new module
- `pnpm planning-gates`: 12/12 passed

## Sibling sweep

Each reason re-read against the file before recording; none turned out to wait on real async I/O, so none was converted.

- `src/backend/storeManagers/steam/__tests__/games.test.ts` G8 (loop on `startSpy.mock.calls.length`, now line 18369): Linux launch reaches `startSteamLaunchWatch` through microtasks only; the trailing 5-turn loop is a negative probe. Dropped, file not modified.
- `src/backend/storeManagers/steam/__tests__/playAdoption.test.ts:288`: fully in-memory harness (scripted runner, fake rust invoke, microtask clock), no real I/O. Dropped.
- `src/backend/sidecar/__tests__/outboundHttpRegistry.test.ts:38` and `:161`: poll with real `setTimeout(5)` x 100 (at least 500 ms real time), and the awaited event is published a microtask after `http.get`. Dropped.
- `src/backend/humble/__tests__/library.test.ts:659`: drives waves of mocked `getOrderDetail` promises plus one setImmediate flush; no real I/O. Dropped.

## Deviations from Plan

None - plan executed as written. Notes: (1) the config allows commits on `main` (`git.allow_default_branch_commits: true`) and this was a sequential run, so the protected-branch guard did not apply. (2) The loaded-run command from the plan must be run under bash, not zsh (unquoted `$F` is not word-split in zsh); I ran it from a scratch script under bash. (3) The per-plan `plan_head_before` ledger was written at the first commit, but HEAD had moved under the concurrent Phase 84 executor, so `commits:` is measured by the `quick-261121-p6z` message tag (2) instead.

## Bookkeeping left for the orchestrator's docs commit

- `git mv .planning/todos/pending/2026-11-21-bootstrap-legacy-zoom-turn-counted-wait.md .planning/todos/completed/...` is done and staged (status `RM`: rename staged, the appended `## Resolved by quick 261121-p6z` section is an unstaged working-tree edit). Frontmatter unchanged.
- This SUMMARY.md and the quick-task directory are untracked.
- `graphify update .` ran; graphify-out is untracked.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: src/backend/testUtils/yieldUntil.ts, src/backend/testUtils/__tests__/yieldUntil.test.ts
- FOUND commits 1ffdec537 and ded4cd2b8 in HEAD history
- FOUND: completed/ todo with Resolved section; pending/ todo gone
