---
phase: quick/260726-q8f
plan: 01
subsystem: testing
tags: [jest, backend, comment-stripping, source-gate, vacuous-gate-defect]

# Dependency graph
requires:
  - phase: 34.2 (tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid)
    provides: the round-4 review that found the vacuous-gate defect and the human override that
      re-scoped its closure to this cross-cutting sweep (see 34.2-VERIFICATION.md override block)
provides:
  - "src/backend/testUtils/stripSourceComments.ts — the single shared comment-stripping
    implementation for backend source-text gates"
  - "src/backend/__tests__/stripSourceComments.test.ts — 8-case self-test with a hand-RED-proofed
    non-*-prefixed block-comment spelling"
  - 15 migrated call sites (14 defective line-prefix-only copies + the 1 already-correct
    structuralContainment.test.ts copy), all now importing the shared util
affects: [34.3, 34.4, 34.5, any future backend test file that needs a source-text gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared test-only util under src/backend/testUtils/ (outside any __tests__ dir, so jest's
      testMatch never picks it up), imported with a `stripComments` alias at call sites that
      carry prose/test-name references to the old local name"

key-files:
  created:
    - src/backend/testUtils/stripSourceComments.ts
    - src/backend/__tests__/stripSourceComments.test.ts
  modified:
    - src/backend/appshell/__tests__/appshellModules.test.ts
    - src/backend/crossover_index/__tests__/ratingMap.test.ts
    - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
    - src/backend/sidecar/__tests__/appShellImportGate.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/dialogStub.test.ts
    - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
    - src/backend/sidecar/__tests__/electronUntouched.test.ts
    - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
    - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
    - src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts
    - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
    - src/backend/sidecar/__tests__/testContainment.test.ts
    - src/backend/sidecar/__tests__/structuralContainment.test.ts
    - src/backend/storeSearch/__tests__/handlers.test.ts

key-decisions:
  - "Block-comment removal is ADDED BEFORE the existing line-prefix filter, never substituted for
    it — a naive /\\/\\/.*$/gm trailing-comment pass was explicitly rejected because it would
    reintroduce the WR-08 steam:// literal truncation plan 34.2-28 just fixed"
  - "structuralContainment.test.ts's usesForbiddenNodeOsBinding calls the shared util directly
    with no local trailing-comment layer — the gate stayed green on first run after the swap, so
    the plain call stands per the plan's documented decision tree"
  - "gameDetailsImportGate.test.ts's Gate 8 sha256 pin of electronUntouched.test.ts's byte content
    was recomputed and updated (per that gate's own documented recompute-and-state-the-reason
    procedure) because electronUntouched.test.ts is one of the 14 migrated files and its content
    legitimately, deliberately changed"

patterns-established:
  - "New shared test utils live under src/backend/testUtils/, never under a __tests__ directory
    (jest testMatch is **/__tests__/**/*.test.ts, and a directory tripwire in
    testContainment.test.ts's Block C would trip on a stray file placed inside sidecar/__tests__)"

requirements-completed:
  - "34.2-REVIEW-GAP-CYCLE-4 CR-01 (re-scoped out of phase 34.2 by the human override in
    34.2-VERIFICATION.md)"

duration: ~30min
completed: 2026-07-26
---

# Quick Task 260726-q8f: Extract shared stripSourceComments util Summary

**Extracted one shared `stripSourceComments` util (block-comment removal first, then the
existing line-prefix filter) and replaced 15 byte-identical/near-identical local copies across
14 backend test files, closing a repo-wide vacuous-gate defect that survived four Phase 34.2
review cycles — verified via a full-suite per-test verdict diff showing zero pre-existing test
flipped in either direction.**

## Performance

- **Duration:** ~30 min (3 task commits spanning ~7 min; total session including reconnaissance
  and the mandatory hazard-check sweep was longer)
- **Started:** 2026-07-26T07:00:14Z (baseline capture)
- **Completed:** 2026-07-26T19:08:51+12:00 (Task 3 commit)
- **Tasks:** 3/3
- **Files modified:** 16 (2 created, 14 migrated including structuralContainment.test.ts's own
  already-correct copy)

## Accomplishments
- Created `src/backend/testUtils/stripSourceComments.ts`, the single shared implementation, with
  an 8-case self-test whose Tests 1–3 were hand-RED-proofed against the old line-prefix-only
  implementation (all three failed, confirming the self-test can actually detect the defect it
  exists to prevent)
- Migrated all 14 files carrying the defective line-prefix-only helper (13 named-function copies
  + 1 inline chain in `ratingMap.test.ts`) to import the shared util under a `stripComments`
  alias, preserving every existing call site, test name, and docstring reference with the
  minimum possible diff
- Migrated the one already-correct copy (`structuralContainment.test.ts`'s
  `stripCommentsForNodeOsGate`) to the same shared util; its `node:os` gate stayed green on the
  first run after the swap, so no local trailing-comment layering was needed
- Performed the plan's mandated hazard check: diffed a full-suite baseline (captured before any
  file was touched) against a full-suite run after all 15 files were migrated, by
  `{fullName, status}` pair across all 2326 baseline tests. Result: exactly 8 changes, all
  additions from the new self-test file (`undefined -> passed`). **Zero pre-existing test flipped
  in either direction.**
