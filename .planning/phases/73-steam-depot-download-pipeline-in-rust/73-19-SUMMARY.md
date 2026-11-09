---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 19
subsystem: steam-depot
tags: [steam-depot, rust, flag-removal, tests, d-16]
requires: [73-18]
provides:
  - "No GAMELIB_DEPOT_PIPELINE flag and no TS pipeline branch: downloadSteamDepots, downloadSelectedDepotFiles, prescreenBridgeDepots, startup resume and downloadSharedRedistDepots all run on Rust"
  - "plan.ts is CM-only (buildDepotRefs, fetchAppInfo, fetchDepotKey, withPlanBuildRetry, getDepotClient, assertNumericAppId, throwIfAborted); no TS code fetches or parses a manifest"
  - "Rust depot_manifest_summary reports InstallScript-flagged filenames; shared redists use it plus select_files / install / verify_only jobs"
  - "Rust parse_manifest decrypts linktarget for encrypted manifests (latent port defect)"
  - "Caller tests on stubRustDepot; new depot.cmPlan.test.ts and depot.clobberGuard.test.ts"
affects: [73-20, 73-21]
tech-stack:
  added: []
  patterns:
    - "stubRustDepot summaryFor/outcomeFor: per-request summary and per-job outcome overrides for caller tests"
    - "Shared-redist cache check is a verify_only job with finalize null (missing list, no fetch, no ACF)"
key-files:
  created:
    - src/backend/storeManagers/steam/__tests__/depot.cmPlan.test.ts
    - src/backend/storeManagers/steam/__tests__/depot.clobberGuard.test.ts (renamed from depot.finalize.test.ts, D-08 only)
    - src/backend/storeManagers/steam/depotRust/__tests__/depotJobInputs.test.ts (renamed from depotPipelineFlag.test.ts)
  modified:
    - src/backend/storeManagers/steam/depot/outcome.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/depot/index.ts
    - src/backend/storeManagers/steam/depot/download.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/secondary.ts
    - src/backend/storeManagers/steam/depotRust/errorMap.ts
    - src/backend/storeManagers/steam/depotRust/types.ts
    - src-tauri/crates/gamelib-depot/src/job.rs
    - src-tauri/crates/gamelib-depot/src/manifest.rs
  deleted:
    - src/backend/storeManagers/steam/depotRust/pipelineFlag.ts
    - src/backend/storeManagers/steam/__tests__/depotGolden.test.ts
    - src/backend/storeManagers/steam/__tests__/depotGoldenOracle.ts
    - src/backend/storeManagers/steam/__tests__/depotLinktarget.test.ts
    - src/backend/storeManagers/steam/__tests__/fixtures/steamEncryptedString.ts
key-decisions:
  - "Shared redists could not keep their TS manifest read (D-01), so the Rust summary gained an installscripts field and the WR-05 cache check became a verify_only job with no finalize; stricter than before (sha1 on every file, not only installer binaries)"
  - "Rust parse_manifest now decrypts an encrypted manifest's linktarget (37-09 parity); found because depotLinktarget.test.ts had no Rust counterpart"
  - "The failed-install aggregate log line (formatDownloadFailureSummary) is now emitted on the Rust path, from the same selectPrimaryDepotFailure pick the classifier uses"
  - "DepotDownloadFailure moved to planModel.ts, so outcome.ts (selectPrimaryDepotFailure) and errorMap.ts no longer import download.ts; 73-20 needs no move for them"
  - "The TS golden oracle and depotLinktarget.test.ts were deleted here, not in 73-20: removing the TS manifest parser left them uncompilable"
requirements-completed: [P73-F, D-01, D-16]
duration: about 2 h 50 min
completed: 2026-11-09
---

# Phase 73 Plan 19: Remove the D-16 flag; every depot caller reaches Rust Summary

