---
phase: 75-steam-local-file-formats-in-rust
plan: 33
subsystem: steam-local-files
tags: [delete-gate, p75-d, p75-g, acf-writer, finalize]
requires: [75-30, 75-31]
provides: [no TS ACF writer, Rust-only finalize call sites and readAppManifestFlags]
key-files:
  deleted:
    - src/backend/storeManagers/steam/depot/finalizeAcf.ts
    - src/backend/storeManagers/steam/depot/appManifest.ts
    - src/backend/storeManagers/steam/__tests__/appManifest.test.ts
    - src/backend/storeManagers/steam/__tests__/finalizeAcf.cancelPreserve.test.ts
  modified:
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/library/manifestFlags.ts
    - src/backend/storeManagers/steam/depot/index.ts
    - package.json
requirements-completed: [STEAM-03, P75-D, P75-G]
completed: 2026-11-14
---

# Phase 75 Plan 33: Retire the TS ACF writer Summary

No TS code writes an ACF any more. The zero-depot install and the failed-verify resume fallback call only `rustFinalize`; `buildResumeFinalizeOpts` returns a local `ResumeFinalizeTarget` (sanitised dir, installdir, name) that resume maps onto the Rust spec. `readAppManifestFlags` has only its Rust path; `readAppManifestFlagsTs` and the `@node-steam/vdf` import are gone. `depot/finalizeAcf.ts` (finalizeToSteam, canWriteFullOwnership) and `depot/appManifest.ts` (writeAppManifest, buildAppManifestText) are deleted with their re-exports.

## Commit

- 8f8606fbb: both tasks in one commit. Deleting the writer breaks the test imports, so tsc and the pre-push gates only pass with source and tests together.

## Deviations from Plan

**1. [Rule 3 - Blocking] `@node-steam/vdf` dependency removed.** manifestFlags.ts was its last importer, so find-deadcode flagged it as a new finding. `pnpm remove` updated package.json and pnpm-lock.yaml.

**2. [Rule 3 - Blocking] stubRustDepot.ts answers `depot_finalize`.** The shared stub threw "unexpected channel" for the Rust finalize, which the resume catch swallowed. It now returns a 1026 ACF result and records the call.

**3. Resume fallback tests re-asserted.** The two rustSecondary cases ("every depot blocked", "job cannot run") read the TS-written 1026 ACF from disk. They now assert exactly one `depot_finalize` with `depots: []`, `allowFullOwnership: false` and the sanitised installdir.

**4. queueHeadRevalidation.test.ts and library.manifestFlags.test.ts.** These had ts-path cases that wrote real ACF files; they are converted to or replaced by the Rust-stub cases. The queue-head tests now all run through `steamfiles_read_acf` stubs. The env pins there are dropped, since the default is already rust.

**5. finalizeToSteam jest.mock keys removed** from 14 library/games test files (and the six `expect(finalizeToSteam).not.toHaveBeenCalled()` in library.test.ts, which can no longer be violated: the symbol does not exist). No `jest.mock(` added or removed; the stale `finalizeAcf.cancelPreserve.test.ts` baseline entry was removed from meta/backendDiCeilings/storeManagers.steam.json.

## Test cases deleted and their Rust twins (T-75-81)

- finalizeAcf.cancelPreserve.test.ts (4 cases: cancelled preserves installed manifest, cancelled without manifest, normal finalize) -> gamelib-depot `tests/finalize_op.rs`: `cancelled_over_installed_manifest_preserves_it_byte_identical` (the 73-18 Zomboid regression), `cancelled_without_manifest_writes_1026_with_measured_size`, `null_outcome_no_depots_writes_1026_measured`; plus `preserve_installed_manifest_cases`.
- depot.test.ts `canWriteFullOwnership` describe (7 cases) -> Rust `can_write_full_ownership` tests `policy_false_forces_1026`, `cancelled_writes_1026`, `modes_not_applied_writes_1026`, `failure_writes_1026`, `absent_or_zero_buildid_writes_1026`; fail-closed also by `allow_full_ownership_still_fails_closed`.
- depot.test.ts D-04 field census (+ RED twin) read `finalizeAcf.ts` source for the five-field parameter set. The Rust signature is typed, so there is no source census left to run; no twin.
- depot.test.ts `finalizeToSteam` describe (1026 handoff, InstalledDepots, trustworthy-4 cases) -> `finalize_op.rs` and gamelib-depot `acf.rs`/`golden.rs`; beta key cases -> `beta_key_*` and `finalize_writes_beta_key_to_disk`.
- appManifest.test.ts (vdfEscape, hostile appId/installdir, StateFlags, betaKey) -> `acf.rs`/`golden.rs`, `beta_key_none_public_empty_invalid_keep_public_shape`, `installdir_escape_is_an_error_result`.
- library.manifestFlags.test.ts: "reads a well-formed manifest", "returns null for missing, unparseable and NaN" -> the existing Rust-path cases in the same file.

## Gates

- tsc clean. lint:src 0 errors, lint:tests 0 errors (no new warnings; unused imports removed). Prettier clean on touched files.
- find-deadcode: only the pre-existing humble/* and WebView/storeExitRefresh.ts findings. steam-line-ceiling exit 0. backend-di-ceilings 20 FAIL lines (all other sessions' "new violation" entries; mine removed).
- Jest steam + sidecar + backend/__tests__ + meta: remaining failures are the known pre-existing or other-session ones (tauriShellSource, moduleStateCensus, diPhaseGates, shimCoverage/shimGenerate, x86CallbackWineHarness, gamelibCatalogParity, lintTranslations). No Rust touched, so no cargo run.
- The `GAMELIB_STEAMFILES_TEXT=rust` pin in rustInstall.test.ts's zero-depot finalize describe is no longer load-bearing (the default is rust and the branch is gone); left for plan 34.

## Self-Check: PASSED
