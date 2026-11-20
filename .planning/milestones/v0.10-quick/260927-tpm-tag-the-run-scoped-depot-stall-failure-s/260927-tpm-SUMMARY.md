---
phase: quick-260927-tpm
plan: 01
subsystem: steam-depot
tags: [steam, depot, diagnostics, logging, tdd]

requires:
  - phase: debug/depot-stall-bound-did-not-fire
    provides: "the run-level stall failure record itself (commit 62f916e58), and the W-2 finding that named this miscount as a residual"
provides:
  - "formatDownloadFailureSummary — the sole formatter for the aggregate download-failed log line, partitioning run-level from file-level failures"
  - "DepotDownloadFailure.scope?: 'run' — the property marker distinguishing a run-level give-up from a per-file failure, without splitting the failures array"
affects: [steam-depot-diagnostics, depot-completeness-gates]

actuals:
  tokens: 7502
  tasks: 2
  commits: 2
plan_head_before: 720ee7092151902ae1ffb97e86dce13153d59120

tech-stack:
  added: []
  patterns:
    - "Property-marker discriminant (`scope?: 'run'`) added to an existing array element type instead of splitting the array — follows the `.eresult`/`.code`/`isStall` precedent already used on this same code path (installStallWatchdog.ts)."

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - .planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md
    - .planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md

key-decisions:
  - "Tag, don't split: DepotDownloadFailure gained one optional field (scope?: 'run'); failures stays a single unfiltered array, and every completeness-gate reader of it (canWriteFullOwnership, the post-loop verdicts, the error-path entry gate) is byte-identical to HEAD."
  - "classifyDepotError's input is unchanged — still failures[0].cause ?? failures[0].error verbatim. The failures[0] ordering ambiguity is a named, deliberately-not-fixed residual, filed as its own todo rather than folded into this fix."
  - "The corrected aggregate line has three parts: the file-only count, the unchanged first: fragment, and a new trailing '; run: <message>' fragment when a run-level record is present — so the run reason stays visible even though it no longer inflates the count."

requirements-completed:
  - QUICK-260927-TPM

coverage:
  - id: D1
    description: "The aggregate download-failed log line reports the FILE-level failure count (not N+1), via a new exported formatDownloadFailureSummary."
    requirement: "QUICK-260927-TPM"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#formatDownloadFailureSummary (quick 260927-tpm) — A1-A5"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#A6: a real run producing both per-file and run-scoped failures reports the file-only count in the aggregate line"
        status: pass
    human_judgment: false
  - id: D2
    description: "The run-level record stays in the unfiltered failures array; every completeness gate (canWriteFullOwnership, allModesApplied/runLooksComplete verdicts) still fails closed on a run-level-only failure, byte-identical to HEAD."
    requirement: "QUICK-260927-TPM"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#canWriteFullOwnership — outcome \"completed\" with only a run-scoped failure -> false (A7)"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#run-scoped no-progress bound — allModesApplied assertion (A7 part 2)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The run-scoped-failure-count todo is closed with a Resolution section and its stale census pointer corrected; the failures[0] ordering residual is filed as its own new todo."
    requirement: "QUICK-260927-TPM"
    verification:
      - kind: other
        ref: "git show :.planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md — contains 260927-tpm, ## Resolution, 260927-tpm-PLAN.md"
        status: pass
    human_judgment: false

duration: "spans two sessions across a context-compaction boundary; final leg's two commits at 2026-09-27T22:04:30+13:00 and 2026-09-27T22:09:46+13:00 (~5 min apart) — an honest total session duration was not tracked across the interruption, so no single figure is asserted"
completed: 2026-09-27
status: complete
---

# Phase quick-260927-tpm Plan 01: Tag the run-scoped depot stall failure so the aggregate log reports the correct file count Summary

**Corrected `downloadSteamDepots`' aggregate log line from an N+1 file-failure miscount to the true per-file count, by tagging the run-level stall record with `scope?: 'run'` and factoring the line into a new exported `formatDownloadFailureSummary`, without touching any completeness-gate's read of the unfiltered `failures` array.**

## Performance

- **Tasks:** 2/2 completed
- **Files modified:** 4 (2 source, 2 planning/todos)
- **Commits:** 2 (measured via `git rev-list --count 720ee7092..HEAD`)

## Accomplishments

