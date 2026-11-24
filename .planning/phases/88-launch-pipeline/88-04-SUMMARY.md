---
phase: 88-launch-pipeline
plan: 04
subsystem: test-harness
tags: [launchOracle, golden-harness, pinned-env, pairwise, spawn-class, incident-census, svc-03]

requires:
  - phase: 87-engine-wine-and-tools
    provides: testUtils/engineWineOracle (withEngineOracleProfile, mockPlatform, normalisePaths, writeOrCompareGolden, syncManifest/assertManifest, fixturesRoot/overrideFixturesRoot) and testUtils/fakeHomeProfile
  - phase: 88-launch-pipeline
    plan: 02
    provides: the launch port-complete gate (contract before code)
provides:
  - src/backend/testUtils/launchOracle/baseEnv.ts (PINNED_BASE, withPinnedBaseEnv)
  - src/backend/testUtils/launchOracle/probes.ts (injectPlatform, injectProbe, withInjected)
  - src/backend/testUtils/launchOracle/pairwise.ts (allPairs, uncoveredPairs)
  - src/backend/testUtils/launchOracle/spawnClass.ts (SpawnClass, loadClasses, attachSpawnClass)
  - src/backend/testUtils/launchOracle/census.ts (slug, tsTestTitles, assertCasesCoverTitles)
  - four self-test files, 34 tests in all
affects: [88-05, 88.1, 88.2, 88.3]

actuals:
  tokens: 10700
  tasks: 3
  commits: 5
plan_head_before: 5619fd4eed0f0e4ff6929ed1f62b620db1af32d3
plan_head_after: 64a0ac32b2b1f3152ef11e208a872b01a4c72800

tech-stack:
  added: []
  patterns:
    - "process.env is replaced wholesale (not edited) for a case and the original object restored in finally, so a golden's env is exactly the fake HOME eight plus three pinned keys"
    - "platform and probes injected with jest.replaceProperty / jest.spyOn / Object.defineProperty and returned restore functions; no jest.mock"
    - "a tiny comment-, string-, template- and regex-aware lexer reads test titles and describe nesting without a TS parser"

key-files:
  created:
    - src/backend/testUtils/launchOracle/baseEnv.ts
    - src/backend/testUtils/launchOracle/probes.ts
    - src/backend/testUtils/launchOracle/pairwise.ts
    - src/backend/testUtils/launchOracle/spawnClass.ts
    - src/backend/testUtils/launchOracle/census.ts
    - src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts
    - src/backend/testUtils/launchOracle/__tests__/pairwise.test.ts
    - src/backend/testUtils/launchOracle/__tests__/spawnClass.test.ts
    - src/backend/testUtils/launchOracle/__tests__/census.test.ts
  modified: []

key-decisions:
  - "withPinnedBaseEnv takes Pick<FakeHomeProfile, 'env'> and assigns a fresh object to process.env, restoring the original object reference, so a leaked key or a mutation made inside a case cannot survive it"
  - "injectProbe spies on a function property (os.release is a function and jest.replaceProperty cannot replace one) and replaces any other property; the plan named replaceProperty only"
  - "attachSpawnClass is generic over a spawn that carries a `callSite` string: the Phase 87 SpawnRecord is not exported and has no call-site field, so each slice adds the id when it records the spawn"
  - "assertCasesCoverTitles also fails a not-ported key that matches no title (a stale exclusion), an addition to the plan's empty-reason and empty-list failures, so a renamed test cannot leave an exclusion that hides a dropped one"
  - "tsTestTitles throws on a title that is not a string or template literal rather than skipping it, so a dynamic title cannot pass the census silently"

patterns-established:
  - "A harness self-test records into overrideFixturesRoot over a fake HOME and compares in a second fresh profile, which proves the golden holds placeholders, not machine paths"

requirements-completed: [SVC-03]

