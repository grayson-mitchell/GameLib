---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 02
subsystem: testing
tags: [jest, census-gates, vacuous-scan, floors, meta-gates]
status: complete

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: 82-01 test ledger and a green baseline for the census suites
provides:
  - assertAtOrAboveFloor, the shared vacuous-scan guard for census-style gates
  - an empty-input (and, for the two named censuses, truncated-input) test that must fail in every census gate
  - measured floors replacing the weak `files.length > 0` bounds in appShellImportGate and gameDetailsImportGate
  - a zero-input refusal in bridgeCensus and a require-safe, testable per-scope floor in lintScoped
affects: [82-11, 82-12]

actuals:
  tokens: 7672
  tasks: 3
  commits: 4

plan_head_before: 4127db44b16210bb65f6af4f1159351a8f40b163
plan_head_after: fed18d21042862e1486dc85e5feb4114a756d7dc

tech-stack:
  added: []
  patterns:
    - "assertAtOrAboveFloor(label, scanned, floor): throws below the floor, on a non-finite scan, and on a non-positive-integer floor"
    - "a gate's scan root is parametrised (registrationFiles(dir), walk(dir)) so a real empty mkdtemp dir drives the negative case through the same code the census runs"
    - "census floor + `cannot pass vacuously (D-05)` describe block per gate, no jest.mock"

key-files:
  created:
    - src/backend/testUtils/censusFloor.ts
    - src/backend/testUtils/__tests__/censusFloor.test.ts
    - meta/__tests__/lintScoped.test.ts
  modified:
    - src/backend/sidecar/__tests__/ipcDomainCensus.test.ts
    - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts
    - src/backend/sidecar/__tests__/phase70PassthroughCensus.test.ts
    - src/backend/sidecar/__tests__/appShellImportGate.test.ts
    - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
    - src/backend/sidecar/__tests__/electronReachLedger.test.ts
    - src/backend/sidecar/__tests__/externalDynamicImportGate.test.ts
    - src/backend/__tests__/moduleStateCensus.test.ts
    - src/backend/__tests__/depotPortComplete.test.ts
    - src/backend/__tests__/scannerPortComplete.test.ts
    - src/backend/__tests__/steamCmPortComplete.test.ts
    - src/backend/__tests__/steamFilesPortComplete.test.ts
    - src/backend/__tests__/steamPollsPortComplete.test.ts
    - meta/bridgeCensus.ts
    - meta/__tests__/bridgeCensus.test.ts
    - meta/__tests__/backendDiCeilings.test.ts
    - meta/lintScoped.cjs
    - meta/__tests__/hardcodedStringGate.test.ts
    - meta/__tests__/steamLineCeiling.test.ts

key-decisions:
  - "The floor helper refuses a zero or fractional floor, because a zero floor is itself the vacuous guard it exists to prevent"
  - "bridgeCensus fails (non-zero exit) when it finds zero installed titles, instead of printing an empty table and exiting 0"
  - "lintScoped.cjs now runs main() only as the CLI (require.main === module) and exports SCOPES and scopeFloorFailure, so its floor is testable without linting the repo"
  - "No existing floor was lowered or widened; the only new floors are the two raised in the import gates and a 300 floor on hardcodedStringGate's scanned files"

patterns-established:
  - "Negative-case tests drive a real empty or one-file tmp dir through the gate's own walker rather than mocking the filesystem"

requirements-completed: [FND-01]

duration: 44 min
completed: 2026-11-20
---

# Phase 82 Plan 02: Census gates cannot pass vacuously Summary

**A shared `assertAtOrAboveFloor` guard plus a deliberate empty-input test in every census-style drift gate, with the two weak `> 0` floors raised to measured values and bridgeCensus and lintScoped made to fail on an empty scan.**

## Performance

- **Duration:** 44 min
- **Tasks:** 3 of 3
- **Files:** 3 created, 19 modified

## Accomplishments

- Task 1 (tracer): `src/backend/testUtils/censusFloor.ts` with boundary tests (equal passes, floor minus one throws, zero, NaN, and a non-positive-integer floor all throw; the message names the label, count and floor). Wired end to end through `ipcDomainCensus` (a local `checkCensusNotVacuous({ files, total })` shared by the real run and the negative cases: empty, single-file, first-domain-only, two-thirds truncation, and the floor-minus-one boundary) and `flowRegistrationCensus` (`registrationFiles(dir = SIDECAR_DIR)` parametrised; an empty tmp dir and a one-file tmp dir both fail the module-list check and the registrations floor).
- Task 2: the same two guards added to `phase70PassthroughCensus`, `moduleStateCensus`, the five `*PortComplete` walks, `electronReachLedger` and `externalDynamicImportGate`; `appShellImportGate` and `gameDetailsImportGate` had four `files.length > 0` floors replaced by measured floors.
- Task 3: `bridgeCensus` gains an exported `assertCensusInputs` (a run over zero titles used to print an empty table and exit 0, which was the vacuous pass); `backendDiCeilings` gains a zero-file-root CLI case; `lintScoped.cjs` extracts `scopeFloorFailure`, becomes `require()`-safe, and gets its first test file; `hardcodedStringGate` gains an empty-scope test and a scanned-files floor; `steamLineCeiling` gains a true empty-root case (its existing "fewer files than the floor" case scanned one file, not zero).

