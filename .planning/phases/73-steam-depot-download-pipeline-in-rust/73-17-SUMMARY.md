---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 17
subsystem: steam-depot
tags: [steam-depot, rust, pipeline-flag, uat, live-gate]
requires: [73-16]
provides:
  - "DEPOT_PIPELINE_DEFAULT = 'rust' (D-16); GAMELIB_DEPOT_PIPELINE=ts still selects the TS fallback"
  - "73-UAT.md: the 9-item live-gate contract that plan 73-18 runs (D-15)"
affects: [73-18]
tech-stack:
  added: []
  patterns:
    - "Suites that exercise the TS depot path pin GAMELIB_DEPOT_PIPELINE=ts at module top, so they don't depend on the default"
key-files:
  created:
    - .planning/phases/73-steam-depot-download-pipeline-in-rust/73-UAT.md
  modified:
    - src/backend/storeManagers/steam/depotRust/pipelineFlag.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/depotPipelineFlag.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.finalize.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
key-decisions:
  - "Depot pipeline default flipped to rust on the operator-approved 73-PARITY; sweep exit 1 (Steam's own ACF rewrite after adoption) accepted as the explained deviation the operator approved"
  - "73-UAT puts each item's precondition after result:, because the installed UAT parser needs expected: on the line right after the ### heading"
requirements-completed: [P73-D, D-15, D-16]
duration: 15min
completed: 2026-11-09
---

# Phase 73 Plan 17: Flip the default to rust, author the live-gate UAT Summary

The depot pipeline now defaults to Rust (`GAMELIB_DEPOT_PIPELINE=ts` still selects the TS fallback). `73-UAT.md` has 9 well-formed live-gate items. Each one names the `[depot-rust] outcome` or `[shell] depot jobs cancelled on sidecar EOF:` line that proves the Rust path ran.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 RED | e454ac378 | Flag tests expect `rust` for unset, empty and invalid values. 3 failed against the `ts` default. |
| 1 GREEN | d08817681 | `DEPOT_PIPELINE_DEFAULT: 'rust' \| 'ts' = 'rust'`, with a comment citing 73-PARITY.md and 2026-11-09. Six TS-path suites now pin `ts`. |
| 2 | ce22517c2 | 73-UAT.md: 9 items covering install, pause/resume, cancel, sidecar restart, bridge install, shared redist, verify_only startup resume, select_files DLL restore and the Force Quit orphan check |

## Verification

- `pnpm exec jest src/backend/storeManagers/steam`: 141 suites passed, 1 failed, 4442 tests passed, 1 failed. The one failure is the pre-existing `macArchKnownFixRouting` "Intel: never seeds..." case.
- `pnpm exec tsc --noEmit -p .`: exit 0. `pnpm build:sidecar`: exit 0. `pnpm smoke:sidecar`: PASS.
- `npx prettier --check` on all 8 touched source and test paths: clean. ESLint on the same paths: 0 errors (the warnings were already there).
- `grep -c "DEPOT_PIPELINE_DEFAULT: 'rust' | 'ts' = 'rust'"` == 1.
- 73-UAT.md: 9 `### N.` headings, 9 `expected:` lines, 9 `result: pending` lines. `depot-rust] outcome` appears 9 times and `depot jobs cancelled on sidecar EOF` once. The installed parser's item regex matches all 9.
- 73-UAT.md has no prettier check because `npx prettier --file-info` reports `ignored: true` (`.planning` is prettier-ignored).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS-path suites depended on the old default**
- **Found during:** Task 1
- **Issue:** After the flip, 6 suites (depot, depot.finalize, depot.prescreen, depot.selectedFiles, depot.sharedRedist, library) failed with 68 tests in total. They test the TS pipeline but never set the env, so they now routed into the Rust path.
- **Fix:** Each suite sets `process.env.GAMELIB_DEPOT_PIPELINE = 'ts'` at module top, with a comment. The plan's action already expected this ("they set the env explicitly where they test the TS path").
- **Commit:** d08817681

**2. [Precondition wording] Parity exit code**
- The plan's precondition asks for sweep exit code 0 plus approval. 73-PARITY.md records exit code 1 as an explained deviation: the ACF counter fields are Steam's own rewrite after adoption. The operator gave an explicit APPROVED verdict. The flip went ahead on that approval, as the 73-16 handoff instructed.

**3. [UAT shape] Precondition line placement**
- The plan asks each item to state its precondition. The installed parser (`~/.claude/get-shit-done/bin/lib/uat.cjs`) needs `expected:` on the line right after the heading, so each `precondition:` line comes after `result:`. Inline `expected:` and a bare `result: pending` are kept as the house shape requires.

## Known gaps (carried from 73-PARITY, not blockers)

- The cross-depot path collision path was not exercised live (covered by Tier 1 fixtures). XCOM: Enemy Unknown (200510) is the candidate for a future check.
- Peak RSS was not sampled, so the D-17 memory criterion has no live evidence.

Both are recorded in 73-UAT.md's "Known gaps" section.

## Notes for plan 73-18

The UAT ground rules carry the live-run gotchas:
- `pnpm tauri:dev`, with `pnpm build:sidecar` first.
- `pgrep -fl sidecar.js` after every Ctrl-C (todo `2026-11-09-sidecar-orphaned-after-tauri-dev-ctrl-c.md`).
- For redist and DLL-restore steps, press Refresh, then act within 60 s (`AUTH_SESSION_IDLE_GRACE_MS`).
- Use Amnesia (57300) for shared redists, not Schedule I.
- Exclude the six Phase 74 fixtures, and check known-fix pre-emption for each title.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: 73-UAT.md, pipelineFlag.ts (flipped), 73-17-SUMMARY.md
- FOUND commits: e454ac378, d08817681, ce22517c2

## TDD Gate Compliance

RED `test(73-17)` e454ac378 comes before GREEN `feat(73-17)` d08817681. No refactor was needed.
