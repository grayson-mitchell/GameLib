---
phase: 84-logger
plan: 15
subsystem: logging
tags: [typescript, sidecar, log-forwarder, gap-closure, tdd]

requires:
  - phase: 84-logger
    provides: the LogForwarder, the per-target LogWriter facade and the shell's frame contract (84-03, 84-04); 84-14 is the Rust half of WR-05
provides:
  - one producer that makes every log entry acceptable to the shell before it is queued (WR-01)
  - logTargetRefusal, the one target predicate shared by the forwarder and the facade
  - owed rotations: an evicted or rejected rotate claim moves to the target's next entry (WR-05, TS half)
  - a flush bounded by one deadline across the chain wait and the transport wait (WR-06)
affects: [84-logger, FND-05, processGuards fatal flush, releaseOnStdinEof]

actuals:
  tokens: 4500
  tasks: 3
  commits: 6
plan_head_before: c1e90180f79cfcace9fdf0a3fdfbf8ebf5338c14
plan_head_after: 0a39bba1839304131da53b531736d0bd8a1f164a

tech-stack:
  added: []
  patterns:
    - "sanitise at the single producer: the forwarder, not the shell, owns entry validity"
    - "owed state keyed by target, held on the forwarder instance (no module state)"
    - "one deadline taken at entry, shared by every wait in a bounded call"

key-files:
  created: []
  modified:
    - src/backend/logger/forwarder.ts
    - src/backend/logger/targetWriter.ts
    - src/backend/logger/index.ts
    - src/backend/logger/__tests__/forwarder.test.ts
    - src/backend/logger/__tests__/targetWriter.test.ts

key-decisions:
  - "WR-01 is fixed at the producer only; the reviewer's optional Rust-side change (drop just the offending entry instead of the whole frame) is not taken"
  - "The appName predicate also refuses a lone-surrogate appName, since serde_json would refuse the frame for it"
  - "An owed rotation is keyed by target and never owed for a general target"

requirements-completed: [FND-05]

coverage:
  - id: D1
    description: "WR-01: lone surrogates, unknown prefixes and rejectable targets never reach a frame; unrelated lines in the same frame still arrive"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#replaces lone surrogates before queueing (WR-01)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#falls back to Backend for a prefix outside the closed set (WR-01)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#drops an entry whose target the shell would reject without losing the rest of the frame (WR-01)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#the TS runner and game-type sets equal gamelib-core paths.rs (WR-01)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/targetWriter.test.ts#refuses a runner Rust would reject: one general WARNING, nothing sent (WR-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "WR-05 (TS half): an evicted or rejected rotate claim is carried to the target's next entry"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#moves a dropped rotate claim to the next surviving entry of the same target (WR-05)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#owes a rotation when no entry of the target survives (WR-05)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#carries a rotate claim past a rejected Promise message (WR-05)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/targetWriter.test.ts#a rejected Promise write passes its rotate claim to the next write (WR-05)"
        status: pass
    human_judgment: false
  - id: D3
    description: "WR-06: flush resolves within one LOG_FLUSH_TIMEOUT_MS in total, with an unref'd deadline timer, when a Promise message never settles"
    requirement: FND-05
    verification:
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#flush resolves within the timeout even when a Promise message never settles (WR-06)"
        status: pass
      - kind: unit
        ref: "src/backend/logger/__tests__/forwarder.test.ts#the deadline timer is unref d (WR-06)"
        status: pass
    human_judgment: false

duration: 28min
completed: 2026-11-21
status: complete
---

# Phase 84 Plan 15: Logger TS producer gap closure Summary

**The sidecar's log forwarder now sanitises every entry at the producer (surrogates, prefix, target), never spends a rotate claim on an entry that does not reach a frame, and bounds `flush` with a single unref'd deadline.**

## Performance

- **Duration:** about 28 min
- **Completed:** 2026-11-21
- **Tasks:** 3 (one tracer, two auto, all `tdd="true"`)
- **Files modified:** 5 (3 source, 2 test)
- **Commits:** 6 (a RED and a GREEN per task)

## Accomplishments

