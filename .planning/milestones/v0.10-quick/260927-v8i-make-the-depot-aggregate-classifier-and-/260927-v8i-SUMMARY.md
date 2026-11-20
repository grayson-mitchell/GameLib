---
phase: quick-260927-v8i
plan: 01
subsystem: steam-depot
tags: [steam, depot, error-classification, determinism, jest]

requires:
  - phase: quick-260927-tpm
    provides: "`scope: 'run'` marker on run-level DepotDownloadFailure records, and the aggregate log's file-count partition"
provides:
  - "`selectPrimaryDepotFailure(failures)` — one exported, deterministic tie-break between a run-level stall record and a per-file failure, feeding BOTH the classifier and the `first:` log fragment"
affects: [steam-depot, depot-error-classification]

actuals:
  tokens: 6262
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Single shared selection helper feeding two independent call sites, structurally pinned by a comment-stripped-source regex count (not just behavioural tests)"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - .planning/todos/completed/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md

key-decisions:
  - "D-01: prefer the run-level record deterministically (`failures.find(f => f.scope === 'run') ?? failures[0]`) over the raw `failures[0]` race — shipped, not just proposed"
  - "D-02: tier-1 (non-retryable file-level cause preference) dropped on a measured reachability negative — both `.eresult`-stamping sites live inside `buildDepotPlan` and never reach the `failures` array — so no tier-1 mechanism or test ships"
  - "D-03: ONE shared helper feeds both consumers (the `first:` log fragment and the classifier argument), pinned structurally as well as behaviourally so the two cannot silently diverge again"

requirements-completed: [QUICK-260927-V8I]

coverage:
  - id: D1
    description: "selectPrimaryDepotFailure exported and deterministically prefers the run-level record over an earlier file-level failure (ordering A)"
    requirement: "QUICK-260927-V8I"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#B1: ordering A (file first, run second) selects the run-level record, deterministically"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#A2: \"first:\" now prefers the run-scoped record over an earlier file failure (D-01 supersedes D-C, case A ordering)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Orderings B and C (run-level record already first, or run-level-only) are unchanged from pre-fix behaviour"
    requirement: "QUICK-260927-V8I"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#B2: ordering B (run first, file second) — already deterministic today, unchanged by the fix"
        status: pass
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#B3: ordering C (run-level only) — unchanged from today"
        status: pass
    human_judgment: false
  - id: D3
    description: "With no run-level record, the tier-2 fallback is index 0 specifically (not any file failure)"
    requirement: "QUICK-260927-V8I"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#B4: no run-level record — the tier-2 fallback is index 0 specifically, not \"any file failure\""
        status: pass
    human_judgment: false
  - id: D4
    description: "The classifier input and the first: fragment are structurally provable to derive from ONE shared call — a raw result.failures[0] read no longer exists in source"
    requirement: "QUICK-260927-V8I"
    verification:
      - kind: unit
        ref: "src/backend/storeManagers/steam/__tests__/depot.test.ts#B6 structural source-shape test (stripSourceComments regex counts)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Sibling todo closed with a resolution note naming the quick task, commits, the shipped two-tier structure, the tier-1 reachability measurement, and the ungated future-eresult residual"
    verification: []
    human_judgment: true
    rationale: "Resolution note quality/completeness against the todo's own open questions is a prose judgment call, not something a test can score."

duration: 55min
completed: 2026-09-27
status: complete
---

# Quick Task 260927-v8i: Deterministic depot failure selection Summary

**Replaced two independent racy `failures[0]` reads with one exported `selectPrimaryDepotFailure` helper that deterministically prefers a run-level stall record over an earlier per-file failure, feeding both the aggregate log's `first:` fragment and `classifyDepotError`.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-09-27T09:03:00Z (approx, base commit `07dbc382b`)
- **Completed:** 2026-09-27T09:58:48Z
- **Tasks:** 3/3
- **Files modified:** 3 (`depot.ts`, `depot.test.ts`, the moved/resolved todo)

## Accomplishments