## Gate table

| Gate | Floor (value) | Empty-input test (file : case) | Status |
| --- | --- | --- | --- |
| ipcDomainCensus | 22 registration files, 284 declarations (exact pins 22 / 294 / 66 kept) | ipcDomainCensus.test.ts : `cannot pass vacuously (D-05)` (empty, single-file, truncated x2, boundary) | added |
| flowRegistrationCensus | 22 modules, 151 registrations (`> 150`) | flowRegistrationCensus.test.ts : `cannot pass vacuously (D-05)` (empty tmp dir, one-file tmp dir) | added |
| phase70PassthroughCensus | 101 files (`> 100`) | phase70PassthroughCensus.test.ts : `an empty directory walk fails the files floor` | added |
| moduleStateCensus | 445 backend files | moduleStateCensus.test.ts : `an empty root fails...`, `a single-file root fails...` | added |
| depotPortComplete | 500 files | depotPortComplete.test.ts : `empty-input (D-05)` | added |
| scannerPortComplete | 500 files | scannerPortComplete.test.ts : `empty-input (D-05)` | added |
| steamCmPortComplete | 500 files | steamCmPortComplete.test.ts : `empty-input (D-05)` | added |
| steamFilesPortComplete | 500 files | steamFilesPortComplete.test.ts : `empty-input (D-05)` | added |
| steamPollsPortComplete | 500 files (the separate Rust walk keeps its existing 30-file floor) | steamPollsPortComplete.test.ts : `empty-input (D-05)` | added |
| appShellImportGate | sidecar 45 (measured 53), appshell 3 (measured 4); was `> 0` | appShellImportGate.test.ts : `cannot pass vacuously (D-05)` | added, floors raised |
| gameDetailsImportGate | sidecar 45 (measured 53), gamedetails 2 (measured 2); was `> 0` | gameDetailsImportGate.test.ts : `cannot pass vacuously (D-05)` | added, floors raised |
| electronReachLedger | 225 visited files (`> 224`) | electronReachLedger.test.ts : `a walk with no entry points visits nothing...` | added |
| externalDynamicImportGate | 200 scanned files | externalDynamicImportGate.test.ts : `Gate 2 empty-input` (its known-bad self-test proves detection, not emptiness, so it did not already cover this) | added |
| bridgeCensus | 1 installed title (`assertCensusInputs`) | bridgeCensus.test.ts : `assertCensusInputs: a census cannot pass vacuously (D-05)` | added (zero-input run was a vacuous pass) |
| backendDiCeilings | `--min-backend-files` / `--min-src-files` (defaults unchanged) | backendDiCeilings.test.ts : `exits 1 on a zero-file root` (existing `floor exceeds files scanned` case used a 2-file root) | added |
| lintScoped | src 375, tests 220 (unchanged) | lintScoped.test.ts : empty, single-file and at-floor / floor-minus-one cases per scope | added (new file) |
| hardcodedStringGate | 300 scanned files (measured 315); scanScope already threw on an empty scope | hardcodedStringGate.test.ts : `an empty scope snapshot throws ScopeLoadError` and the 300 floor case | added |
| steamLineCeiling | `--min-files` default 100 (unchanged) | steamLineCeiling.test.ts : `exits non-zero on an empty root` | added (existing case scanned one file) |
| gameInfoNarrowingCeiling | existing `floor` kind | gameInfoNarrowingCeiling.test.ts : `flags a scan below the floor` (scannedFiles: 1) | covered, unchanged |
| knipRatchet | n/a (stdin ratchet) | knipRatchet.test.ts : `exits 1 on empty stdin` | covered, unchanged |
| logSecretGate | scope floor | logSecretGate.test.ts : `refuses an empty scope` | covered, unchanged |

New floors with measured counts (all measured at `1080f5c25`, 2026-11-20): appShellImportGate sidecar 45 of 53 and appshell 3 of 4; gameDetailsImportGate sidecar 45 of 53 and gamedetails 2 of 2; hardcodedStringGate 300 of 315. Every other floor is the pre-existing value, carried through the helper unchanged.