The `GAMELIB_DEPOT_PIPELINE` flag and every TS-pipeline branch are gone. All five depot callers (install, selected-files restore, bridge prescreen, startup resume, shared redists) call Rust directly with unchanged signatures, and no TS code fetches or parses a manifest any more. Caller tests run against the `requestRustInvoke` stub. Removing the TS parser exposed two things the plan had not covered: shared redists still read manifests in TS, and the Rust parse never decrypted symlink targets. Both are fixed here.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 Flag and TS branches | 81dff5122 | Callers delegate unconditionally; `pipelineFlag.ts` deleted; plan.ts CM-only; shared redist on the Rust summary plus jobs |
| (deviation) Rust linktarget | 98a23ed8d | `parse_manifest` decrypts `linktarget` for encrypted manifests; two new tests |
| (deviation) Failure log | 86cec8aea | `[downloadSteamDepots] ... download failed — N file failure(s), classified as KEY` restored on the Rust path |
| 2 Caller tests | 0b5007372 | Tests on stubRustDepot; flag test renamed; oracle, golden and linktarget TS tests deleted |

## Precondition (T-73-68)

The `## Delete gate (D-15)` section of 73-PARITY.md shows all three conditions as `- [x]` (corpus parity, live macOS UAT, CI green on run 42600886049). The gate was read before any code changed.

## Verification

- `pnpm exec tsc --noEmit -p .` exit 0. `pnpm codecheck` exit 0 (includes the meta scope).
- `pnpm exec jest src/backend src/common src/sidecar`: 499 suites passed, 12050 tests passed, 2 failed. Both failures are the known pre-existing ones: `tauriShellSource.test.ts` WR-07 and `macArchKnownFixRouting` "Intel: never seeds...". All `src/backend/storeManagers/steam` suites pass except `macArchKnownFixRouting`.
- `pnpm build:sidecar` exit 0. `pnpm smoke:sidecar`: PASS.
- `cargo test` (whole workspace) 453 passed, 0 failed. `cargo fmt -p gamelib-depot -- --check` clean. `cargo clippy --workspace --all-targets` then `node ../meta/clippyRatchet.cjs`: PASS, every lint at or under its ceiling.
- Each pre-push gate was run on its own: `pnpm codecheck` 0, `pnpm lint` 0 (0 errors), `pnpm prettier` 0, `pnpm i18n --fail-on-update` 0, `pnpm find-deadcode` 0 (356 baselined, no new findings), `pnpm boundaries` 0, `pnpm steam-line-ceiling` 0. `pnpm planning-gates` 12/12.
- Acceptance criteria:
  - `grep -rn 'GAMELIB_DEPOT_PIPELINE\|depotPipeline(' src meta | grep -v __tests__` returns nothing.
  - `grep -cE 'loadContentManifestParser|getRawManifest|buildDepotPlan\b' depot/plan.ts` == 0.
  - `pipelineFlag.ts` is absent.
  - `grep -lE "getRawManifest|loadContentManifestParser"` over `__tests__/depot*.test.ts` and `library.resume.test.ts` returns nothing.
- Prettier was checked on every changed path (all were formatted).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Shared redists still parsed manifests in TS**
- **Found during:** Task 1
- **Issue:** `downloadSharedRedistDepotsLeased` called `fetchDepotPlanEntry` plus `loadContentManifestParser` for two things. It needed the InstallScript-flagged file to know what to download first and classify, and it needed every file's size and sha1 for the WR-05 cache check. 73-13 had kept this on purpose. Deleting the parser (D-01) would have broken it.
- **Fix:**
  - Rust `DepotSummary` gains `installscripts` (filenames flagged 256, in manifest form). The summary therefore still never carries the file list.
  - The installscript download is a `select_files` job, and the full download is an `install` job.
  - The cache check is a `verify_only` job with `finalize: null`: its `missing` list replaces `sharedRedistCacheProblem`, and a job that cannot verify counts as damage.
  - `fetchDepotKey` is exported for the key half.
  - New crate tests `summarize_reports_installscript_flagged_files_in_manifest_form` and `verify_only_without_finalize_reports_missing_and_writes_no_acf`.