- WR-01: `LogForwarder.enqueue` replaces lone surrogates with U+FFFD (only when `isWellFormed()` is false, so the common path allocates nothing), maps a prefix outside the closed `LogPrefix` set to `Backend`, and never queues an entry whose target the shell would reject (counted in the new `stats().refusedTotal`). One bad entry can no longer take a 32 KiB frame of unrelated lines with it.
- WR-01: `logTargetRefusal(target)` is the one predicate (kind, the six runners with `comet` refused for a game target, the six game types, the appName rules moved out of `targetWriter.ts`). The facade refuses at construction with one general WARNING naming the reason (`invalid appName` keeps its exact wording; `invalid runner`, `invalid type`, `invalid kind` are new). A parity test pins the TS runner and game-type sets to `gamelib-core` `paths.rs`, with a self-test that a dropped arm is reported.
- WR-05 (TS half): `#enforceCaps` hands an evicted rotate-true entry's claim to the next surviving entry of the same target, or owes it to the target's next enqueued entry. `logLine`'s rejection handler and the facade's `writeString` (through the new `oweLogRotation` in `index.ts`) pass a rejected Promise message's claim on the same way. The owed map is instance state, so moduleStateCensus is unchanged.
- WR-06: `flush` takes one deadline at entry. The chain wait races each round against an unref'd timer for the time left, gives up at the deadline, and continues to the transport half with the remaining time (never more than a full timeout). Lines of other writers still reach the transport.

## Findings fixed

| Finding | Commits (RED / GREEN) | Test names |
| ------- | --------------------- | ---------- |
| WR-01 | `fbc5185db` / `28c9f8caf` | forwarder.test.ts: `replaces lone surrogates before queueing (WR-01)`, `falls back to Backend for a prefix outside the closed set (WR-01)`, `drops an entry whose target the shell would reject without losing the rest of the frame (WR-01)`, `the TS runner and game-type sets equal gamelib-core paths.rs (WR-01)`; targetWriter.test.ts: `refuses a runner Rust would reject: one general WARNING, nothing sent (WR-01)` |
| WR-05 (TS half) | `3336fae60` / `c42be0306` | forwarder.test.ts: `moves a dropped rotate claim to the next surviving entry of the same target (WR-05)`, `owes a rotation when no entry of the target survives (WR-05)`, `carries a rotate claim past a rejected Promise message (WR-05)`, `never owes a rotation to a general target (WR-05)` (green at HEAD by design); targetWriter.test.ts: `a rejected Promise write passes its rotate claim to the next write (WR-05)` |
| WR-06 | `f4cd3008c` / `0a39bba18` | forwarder.test.ts: `flush resolves within the timeout even when a Promise message never settles (WR-06)`, `the deadline timer is unref d (WR-06)` |

## RED evidence (observed before each change)

All runs were `pnpm exec jest --runTestsByPath` over the two touched test files (jest reporter output; not run through `gsd_run check tdd-red-evidence`, which has no jest-format adapter).

- Task 1: 5 failed, 34 passed. Surrogate test: the sent text kept the lone surrogate. Prefix test: expected `Backend`, received `Nope`. Target test: `refusedTotal` was `undefined`. Parity test: `LOG_TARGET_RUNNERS is not iterable` (the symbol did not exist yet). Facade test: no `invalid runner` WARNING. Semantic assessment: the surrogate, prefix, target and facade cases failed on the planned assertions; the parity test failed because its subject symbol is absent, which is the intended RED for a new export.
- Task 2: 4 failed, 40 passed (the 5th new case, general never owes a rotation, passes at HEAD by design). Each failure was the planned assertion: the game batch carried `rotate: false` where `true` was expected.
- Task 3: 2 failed. The never-settling Promise test hit `Exceeded timeout of 5000 ms` (flush never resolved), and the unref test found no deadline timer.

## Verification

