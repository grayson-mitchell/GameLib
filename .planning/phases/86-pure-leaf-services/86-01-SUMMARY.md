---
phase: 86-pure-leaf-services
plan: 01
subsystem: planning
tags: [store-host, host-api-reconciliation, state-ownership, d-29, d-04, d-27]

requires:
  - phase: 85-store-host-config-and-versioned-migrations
    provides: the shipped StoreHost, store_boot, NativeCtx, EXTRA_ROWS and the jest disk sink that 86's slice plans build on
provides:
  - "'## Host API re-read (D-29)' in 86-VALIDATION.md: 13 statused rows plus the D-01 scope check, the symbol-name reference every later 86 plan reads"
  - "82-STATE-OWNERSHIP.md '## Amendments' entry: umu 87 to 86, macArchStore 86 to 89, runsForMeStore 86 to 96"
  - "operator go-ahead to start Phase 86 slice work on the shipped host, with rows 5 and 7 carried as preconditions"
affects: [86-02, 86-03, 86-08, 86-09, 86-10, 86-11, 86-17, 86-24]

actuals:
  tokens: 9000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A delete plan adds the store's EXTRA_ROWS entry (keeping tsNames) in the same commit that removes the TS registration, and regenerates storeTable.json byte-identical"
    - "A Rust op that writes a key a TS whole-key writer still reaches stays unreachable from callers until the TS writer is a forwarding shim"

key-files:
  created: []
  modified:
    - .planning/phases/86-pure-leaf-services/86-VALIDATION.md
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md
    - src/backend/__tests__/storeMirrorSchedule.test.ts

key-decisions:
  - "Operator approved starting Phase 86 slice work on the host API recorded in the D-29 table (Task 3, checkpoint:decision, blocking-human)"
  - "Row 5 accepted as stated: EXTRA_ROWS must be added by each delete plan (86-11, 86-17, 86-24) in the same commit as the TS registration deletion, keeping tsNames"
  - "Row 7 accepted as stated: Rust ops for games.recent and overrides stay unreachable from callers until 86-09 and 86-11 convert the TS writers to forwarding shims; this is a precondition for 86-08 and 86-10"

patterns-established:
  - "D-29 reconciliation table: every host symbol an 86 plan assumes is a statused row with a shipped file:line, so a later plan cites the table instead of re-deriving names"

requirements-completed: []

plan_head_before: 8805d74cdee363f3119e7967c3fc8844ea8d5282
plan_head_after: e3b769703205e74b14118c4ad332a719cd846f6b

duration: 24min
completed: 2026-11-22
status: complete
---

# Phase 86 Plan 01: Host API re-read and ownership amendment Summary

**Phase 86 starts on the shipped Phase 85 store host: all 13 assumed symbols and mechanisms are located (none MISSING), the 82 ownership table agrees with 86's scope, and the operator approved with two carried preconditions.**

## Performance

- **Duration:** about 24 min (across a checkpoint)
- **Completed:** 2026-11-22
- **Tasks:** 3 of 3 (1 tracer, 1 auto, 1 decision checkpoint)
- **Files modified:** 3

## Accomplishments

- Re-read the shipped host at HEAD `8805d74cd` and recorded a 13-row reconciliation table with the HEAD sha and a D-01 scope check. No row is MISSING and 85-19 to 85-25 all have SUMMARYs, so no 86 edit can overlap a running 85 plan. Two rows differ in wording from the 86 plans and need no revision: row 1 (open is split into `open_cache`, `open_row` and `open_doc`) and row 6 (85-21 deleted `storeOwnership.json`; ownership is now the table `family`).
- Amended `82-STATE-OWNERSHIP.md` with a dated `## Amendments` entry: `umu` 87 to 86 (D-04), `macArchStore` 86 to 89 and `runsForMeStore` 86 to 96 (D-27). No owner token changed, so the Sequencing rule still holds.
- Recorded the operator's decision to start slice work (below).

## Task Commits

1. **Task 1 (tracer): re-read the shipped host and record the reconciliation table** - `625819ffb` (docs)
2. **Task 2: amend 82-STATE-OWNERSHIP.md for umu, macArchStore and runsForMeStore** - `db9197b62` (docs)
3. **Task 3: operator decision** - no commit (checkpoint:decision; the decision is recorded here)