coverage:
  - id: D1
    description: "withPinnedBaseEnv replaces process.env with exactly 11 keys (the fake HOME eight plus PATH, LANG, USER), drops DYLD_/LD_ and a real-shell sentinel, and restores the original env object also when the case throws"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts#withPinnedBaseEnv (2 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The tracer case records and compares through writeOrCompareGolden into a temp fixtures root on an injected platform; a second fresh profile compares equal, a different platform does not; process.env and process.platform are unchanged afterwards"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts#the tracer round trip"
        status: pass
    human_judgment: false
  - id: D3
    description: "injectPlatform flips environment.isMac/isLinux/isWindows and process.platform together; injectProbe replaces os.release; withInjected restores in reverse order even when the case throws"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts (injectPlatform, injectProbe and withInjected)"
        status: pass
    human_judgment: false
  - id: D4
    description: "allPairs is deterministic and covers every legal pair, honours a feasible predicate, and uncoveredPairs reports exactly a planted missing pair; empty axes and a value-less axis throw"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/pairwise.test.ts (10 tests)"
        status: pass
    human_judgment: false
  - id: D5
    description: "attachSpawnClass adds a class per call site and fails a missing one by name; loadClasses reads golden/classes.json and rejects values other than game or helper, a non-object and a missing file"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/spawnClass.test.ts (7 tests)"
        status: pass
    human_judgment: false
  - id: D6
    description: "tsTestTitles reads 46 or more titles from knownFixesRegistry.test.ts with describe prefixes and it.each titles verbatim; assertCasesCoverTitles fails an uncovered title, an empty reason, a stale exclusion and an empty list"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "src/backend/testUtils/launchOracle/__tests__/census.test.ts (11 tests)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Planted-gap self-tests are non-vacuous: with the throw in attachSpawnClass replaced by a default class and the failure in assertCasesCoverTitles disabled, 5 of the 18 spawn-class and census tests failed (both mutations reverted)"
    requirement: SVC-03
    verification:
      - kind: unit
        ref: "mutation run of spawnClass.test.ts and census.test.ts, 5 failed, reverted"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-24
status: complete
---

# Phase 88 Plan 04: launchOracle harness Summary

**The shared launchOracle test harness for every 88 sub-phase: a pinned 11-key base env, injected platform and probes, a deterministic pairwise generator with a coverage proof, a checked spawn-class column and an incident-title census, all self-tested.**

## Performance

- **Duration:** about 25 min (start time was not recorded at launch; estimated from the clock)
- **Completed:** 2026-11-24
- **Tasks:** 3 (one tracer, two TDD)
- **Files:** 9 created under `src/backend/testUtils/launchOracle/`

## Accomplishments

- `withPinnedBaseEnv` (D-12): `process.env` is replaced for a case by the fake HOME's eight variables plus `PATH=/usr/bin:/bin`, `LANG=C.UTF-8`, `USER=gamelib-oracle`, and nothing else. The tracer round trip proves exactly 11 keys, no `DYLD_` or `LD_` key and no real-shell sentinel, and that the original `process.env` object comes back, including after a throw (T-88-08).
- `injectPlatform`, `injectProbe`, `withInjected` (D-13): every OS target is recordable on one machine; `process.platform`, `backend/constants/environment` and `os.release` are injected and restored in reverse order. No `jest.mock` was added.
- `allPairs` and `uncoveredPairs` (D-14): a greedy, randomness-free all-pairs generator over axes with a `feasible` predicate, and a proof function. The self-test plants a row set with one pair removed and sees exactly that pair reported. No npm package was added (T-88-SC).
- `loadClasses` and `attachSpawnClass` (D-11): the hand-authored spawn-class column, `golden/classes.json` per crate, with a spawn of an unclassified call site failing by name.
- `tsTestTitles` and `assertCasesCoverTitles` (D-14, D-15): the incident census. It reads all 46 or more titles of `knownFixesRegistry.test.ts` with their `describe` prefixes and fails any title that is neither a case id by `slug` nor a reasoned exclusion; an empty list fails (T-88-09).

## Task Commits

1. **Task 1: Tracer, pinned env, injected platform, round trip** - `229bf5f55` (feat)
2. **Task 2: Pairwise generator** - RED `525c30ebe` (test), GREEN `f29370775` (feat)
3. **Task 3: Spawn class and census** - RED `1edb2a988` (test), GREEN `64a0ac32b` (feat)

