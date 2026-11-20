---
phase: 62-module-boundaries-and-decomposition
plan: 15
subsystem: backend
tags: [capabilities, downloadmanager, boundaries, ratchet]
requires: [62-13, 62-14]
provides:
  - downloadmanager/, gamedetails/dispatch.ts, tools/, save_sync.ts, utils/uninstaller.ts, utils/macArch.ts and utils.ts errorHandler free of runner literals
affects: [62-16]
key-files:
  modified:
    - src/backend/downloadmanager/utils.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/downloadmanager/ipc_handler.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/tools/index.ts
    - src/backend/tools/ipc_handler.ts
    - src/backend/save_sync.ts
    - src/backend/utils/uninstaller.ts
    - src/backend/utils/macArch.ts
    - src/backend/utils.ts
    - meta/boundaryRatchet.cjs
key-decisions:
  - "installDlcs: ipc_handler.ts:28 tests exactly legendary (kept as isStore(.., 'legendary')); utils.ts:201 tests every non-steam runner (legendary, gog, nile, sideload), converted to !installManagedExternally, which is false only for steam, so the runner set is identical. No new flag."
  - "dispatch.ts log-prefix ternary kept as isStore ternary (not a Record) because its fallback is Gog for every non-legendary runner, including nile/sideload/steam"
  - "save_sync switch became a Record<Runner, thunk> map (exhaustive, lazy)"
requirements-completed: [D-01, D-02, D-04, D-14]
completed: 2026-11-07
---

# Phase 62 Plan 15: downloadmanager / details / tools conversions Summary

**All 27 classification rows converted: BACKEND_CEILING 51 to 24 in two commits (20 then 7), no test assertion changed.**

## Tasks
1. downloadmanager/ + gamedetails/dispatch.ts, 51 -> 31: `52679c134`
2. tools/, save_sync.ts, uninstaller.ts, macArch.ts, utils.ts, 31 -> 24: `66ba05666`

## Notes
- The classification row for `src/backend/utils.ts:381` (errorHandler display name) belonged to 62-15 but the plan's files list omitted it; converted in task 2 with `isStore`.
- `hasCapability` used only for `removedRunner` (possibly undefined); other sites index `storeCapabilities[runner]` since the runner is statically `Runner`.
- Rationale comments (D-06/D-07, GAME-02/03, WR-02/D-11, 261026-avw) left in place.

## Deviations from Plan
None beyond the utils.ts addition above.

## Cleanup candidates (not done, C10)
- Comments at utils.ts ~336 still say "gated to `runner === 'steam'`"; prose only.
- The DLC warning and the legendary-only DLC fan-out disagree for gog; legacy behaviour preserved.

## Verification
codecheck, lint, boundaries (24/24, depcruise `[]`), find-deadcode, prettier, build:sidecar-sea + smoke:sidecar pass. Full jest: exactly the 6 baseline failures.

## Self-Check: PASSED