- Added `DepotDownloadFailure.scope?: 'run'`, set only at the run-level stall push site, following the existing `.eresult`/`.code`/`isStall` property-marker precedent on this path.
- Added `formatDownloadFailureSummary(appId, failures, classificationKey)`, the sole formatter for the aggregate line: partitions `failures` into file-level (`scope !== 'run'`) and run-level (`scope === 'run'`), reports the file-only count against the `file failure(s)` noun, keeps `first:` reading `failures[0]` verbatim (unchanged), and appends a `; run: <message>` fragment whenever a run-level record exists.
- Replaced the inline aggregate-line template literal at the error path with a call to this new function.
- Added 8 new tests (A1–A7, including a real end-to-end A6 arm) pinning both the corrected count and the byte-identical completeness-gate behavior on a run-level-only failure.
- Closed `.planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md` with a `## Resolution` section naming the fix commit, the chosen shape, and both named-not-closed residuals, and corrected its stale line-number census to point at this plan's own `<census>` section instead.
- Filed a new pending todo, `2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md`, for the `failures[0]` ordering ambiguity (D-C) — deliberately not fixed in this task because the deterministic-preference fix changes a real user-facing classification outcome for one ordering, which is out of this task's scope.

## Task Commits

Each task was committed atomically:

1. **Task 1: Tag the run-scoped failure and correct the aggregate log line, with RED→GREEN tests** - `fe0e8d199` (fix)
2. **Task 2: Close the actioned todo and file the failures[0] ordering residual** - `dfd5c61fa` (docs)

**Note (quick-task convention, per orchestrator instruction):** the STATE.md/ROADMAP.md/PLAN.md/SUMMARY.md metadata commit is made by the orchestrator after this SUMMARY is written, not by this executor.

## Measured RED -> GREEN (Task 1)

Production code (`depot.ts`) was temporarily reverted to its pre-fix content at commit `720ee7092` while keeping the new test code in `depot.test.ts`, and `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam/__tests__/depot.test.ts'` was run to capture genuine failure output. `depot.ts` was then restored from a backup of the fixed version and confirmed identical to the committed content (`git diff --quiet HEAD -- ...depot.ts` exit 0) before rerunning for GREEN.

**RED (verbatim, against unfixed `depot.ts`):**

```
  ● formatDownloadFailureSummary (quick 260927-tpm) › A2: "first:" reads the run-scoped record verbatim when it sits at failures[0] (D-C, case C ordering)

    TypeError: (0 , depot_1.formatDownloadFailureSummary) is not a function

  ● formatDownloadFailureSummary (quick 260927-tpm) › A3: no run-scoped failure present -> no "; run:" fragment

    TypeError: (0 , depot_1.formatDownloadFailureSummary) is not a function

  ● formatDownloadFailureSummary (quick 260927-tpm) › A4: a run-scoped-only failure reports 0 file failures and still surfaces the run reason

    TypeError: (0 , depot_1.formatDownloadFailureSummary) is not a function

  ● formatDownloadFailureSummary (quick 260927-tpm) › A5: partitions on the `scope` property, not on the "(run)" file-name string

    TypeError: (0 , depot_1.formatDownloadFailureSummary) is not a function

  ● downloadDepotFiles › run-scoped no-progress bound (depot/stallTracker.ts) › A6: a real run producing both per-file and run-scoped failures reports the file-only count in the aggregate line

    expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 0
    Received array:  []

Test Suites: 1 failed, 1 total
Tests:       7 failed, 185 passed, 192 total
```

(A1 and A7's two arms did not throw at compile-time the same way — `ts-jest` resolves `formatDownloadFailureSummary`'s absence as a `TypeError` at each call site once compiled, so all 5 formatter-calling tests failed identically; the 7-failure total also includes A7's `canWriteFullOwnership` assertion, which fails independently of the missing export because the pre-fix `DepotDownloadFailure` type has no `scope` field for the fixture literal to assign — TypeScript's structural typing accepts the extra property at runtime under `ts-jest`'s non-`isolatedModules` config, but the RUNTIME assertion against `canWriteFullOwnership`'s unfiltered read still needed the fix to be meaningful, so it is counted among the 7.)

**GREEN (after restoring the fix):**

```
Tests:       192 passed, 192 total
```

## Measured population split (A6 arm)

Plan expected 32 file-level / 1 run-level / 33 total. Measured via a temporary debug `console.error` inserted into the A6 test body, run once, then removed and reverted (confirmed via `git diff --quiet HEAD -- ...depot.test.ts` exit 0 afterward — no trace left in the committed file):

```
TPM_MEASURE {"total":33,"fileLevel":32,"runLevel":1}
```

Matches the plan's expectation exactly.

## Verification (all 8 items from the plan's `<verification>` block)