**Plan metadata:** the SUMMARY commit and the final docs commit follow this file.

## Task 3 Decision Record

- **Checkpoint:** `checkpoint:decision`, `gate="blocking-human"` (never auto-approved).
- **Operator choice:** `approve` (genuine human input, relayed by the orchestrator).
- **Blocking row:** none. No row is MISSING.
- **Meaning:** start Phase 86 slice work on the host API recorded in the D-29 table, accepting rows 5 and 7 as stated:
  - **Row 5 (EXTRA_ROWS):** each delete plan (86-11, 86-17, 86-24) adds the store's `EXTRA_ROWS` entry in `meta/genStoreTable.ts`, keeping its `tsNames`, in the same commit that deletes the TS registration, and regenerates `storeTable.json` with the row unchanged (`git diff --quiet src/common/types/ipc/storeTable.json`).
  - **Row 7 (Rust writes vs TS mirror):** the Rust ops for `games.recent` and `overrides` stay unreachable from callers until 86-09 and 86-11 convert the TS writers (`recent_games.ts:23`, `game_overrides/index.ts:103`) to forwarding shims in the same change that routes callers to them. This is a precondition for 86-08 and 86-10.
- **Carried also (not a decision, from the table):** 86-08 Task 3 swaps the tray seed read in `tray/recent.rs` for `store_boot::host()`, called after `open_all` as it already is.

## Files Created/Modified

- `.planning/phases/86-pure-leaf-services/86-VALIDATION.md` - the `## Host API re-read (D-29)` table, `### Scope check (D-01)` and `### Result and carried preconditions`.
- `.planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-STATE-OWNERSHIP.md` - the three mirror-deletion cells and the `## Amendments` entry.
- `src/backend/__tests__/storeMirrorSchedule.test.ts` - its `SCHEDULE` record moved with the table (see Deviations).

## Decisions Made

The three `key-decisions` above. The operator chose `approve` over `wait-for-85` (moot, since all of 85-19 to 85-25 are complete) and `revise` (no MISSING row to revise for).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] storeMirrorSchedule.test.ts edited outside files_modified**
- **Found during:** Task 2 (amend the 82 ownership table)
- **Issue:** `src/backend/__tests__/storeMirrorSchedule.test.ts` keeps a `SCHEDULE` record that must equal the 82 table's mirror-deletion cells. Changing the table alone would have left the test red.
- **Fix:** moved `macArchStore` 86 to 89, `runsForMeStore` 86 to 96 and `umu` 87 to 86 in `SCHEDULE`, matching the table. Nothing else in the file changed (3 lines).
- **Files modified:** `src/backend/__tests__/storeMirrorSchedule.test.ts`
- **Commit:** `db9197b62`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** the test and the table stay equal; no behavior change.

## Issues Encountered

- **Interleaved commits in the ledger range.** The persisted ledger base (`8805d74cd`) to HEAD spans 19 commits, because Phase 85 review-fix commits (`fix(85): B-WR-0x`, `C-WR-0x`) from another session landed on `main` between this plan's commits. Only 2 are this plan's (`git log 8805d74cd..HEAD | grep -c "(86-01)"`), so `actuals.commits` is 2, the count of plan-scoped commits, not the raw range count. `/gsd-verify-work`'s same-instrument check over the raw range will read 19; this is expected, not a missing commit.
- A dirty working tree from an unrelated GOG-offline debug session (`cache.ts`, `handlers.ts`, `gog/library.ts` and others) was left untouched.

## Known Stubs

None. This plan edits planning records and one test constant.

## Threat Flags

None. No network endpoints, auth paths, file access or schema changes introduced. T-86-01 (tampering with the D-29 table) is mitigated: every row carries a shipped file:line, the verify gate refused blanks and TBD, and the operator approved the table before any slice plan.

## Self-Check: PASSED

- `625819ffb` and `db9197b62` are ancestors of HEAD.
- `86-VALIDATION.md` contains `## Host API re-read (D-29)` with 13 statused rows; `82-STATE-OWNERSHIP.md` contains `## Amendments`.