- **Behaviour change:** the cached-depot check now sha1-verifies every file, not only the installer binaries. For redist-sized depots this is cheap.
- **Files modified:** depot/sharedRedist.ts, depotRust/install.ts, depotRust/types.ts, gamelib-depot job.rs/manifest.rs and their tests.
- **Commit:** 81dff5122

**2. [Rule 1 - Bug] Rust never decrypted `linktarget`**
- **Found during:** Task 2, while mapping depotLinktarget.test.ts to a Rust test.
- **Issue:** `parse_manifest` decrypted filenames but passed `linktarget` through verbatim. In an encrypted manifest (the normal CDN case), a symlink would point at base64 ciphertext. The TS parser has decrypted it since 37-09. The goldens missed it because the only symlink fixture (`modes-macho`) is unencrypted.
- **Fix:** decrypt a non-empty `linktarget` with the depot key when filenames are encrypted. Added `encrypted_linktarget_decrypted_like_the_filename` and `plain_manifest_linktarget_is_kept_verbatim`.
- **Commit:** 98a23ed8d

**3. [Rule 2 - Missing logging] Failure summary line lost on the Rust path**
- **Issue:** only the TS orchestrator logged `formatDownloadFailureSummary`, the one log line that tells a classified failure from the generic fallback (debug/steam-depot-unclassified-generic-error F2).
- **Fix:** `install.ts` `logFailureSummary` emits the line on a failed job. It uses the same `selectPrimaryDepotFailure` pick that `errorMap` feeds the classifier, and errorMap exports `rustFailuresToDepotFailures` for it. The B6 census in depot.test.ts now pins both Rust consumers. The T-D4 test was ported to depot.cmPlan.test.ts.
- **Commit:** 86cec8aea

**4. [Rule 3 - Blocking] TS-only tests no longer compiled**
- `depotGolden.test.ts` and `depotGoldenOracle.ts` drove the TS parser. `depotLinktarget.test.ts` drove `buildDepotPlan`.
- They were deleted now, not in 73-20, along with the orphaned `fixtures/steamEncryptedString.ts`, the `gen:depot-goldens` script, and the oracle note in `tests/fixtures/README.md`. `expected.json` and the Rust golden are kept.
- **Commit:** 0b5007372

**5. [Scope] Files outside the plan's list**
- **Planned move (selectPrimaryDepotFailure):** `DepotDownloadFailure` moved from download.ts to planModel.ts, and download.ts re-exports it. outcome.ts (`selectPrimaryDepotFailure`, `formatDownloadFailureSummary`) and errorMap.ts no longer import download.ts. outcome.ts survives 73-20, so nothing more needs to move for them.
- **library.test.ts:** it pinned `ts` in 73-17. Its startup-resume cases now mock `resumeVerifyRust` and pin the TS policy: the sanitized target, no TS finalize after Rust wrote the ACF, the hostile installdir going to the honest-empty `app_<id>` finalize, and a verify failure going to the honest-empty finalize. The job itself is covered over the stub in rustSecondary.test.ts.
- **depot.finalize.test.ts → depot.clobberGuard.test.ts:** only the two D-08 clobber-guard cases are kept, run on the Rust entry with the stub. The renamed file still imports `buildAppManifestText` from `depot/manifest.ts`.
- **steamAuthSessionPolicy.test.ts:** `depot/outcome.ts` left the `acquireAuthenticated` allow-list, because it no longer takes a lease.
- **Dead exports knip found after the removal:**
  - `INSTALLSCRIPT_FLAG` (deleted from sharedRedists.ts; the crate has the constant)
  - `FinalizeDepotEntry` and `DepotPlanEntry` (un-exported)
  - `DownloadSelectedDepotFilesResult.failures` (no producer and no reader)
- **depot/index.ts:** the barrel drops `buildDepotPlan` and `screenDepotPlanForSteamApi`. It still re-exports the download, downloadFiles and finalize modules until 73-20 deletes them.

