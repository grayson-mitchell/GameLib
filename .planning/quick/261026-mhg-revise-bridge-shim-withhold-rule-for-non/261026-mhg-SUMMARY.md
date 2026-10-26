# Quick 261026-mhg: revise bridge shim withhold rule for non-core interfaces - Summary

**Status:** Tasks 1-2 complete and committed. Task 3 (live operator relaunch) PENDING.

The shim withhold now triggers only on a delay-imported miss or a blocking interface gap (core startup family, or a version the shim would answer with NULL). Non-core null-object gaps are placed (placed-miss) and still named in the verdict, in both the static and runtime-loaded branches.

## Commits
- 10ff4d650: classifier `classifyUnservableInterfaceVersions` + `CORE_STARTUP_FAMILIES` in shimCoverage.ts (shared `isNullObjectEligible` helper; `findUnservableInterfaceVersions` behaviour unchanged)
- c300f9904: shimGenerate.ts wired in both branches, one logInfo line per placement with non-core gaps, module docblock amended

## Verification
- `npx jest src/backend/storeManagers/steam`: 69 suites, 2660 tests pass; existing withhold tests unedited.
- `npx tsc --noEmit -p .` clean; scoped prettier clean on all four files; 0 added drmWrapper lines.
- `graphify update .` run. `pnpm build:sidecar` run; build/main/sidecar.js mtime Oct 26 16:23:18 2026 (Task 2 commit 16:22:27), contains the mhg code.

## Deviations
- Tasks 1 and 2: tests and implementation were written in the same step per task. The Task 2 tests were run red (3 of 4 failed; the mixed core+non-core withhold test already passed by design) before implementing. Task 1 tests were not run red separately.

## Task 3 per-title table (PENDING operator relaunch)

| Title | AppId | placed/withheld | HELLO | duration | strict verified |
|---|---|---|---|---|---|
| ELEX | 411300 | pending | pending | pending | pending |
| Mining Mechs | 1603180 | pending | pending | pending | pending |
| Overlooting | 3410180 | pending | pending | pending | pending |
| The Age of Decadence | 230070 | pending | pending | pending | pending |
| Grim Dawn | 219990 | pending | pending | pending | pending |

## Known Stubs
None.