Ordering truth (backstop): census and offender lists were already emitted in sorted order (`registrationFiles` sorts, `duplicateDeclarations` and the violation lists derive from sorted or insertion-stable iteration); nothing new was needed and no check was added.

## Task Commits

1. **Task 1: floor helper through ipcDomainCensus and flowRegistrationCensus** - `1080f5c25` (test)
2. **Task 2: backend and sidecar census gates** - `f41f5cd94` (test)
3. **Task 3: meta ceiling and census scripts** - `fed18d210` (test; amended once, see Deviations)

`commits: 4` is the measured `rev-list` count from the plan ledger. One of the four, `d475531e7` (quick-261120-rdo), is another session's commit that landed on `main` between Task 2 and Task 3; the plan's own commits are the three above.

## Verification

- Targeted jest over every touched file: green (180 tests in the 11 Task 2 suites, 100 in the Task 1 suites, 603 in the 9 Task 3 suites).
- `pnpm backend-di-ceilings`: PASS, `jestMock=1865` unchanged (no new `jest.mock`).
- `pnpm lint`: `production: PASS | tests: PASS` (619 test-scope warnings against a 661 ceiling).
- `pnpm codecheck`: clean. `pnpm find-deadcode` (run alone, per 82-01): PASS, 334 baselined findings.
- `npx prettier --file-info` reported every touched path as not ignored, and `npx prettier --check` over the exact paths passed for each task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Stale plan figure] ipcDomainCensus exact pin is 294, not 296**
- **Found during:** Task 1
- **Issue:** the plan and its `toBe(296)` acceptance criterion predate quick 261120-pp4, which deleted two channels; the file already pinned `toBe(294)` and the floor 284 and the owner-less count 66 were unchanged.
- **Fix:** kept the real exact pin (294) and the 22 / 284 / 66 values; nothing was lowered or widened. The `toBe(296)` grep in the plan is stale rather than a regression.
- **Files modified:** none beyond the plan's list.
- **Commit:** `1080f5c25`

**2. [Rule 3 - Shared dirty tree] Task 3 commit swept another session's hunks; repaired by amending my own commit**
- **Found during:** Task 3 post-commit `git show --stat`
- **Issue:** `meta/bridgeCensus.ts` and `meta/__tests__/bridgeCensus.test.ts` carried the x86-shim-parity session's uncommitted hunks (quick 261120-rdo: `countX86ModernOrFlatUnexported`, which also depends on uncommitted exports in `shimCoverage.ts`). A pathspec commit takes the whole file from the working tree, so they were included in my commit, leaving `HEAD` referencing symbols that `HEAD` did not export.
- **Fix:** rebuilt the two files as `HEAD~1` plus only my hunks, wrote them into the index with `git update-index --cacheinfo`, and ran `git commit --amend --no-edit` on my own, just-created, unpushed commit. The working tree was never touched, so the other session's hunks are still uncommitted and intact (`git diff` shows exactly their +33 / +42 lines). The amended commit is `fed18d210` (was `522e553f8`).
- **Files modified:** `meta/bridgeCensus.ts`, `meta/__tests__/bridgeCensus.test.ts`
- **Commit:** `fed18d210`

**3. [Rule 2 - Missing guard] bridgeCensus had a real vacuous pass, so a behaviour change was added, not just a test**
- **Found during:** Task 3
- **Issue:** with no bridge bottles the CLI printed an empty table and exited 0. The plan's reference to a "README tier-2 note" has no counterpart in the repo (no README mentions bridge-census).
- **Fix:** `assertCensusInputs(rows.length)` in `main()`; a run over zero titles now exits 1 through main's existing catch. Operators with no bottles will see that failure, which is the intent.
- **Files modified:** `meta/bridgeCensus.ts`, `meta/__tests__/bridgeCensus.test.ts`
- **Commit:** `fed18d210`

**Total deviations:** 3 (1 stale plan figure, 1 shared-tree repair, 1 added guard). **Impact:** none on scope; no floor lowered.

## Issues Encountered

- 82-01 noted that `find-deadcode` can fail on the transient `runTs.__probe__.cjs` under concurrent jest; it was run alone and passed.
- The plan ledger (`gsd-plan-head-before-82-02`) was created after the first task commit, not before it, so its base was set by hand to that commit's parent (`4127db44b`). The measured count is unaffected.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, file-access or schema surface; no packages added.

## Self-Check: PASSED

Created files found (`censusFloor.ts`, `censusFloor.test.ts`, `lintScoped.test.ts`); commits `1080f5c25`, `f41f5cd94`, `fed18d210` are ancestors of `HEAD`.
