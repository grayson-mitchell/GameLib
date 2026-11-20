---
phase: 73-steam-depot-download-pipeline-in-rust
plan: 13
subsystem: steam-depot
tags: [steam, depot, rust-pipeline-flag, progress-bridge, shared-redist]
requires: [73-12]
provides:
  - GAMELIB_DEPOT_PIPELINE=rust|ts env flag (default ts) read once per public depot function
  - buildDepotRefs, the CM-only half of buildDepotPlan (appinfo, ownership, selection, keys; no manifests)
  - buildDepotJob, createProgressBridge, downloadSteamDepotsRust, downloadSharedRedistDepotsRust
  - stubRustDepot caller-test fixture
affects: [73-14, 73-15, 73-16]
tech-stack:
  added: []
  patterns: [flag read at function entry, whole function delegates; CM half shared by both pipelines]
key-files:
  created:
    - src/backend/storeManagers/steam/depotRust/pipelineFlag.ts
    - src/backend/storeManagers/steam/depotRust/jobBuilder.ts
    - src/backend/storeManagers/steam/depotRust/progressBridge.ts
    - src/backend/storeManagers/steam/depotRust/install.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/fixtures/stubRustDepot.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/depotPipelineFlag.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustInstall.test.ts
  modified:
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/outcome.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/depot/planModel.ts
key-decisions:
  - "buildDepotPlan now calls buildDepotRefs then fetches manifests per ref; the key fetch moved out of the per-depot manifest retry into its own withPlanBuildRetry step (label fetchDepotKey:<id>). All 268 existing depot tests pass unchanged."
  - "allowFullOwnership mapping: TS finalizeToSteam always consults canWriteFullOwnership with the run outcome, an aborted signal forcing 'cancelled'. Rust applies the same gate to its own outcome (buildid present and not '0', no failures, verified, modes applied), so TS sends true unless the signal is already aborted."
  - "Depots are ordered by appinfo rank inside each owner group before the job is built, because Rust takes array position as the rank for cross-depot collisions."
  - "Zero-depot installs (nothing owned for this OS) still call TS finalizeToSteam with an empty depot list: there is no download stage to run in Rust and the written ACF is identical to the TS path."
  - "Redist: lease, index file, locks and ledger stay in sharedRedist.ts; only the per-depot download() step becomes a Rust job (select_files for the installscript, install for the full depot, finalize null, own cache install root). Installscript classification still reads the manifest through TS fetchDepotPlanEntry."
requirements-completed: [P73-B, P73-D, D-04, D-07, D-11, D-12, D-16]
duration: ~45min
completed: 2026-11-09
---

# Phase 73 Plan 13: Pipeline flag and Rust install entry points Summary

With `GAMELIB_DEPOT_PIPELINE=rust`, native, bridge and shared-redist installs run through the Rust job with unchanged TS signatures and an unchanged UI progress payload; the default stays `ts`.

## Tasks

1. **Flag, CM-only plan half, job builder, progress bridge** - commit 2e1cd5ead. `depotPipeline()` (unknown value logs once and falls back), `buildDepotRefs` extracted from `buildDepotPlan` (select.ts and appinfoOrder.ts untouched), `buildDepotJob` (string ids, 64-hex key, `fromManifest: null`, fresh UUID, host kind/https/token-auth from `ContentServerHostMeta` with the `wantsCdnAuthToken` widening), `createProgressBridge` (same payload, throttle and rate/ETA helpers as downloadFiles.ts; an unchanged-counter event past the throttle window re-sends so installStallWatchdog behaves as today; warning and hostSummary events are logged).
2. **Rust install and redist entry points** - commit e21f74f85. `downloadSteamDepotsRust` holds the authenticated lease for the whole job (Rust calls back for tokens), runs one install job with a FinalizeSpec (steamappsDir, installdir, name, buildid, lastOwner, allowFullOwnership), and maps with `rustOutcomeToDepotOutcome`. A plan-build throw lands in the catch with no job and no ACF. Abort forwards through `runDepotJob` (cancel fired once). After every job exactly one `[depot-rust] outcome appId=... jobId=... mode=... status=... acf=... vz=... vsza=... pk=... macho=... collisions=... bytes=... elapsedMs=...` line is logged (no keys, tokens or paths). `getManifestRequestCode` added to the steam-user client typings and used for `refreshRequestCode`.

## Verification

- `jest src/backend/storeManagers/steam src/backend/sidecar`: 7399 passed, 1 failed (`macArchKnownFixRouting` "Intel: never seeds...", known pre-existing)
- depotRust suites 24 passed; existing depot, prescreen, sharedRedist, finalize suites unchanged and green
- `tsc --noEmit` clean; eslint clean on install.ts and the new files; `pnpm build:sidecar` + `pnpm smoke:sidecar` PASS; prettier clean on touched paths

## Deviations from Plan

**1. [Rule 3 - Blocking] `downloadSharedRedistDepotsRust` is the per-depot download step, not a full replacement.** The plan sketches a whole-function matching signature, but the redist function's lease/index/ledger and installscript logic must stay in TS (D-12), so the Rust export is the `download(entry, files)` replacement and sharedRedist.ts branches on the flag once inside the lease.

**2. [Rule 3 - Blocking] `getManifestRequestCode` did not exist in TS typings.** The plan names it as if present; added to `SteamUserDepotExtras` (planModel.ts) from steam-user cdn.js.

**3. [Design note] EResult-40 handling.** `buildDepotRefs` skips on a key refusal; a 40 on the manifest fetch is still skipped by `buildDepotPlan` on the TS path. On the Rust path a manifest-level refusal surfaces from Rust as `manifest_unavailable` instead of a skip.

## Deferred Issues

- `tauriShellSource.test.ts` WR-07, `macArchKnownFixRouting` Intel case, clippy `needless_range_loop` at main.rs ~2076 (all pre-existing, see `deferred-items.md`).
- eslint `unbound-method` errors in `depotRust/rustDepot.ts` (plan 12 file, not touched here).

## Known Stubs

None.

## Threat Flags

None. T-73-50 (install root guarded by shell `guard_install_root`, installdir sanitised upstream), T-73-51 (job never logged; outcome line has no keys, tokens or paths), T-73-52 (flag read once at entry, test asserts zero rust calls on `ts`), T-73-53 (unknown value falls back with one log line) are in place.

## Self-Check: PASSED

All created files and commits 2e1cd5ead, e21f74f85 verified present.
