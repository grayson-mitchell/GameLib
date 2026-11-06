---
phase: 63-rust-migration-pattern-and-executable-scanners
plan: 07
subsystem: steam-bridge-drm
tags: [rust-migration, scanners, steamstub, ceg, containment]
requires: [63-06]
provides:
  - async detectDrmWrapper / detectExeSteamDrm over rustScan runScanner
  - drmScanExe TS orchestrator over scan_contained_real (Option A)
affects: [63-08, 63-09, 63-11]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/drm/drmScanExe.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmScanExe.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
decisions:
  - "Option A: detectLaunchDrmWrapper stays a TS orchestrator; findUnrealLayout stays TS"
  - "Transport rejection maps to fail-closed values (null / undefined / not CEG), never 'none' or contained"
metrics:
  tasks: 2
  completed: 2026-11-07
requirements: [D-06, D-08, D-09, D-10, D-11, D-13]
---

# Phase 63 Plan 07: SteamStub/CEG and containment callers on the Rust boundary

drmScanExe.ts and shimGenerate.ts no longer read PE bytes or call realpath: containment goes through `scan_contained_real`, SteamStub through `scan_steamstub_section`, CEG through `peScan.detectSteamDrmInPe`.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 drmScanExe orchestrator | f3d81838c | `containLeaf` (runScanner `drmScanExe`) + `containedUnder` mapping reasons to the verbatim log texts; `deps.contain` injectable; launch `root-unresolvable` still early-returns; rejection logs `(containment check failed: ...)` and fails closed |
| 2 shimGenerate async detection | 247b71137 | `export async function detectDrmWrapper(exePath, caller)`; async `detectExeSteamDrm` using `readError`; `fallbackWrapper` hoisted out of the object literal; unused fs/peSections imports removed |

## Tests

- drmScanExe.test.ts rewritten against `deps.contain/detect/findUnreal` fakes (12 scenarios kept or reframed, plus non-.exe/sort, rejected-contain, and a rust-pinned default-leaf block asserting `scan_contained_real` with `{ path, rootDir: dirname(exe) }`, escapes mapping and rejection). Real-fs symlink scenarios were already ported to legacyTsScanners.test.ts in 63-02 (`containedRealTs`: escape, symlinked root, missing file/root), so no port was needed.
- shimGenerate.test.ts: whole `shimGenerate` describe pins the three scanner envs to `rust` and mocks `requestRustInvoke`, default-delegating to `runLegacyOp` (the TS oracle stands in for the Rust leaf on fixture files); new canned tests for steamstub/none, readError, rejection, and an all-scans-reject `placeShimForGame` case.
- games.test.ts: drmScanExe mock factory awaits `detectDrmWrapper`; `mockReturnValue` became `mockResolvedValue`. `detectSteamDrmInPe` mock untouched (63-08).
- Acceptance: no `readSync`/`parsePeSectionNames`/`PE_SECTION_SCAN_BYTES` code uses remain in shimGenerate.ts (only the doc-comment mention of PE_SECTION_SCAN_BYTES); drmScanExe.ts has no `fs/promises` import.

## Deviations from Plan

None in behavior. Note: task 1's commit was made before shimGenerate (task 2) so `tsc` was transiently inconsistent between the two commits; both commits together are green.

## Verification

- `jest src/backend/storeManagers/steam src/backend/scanners`: 4942 pass, 3 fail, all unrelated and pre-existing: two read the missing `.planning/phases/56-.../56-01-SUMMARY.md` (games.test channel constants, bottle.test DRM_LAUNCH_FORM) and a macArch 32 Intel routing test (`steam://install` not called; host-arch dependent, not touched by this plan).
- `tsc --noEmit` clean; `pnpm find-deadcode` PASS; prettier clean on all five files.
- `pnpm lint` fails with 2 errors, both in 63-10 files (`meta/gamelibScanCli.ts:144`, `meta/scannerParitySweep.ts:279`, prefer-promise-reject-errors), none in files from this plan; not fixed (out of scope).
- Not run: `pnpm smoke:sidecar` (needs sidecar build), `pnpm planning-gates`.

## Known Stubs

None.

## Self-Check: PASSED

Commits f3d81838c and 247b71137 exist; the five modified files are committed.