**6. [Plan instruction not literally followed] originalRestore.test.ts unchanged**
- It never touched the TS pipeline: it injects a `downloadSelected` fake that implements the `DownloadSelectedDepotFilesResult` contract. That contract is now tested over the stub in depot.selectedFiles.test.ts.
- Rewriting it onto the full CM stub would test the same restore policy through more mocks, so it was left as-is.

**7. [Acceptance literalism] getRawManifest guards moved**
- The acceptance grep forbids `getRawManifest` anywhere in `__tests__/depot*.test.ts`. The "never fetches a manifest in TS" guards (`expect(client.getRawManifest).not.toHaveBeenCalled()`) therefore live only in depotRust/__tests__ (rustInstall, rustSecondary, depotJobInputs).

**Accident, recovered:** the first linktarget commit swept in the index's already-staged `git rm`/`git mv` entries. It was soft-reset at once (HEAD was still my own commit) and recommitted with the two Rust files only (98a23ed8d). The `git restore --staged` used for this set off `.husky/post-checkout`, which ran `pnpm i` and `pnpm download-helper-binaries` against the lockfile (no lockfile change). All gates were green after it.

## Removed assertions and their Rust or stub counterparts (T-73-69)

| Removed TS assertion | Now covered by |
| -------------------- | -------------- |
| depot.test `manifest + total`: filenames decrypted, real totalBytes summed (D-03/D-14), N=1 shape | crate `manifest.rs` encrypted_names_decrypted_and_nul_truncated, parse_plain_manifest_roundtrips_fields; `job_install.rs` install_zip_deflate_matches_fixture (planned totals) |
| depot.test Fallout 2 master.dat cross-depot collision in the plan | `post.rs` collision tests (collision_symlink_vs_file_unresolved and siblings); `golden.rs` multi-depot-collision case; `job_install.rs` manifests_load_before_any_chunk_and_collisions_warn |
| depot.test content_manifest.js parse() smoke (Pitfall 5) | obsolete: no TS parser remains (crate `manifest.rs` parse tests) |
| depot.test getRawManifest EResult-40 skip of one depot | `job_install.rs` blocked_manifest_skips_that_depot_and_installs_the_rest; rustInstall "EResult-40 manifest refusals skip the depot" |
| depot.test buildDepotPlan lease/appId/abort/retry/owner-app/timeout/EResult-40 key cases | depot.cmPlan.test.ts (same cases on buildDepotRefs and the downloadSteamDepots entry) |
| depot.test orchestration: finalize after files, 1026 on SHA1 failure, cancel → 1026, D-08 Case B | `job_install.rs` install_zip_deflate_matches_fixture, failed_file_still_finalizes_1026, cancel_still_finalizes_1026; `acf.rs` failure_writes_1026, cancelled_writes_1026 |
| depot.test CdnAuthTokenCache threaded into every fetchChunk | rustDepot.test "registers the job, invokes depot_job_run with the job and unregisters after" (the job's tokenCache is what Rust's token requests reach); depotHostChannels.test.ts; `fetch.rs` fetch_token_403_forces_one_refresh, steamcache_host_never_requests_token |
| depot.test D-07 Retry overwrites a prior partial | `job_modes.rs` cancel_resume_fetches_only_missing |
| depot.test T-D4 failure-summary log | depot.cmPlan.test.ts "T-D4: logs the failure COUNT ..." (Rust path) |
| depot.finalize D-UAT-09 abort mid-flight / Test C → 1026 | `acf.rs` cancelled_writes_1026, policy_false_forces_1026; `job_install.rs` cancel_still_finalizes_1026; rustInstall "an abort mid-job fires cancel once and returns cancelled" |
| depot.finalize Test D complete run → 4 | `acf.rs` complete_run_earns_4; `job_modes.rs` verify_only_fetches_nothing |
| depot.finalize Test E unapplied exec flag → 1026 | `acf.rs` modes_not_applied_writes_1026 |
| depot.finalize LastOwner persisted / '0' default | rustInstall finalize-policy test (lastOwner from getPersistedSteamId64); `acf.rs` missing_last_owner_defaults_zero, non_numeric_last_owner_defaults_zero |
| depot.finalize 23.2-03 skipped depot still earns 4, absent from InstalledDepots; + sha1 failure → 1026 | `job_install.rs` blocked_manifest_skips_that_depot_and_installs_the_rest; `acf.rs` failure_writes_1026 |
| depot.finalize 260908-nbd structural re-verification (tests 1-4) | `reconcile.rs` empty_directory_is_not_a_file, short_file_reports_found_size, complete_tree_ok, non_regular_entries_ok |
| depotLinktarget T-37-09-02/-05 (decrypted, absent passes through) | `manifest.rs` encrypted_linktarget_decrypted_like_the_filename, plain_manifest_linktarget_is_kept_verbatim (new, 98a23ed8d) |
| depotLinktarget T-37-09-03/-04 (symlink resolves; escape rejected) | `post.rs` symlink_inside_accepted, symlink_escape_rejected; `reconcile.rs` symlink_entries; `golden.rs` modes-macho `link-to-ro` |
| depot.prescreen screenDepotPlanForSteamApi basename/case/backslash/.bak vectors | `job_modes.rs` summarize_matches_steam_api_and_omits_files; TS classification of the matches in depot.prescreen.test.ts |
| depot.selectedFiles dir/symlink never selected, plan sized to selection | `job_modes.rs` select_files_writes_only_selected |
| depot.sharedRedist size/sha1 cache-problem helper | depot.sharedRedist.test.ts WR-05 cases on the verify_only stub; `job_modes.rs` verify_only_reports_missing_and_writes_1026, verify_only_without_finalize_reports_missing_and_writes_no_acf |
| library.test buildDepotPlan + reconcilePartialState + healReconciledFileModes resume (CR-01) | rustSecondary "startup resume on the rust pipeline"; `job_modes.rs` verify_only_fetches_nothing / verify_only_reports_missing_and_writes_1026; `acf.rs` modes_not_applied_writes_1026 |
| depotGolden "TS pipeline equals expected.json" | `golden.rs` rust_matches_ts_oracle_on_every_case (expected.json kept) |

