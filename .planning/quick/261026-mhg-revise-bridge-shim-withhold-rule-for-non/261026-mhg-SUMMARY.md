# Quick 261026-mhg: revise bridge shim withhold rule for non-core interfaces - Summary

**Status:** complete. Live relaunch 2026-10-26 16:32-16:36: all five titles now get the shim placed and HELLO-attach; the four non-DRM titles launched fine (operator); Grim Dawn still fails on the known SteamStub launch-check limitation, now on a consistent forwarder route.

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

## Task 3 per-title table (live relaunch, 2026-10-26)

| Title | AppId | placed/withheld | HELLO | duration | strict verified |
|---|---|---|---|---|---|
| ELEX | 411300 | placed (non-core: SteamController003, STEAMUGC008) | 16:32:53 | 53s (ran 2s when withheld) | HELLO; game Steam-init log not checked, so unverified under the strict rule; operator: launched fine |
| Mining Mechs | 1603180 | placed (non-core: STEAMTIMELINE004) | 16:34:03 | 11s | HELLO; unverified (game log not checked); operator: launched fine |
| Overlooting | 3410180 | placed (non-core: REMOTEPLAY003, TIMELINE004, UGC021) | 16:34:39 | 11s | HELLO; unverified (game log not checked); operator: launched fine |
| The Age of Decadence | 230070 | placed (non-core: SteamController003, STEAMUGC008) | 16:35:02 | 17s | HELLO; no game log exists, so unverified at best; operator: launched fine |
| Grim Dawn | 219990 | placed (non-core: REMOTEPLAY004, TIMELINE...) + steamstub forwarder (`steamstub-forwarded:launch-check-unsatisfiable`; no `unforwarded:withheld`) | 16:35:37 (FWD SteamClient017/014) | 42s | operator: FAILED. Known DRM SteamStub launch-check limitation, not this task; route now consistent across launches |

## Known Stubs
None.
