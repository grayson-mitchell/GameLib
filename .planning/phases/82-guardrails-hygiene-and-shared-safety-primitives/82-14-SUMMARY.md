---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 14
subsystem: planning-docs
tags: [inventory, state-ownership, utils, bootstrap, port-planning]
status: complete

requires:
  - phase: 82-guardrails-hygiene-and-shared-safety-primitives
    provides: "82-01 pinned steam_direct_launch_verdict as cache in EXPECTED_KINDS and the store fixture; 82-02 gates"
provides:
  - "82-UTILS-BOOTSTRAP-INVENTORY.md: 51 utils.ts export rows and 64 bootstrap.ts boot-step rows keyed by name, each with destination slice and DI-wiring-or-behaviour flag"
  - "82-STATE-OWNERSHIP.md: 55 persisted-store rows, 8 out-of-registry persisted-state rows and 48 in-memory owner rows with a per-slice owner for Phases 83-99, plus the sequencing rule and five named roadmap risks"
affects: [83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 82-11]

actuals:
  tokens: 15664
  tasks: 2
  commits: 2
plan_head_before: 3b9883633d056c29a6b9b286792bb53ad045ffc4
plan_head_after: e3e7259aa48cff384b0901dd6ec6e58b20f0699c

tech-stack:
  added: []
  patterns:
    - "Importer counts from resolved imports (relative and backend/ paths, dynamic imports added), not word-match grep, which over-counts IPC channel names"
    - "Ownership table cells hold one token per slice; the flip cell carries a trailing star; a row with a second star would be a double move"

key-files:
  created:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
  modified: []

key-decisions:
  - "Every registry store flips to the Rust StoreHost at 85, not per subsystem, because 85 deletes the TS store versioning engine (ARCHITECTURE 2.5 item 3 predates the roadmap and conflicts)"
  - "uploadedLogs flips at 84 (Phase 84 carries the minimal StoreHost core for it) so the table has zero double moves; the alternative is a second move at 85"
  - "Dead utils.ts exports recorded as delete, not port: createNecessaryFolders, parseSize, quoteIfNecessary, semverGt (test-only), constructAndUpdateRPC (Discord)"

requirements-completed: [FND-01]

coverage:
  - id: D1
    description: "utils.ts and bootstrap.ts responsibility inventory complete against the live exports and boot steps"
    requirement: FND-01
    verification:
      - kind: other
        ref: "plan 82-14 task 1 <verify> loop over the export block and every boot step name (prints nothing, exit 0)"
        status: pass
    human_judgment: true
    rationale: "Completeness is machine-checked, but the destination slice and DI-wiring-or-behaviour flag per row are design judgements no test asserts"
  - id: D2
    description: "State-ownership table complete against the registered stores, with one owner per slice boundary and a sequencing rule"
    requirement: FND-01
    verification:
      - kind: other
        ref: "plan 82-14 task 2 <verify> loop over registeredStores.json names plus steam_direct_launch_verdict and the three headings (prints nothing, exit 0)"
        status: pass
    human_judgment: true
    rationale: "Owner-per-slice cells and the five roadmap risks are planning judgements about slices that do not exist yet"

duration: 40min
completed: 2026-11-20
---

# Phase 82 Plan 14: Utils/bootstrap inventory and state-ownership table Summary

**Two phase docs for ports 83-99: a name-keyed responsibility inventory of all 51 utils.ts exports and 64 boot steps with destination slices, and a state-ownership table of 55 persisted stores and 48 in-memory owners with one flip per row and one conditional double-move risk (`uploadedLogs`) named for the operator.**

## Performance

- **Duration:** about 40 min
- **Started:** 2026-11-20T08:15:00Z (approx)
- **Completed:** 2026-11-20T08:56:00Z
- **Tasks:** 2
- **Files modified:** 2 created, no source, test or baseline file touched

## Accomplishments