## For plan 73-20

Some surviving modules still import modules on 73-20's delete list. Move these first:
- `depotRust/install.ts`: `finalizeToSteam` from `depot/finalize.ts`, for the zero-depot honest-empty finalize.
- `library/resume.ts`: `finalizeToSteam` (via the barrel) for the honest-empty fallback.
- `depot/sharedRedist.ts`: `resolveContainedPath` from `depot/download.ts` (the installscript path).
- `depot/contentServers.ts` and `depotRust/jobBuilder.ts`: the `ContentServerHostMeta` type from `depot/decompress.ts`.
- `bridge/originalRestore.ts`: `resolveContainedPath`/`sha1File` (already named in 73-20's plan).
- `__tests__/depot.clobberGuard.test.ts` (renamed from depot.finalize): `buildAppManifestText` from `depot/manifest.ts`. Seed a literal ACF instead. Do not `git rm` the file: its D-08 cases guard the Rust entry.

These items from 73-20's delete list are already gone: `depotLinktarget.test.ts`, `depotGolden.test.ts`, `depotGoldenOracle.ts`, `depot.finalize.test.ts` (renamed as above), the `gen:depot-goldens` script, and the `tests/fixtures/README.md` oracle note.

**selectPrimaryDepotFailure needs no move.** It and `DepotDownloadFailure` now depend only on `planModel.ts`.

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust boundary. The summary's new `installscripts` field carries only flagged filenames (normally one per depot), never keys or the file list (T-73-36 holds).

T-73-68 was mitigated by reading the delete gate first. T-73-69 is mitigated by the table above.

## Self-Check: PASSED

- FOUND: depot.cmPlan.test.ts, depot.clobberGuard.test.ts, depotJobInputs.test.ts, this SUMMARY. `pipelineFlag.ts` is absent.
- FOUND commits: 81dff5122, 98a23ed8d, 86cec8aea, 0b5007372