- `grep -rn 'filter((line) => !/' src/backend` now returns exactly 1 hit (the shared util's own
  line filter) — was 14 before this task

## Task Commits

1. **Task 1: shared util + self-test + RED-proofed baseline** - `e31c8391` (feat)
2. **Task 2: migrate 14 defective local copies** - `10ca2940` (refactor)
3. **Task 3: migrate structuralContainment.test.ts + hazard-check diff** - `aecaf80c` (refactor)

_No separate plan-metadata commit — this quick task's SUMMARY commit below serves that role._

## Files Created/Modified
- `src/backend/testUtils/stripSourceComments.ts` — the shared util (block comments stripped via
  `/\/\*[\s\S]*?\*\//g` FIRST, then the pre-existing line-prefix filter UNCHANGED)
- `src/backend/__tests__/stripSourceComments.test.ts` — 8-case self-test, placed at
  `src/backend/__tests__/` (not `sidecar/__tests__/`) per the plan's placement constraint;
  contains neither `homedir` nor `userInfo` anywhere (verified by grep) since Test 1's fixture
  necessarily mentions `node:os` and would otherwise trip `structuralContainment.test.ts`'s CR-02
  gate
- 14 files: local `stripComments` helper (or, in `ratingMap.test.ts`, an inline unnamed chain)
  deleted; each now imports `stripSourceComments as stripComments` from
  `backend/testUtils/stripSourceComments`; stale docstrings describing the old line-prefix-only
  behaviour replaced with a note pointing at the shared util
- `src/backend/sidecar/__tests__/structuralContainment.test.ts` — `stripCommentsForNodeOsGate`
  deleted, `usesForbiddenNodeOsBinding` now calls `stripSourceComments` directly;
  `NODE_OS_GATE_EXEMPT_FILES` untouched
- `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts` — `ELECTRON_UNTOUCHED_SHA256`
  recomputed and updated (see Deviations below)

## RED Proof (Task 1, verbatim)

Temporarily replaced the util's body with the old line-prefix-only implementation (the four-line
chain from `<the_defective_helper>`), ran only `stripSourceComments.test.ts`, and observed:

```
● stripSourceComments › Test 1: a non-*-prefixed block comment naming jest.mock('os', ...) and jest.mock('node:os', ...) is fully removed
    expect(received).not.toContain(expected) // indexOf
    Expected substring: not "jest.mock('os'"
    Received string:        "jest.mock('os', mockOsFactory)
    jest.mock('node:os', mockOsFactory)
    const x = 1"

● stripSourceComments › Test 2: a non-*-prefixed block comment naming a process.env.HOME assignment is fully removed
    expect(received).not.toContain(expected) // indexOf
    Expected substring: not "process.env.HOME"
    Received string:        "process.env.HOME = containmentRoot
    const x = 1"

● stripSourceComments › Test 3: a non-*-prefixed block comment naming an expression-body error wrapper is fully removed
    expect(received).not.toContain(expected) // indexOf
    Expected substring: not "=> heroicLogWriter.logError("
    Received string:        "(error) => heroicLogWriter.logError(error)
    const x = 1"

Test Suites: 1 failed, 1 total
Tests:       3 failed, 5 passed, 8 total
```

Tests 1–3 failed exactly as required (Tests 4–8 stayed green as expected). Restored the real
two-stage implementation; `diff` against the pre-revert saved copy confirmed byte-identical
restoration, and a re-run showed 8/8 passing.

## Hazard Check (Task 3, the point of this plan)

Baseline (`npx jest --config src/backend/jest.config.js --json`, captured on the untouched tree,
before any file was written): 112/113 suites, 2325/2326 tests, sole failure
`rustInvokeChannel.test.ts` (documented Phase 34.1 baseline).

After (same command, run after all 15 files were migrated): 113/114 suites, 2333/2334 tests, sole
failure `rustInvokeChannel.test.ts` — the same one.

Per-test `{fullName, status}` diff across every key present in either run: **8 total changes**,
all of them additions from the new `stripSourceComments.test.ts` file going from `undefined` (not
present in baseline) to `passed`:

```
stripSourceComments Test 1: ... : undefined -> passed
stripSourceComments Test 2: ... : undefined -> passed
stripSourceComments Test 3: ... : undefined -> passed
stripSourceComments Test 4 (regression guard): ... : undefined -> passed
stripSourceComments Test 5 (WR-08 property): ... : undefined -> passed
stripSourceComments Test 6 (WR-08 property, trailing-comment form): ... : undefined -> passed
stripSourceComments Test 7: ... : undefined -> passed
stripSourceComments Test 8: ... : undefined -> passed
```