- `82-UTILS-BOOTSTRAP-INVENTORY.md`: every `export {}` name, every inline `export`, and the two `testingExportsUtils` members have exactly one row (symbol, definition line, responsibility group, resolved importer count prod/test, destination slice, DI-wiring-or-behaviour, notes); every one of the 64 boot-step `name:` values has exactly one row in boot order (what it builds, state it owns, ordering constraint, destination, notes). The `CI=e2e` surface is described as current state with 82-10, 82-15 and 82-16 marked as planned.
- `82-STATE-OWNERSHIP.md`: all 55 `EXPECTED_KINDS` stores (and every fixture file name) have a row with kind, on-disk path, owner at each of Phases 83-99, TS-mirror deletion slice, sync-read consumers and versioning notes; plus out-of-registry persisted state, in-memory owners, the sequencing rule, assumptions A1 and A2 and risks R1-R5.
- The tracer gate ran: the task 1 verify loop was re-run after the final edit and printed nothing before task 2 started.

## Task Commits

1. **Task 1: utils.ts/bootstrap.ts inventory (tracer)** - `62e09085b` (docs)
2. **Task 2: state-ownership table** - `e3e7259aa` (docs)

**Plan metadata:** committed separately (docs: complete plan)

## Files Created/Modified

- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-UTILS-BOOTSTRAP-INVENTORY.md` - 51 export rows, 64 boot-step rows
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` - persisted, in-memory and sequencing sections

## Decisions Made

- All registry stores flip to `RH` at 85 in one slice (A1). The roadmap's 85 criteria delete `storeVersioning`, `storeMigrations` and `migration/*`, so a store left on the sidecar would have no TS versioning engine. ARCHITECTURE 2.5 item 3 (per-subsystem flip, config last) conflicts and is recorded as superseded.
- `uploadedLogs` flips at 84, which requires Phase 84 to carry the minimal StoreHost core; otherwise it moves twice. Named as risk R1 for the operator.
- Importer counts use resolved imports. A word-match grep put `clearCache`, `resetHeroic` and `showItemInFolder` at 5-8 files each, mostly IPC channel names.
- Dead or test-only utils exports are marked "delete": `createNecessaryFolders`, `parseSize`, `quoteIfNecessary`, `semverGt`, `testingExportsUtils`; `getLatestReleases` already returns an empty list and is noted as a delete candidate rather than a port.

## Deviations from Plan

None - plan executed exactly as written.

The doc facts were taken from HEAD at execution time, as the orchestrator asked, not from the research: 82-04 did not delete `fileStore.ts` and 82-13 did not delete `proxy-types.ts`, and neither file appears as a row because neither is an export of `utils.ts` or a boot step; the ownership table still lists the TS store classes as `SC` mirrors through 99 for that reason. `82-05`'s `safety/` modules and `82-06`'s refusal notice have no row: they hold no persisted store and no in-memory owner in `EXPECTED_KINDS` or a boot step. `resetHeroic` is annotated as guarded by gamelib-safety in plan 82-07 per the plan, although 82-07 has not run at this sha (the function still calls `rmSync` directly).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** none.

## Issues Encountered

- A first draft of both docs backticked some names outside their first column (a duplicate-count hazard for a later gate); stripped before the first commit, verified with a `uniq -c` pass over backticked tokens.
- `rust-spawned-children` first carried a flip marker at 83; corrected to a no-flip row. Two in-memory rows (`steam-bridge-runtime:redist-install`, `app-runtime:launch-single-flight`) had the wrong flip column and were corrected before commit. A script now checks every row for one flip, a flip cell equal to the first changed cell, and the column count.
- HEAD advanced by one docs commit from another session (`3b9883633`, phase 83 research) between the measurement and the first commit; it touched none of the measured sources (checked with `git diff --stat`).

## Known Stubs

None. Both docs are complete against their sources.

## Threat Flags

None. No source, endpoint, auth path or schema changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 82-11 refreshes the "line (at sha)" columns at the proof head and re-runs both verify loops.
- Plans 82-07, 82-10, 82-15 and 82-16 change utils.ts and bootstrap.ts; rows describe the pre-change state and flag the planned edits.
- Operator decisions pending: R1 (`uploadedLogs` 84 vs 85) and A1 (all stores flip at 85).

---
*Phase: 82-guardrails-hygiene-and-shared-safety-primitives*
*Completed: 2026-11-20*

## Self-Check: PASSED

- FOUND: 82-UTILS-BOOTSTRAP-INVENTORY.md and 82-STATE-OWNERSHIP.md on disk
- FOUND: commits `62e09085b` and `e3e7259aa` reachable from HEAD
- Acceptance: each required heading appears exactly once in its doc; both verify loops print nothing