**Plan metadata:** the docs commits that carry this SUMMARY, STATE.md and ROADMAP.md.

## Decisions Made

See `key-decisions` above.

## TDD notes

Tasks 2 and 3 followed RED, then GREEN. Each RED commit adds the tests plus a stub (`allPairs` and `uncoveredPairs` return `[]`; the census and spawn-class stubs return their input), so the failures are assertion failures on the planned behaviour and not import or build errors: 9 of 10 pairwise tests and 17 of 18 spawn-class and census tests failed. The one test in each that passed against its stub passes vacuously (`[]` is the right answer for it), and other tests in the same file cover the same function with a non-vacuous assertion. `gsd check tdd-red-evidence` was not run: jest's default reporter is not one of its supported report formats (TAP, JUnit, go test, swift-testing, unittest), and no reporter was added for this. The semantic assessment above is by inspection of the failure output.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `injectProbe` cannot use `jest.replaceProperty` on a method**
- **Found during:** Task 1 (the `os.release` test)
- **Issue:** the plan names `jest.replaceProperty` for probes, but `os.release` is a function and the replace call refuses it; jest also cannot redefine a property on the `import * as os` namespace object (ts-jest interop getters), so a first attempt threw `Cannot redefine property: release`.
- **Fix:** `injectProbe` uses `jest.spyOn` for a function property and `jest.replaceProperty` for any other; the test imports the real module object with `import os from 'os'`.
- **Files modified:** src/backend/testUtils/launchOracle/probes.ts, src/backend/testUtils/launchOracle/__tests__/baseEnv.test.ts
- **Committed in:** 229bf5f55

**2. [Rule 1 - Bug] Pairwise and census code failed `tsc` under `noUncheckedIndexedAccess`**
- **Found during:** Task 2 GREEN and Task 3 GREEN (`tsc --noEmit`)
- **Issue:** indexing by axis key, `src[i - 1]` and an `m!` assertion did not typecheck; one regex flag (`/s`) needs a newer ES target than the repo's.
- **Fix:** rewrote the generator over `Object.entries` and `[name, values]` pairs, used `[\s\S]` in place of the `s` flag and a null guard in place of `m!`. The pairwise test helpers got the same treatment in the GREEN commit, so the RED test file differs from the GREEN one in those helpers only.
- **Files modified:** pairwise.ts, census.ts, `__tests__/pairwise.test.ts`
- **Committed in:** f29370775, 64a0ac32b

### Scope additions (inside the plan's intent)

- `assertCasesCoverTitles` fails a stale not-ported entry (a key naming no title) and `tsTestTitles` throws on a non-literal title. Both close ways the census could pass silently; the plan listed only the uncovered-title and empty-list failures.

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug), 2 scope additions
**Impact on plan:** none on scope or interfaces; every exported name the plan lists exists with the planned meaning.

## Issues Encountered

None beyond the above. `pnpm codecheck`, eslint over `launchOracle/` and `npx prettier --check` over the nine files are clean.

## Known Stubs

None. The RED-commit stubs were replaced in the GREEN commits; no placeholder remains.

## Threat Flags

None. The only new surface is test-only code; T-88-08 and T-88-09 are mitigated as planned and T-88-SC added no package.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 88-05 and the 88.x slices can record goldens with `withEngineOracleProfile` + `withPinnedBaseEnv` + `injectPlatform`, take their matrix rows from `allPairs`, attach `attachSpawnClass` over a per-crate `golden/classes.json` and gate their incident coverage with `assertCasesCoverTitles`.
- The harness itself stays at `src/backend/testUtils/launchOracle/` and reuses Phase 87's `engineWineOracle`, which a header there says is deleted with the D-22 twins later in Phase 88; whichever plan deletes it has to carry `harness.ts` and `recorder.ts` over first.

## Self-Check: PASSED

All nine created files exist on disk; commits `229bf5f55`, `525c30ebe`, `f29370775`, `1edb2a988` and `64a0ac32b` are ancestors of HEAD; the four self-test files pass (34 tests); `pnpm codecheck` passes; the two planted-gap mutations fail the tests and were reverted.

---
*Phase: 88-launch-pipeline*
*Completed: 2026-11-24*