- Exported `selectPrimaryDepotFailure(failures): DepotDownloadFailure` in `depot.ts`, implementing exactly the two-tier rule from D-01 (`failures.find(f => f.scope === 'run') ?? failures[0]`) — no third tier, per D-02's measured reachability negative.
- Rewired BOTH consumers to the one helper: `formatDownloadFailureSummary`'s `first:` fragment and `downloadSteamDepots`' error-path `classifyDepotError` argument. Structurally pinned by a comment-stripped-source regex count: `\bfailures\[0\]` drops from 3 to 1 (the helper's own fallback line), `result\.failures\[0\]` drops from 2 to 0.
- Added a full ordering/consistency test matrix (B1–B6) plus rewrote the one pre-existing test (A2 case A) whose asserted output the fix deliberately changes.
- Closed the sibling todo (`2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md`) with a resolution note naming the quick task, both implementing commits, the shipped two-tier structure, the tier-1 reachability measurement, the priced user-facing change, and the ungated future-`.eresult` residual.

## RED -> GREEN (TDD)

Both new consumer-facing arms (B1, B2) were run against unmodified source before the helper existed and failed with `TypeError: (0, depot_1.selectPrimaryDepotFailure) is not a function` — the correct RED signal, since the export did not exist yet. After Task 1 implemented the helper and rewired both consumers, B1/B2 passed (GREEN), and separately the pre-existing A2 case-A arm went RED against the same source change (`Expected substring: "first: file=\"a.bin\""`, `Received string: ...first: file=\"(run)\" ...`) — this is the plan's documented deliberate user-facing change, not a regression. It was fixed in Task 2 by rewriting the arm in place (rename, inverted assertion, updated rationale comment), after which it passed.

## Task Commits

Each task was committed atomically:

1. **Task 1: add the deterministic selection helper, rewire both consumers** - `2b9290bc9` (feat)
2. **Task 2: complete the ordering matrix, rewrite the superseded A2 arm** - `d8ea86321` (test)
3. **Task 3: full gate battery, close the todo** - `7e1027a33` (docs)

**Plan metadata:** `07dbc382b` (docs: plan the deterministic depot failure-record selection — predates this SUMMARY's execution)

## Files Created/Modified

- `src/backend/storeManagers/steam/depot.ts` - Added exported `selectPrimaryDepotFailure`; rewired `formatDownloadFailureSummary`'s `first:` fragment and `downloadSteamDepots`'s classifier call to the shared helper; corrected the three now-false in-situ comments.
- `src/backend/storeManagers/steam/__tests__/depot.test.ts` - Imported the helper; added the B1–B6 test block (ordering matrix, mutual-consistency table, non-vacuity, structural source-shape count); rewrote the A2 case-A arm.
- `.planning/todos/completed/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md` - Moved from `pending/`; appended `## Resolution` naming this quick task, both implementing commits, the shipped two-tier structure, the D-02 reachability measurement, the priced ordering-A change, and the ungated future-`.eresult` residual.

## Decisions Made

- D-01 (prefer run-level record deterministically) shipped as written in the plan — no alternate shape considered during execution.
- D-02 (tier-1 dropped) confirmed by re-deriving the same reachability measurement the plan cited: both `.eresult`-stamping sites (`depot.ts:610-612` in `wrapDepotKeyError`, and `depot.ts:897`) sit inside `buildDepotPlan`, whose throws are caught by `downloadSteamDepots`'s own outer catch and never enter the `failures` array — so no code and no test exist for an unreachable case.
- D-03 (one shared helper) verified structurally, not just behaviourally, via the B6 comment-stripped-source regex counts (1 and 0 against the plan's stated post-fix baseline).
- Resolution-note commit citation: cited both `2b9290bc9` (the helper + rewires) and `d8ea86321` (the completed test matrix + A2 rewrite) rather than a single hash, since the fix landed across two commits and the sibling precedent note's single-hash convention did not fit a two-commit change cleanly.

## Deviations from Plan

None - plan executed exactly as written. The A2 case-A test going RED and being rewritten was the plan's own documented, priced, deliberate change (not a deviation), and is recorded above under RED -> GREEN.

## Gate Results (measured, not narrated)

- `npx prettier --file-info` on both touched TypeScript source paths: `{"ignored": false, ...}` for both, confirming the `--check` that followed is not vacuous. The two touched planning `.md` paths (pending/completed todo) are prettier-ignored (`{"ignored": true, "inferredParser": null}`) — their `--check` was correctly omitted, not silently skipped.
- `npx prettier --check` on `depot.ts` and `depot.test.ts`: clean (after one `--write` pass mid-Task-1 and one mid-Task-2 to fix formatting introduced by the new test block).
- `pnpm codecheck`: clean, no output.
- `pnpm lint`: exit 0, "638 problems (0 errors, 638 warnings)", production PASS / tests PASS — the frozen `TESTS_CEILING = 638` was met exactly, zero new warnings introduced.
- `pnpm find-deadcode`: "unreachable: 46 OK | used-in-module: 0 OK" — the new `selectPrimaryDepotFailure` export is consumed by the test file's import, so the frozen gate stayed green.
- Steam suite (`npx jest --selectProjects Backend --testPathPattern 'storeManagers/steam'`): 44/44 suites passed; 1528 tests total (1527 passed, 1 skipped) — strictly greater than the caller-provided baseline of 1518, an exact delta of +10 (B1–B4 = 4, B5 table x4 + non-vacuity x1 = 5, B6 = 1; the A2 rewrite is a change to an existing test, not a net add).
- `pnpm planning-gates`: 12/12 passed, run AFTER the todo move was staged.
- Post-commit deletion check on the Task 3 commit: `git diff --diff-filter=D --name-only HEAD~1 HEAD` returned nothing — no unexpected deletions (the todo file rename is tracked as a rename, not a delete+add).

## Issues Encountered

None beyond the expected RED signals documented above.

## Next Phase Readiness

The depot download error path now has a single, deterministic, structurally-pinned selection point. The ungated residual named in both `depot.ts`'s doc comment and the closed todo's resolution note — a future `.eresult` stamp on a per-file throw (`downloadSingleFile` or `healReconciledFileModes`) could mask a permanent cause behind this helper's retryable-looking stalled classification — is not tracked by a new todo; it is recorded in-line at the two places a future reader of this code would look. No blockers for further steam-depot work.

## Self-Check: PASSED

- FOUND: `.planning/quick/260927-v8i-make-the-depot-aggregate-classifier-and-/260927-v8i-SUMMARY.md`
- FOUND: `.planning/todos/completed/2026-09-27-the-depot-aggregate-classifier-reads-a-non-deterministic-failures-0.md`
- CONFIRMED: pending todo no longer exists at its old path
- FOUND commits: `2b9290bc9`, `d8ea86321`, `7e1027a33`

---
*Phase: quick-260927-v8i*
*Completed: 2026-09-27*
