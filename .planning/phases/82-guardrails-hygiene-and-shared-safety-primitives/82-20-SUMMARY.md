---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 20
subsystem: testing
tags: [jest, fake-timers, flake, ci, gap-closure, ledger]

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-12 per-test timeout (5b969edd8) and the closed 82-TEST-LEDGER.md Verdict"
provides:
  - "yieldUntil: one real-time-bounded wait used by all three installer-timeout tests in sharedRedistInstall.test.ts"
  - "A slowed pre-installer regression test (250 ms real-time download) that fails with the old wait and with a 5 ms deadline mutant"
  - "82-TEST-LEDGER.md '## Post-verdict recurrence (G-82-2-r2)' section (D-04)"
affects: [82-verify-work]

status: complete
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
plan_head_before: 2496709d003b96a7caf12f55b410bc69322e41fc
plan_head_after: 2398a915a3a9f61ba02ddaa3773109e006257343

tech-stack:
  added: []
  patterns:
    - "Under jest.useFakeTimers, read the clock from a reference captured at module load (performance.now.bind(performance)); the live performance.now, Date.now and hrtime are frozen"
    - "Bound a wait on real I/O by elapsed real time, never a turn count, and assert the awaited fact immediately after so a miss fails readably"

key-files:
  created:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-20-SUMMARY.md
  modified:
    - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-TEST-LEDGER.md

key-decisions:
  - "The load proof is the deterministic slowed path (RED, GREEN, mutant); the CPU soak is supplementary because contention alone never reproduced the red locally"
  - "sharedRedistInstall.ts is unchanged: this is a test defect, with no retry, skip or only modifier"

requirements-completed: [FND-01]

duration: 15min
completed: 2026-11-21
---

# Phase 82 Plan 20: Installer-timeout waits by real time Summary

**The three installer-timeout tests in sharedRedistInstall.test.ts now wait through `yieldUntil`, bounded by a clock captured at module load, and a slowed-path regression test proves it (RED with the old wait, GREEN with the helper, FAIL with a 5 ms deadline mutant).**

## Accomplishments

- G-82-2-r2 cause fixed: Test run 44850161668 at 90ca09d02 went red because the wait counted 500 `setImmediate` turns (6.7-9.8 ms idle) while the code under test does real fs/promises I/O and a dynamic import before its first installer call. All three waits (`records timedOut ...`, `restores after an installer timeout`, `Graphics query times out`) now use `yieldUntil`, with a 15 s real-time deadline inside the 30 s per-test timeout. No turn-counted wait remains in the file.
- `realNow = performance.now.bind(performance)` and `realSetTimeout` are captured at file load. Measured by the planner: after `jest.useFakeTimers({ doNotFake: ['setImmediate','nextTick'] })` the live performance.now, Date.now and hrtime are frozen, so only a captured reference reads real time.
- Every converted wait is followed by an `expect` on the awaited call list. `restores after an installer timeout` previously had no assertion after its wait; it now fails readably rather than hanging to the per-test timeout.
- The `LOADED_RUNNER_TEST_TIMEOUT_MS` comment now states the real-time bound and that neither a retry nor a skip is the fix. The value (30_000) and its use on the four tests are unchanged.
- The ledger records the recurrence (run id, corrected cause, both fix commits, proofs) between Verdict and Decision brief; the Verdict text is untouched (12 lines added, 0 removed).

## Task Commits

1. **Task 1 (tracer): real-clock helper, slowed path RED then GREEN, mutant** - `dc220850f` (test)
2. **Task 2: remaining two waits, assertions, comment, soak** - `d59c79873` (test)
3. **Task 3: ledger post-verdict recurrence (D-04)** - `2398a915a` (docs, committed with `--files`)

## Proofs

- **RED (Task 1 Step 1, old turn-counted wait, slowed 250 ms download):** `expect(received).toHaveLength(expected)` - `Expected length: 1`, `Received length: 0`, `Received array: []` at the assertion straight after the wait. This is the CI symptom of run 44850161668.
- **GREEN:** file passes, 63 of 63 (62 baseline plus the new test).
- **Mutant:** a temporary copy with `REAL_WAIT_DEADLINE_MS = 5` ran the slowed test: numFailedTests 1, numPassedTests 0, numRuntimeErrorTestSuites 0. So the test catches a wait that gives up early, and the captured clock is not frozen. The copy was removed by the verify's EXIT trap (0 mutant files remain) and was never staged.
- **Soak:** `soak passed 10/10 with 60 busy loops` (two CPU-bound loops per core on 30 cores). Caveat: contention alone did not turn the old wait red locally (planner measured 8 of 8 green), so the binding proof is the RED run and the mutant. The soak is supplementary.
- eslint, `npx tsc --noEmit` and `npx prettier --check` over the test file all pass. The ledger is prettier-ignored, so no check was run over it.
- Acceptance greps after Task 2: turn-counted waits 0 (HEAD was 3), `await yieldUntil(` 4, `LOADED_RUNNER_TEST_TIMEOUT_MS` references in code 5, no retryTimes/skip/only.
- `Graphics query times out`: `graphicsCalls()` has exactly one call at the wait, so the plan's strict `toHaveLength(1)` stands; no weakening was needed.

## Deviations from Plan

None - plan executed exactly as written.

## Handoff (not delivered here)

The gap truth "CI green on a pushed main sha" is not observed by this plan. Nothing was pushed. After the operator pushes, re-test UAT item 2 with `/gsd-verify-work 82`, which reads the Test and Rust test runs for that sha.

## Known Stubs

None.

## Threat Flags

None. Test-only change; no new network, auth or file-access surface.

## Self-Check: PASSED

- Test file and ledger exist; `dc220850f`, `d59c79873` and `2398a915a` are ancestors of HEAD.
- `git show --name-only` for the Task 1 and Task 2 commits lists only the test file; for the Task 3 commit only the ledger.
