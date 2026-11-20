---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 18
subsystem: safety
tags: [source-gate, detector, rustInvoke, destructive-guard, gap-closure]
requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: findRawRecursiveDeletes, nonSteamDeleteGate, steamDeleteGate, rustSafety.removeTree
provides:
  - findRawRecursiveDeletes matches rm/rmSync/rmdir/rmdirSync on any receiver (WR-07)
  - opaque-options suspicion and a reason field on each hit
  - declaration skip and a documented non-goals header
  - both delete gates portable to Windows (forward-slash paths) with DI-shape and opaque-options anti-vacuity probes
  - safety_remove_tree in UNBOUNDED_RUST_CHANNELS, pinned by a fake-timer test (WR-03)
affects: [82-19, verification gap 3]
actuals:
  tokens: 2700
  tasks: 3
  commits: 3
plan_head_before: 829329a77f65cbdc57b5994cbde88a162035c862
plan_head_after: 0100bfa7b9f3bcb246b5a614709ba220713407bc
tech-stack:
  added: []
  patterns:
    - "a source gate must prove it can fail: each gate injects the DI shape and the opaque-options shape and expects an offender"
    - "repo-relative gate paths are normalised to forward slashes before comparison with an allowlist"
key-files:
  created: []
  modified:
    - src/backend/testUtils/rawRecursiveDeletes.ts
    - src/backend/testUtils/__tests__/rawRecursiveDeletes.test.ts
    - src/backend/safety/__tests__/nonSteamDeleteGate.test.ts
    - src/backend/safety/__tests__/steamDeleteGate.test.ts
    - src/backend/sidecar/sidecarRpc.ts
    - src/backend/sidecar/__tests__/rustInvokeChannel.test.ts
key-decisions:
  - "The detector over-reports on purpose: any method named rm/rmSync/rmdir/rmdirSync with recursive or opaque options is a hit, whatever the receiver; a false positive is allowlisted by enclosing function with a written reason"
  - "Detector blind spots (aliased imports, destructured re-bindings, computed access, rimraf/fs-extra, wrappers such as removeFolder, shell rm/rd, unlisted files) are written in the header as non-goals, not claimed as covered"
  - "safety_remove_tree is unbounded (duration scales with the tree), safety_check_removal stays at 60 s"
requirements-completed: [FND-01, FND-02]
duration: 25min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 18: Raw-delete detector widening and unbounded remove channel Summary

**The raw-recursive-delete detector now reports rm-family calls on any receiver (`deps.fs.rmSync`, `this.deps.fs.promises.rm`, optional chains) and any call whose options are not an object literal, both gates are portable to Windows, and `safety_remove_tree` is no longer cut off by the 60 s rustInvoke timer.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 3 (1 tracer, 2 auto/tdd)
- **Files:** 6 modified

## Accomplishments

- `CALL` matches the rm-family name after any non-identifier character; the reported `call` text starts at the receiver chain. `formSync(` and `xrm(` are not matched.
- `reason: 'recursive-option' | 'opaque-options'` on every hit. Opaque: a second argument that is not `{...}`, an object literal with a spread, or a first-argument spread. Declarations (`function rm(...)`, a method `rm(a, b) {}`, arrow parameter lists) are skipped.
- Header lists the non-goals and says non-fs methods named rm are over-reported on purpose.
- Both gates compare forward-slash repo-relative paths, so the allowlist matches on Windows. Each gate's anti-vacuity test injects `deps.fs.rmSync(prefix, { recursive: true })` and `rmSync(prefix, OPTS)` and expects each to be one offender.
- `RUST_SAFETY_REMOVE_TREE` added to `UNBOUNDED_RUST_CHANNELS` with a fourth membership rule (WR-03). A fake-timer test shows the remove request still pending after 60 000 ms while `safety_check_removal` rejects with `rustInvoke timed out after 60000ms: safety_check_removal`.

## Task Commits

1. **Task 1 (tracer): member calls on any receiver, portable gates, DI-shape probe** - `56f7007fa`
2. **Task 2: opaque options, declaration skip, reason field, non-goals header** - `df3c842d5`
3. **Task 3: safety_remove_tree unbounded (WR-03)** - `0100bfa7b`

## Gate runs on Windows (before / after)

- Before (HEAD `829329a77`): `nonSteamDeleteGate` and `steamDeleteGate` -- 2 suites failed, 4 of 8 tests failed (both allowlist tests in each: `src\backend\...` against `src/backend/...`).
- After Task 1: `rawRecursiveDeletes` + both gates -- 3 suites, 21 tests, all passed. After Task 2: 25 tests, all passed.
- New detector hit in a guarded file: none. Both gates stay green with the existing allowlists, unchanged `GUARDED_FILES`, `FLOOR` and `ALLOWED`.

## Verification

- `pnpm exec jest --runTestsByPath` over the three detector/gate suites: 3 passed, 25 tests.
- `rustInvokeChannel.test.ts`: 10 of 10 passed alone on 3 repeat runs. It failed one test once (`rejects a non-allowlisted channel immediately...`, a real-timer `flush()` test, untouched by this plan) in the one run that came right after a cold `codecheck`/`prettier` run, then passed 3 of 3. This matches the plan's note about load timing.
- `pnpm codecheck` clean, `pnpm backend-di-ceilings` PASS (jestMock=1865 unchanged, no new `jest.mock`), `pnpm find-deadcode` PASS (312 baselined, no new finding; `reason` type is not a new export).
- `npx prettier --file-info` not ignored for all six TS paths; `--check` passed on each task's paths.
- Not run: `pnpm lint` (left to the pre-push hook, per the plan).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tuple type for the safety request in the new test**
- **Found during:** Task 3 verify (`pnpm codecheck`)
- **Issue:** `requestRustInvoke` takes a one-element tuple; an array literal of one object was rejected.
- **Fix:** typed the request as `[typeof body]`.
- **Files modified:** `src/backend/sidecar/__tests__/rustInvokeChannel.test.ts`
- **Commit:** `0100bfa7b` (fixed before the commit)

**Total deviations:** 1 auto-fixed (type only). **Impact:** none on scope.

## Known Stubs

None.

## Threat Flags

None. The change narrows what a source gate misses and removes a timeout; no new endpoint, auth path or trust-boundary surface.

## Self-Check: PASSED

- All six modified files exist and are in the three commits.
- Commits `56f7007fa`, `df3c842d5`, `0100bfa7b` found in `git log`; measured count from the ledger (`829329a77..HEAD`) is 3.
- No unexpected deletions in any task commit.