**No pre-existing test's verdict changed in either direction.** This is the direct answer to the
hazard the plan flagged: several migrated files (`bootstrapWirings.test.ts`,
`appShellImportGate.test.ts`'s Gate 6, `gameDetailsImportGate.test.ts`'s Gate 8,
`structuralContainment.test.ts`'s CR-02 gates) run gates against their own or a sibling file's
source text, and swapping a local definition for an import changes that text. The diff proves no
gate's outcome depended on the deleted comment-stripping code's specific bugs.

## Decisions Made
- Block-comment removal precedes the line-prefix filter, and the filter is retained rather than
  replaced by a naive `/\/\/.*$/gm` pass — pinned by self-test Tests 5 and 6 (the `steam://`
  literal survives both a bare and a trailing-comment-adjacent form), preserving the WR-08
  property plan 34.2-28 established.
- `structuralContainment.test.ts`'s `usesForbiddenNodeOsBinding` calls the shared util with no
  local trailing-comment layer, since the gate's own 12-test suite (including the
  `NODE_OS_GATE_EXEMPT_FILES` load-bearing check) passed immediately after the swap — the plan's
  documented "if green: done" branch.
- `tauriConf.test.ts`'s `#`-style `stripHashComments` and `longRunningChannels.test.ts`'s
  `stripRustLineComments` were **left alone**, exactly as the plan specifies: neither is a member
  of the JS/TS `//`-and-block-comment family this util addresses.
  `stripHashComments` handles `#`-prefixed shell/TOML-style comments (a different concern), and
  `stripRustLineComments` handles Rust `//` semantics inside a raw-vs-stripped two-step that plan
  34.2-28 deliberately built for `main.rs` source, which this JS/TS-oriented util does not parse.
  `git diff HEAD~3 -- src/backend/__tests__/tauriConf.test.ts src/backend/__tests__/longRunningChannels.test.ts`
  is empty — confirmed byte-unchanged by this quick task.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated a stale sha256 do-not-touch pin after a plan-required file change**
- **Found during:** Task 2 verification (running the 14 migrated files' own test suites)
- **Issue:** `gameDetailsImportGate.test.ts`'s Gate 8 pins a sha256 digest of
  `electronUntouched.test.ts`'s own byte content to detect an unannounced silent weakening of
  that Phase 28 do-not-touch guard. `electronUntouched.test.ts` is itself one of the 14 files this
  plan's Task 2 was required to migrate, so its content legitimately changed and the pin fell out
  of date, failing the gate.
- **Fix:** Recomputed the digest via `shasum -a 256 src/backend/sidecar/__tests__/electronUntouched.test.ts`
  and updated `ELECTRON_UNTOUCHED_SHA256` to the new value, per that gate's own in-file comment
  instructing exactly this: "If this fails because the file was DELIBERATELY edited: ... Recompute
  deliberately ... update ELECTRON_UNTOUCHED_SHA256 above, and state the reason in the commit
  message." The reason is this migration.
- **Files modified:** `src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts`
- **Verification:** Re-ran `gameDetailsImportGate.test.ts` (49/49 passing) and the full backend
  sweep (failing-suite set unchanged at `{rustInvokeChannel.test.ts}`)
- **Committed in:** `10ca2940` (Task 2 commit)

**2. [Rule 1 - Bug] Confirmed a second do-not-touch gate self-resolves post-commit, no fix needed**
- **Found during:** Task 2 verification
- **Issue:** `appShellImportGate.test.ts`'s Gate 6 compares `electronUntouched.test.ts`'s working
  content byte-for-byte against `git show HEAD:...`. It failed transiently while Task 2's changes
  were staged but not yet committed, since HEAD still held the pre-migration content.
- **Fix:** No code fix needed — committed Task 2's changes, then re-ran the gate and confirmed it
  passed (`working` now matches the new HEAD).
- **Files modified:** none (verification-only)
- **Verification:** Re-ran `appShellImportGate.test.ts` after the Task 2 commit — 7/7 passing,
  including Gate 6
- **Committed in:** n/a (no code change; documented for the hazard-check record)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix — the sha256 pin), plus 1 verification-only
non-fix (the transient git-HEAD-comparison gate).
**Impact on plan:** Both are exactly the kind of self-referential-gate friction the plan's
`<why_this_matters>` and Task 3's hazard-check step anticipated. Neither required weakening a
gate, editing an allowlist, or reverting the stripper fix — both resolved by doing precisely what
each gate's own documentation instructs.

## Issues Encountered
None beyond the two items documented above under Deviations.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- The repo-wide vacuous-gate defect (a non-`*`-prefixed block comment satisfying a source-text
  gate) is closed: `grep -rn 'filter((line) => !/' src/backend` returns exactly 1 hit, the shared
  util's own retained line filter.
- Phase 34.2's round-4 blocker (recorded in `34.2-VERIFICATION.md`'s override block) is now
  closed by this cross-cutting sweep, as the override anticipated.
- `34.2-REVIEW-GAP-CYCLE-4.md`'s 11 warnings + 8 info items remain genuinely open (out of this
  quick task's scope) and `/gsd-secure-phase 34.2` is still owed — unchanged by this task.
- No blockers for Phase 34.3 (tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics), which
  is the next planned phase.

---
*Quick task: 260726-q8f-extract-shared-stripsourcecomments-util-*
*Completed: 2026-07-26*
