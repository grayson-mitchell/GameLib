---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 14
subsystem: steam-depot
tags: [rust, depot, prescreen, resume, select_files, verify_only]
requires: [73-13]
provides:
  - prescreenBridgeDepotsRust, downloadSelectedDepotFilesRust, resumeVerifyRust (depotRust/secondary.ts)
affects: [depot/plan.ts, depot/outcome.ts, library/resume.ts, bridge/originalRestore.ts]
key-files:
  created:
    - src/backend/storeManagers/steam/depotRust/secondary.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustSecondary.test.ts
  modified:
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/outcome.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/bridge/originalRestore.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/fixtures/stubRustDepot.ts
key-decisions:
  - "DownloadSelectedDepotFilesOpts.selectPaths: string[] replaces the select predicate on both paths; the TS path rebuilds its predicate via normalizeDepotPath"
  - "Resume: a Rust verify_only job writes the ACF itself, so buildResumeFinalizeOpts returns null and TS finalizeToSteam is skipped; any job failure falls back to the honest-empty 1026 finalize"
metrics:
  tasks: 2
  completed: 2026-11-09
---

# Phase 73 Plan 14: Secondary depot consumers on Rust Summary

The bridge steam_api prescreen, the original-DLL restore and startup resume now each have a Rust path behind `GAMELIB_DEPOT_PIPELINE`, so every public depot entry point honours the one flag (D-16).

## What changed

- **Prescreen** (`prescreenBridgeDepotsRust`): leases CM, `buildDepotRefs` (os forced to windows), one `depot_manifest_summary` with patterns `steam_api.dll` / `steam_api64.dll`, classified by basename of `matches`. No manifest is fetched in TS. The `summary-<appId>` host job id is registered with the token cache for the call (73-12 requirement). Never throws; any failure gives `unknown`.
- **Selected files** (`downloadSelectedDepotFilesRust`): `select_files` job, no finalize, so no ACF. `Outcome.files` maps to the existing result type; failures route through `rustOutcomeToDepotOutcome` for the same classified message. A `select` predicate on the rust path throws.
- **originalRestore.ts** passes `selectPaths: [...wanted.keys()]`; no predicate remains.
- **Resume** (`resumeVerifyRust`): one `verify_only` job with a FinalizeSpec (sanitized installdir, target steamapps, buildid, persisted owner, allowFullOwnership). `resume.ts` has exactly one `depotPipeline()` branch inside `buildResumeFinalizeOpts`, after sanitization; restart holds, breadcrumbs, library updates and polling are untouched. No frontend/IPC change (D-13).
- `install.ts` now exports `logOutcome` and `requestCodeRefresher`; every secondary job logs the single `[depot-rust] outcome` line.

## Verification

- `pnpm exec jest src/backend/storeManagers/steam`: 4432 pass, 1 fail (pre-existing macArchKnownFixRouting Intel). tsc clean, prettier clean, eslint 0 errors (one pre-existing warning in depot.selectedFiles.test.ts), `build:sidecar` + `smoke:sidecar` PASS.
- Default (ts) is exercised by all existing suites; the rust flag is set per case in `rustSecondary.test.ts` (prescreen x4 classifications, summary error, ts-flag no-summary, select_files job/error/cancel/predicate rejection, resume verify_only job + fallback).

## Deviations from Plan

- Existing tests `depot.selectedFiles.test.ts` and `originalRestore.test.ts` were edited to the `selectPaths` shape (required by the interface change).
- `stubRustDepot.ts` gained an optional `summary` answer.
- Task 1 and 2 test code share `rustSecondary.test.ts`; it landed in the Task 2 commit.

## Parity concerns (73-13 EResult-40 note)

- Prescreen: a manifest-level EResult-40 refusal skips that depot on the TS path; on Rust the summary returns an error, so the prescreen resolves `unknown` (install proceeds, same as any screen failure). Not preserved at the TS boundary; harmless for the prescreen but a corpus-parity (plan 16) item.
- Resume: Rust `verify_only` surfaces the same refusal as a job failure; the caller falls back to the honest-empty 1026 finalize.
- originalRestore: on EResult-40 the Rust job fails (`manifest_unavailable`) where TS skipped the depot, giving `download-failed` instead of `not-in-depot`.

## Known Stubs

None.

## Self-Check: PASSED

secondary.ts, rustSecondary.test.ts, commits 2ec2785e0 and 8b04b07b0 present.
