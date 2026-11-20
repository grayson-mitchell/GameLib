---
phase: 75-steam-local-file-formats-in-rust
plan: 21
subsystem: steam-local-files
tags: [typescript, rustInvoke, acf-update, beta-key, replay-parity]
requires: [75-16]
provides:
  - async readAcfInstalledDepots, readAcfUpdateFieldsFromDir, readAcfBetaKey, readLocalConfigBetaKey, resolveUserBetaKey taking rust deps first, on steamfiles_read_acf / steamfiles_read_localconfig_beta_key behind GAMELIB_STEAMFILES_TEXT=rust
  - acfUpdateReplay.test.ts (68 cases) with overrides/acfUpdate.json (2 noted divergences)
key-files:
  modified:
    - src/backend/storeManagers/steam/acfInstalledDepots.ts
    - src/backend/storeManagers/steam/library/acfUpdateState.ts
    - src/backend/storeManagers/steam/depot/betaBranch.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/updateDetection.ts
    - src/backend/storeManagers/steam/depotRust/updateEstimate.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/invocations.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/rust-results.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/overrides/acfUpdate.json
  created:
    - src/backend/storeManagers/steam/localFiles/__tests__/acfUpdateReplay.test.ts
decisions:
  - Flag-ts bodies stay as private *Ts functions; the rust branches map any rejection to the same "nothing found" result (null/undefined)
  - rust deps come from existing deps (readAcfUpdateState's deps gain RustInvokeDeps; updateEstimate passes its game deps; plan.ts and install.ts use opts.installRuntime.depotJobs.transport)
metrics:
  tasks: 2
  completed: 2026-11-14
---

# Phase 75 Plan 21: Update/beta ACF readers on Rust Summary

The string-preserving ACF reader, the update-state field reader and the ACF/localconfig beta-key readers now read through the steamfiles ops under the rust flag, with every caller awaited and `isValidBetaKey` still guarding every key.

## Commits
- cab14e5a3 feat(75-21): ACF update/beta-key readers on Rust behind text flag, callers awaited
- 3a2deb1c5 test(75-21): rust-branch cases for update and beta-key readers; acfUpdate replay parity with overrides

## Callers touched
`depot/plan.ts` (buildDepotRefs awaits resolveUserBetaKey with `installRuntime.depotJobs.transport`), `depotRust/install.ts` (retirement reads installed depots via the same transport), `depotRust/updateEstimate.ts`, `updateDetection.ts` (classify), `library/acfUpdateState.ts` (readAcfUpdateState now requires `RustInvokeDeps` in its deps type; its callers already pass the full manager deps and compiled unchanged).

## Replay parity
68 acfUpdate cases replayed. Overrides, both with divergenceNote:
- `readAcfUpdateFieldsFromDir/duplicate-keys`: the oracle's parseAcfTree let a reopened AppState block replace the first (StateFlags lost, 0); Rust merges blocks as Steam does (4).
- `readAcfBetaKey/truncated`: the oracle hangs; Rust fails soft and the wrapper returns undefined.
The plan's expected candidates (tolerant partial parse of truncated/unbalanced ACF, lowercase keys) produced no divergence for these readers. Two invocations (localconfig appId 99, none and userappconfig) were added to invocations.json and results re-recorded.

## Deviations from Plan
None beyond the above; the oracle file was updated to pass a throwing rust stub as the plan directed.

## Verification
tsc clean outside src/backend/humble; steam Jest suite passes except the known shimCoverage/shimGenerate failures; golden test and cargo golden pass; backend-di-ceilings unchanged at 20 baseline FAIL lines; jest.mock counts unchanged in all touched test files; prettier clean. No IPC change.

## Known Stubs
None.

## Self-Check: PASSED