- `pnpm exec jest` over forwarder, forwarderCalibration, forwarderGolden, targetWriter, loggerWriters, logPrefixParity and moduleStateCensus: 7 suites, 123 tests, all pass. forwarderGolden still replays every golden case byte for byte, and forwarderCalibration's stalled profile reports the same 386 dropped as before.
- `pnpm codecheck`: no errors. `pnpm lint`: production PASS, tests PASS. `pnpm find-deadcode`: PASS (312 baselined findings, no new one). `pnpm backend-di-ceilings`: PASS, no shard change needed.
- `npx prettier --check` over the five touched paths (each confirmed not ignored with `--file-info`): clean.
- Acceptance greps: `export function logTargetRefusal` count 1 (was 0), `function isValidAppName` in targetWriter.ts count 0 (was 1), `oweLogRotation` in index.ts count 2 and `oweLogRotation(` in targetWriter.ts count 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Redundant type assertion in the prefix check failed `pnpm lint`**
- **Found during:** Task 3 verify
- **Issue:** Task 1's `(Object.values(LogPrefix) as string[]).includes(prefix)` tripped `@typescript-eslint/no-unnecessary-type-assertion` (a lint error, production ceiling FAIL).
- **Fix:** Dropped the assertion.
- **Files modified:** src/backend/logger/forwarder.ts
- **Verification:** `pnpm lint` production PASS, codecheck clean, 123 tests pass.
- **Committed in:** `0a39bba18` (with Task 3, because the file already carried that task's edits and partial staging is interactive-only)

**2. [Rule 2 - Missing critical] `isValidAppName` now also refuses a lone-surrogate appName**
- **Found during:** Task 1
- **Issue:** The plan moved the appName rules "unchanged", but a game target whose appName holds a lone surrogate would still make serde_json refuse the whole frame, the exact loss WR-01 exists to prevent.
- **Fix:** One added `!appName.isWellFormed()` check in the shared predicate.
- **Files modified:** src/backend/logger/forwarder.ts
- **Committed in:** `28c9f8caf`

**3. [Rule 3 - Blocking] A stray empty `arder.ts` appeared at the repo root and broke `pnpm lint`**
- **Found during:** Task 3 verify
- **Issue:** A failed `sed -i` command I ran (this shell's `sed` rejected it) left a 0-byte untracked `arder.ts`, which the scoped lint tried to parse.
- **Fix:** Deleted the file I had created (`rm`, not `git clean`); it was never staged or committed.
- **Verification:** `pnpm lint` PASS afterwards.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** No scope creep; the first two are small, and the third left nothing behind.

## Decisions Made

- **WR-01's optional Rust-side change was not taken.** The reviewer offered changing the shell to drop only the offending entry instead of the whole frame. Once the producer cannot emit a bad entry (lone surrogates replaced, prefix mapped, rejectable targets never queued), the shell's reject-whole contract, which `src/common/__fixtures__/logFrameVectors.json` pins on both sides, loses nothing. Changing it would change the shared frame contract for no remaining gain.
- A rotation is not owed for the "empty first call" case (a line with an empty message): 84-REVIEW.md calls it an accepted, distinct item.
- Owed rotations are keyed by `targetKey` on the forwarder instance, which keeps `moduleStateCensus` at its sanctioned counts.

## Issues Encountered

- `pnpm lint` and several one-liners in this repo's shell run under zsh, where an unquoted `$F` is not word-split; the plan's `<verify>` loop silently checked one concatenated path on the first attempt. The check was re-run under `bash -c` over the real path list and passed (the Task 1 commit was made before that re-run, but nothing differed).

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or file access; the changes narrow what the sidecar emits.

## Threat model dispositions

- T-84-45 (frame loss): mitigated, Task 1 tests.
- T-84-46 (rotate claim lost): mitigated for the TS half, Task 2 tests; the Rust half is 84-14.
- T-84-47 (unbounded flush): mitigated, Task 3 tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

G-84-4's TypeScript share is closed. Not touched, by instruction: `.planning/STATE.md`, `.planning/state.json`, `.planning/ROADMAP.md`. `requirements-completed: [FND-05]` is declared here but REQUIREMENTS.md was not written (shared requirement id; orchestrator decides).

## Self-Check: PASSED

- Modified files exist: forwarder.ts, targetWriter.ts, index.ts, both test files (FOUND).
- Commits `fbc5185db`, `28c9f8caf`, `3336fae60`, `c42be0306`, `f4cd3008c`, `0a39bba18` are ancestors of HEAD (FOUND).
- `git rev-list --count c1e90180f..HEAD` was 6 at SUMMARY time.

---
*Phase: 84-logger*
*Completed: 2026-11-21*