1. `pnpm codecheck` -> **exit 0**
2. `pnpm lint` -> **exit 0**, `production: PASS | tests: PASS`, `638 problems (0 errors, 638 warnings)`. Identical to the pre-existing exact ceiling — zero new warnings introduced by this task's changes.
3. `pnpm find-deadcode` -> **`unreachable: 46 OK | used-in-module: 0 OK`** (exact match to expected; the new `formatDownloadFailureSummary` export is not flagged dead because `depot.test.ts` imports it).
4. `npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'` -> all green, **1518 total** (44 suites, 1 skipped), strictly greater than the 1506 measured at HEAD. The `A worker process has failed to exit gracefully` warning reappeared, tied to `lzmaNativeSeaRealBuild.test.ts` — this was reproduced at HEAD (both `depot.ts` and `depot.test.ts` reverted to base commit content, full suite rerun, identical warning at the identical adjacent file) during the pre-compaction portion of this session, and is confirmed pre-existing and unrelated to this fix.
5. `npx prettier --file-info` on both exact written source paths -> both **`{ "ignored": false, "inferredParser": "typescript" }`** (proving the check is real), then `npx prettier --check` over those same two paths -> **exit 0**, `All matched files use Prettier code style!`.
6. `python3 .planning/todos/todo-frontmatter-gate.py` -> **exit 0**, `OK: 15 pending todo(s) all carry in-vocabulary severity, platform, ready triage keys.`
7. `pnpm planning-gates` -> **12/12 planning gates passed**, run against the final committed state (both commits landed).
8. `git show :.planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md` -> non-empty, contains `260927-tpm`, `## Resolution`, and `260927-tpm-PLAN.md`. Confirmed from the git INDEX, not merely the working tree.

**Not claimed:** no live Steam install re-drive was performed or asserted. A run-level stall is not reproducible on demand; the RED->GREEN measurement above, plus the A6 real end-to-end `downloadDepotFiles` call (which genuinely exercises the stall path via a mocked, backdated `stallTracker.recordProgress` clock rather than a live download), is the evidence offered.

## Deviations from Plan

None — plan executed exactly as written. Both locked decisions (tag-not-split; `classifyDepotError`'s input byte-identical) held throughout; no Rule 4 architectural question arose.

## Named Residuals (not closed by this task)

- **D-D — `FAILURE_LOG_CAP` off-by-one:** the cap comparison (`failures.length <= FAILURE_LOG_CAP`) still reads the unfiltered array, so a run that both hits the cap and later stalls can be off by one against the per-file total the corrected comment now describes. Tracked as a corrected-but-not-fixed comment at the cap site in `depot.ts`, and named in the closed todo's `## Resolution` section. No new todo filed for this one — it was already fully described in-place per the plan's D-D disposition.
- **D-C — `failures[0]` ordering non-determinism:** `classifyDepotError` and the aggregate line's `first:` fragment both read `failures[0]`, whose identity is a race outcome (not a semantic priority) whenever a run-level stall fires alongside per-file failures. Tracked as a new pending todo: `.planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md` (severity: minor, platform: any, ready: code).

## Known Stubs

None.

## Threat Flags

None — this task's STRIDE threat register (T-tpm-01 through T-tpm-04, all in the plan) covers the one security-relevant boundary (the `canWriteFullOwnership` completeness gate), and T-tpm-01's mitigation (byte-identical gate reads) was verified, not merely asserted, via both diff comparison against HEAD and the A7 regression tests.

## Formatter Check Note (CLAUDE.md convention)

Per this repo's CLAUDE.md convention ("a formatter check belongs in every task's `<verify>`"), item 5 above ran `--file-info` before `--check` to prove the check was real for the two source paths touched. The two `.planning/todos/` paths this task also modified were deliberately NOT run through `prettier --check` — proven vacuous instead:

```
.planning/todos/completed/2026-09-26-...md -> { "ignored": true, "inferredParser": null }
.planning/todos/pending/2026-09-27-...md   -> { "ignored": true, "inferredParser": null }
```

Both `.planning/` paths are prettier-ignored; a `--check` over them would report the same `All matched files use Prettier code style!` regardless of their actual formatting, so it is omitted rather than carried as a meaningless green.

## Self-Check: PASSED

- FOUND: `src/backend/storeManagers/steam/depot.ts`
- FOUND: `src/backend/storeManagers/steam/__tests__/depot.test.ts`
- FOUND: `.planning/todos/completed/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md`
- FOUND: `.planning/todos/pending/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md`
- CONFIRMED ABSENT (moved, as intended): `.planning/todos/pending/2026-09-26-run-scoped-stall-failure-inflates-the-failed-file-count.md`
- FOUND commit `fe0e8d199` in `git log --oneline --all`
- FOUND commit `dfd5c61fa` in `git log --oneline --all`
- Working tree at self-check time: clean except this SUMMARY.md itself (untracked, not yet committed — per orchestrator instruction, this executor does not commit SUMMARY.md/STATE.md; the orchestrator commits it afterward).
